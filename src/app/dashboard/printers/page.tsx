// src/app/dashboard/printers/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';

// 1. Definición de Tipos de Datos
interface Impresora {
  serie: string; // PRIMARY KEY
  id_cliente: number | null;
  cliente_nombre: string | null; // Para mostrar el nombre del cliente
  id_modelo: number | null;
  modelo_nombre: string | null; // Para mostrar el nombre del modelo
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  nombre_contacto: string | null;
  numero_contacto: string | null;
  created_date: string;
  adm_nombre?: string | null; // Nuevo campo ADM
}

interface ClienteOption {
  id_cliente: number;
  nombre_especifico: string;
  id_adm: number | null;
}

interface ModeloOption {
  id_modelo: number;
  nombre: string;
}

interface AdmOption {
  id_adm: number;
  nombre: string;
}

// 2. Componente Principal
export default function PrintersPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();

  // Estados
  const [impresoras, setImpresoras] = useState<Impresora[]>([]);
  const [clientesOptions, setClientesOptions] = useState<ClienteOption[]>([]);
  const [modelosOptions, setModelosOptions] = useState<ModeloOption[]>([]);
  const [admOptions, setAdmOptions] = useState<AdmOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentImpresora, setCurrentImpresora] = useState<Omit<Impresora, 'created_date' | 'cliente_nombre' | 'modelo_nombre' | 'adm_nombre'> & { serie: string }>({
    serie: '',
    id_cliente: null,
    id_modelo: null,
    departamento: '',
    provincia: '',
    distrito: '',
    direccion: '',
    nombre_contacto: '',
    numero_contacto: '',
  });

  const [searchSerie, setSearchSerie] = useState('');

  const canEdit = hasAccess(['master', 'adm']);

  // 3. Autenticación
  useEffect(() => {
    if (!authLoading && !profile) router.push('/login');
    if (!authLoading && profile && !canEdit) router.push('/dashboard');
  }, [authLoading, profile, canEdit, router]);

  // 4. Fetch Datos
  const fetchImpresorasData = useCallback(async () => {
    if (!canEdit) return;
    setDataLoading(true);
    setError(null);

    // Impresoras
    const { data: impresorasData, error: impresorasError } = await supabase
      .from('impresora')
      .select('serie, id_cliente, id_modelo, departamento, provincia, distrito, direccion, nombre_contacto, numero_contacto, created_date')
      .order('serie', { ascending: true });

    if (impresorasError) {
      console.error('Error fetching impresoras:', impresorasError);
      setError('Error al cargar la lista de impresoras.');
      setDataLoading(false);
      return;
    }

    // Clientes
    const { data: clientesData, error: clientesError } = await supabase
      .from('clientes')
      .select('id_cliente, nombre_especifico, id_adm')
      .order('nombre_especifico', { ascending: true });

    if (clientesError) {
      console.error('Error fetching clientes:', clientesError);
      setError('Error al cargar la lista de clientes.');
      setDataLoading(false);
      return;
    }

    // ADM
    const { data: admData, error: admError } = await supabase
      .from('adm')
      .select('id_adm, nombre')
      .order('nombre', { ascending: true });

    if (admError) {
      console.error('Error fetching ADM:', admError);
      setError('Error al cargar la lista de ADM.');
      setDataLoading(false);
      return;
    }

    // Modelos
    const { data: modelosData, error: modelosError } = await supabase
      .from('modelo')
      .select('id_modelo, nombre')
      .order('nombre', { ascending: true });

    if (modelosError) {
      console.error('Error fetching modelos:', modelosError);
      setError('Error al cargar la lista de modelos.');
      setDataLoading(false);
      return;
    }

    setClientesOptions(clientesData || []);
    setAdmOptions(admData || []);
    setModelosOptions(modelosData || []);

    // Mapear impresoras con cliente, modelo y ADM
    const mappedImpresoras: Impresora[] = (impresorasData || []).map(imp => {
      const cliente = clientesData?.find(c => c.id_cliente === imp.id_cliente);
      const adm = admData?.find(a => a.id_adm === cliente?.id_adm);
      const modelo = modelosData?.find(m => m.id_modelo === imp.id_modelo);
      return {
        ...imp,
        cliente_nombre: cliente?.nombre_especifico || null,
        modelo_nombre: modelo?.nombre || null,
        adm_nombre: adm?.nombre || null,
      };
    });

    setImpresoras(mappedImpresoras);
    setDataLoading(false);
  }, [canEdit]);

  useEffect(() => {
    if (!authLoading && profile && canEdit) fetchImpresorasData();
  }, [authLoading, profile, canEdit, fetchImpresorasData]);

  // 5. Filtrado de impresoras
  const filteredImpresoras = useMemo(() => {
    if (!searchSerie) return impresoras;
    return impresoras.filter(imp =>
      imp.serie.toLowerCase().includes(searchSerie.toLowerCase())
    );
  }, [searchSerie, impresoras]);

  // 6. Guardar impresora
  const handleSaveImpresora = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataLoading(true);
    setError(null);

    const impresoraData = {
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

    let error;

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('impresora')
        .update(impresoraData)
        .eq('serie', currentImpresora.serie);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('impresora')
        .insert([impresoraData]);
      error = insertError;
    }

    if (error) {
      console.error('Error saving impresora:', error);
      if (error.code === '23505' && !isEditing) {
        setError(`Error: La serie "${currentImpresora.serie}" ya está registrada.`);
      } else {
        setError(`Error al guardar la impresora: ${error.message}`);
      }
    } else {
      setIsModalOpen(false);
      await fetchImpresorasData();
    }
    setDataLoading(false);
  };

  // 7. Modales
  const openCreateModal = () => {
    if (!canEdit) return alert('Solo Master o ADM pueden registrar impresoras.');
    setIsEditing(false);
    setCurrentImpresora({
      serie: '',
      id_cliente: null,
      id_modelo: null,
      departamento: '',
      provincia: '',
      distrito: '',
      direccion: '',
      nombre_contacto: '',
      numero_contacto: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (impresora: Impresora) => {
    if (!canEdit) return;
    setIsEditing(true);
    setCurrentImpresora({
      serie: impresora.serie,
      id_cliente: impresora.id_cliente,
      id_modelo: impresora.id_modelo,
      departamento: impresora.departamento || '',
      provincia: impresora.provincia || '',
      distrito: impresora.distrito || '',
      direccion: impresora.direccion || '',
      nombre_contacto: impresora.nombre_contacto || '',
      numero_contacto: impresora.numero_contacto || '',
    });
    setIsModalOpen(true);
  };

  // 8. Renderizado
  if (authLoading || dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-indigo-600 text-xl font-semibold">Cargando inventario...</div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="flex justify-between items-center pb-6 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de Impresoras</h1>
        {canEdit ? (
          <button
            onClick={openCreateModal}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition"
          >
            + Nueva Impresora
          </button>
        ) : (
          <span className="text-sm text-gray-500 italic">
            Modo Lectura. Solo Master/ADM pueden agregar.
          </span>
        )}
      </header>

      <main className="mt-8">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {error}
          </div>
        )}

        {/* Input búsqueda */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar por serie..."
            value={searchSerie}
            onChange={(e) => setSearchSerie(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ADM</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Creación</th>
                {canEdit && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredImpresoras.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-6 py-4 text-center text-gray-500">
                    No hay impresoras registradas.
                  </td>
                </tr>
              ) : (
                filteredImpresoras.map((impresora) => (
                  <tr key={impresora.serie} className="hover:bg-indigo-50/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-700">{impresora.serie}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{impresora.cliente_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{impresora.modelo_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{impresora.adm_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{impresora.provincia || 'N/A'} - {impresora.departamento || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{impresora.nombre_contacto || 'N/A'} ({impresora.numero_contacto || 'N/A'})</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(impresora.created_date).toLocaleDateString()}</td>
                    {canEdit && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => openEditModal(impresora)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Editar"
                        >
                          ✎
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full flex justify-center items-center z-50">
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl mx-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              {isEditing ? `Editar Impresora: ${currentImpresora.serie}` : 'Registrar Nueva Impresora'}
            </h3>

            <form onSubmit={handleSaveImpresora} className="grid grid-cols-2 gap-4">
              {/* Columna 1 */}
              <div className='col-span-1 space-y-4'>
                <h4 className='text-lg font-semibold border-b pb-2 mb-2'>Datos del Activo</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Serie *</label>
                  <input
                    type="text"
                    value={currentImpresora.serie}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, serie: e.target.value }))}
                    required
                    disabled={isEditing}
                    className={`mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 ${isEditing ? 'bg-gray-100' : ''}`}
                    placeholder="Ej: ABC123456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cliente *</label>
                  <select
                    value={currentImpresora.id_cliente || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, id_cliente: e.target.value ? parseInt(e.target.value) : null }))}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="" disabled>Selecciona un cliente</option>
                    {clientesOptions.map(cliente => (
                      <option key={cliente.id_cliente} value={cliente.id_cliente}>{cliente.nombre_especifico}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Modelo *</label>
                  <select
                    value={currentImpresora.id_modelo || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, id_modelo: e.target.value ? parseInt(e.target.value) : null }))}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="" disabled>Selecciona un modelo</option>
                    {modelosOptions.map(modelo => (
                      <option key={modelo.id_modelo} value={modelo.id_modelo}>{modelo.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Departamento</label>
                  <input
                    type="text"
                    value={currentImpresora.departamento || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, departamento: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Ej: Contabilidad"
                  />
                </div>
              </div>

              {/* Columna 2 */}
              <div className='col-span-1 space-y-4'>
                <h4 className='text-lg font-semibold border-b pb-2 mb-2'>Ubicación y Contacto</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Provincia</label>
                  <input
                    type="text"
                    value={currentImpresora.provincia || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, provincia: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Distrito</label>
                  <input
                    type="text"
                    value={currentImpresora.distrito || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, distrito: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Dirección</label>
                  <input
                    type="text"
                    value={currentImpresora.direccion || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, direccion: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contacto</label>
                  <input
                    type="text"
                    value={currentImpresora.nombre_contacto || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, nombre_contacto: e.target.value }))}
                    placeholder="Nombre del contacto"
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={currentImpresora.numero_contacto || ''}
                    onChange={(e) => setCurrentImpresora(c => ({ ...c, numero_contacto: e.target.value }))}
                    placeholder="Número de contacto"
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="col-span-2 flex justify-end mt-4 space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {isEditing ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
