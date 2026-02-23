'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowUpDown, MessageSquare, Check, X } from 'lucide-react';

type RequerimientoHistorico = {
  id_requerimiento?: number;
  id_historico?: number;
  serie_impresora: string;
  id_cliente: number;
  cod_sku: string;
  sku_default?: string;
  estado: string;
  guia?: string | null;
  fecha_atencion?: string;
  observacion?: string;
  timestamp_registro?: string;
  nombre_contacto?: string;
  numero_contacto?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  direccion?: string;
  coment?: string | null;
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

const getEstadoColor = (estado: string): string => {
  switch (estado.toLowerCase()) {
    case 'pendiente': return 'bg-yellow-100 text-yellow-800';
    case 'sin stock': return 'bg-red-100 text-red-800';
    case 'aprobado': return 'bg-orange-100 text-orange-800';
    case 'transito': return 'bg-cyan-100 text-cyan-800';
    case 'atendido': return 'bg-green-100 text-green-800';
    case 'cancelado': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

/** Celda de comentario con edición inline */
function ComentCell({ row, onSaved }: {
  row: RequerimientoHistorico;
  onSaved: (idHistorico: number, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.coment ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!row.id_historico) return;
    setSaving(true);
    const { error } = await supabase
      .from('requerimiento_historico')
      .update({ coment: value.trim() || null })
      .eq('id_historico', row.id_historico);
    setSaving(false);
    if (!error) {
      onSaved(row.id_historico, value.trim());
      setEditing(false);
    } else {
      console.error('Error guardando comentario:', error);
    }
  };

  const handleCancel = () => {
    setValue(row.coment ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-start gap-1 min-w-[200px]">
        <textarea
          className="border rounded p-1 text-xs w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          rows={2}
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
          placeholder="Escribe un comentario..."
        />
        <div className="flex flex-col gap-1 mt-0.5">
          <button
            onClick={handleSave}
            disabled={saving}
            title="Guardar"
            className="p-1 rounded bg-green-100 hover:bg-green-200 text-green-700 disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={handleCancel}
            title="Cancelar"
            className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title={value ? 'Editar comentario' : 'Agregar comentario'}
      className="flex items-center gap-1.5 text-left text-xs group w-full"
    >
      {value ? (
        <span className="text-gray-700 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {value}
        </span>
      ) : (
        <span className="text-gray-400 italic group-hover:text-blue-500 transition-colors flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          Agregar
        </span>
      )}
    </button>
  );
}

export function RequerimientoHistoricoTable({ rows, onRefresh }: Props) {
  const [localRows, setLocalRows] = useState<RequerimientoHistorico[]>(rows);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null,
  });

  useEffect(() => {
    setLocalRows(rows);
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

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return localRows;
    return [...localRows].sort((a, b) => {
      let aValue: any;
      let bValue: any;
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
  }, [localRows, sortConfig]);

  /** Actualiza el comentario localmente sin necesidad de refetch */
  const handleComentSaved = (idHistorico: number, newComent: string) => {
    setLocalRows(prev =>
      prev.map(r => r.id_historico === idHistorico ? { ...r, coment: newComent || null } : r)
    );
  };

  const COLUMNS = [
    { key: 'clientes.nombre_especifico', label: 'Cliente' },
    { key: 'direccion_provincia', label: 'Dirección-Provincia' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'serie_impresora', label: 'Serie' },
    { key: 'cod_sku', label: 'SKU Enviado' },
    { key: 'guia', label: 'Guía' },
    { key: 'estado', label: 'Estado' },
    { key: 'fecha_atencion', label: 'Fecha Atención' },
    { key: 'coment', label: 'Comentario' },
  ];

  return (
    <div className="overflow-x-auto rounded-xl shadow border border-gray-200 bg-white">
      <table className="min-w-full text-sm text-left text-gray-700">
        <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => col.key !== 'coment' && handleSort(col.key)}
                className={`px-4 py-3 select-none ${col.key !== 'coment' ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.key !== 'coment' && (
                    <ArrowUpDown
                      className={`w-3 h-3 ${sortConfig.key === col.key ? 'text-blue-500' : 'text-black'}`}
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((r, index) => {
            const direccion = r.direccion || r.impresora?.direccion || '-';
            const provincia = r.provincia || r.impresora?.provincia || '-';
            const direccionCompleta =
              direccion !== '-' && provincia !== '-'
                ? `${direccion} - ${provincia}`
                : direccion !== '-' ? direccion
                  : provincia !== '-' ? provincia
                    : '-';

            const contacto =
              r.nombre_contacto && r.numero_contacto
                ? `${r.nombre_contacto} - ${r.numero_contacto}`
                : r.nombre_contacto || r.numero_contacto || '-';

            const rowKey = r.id_historico
              ? `historico-${r.id_historico}`
              : r.id_requerimiento
                ? `activo-${r.id_requerimiento}`
                : `row-${index}`;

            return (
              <tr key={rowKey} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{r.clientes?.nombre_especifico || '-'}</td>
                <td className="px-4 py-2">{direccionCompleta}</td>
                <td className="px-4 py-2">{contacto}</td>
                <td className="px-4 py-2">{r.serie_impresora || '-'}</td>
                <td className="px-4 py-2">{r.cod_sku || '-'}</td>

                {/* Guía */}
                <td className="px-4 py-2">
                  {r.guia ? (
                    <span className="bg-gray-100 text-gray-700 font-mono text-xs px-2 py-0.5 rounded">
                      {r.guia}
                    </span>
                  ) : '-'}
                </td>

                {/* Estado con colores */}
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getEstadoColor(r.estado)}`}>
                    {r.estado}
                  </span>
                </td>

                {/* Fecha Atención */}
                <td className="px-4 py-2">
                  {r.fecha_atencion
                    ? new Date(r.fecha_atencion).toLocaleDateString('es-PE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                    })
                    : '-'}
                </td>

                {/* Comentario editable — solo si la fila es del histórico */}
                <td className="px-4 py-2 max-w-[220px]">
                  {r.id_historico ? (
                    <ComentCell row={r} onSaved={handleComentSaved} />
                  ) : (
                    <span className="text-gray-300 text-xs italic">—</span>
                  )}
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