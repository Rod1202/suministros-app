'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type Requerimiento = {
  id_requerimiento: number;
  serie_impresora: string;
  cod_sku: string;
  estado: string;
  guia?: string | null;
  clientes?: {
    nombre_especifico: string;
  };
  impresora?: {
    direccion?: string | null;
    provincia?: string | null;
    nombre_contacto?: string | null;
    numero_contacto?: string | null;
  };
};

type Props = {
  rows: Requerimiento[];
  onRefresh: () => void;
};

const getEstadoColor = (estado: string): string => {
  const estadoLower = estado.toLowerCase();
  switch (estadoLower) {
    case 'pendiente':
      return 'bg-yellow-100 text-yellow-800';
    case 'sin stock':
      return 'bg-red-100 text-red-800';
    case 'aprobado':
      return 'bg-orange-100 text-orange-800';
    case 'transito':
      return 'bg-cyan-100 text-cyan-800';
    case 'atendido':
      return 'bg-green-100 text-green-800';
    case 'cancelado':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function RequerimientoAprobadoTable({ rows, onRefresh }: Props) {
  const [localRows, setLocalRows] = useState<Requerimiento[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null,
  });
  const [guiaInputs, setGuiaInputs] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    // Filtrar solo los aprobados
    const aprobados = rows.filter((r) => r.estado?.toLowerCase() === 'aprobado');
    setLocalRows(aprobados);

    // Inicializar inputs
    const inicial = Object.fromEntries(aprobados.map((r) => [r.id_requerimiento, r.guia || '']));
    setGuiaInputs(inicial);
  }, [rows]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key: '', direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleGuiaChange = (id: number, value: string) => {
    setGuiaInputs((prev) => ({ ...prev, [id]: value }));
  };

  const handleGuardarGuia = async (id_requerimiento: number) => {
    const value = guiaInputs[id_requerimiento];
    if (!value) return alert('Por favor ingrese un número de guía.');

    try {
      const { error } = await supabase
        .from('requerimiento')
        .update({ guia: value, estado: 'transito' })
        .eq('id_requerimiento', id_requerimiento);

      if (error) throw error;

      setLocalRows((prev) =>
        prev.map((r) =>
          r.id_requerimiento === id_requerimiento
            ? { ...r, guia: value, estado: 'transito' }
            : r
        )
      );

      alert('Guía guardada correctamente ✅');
      onRefresh();
    } catch (err) {
      console.error('Error al actualizar guía:', err);
      alert('Error al guardar la guía.');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return localRows;
    const sorted = [...localRows].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [localRows, sortConfig]);

  return (
    <div className="overflow-x-auto rounded-xl shadow border border-gray-200 bg-white">
      <table className="min-w-full text-sm text-left text-gray-700">
        <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
          <tr>
            {[
              { key: 'clientes.nombre_especifico', label: 'Cliente' },
              { key: 'direccion', label: 'Dirección - Provincia' },
              { key: 'contacto', label: 'Nombre Contacto - Teléfono' },
              { key: 'serie_impresora', label: 'Serie' },
              { key: 'cod_sku', label: 'SKU' },
              { key: 'estado', label: 'Estado' },
              { key: 'guia', label: 'Guía' },
            ].map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-3 cursor-pointer select-none"
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  <ArrowUpDown
                    className={`w-3 h-3 ${
                      sortConfig.key === col.key ? 'text-blue-500' : 'text-black'
                    }`}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r, index) => {
            const direccion = r.impresora?.direccion || '-';
            const provincia = r.impresora?.provincia || '-';
            const direccionCompleta =
              direccion !== '-' && provincia !== '-'
                ? `${direccion} - ${provincia}`
                : direccion !== '-'
                ? direccion
                : provincia;

            const contacto =
              r.impresora?.nombre_contacto && r.impresora?.numero_contacto
                ? `${r.impresora?.nombre_contacto} - ${r.impresora?.numero_contacto}`
                : r.impresora?.nombre_contacto || r.impresora?.numero_contacto || '-';

            return (
              <tr key={r.id_requerimiento || index} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{r.clientes?.nombre_especifico || '-'}</td>
                <td className="px-4 py-2">{direccionCompleta}</td>
                <td className="px-4 py-2">{contacto}</td>
                <td className="px-4 py-2">{r.serie_impresora || '-'}</td>
                <td className="px-4 py-2">{r.cod_sku || '-'}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getEstadoColor(
                      r.estado
                    )}`}
                  >
                    {r.estado}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={guiaInputs[r.id_requerimiento] || ''}
                      onChange={(e) => handleGuiaChange(r.id_requerimiento, e.target.value)}
                      className="border rounded-lg px-2 py-1 w-28 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Ingresar guía"
                    />
                    <button
                      onClick={() => handleGuardarGuia(r.id_requerimiento)}
                      className="bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-lg"
                      title="Guardar guía"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sortedRows.length === 0 && (
        <div className="text-center text-gray-500 p-6">
          No hay requerimientos aprobados.
        </div>
      )}
    </div>
  );
}
