// src/app/dashboard/skus/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';

// 1. Definición de Tipos de Datos
interface SkuItem {
  cod_sku: string; // PRIMARY KEY
  nombre: string;
  id_color: number | null;
  color_nombre: string | null; // Para mostrar el nombre del color
  cantidad: number;
  punto_reorden: number;
  ubicacion: string | null;
  fecha_actualizado: string;
}

interface ColorOption {
    id_color: number;
    nombre: string;
}

// 2. Componente Principal
export default function SKUsPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();
  
  // Estado de datos
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [colorsOptions, setColorsOptions] = useState<ColorOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del modal de creación/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentSkuItem, setCurrentSkuItem] = useState<Omit<SkuItem, 'fecha_actualizado' | 'color_nombre'> & { cod_sku: string }>({
    cod_sku: '',
    nombre: '',
    id_color: null,
    cantidad: 0,
    punto_reorden: 10,
    ubicacion: '',
  });
  
  // Determina si el usuario tiene permiso de acceso (master/edistribucion)
  const canAccess = hasAccess(['master', 'edistribucion']);

  // 3. Chequeo de Autenticación y Acceso
  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login');
    } else if (!authLoading && profile && !canAccess) {
        alert("Acceso Denegado. Solo Master o EDistribucion pueden administrar SKUs.");
        router.push('/dashboard'); 
    }
  }, [authLoading, profile, canAccess, router]);

  // 4. Carga de Datos (SKUs y Colores)
  const fetchSkuData = useCallback(async () => {
    if (!canAccess) return;

    setDataLoading(true);
    setError(null);
    
    // Consulta de SKUs
    const { data: skusData, error: skusError } = await supabase
      .from('sku')
      .select('cod_sku, nombre, id_color, cantidad, punto_reorden, ubicacion, fecha_actualizado')
      .order('cod_sku', { ascending: true });

    if (skusError) {
      console.error("Error fetching SKUs:", skusError);
      setError('Error al cargar la lista de SKUs.');
      setDataLoading(false);
      return;
    }

    // Consulta de Colores (para dropdown y display)
    const { data: colorsData, error: colorsError } = await supabase
        .from('color')
        .select('id_color, nombre')
        .order('nombre', { ascending: true });

    if (colorsError) {
        console.error("Error fetching colors for dropdown:", colorsError);
        setError('Error al cargar la lista de colores.');
        setDataLoading(false);
        return;
    }
    setColorsOptions(colorsData || []);

    // Mapear SKUs para incluir nombres de color
    const mappedSkus: SkuItem[] = skusData.map(s => ({
        ...s,
        color_nombre: colorsData?.find(c => c.id_color === s.id_color)?.nombre || null,
    }));
    
    setSkus(mappedSkus);
    setDataLoading(false);
  }, [canAccess]);

  // Ejecutar la carga inicial
  useEffect(() => {
    if (!authLoading && profile && canAccess) {
      fetchSkuData();
    }
  }, [authLoading, profile, canAccess, fetchSkuData]);


  // 5. Manejo del Formulario (CREATE / UPDATE)
  const handleSaveSkuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataLoading(true);
    setError(null);

    // Mapeo de datos para insertar/actualizar
    const skuData = {
        cod_sku: currentSkuItem.cod_sku.toUpperCase(),
        nombre: currentSkuItem.nombre,
        id_color: currentSkuItem.id_color,
        cantidad: currentSkuItem.cantidad,
        punto_reorden: currentSkuItem.punto_reorden,
        ubicacion: currentSkuItem.ubicacion || null,
    };

    let error;

    if (isEditing) {
        // UPDATE (Editar)
        const { error: updateError } = await supabase
            .from('sku')
            .update(skuData)
            .eq('cod_sku', currentSkuItem.cod_sku);
        error = updateError;
    } else {
        // CREATE (Crear Nuevo)
        const { error: insertError } = await supabase
            .from('sku')
            .insert([skuData]);
        error = insertError;
    }

    if (error) {
        console.error("Error saving SKU:", error);
        if (error.code === '23505' && !isEditing) { // Unique violation for cod_sku
             setError(`Error: El código SKU "${currentSkuItem.cod_sku.toUpperCase()}" ya existe.`);
        } else {
             setError(`Error al guardar el SKU: ${error.message}`);
        }
    } else {
        setIsModalOpen(false);
        await fetchSkuData(); 
    }
    setDataLoading(false);
  };
  
  // 6. Manejo de Eliminación (DELETE)
  const handleDeleteSkuItem = async (cod_sku: string, sku_nombre: string) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el SKU: ${sku_nombre} (${cod_sku})?`)) {
        return;
    }
    setDataLoading(true);
    setError(null);

    const { error: deleteError } = await supabase
        .from('sku')
        .delete()
        .eq('cod_sku', cod_sku);
        
    if (deleteError) {
        console.error("Error deleting SKU:", deleteError);
        setError(`Error al eliminar el SKU: ${deleteError.message}`);
    } else {
        await fetchSkuData();
    }
    setDataLoading(false);
  };


  // 7. Configuración de Modales
  const openCreateModal = () => {
    setIsEditing(false);
    setCurrentSkuItem({ 
        cod_sku: '', 
        nombre: '', 
        id_color: null, 
        cantidad: 0, 
        punto_reorden: 10, 
        ubicacion: '' 
    });
    setIsModalOpen(true);
  };

  const openEditModal = (sku: SkuItem) => {
    setIsEditing(true);
    setCurrentSkuItem({
        cod_sku: sku.cod_sku,
        nombre: sku.nombre,
        id_color: sku.id_color,
        cantidad: sku.cantidad,
        punto_reorden: sku.punto_reorden,
        ubicacion: sku.ubicacion || '',
    });
    setIsModalOpen(true);
  };
  
  // 8. Renderizado condicional
  if (authLoading || dataLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-indigo-600 text-xl font-semibold">Cargando gestión de SKUs...</div>
      </div>
    );
  }

  if (!canAccess) {
      return null; // El useEffect ya manejó la redirección/alerta
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="flex justify-between items-center pb-6 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de SKUs</h1>
        <button
            onClick={openCreateModal}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition"
        >
          + Crear Nuevo SKU
        </button>
      </header>

      <main className="mt-8">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {error}
          </div>
        )}

        {/* Tabla de SKUs */}
        <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Punto Reorden</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Actualización</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {skus.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    No hay SKUs registrados.
                  </td>
                </tr>
              ) : (
                skus.map((sku) => (
                  <tr key={sku.cod_sku} className="hover:bg-indigo-50/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-700">{sku.cod_sku}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sku.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.color_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.cantidad}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.punto_reorden}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sku.ubicacion || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(sku.fecha_actualizado).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                            onClick={() => openEditModal(sku)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                        >
                            <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-7-3l-4 4m0 0l4 4m-4-4h14a2 2 0 002-2V7a2 2 0 00-2-2h-3"></path></svg>
                        </button>
                        <button
                            onClick={() => handleDeleteSkuItem(sku.cod_sku, sku.nombre)}
                            className="text-red-600 hover:text-red-900 ml-3"
                            title="Eliminar"
                        >
                            <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de Creación/Edición */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full flex justify-center items-center z-50">
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              {isEditing ? `Editar SKU: ${currentSkuItem.cod_sku}` : 'Registrar Nuevo SKU'}
            </h3>
            
            <form onSubmit={handleSaveSkuItem} className="space-y-4">
              
              {/* Campo Código SKU */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Código SKU *</label>
                <input
                  type="text"
                  value={currentSkuItem.cod_sku}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, cod_sku: e.target.value.toUpperCase() }))}
                  required
                  disabled={isEditing} // No se puede cambiar el código SKU al editar
                  className={`mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 ${isEditing ? 'bg-gray-100' : ''}`}
                  placeholder="Ej: CF258X"
                />
              </div>

              {/* Campo Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre *</label>
                <input
                  type="text"
                  value={currentSkuItem.nombre}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, nombre: e.target.value }))}
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Tóner Negro HP 58X (Alto Rendimiento)"
                />
              </div>

              {/* Campo Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Color</label>
                <select
                  value={currentSkuItem.id_color || ''}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, id_color: e.target.value ? parseInt(e.target.value) : null }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Selecciona un Color (Opcional)</option>
                  {colorsOptions.map(color => (
                    <option key={color.id_color} value={color.id_color}>{color.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Campo Cantidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Cantidad</label>
                <input
                  type="number"
                  value={currentSkuItem.cantidad}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, cantidad: parseInt(e.target.value) || 0 }))}
                  required
                  min="0"
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Campo Punto de Reorden */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Punto de Reorden</label>
                <input
                  type="number"
                  value={currentSkuItem.punto_reorden}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, punto_reorden: parseInt(e.target.value) || 0 }))}
                  required
                  min="0"
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Campo Ubicación */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Ubicación</label>
                <input
                  type="text"
                  value={currentSkuItem.ubicacion || ''}
                  onChange={(e) => setCurrentSkuItem(c => ({ ...c, ubicacion: e.target.value }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Almacén A, Estante 3"
                />
              </div>
              
              {/* Botones */}
              <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
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
                  {dataLoading ? 'Guardando...' : isEditing ? 'Actualizar SKU' : 'Registrar SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
