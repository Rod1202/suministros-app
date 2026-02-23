'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import {
    Search, Plus, RefreshCw, ArrowRight, Truck, X,
    AlertTriangle, Info, MapPin, Package,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

type TipoMovimiento = 'taller_a_cliente' | 'cliente_a_taller' | 'cliente_a_cliente';
type MotivoMovimiento = 'normal' | 'devolucion' | 'cambio_por_falla';

interface Movimiento {
    id_movimiento: number;
    serie_impresora: string;
    tipo_movimiento: TipoMovimiento;
    motivo: string | null;
    id_cliente_origen: number | null;
    id_cliente_destino: number | null;
    fecha_movimiento: string;
    responsable: string | null;
    observacion: string | null;
    timestamp_registro: string;
    origen_nombre?: string | null;
    destino_nombre?: string | null;
}

interface ClienteOption { id_cliente: number; nombre_especifico: string; }

/** Ubicación actual de una serie (null = taller) */
interface UbicacionImpresora {
    id_cliente: number | null;   // null = taller
    cliente_nombre: string | null;
    en_taller: boolean;
}

// UX del equipo mostrado en el formulario
interface ImpresoraPreview {
    serie: string;
    ubicacion: UbicacionImpresora;
    last_suministro: string | null;
    toner_pct: number | null;
    loading: boolean;
    error: string | null;
}

const UBI_PREVIEW_INIT: ImpresoraPreview = {
    serie: '',
    ubicacion: { id_cliente: null, cliente_nombre: null, en_taller: true },
    last_suministro: null,
    toner_pct: null,
    loading: false,
    error: null,
};

// ─────────────────────────────────────────────
// Constantes visuales
// ─────────────────────────────────────────────

const TIPO_LABELS: Record<TipoMovimiento, string> = {
    taller_a_cliente: 'Taller → Cliente',
    cliente_a_taller: 'Cliente → Taller',
    cliente_a_cliente: 'Cliente → Cliente',
};

const TIPO_COLORS: Record<TipoMovimiento, string> = {
    taller_a_cliente: 'bg-green-100 text-green-800',
    cliente_a_taller: 'bg-orange-100 text-orange-800',
    cliente_a_cliente: 'bg-blue-100 text-blue-800',
};

const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// ─────────────────────────────────────────────
// Helpers de lógica de movimiento
// ─────────────────────────────────────────────

/** Determina tipo_movimiento dado origen y destino. null = taller. */
function calcTipo(origenId: number | null, destinoId: number | null): TipoMovimiento {
    if (origenId === null && destinoId !== null) return 'taller_a_cliente';
    if (origenId !== null && destinoId === null) return 'cliente_a_taller';
    return 'cliente_a_cliente';
}

// ─────────────────────────────────────────────
// Hook: obtener ubicación actual de una serie
// (basado en el último movimiento_impresora)
// ─────────────────────────────────────────────

/**
 * Fuente de verdad para la ubicación de una impresora:
 * 1. Si tiene registro en `taller` con fecha_egreso IS NULL → está en el taller.
 * 2. Si no → consulta impresora.id_cliente para saber a qué cliente pertenece.
 */
async function getUbicacion(
    serie: string,
    cliMap: Record<number, string>
): Promise<UbicacionImpresora & { error: string | null }> {
    // 1. ¿Está en el taller?
    const { data: tallerRow, error: tallerErr } = await supabase
        .from('taller')
        .select('id_taller')
        .eq('serie_impresora', serie.toUpperCase())
        .is('fecha_egreso', null)
        .limit(1)
        .maybeSingle();

    if (tallerErr) return { id_cliente: null, cliente_nombre: null, en_taller: true, error: tallerErr.message };

    if (tallerRow) {
        // Tiene un registro abierto en taller
        return { id_cliente: null, cliente_nombre: null, en_taller: true, error: null };
    }

    // 2. ¿Está en un cliente?
    const { data: imp, error: impErr } = await supabase
        .from('impresora')
        .select('id_cliente')
        .eq('serie', serie.toUpperCase())
        .maybeSingle();

    if (impErr) return { id_cliente: null, cliente_nombre: null, en_taller: false, error: impErr.message };

    const id_cliente = imp?.id_cliente ?? null;
    const cliente_nombre = id_cliente ? (cliMap[id_cliente] ?? 'Desconocido') : null;

    // Si id_cliente es null y no está en taller: equipo sin historial (asumimos taller)
    return {
        id_cliente,
        cliente_nombre,
        en_taller: id_cliente === null,
        error: null,
    };
}

/** Obtiene suministro reciente y % toner estim. */
async function getImpresoraInfo(serie: string): Promise<{ last_suministro: string | null; toner_pct: number | null }> {
    const [{ data: reqs }, { data: vols }] = await Promise.all([
        supabase.from('requerimiento_historico')
            .select('fecha_atencion, cod_sku, sku_default, cantidad_solicitada')
            .eq('serie_impresora', serie).eq('estado', 'atendido')
            .order('fecha_atencion', { ascending: false }).limit(5),
        supabase.from('volumetria_impresora')
            .select('total_pages').eq('serie_impresora', serie)
            .order('fecha_fin', { ascending: false }).limit(1),
    ]);

    const last_suministro = reqs && reqs.length > 0 ? reqs[0].fecha_atencion : null;
    const tonerReq = (reqs || []).find(r => (r.sku_default || r.cod_sku || '').toLowerCase().includes('toner'));
    let toner_pct: number | null = null;
    if (vols && vols.length > 0 && tonerReq) {
        const cap = (tonerReq.cantidad_solicitada ?? 1) * 3000;
        toner_pct = Math.max(0, Math.round(100 - (vols[0].total_pages / cap) * 100));
    }
    return { last_suministro, toner_pct };
}

// ─────────────────────────────────────────────
// Subcomponente: tarjeta de equipo
// ─────────────────────────────────────────────

function ImpresoraCard({ preview, label }: { preview: ImpresoraPreview; label: string }) {
    if (!preview.serie) return null;
    const { ubicacion, last_suministro, toner_pct, loading, error } = preview;

    return (
        <div className={`rounded-xl border p-3 space-y-2 text-xs ${error ? 'border-red-200 bg-red-50' : 'border-blue-100 bg-blue-50'}`}>
            <div className="flex items-center gap-2">
                <span className="font-bold font-mono text-blue-800">{preview.serie}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{label}</span>
                {loading && <span className="text-gray-400 animate-pulse ml-auto">cargando...</span>}
            </div>
            {error && <p className="text-red-600">{error}</p>}
            {!loading && !error && (
                <>
                    <div className="flex items-center gap-1.5 text-blue-700">
                        <MapPin className="w-3 h-3" />
                        <span>Ubicación actual: <strong>{ubicacion.en_taller ? 'Taller' : ubicacion.cliente_nombre}</strong></span>
                    </div>
                    {toner_pct !== null && (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${toner_pct > 30 ? 'bg-green-100 text-green-700' :
                            toner_pct > 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                            Toner estimado: ~{toner_pct}%
                        </div>
                    )}
                    {last_suministro && (
                        <div className="flex items-center gap-1 text-blue-600">
                            <Package className="w-3 h-3" />
                            Último suministro: <strong>{fmtDate(last_suministro)}</strong>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// Subcomponente: buscador de serie con autocomplete
// ─────────────────────────────────────────────

function SerieBuscador({
    label,
    value,
    serieInput,
    onSerieInput,
    onSelect,
    impresorasCliente,
    required,
}: {
    label: string;
    value: string;
    serieInput: string;
    onSerieInput: (v: string) => void;
    onSelect: (serie: string) => void;
    impresorasCliente: { serie: string }[];
    required?: boolean;
}) {
    const filtradas = useMemo(() =>
        serieInput
            ? impresorasCliente.filter(i => i.serie.toLowerCase().includes(serieInput.toLowerCase()))
            : impresorasCliente,
        [impresorasCliente, serieInput]
    );

    return (
        <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
                {label} {value && <span className="text-blue-600 font-bold">→ {value}</span>}
            </label>
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                    type="text"
                    value={serieInput}
                    onChange={e => onSerieInput(e.target.value.toUpperCase())}
                    placeholder="Escribe dígitos de la serie..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required={required && !value}
                    autoComplete="off"
                />
            </div>
            {serieInput && filtradas.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto shadow-sm z-10 relative bg-white">
                    {filtradas.slice(0, 10).map(i => (
                        <button key={i.serie} type="button"
                            onClick={() => { onSelect(i.serie); onSerieInput(i.serie); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition font-mono ${value === i.serie ? 'bg-blue-100 text-blue-700' : 'text-gray-700'}`}
                        >{i.serie}</button>
                    ))}
                </div>
            )}
            {serieInput && filtradas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Sin coincidencias en este cliente.</p>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// Página Principal
// ─────────────────────────────────────────────

export default function MovimientosPage() {
    const router = useRouter();
    const { profile, loading: authLoading, hasAccess } = useUserRole();
    const canAccess = hasAccess(['master', 'adm']);

    // ── Datos globales ──
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [clientes, setClientes] = useState<ClienteOption[]>([]);
    const [cliMap, setCliMap] = useState<Record<number, string>>({});
    const [dataLoading, setDataLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);

    // ── Filtros tabla ──
    const [filterSerie, setFilterSerie] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterCliente, setFilterCliente] = useState('');

    // ─────────────────────────────────
    // Estado del formulario
    // ─────────────────────────────────

    const [motivo, setMotivo] = useState<MotivoMovimiento | ''>('');
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [responsable, setResponsable] = useState('');
    const [observacion, setObservacion] = useState('');

    // NORMAL: cliente del equipo → lista de series → serie seleccionada → destino
    const [normalClienteRef, setNormalClienteRef] = useState<number | null>(null);
    const [normalImpresorasCliente, setNormalImpresorasCliente] = useState<{ serie: string }[]>([]);
    const [normalSerieInput, setNormalSerieInput] = useState('');
    const [normalSerie, setNormalSerie] = useState('');
    const [normalPreview, setNormalPreview] = useState<ImpresoraPreview>({ ...UBI_PREVIEW_INIT });
    const [normalDestino, setNormalDestino] = useState<number | 'taller' | null>(null);

    // CAMBIO_POR_FALLA — equipo defectuoso
    const [fallaClienteRef, setFallaClienteRef] = useState<number | null>(null);
    const [fallaImpresorasCliente, setFallaImpresorasCliente] = useState<{ serie: string }[]>([]);
    const [fallaSerieInput, setFallaSerieInput] = useState('');
    const [fallaSerie, setFallaSerie] = useState('');
    const [fallaPreview, setFallaPreview] = useState<ImpresoraPreview>({ ...UBI_PREVIEW_INIT });

    // CAMBIO_POR_FALLA — equipo reemplazo (solo taller)
    const [replSerieInput, setReplSerieInput] = useState('');
    const [replSerie, setReplSerie] = useState('');
    const [replPreview, setReplPreview] = useState<ImpresoraPreview>({ ...UBI_PREVIEW_INIT });
    // Impresoras en taller (para filtrar reemplazo) — cargadas bajo demanda
    const [tallerImpresoras, setTallerImpresoras] = useState<{ serie: string }[]>([]);

    // ── Auth ──
    useEffect(() => {
        if (!authLoading && !profile) router.replace('/login');
        if (!authLoading && profile && !canAccess) router.replace('/dashboard');
    }, [authLoading, profile, canAccess, router]);

    // ── Carga principal ──
    const loadData = useCallback(async () => {
        if (!canAccess) return;
        setDataLoading(true);
        setError(null);

        const [{ data: movData, error: movErr }, { data: cliData, error: cliErr }] = await Promise.all([
            supabase.from('movimiento_impresora')
                .select('id_movimiento, serie_impresora, tipo_movimiento, motivo, id_cliente_origen, id_cliente_destino, fecha_movimiento, responsable, observacion, timestamp_registro')
                .order('timestamp_registro', { ascending: false })
                .limit(300),
            supabase.from('clientes').select('id_cliente, nombre_especifico').order('nombre_especifico'),
        ]);

        if (movErr || cliErr) { setError((movErr || cliErr)?.message ?? 'Error al cargar datos.'); setDataLoading(false); return; }

        const map: Record<number, string> = {};
        (cliData || []).forEach(c => { map[c.id_cliente] = c.nombre_especifico; });
        setCliMap(map);
        setClientes(cliData || []);

        const mapped = (movData || []).map((m: any) => ({
            ...m,
            origen_nombre: m.id_cliente_origen ? (map[m.id_cliente_origen] ?? '?') : 'Taller',
            destino_nombre: m.id_cliente_destino ? (map[m.id_cliente_destino] ?? '?') : 'Taller',
        }));
        setMovimientos(mapped);
        setDataLoading(false);
    }, [canAccess]);

    useEffect(() => { if (!authLoading && canAccess) loadData(); }, [authLoading, canAccess, loadData]);

    // ─────────────────────────────────
    // Efectos de lookup de impresoras por cliente
    // ─────────────────────────────────

    // Impresoras del cliente seleccionado (flujo Normal)
    useEffect(() => {
        if (!normalClienteRef) { setNormalImpresorasCliente([]); return; }
        supabase.from('impresora').select('serie').eq('id_cliente', normalClienteRef).order('serie')
            .then(({ data }) => setNormalImpresorasCliente(data || []));
    }, [normalClienteRef]);

    // Impresoras del cliente con falla
    useEffect(() => {
        if (!fallaClienteRef) { setFallaImpresorasCliente([]); return; }
        supabase.from('impresora').select('serie').eq('id_cliente', fallaClienteRef).order('serie')
            .then(({ data }) => setFallaImpresorasCliente(data || []));
    }, [fallaClienteRef]);

    // Impresoras actualmente en taller (para reemplazo): usa v_taller_actual (fecha_egreso IS NULL)
    useEffect(() => {
        if (motivo !== 'cambio_por_falla') return;
        supabase.from('v_taller_actual').select('serie_impresora').order('serie_impresora')
            .then(({ data }) =>
                setTallerImpresoras((data || []).map((r: any) => ({ serie: r.serie_impresora })))
            );
    }, [motivo]);

    // ─────────────────────────────────
    // Efectos de preview de equipos
    // ─────────────────────────────────

    // Preview del equipo seleccionado (flujo Normal)
    useEffect(() => {
        if (!normalSerie) { setNormalPreview({ ...UBI_PREVIEW_INIT }); return; }
        setNormalPreview(p => ({ ...p, serie: normalSerie, loading: true, error: null }));
        Promise.all([getUbicacion(normalSerie, cliMap), getImpresoraInfo(normalSerie)]).then(([ubi, info]) => {
            setNormalPreview({ serie: normalSerie, ubicacion: ubi, last_suministro: info.last_suministro, toner_pct: info.toner_pct, loading: false, error: ubi.error });
        });
    }, [normalSerie, cliMap]);

    // Preview equipo defectuoso
    useEffect(() => {
        if (!fallaSerie) { setFallaPreview({ ...UBI_PREVIEW_INIT }); return; }
        setFallaPreview(p => ({ ...p, serie: fallaSerie, loading: true, error: null }));
        Promise.all([getUbicacion(fallaSerie, cliMap), getImpresoraInfo(fallaSerie)]).then(([ubi, info]) => {
            setFallaPreview({ serie: fallaSerie, ubicacion: ubi, last_suministro: info.last_suministro, toner_pct: info.toner_pct, loading: false, error: ubi.error });
        });
    }, [fallaSerie, cliMap]);

    // Preview equipo reemplazo
    useEffect(() => {
        if (!replSerie) { setReplPreview({ ...UBI_PREVIEW_INIT }); return; }
        setReplPreview(p => ({ ...p, serie: replSerie, loading: true, error: null }));
        getUbicacion(replSerie, cliMap).then(ubi => {
            setReplPreview(p => ({ ...p, serie: replSerie, ubicacion: ubi, loading: false, error: ubi.error }));
        });
    }, [replSerie, cliMap]);

    // ─────────────────────────────────
    // Reset form
    // ─────────────────────────────────

    const resetForm = () => {
        setMotivo('');
        setFecha(new Date().toISOString().slice(0, 10));
        setResponsable(''); setObservacion('');
        setNormalClienteRef(null); setNormalImpresorasCliente([]); setNormalSerieInput(''); setNormalSerie(''); setNormalPreview({ ...UBI_PREVIEW_INIT }); setNormalDestino(null);
        setFallaClienteRef(null); setFallaImpresorasCliente([]); setFallaSerieInput(''); setFallaSerie(''); setFallaPreview({ ...UBI_PREVIEW_INIT });
        setReplSerieInput(''); setReplSerie(''); setReplPreview({ ...UBI_PREVIEW_INIT });
        setError(null);
    };

    // ─────────────────────────────────
    // Cálculos derivados para validaciones
    // ─────────────────────────────────

    // NORMAL: tipo_movimiento calculado
    const normalOrigenId = normalPreview.ubicacion.id_cliente;
    const normalDestinoId = normalDestino === 'taller' ? null : (normalDestino ?? undefined);
    const tipoCalculado: TipoMovimiento | null = normalSerie && normalDestino !== null
        ? calcTipo(normalOrigenId, normalDestinoId ?? null)
        : null;

    // Validaciones de vista para el usuario (no bloquean, solo informan hasta Submit)
    const normalValidErrors: string[] = [];
    if (normalPreview.serie && normalDestino !== null) {
        if (normalOrigenId !== null && normalDestino !== 'taller' && normalOrigenId === normalDestino)
            normalValidErrors.push('El origen y el destino no pueden ser el mismo cliente.');
        if (normalPreview.ubicacion.id_cliente === null && normalDestino === 'taller')
            normalValidErrors.push('El equipo ya está en el taller.');
    }

    const fallaValidErrors: string[] = [];
    if (fallaPreview.serie && !fallaPreview.loading) {
        if (fallaPreview.ubicacion.en_taller)
            fallaValidErrors.push('El equipo defectuoso debe estar actualmente en un cliente, no en el taller.');
    }
    if (replPreview.serie && !replPreview.loading) {
        if (!replPreview.ubicacion.en_taller)
            fallaValidErrors.push('El equipo de reemplazo debe estar actualmente en el taller.');
        if (replSerie.toUpperCase() === fallaSerie.toUpperCase())
            fallaValidErrors.push('La serie defectuosa y la de reemplazo no pueden ser iguales.');
    }

    // ─────────────────────────────────
    // Submit
    // ─────────────────────────────────

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (motivo === 'normal' || motivo === 'devolucion') {
            if (!normalSerie) return setError('Selecciona la serie del equipo.');
            if (normalDestino === null) return setError('Selecciona el destino del equipo.');
            if (normalValidErrors.length > 0) return setError(normalValidErrors[0]);

            setSaving(true);
            const tipo = calcTipo(normalOrigenId, normalDestinoId ?? null);
            const { error: err } = await supabase.from('movimiento_impresora').insert([{
                serie_impresora: normalSerie,
                tipo_movimiento: tipo,
                motivo: motivo, // 'normal' o 'devolucion'
                id_cliente_origen: normalOrigenId,
                id_cliente_destino: normalDestinoId ?? null,
                fecha_movimiento: fecha,
                responsable: responsable.trim() || null,
                observacion: observacion.trim() || null,
                creado_por: profile?.id ?? null,
            }]);
            if (err) { setError(err.message); setSaving(false); return; }

            // Actualizar impresora según el tipo de movimiento:
            //   taller_a_cliente  → id_cliente = destino,  estado = 'produccion'
            //   cliente_a_taller  → id_cliente = NULL,     estado = 'retirado'
            //   cliente_a_cliente → id_cliente = destino,  estado = 'produccion'
            //                       (si es la misma sede/cliente, el estado no cambia)
            const nuevoCliente = normalDestinoId ?? null;

            if (tipo === 'cliente_a_taller') {
                // Va al taller: quitar del inventario y marcar como retirado
                await supabase.from('impresora')
                    .update({ id_cliente: null, estado: 'retirado' })
                    .eq('serie', normalSerie);
            } else if (tipo === 'taller_a_cliente') {
                // Sale del taller hacia un cliente: poner en producción
                await supabase.from('impresora')
                    .update({ id_cliente: nuevoCliente, estado: 'produccion' })
                    .eq('serie', normalSerie);
            } else {
                // cliente_a_cliente: si es la misma sede (mismo id_cliente) no cambia estado
                if (normalOrigenId !== nuevoCliente) {
                    await supabase.from('impresora')
                        .update({ id_cliente: nuevoCliente, estado: 'produccion' })
                        .eq('serie', normalSerie);
                }
            }

        } else if (motivo === 'cambio_por_falla') {
            if (!fallaSerie) return setError('Selecciona el equipo defectuoso.');
            if (!replSerie) return setError('Selecciona el equipo de reemplazo.');
            if ([...fallaValidErrors].length > 0) return setError(fallaValidErrors[0]);

            setSaving(true);
            const clienteFalla = fallaPreview.ubicacion.id_cliente; // cliente donde está el defectuoso

            // Insertar 2 registros en una sola transacción conceptual
            const [r1, r2] = await Promise.all([
                // REGISTRO 1 — Envío de reemplazo: Taller → Cliente del defectuoso
                supabase.from('movimiento_impresora').insert([{
                    serie_impresora: replSerie,
                    tipo_movimiento: 'taller_a_cliente',
                    motivo: 'cambio_por_falla',
                    id_cliente_origen: null,
                    id_cliente_destino: clienteFalla,
                    fecha_movimiento: fecha,
                    responsable: responsable.trim() || null,
                    observacion: observacion.trim() || null,
                    creado_por: profile?.id ?? null,
                }]),
                // REGISTRO 2 — Retorno defectuoso: Cliente → Taller (automático)
                supabase.from('movimiento_impresora').insert([{
                    serie_impresora: fallaSerie,
                    tipo_movimiento: 'cliente_a_taller',
                    motivo: 'cambio_por_falla',
                    id_cliente_origen: clienteFalla,
                    id_cliente_destino: null,
                    fecha_movimiento: fecha,
                    responsable: responsable.trim() || null,
                    observacion: `[Retorno automático por cambio por falla] ${observacion.trim()}`.trim(),
                    creado_por: profile?.id ?? null,
                }]),
            ]);

            if (r1.error || r2.error) {
                setError((r1.error || r2.error)?.message ?? 'Error al insertar movimientos.');
                setSaving(false); return;
            }

            // Actualizar impresora:
            //   - Reemplazo (taller → cliente): id_cliente = clienteFalla, estado = 'produccion'
            //   - Defectuoso (cliente → taller): id_cliente = NULL, estado = 'retirado'
            // El trigger fn_sincronizar_taller maneja la tabla `taller` automáticamente.
            await Promise.all([
                supabase.from('impresora')
                    .update({ id_cliente: clienteFalla, estado: 'produccion' })
                    .eq('serie', replSerie),
                supabase.from('impresora')
                    .update({ id_cliente: null, estado: 'retirado' })
                    .eq('serie', fallaSerie),
            ]);
        } else {
            return setError('Selecciona un motivo para continuar.');
        }

        setSaving(false);
        setShowForm(false);
        resetForm();
        await loadData();
    };

    // ── Filtros tabla ──
    const filtered = useMemo(() => movimientos.filter(m => {
        const ms = !filterSerie || m.serie_impresora.toLowerCase().includes(filterSerie.toLowerCase());
        const mt = !filterTipo || m.tipo_movimiento === filterTipo;
        const mc = !filterCliente || (
            (m.origen_nombre ?? '').toLowerCase().includes(filterCliente.toLowerCase()) ||
            (m.destino_nombre ?? '').toLowerCase().includes(filterCliente.toLowerCase())
        );
        return ms && mt && mc;
    }), [movimientos, filterSerie, filterTipo, filterCliente]);

    // ─────────────────────────────────
    // Render
    // ─────────────────────────────────

    if (authLoading || dataLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Cargando movimientos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">

            {/* ── Encabezado ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Truck className="w-6 h-6 text-blue-600" /> Movimientos de Impresoras
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">El origen y tipo se calculan automáticamente según la ubicación actual del equipo</p>
                </div>
                <button onClick={() => { setShowForm(true); resetForm(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow">
                    <Plus className="w-4 h-4" /> Registrar Movimiento
                </button>
            </div>

            {error && !showForm && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
                </div>
            )}

            {/* ─────────────────────────────────────────────
          MODAL FORMULARIO — side panel
      ───────────────────────────────────────────── */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50">
                    <div className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">

                        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                            <h2 className="text-base font-semibold">Registrar Movimiento</h2>
                            <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 rounded-full hover:bg-white/20 transition">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <form onSubmit={handleSave} className="p-5 space-y-5">

                                {/* ── PASO 0: Selección de motivo ── */}
                                <fieldset className="border border-gray-200 rounded-xl p-4 space-y-2">
                                    <legend className="text-xs font-semibold text-gray-500 px-1">MOTIVO DEL MOVIMIENTO</legend>
                                    <p className="text-xs text-gray-400">Selecciona primero el motivo para ver el formulario correspondiente.</p>
                                    <div className="flex gap-2">
                                        {([
                                            ['normal', 'Movimiento Normal', 'bg-blue-600 border-blue-600 text-white'],
                                            ['devolucion', 'Devolución de Equipo', 'bg-amber-500 border-amber-500 text-white'],
                                            ['cambio_por_falla', 'Cambio por Falla', 'bg-red-600 border-red-600 text-white'],
                                        ] as [MotivoMovimiento, string, string][]).map(([val, label, activeClass]) => (
                                            <button key={val} type="button"
                                                onClick={() => { setMotivo(val); setError(null); }}
                                                className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition ${motivo === val ? activeClass : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>

                                {/* ── BLOQUE NORMAL / DEVOLUCIÓN (misma lógica, 1 registro) ── */}
                                {(motivo === 'normal' || motivo === 'devolucion') && (
                                    <>
                                        <fieldset className="border border-blue-100 rounded-xl p-4 space-y-3">
                                            <legend className="text-xs font-semibold text-blue-600 px-1">EQUIPO A MOVER</legend>

                                            {/* Seleccionar cliente para filtrar series */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Cliente actual del equipo</label>
                                                <select value={normalClienteRef ?? ''}
                                                    onChange={e => { setNormalClienteRef(e.target.value ? Number(e.target.value) : null); setNormalSerie(''); setNormalSerieInput(''); }}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                                                    <option value="">-- Selecciona un cliente (opcional) --</option>
                                                    {clientes.map(c => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_especifico}</option>)}
                                                </select>
                                            </div>

                                            <SerieBuscador
                                                label="Serie del equipo *"
                                                value={normalSerie}
                                                serieInput={normalSerieInput}
                                                onSerieInput={setNormalSerieInput}
                                                onSelect={setNormalSerie}
                                                impresorasCliente={normalImpresorasCliente}
                                            />

                                            <ImpresoraCard preview={normalPreview} label="Equipo a mover" />

                                            {normalPreview.serie && !normalPreview.loading && (
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Destino *</label>
                                                    <select value={normalDestino ?? ''}
                                                        onChange={e => setNormalDestino(e.target.value === 'taller' ? 'taller' : e.target.value ? Number(e.target.value) : null)}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                                                        <option value="">-- Selecciona destino --</option>
                                                        <option value="taller">Taller</option>
                                                        {clientes
                                                            .filter(c => c.id_cliente !== normalOrigenId)
                                                            .map(c => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_especifico}</option>)}
                                                    </select>
                                                    {tipoCalculado && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Tipo calculado:</span>
                                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLORS[tipoCalculado]}`}>
                                                                {TIPO_LABELS[tipoCalculado]}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {normalValidErrors.map((e, i) => (
                                                        <p key={i} className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" /> {e}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </fieldset>
                                    </>
                                )}

                                {/* ── BLOQUE CAMBIO POR FALLA ── */}
                                {motivo === 'cambio_por_falla' && (
                                    <>
                                        {/* Banner informativo */}
                                        <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                                            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                                            <span>
                                                Este proceso generará <strong>automáticamente</strong> el retorno del equipo defectuoso al taller
                                                y el envío del equipo reemplazo al cliente. <strong>No se requiere ninguna acción adicional.</strong>
                                            </span>
                                        </div>

                                        {/* Equipo defectuoso */}
                                        <fieldset className="border border-red-200 bg-red-50/30 rounded-xl p-4 space-y-3">
                                            <legend className="text-xs font-semibold text-red-600 px-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> EQUIPO DEFECTUOSO (sale del cliente)
                                            </legend>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Cliente donde está el equipo defectuoso</label>
                                                <select value={fallaClienteRef ?? ''}
                                                    onChange={e => { setFallaClienteRef(e.target.value ? Number(e.target.value) : null); setFallaSerie(''); setFallaSerieInput(''); }}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                                                    <option value="">-- Selecciona el cliente --</option>
                                                    {clientes.map(c => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_especifico}</option>)}
                                                </select>
                                            </div>
                                            <SerieBuscador
                                                label="Serie del equipo defectuoso *"
                                                value={fallaSerie}
                                                serieInput={fallaSerieInput}
                                                onSerieInput={setFallaSerieInput}
                                                onSelect={setFallaSerie}
                                                impresorasCliente={fallaImpresorasCliente}
                                                required
                                            />
                                            <ImpresoraCard preview={fallaPreview} label="Equipo defectuoso" />
                                        </fieldset>

                                        {/* Equipo reemplazo */}
                                        <fieldset className="border border-green-200 bg-green-50/30 rounded-xl p-4 space-y-3">
                                            <legend className="text-xs font-semibold text-green-700 px-1">EQUIPO REEMPLAZO (sale del taller)</legend>
                                            <div className="text-xs text-gray-400">Solo se listan equipos actualmente en el taller (sin cliente asignado).</div>
                                            <SerieBuscador
                                                label="Serie del equipo reemplazo *"
                                                value={replSerie}
                                                serieInput={replSerieInput}
                                                onSerieInput={setReplSerieInput}
                                                onSelect={setReplSerie}
                                                impresorasCliente={tallerImpresoras}
                                                required
                                            />
                                            <ImpresoraCard preview={replPreview} label="Equipo reemplazo" />
                                        </fieldset>

                                        {/* Resumen de registros que se generarán */}
                                        {fallaSerie && replSerie && !fallaPreview.loading && !replPreview.loading && fallaValidErrors.length === 0 && (
                                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs space-y-2">
                                                <p className="font-semibold text-indigo-700">Registros que se generarán automáticamente:</p>
                                                <div className="flex items-center gap-2 text-indigo-600">
                                                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Taller → Cliente</span>
                                                    <span>{replSerie} → {fallaPreview.ubicacion.cliente_nombre ?? '?'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-indigo-600">
                                                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Cliente → Taller</span>
                                                    <span>{fallaSerie} → Taller (automático)</span>
                                                </div>
                                            </div>
                                        )}

                                        {fallaValidErrors.map((e, i) => (
                                            <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> {e}
                                            </p>
                                        ))}
                                    </>
                                )}

                                {/* ── Campos comunes ── */}
                                {motivo && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha *</label>
                                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" required />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Responsable / Técnico</label>
                                            <input type="text" value={responsable} onChange={e => setResponsable(e.target.value)}
                                                placeholder="Nombre..."
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Observación</label>
                                            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2}
                                                placeholder="Notas adicionales..."
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                                        </div>
                                    </div>
                                )}

                                {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}

                                <div className="flex justify-end gap-2 pt-1 pb-6">
                                    <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={saving || !motivo}
                                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                                        {saving ? 'Guardando...' : motivo === 'cambio_por_falla' ? 'Confirmar Cambio por Falla' : 'Registrar Movimiento'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Filtros ── */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Buscar serie..."
                        value={filterSerie} onChange={e => setFilterSerie(e.target.value)}
                        className="pl-9 pr-3 py-2 w-40 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Filtrar cliente..."
                        value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
                        className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                    className="py-2 px-3 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todos los tipos</option>
                    {(Object.entries(TIPO_LABELS) as [TipoMovimiento, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                    ))}
                </select>
                {(filterSerie || filterTipo || filterCliente) && (
                    <button onClick={() => { setFilterSerie(''); setFilterTipo(''); setFilterCliente(''); }}
                        className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition">
                        <X className="w-3.5 h-3.5" /> Limpiar
                    </button>
                )}
                <div className="flex-1" />
                <button onClick={loadData}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:text-blue-600 hover:bg-gray-100 transition">
                    <RefreshCw className="w-4 h-4" /> Actualizar
                </button>
            </div>

            {/* ── Tabla ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-700">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                        <tr>
                            <th className="px-4 py-3">Serie</th>
                            <th className="px-4 py-3">Tipo (auto)</th>
                            <th className="px-4 py-3">Motivo</th>
                            <th className="px-4 py-3">Origen</th>
                            <th className="px-2 py-3"></th>
                            <th className="px-4 py-3">Destino</th>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Responsable</th>
                            <th className="px-4 py-3">Observación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin movimientos registrados.</td></tr>
                        ) : (
                            filtered.map(m => (
                                <tr key={m.id_movimiento} className="border-t hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2 font-mono font-semibold text-indigo-700">{m.serie_impresora}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[m.tipo_movimiento]}`}>
                                            {TIPO_LABELS[m.tipo_movimiento]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        {m.motivo === 'cambio_por_falla'
                                            ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Cambio por falla</span>
                                            : m.motivo === 'devolucion'
                                                ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Devolución</span>
                                                : <span className="text-gray-400 text-xs">Normal</span>}
                                    </td>
                                    <td className="px-4 py-2">{m.origen_nombre}</td>
                                    <td className="px-2 py-2 text-gray-400"><ArrowRight className="w-4 h-4" /></td>
                                    <td className="px-4 py-2">{m.destino_nombre}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(m.fecha_movimiento)}</td>
                                    <td className="px-4 py-2">{m.responsable ?? '—'}</td>
                                    <td className="px-4 py-2 max-w-[180px] truncate text-gray-500">{m.observacion ?? '—'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-gray-400 text-right">{filtered.length} movimiento(s)</p>
        </div>
    );
}
