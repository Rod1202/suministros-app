'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowUpDown } from 'lucide-react';

type Requerimiento = {
  id_requerimiento: number;
  serie_impresora: string;
  id_cliente: number;
  cod_sku: string;
  cantidad_solicitada: number;
  estado: string;
  observacion: string | null;
  timestamp_registro: string | null;
  porcentaje: number | null;
  dias_restantes: number | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  direccion?: string | null;
  nombre_contacto?: string | null;
  numero_contacto?: string | null;
  impresora?: {
    id_modelo: number;
    direccion?: string | null;
    provincia?: string | null;
    modelo?: { nombre: string } | null;
  } | null;
  clientes?: {
    nombre_especifico: string;
  } | null;
};

type SkuCompatible = {
  cod_sku: string;
  cantidad: number;
  color: string;
};

type Props = {
  rows: Requerimiento[];
  editable: boolean;
  onRefresh: () => void;
  user: any;
};

const MessageBox = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
      <h3 className="text-lg font-bold text-red-600 mb-4">Error de Actualización</h3>
      <p className="text-sm text-gray-700 mb-6">{message}</p>
      <button
        onClick={onClose}
        className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 transition duration-150"
      >
        Entendido
      </button>
    </div>
  </div>
);

export function RequerimientoTable({ rows, editable, onRefresh }: Props) {
  const [localRows, setLocalRows] = useState<Requerimiento[]>(rows);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null,
  });
  const [skuOptions, setSkuOptions] = useState<Record<string, SkuCompatible[]>>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  // 🔹 Cargar SKUs compatibles por serie y mismo color
  useEffect(() => {
    const loadSkuCompatibles = async () => {
      const grouped: Record<string, SkuCompatible[]> = {};

      for (const row of rows) {
        if (!row.serie_impresora || !row.cod_sku) continue;

        // Obtener el color del SKU actual
        const { data: skuActual, error: errorSkuActual } = await supabase
          .from('sku')
          .select('id_color, color:color(nombre)')
          .eq('cod_sku', row.cod_sku)
          .single();

        if (errorSkuActual || !skuActual?.id_color) {
          console.error('Error obteniendo color del SKU:', errorSkuActual);
          continue;
        }

        // Obtener el modelo de la impresora
        const { data: impresora, error: errorImpresora } = await supabase
          .from('impresora')
          .select('id_modelo')
          .eq('serie', row.serie_impresora)
          .single();

        if (errorImpresora || !impresora?.id_modelo) {
          console.error('Error obteniendo modelo de impresora:', errorImpresora);
          continue;
        }

        // #################### OBTENER TODOS LOS SKUs COMPATIBLES DEL MISMO COLOR ####################
        const { data: compatibles, error: errorCompatibles } = await supabase
          .from('compatibilidad')
          .select(`
            cod_sku,
            sku!inner (
              cod_sku,
              cantidad,
              id_color
            )
          `)
          .eq('id_modelo', impresora.id_modelo)
          .eq('sku.id_color', skuActual.id_color);

        if (errorCompatibles) {
          console.error('Error obteniendo compatibles:', errorCompatibles);
          continue;
        }

        // Mapear todos los compatibles (sin filtrar por color nuevamente)
        grouped[row.serie_impresora] = (compatibles || []).map((item: any) => ({
          cod_sku: item.sku.cod_sku,
          cantidad: item.sku.cantidad,
          color: '', // No necesitamos mostrar el color ya que todos son del mismo color
        }));
        // #################### FIN ####################
      }

      setSkuOptions(grouped);
    };

    if (rows.length > 0) {
      loadSkuCompatibles();
    }
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
    const sorted = [...localRows].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortConfig.key === 'clientes.nombre_especifico') {
        aValue = a.clientes?.nombre_especifico;
        bValue = b.clientes?.nombre_especifico;
      } else {
        aValue = (a as any)[sortConfig.key];
        bValue = (b as any)[sortConfig.key];
      }

      if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [localRows, sortConfig]);

  const handleUpdate = async (id: number, field: string, value: any) => {
    const { error } = await supabase
      .from('requerimiento')
      .update({ [field]: value })
      .eq('id_requerimiento', id);

    if (error) {
      setErrorMsg(`Error al actualizar ${field}: ${error.message}`);
      console.error(error);
    } else {
      setLocalRows((prev) =>
        prev.map((row) => (row.id_requerimiento === id ? { ...row, [field]: value } : row))
      );
      
    }

    setEditingRow(null);
  };

  return (
    <>
      {errorMsg && <MessageBox message={errorMsg} onClose={() => setErrorMsg(null)} />}

      <div className="overflow-x-auto rounded-xl shadow border border-gray-200 bg-white">
        <table className="min-w-full text-sm text-left text-gray-700">
          <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
            <tr>
              {[
                { key: 'id_requerimiento', label: 'ID' },
                { key: 'clientes.nombre_especifico', label: 'Cliente' },
                { key: 'direccion_provincia', label: 'Dirección-Provincia' },
                { key: 'serie_impresora', label: 'Serie' },
                { key: 'cod_sku', label: 'SKU' },
                { key: 'porcentaje', label: 'Porcentaje' },
                { key: 'dias_restantes', label: 'Dias Restantes' },
                { key: 'timestamp_registro', label: 'Fecha Registro' },
                { key: 'estado', label: 'Estado' },
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
                        sortConfig.key === col.key ? 'text-blue-500' : 'text-gray-400'
                      }`}
                    />
                  </div>
                </th>
              ))}
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((r) => {
              const editableSku = editable && r.estado.toLowerCase() !== 'aprobado';
              const skuCompatibles = skuOptions[r.serie_impresora] || [];

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

              return (
                <tr key={r.id_requerimiento} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{r.id_requerimiento}</td>
                  <td className="px-4 py-2">{r.clientes?.nombre_especifico || '-'}</td>
                  <td className="px-4 py-2">{direccionCompleta}</td>
                  <td className="px-4 py-2">{r.serie_impresora}</td>

                  {/* #################### SKU CON TAMAÑO FIJO #################### */}
                  <td className="px-4 py-2">
                    {editingRow === r.id_requerimiento && editableSku ? (
                      <select
                        className="border rounded p-1 text-sm bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 w-full min-w-[150px]"
                        value={r.cod_sku}
                        onChange={(e) => handleUpdate(r.id_requerimiento, 'cod_sku', e.target.value)}
                        onBlur={() => setEditingRow(null)}
                        autoFocus
                      >
                        {skuCompatibles.map((sku) => (
                          <option key={sku.cod_sku} value={sku.cod_sku}>
                            {sku.cod_sku} - {sku.cantidad}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        onClick={() => editableSku && setEditingRow(r.id_requerimiento)}
                        className={`cursor-pointer transition-colors duration-150 ${
                          editableSku
                            ? 'text-blue-600 hover:text-blue-800 hover:underline'
                            : 'text-gray-500'
                        }`}
                      >
                        {r.cod_sku || '-'}
                      </span>
                    )}
                  </td>
                  {/* #################### FIN SKU #################### */}

                  <td className="px-4 py-2">{r.porcentaje ?? '-'}%</td>
                  <td className="px-4 py-2">{r.dias_restantes ?? '-'}</td>
                  <td className="px-4 py-2">
                    {r.timestamp_registro
                      ? new Date(r.timestamp_registro).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '-'}
                  </td>

                  {/* #################### ESTADO CON TAMAÑO FIJO #################### */}
                  <td className="px-4 py-2">
                    {editable ? (
                      <select
                        className="border rounded p-1 text-xs font-medium capitalize bg-white shadow-sm w-full min-w-[100px]"
                        value={r.estado}
                        onChange={(e) => handleUpdate(r.id_requerimiento, 'estado', e.target.value)}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="sin stock">Sin Stock</option>
                        <option value="aprobado">Aprobado</option>
                      </select>
                    ) : (
                      <span className="capitalize">{r.estado}</span>
                    )}
                  </td>
                  {/* #################### FIN ESTADO #################### */}

                  <td className="px-4 py-2">
                    {editable && (
                      <button
                        onClick={onRefresh}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium transition duration-150 p-1 rounded hover:bg-blue-50"
                      >
                        ↻ Refrescar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedRows.length === 0 && (
          <div className="text-center text-gray-500 p-6">No hay requerimientos disponibles.</div>
        )}
      </div>
    </>
  );
}