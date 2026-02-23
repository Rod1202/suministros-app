'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Search, RefreshCw, X, Plus, Printer,
  MapPin, Phone, User, Package, BarChart2,
  ClipboardList, ArrowLeft,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Impresora {
  serie: string;
  id_cliente: number | null;
  cliente_nombre: string | null;
  id_modelo: number | null;
  modelo_nombre: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  nombre_contacto: string | null;
  numero_contacto: string | null;
  created_date: string;
  estado: string; // 'produccion' | 'backup'
  adm_nombre?: string | null;
  dia_corte: number | null;
}

interface ClienteOption { id_cliente: number; nombre_especifico: string; id_adm: number | null; dia_corte: number | null; }
interface ModeloOption { id_modelo: number; nombre: string; }
interface AdmOption { id_adm: number; nombre: string; }

interface Requerimiento {
  id_requerimiento?: number;
  id_historico?: number;
  cod_sku: string | null;
  sku_default: string | null;
  cantidad_solicitada: number | null;
  estado: string | null;
  fecha_solicitud: string | null;
  fecha_atencion: string | null;
  guia: string | null;
  fuente: 'activo' | 'historico';
}

interface Volumetria {
  id_volumetria: number;
  fecha_inicio: string;
  fecha_fin: string;
  inicio_mono: number;
  fin_mono: number;
  total_mono: number;
  inicio_color: number;
  fin_color: number;
  total_color: number;
  total_pages: number;
  observacion: string | null;
}

const EMPTY_VOL_FORM = {
  fecha_inicio: '',
  fecha_fin: '',
  inicio_mono: 0,
  fin_mono: 0,
  inicio_color: 0,
  fin_color: 0,
  observacion: '',
};

type FichaTab = 'info' | 'requerimientos' | 'suministros' | 'volumetria';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado: 'bg-orange-100 text-orange-800',
  transito: 'bg-cyan-100 text-cyan-800',
  'sin stock': 'bg-red-100 text-red-800',
  atendido: 'bg-green-100 text-green-800',
  cancelado: 'bg-gray-100 text-gray-600',
};

// ─── Componente Ficha Impresora ───────────────────────────────────────────────

function FichaImpresora({
  impresora,
  onClose,
}: {
  impresora: Impresora;
  onClose: () => void;
}) {
  const { profile } = useUserRole();
  const [tab, setTab] = useState<FichaTab>('info');
  const [reqs, setReqs] = useState<Requerimiento[]>([]);
  const [volumetrias, setVolumetrias] = useState<Volumetria[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showVolForm, setShowVolForm] = useState(false);
  const [volForm, setVolForm] = useState({ ...EMPTY_VOL_FORM });
  const [savingVol, setSavingVol] = useState(false);
  const [volError, setVolError] = useState<string | null>(null);

  // Cargar requerimientos y volumetría al abrir la ficha
  useEffect(() => {
    const fetchAll = async () => {
      setLoadingData(true);
      const [{ data: activos }, { data: historicos }, { data: vols }] = await Promise.all([
        supabase
          .from('requerimiento')
          .select('id_requerimiento, cod_sku, sku_default, cantidad_solicitada, estado, fecha_solicitud, fecha_atencion, guia')
          .eq('serie_impresora', impresora.serie)
          .order('fecha_solicitud', { ascending: false }),
        supabase
          .from('requerimiento_historico')
          .select('id_historico, cod_sku, sku_default, cantidad_solicitada, estado, fecha_solicitud, fecha_atencion, guia')
          .eq('serie_impresora', impresora.serie)
          .order('fecha_solicitud', { ascending: false })
          .limit(50),
        supabase
          .from('volumetria_impresora')
          .select('id_volumetria, fecha_inicio, fecha_fin, inicio_mono, fin_mono, total_mono, inicio_color, fin_color, total_color, total_pages, observacion')
          .eq('serie_impresora', impresora.serie)
          .order('fecha_fin', { ascending: false }),
      ]);

      setReqs([
        ...(activos || []).map(r => ({ ...r, fuente: 'activo' as const })),
        ...(historicos || []).map(r => ({ ...r, fuente: 'historico' as const })),
      ]);
      setVolumetrias(vols || []);
      setLoadingData(false);
    };
    fetchAll();
  }, [impresora.serie]);

  // ── Suministros por SKU (desde histórico atendido) ──
  const suministrosPorSku = useMemo(() => {
    const map: Record<string, { sku: string; total: number }> = {};
    reqs.filter(r => r.fuente === 'historico' && r.estado === 'atendido').forEach(r => {
      const key = r.sku_default || r.cod_sku || 'N/A';
      if (!map[key]) map[key] = { sku: key, total: 0 };
      map[key].total += r.cantidad_solicitada ?? 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [reqs]);

  // ── Guardar volumetría ──
  const handleSaveVol = async (e: React.FormEvent) => {
    e.preventDefault();
    setVolError(null);
    if (!volForm.fecha_inicio || !volForm.fecha_fin) return setVolError('Las fechas son obligatorias.');
    if (volForm.fecha_fin < volForm.fecha_inicio) return setVolError('La fecha fin debe ser mayor a la fecha inicio.');
    setSavingVol(true);

    const { error } = await supabase.from('volumetria_impresora').insert([{
      serie_impresora: impresora.serie,
      id_cliente: impresora.id_cliente,
      fecha_inicio: volForm.fecha_inicio,
      fecha_fin: volForm.fecha_fin,
      inicio_mono: Number(volForm.inicio_mono),
      fin_mono: Number(volForm.fin_mono),
      inicio_color: Number(volForm.inicio_color),
      fin_color: Number(volForm.fin_color),
      observacion: volForm.observacion.trim() || null,
      creado_por: profile?.id ?? null,
    }]);

    if (error) {
      setVolError(error.message);
    } else {
      // Recargar volumetría
      const { data } = await supabase
        .from('volumetria_impresora')
        .select('id_volumetria, fecha_inicio, fecha_fin, inicio_mono, fin_mono, total_mono, inicio_color, fin_color, total_color, total_pages, observacion')
        .eq('serie_impresora', impresora.serie)
        .order('fecha_fin', { ascending: false });
      setVolumetrias(data || []);
      setShowVolForm(false);
      setVolForm({ ...EMPTY_VOL_FORM });
    }
    setSavingVol(false);
  };

  const TABS: { key: FichaTab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: 'Información', icon: <Printer className="w-3.5 h-3.5" /> },
    { key: 'requerimientos', label: 'Requerimientos', icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: 'suministros', label: 'Suministros', icon: <Package className="w-3.5 h-3.5" /> },
    { key: 'volumetria', label: 'Volumetría', icon: <BarChart2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-end z-50">
      <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b bg-gradient-to-r from-indigo-600 to-blue-500 text-white">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium opacity-80">Impresora</p>
            <h2 className="text-xl font-bold font-mono leading-tight">{impresora.serie}</h2>
            {impresora.modelo_nombre && <p className="text-sm opacity-90">{impresora.modelo_nombre}</p>}
          </div>
          <div className="text-right text-xs opacity-80">
            <p>{impresora.cliente_nombre ?? '—'}</p>
            <p>{impresora.provincia ?? '—'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition ${tab === t.key ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              {t.icon}
              {t.label}
              {t.key === 'requerimientos' && reqs.length > 0 && (
                <span className="ml-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full px-1.5">{reqs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Info ── */}
          {tab === 'info' && (
            <div className="space-y-5">
              <section>
                <h3 className="text-xs uppercase font-semibold text-gray-400 mb-3 tracking-wider">Datos del Equipo</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Serie', value: impresora.serie },
                    { label: 'Modelo', value: impresora.modelo_nombre },
                    { label: 'Cliente', value: impresora.cliente_nombre },
                    { label: 'ADM', value: impresora.adm_nombre },
                    { label: 'Registro', value: fmtDate(impresora.created_date) },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{item.label}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase font-semibold text-gray-400 mb-3 tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Ubicación
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm text-gray-700">
                  {impresora.departamento && <p><span className="text-gray-400 text-xs">Departamento: </span>{impresora.departamento}</p>}
                  {impresora.provincia && <p><span className="text-gray-400 text-xs">Provincia: </span>{impresora.provincia}</p>}
                  {impresora.distrito && <p><span className="text-gray-400 text-xs">Distrito: </span>{impresora.distrito}</p>}
                  {impresora.direccion && <p><span className="text-gray-400 text-xs">Dirección: </span>{impresora.direccion}</p>}
                  {!impresora.departamento && !impresora.provincia && !impresora.direccion && (
                    <p className="text-gray-400 text-xs">Sin datos de ubicación</p>
                  )}
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase font-semibold text-gray-400 mb-3 tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Contacto
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm text-gray-700">
                  {impresora.nombre_contacto
                    ? <p className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-gray-400" />{impresora.nombre_contacto}</p>
                    : null}
                  {impresora.numero_contacto
                    ? <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" />{impresora.numero_contacto}</p>
                    : null}
                  {!impresora.nombre_contacto && !impresora.numero_contacto && (
                    <p className="text-gray-400 text-xs">Sin datos de contacto</p>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ── Requerimientos ── */}
          {tab === 'requerimientos' && (
            <div>
              {loadingData ? (
                <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
              ) : reqs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Sin requerimientos registrados.</div>
              ) : (
                <div className="space-y-2">
                  {reqs.map((r, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${r.fuente === 'activo' ? 'border-blue-100 bg-blue-50/50' : 'border-gray-100 bg-white'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-indigo-700">{r.sku_default || r.cod_sku || 'N/A'}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[r.estado?.toLowerCase() ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.estado}
                          </span>
                          {r.fuente === 'activo' && <span className="text-xs text-blue-400">● Activo</span>}
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>Cant: <strong>{r.cantidad_solicitada ?? '—'}</strong></span>
                          <span>Solicitado: {fmtDate(r.fecha_solicitud)}</span>
                          {r.fecha_atencion && <span>Atendido: {fmtDate(r.fecha_atencion)}</span>}
                          {r.guia && <span>Guía: {r.guia}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Suministros ── */}
          {tab === 'suministros' && (
            <div>
              {suministrosPorSku.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Sin suministros atendidos.</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">Acumulado de suministros atendidos por SKU</p>
                  {suministrosPorSku.map(s => (
                    <div key={s.sku} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-400" />
                        <span className="font-mono text-sm font-semibold text-gray-800">{s.sku}</span>
                      </div>
                      <span className="text-lg font-bold text-indigo-700">{s.total.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between text-xs text-gray-500 font-medium border-t">
                    <span>TOTAL</span>
                    <span className="text-indigo-700">{suministrosPorSku.reduce((s, v) => s + v.total, 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Volumetría ── */}
          {tab === 'volumetria' && (
            <div className="space-y-4">
              {/* Botón agregar lectura */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {impresora.dia_corte
                    ? <span>Corte el día <strong className="text-indigo-600">{impresora.dia_corte}</strong> de cada mes</span>
                    : 'Lecturas de contador registradas para este equipo'}
                </p>
                <button
                  onClick={() => {
                    const dia = impresora.dia_corte ?? 1;
                    const hoy = new Date();
                    const a = hoy.getFullYear();
                    const m = hoy.getMonth(); // 0-indexado

                    // Corte de este mes y el anterior
                    const corteHoy = new Date(a, m, dia);
                    const corteAnt = new Date(a, m - 1, dia);
                    const corteAnt2 = new Date(a, m - 2, dia);

                    // Si hoy ≥ corte este mes → período cerrado: mes-anterior → este mes
                    // Si hoy < corte este mes  → período cerrado: 2 meses atrás → mes anterior
                    const [fechaInicio, fechaFin] = hoy >= corteHoy
                      ? [corteAnt, corteHoy]
                      : [corteAnt2, corteAnt];

                    const toISO = (d: Date) => d.toISOString().slice(0, 10);
                    const last = volumetrias.length > 0 ? volumetrias[0] : null;

                    setVolForm({
                      fecha_inicio: toISO(fechaInicio),
                      fecha_fin: toISO(fechaFin),
                      inicio_mono: last?.fin_mono ?? 0,
                      fin_mono: last?.fin_mono ?? 0, // usuario solo cambia el fin
                      inicio_color: last?.fin_color ?? 0,
                      fin_color: last?.fin_color ?? 0,
                      observacion: '',
                    });
                    setShowVolForm(v => !v);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Nueva Lectura
                </button>
              </div>

              {/* Formulario nueva volumetría */}
              {showVolForm && (
                <form onSubmit={handleSaveVol} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-indigo-800">Registrar Lectura de Contador</h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio *</label>
                      <input type="date" value={volForm.fecha_inicio}
                        onChange={e => {
                          const ini = e.target.value;
                          // Recalcular fecha_fin al mismo día del mes siguiente
                          const d = new Date(ini + 'T00:00:00');
                          d.setMonth(d.getMonth() + 1);
                          setVolForm(p => ({ ...p, fecha_inicio: ini, fecha_fin: d.toISOString().slice(0, 10) }));
                        }}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fecha Fin * <span className="text-indigo-400">(día {impresora.dia_corte ?? '—'})</span>
                      </label>
                      <input type="date" value={volForm.fecha_fin} onChange={e => setVolForm(p => ({ ...p, fecha_fin: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" required />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contador Mono — Inicio</label>
                      <input type="number" min={0} value={volForm.inicio_mono}
                        onChange={e => setVolForm(p => ({ ...p, inicio_mono: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contador Mono — Fin</label>
                      <input type="number" min={0} value={volForm.fin_mono}
                        onChange={e => setVolForm(p => ({ ...p, fin_mono: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contador Color — Inicio</label>
                      <input type="number" min={0} value={volForm.inicio_color}
                        onChange={e => setVolForm(p => ({ ...p, inicio_color: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contador Color — Fin</label>
                      <input type="number" min={0} value={volForm.fin_color}
                        onChange={e => setVolForm(p => ({ ...p, fin_color: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                  </div>

                  {/* Preview del total calculado */}
                  <div className="flex items-center gap-3 text-xs text-indigo-700 font-medium bg-indigo-100 rounded-lg p-2">
                    <span>Total Mono: <strong>{Math.max(volForm.fin_mono - volForm.inicio_mono, 0).toLocaleString()}</strong></span>
                    <span>·</span>
                    <span>Total Color: <strong>{Math.max(volForm.fin_color - volForm.inicio_color, 0).toLocaleString()}</strong></span>
                    <span>·</span>
                    <span>Total: <strong>{(Math.max(volForm.fin_mono - volForm.inicio_mono, 0) + Math.max(volForm.fin_color - volForm.inicio_color, 0)).toLocaleString()}</strong></span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Observación</label>
                    <input type="text" value={volForm.observacion} onChange={e => setVolForm(p => ({ ...p, observacion: e.target.value }))}
                      placeholder="Notas..."
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>

                  {volError && <p className="text-xs text-red-600">{volError}</p>}

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setShowVolForm(false); setVolError(null); }}
                      className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                    <button type="submit" disabled={savingVol}
                      className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {savingVol ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              )}

              {/* Tabla de lecturas */}
              {loadingData ? (
                <div className="text-center py-6 text-gray-400 text-sm">Cargando...</div>
              ) : volumetrias.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Sin lecturas registradas.</div>
              ) : (
                <div className="space-y-2">
                  {/* KPIs: fila 1 — Totales */}
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    {[
                      { label: 'Total Mono', value: volumetrias.reduce((s, v) => s + v.total_mono, 0).toLocaleString(), sub: 'páginas' },
                      { label: 'Total Color', value: volumetrias.reduce((s, v) => s + v.total_color, 0).toLocaleString(), sub: 'páginas' },
                      { label: 'Total Páginas', value: volumetrias.reduce((s, v) => s + v.total_pages, 0).toLocaleString(), sub: 'acumulado' },
                    ].map(kpi => (
                      <div key={kpi.label} className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
                        <p className="text-xs text-indigo-400">{kpi.label}</p>
                        <p className="text-xl font-bold text-indigo-700 mt-0.5">{kpi.value}</p>
                        <p className="text-xs text-indigo-300">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                  {/* KPIs: fila 2 — Estadísticas */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                      <p className="text-xs text-violet-400">Promedio Mensual</p>
                      <p className="text-xl font-bold text-violet-700 mt-0.5">
                        {volumetrias.length > 0
                          ? Math.round(volumetrias.reduce((s, v) => s + v.total_pages, 0) / volumetrias.length).toLocaleString()
                          : '—'}
                      </p>
                      <p className="text-xs text-violet-300">págs / período</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 text-center border border-teal-100">
                      <p className="text-xs text-teal-400">Meses con Lectura</p>
                      <p className="text-xl font-bold text-teal-700 mt-0.5">{volumetrias.length}</p>
                      <p className="text-xs text-teal-300">períodos registrados</p>
                    </div>
                  </div>

                  {/* Filas por período */}
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Período</th>
                          <th className="px-3 py-2 text-right">Mono</th>
                          <th className="px-3 py-2 text-right">Color</th>
                          <th className="px-3 py-2 text-right font-bold">Total</th>
                          <th className="px-3 py-2 text-left">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volumetrias.map(v => (
                          <tr key={v.id_volumetria} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                              {fmtDate(v.fecha_inicio)} → {fmtDate(v.fecha_fin)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{v.total_mono.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono">{v.total_color.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">{v.total_pages.toLocaleString()}</td>
                            <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{v.observacion ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function PrintersPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();

  const [impresoras, setImpresoras] = useState<Impresora[]>([]);
  const [clientesOptions, setClientesOptions] = useState<ClienteOption[]>([]);
  const [modelosOptions, setModelosOptions] = useState<ModeloOption[]>([]);
  const [admOptions, setAdmOptions] = useState<AdmOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImpresora, setSelectedImpresora] = useState<Impresora | null>(null);

  // Modal Alta
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentImpresora, setCurrentImpresora] = useState<Omit<Impresora, 'created_date' | 'cliente_nombre' | 'modelo_nombre' | 'adm_nombre'>>({
    serie: '', id_cliente: null, id_modelo: null,
    departamento: '', provincia: '', distrito: '', direccion: '',
    nombre_contacto: '', numero_contacto: '', dia_corte: null, estado: 'produccion',
  });

  // Filtros
  const [searchSerie, setSearchSerie] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [searchEstado, setSearchEstado] = useState('');

  const canEdit = hasAccess(['master', 'adm']);

  useEffect(() => {
    if (!authLoading && !profile) router.push('/login');
    if (!authLoading && profile && !canEdit) router.push('/dashboard');
  }, [authLoading, profile, canEdit, router]);

  const fetchData = useCallback(async () => {
    if (!canEdit) return;
    setDataLoading(true);
    setError(null);

    const [
      { data: impresorasData, error: impErr },
      { data: clientesData, error: cliErr },
      { data: admData, error: admErr },
      { data: modelosData, error: modErr },
    ] = await Promise.all([
      // Usar la vista que filtra estado IN ('produccion','backup') y id_cliente IS NOT NULL
      supabase.from('v_impresoras_en_cliente')
        .select('serie, id_cliente, id_modelo, estado, departamento, provincia, distrito, direccion, nombre_contacto, numero_contacto, created_date, modelo')
        .order('serie'),
      supabase.from('clientes').select('id_cliente, nombre_especifico, id_adm, dia_corte').order('nombre_especifico'),
      supabase.from('adm').select('id_adm, nombre').order('nombre'),
      supabase.from('modelo').select('id_modelo, nombre').order('nombre'),
    ]);

    if (impErr || cliErr || admErr || modErr) {
      setError('Error al cargar datos.');
      setDataLoading(false);
      return;
    }

    setClientesOptions(clientesData || []);
    setAdmOptions(admData || []);
    setModelosOptions(modelosData || []);

    const mapped: Impresora[] = (impresorasData || []).map((imp: any) => {
      const cliente = clientesData?.find(c => c.id_cliente === imp.id_cliente);
      const adm = admData?.find(a => a.id_adm === cliente?.id_adm);
      // modelo ya viene de la vista; fallback a modelosData
      const modeloNombre = imp.modelo ?? modelosData?.find(m => m.id_modelo === imp.id_modelo)?.nombre ?? null;
      return {
        ...imp,
        cliente_nombre: cliente?.nombre_especifico ?? null,
        modelo_nombre: modeloNombre,
        adm_nombre: adm?.nombre ?? null,
        dia_corte: cliente?.dia_corte ?? null,
      };
    });

    setImpresoras(mapped);
    setDataLoading(false);
  }, [canEdit]);

  useEffect(() => {
    if (!authLoading && profile && canEdit) fetchData();
  }, [authLoading, profile, canEdit, fetchData]);

  const filteredImpresoras = useMemo(() =>
    impresoras.filter(imp => {
      const mSerie = !searchSerie || imp.serie.toLowerCase().includes(searchSerie.toLowerCase());
      const mCliente = !searchCliente || (imp.cliente_nombre ?? '').toLowerCase().includes(searchCliente.toLowerCase());
      const mEstado = !searchEstado || imp.estado === searchEstado;
      return mSerie && mCliente && mEstado;
    }),
    [searchSerie, searchCliente, searchEstado, impresoras]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataLoading(true);
    const payload = {
      serie: currentImpresora.serie,
      id_cliente: currentImpresora.id_cliente,
      id_modelo: currentImpresora.id_modelo,
      departamento: currentImpresora.departamento || null,
      provincia: currentImpresora.provincia || null,
      distrito: currentImpresora.distrito || null,
      direccion: currentImpresora.direccion || null,
      nombre_contacto: currentImpresora.nombre_contacto || null,
      numero_contacto: currentImpresora.numero_contacto || null,
    };

    const { error: saveErr } = isEditing
      ? await supabase.from('impresora').update(payload).eq('serie', currentImpresora.serie)
      : await supabase.from('impresora').insert([payload]);

    if (saveErr) {
      setError(saveErr.code === '23505' ? `La serie "${currentImpresora.serie}" ya está registrada.` : saveErr.message);
    } else {
      setIsModalOpen(false);
      await fetchData();
    }
    setDataLoading(false);
  };

  const openCreate = () => {
    setIsEditing(false);
    setCurrentImpresora({ serie: '', id_cliente: null, id_modelo: null, departamento: '', provincia: '', distrito: '', direccion: '', nombre_contacto: '', numero_contacto: '', dia_corte: null, estado: 'produccion' });
    setIsModalOpen(true);
  };

  const openEdit = (imp: Impresora) => {
    setIsEditing(true);
    setCurrentImpresora({ serie: imp.serie, id_cliente: imp.id_cliente, id_modelo: imp.id_modelo, departamento: imp.departamento || '', provincia: imp.provincia || '', distrito: imp.distrito || '', direccion: imp.direccion || '', nombre_contacto: imp.nombre_contacto || '', numero_contacto: imp.numero_contacto || '', dia_corte: imp.dia_corte, estado: imp.estado });
    setIsModalOpen(true);
  };

  if (authLoading || dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando impresoras...</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="p-6 space-y-5">
      {/* Ficha overlay */}
      {selectedImpresora && (
        <FichaImpresora impresora={selectedImpresora} onClose={() => setSelectedImpresora(null)} />
      )}

      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Printer className="w-6 h-6 text-indigo-600" /> Gestión de Impresoras
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{impresoras.length} equipo(s) registrados</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shadow">
          <Plus className="w-4 h-4" /> Nueva Impresora
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Buscar serie..." value={searchSerie} onChange={e => setSearchSerie(e.target.value)}
            className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Buscar cliente..." value={searchCliente} onChange={e => setSearchCliente(e.target.value)}
            className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <select value={searchEstado} onChange={e => setSearchEstado(e.target.value)}
          className="py-2 px-3 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">Todos los estados</option>
          <option value="produccion">Producción</option>
          <option value="backup">Backup</option>
        </select>
        {(searchSerie || searchCliente || searchEstado) && (
          <button onClick={() => { setSearchSerie(''); setSearchCliente(''); setSearchEstado(''); }} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
        <div className="flex-1" />
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:text-indigo-600 hover:bg-gray-100 transition">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow overflow-x-auto">
        <table className="min-w-full text-sm text-left text-gray-700">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
            <tr>
              <th className="px-4 py-3">Serie</th>
              <th className="px-4 py-3">Modelo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">ADM</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Registro</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredImpresoras.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay impresoras.</td></tr>
            ) : (
              filteredImpresoras.map(imp => (
                <tr key={imp.serie}
                  className="border-t hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedImpresora(imp)}
                >
                  <td className="px-4 py-3 font-mono font-bold text-indigo-700">{imp.serie}</td>
                  <td className="px-4 py-3">{imp.modelo_nombre ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${imp.estado === 'produccion' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                      {imp.estado === 'produccion' ? 'Producción' : 'Backup'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{imp.cliente_nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{imp.adm_nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{[imp.provincia, imp.departamento].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{imp.nombre_contacto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(imp.created_date)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(imp)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition">
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal Alta/Edición ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-800">
                {isEditing ? `Editar: ${currentImpresora.serie}` : 'Nueva Impresora'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-500 border-b pb-1">Datos del Activo</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
                  <input type="text" value={currentImpresora.serie}
                    onChange={e => setCurrentImpresora(c => ({ ...c, serie: e.target.value }))}
                    required disabled={isEditing}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isEditing ? 'bg-gray-100' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cliente *</label>
                  <select value={currentImpresora.id_cliente ?? ''} onChange={e => setCurrentImpresora(c => ({ ...c, id_cliente: e.target.value ? parseInt(e.target.value) : null }))} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Selecciona cliente</option>
                    {clientesOptions.map(c => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_especifico}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Modelo *</label>
                  <select value={currentImpresora.id_modelo ?? ''} onChange={e => setCurrentImpresora(c => ({ ...c, id_modelo: e.target.value ? parseInt(e.target.value) : null }))} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Selecciona modelo</option>
                    {modelosOptions.map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
                  <input type="text" value={currentImpresora.departamento || ''}
                    onChange={e => setCurrentImpresora(c => ({ ...c, departamento: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-500 border-b pb-1">Ubicación y Contacto</h4>
                {(['provincia', 'distrito', 'direccion', 'nombre_contacto', 'numero_contacto'] as const).map(key => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{key.replace('_', ' ')}</label>
                    <input type="text" value={(currentImpresora as any)[key] || ''}
                      onChange={e => setCurrentImpresora(c => ({ ...c, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                ))}
              </div>

              <div className="col-span-2 flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{isEditing ? 'Actualizar' : 'Registrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
