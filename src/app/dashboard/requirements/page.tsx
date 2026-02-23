'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import { RequerimientoTable } from '@/components/RequerimientoTable';
import { RequerimientoHistoricoTable } from '@/components/RequerimientoHistoricoTable';
import { RequerimientoAprobadoTable } from '@/components/RequerimientoAprobado';
import { RepartoTable, RepartoRow } from '@/components/RepartoTable';
import { NuevoRequerimientoModal } from '@/components/NuevoRequerimientoModal';
import { Loader } from '@/components/Loader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Truck, RefreshCw, Search, X } from 'lucide-react';

type TabType = 'activo' | 'historico' | 'aprobado' | 'guiados';

export default function RequirementsPage() {
  const { profile, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOperador = profile?.role === 'operador';

  const [activeTab, setActiveTab] = useState<TabType>(isOperador ? 'historico' : 'activo');
  // Filtros del tab Activos
  const [activoSerieFilter, setActivoSerieFilter] = useState('');
  const [activoClienteFilter, setActivoClienteFilter] = useState('');
  // Filtros del tab Histórico
  const [serieFilter, setSerieFilter] = useState('');
  const [clienteFilter, setClienteFilter] = useState('');
  const [guiaFilter, setGuiaFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  // ─── Carga única de datos ──────────────────────────────────────────────────
  // Todos los tabs comparten el mismo dataset. `loadRows` es el único onRefresh.
  // Así cualquier cambio de estado se refleja en TODOS los tabs simultáneamente.
  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [{ data: activos, error: errActivos }, { data: historicos, error: errHist }] =
        await Promise.all([
          // Todos los requerimientos activos (todas las tablas los necesitan)
          supabase.from('requerimiento').select(`
            id_requerimiento,
            serie_impresora,
            id_cliente,
            cod_sku,
            sku_default,
            cantidad_solicitada,
            estado,
            guia,
            porcentaje,
            dias_restantes,
            fecha_solicitud,
            fecha_atencion,
            fecha_instalacion,
            creado_por,
            observacion,
            timestamp_registro,
            nombre_contacto,
            numero_contacto,
            departamento,
            provincia,
            distrito,
            direccion,
            clientes (nombre_especifico),
            impresora (id_modelo, direccion, provincia, modelo:modelo (nombre))
          `),

          // Histórico
          supabase.from('requerimiento_historico').select(`
            id_historico,
            id_requerimiento,
            serie_impresora,
            id_cliente,
            cod_sku,
            sku_default,
            cantidad_solicitada,
            estado,
            guia,
            porcentaje,
            dias_restantes,
            fecha_solicitud,
            fecha_atencion,
            fecha_instalacion,
            creado_por,
            observacion,
            timestamp_registro,
            timestamp_archivado,
            nombre_contacto,
            numero_contacto,
            departamento,
            provincia,
            distrito,
            direccion,
            coment,
            clientes (nombre_especifico)
          `)
            .order('timestamp_registro', { ascending: false })
            .limit(100),
        ]);

      if (errActivos || errHist) throw errActivos || errHist;

      const activosMapped = (activos || []).map((r) => ({ ...r, fuente: 'activo' as const }));
      const historicosMapped = (historicos || []).map((r) => ({
        ...r,
        fuente: 'historico' as const,
        // Supabase devuelve el join como array — tomamos el primer elemento
        clientes: Array.isArray(r.clientes) ? r.clientes[0] ?? null : (r.clientes ?? null),
        impresora: null,
      }));

      setRows([...activosMapped, ...historicosMapped]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al cargar los requerimientos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  if (roleLoading || loading) return <Loader />;
  if (error) return <ErrorMessage message={error} />;

  // ─── Derivar datos por tab desde el mismo dataset ──────────────────────────
  const activosRows = rows.filter((r) => r.fuente === 'activo');
  const historicosRows = rows.filter((r) => r.fuente === 'historico');

  // Activos: todos los requerimientos en la tabla `requerimiento`, con filtros opcionales
  const activosPuros = activosRows.filter((r) => {
    const nombreCliente = r.clientes?.nombre_especifico ?? r.clientes?.[0]?.nombre_especifico ?? '';
    const matchSerie = !activoSerieFilter || r.serie_impresora?.toLowerCase().includes(activoSerieFilter.toLowerCase());
    const matchCliente = !activoClienteFilter || nombreCliente.toLowerCase().includes(activoClienteFilter.toLowerCase());
    return matchSerie && matchCliente;
  });

  // Aprobados: estado='aprobado' — RequerimientoAprobadoTable también filtra internamente
  // Le pasamos todos los activos para que funcione aunque el estado cambie entre renders

  // Guiados pendientes: activos CON guía asignada (cualquier estado)
  const guiadosPendientes: RepartoRow[] = activosRows
    .filter((r) => r.guia && r.guia.trim() !== '')
    .map((r) => ({
      id_requerimiento: r.id_requerimiento,
      serie_impresora: r.serie_impresora,
      id_cliente: r.id_cliente,
      cod_sku: r.cod_sku,
      estado: r.estado,
      guia: r.guia,
      fecha_atencion: r.fecha_atencion,
      nombre_contacto: r.nombre_contacto,
      numero_contacto: r.numero_contacto,
      departamento: r.departamento,
      provincia: r.provincia,
      direccion: r.direccion,
      clientes: Array.isArray(r.clientes) ? r.clientes[0] ?? null : r.clientes,
      impresora: Array.isArray(r.impresora) ? r.impresora[0] ?? null : r.impresora,
      fuente: 'activo' as const,
    }));

  // Guiados atendidos: del histórico que tengan guía
  const guiadosAtendidos: RepartoRow[] = historicosRows
    .filter((r) => r.guia && r.guia.trim() !== '')
    .map((r) => ({
      id_historico: r.id_historico,
      id_requerimiento: r.id_requerimiento,
      serie_impresora: r.serie_impresora,
      id_cliente: r.id_cliente,
      cod_sku: r.cod_sku,
      estado: r.estado,
      guia: r.guia,
      fecha_atencion: r.fecha_atencion,
      nombre_contacto: r.nombre_contacto,
      numero_contacto: r.numero_contacto,
      departamento: r.departamento,
      provincia: r.provincia,
      direccion: r.direccion,
      clientes: null,
      impresora: null,
      fuente: 'historico' as const,
    }));

  // Histórico: filtros combinados (serie + cliente por nombre + guía) aplicados con AND
  const filteredHistorico = historicosRows.filter((r) => {
    const nombreCliente = (r as any).clientes?.nombre_especifico ?? '';
    const matchSerie = !serieFilter || r.serie_impresora?.toLowerCase().includes(serieFilter.toLowerCase());
    const matchCliente = !clienteFilter || nombreCliente.toLowerCase().includes(clienteFilter.toLowerCase());
    const matchGuia = !guiaFilter || r.guia?.toLowerCase().includes(guiaFilter.toLowerCase());
    return matchSerie && matchCliente && matchGuia;
  });

  return (
    <div className="p-4 space-y-4 relative">
      <h1 className="text-2xl font-bold text-gray-800">Gestión de Requerimientos</h1>

      {/* Botón visible para todos los roles */}
      <button
        onClick={() => setShowModal(true)}
        className="absolute top-4 right-4 flex items-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-all"
      >
        <Plus className="w-4 h-4 mr-2" /> Nuevo Requerimiento
      </button>

      <Tabs defaultValue={isOperador ? 'historico' : activeTab}>
        <TabsList>
          {/* Activos — solo para roles distintos de operador */}
          {!isOperador && (
            <TabsTrigger value="activo" onClick={() => setActiveTab('activo')}>
              Activos
              {activosPuros.length > 0 && (
                <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">
                  {activosPuros.length}
                </span>
              )}
            </TabsTrigger>
          )}

          {!isOperador && (
            <TabsTrigger value="aprobado" onClick={() => setActiveTab('aprobado')}>
              Aprobados
            </TabsTrigger>
          )}

          {!isOperador && (
            <TabsTrigger
              value="guiados"
              onClick={() => setActiveTab('guiados')}
              className="flex items-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" />
              Guiados
              {guiadosPendientes.length > 0 && (
                <span className="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">
                  {guiadosPendientes.length}
                </span>
              )}
            </TabsTrigger>
          )}

          {/* Histórico — visible para todos */}
          <TabsTrigger value="historico" onClick={() => setActiveTab('historico')}>
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ── Activos ─────────────────────────────────────────────────────── */}
        <TabsContent value="activo" className="mt-4">
          {/* Barra de búsqueda y acciones */}
          <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
            {/* Campo: Cliente */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={activoClienteFilter}
                onChange={(e) => setActivoClienteFilter(e.target.value)}
                className="pl-9 pr-3 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
              {activoClienteFilter && (
                <button onClick={() => setActivoClienteFilter('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Campo: Serie */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar serie..."
                value={activoSerieFilter}
                onChange={(e) => setActivoSerieFilter(e.target.value)}
                className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
              {activoSerieFilter && (
                <button onClick={() => setActivoSerieFilter('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Separador */}
            <div className="flex-1" />

            {/* Botón Refrescar */}
            <button
              onClick={loadRows}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 hover:text-blue-600 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
          </div>
          <RequerimientoTable
            rows={activosPuros}
            onRefresh={loadRows}
            user={profile}
            editable
          />
        </TabsContent>

        {/* ── Aprobados — asignación de guía ──────────────────────────────── */}
        <TabsContent value="aprobado" className="mt-4">
          {/* Pasa TODOS los activos; el componente filtra internamente por estado='aprobado' */}
          <RequerimientoAprobadoTable rows={activosRows} onRefresh={loadRows} />
        </TabsContent>

        {/* ── Guiados — área de reparto ────────────────────────────────────── */}
        <TabsContent value="guiados" className="mt-4">
          <RepartoTable
            pendingRows={guiadosPendientes}
            attendedRows={guiadosAtendidos}
            onRefresh={loadRows}
          />
        </TabsContent>

        {/* ── Histórico ────────────────────────────────────────────────────── */}
        <TabsContent value="historico" className="mt-4">
          {/* Barra de búsqueda y acciones */}
          <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
            {/* Campo: Serie */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar serie..."
                value={serieFilter}
                onChange={(e) => setSerieFilter(e.target.value)}
                className="pl-9 pr-3 py-2 w-44 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
              {serieFilter && (
                <button onClick={() => setSerieFilter('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Campo: Cliente */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={clienteFilter}
                onChange={(e) => setClienteFilter(e.target.value)}
                className="pl-9 pr-3 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
              {clienteFilter && (
                <button onClick={() => setClienteFilter('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Campo: Guía */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar guía..."
                value={guiaFilter}
                onChange={(e) => setGuiaFilter(e.target.value)}
                className="pl-9 pr-3 py-2 w-40 text-sm bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
              {guiaFilter && (
                <button onClick={() => setGuiaFilter('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Separador */}
            <div className="flex-1" />

            {/* Botón Actualizar */}
            <button
              onClick={loadRows}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 hover:text-blue-600 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
          </div>
          <RequerimientoHistoricoTable
            rows={filteredHistorico}
            onRefresh={loadRows}
            user={profile}
          />
        </TabsContent>
      </Tabs>

      <NuevoRequerimientoModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={loadRows}
        userId={profile?.id}
      />
    </div>
  );
}