'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

type RequerimientoHistorico = {
  id_requerimiento?: number;
  id_historico?: number;
  serie_impresora: string;
  id_cliente: number;
  cod_sku: string;
  estado: string;
  fecha_atencion?: string;
  observacion?: string;
  timestamp_registro?: string;
  nombre_contacto?: string;
  numero_contacto?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  direccion?: string;
  clientes?: {
    nombre_especifico: string;
  };
  impresora?: {
    direccion?: string;
    provincia?: string;
  };
  fuente?: 'activo' | 'historico';
};

type Props = {
  rows: RequerimientoHistorico[];
  onRefresh: () => void;
  user: any;
};

// #################### FUNCIÓN PARA OBTENER COLOR DEL ESTADO ####################
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
// #################### FIN FUNCIÓN COLOR ####################

export function RequerimientoHistoricoTable({ rows, onRefresh }: Props) {
  const [localRows, setLocalRows] = useState<RequerimientoHistorico[]>(rows);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null,
  });

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  // 🔹 Manejar cambio de orden
  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key: '', direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  // 🔹 Ordenar filas localmente
  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return localRows;
    const sorted = [...localRows].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // Manejar campos anidados
      if (sortConfig.key === 'clientes.nombre_especifico') {
        aValue = a.clientes?.nombre_especifico;
        bValue = b.clientes?.nombre_especifico;
      } else {
        aValue = (a as any)[sortConfig.key];
        bValue = (b as any)[sortConfig.key];
      }

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
        {/* #################### ENCABEZADOS PERSONALIZADOS #################### */}
        <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
          <tr>
            {[
              { key: 'clientes.nombre_especifico', label: 'Cliente' },
              { key: 'direccion_provincia', label: 'Dirección-Provincia' },
              { key: 'contacto', label: 'Nombre Contacto - Teléfono' },
              { key: 'serie_impresora', label: 'Serie' },
              { key: 'cod_sku', label: 'SKU' },
              { key: 'estado', label: 'Estado' },
              { key: 'fecha_atencion', label: 'Fecha Atención' },
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
        {/* #################### FIN ENCABEZADOS #################### */}

        <tbody>
          {sortedRows.map((r, index) => {
            // #################### DETERMINAR DIRECCIÓN Y PROVINCIA ####################
            // Priorizar datos propios del requerimiento, luego de impresora
            const direccion = r.direccion || r.impresora?.direccion || '-';
            const provincia = r.provincia || r.impresora?.provincia || '-';
            const direccionCompleta = 
              direccion !== '-' && provincia !== '-'
                ? `${direccion} - ${provincia}`
                : direccion !== '-' 
                  ? direccion 
                  : provincia !== '-' 
                    ? provincia 
                    : '-';

            // #################### NOMBRE CONTACTO Y TELÉFONO ####################
            const contacto = 
              r.nombre_contacto && r.numero_contacto
                ? `${r.nombre_contacto} - ${r.numero_contacto}`
                : r.nombre_contacto || r.numero_contacto || '-';

            // #################### KEY ÚNICO PARA CADA FILA ####################
            const rowKey = r.id_historico 
              ? `historico-${r.id_historico}` 
              : r.id_requerimiento 
                ? `activo-${r.id_requerimiento}` 
                : `row-${index}`;

            return (
              <tr key={rowKey} className="border-t hover:bg-gray-50">
                {/* Cliente */}
                <td className="px-4 py-2">{r.clientes?.nombre_especifico || '-'}</td>
                
                {/* Dirección - Provincia */}
                <td className="px-4 py-2">{direccionCompleta}</td>
                
                {/* Nombre Contacto - Teléfono */}
                <td className="px-4 py-2">{contacto}</td>
                
                {/* Serie */}
                <td className="px-4 py-2">{r.serie_impresora || '-'}</td>

                {/* SKU */}
                <td className="px-4 py-2">{r.cod_sku || '-'}</td>

                {/* #################### Estado con colores #################### */}
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getEstadoColor(r.estado)}`}>
                    {r.estado}
                  </span>
                </td>
                {/* #################### FIN Estado #################### */}

                {/* Fecha Atención */}
                <td className="px-4 py-2">
                  {r.fecha_atencion
                    ? new Date(r.fecha_atencion).toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })
                    : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sortedRows.length === 0 && (
        <div className="text-center text-gray-500 p-6">No hay requerimientos en el histórico.</div>
      )}
    </div>
  );
}