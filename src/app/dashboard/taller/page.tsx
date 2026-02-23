'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import { Search, RefreshCw, Wrench, AlertTriangle, X } from 'lucide-react';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

interface EquipoTaller {
    id_taller: number;
    serie_impresora: string;
    modelo: string | null;
    estado: 'operativo' | 'inoperativo';
    desmantelado: boolean;
    detalle_desmantelado: string | null;
    fecha_desmantelado: string | null;
    fecha_ingreso: string;
    observacion: string | null;
    // Datos adicionales de impresora
    id_cliente_ultimo: number | null;
    cliente_ultimo_nombre: string | null;
    // Motivo del último movimiento
    motivo_ingreso: string | null;
}

const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function diasEnTaller(fecha_ingreso: string): number {
    const diff = Date.now() - new Date(fecha_ingreso + 'T00:00:00').getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────

export default function TallerPage() {
    const router = useRouter();
    const { profile, loading: authLoading, hasAccess } = useUserRole();
    const canAccess = hasAccess(['master', 'adm', 'adistribucion', 'edistribucion', 'pmovilidad']);

    const [equipos, setEquipos] = useState<EquipoTaller[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filtros
    const [filterSerie, setFilterSerie] = useState('');
    const [filterEstado, setFilterEstado] = useState('');

    // Modal de observación / actualizar estado
    const [editItem, setEditItem] = useState<EquipoTaller | null>(null);
    const [editEstado, setEditEstado] = useState<'operativo' | 'inoperativo'>('operativo');
    const [editObs, setEditObs] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && !profile) router.replace('/login');
        if (!authLoading && profile && !canAccess) router.replace('/dashboard');
    }, [authLoading, profile, canAccess, router]);

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        if (!canAccess) return;
        setDataLoading(true);
        setError(null);

        // Traer equipos actuales en taller via la vista
        const { data: tallerData, error: tallerErr } = await supabase
            .from('v_taller_actual')
            .select('id_taller, serie_impresora, modelo, estado, desmantelado, detalle_desmantelado, fecha_desmantelado, fecha_ingreso, observacion')
            .order('fecha_ingreso', { ascending: false });

        if (tallerErr) {
            setError(tallerErr.message);
            setDataLoading(false);
            return;
        }

        // Para cada serie, obtener el último movimiento (motivo + cliente origen)
        const series = (tallerData || []).map(t => t.serie_impresora);
        const { data: movData } = await supabase
            .from('movimiento_impresora')
            .select('serie_impresora, motivo, id_cliente_origen, timestamp_registro')
            .in('serie_impresora', series.length > 0 ? series : ['__none__'])
            .eq('tipo_movimiento', 'cliente_a_taller')
            .order('timestamp_registro', { ascending: false });

        // Mapa últimos movimientos por serie
        const movMap: Record<string, { motivo: string | null; id_cliente_origen: number | null }> = {};
        if (movData) {
            movData.forEach(m => {
                if (!movMap[m.serie_impresora]) movMap[m.serie_impresora] = { motivo: m.motivo, id_cliente_origen: m.id_cliente_origen };
            });
        }

        // Obtener nombres de clientes mencionados
        const clienteIds = Object.values(movMap).map(v => v.id_cliente_origen).filter(Boolean) as number[];
        const { data: cliData } = clienteIds.length > 0
            ? await supabase.from('clientes').select('id_cliente, nombre_especifico').in('id_cliente', clienteIds)
            : { data: [] };
        const cliMap: Record<number, string> = {};
        (cliData || []).forEach(c => { cliMap[c.id_cliente] = c.nombre_especifico; });

        const mapped: EquipoTaller[] = (tallerData || []).map((t: any) => {
            const mov = movMap[t.serie_impresora];
            return {
                ...t,
                id_cliente_ultimo: mov?.id_cliente_origen ?? null,
                cliente_ultimo_nombre: mov?.id_cliente_origen ? (cliMap[mov.id_cliente_origen] ?? 'Desconocido') : null,
                motivo_ingreso: mov?.motivo ?? null,
            };
        });

        setEquipos(mapped);
        setDataLoading(false);
    }, [canAccess]);

    useEffect(() => { if (!authLoading && canAccess) loadData(); }, [authLoading, canAccess, loadData]);

    // ── Actualizar estado del equipo ──
    const handleGuardar = async () => {
        if (!editItem) return;
        setSaving(true);
        const { error: updErr } = await supabase
            .from('taller')
            .update({ estado: editEstado, observacion: editObs.trim() || null })
            .eq('id_taller', editItem.id_taller);
        if (updErr) setError(updErr.message);
        else { setEditItem(null); await loadData(); }
        setSaving(false);
    };

    // ── Filtrado ──
    const filtered = useMemo(() =>
        equipos.filter(e => {
            const ms = !filterSerie || e.serie_impresora.toLowerCase().includes(filterSerie.toLowerCase());
            const me = !filterEstado || e.estado === filterEstado;
            return ms && me;
        }),
        [equipos, filterSerie, filterEstado]
    );

    const totalOperativo = equipos.filter(e => e.estado === 'operativo').length;
    const totalInoperativo = equipos.filter(e => e.estado === 'inoperativo').length;
    const totalDesmantelado = equipos.filter(e => e.desmantelado).length;

    if (authLoading || dataLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Cargando taller...</p>
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
                        <Wrench className="w-6 h-6 text-indigo-600" /> Equipos en Taller
                    </h1>
                    <p className="text-sm text-gray-400 mt-0.5">Impresoras actualmente en el taller (sin fecha de egreso)</p>
                </div>
                <button onClick={loadData}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:text-indigo-600 hover:bg-gray-50 transition">
                    <RefreshCw className="w-4 h-4" /> Actualizar
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}<button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
                </div>
            )}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total en taller', value: equipos.length, color: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                    { label: 'Operativos', value: totalOperativo, color: 'bg-green-50 border-green-100 text-green-700' },
                    { label: 'Inoperativos', value: totalInoperativo, color: 'bg-red-50 border-red-100 text-red-700' },
                    { label: 'Desmantelados', value: totalDesmantelado, color: 'bg-gray-50 border-gray-200 text-gray-600' },
                ].map(k => (
                    <div key={k.label} className={`${k.color} border rounded-xl p-4 text-center`}>
                        <p className="text-3xl font-bold">{k.value}</p>
                        <p className="text-xs mt-1 opacity-70">{k.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Filtros ── */}
            <div className="flex flex-wrap gap-3 items-center p-3 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="text" placeholder="Buscar serie..."
                        value={filterSerie} onChange={e => setFilterSerie(e.target.value)}
                        className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
                    className="py-2 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Todos los estados</option>
                    <option value="operativo">Operativo</option>
                    <option value="inoperativo">Inoperativo</option>
                </select>
                {(filterSerie || filterEstado) && (
                    <button onClick={() => { setFilterSerie(''); setFilterEstado(''); }}
                        className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition">
                        <X className="w-3.5 h-3.5" /> Limpiar
                    </button>
                )}
                <p className="ml-auto text-xs text-gray-400">{filtered.length} equipo(s)</p>
            </div>

            {/* ── Tabla ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-700">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                        <tr>
                            <th className="px-4 py-3">Serie</th>
                            <th className="px-4 py-3">Modelo</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Proviene de</th>
                            <th className="px-4 py-3">Motivo ingreso</th>
                            <th className="px-4 py-3">Fecha ingreso</th>
                            <th className="px-4 py-3">Días en taller</th>
                            <th className="px-4 py-3">Observación</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                                    {equipos.length === 0 ? 'No hay equipos en el taller actualmente.' : 'Sin resultados con los filtros aplicados.'}
                                </td>
                            </tr>
                        ) : (
                            filtered.map(e => {
                                const dias = diasEnTaller(e.fecha_ingreso);
                                return (
                                    <tr key={e.id_taller} className={`border-t transition hover:bg-gray-50 ${e.desmantelado ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-2 font-mono font-semibold text-indigo-700">
                                            {e.serie_impresora}
                                            {e.desmantelado && (
                                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-600 rounded-full">desmantelado</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-gray-600">{e.modelo ?? '—'}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${e.estado === 'operativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {e.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-600">{e.cliente_ultimo_nombre ?? <span className="text-gray-400 italic">Sin cliente registrado</span>}</td>
                                        <td className="px-4 py-2">
                                            {e.motivo_ingreso === 'cambio_por_falla'
                                                ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Cambio por falla</span>
                                                : e.motivo_ingreso === 'devolucion'
                                                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Devolución</span>
                                                    : e.motivo_ingreso
                                                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{e.motivo_ingreso}</span>
                                                        : <span className="text-gray-400 text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">{fmtDate(e.fecha_ingreso)}</td>
                                        <td className="px-4 py-2">
                                            <span className={`font-semibold ${dias > 30 ? 'text-red-600' : dias > 14 ? 'text-amber-600' : 'text-gray-700'}`}>
                                                {dias}d
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 max-w-[160px] truncate text-gray-500">{e.observacion ?? '—'}</td>
                                        <td className="px-4 py-2 text-right">
                                            <button
                                                onClick={() => { setEditItem(e); setEditEstado(e.estado); setEditObs(e.observacion ?? ''); }}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition"
                                            >
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Modal editar estado / observación ── */}
            {editItem && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Editar equipo</h3>
                            <button onClick={() => setEditItem(null)}><X className="w-4 h-4 text-gray-400" /></button>
                        </div>
                        <p className="text-sm font-mono text-indigo-700">{editItem.serie_impresora}</p>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                            <div className="flex gap-2">
                                {(['operativo', 'inoperativo'] as const).map(st => (
                                    <button key={st} type="button"
                                        onClick={() => setEditEstado(st)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition ${editEstado === st
                                            ? st === 'operativo' ? 'bg-green-600 border-green-600 text-white' : 'bg-red-600 border-red-600 text-white'
                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                        {st.charAt(0).toUpperCase() + st.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observación</label>
                            <textarea value={editObs} onChange={e => setEditObs(e.target.value)} rows={3}
                                placeholder="Notas sobre el equipo..."
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                        </div>

                        {editItem.desmantelado && (
                            <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                <span>Equipo desmantelado: {editItem.detalle_desmantelado}</span>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setEditItem(null)}
                                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                                Cancelar
                            </button>
                            <button onClick={handleGuardar} disabled={saving}
                                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
