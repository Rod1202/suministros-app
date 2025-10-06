'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import { RequerimientoTable } from '@/components/RequerimientoTable';
// #################### IMPORTAR EL NUEVO COMPONENTE ####################
import { RequerimientoHistoricoTable } from '@/components/RequerimientoHistoricoTable';
import { RequerimientoAprobadoTable } from '@/components/RequerimientoAprobado';
// #################### FIN IMPORTACIÓN ####################
import { Loader } from '@/components/Loader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';

export default function RequirementsPage() {
  const { profile, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'activo' | 'historico' | 'aprobado'>('activo');
  const [serieFilter, setSerieFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Estados del modal
  const [clientes, setClientes] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | null>(null);
  const [serieSeleccionada, setSerieSeleccionada] = useState<string | null>(null);
  const [skuSeleccionado, setSkuSeleccionado] = useState<string | null>(null);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroSerie, setFiltroSerie] = useState('');
  const [filtroSku, setFiltroSku] = useState('');

  // Estados de bloqueo
  const [clienteBloqueado, setClienteBloqueado] = useState(false);
  const [serieBloqueada, setSerieBloqueada] = useState(false);

  // Estado para controlar si el desplegable de SKU está abierto
  const [skuDropdownOpen, setSkuDropdownOpen] = useState(false);

  // Estados para los nuevos campos
  const [fechaInstalacion, setFechaInstalacion] = useState('');
  const [fechaError, setFechaError] = useState('');

  // 🔹 Cargar requerimientos
  // 🔹 Cargar requerimientos (activos + histórico unificados)
  const loadRows = useCallback(async () => {
  try {
    setLoading(true);
    setError(null);
    
    // #################### REEMPLAZAR EL RPC POR QUERIES DIRECTAS ####################
    const [{ data: activos, error: errActivos }, { data: historicos, error: errHist }] =
      await Promise.all([
        supabase.from('requerimiento').select(`
          id_requerimiento,
          serie_impresora,
          id_cliente,
          cod_sku,
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
        supabase.from('requerimiento_historico').select(`
          id_historico,
          id_requerimiento,
          serie_impresora,
          id_cliente,
          cod_sku,
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
          direccion
        `)
        .order('timestamp_registro', { ascending: false })
        .limit(100),
      ]);

    if (errActivos || errHist) throw errActivos || errHist;

    const activosMapped = (activos || []).map((r) => ({ ...r, fuente: 'activo' }));
    const historicosMapped = (historicos || []).map((r) => ({
      ...r,
      fuente: 'historico' as const,
      clientes: null,
      impresora: null 
    }));

    setRows([...activosMapped, ...historicosMapped]);
    // #################### FIN REEMPLAZO ####################
  } catch (err: any) {
    console.error(err);
    setError(err.message || 'Error al cargar los requerimientos.');
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // ✅ Cargar clientes
  useEffect(() => {
    const fetchClientes = async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente, nombre_especifico')
        .order('nombre_especifico', { ascending: true });
      if (!error) setClientes(data || []);
      else console.error('Error fetchClientes:', error);
    };
    fetchClientes();
  }, []);

  // 🔹 Cargar series según cliente
  useEffect(() => {
    if (!clienteSeleccionado) {
      setSeries([]);
      setFiltroSerie('');
      setSerieSeleccionada(null);
      return;
    }
    const fetchSeries = async () => {
      const { data, error } = await supabase
        .from('impresora')
        .select('serie, id_modelo')
        .eq('id_cliente', clienteSeleccionado)
        .order('serie', { ascending: true });
      if (!error) setSeries(data || []);
      else console.error('Error fetchSeries:', error);
    };
    fetchSeries();
  }, [clienteSeleccionado]);

  // 🔹 Cargar SKUs según compatibilidad del modelo
  useEffect(() => {
    if (!serieSeleccionada) {
      setSkus([]);
      return;
    }

    const fetchSkus = async () => {
      const { data: imp, error: errImp } = await supabase
        .from('impresora')
        .select('id_modelo')
        .eq('serie', serieSeleccionada)
        .single();

      if (errImp || !imp?.id_modelo) {
        console.error('Error modelo:', errImp);
        setSkus([]);
        return;
      }

      const { data, error } = await supabase
        .from('compatibilidad')
        .select(`
          cod_sku,
          sku (
            nombre,
            id_color,
            color:color(nombre)
          )
        `)
        .eq('id_modelo', imp.id_modelo);

      if (error) {
        console.error('Error fetchSkus:', error);
        setSkus([]);
      } else {
        const mapped = (data || []).map((item: any) => ({
          cod_sku: item.cod_sku,
          nombre: item.sku?.nombre || '',
          color: item.sku?.color?.nombre || '',
        }));
        setSkus(mapped);
      }
    };

    fetchSkus();
  }, [serieSeleccionada]);

  // Función para validar y convertir fecha dd/mm/yyyy a formato ISO
  const validarYConvertirFecha = (fechaStr: string): string | null => {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = fechaStr.match(regex);
    
    if (!match) {
      setFechaError('Formato inválido. Use dd/mm/yyyy');
      return null;
    }

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const año = parseInt(match[3], 10);

    // Validar rangos
    if (mes < 1 || mes > 12) {
      setFechaError('Mes inválido (1-12)');
      return null;
    }

    if (dia < 1 || dia > 31) {
      setFechaError('Día inválido (1-31)');
      return null;
    }

    // Validar días según el mes
    const diasPorMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Año bisiesto
    if (mes === 2 && ((año % 4 === 0 && año % 100 !== 0) || año % 400 === 0)) {
      diasPorMes[1] = 29;
    }

    if (dia > diasPorMes[mes - 1]) {
      setFechaError(`Día inválido para ${mes}/${año}`);
      return null;
    }

    setFechaError('');
    
    // Convertir a formato ISO (YYYY-MM-DD)
    return `${año}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
  };

  // Función para manejar el cambio de fecha con formato
  const handleFechaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ''); // Solo números
    
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2);
    }
    if (value.length >= 5) {
      value = value.slice(0, 5) + '/' + value.slice(5, 9);
    }
    
    setFechaInstalacion(value);
    
    // Validar solo si tiene el formato completo
    if (value.length === 10) {
      validarYConvertirFecha(value);
    } else {
      setFechaError('');
    }
  };

  // 🔹 Reiniciar formulario del modal
  const resetModalForm = () => {
    setFiltroCliente('');
    setClienteSeleccionado(null);
    setClienteBloqueado(false);
    setFiltroSerie('');
    setSerieSeleccionada(null);
    setSerieBloqueada(false);
    setFiltroSku('');
    setSkuSeleccionado(null);
    setSkus([]);
    setSeries([]);
    setSkuDropdownOpen(false);
    setFechaInstalacion('');
    setFechaError('');
  };

  // 🔹 Controlar apertura/cierre del modal (limpieza total)
  const handleModalToggle = (open: boolean) => {
    setShowModal(open);
    if (open) {
      resetModalForm();
    }
  };

  if (roleLoading || loading) return <Loader />;
  if (error) return <ErrorMessage message={error} />;

  const filteredRows = rows.filter((r) => r.fuente === activeTab);

  // #################### FILTRAR HISTÓRICO POR SERIE ####################
  const filteredHistorico = serieFilter
    ? filteredRows.filter((r) =>
        r.serie_impresora?.toLowerCase().includes(serieFilter.toLowerCase())
      )
    : filteredRows;
  // #################### FIN FILTRADO ####################

  return (
    <div className="p-4 space-y-4 relative">
      <h1 className="text-2xl font-bold text-gray-800">Gestión de Requerimientos</h1>

      <button
        onClick={() => handleModalToggle(true)}
        className="absolute top-4 right-4 flex items-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-all"
      >
        <Plus className="w-4 h-4 mr-2" /> Nuevo Requerimiento
      </button>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="activo" onClick={() => setActiveTab('activo')}>
            Activos
          </TabsTrigger>
          <TabsTrigger value="historico" onClick={() => setActiveTab('historico')}>
            Histórico
          </TabsTrigger>
          <TabsTrigger value="aprobado" onClick={() => setActiveTab('aprobado')}>
            Aprobados
          </TabsTrigger> 
        </TabsList>

        <TabsContent value="activo" className="mt-4">
          <RequerimientoTable rows={filteredRows} onRefresh={loadRows} user={profile} editable />
        </TabsContent>

        {/* #################### CAMBIO: USAR COMPONENTE HISTÓRICO #################### */}
        <TabsContent value="historico" className="mt-4">
          <input
            type="text"
            placeholder="Filtrar por serie..."
            value={serieFilter}
            onChange={(e) => setSerieFilter(e.target.value)}
            className="border rounded p-2 w-64 mb-4"
          />
          <RequerimientoHistoricoTable 
            rows={filteredHistorico} 
            onRefresh={loadRows} 
            user={profile} 
          />
        </TabsContent>
        <TabsContent value="aprobado" className="mt-4">
          <RequerimientoAprobadoTable rows={filteredHistorico} onRefresh={loadRows} />
        </TabsContent>
        {/* #################### FIN CAMBIO #################### */}
      </Tabs>

      {/* ----------------------- MODAL ----------------------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg relative">
            <h2 className="text-xl font-semibold mb-4">Nuevo Requerimiento</h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const porcentaje = parseInt((form.elements.namedItem('porcentaje') as HTMLInputElement).value);
                const diasRestantes = parseInt((form.elements.namedItem('dias_restantes') as HTMLInputElement).value);
                const obs = (form.elements.namedItem('observacion') as HTMLTextAreaElement).value;

                if (!clienteSeleccionado || !serieSeleccionada || !skuSeleccionado) {
                  alert('Completa todos los campos obligatorios.');
                  return;
                }

                // Validar fecha si fue ingresada
                let fechaISO = null;
                if (fechaInstalacion) {
                  fechaISO = validarYConvertirFecha(fechaInstalacion);
                  if (!fechaISO) {
                    alert('La fecha de instalación no es válida.');
                    return;
                  }
                }

                const { error } = await supabase.from('requerimiento').insert([
                  {
                    id_cliente: clienteSeleccionado,
                    serie_impresora: serieSeleccionada,
                    cod_sku: skuSeleccionado,
                    porcentaje: porcentaje,
                    dias_restantes: diasRestantes,
                    fecha_instalacion: fechaISO,
                    observacion: obs,
                    creado_por: profile?.id,
                  },
                ]);

                if (error) alert('Error al guardar: ' + error.message);
                else {
                  alert('Requerimiento creado exitosamente.');
                  handleModalToggle(false);
                  loadRows();
                }
              }}
            >
              {/* CLIENTE */}
              <label className="block mb-4 relative">
                Cliente:
                <input
                  type="text"
                  className="border rounded p-2 w-full mt-1 disabled:bg-gray-100"
                  placeholder="Buscar cliente..."
                  value={filtroCliente}
                  disabled={clienteBloqueado}
                  onFocus={() => setFiltroCliente('')}
                  onChange={(e) => {
                    setFiltroCliente(e.target.value);
                    setClienteSeleccionado(null);
                    setSerieSeleccionada(null);
                    setSkuSeleccionado(null);
                    setSkus([]);
                    setSeries([]);
                    setSerieBloqueada(false);
                  }}
                  autoComplete="off"
                />
                {!clienteBloqueado && clientes.length > 0 && filtroCliente && (
                  <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                    {clientes
                      .filter((c) =>
                        c.nombre_especifico.toLowerCase().includes(filtroCliente.toLowerCase())
                      )
                      .slice(0, 20)
                      .map((c) => (
                        <li
                          key={c.id_cliente}
                          onClick={() => {
                            setClienteSeleccionado(c.id_cliente);
                            setFiltroCliente(c.nombre_especifico);
                            setClienteBloqueado(true);
                            setSerieSeleccionada(null);
                            setSkuSeleccionado(null);
                            setSkus([]);
                            setSeries([]);
                          }}
                          className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
                        >
                          {c.nombre_especifico}
                        </li>
                      ))}
                  </ul>
                )}
              </label>

              {/* SERIE */}
              <label className="block mb-4 relative">
                Serie Impresora:
                <input
                  type="text"
                  className="border rounded p-2 w-full mt-1 disabled:bg-gray-100"
                  placeholder={!clienteSeleccionado ? 'Selecciona primero un cliente' : 'Buscar serie...'}
                  value={filtroSerie}
                  disabled={!clienteSeleccionado || serieBloqueada}
                  onFocus={() => setFiltroSerie('')}
                  onChange={(e) => setFiltroSerie(e.target.value)}
                  autoComplete="off"
                />
                {!serieBloqueada && series.length > 0 && filtroSerie && clienteSeleccionado && (
                  <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                    {series
                      .filter((s) => s.serie.toLowerCase().includes(filtroSerie.toLowerCase()))
                      .slice(0, 20)
                      .map((s) => (
                        <li
                          key={s.serie}
                          onClick={() => {
                            setSerieSeleccionada(s.serie);
                            setFiltroSerie(s.serie);
                            setSerieBloqueada(true);
                            setSkuSeleccionado(null);
                            setSkus([]);
                          }}
                          className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
                        >
                          {s.serie}
                        </li>
                      ))}
                  </ul>
                )}
              </label>

              {/* SKU */}
              <label className="block mb-4 relative">
                Código SKU:
                <input
                  type="text"
                  className="border rounded p-2 w-full mt-1 cursor-pointer"
                  placeholder={!serieSeleccionada ? 'Selecciona primero una serie' : 'Seleccionar SKU...'}
                  value={filtroSku}
                  disabled={!serieSeleccionada}
                  onClick={() => {
                    if (serieSeleccionada) {
                      setSkuDropdownOpen(!skuDropdownOpen);
                    }
                  }}
                  readOnly
                  autoComplete="off"
                />
                {skuDropdownOpen && skus.length > 0 && (
                  <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                    {skus.map((s) => (
                      <li
                        key={s.cod_sku}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSkuSeleccionado(s.cod_sku);
                          setFiltroSku(`${s.cod_sku} — ${s.color}`);
                          setSkuDropdownOpen(false);
                        }}
                        className="px-3 py-2 hover:bg-blue-100 cursor-pointer flex justify-between"
                      >
                        <span>{s.cod_sku}</span>
                        <span className="text-sm text-gray-600">{s.color}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </label>

              {/* PORCENTAJE */}
              <label className="block mb-4">
                Porcentaje:
                <input 
                  name="porcentaje" 
                  type="number" 
                  min={0} 
                  max={100} 
                  defaultValue={0} 
                  className="border rounded p-2 w-full mt-1" 
                  required 
                />
              </label>

              {/* DÍAS RESTANTES */}
              <label className="block mb-4">
                Días Restantes:
                <input 
                  name="dias_restantes" 
                  type="number" 
                  min={0} 
                  defaultValue={0} 
                  className="border rounded p-2 w-full mt-1" 
                  required 
                />
              </label>

              {/* FECHA INSTALACIÓN */}
              <label className="block mb-4">
                Fecha de Instalación (dd/mm/yyyy):
                <input 
                  type="text" 
                  value={fechaInstalacion}
                  onChange={handleFechaChange}
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  className={`border rounded p-2 w-full mt-1 ${fechaError ? 'border-red-500' : ''}`}
                />
                {fechaError && (
                  <span className="text-red-500 text-sm mt-1">{fechaError}</span>
                )}
              </label>

              {/* OBSERVACIÓN */}
              <label className="block mb-4">
                Observación:
                <textarea name="observacion" className="border rounded p-2 w-full mt-1" rows={3} />
              </label>

              {/* BOTONES */}
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={resetModalForm}
                  className="bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200"
                >
                  Reiniciar
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleModalToggle(false)}
                    className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}