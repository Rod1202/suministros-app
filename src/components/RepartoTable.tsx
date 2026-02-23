'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowUpDown, CheckCircle, Clock, Truck } from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RepartoRow = {
    // Campos de requerimiento activo
    id_requerimiento?: number;
    // Campos de historico
    id_historico?: number;
    serie_impresora: string | null;
    id_cliente: number | null;
    cod_sku: string | null;
    estado: string;
    guia: string | null;
    fecha_atencion?: string | null;
    nombre_contacto?: string | null;
    numero_contacto?: string | null;
    departamento?: string | null;
    provincia?: string | null;
    direccion?: string | null;
    clientes?: { nombre_especifico: string } | null;
    impresora?: { direccion?: string | null; provincia?: string | null } | null;
    /** 'activo' = viene de requerimiento | 'historico' = de requerimiento_historico */
    fuente: 'activo' | 'historico';
};

type Props = {
    pendingRows: RepartoRow[];   // requerimiento con guia != null
    attendedRows: RepartoRow[];  // requerimiento_historico con guia != null
    onRefresh: () => void;
};

type FilterType = 'pendiente' | 'atendido';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function RepartoTable({ pendingRows, attendedRows, onRefresh }: Props) {
    const [filter, setFilter] = useState<FilterType>('pendiente');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
        key: '', direction: null,
    });
    const [loadingId, setLoadingId] = useState<number | null>(null);

    const activeRows = filter === 'pendiente' ? pendingRows : attendedRows;

    // ── Ordenamiento ──────────────────────────────────────────────────────────
    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                if (prev.direction === 'desc') return { key: '', direction: null };
            }
            return { key, direction: 'asc' };
        });
    };

    const sortedRows = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return activeRows;
        return [...activeRows].sort((a, b) => {
            let av: any = sortConfig.key === 'cliente'
                ? a.clientes?.nombre_especifico
                : (a as any)[sortConfig.key];
            let bv: any = sortConfig.key === 'cliente'
                ? b.clientes?.nombre_especifico
                : (b as any)[sortConfig.key];
            if (av == null) return 1;
            if (bv == null) return -1;
            const res = av < bv ? -1 : av > bv ? 1 : 0;
            return sortConfig.direction === 'asc' ? res : -res;
        });
    }, [activeRows, sortConfig]);

    // ── Acción: marcar como atendido ─────────────────────────────────────────
    const marcarAtendido = async (row: RepartoRow) => {
        if (!row.id_requerimiento) return;
        setLoadingId(row.id_requerimiento);

        // Registramos la fecha y hora exacta del momento en que se presiona "Atendido"
        const ahora = new Date().toISOString();

        const { error } = await supabase
            .from('requerimiento')
            .update({
                estado: 'atendido',
                fecha_atencion: ahora,   // ← fecha/hora del sistema al momento de atender
            })
            .eq('id_requerimiento', row.id_requerimiento);
        setLoadingId(null);

        if (error) {
            console.error('Error al marcar como atendido:', error);
            alert('Error al actualizar: ' + error.message);
        } else {
            onRefresh();
        }
    };

    // ── Columnas ──────────────────────────────────────────────────────────────
    const COLUMNS = [
        { key: 'cliente', label: 'Cliente' },
        { key: 'dir_provincia', label: 'Dirección - Provincia' },
        { key: 'contacto', label: 'Contacto' },
        { key: 'serie_impresora', label: 'Serie' },
        { key: 'cod_sku', label: 'SKU Enviado' },
        { key: 'guia', label: 'Guía' },
        { key: 'estado', label: 'Estado' },
        { key: 'fecha_atencion', label: 'Fecha Atención' },
    ];

    return (
        <div className="space-y-4">

            {/* ── Filtro de estado ───────────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600 mr-1">Ver:</span>

                <button
                    onClick={() => setFilter('pendiente')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border
            ${filter === 'pendiente'
                            ? 'bg-amber-500 text-white border-amber-500 shadow'
                            : 'bg-white text-amber-600 border-amber-300 hover:bg-amber-50'}`}
                >
                    <Clock className="w-3.5 h-3.5" />
                    Pendientes
                    <span className="ml-1 text-xs font-bold bg-white/30 rounded-full px-1.5">
                        {pendingRows.length}
                    </span>
                </button>

                <button
                    onClick={() => setFilter('atendido')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border
            ${filter === 'atendido'
                            ? 'bg-green-600 text-white border-green-600 shadow'
                            : 'bg-white text-green-600 border-green-300 hover:bg-green-50'}`}
                >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Atendidos
                    <span className="ml-1 text-xs font-bold bg-white/30 rounded-full px-1.5">
                        {attendedRows.length}
                    </span>
                </button>
            </div>

            {/* ── Tabla ─────────────────────────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-xl shadow border border-gray-200 bg-white">
                <table className="min-w-full text-sm text-left text-gray-700">

                    <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                        <tr>
                            {COLUMNS.map(col => (
                                <th
                                    key={col.key}
                                    onClick={() => handleSort(col.key)}
                                    className="px-4 py-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-1">
                                        {col.label}
                                        <ArrowUpDown className={`w-3 h-3 ${sortConfig.key === col.key ? 'text-blue-500' : 'text-gray-400'}`} />
                                    </div>
                                </th>
                            ))}
                            {/* Acciones — solo en vista pendiente */}
                            {filter === 'pendiente' && (
                                <th className="px-4 py-3">Acción</th>
                            )}
                        </tr>
                    </thead>

                    <tbody>
                        {sortedRows.map((row, index) => {
                            const cliente = row.clientes?.nombre_especifico || '-';

                            const dir = row.direccion || row.impresora?.direccion || '-';
                            const prov = row.provincia || row.impresora?.provincia || '-';
                            const dirProv = dir !== '-' && prov !== '-' ? `${dir} - ${prov}`
                                : dir !== '-' ? dir
                                    : prov !== '-' ? prov
                                        : '-';

                            const contacto = row.nombre_contacto && row.numero_contacto
                                ? `${row.nombre_contacto} — ${row.numero_contacto}`
                                : row.nombre_contacto || row.numero_contacto || '-';

                            const rowKey = row.id_historico
                                ? `h-${row.id_historico}`
                                : row.id_requerimiento
                                    ? `r-${row.id_requerimiento}`
                                    : `i-${index}`;

                            const isLoading = loadingId === row.id_requerimiento;

                            return (
                                <tr key={rowKey} className="border-t hover:bg-gray-50 transition-colors">
                                    {/* Cliente */}
                                    <td className="px-4 py-2 font-medium text-gray-800">{cliente}</td>

                                    {/* Dirección - Provincia */}
                                    <td className="px-4 py-2 text-gray-600">{dirProv}</td>

                                    {/* Contacto */}
                                    <td className="px-4 py-2">
                                        {row.nombre_contacto || row.numero_contacto ? (
                                            <div>
                                                {row.nombre_contacto && (
                                                    <p className="font-medium text-gray-800">{row.nombre_contacto}</p>
                                                )}
                                                {row.numero_contacto && (
                                                    <p className="text-gray-500 text-xs">{row.numero_contacto}</p>
                                                )}
                                            </div>
                                        ) : '-'}
                                    </td>

                                    {/* Serie */}
                                    <td className="px-4 py-2 font-mono text-xs text-gray-700">
                                        {row.serie_impresora || '-'}
                                    </td>

                                    {/* SKU Enviado */}
                                    <td className="px-4 py-2">
                                        <span className="bg-blue-50 text-blue-700 font-mono text-xs px-2 py-0.5 rounded">
                                            {row.cod_sku || '-'}
                                        </span>
                                    </td>

                                    {/* Guía */}
                                    <td className="px-4 py-2">
                                        <span className="bg-gray-100 text-gray-700 font-mono text-xs px-2 py-0.5 rounded">
                                            {row.guia || '-'}
                                        </span>
                                    </td>

                                    {/* Estado */}
                                    <td className="px-4 py-2">
                                        {filter === 'pendiente' ? (
                                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">
                                                <Truck className="w-3 h-3" />
                                                En tránsito
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                                                <CheckCircle className="w-3 h-3" />
                                                Atendido
                                            </span>
                                        )}
                                    </td>

                                    {/* Fecha Atención */}
                                    <td className="px-4 py-2 text-gray-600">
                                        {formatDate(row.fecha_atencion)}
                                    </td>

                                    {/* Acción — solo en pendientes */}
                                    {filter === 'pendiente' && (
                                        <td className="px-4 py-2">
                                            <button
                                                onClick={() => marcarAtendido(row)}
                                                disabled={isLoading}
                                                title="Marcar como atendido"
                                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                {isLoading ? 'Guardando...' : 'Atendido'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {sortedRows.length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                        <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">
                            {filter === 'pendiente'
                                ? 'No hay entregas pendientes con guía asignada.'
                                : 'No hay entregas atendidas registradas.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
