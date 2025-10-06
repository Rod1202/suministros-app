// src/app/dashboard/requirements/HistoricoDebug.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader } from '@/components/Loader';
import { ErrorMessage } from '@/components/ErrorMessage';

// Define un tipo simple para el histórico
type HistoricoItem = {
    id_historico: number;
    serie_impresora: string;
    id_cliente: number;
    cod_sku: string;
    estado: string;
    // Puedes incluir más campos si quieres verlos todos
};

export function HistoricoDebug() {
    const [historicoRows, setHistoricoRows] = useState<HistoricoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistorico = async () => {
            try {
                setLoading(true);
                setError(null);

                // 🛑 CONSULTA DIRECTA A LA TABLA REQUERIMIENTO_HISTORICO
                const { data, error: fetchError } = await supabase
                    .from('requerimiento_historico')
                    .select(`
                        id_historico,
                        serie_impresora,
                        id_cliente,
                        cod_sku,
                        estado,
                        fecha_atencion,
                        timestamp_archivado
                    `)
                    .order('timestamp_archivado', { ascending: false })
                    .limit(100); // Mantén el límite para evitar cargas pesadas

                if (fetchError) throw fetchError;

                // 🔴 PUNTO CLAVE DE DEPURACIÓN: Verifica los datos crudos en la consola
                console.log("DEBUG: Datos Crudos de requerimiento_historico recibidos:", data);

                setHistoricoRows(data as HistoricoItem[] || []);

            } catch (err: any) {
                console.error("DEBUG: Error al cargar el histórico:", err.message);
                setError(err.message || 'Error desconocido al cargar datos del histórico.');
            } finally {
                setLoading(false);
            }
        };

        fetchHistorico();
    }, []);

    if (loading) return <Loader />;
    if (error) return <ErrorMessage message={error} />;
    
    // ------------------------------------------
    // Renderizado simple para verificación visual
    // ------------------------------------------

    return (
        <div className="p-4 border rounded-lg bg-red-50 border-red-300">
            <h2 className="text-xl font-bold text-red-700 mb-4">
                🔴 MODO DEPURACIÓN: Requerimientos Históricos Crudos
            </h2>
            
            {historicoRows.length === 0 ? (
                <p className="text-lg text-red-600">
                    No se encontraron registros en requerimiento_historico. 
                    Por favor, verifica las **Políticas RLS** de Supabase.
                </p>
            ) : (
                <div className="space-y-2">
                    <p className="font-semibold">Total de Registros Encontrados: {historicoRows.length}</p>
                    <div className="max-h-96 overflow-y-auto border p-2 bg-white">
                        {historicoRows.map((row) => (
                            <div key={row.id_historico} className="p-2 border-b last:border-b-0 text-sm">
                                <strong>ID: {row.id_historico}</strong> | 
                                **Cliente ID:** {row.id_cliente} | 
                                **Serie:** {row.serie_impresora} | 
                                **SKU:** {row.cod_sku} |
                                **Estado:** <span className="font-bold text-green-700">{row.estado}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Nota: Recuerda crear los componentes Loader y ErrorMessage si no existen, o reemplazarlos
// con elementos HTML simples (div, p) para no interrumpir la depuración.