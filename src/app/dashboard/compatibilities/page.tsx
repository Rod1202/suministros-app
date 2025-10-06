'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';

// 1. Definición de Tipos de Datos
interface CompatibilidadItem {
  id_compati: number | null;
  id_modelo: number | null;
  modelo_nombre: string | null; 
  cod_sku: string | null;
  sku_nombre: string | null; 
  sku_descripcion?: string | null; 
}

interface ModeloOption {
  id_modelo: number;
  nombre: string;
}

interface SkuOption {
  cod_sku: string;
  nombre: string;
}

// 2. Componente Principal
export default function CompatibilitiesPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();

  const [compatibilidades, setCompatibilidades] = useState<CompatibilidadItem[]>([]);
  const [modelosOptions, setModelosOptions] = useState<ModeloOption[]>([]);
  const [skuItemsOptions, setSkuItemsOptions] = useState<SkuOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCompatibilidad, setCurrentCompatibilidad] = useState<Omit<CompatibilidadItem, 'modelo_nombre' | 'sku_nombre' | 'sku_descripcion'> & { id_compati: number | null }>({
    id_compati: null,
    id_modelo: null,
    cod_sku: null,
  });

  const canAccess = hasAccess(['master', 'especialista']);

  // Chequeo de Autenticación y Acceso
  useEffect(() => {
    if (!authLoading && !profile) router.push('/login');
    else if (!authLoading && profile && !canAccess) {
      alert("Acceso Denegado. Solo Master o Especialista pueden administrar compatibilidades.");
      router.push('/dashboard');
    }
  }, [authLoading, profile, canAccess, router]);

  // Carga de Datos
  const fetchCompatibilidadesData = useCallback(async () => {
    if (!canAccess) return;

    setDataLoading(true);
    setError(null);

    const { data: compatibilidadesData, error: compError } = await supabase
      .from('compatibilidad')
      .select('id_compati, cod_sku, id_modelo')
      .order('id_modelo', { ascending: true });

    if (compError) {
      console.error("Error fetching compatibilities:", compError);
      setError('Error al cargar la lista de compatibilidades.');
      setDataLoading(false);
      return;
    }

    const { data: modelosData, error: modelosError } = await supabase
      .from('modelo')
      .select('id_modelo, nombre')
      .order('nombre', { ascending: true });

    if (modelosError) {
      console.error("Error fetching models:", modelosError);
      setError('Error al cargar la lista de modelos.');
      setDataLoading(false);
      return;
    }
    setModelosOptions(modelosData || []);

    const { data: skusData, error: skusError } = await supabase
      .from('sku')
      .select('cod_sku, nombre')
      .order('nombre', { ascending: true });

    if (skusError) {
      console.error("Error fetching SKUs:", skusError);
      setError('Error al cargar la lista de SKUs.');
      setDataLoading(false);
      return;
    }
    setSkuItemsOptions(skusData || []);

    const mappedCompatibilidades: CompatibilidadItem[] = (compatibilidadesData || []).map(comp => ({
      ...comp,
      modelo_nombre: modelosData?.find(m => m.id_modelo === comp.id_modelo)?.nombre || null,
      sku_nombre: skusData?.find(s => s.cod_sku === comp.cod_sku)?.cod_sku || null,
      sku_descripcion: skusData?.find(s => s.cod_sku === comp.cod_sku)?.nombre || null,
    }));

    setCompatibilidades(mappedCompatibilidades);
    setDataLoading(false);
  }, [canAccess]);

  useEffect(() => {
    if (!authLoading && profile && canAccess) fetchCompatibilidadesData();
  }, [authLoading, profile, canAccess, fetchCompatibilidadesData]);

  // Crear / Editar
const handleSaveCompatibilidad = async (e: React.FormEvent) => {
  e.preventDefault();
  setDataLoading(true);
  setError(null);

  const compatibilidadData = {
    id_modelo: currentCompatibilidad.id_modelo,
    cod_sku: currentCompatibilidad.cod_sku,
  };

  let resultError;

  if (isEditing && currentCompatibilidad.id_compati) {
    const { error: updateError } = await supabase
      .from('compatibilidad')
      .update(compatibilidadData)
      .eq('id_compati', currentCompatibilidad.id_compati);
    resultError = updateError;
  } else {
    const { error: insertError } = await supabase
      .from('compatibilidad')
      .insert([compatibilidadData]);
    resultError = insertError;
  }

  if (resultError) {
    console.error("Error saving compatibilidad:", resultError);

    // Si es error de duplicado
    if (resultError.code === '23505') {
      setError('⚠ Compatibilidad existente');
    } else {
      setError(resultError.message || 'Error al guardar la compatibilidad');
    }
  } else {
    setIsModalOpen(false);
    await fetchCompatibilidadesData();
  }

  setDataLoading(false);
};

  // Abrir modal crear
  const openCreateModal = () => {
    setIsEditing(false);
    setCurrentCompatibilidad({ id_compati: null, id_modelo: null, cod_sku: null });
    setIsModalOpen(true);
  };

  // Abrir modal editar
  const openEditModal = (comp: CompatibilidadItem) => {
    setIsEditing(true);
    setCurrentCompatibilidad({
      id_compati: comp.id_compati,
      id_modelo: comp.id_modelo,
      cod_sku: comp.cod_sku,
    });
    setIsModalOpen(true);
  };

  // Eliminar compatibilidad
  const handleDeleteCompatibilidad = async (id_compati: number | null) => {
    if (!id_compati) return;
    if (!confirm('¿Estás seguro de eliminar esta compatibilidad?')) return;

    setDataLoading(true);
    const { error: deleteError } = await supabase
      .from('compatibilidad')
      .delete()
      .eq('id_compati', id_compati);

    if (deleteError) {
      console.error("Error deleting compatibilidad:", deleteError);
      setError('Error al eliminar la compatibilidad');
    } else {
      await fetchCompatibilidadesData();
    }
    setDataLoading(false);
  };

  // Renderizado
  if (authLoading || dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-indigo-600 text-xl font-semibold">Cargando compatibilidades...</div>
      </div>
    );
  }

  if (!profile || !canAccess) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="flex justify-between items-center pb-6 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de Compatibilidades</h1>
        <button
          onClick={openCreateModal}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition"
          disabled={dataLoading}
        >
          {dataLoading ? 'Cargando...' : '+ Agregar Compatibilidad'}
        </button>
      </header>

      <main className="mt-8">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                {canAccess && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {compatibilidades.length === 0 ? (
                <tr>
                  <td colSpan={canAccess ? 4 : 3} className="px-6 py-4 text-center text-gray-500">
                    No hay compatibilidades registradas.
                  </td>
                </tr>
              ) : (
                compatibilidades.map((comp) => (
                  <tr key={comp.id_compati} className="hover:bg-indigo-50/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{comp.modelo_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{comp.sku_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{comp.sku_descripcion || 'N/A'}</td>
                    {canAccess && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => openEditModal(comp)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteCompatibilidad(comp.id_compati)}
                          className="text-red-600 hover:text-red-900 ml-2"
                        >
                          Eliminar
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
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              {isEditing ? 'Editar Compatibilidad' : 'Agregar Nueva Compatibilidad'}
            </h3>
            {error && (
              <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg text-center">
                {error}
              </div>
            )}
            <form onSubmit={handleSaveCompatibilidad} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Modelo de Impresora *</label>
                <select
                  value={currentCompatibilidad.id_modelo || ''}
                  onChange={(e) => setCurrentCompatibilidad(c => ({ ...c, id_modelo: e.target.value ? parseInt(e.target.value) : null }))}
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>Selecciona un modelo</option>
                  {modelosOptions.map((modelo, index) => (
                    <option key={index} value={modelo.id_modelo}>{modelo.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">SKU Compatible *</label>
                <select
                  value={currentCompatibilidad.cod_sku || ''}
                  onChange={(e) => setCurrentCompatibilidad(c => ({ ...c, cod_sku: e.target.value || null }))}
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>Selecciona un SKU</option>
                  {skuItemsOptions.map((sku, index) => (
                    <option key={index} value={sku.cod_sku}>{sku.cod_sku} - {sku.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={dataLoading}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {dataLoading ? 'Guardando...' : isEditing ? 'Actualizar Compatibilidad' : 'Agregar Compatibilidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
