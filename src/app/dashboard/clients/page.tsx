// src/app/dashboard/clients/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';

// 1. Definición de Tipos
interface Cliente {
  id_cliente: number;
  nombre_especifico: string;
  id_alias: number | null;
  alias_nombre: string | null; // Para mostrar el nombre del alias
  id_adm: number | null;
  adm_nombre: string | null; // Para mostrar el nombre del ADM
  criticidad: 'Alto' | 'Medio' | 'Bajo';
  created_date: string;
}

interface Alias {
    id_alias: number;
    nombre: string;
}

interface Adm {
    id_adm: number;
    nombre: string;
    telefono: string | null;
}

const Criticidades: Array<Cliente['criticidad']> = ['Alto', 'Medio', 'Bajo'];

// 2. Componente Principal
export default function ClientsPage() {
  const router = useRouter();
  const { profile, loading: authLoading, hasAccess } = useUserRole();
  
  // Estado de datos
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [adms, setAdms] = useState<Adm[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del modal de creación/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCliente, setCurrentCliente] = useState<Omit<Cliente, 'id_cliente' | 'created_date' | 'alias_nombre' | 'adm_nombre'> & { id_cliente: number | null }>({
    id_cliente: null,
    nombre_especifico: '',
    id_alias: null,
    id_adm: null,
    criticidad: 'Bajo',
  });

  // 3. Chequeo de Acceso y Redirección
  const canAccess = hasAccess(['master', 'especialista', 'adm']); // Roles actualizados

  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login');
    }
    if (!authLoading && profile && !canAccess) {
      router.push('/dashboard');
    }
  }, [authLoading, profile, canAccess, router]);


  // 4. Función de Carga de Datos (READ)
  const fetchClientesData = useCallback(async () => {
    if (!canAccess) return;

    setDataLoading(true);
    setError(null);
    
    // Consulta de Clientes
    const { data: clientesData, error: clientesError } = await supabase
      .from('clientes')
      .select('id_cliente, nombre_especifico, id_alias, id_adm, criticidad, created_date')
      .order('nombre_especifico', { ascending: true });

    if (clientesError) {
      console.error("Error fetching clientes:", clientesError);
      setError('Error al cargar la lista de clientes. Por favor, revisa las políticas RLS.');
      setDataLoading(false);
      return;
    }

    // Consulta de Alias
    const { data: aliasesData, error: aliasesError } = await supabase
        .from('alias')
        .select('id_alias, nombre')
        .order('nombre', { ascending: true });

    if (aliasesError) {
        console.error("Error fetching aliases:", aliasesError);
        setError('Error al cargar la lista de alias.');
        setDataLoading(false);
        return;
    }
    setAliases(aliasesData || []);

    // Consulta de ADMs
    const { data: admsData, error: admsError } = await supabase
        .from('adm')
        .select('id_adm, nombre, telefono')
        .order('nombre', { ascending: true });

    if (admsError) {
        console.error("Error fetching ADMs:", admsError);
        setError('Error al cargar la lista de ADMs.');
        setDataLoading(false);
        return;
    }
    setAdms(admsData || []);

    // Mapear clientes para incluir nombres de alias y ADM
    const mappedClientes: Cliente[] = clientesData.map(c => ({
        ...c,
        alias_nombre: aliasesData?.find(a => a.id_alias === c.id_alias)?.nombre || null,
        adm_nombre: admsData?.find(a => a.id_adm === c.id_adm)?.nombre || null,
    }));

    setClientes(mappedClientes);
    setDataLoading(false);
  }, [canAccess]);

  // Ejecutar la carga inicial
  useEffect(() => {
    if (canAccess) {
      fetchClientesData();
    }
  }, [fetchClientesData, canAccess]);

  // 5. Manejo del Formulario (CREATE / UPDATE)
  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setDataLoading(true);
    setError(null);
    
    const clienteData = {
        nombre_especifico: currentCliente.nombre_especifico,
        id_alias: currentCliente.id_alias,
        id_adm: currentCliente.id_adm,
        criticidad: currentCliente.criticidad,
    };

    let error;

    if (isEditing && currentCliente.id_cliente) {
        // UPDATE (Editar)
        const { error: updateError } = await supabase
            .from('clientes')
            .update(clienteData)
            .eq('id_cliente', currentCliente.id_cliente);
        error = updateError;
    } else {
        // CREATE (Crear Nuevo)
        const { error: insertError } = await supabase
            .from('clientes')
            .insert([clienteData]);
        error = insertError;
    }

    if (error) {
        console.error("Error saving cliente:", error);
        if (error.code === '23505') { // Unique violation for nombre_especifico
            setError(`Error: El cliente "${currentCliente.nombre_especifico}" ya existe.`);
        } else {
            setError(`Error al guardar el cliente: ${error.message}`);
        }
    } else {
        // Éxito: cerrar modal y recargar datos
        setIsModalOpen(false);
        await fetchClientesData(); 
    }
    setDataLoading(false);
  };

  // 6. Manejo de Borrado (DELETE)
  const handleDeleteCliente = async (id_cliente: number, nombre_especifico: string) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar el cliente: ${nombre_especifico}?`)) {
      setDataLoading(true);
      setError(null);
      
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id_cliente', id_cliente);
      
      if (error) {
        console.error("Error deleting cliente:", error);
        setError(`Error al eliminar el cliente: ${error.message}`);
      } else {
        // Éxito: recargar datos
        await fetchClientesData();
      }
      setDataLoading(false);
    }
  };

  // 7. Configuración del Modal
  const openCreateModal = () => {
    setIsEditing(false);
    setCurrentCliente({ id_cliente: null, nombre_especifico: '', id_alias: null, id_adm: null, criticidad: 'Bajo' });
    setIsModalOpen(true);
  };

  const openEditModal = (cliente: Cliente) => {
    setIsEditing(true);
    setCurrentCliente({ 
        id_cliente: cliente.id_cliente,
        nombre_especifico: cliente.nombre_especifico,
        id_alias: cliente.id_alias,
        id_adm: cliente.id_adm,
        criticidad: cliente.criticidad,
    });
    setIsModalOpen(true);
  };

  // 8. Renderizado de la Interfaz
  if (authLoading || (profile && !canAccess && !dataLoading)) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="text-indigo-600 text-xl font-semibold">Cargando perfil y permisos...</div>
        </div>
    );
  }

  if (!profile || !canAccess) {
    return (
        <div className="p-8 text-center text-red-600">
            No tienes los permisos necesarios para acceder a esta página. Redirigiendo...
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="flex justify-between items-center pb-6 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de Clientes</h1>
        <button
          onClick={openCreateModal}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition"
          disabled={dataLoading}
        >
          {dataLoading ? 'Cargando...' : '+ Nuevo Cliente'}
        </button>
      </header>

      <main className="mt-8">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Específico</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alias</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ADM</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criticidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Creación</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.length === 0 && !dataLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No hay clientes registrados.
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => (
                  <tr key={cliente.id_cliente} className="hover:bg-indigo-50/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente.nombre_especifico}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.alias_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.adm_nombre || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            cliente.criticidad === 'Alto' ? 'bg-red-100 text-red-800' :
                            cliente.criticidad === 'Medio' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                        }`}>
                            {cliente.criticidad}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(cliente.created_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => openEditModal(cliente)}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Editar"
                      >
                         <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-7-3l-4 4m0 0l4 4m-4-4h14a2 2 0 002-2V7a2 2 0 00-2-2h-3"></path></svg>
                      </button>
                      <button
                        onClick={() => handleDeleteCliente(cliente.id_cliente, cliente.nombre_especifico)}
                        className="text-red-600 hover:text-red-900 ml-2"
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
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              {isEditing ? 'Editar Cliente' : 'Crear Nuevo Cliente'}
            </h3>
            
            <form onSubmit={handleSaveCliente} className="space-y-4">
              {/* Campo Nombre Específico */}
              <div>
                <label className="block text-sm font-medium text-gray-900">Nombre Específico del Cliente</label>
                <input
                  type="text"
                  value={currentCliente.nombre_especifico}
                  onChange={(e) => setCurrentCliente(c => ({ ...c, nombre_especifico: e.target.value }))}
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Agro S.A."
                />
              </div>

              {/* Campo Alias */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Alias</label>
                <select
                  value={currentCliente.id_alias || ''}
                  onChange={(e) => setCurrentCliente(c => ({ ...c, id_alias: e.target.value ? parseInt(e.target.value) : null }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Selecciona un Alias (Opcional)</option>
                  {aliases.map(a => (
                    <option key={a.id_alias} value={a.id_alias}>{a.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Campo ADM */}
              <div>
                <label className="block text-sm font-medium text-gray-700">ADM</label>
                <select
                  value={currentCliente.id_adm || ''}
                  onChange={(e) => setCurrentCliente(c => ({ ...c, id_adm: e.target.value ? parseInt(e.target.value) : null }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Selecciona un ADM (Opcional)</option>
                  {adms.map(a => (
                    <option key={a.id_adm} value={a.id_adm}>{a.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Campo Criticidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Criticidad</label>
                <select
                  value={currentCliente.criticidad}
                  onChange={(e) => setCurrentCliente(c => ({ ...c, criticidad: e.target.value as Cliente['criticidad'] }))}
                  required
                  className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {Criticidades.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Botones de Acción */}
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
                  {dataLoading ? 'Guardando...' : isEditing ? 'Actualizar Cliente' : 'Crear Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
