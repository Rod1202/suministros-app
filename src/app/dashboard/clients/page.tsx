'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import {
  X, RefreshCw, Plus, FileText, DollarSign,
  Printer, ChevronRight, CheckCircle, Circle,
  AlertTriangle, Edit3, Trash2,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

interface Cliente {
  id_cliente: number;
  nombre_especifico: string;
  id_alias: number | null;
  alias_nombre: string | null;
  id_adm: number | null;
  adm_nombre: string | null;
  criticidad: 'Alto' | 'Medio' | 'Bajo';
  dia_corte: number | null;
  id_contrato_vigente: number | null;
  created_date: string;
}

interface Alias { id_alias: number; nombre: string; }
interface Adm { id_adm: number; nombre: string; telefono: string | null; }

interface Contrato {
  id_contrato: number;
  numero_contrato: string | null;
  modalidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  costo_clic_mono: number | null;
  costo_clic_color: number | null;
  numero_equipos: number | null;
  precio_base_alquiler: number | null;
  observacion: string | null;
}

interface Adenda {
  id_adenda: number;
  numero_adenda: string | null;
  modalidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  costo_clic_mono: number | null;
  costo_clic_color: number | null;
  numero_equipos: number | null;
  precio_base_alquiler: number | null;
}

// Para el tab de Documentos — se guarda en localStorage, se renueva por mes
interface EntregaDoc { id_cliente: number; entregado: boolean; }

type PageTab = 'clientes' | 'documentos';
type FichaTab = 'contrato' | 'adendas' | 'equipos';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const CRITICIDAD_COLORS: Record<string, string> = {
  Alto: 'bg-red-100 text-red-800',
  Medio: 'bg-yellow-100 text-yellow-800',
  Bajo: 'bg-green-100 text-green-800',
};

const MODALIDAD_COLORS: Record<string, string> = {
  alquiler: 'bg-blue-100 text-blue-700',
  venta: 'bg-purple-100 text-purple-700',
  comodato: 'bg-teal-100 text-teal-700',
};

/**
 * Devuelve la fecha de corte del mes actual para un dia_corte dado.
 * Si el día no existe en el mes (ej: dia_corte=31, feb) usa el último día del mes.
 */
function fechaCorteActual(diaCorte: number | null): string {
  if (!diaCorte) return '—';
  const hoy = new Date();
  const año = hoy.getFullYear();
  const mes = hoy.getMonth(); // 0-indexado
  // Último día del mes actual
  const ultimoDia = new Date(año, mes + 1, 0).getDate();
  const dia = Math.min(diaCorte, ultimoDia);
  const d = new Date(año, mes, dia);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function fmtCurrency(n: number | null) {
  if (n === null) return '—';
  return `S/ ${Number(n).toFixed(4)}`;
}

/** Clave para localStorage: "{año}-{mes}" */
function docStorageKey() {
  const h = new Date();
  return `doc_entrega_${h.getFullYear()}_${h.getMonth() + 1}`;
}

// ─────────────────────────────────────────────
// Componente Ficha Cliente (side panel)
// ─────────────────────────────────────────────

function FichaCliente({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const [tab, setTab] = useState<FichaTab>('contrato');
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [adendas, setAdendas] = useState<Adenda[]>([]);
  const [equiposCount, setEquiposCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [cRes, aRes, eRes] = await Promise.all([
        // Contrato vigente vía id_contrato_vigente del cliente
        cliente.id_contrato_vigente
          ? supabase.from('contrato')
            .select('id_contrato, numero_contrato, modalidad, fecha_inicio, fecha_fin, costo_clic_mono, costo_clic_color, numero_equipos, precio_base_alquiler, observacion')
            .eq('id_contrato', cliente.id_contrato_vigente)
            .single()
          : Promise.resolve({ data: null, error: null }),
        // Adendas del cliente
        supabase.from('adenda')
          .select('id_adenda, numero_adenda, modalidad, fecha_inicio, fecha_fin, costo_clic_mono, costo_clic_color, numero_equipos, precio_base_alquiler')
          .eq('id_cliente', cliente.id_cliente)
          .order('fecha_inicio', { ascending: false }),
        // Equipos registrados en inventario
        supabase.from('impresora')
          .select('serie', { count: 'exact', head: true })
          .eq('id_cliente', cliente.id_cliente),
      ]);
      setContrato(cRes.data as Contrato | null);
      setAdendas((aRes.data as Adenda[]) || []);
      setEquiposCount(eRes.count ?? 0);
      setLoading(false);
    };
    load();
  }, [cliente.id_cliente, cliente.id_contrato_vigente]);

  const TABS: { key: FichaTab; label: string; icon: React.ReactNode }[] = [
    { key: 'contrato', label: 'Contrato', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'adendas', label: 'Adendas', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'equipos', label: 'Equipos', icon: <Printer className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-end z-50">
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b bg-gradient-to-r from-indigo-600 to-blue-500 text-white">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition">
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{cliente.nombre_especifico}</p>
            <p className="text-xs text-indigo-100">{cliente.adm_nombre ?? 'Sin ADM'} · {cliente.alias_nombre ?? 'Sin alias'}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${CRITICIDAD_COLORS[cliente.criticidad] ?? 'bg-gray-100 text-gray-700'}`}>
            {cliente.criticidad}
          </span>
        </div>

        {/* Info rápida */}
        <div className="grid grid-cols-2 gap-3 p-4 border-b bg-gray-50 text-xs">
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Fecha de corte</p>
            <p className="font-semibold text-gray-700 mt-0.5">{fechaCorteActual(cliente.dia_corte)}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Equipos registrados</p>
            <p className="font-semibold text-indigo-700 mt-0.5 text-lg">{equiposCount ?? '…'}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Día de corte</p>
            <p className="font-semibold text-gray-700 mt-0.5">{cliente.dia_corte ? `Día ${cliente.dia_corte}` : '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Cliente desde</p>
            <p className="font-semibold text-gray-700 mt-0.5">{fmtDate(cliente.created_date.slice(0, 10))}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-white">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Contrato ── */}
              {tab === 'contrato' && (
                contrato ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {contrato.numero_contrato && (
                        <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                          #{contrato.numero_contrato}
                        </span>
                      )}
                      {contrato.modalidad && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${MODALIDAD_COLORS[contrato.modalidad] ?? 'bg-gray-100 text-gray-600'}`}>
                          {contrato.modalidad}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Clic Mono', value: fmtCurrency(contrato.costo_clic_mono), color: 'bg-slate-50' },
                        { label: 'Clic Color', value: fmtCurrency(contrato.costo_clic_color), color: 'bg-slate-50' },
                        { label: 'N° Equipos', value: contrato.numero_equipos?.toString() ?? '—', color: 'bg-indigo-50' },
                        { label: 'Alquiler Base', value: contrato.precio_base_alquiler ? `S/ ${Number(contrato.precio_base_alquiler).toFixed(2)}` : '—', color: 'bg-indigo-50' },
                        { label: 'Inicio Contrato', value: fmtDate(contrato.fecha_inicio), color: 'bg-gray-50' },
                        { label: 'Fin Contrato', value: fmtDate(contrato.fecha_fin), color: 'bg-gray-50' },
                      ].map(k => (
                        <div key={k.label} className={`${k.color} rounded-xl p-3 border border-gray-100`}>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">{k.label}</p>
                          <p className="text-sm font-bold text-gray-800 mt-0.5">{k.value}</p>
                        </div>
                      ))}
                    </div>

                    {contrato.observacion && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wide text-amber-500 mb-1">Observación</p>
                        <p className="text-xs text-amber-800">{contrato.observacion}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>Sin contrato vigente registrado.</p>
                  </div>
                )
              )}

              {/* ── Adendas ── */}
              {tab === 'adendas' && (
                adendas.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>Sin adendas registradas.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adendas.map(a => (
                      <div key={a.id_adenda} className="border border-gray-100 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          {a.numero_adenda && (
                            <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-1 rounded-full">#{a.numero_adenda}</span>
                          )}
                          {a.modalidad && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${MODALIDAD_COLORS[a.modalidad] ?? 'bg-gray-100 text-gray-600'}`}>{a.modalidad}</span>
                          )}
                          <span className="text-[10px] text-gray-400 ml-auto">{fmtDate(a.fecha_inicio)} → {fmtDate(a.fecha_fin)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-gray-400">Mono: </span><strong>{fmtCurrency(a.costo_clic_mono)}</strong></div>
                          <div><span className="text-gray-400">Color: </span><strong>{fmtCurrency(a.costo_clic_color)}</strong></div>
                          <div><span className="text-gray-400">Equipos: </span><strong>{a.numero_equipos ?? '—'}</strong></div>
                          <div><span className="text-gray-400">Alquiler: </span><strong>{a.precio_base_alquiler ? `S/ ${Number(a.precio_base_alquiler).toFixed(2)}` : '—'}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── Equipos ── */}
              {tab === 'equipos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-100">
                      <p className="text-xs text-indigo-400">Equipos en inventario</p>
                      <p className="text-4xl font-bold text-indigo-700 mt-1">{equiposCount ?? '—'}</p>
                      <p className="text-xs text-indigo-300 mt-1">impresoras registradas</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-4 text-center border border-teal-100">
                      <p className="text-xs text-teal-400">Según contrato</p>
                      <p className="text-4xl font-bold text-teal-700 mt-1">{contrato?.numero_equipos ?? '—'}</p>
                      <p className="text-xs text-teal-300 mt-1">equipos pactados</p>
                    </div>
                  </div>
                  {contrato && equiposCount !== null && contrato.numero_equipos !== null && (
                    <div className={`rounded-xl p-3 text-sm font-medium flex items-center gap-2 ${equiposCount >= contrato.numero_equipos ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {equiposCount >= contrato.numero_equipos
                        ? `Inventario completo (${equiposCount}/${contrato.numero_equipos})`
                        : `Faltan ${contrato.numero_equipos - equiposCount} equipo(s) por registrar`}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Página Principal
// ─────────────────────────────────────────────

const Criticidades: Array<Cliente['criticidad']> = ['Alto', 'Medio', 'Bajo'];

export default function ClientsPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();
  const canAccess = hasAccess(['master', 'especialista', 'adm']);

  // Datos
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [adms, setAdms] = useState<Adm[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs de la página
  const [pageTab, setPageTab] = useState<PageTab>('clientes');

  // Ficha lateral
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  // Modal alta/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCliente, setCurrentCliente] = useState<{
    id_cliente: number | null;
    nombre_especifico: string;
    id_alias: number | null;
    id_adm: number | null;
    criticidad: Cliente['criticidad'];
    dia_corte: number | null;
  }>({ id_cliente: null, nombre_especifico: '', id_alias: null, id_adm: null, criticidad: 'Bajo', dia_corte: null });

  // Gestión de documentos — persistida por mes en localStorage
  const [docsEntrega, setDocsEntrega] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!authLoading && !profile) router.push('/login');
    if (!authLoading && profile && !canAccess) router.push('/dashboard');
  }, [authLoading, profile, canAccess, router]);

  // Cargar entregas del mes desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(docStorageKey());
      if (raw) setDocsEntrega(JSON.parse(raw));
    } catch { /* ignorar */ }
  }, []);

  const saveDocEntrega = (id_cliente: number, entregado: boolean) => {
    const updated = { ...docsEntrega, [id_cliente]: entregado };
    setDocsEntrega(updated);
    localStorage.setItem(docStorageKey(), JSON.stringify(updated));
  };

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    if (!canAccess) return;
    setDataLoading(true);
    setError(null);

    const [
      { data: cliData, error: cliErr },
      { data: aliData, error: aliErr },
      { data: admData, error: admErr },
    ] = await Promise.all([
      supabase.from('clientes')
        .select('id_cliente, nombre_especifico, id_alias, id_adm, criticidad, dia_corte, id_contrato_vigente, created_date')
        .order('nombre_especifico'),
      supabase.from('alias').select('id_alias, nombre').order('nombre'),
      supabase.from('adm').select('id_adm, nombre, telefono').order('nombre'),
    ]);

    if (cliErr || aliErr || admErr) {
      setError('Error al cargar datos. Revisa las políticas RLS.');
      setDataLoading(false);
      return;
    }

    setAliases(aliData || []);
    setAdms(admData || []);

    const mapped: Cliente[] = (cliData || []).map(c => ({
      ...c,
      alias_nombre: aliData?.find(a => a.id_alias === c.id_alias)?.nombre ?? null,
      adm_nombre: admData?.find(a => a.id_adm === c.id_adm)?.nombre ?? null,
    }));
    setClientes(mapped);
    setDataLoading(false);
  }, [canAccess]);

  useEffect(() => {
    if (!authLoading && canAccess) fetchData();
  }, [authLoading, canAccess, fetchData]);

  // ── CRUD ──
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataLoading(true);
    const payload = {
      nombre_especifico: currentCliente.nombre_especifico,
      id_alias: currentCliente.id_alias,
      id_adm: currentCliente.id_adm,
      criticidad: currentCliente.criticidad,
      dia_corte: currentCliente.dia_corte,
    };
    const { error: saveErr } = isEditing && currentCliente.id_cliente
      ? await supabase.from('clientes').update(payload).eq('id_cliente', currentCliente.id_cliente)
      : await supabase.from('clientes').insert([payload]);

    if (saveErr) {
      setError(`Error al guardar: ${saveErr.message}`);
    } else {
      setIsModalOpen(false);
      await fetchData();
    }
    setDataLoading(false);
  };

  const handleDelete = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar el cliente: ${nombre}?`)) return;
    setDataLoading(true);
    const { error: delErr } = await supabase.from('clientes').delete().eq('id_cliente', id);
    if (delErr) setError(`Error al eliminar: ${delErr.message}`);
    else await fetchData();
    setDataLoading(false);
  };

  const openCreate = () => {
    setIsEditing(false);
    setCurrentCliente({ id_cliente: null, nombre_especifico: '', id_alias: null, id_adm: null, criticidad: 'Bajo', dia_corte: null });
    setIsModalOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setIsEditing(true);
    setCurrentCliente({ id_cliente: c.id_cliente, nombre_especifico: c.nombre_especifico, id_alias: c.id_alias, id_adm: c.id_adm, criticidad: c.criticidad, dia_corte: c.dia_corte });
    setIsModalOpen(true);
  };

  // Mes/año actual para mostrar en el tab de docs
  const mesActualStr = useMemo(() => {
    const h = new Date();
    return h.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  }, []);

  if (authLoading || (profile && !canAccess && !dataLoading)) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-indigo-600 font-semibold">Cargando...</div></div>;
  }
  if (!profile || !canAccess) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      {/* Encabezado */}
      <header className="flex justify-between items-center pb-5 border-b border-gray-200 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestión de Clientes</h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{mesActualStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={dataLoading} className="p-2 text-gray-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition">
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} disabled={dataLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Nuevo Cliente
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>
      )}

      {/* Tabs de página */}
      <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-sm w-fit">
        {([
          { key: 'clientes', label: 'Clientes' },
          { key: 'documentos', label: `Documentos — ${mesActualStr}` },
        ] as { key: PageTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setPageTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${pageTab === t.key ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Clientes ── */}
      {pageTab === 'clientes' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Cliente</th>
                <th className="px-5 py-3 text-left">ADM</th>
                <th className="px-5 py-3 text-left">Alias</th>
                <th className="px-5 py-3 text-left">Criticidad</th>
                <th className="px-5 py-3 text-left">Fecha de Corte</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dataLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Sin clientes registrados.</td></tr>
              ) : (
                clientes.map(c => (
                  <tr
                    key={c.id_cliente}
                    className="hover:bg-indigo-50/40 cursor-pointer transition"
                    onClick={() => setSelectedCliente(c)}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900 flex items-center gap-1.5">
                      {c.nombre_especifico}
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-300" />
                    </td>
                    <td className="px-5 py-3 text-gray-500">{c.adm_nombre ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{c.alias_nombre ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CRITICIDAD_COLORS[c.criticidad] ?? 'bg-gray-100 text-gray-600'}`}>
                        {c.criticidad}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 font-medium">
                      {c.dia_corte ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-indigo-600 font-bold">{fechaCorteActual(c.dia_corte)}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition" title="Editar">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(c.id_cliente, c.nombre_especifico)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Documentos ── */}
      {pageTab === 'documentos' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">Entrega de Documentos</p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">Período: {mesActualStr} · Se renueva automáticamente cada mes</p>
            </div>
            <div className="text-xs text-gray-400">
              {Object.values(docsEntrega).filter(Boolean).length} / {clientes.filter(c => c.dia_corte).length} pendientes
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Cliente</th>
                <th className="px-5 py-3 text-left">ADM</th>
                <th className="px-5 py-3 text-center">Fecha de Corte</th>
                <th className="px-5 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientes.filter(c => c.dia_corte !== null).length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sin clientes con fecha de corte configurada.</td></tr>
              ) : (
                clientes
                  .filter(c => c.dia_corte !== null)
                  .map(c => {
                    const entregado = docsEntrega[c.id_cliente] ?? false;
                    return (
                      <tr key={c.id_cliente} className={`transition ${entregado ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{c.nombre_especifico}</td>
                        <td className="px-5 py-3 text-gray-500">{c.adm_nombre ?? '—'}</td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-1 rounded-full">
                            {fechaCorteActual(c.dia_corte)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={() => saveDocEntrega(c.id_cliente, !entregado)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${entregado
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                          >
                            {entregado
                              ? <><CheckCircle className="w-3.5 h-3.5" /> Entregado</>
                              : <><Circle className="w-3.5 h-3.5" /> Pendiente</>}
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ficha lateral ── */}
      {selectedCliente && (
        <FichaCliente cliente={selectedCliente} onClose={() => setSelectedCliente(null)} />
      )}

      {/* ── Modal Alta/Edición ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600/70 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 mb-5">
              {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre específico *</label>
                <input type="text" required value={currentCliente.nombre_especifico}
                  onChange={e => setCurrentCliente(p => ({ ...p, nombre_especifico: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  placeholder="Ej: Empresa S.A.C." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alias</label>
                  <select value={currentCliente.id_alias ?? ''}
                    onChange={e => setCurrentCliente(p => ({ ...p, id_alias: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                    <option value="">Sin alias</option>
                    {aliases.map(a => <option key={a.id_alias} value={a.id_alias}>{a.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ADM</label>
                  <select value={currentCliente.id_adm ?? ''}
                    onChange={e => setCurrentCliente(p => ({ ...p, id_adm: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                    <option value="">Sin ADM</option>
                    {adms.map(a => <option key={a.id_adm} value={a.id_adm}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Criticidad</label>
                  <select value={currentCliente.criticidad}
                    onChange={e => setCurrentCliente(p => ({ ...p, criticidad: e.target.value as Cliente['criticidad'] }))}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                    {Criticidades.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día de corte (1-31)</label>
                  <input type="number" min={1} max={31}
                    value={currentCliente.dia_corte ?? ''}
                    onChange={e => setCurrentCliente(p => ({ ...p, dia_corte: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="Ej: 20"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={dataLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {dataLoading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
