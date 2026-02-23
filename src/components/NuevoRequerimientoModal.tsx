'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { X, Plus } from 'lucide-react';

type Cliente = { id_cliente: number; nombre_especifico: string };
type Serie = { serie: string; id_modelo: number };
type SkuItem = { cod_sku: string; nombre: string; color: string };

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    userId?: string;
}

/** Valida y convierte fecha dd/mm/yyyy a formato ISO YYYY-MM-DD */
function parseFecha(fechaStr: string): { iso: string | null; error: string } {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = fechaStr.match(regex);
    if (!match) return { iso: null, error: 'Formato inválido. Use dd/mm/yyyy' };

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const año = parseInt(match[3], 10);

    if (mes < 1 || mes > 12) return { iso: null, error: 'Mes inválido (1-12)' };
    if (dia < 1 || dia > 31) return { iso: null, error: 'Día inválido (1-31)' };

    const diasPorMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (mes === 2 && ((año % 4 === 0 && año % 100 !== 0) || año % 400 === 0)) {
        diasPorMes[1] = 29;
    }
    if (dia > diasPorMes[mes - 1]) return { iso: null, error: `Día inválido para ${mes}/${año}` };

    return {
        iso: `${año}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`,
        error: '',
    };
}

export function NuevoRequerimientoModal({ isOpen, onClose, onSuccess, userId }: Props) {
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [series, setSeries] = useState<Serie[]>([]);
    const [skus, setSkus] = useState<SkuItem[]>([]);

    const [filtroCliente, setFiltroCliente] = useState('');
    const [clienteSeleccionado, setClienteSeleccionado] = useState<number | null>(null);
    const [clienteBloqueado, setClienteBloqueado] = useState(false);

    const [filtroSerie, setFiltroSerie] = useState('');
    const [serieSeleccionada, setSerieSeleccionada] = useState<string | null>(null);
    const [serieBloqueada, setSerieBloqueada] = useState(false);

    const [filtroSku, setFiltroSku] = useState('');
    const [skuSeleccionado, setSkuSeleccionado] = useState<string | null>(null);
    const [skuDropdownOpen, setSkuDropdownOpen] = useState(false);

    const [fechaInstalacion, setFechaInstalacion] = useState('');
    const [fechaError, setFechaError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const resetForm = () => {
        setFiltroCliente(''); setClienteSeleccionado(null); setClienteBloqueado(false);
        setFiltroSerie(''); setSerieSeleccionada(null); setSerieBloqueada(false);
        setFiltroSku(''); setSkuSeleccionado(null); setSkuDropdownOpen(false);
        setSeries([]); setSkus([]);
        setFechaInstalacion(''); setFechaError('');
    };

    const handleClose = () => { resetForm(); onClose(); };

    // Cargar clientes al montar
    useEffect(() => {
        supabase
            .from('clientes')
            .select('id_cliente, nombre_especifico')
            .order('nombre_especifico', { ascending: true })
            .then(({ data }) => setClientes(data || []));
    }, []);

    // Cargar series cuando cambia el cliente
    useEffect(() => {
        if (!clienteSeleccionado) { setSeries([]); setFiltroSerie(''); setSerieSeleccionada(null); return; }
        supabase
            .from('impresora')
            .select('serie, id_modelo')
            .eq('id_cliente', clienteSeleccionado)
            .order('serie', { ascending: true })
            .then(({ data }) => setSeries(data || []));
    }, [clienteSeleccionado]);

    // Cargar SKUs según el modelo de la serie
    useEffect(() => {
        if (!serieSeleccionada) { setSkus([]); return; }
        const fetchSkus = async () => {
            const { data: imp } = await supabase
                .from('impresora').select('id_modelo').eq('serie', serieSeleccionada).single();
            if (!imp?.id_modelo) return;

            const { data } = await supabase
                .from('compatibilidad')
                .select('cod_sku, sku(nombre, color:color(nombre))')
                .eq('id_modelo', imp.id_modelo);

            setSkus(
                (data || []).map((item: any) => ({
                    cod_sku: item.cod_sku,
                    nombre: item.sku?.nombre || '',
                    color: item.sku?.color?.nombre || '',
                }))
            );
        };
        fetchSkus();
    }, [serieSeleccionada]);

    const handleFechaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) value = value.slice(0, 2) + '/' + value.slice(2);
        if (value.length >= 5) value = value.slice(0, 5) + '/' + value.slice(5, 9);
        setFechaInstalacion(value);
        if (value.length === 10) setFechaError(parseFecha(value).error);
        else setFechaError('');
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!clienteSeleccionado || !serieSeleccionada || !skuSeleccionado) {
            alert('Completa todos los campos obligatorios.');
            return;
        }

        let fechaISO: string | null = null;
        if (fechaInstalacion) {
            const { iso, error } = parseFecha(fechaInstalacion);
            if (!iso) { alert('La fecha de instalación no es válida: ' + error); return; }
            fechaISO = iso;
        }

        const form = e.currentTarget;
        const porcentaje = parseInt((form.elements.namedItem('porcentaje') as HTMLInputElement).value);
        const diasRestantes = parseInt((form.elements.namedItem('dias_restantes') as HTMLInputElement).value);
        const obs = (form.elements.namedItem('observacion') as HTMLTextAreaElement).value;

        setSubmitting(true);
        const { error } = await supabase.from('requerimiento').insert([{
            id_cliente: clienteSeleccionado,
            serie_impresora: serieSeleccionada,
            cod_sku: skuSeleccionado,   // SKU Enviado
            sku_default: skuSeleccionado, // SKU Default — mismo valor al crear
            porcentaje,
            dias_restantes: diasRestantes,
            fecha_instalacion: fechaISO,
            observacion: obs,
            creado_por: userId,
        }]);
        setSubmitting(false);

        if (error) {
            alert('Error al guardar: ' + error.message);
        } else {
            handleClose();
            onSuccess();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Nuevo Requerimiento</h2>
                    <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Cerrar">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* CLIENTE */}
                    <label className="block relative">
                        <span className="text-sm font-medium text-gray-700">Cliente</span>
                        <input
                            type="text"
                            className="border rounded p-2 w-full mt-1 disabled:bg-gray-100"
                            placeholder="Buscar cliente..."
                            value={filtroCliente}
                            disabled={clienteBloqueado}
                            onFocus={() => setFiltroCliente('')}
                            onChange={(e) => {
                                setFiltroCliente(e.target.value);
                                setClienteSeleccionado(null); setSerieSeleccionada(null); setSkuSeleccionado(null);
                                setSkus([]); setSeries([]); setSerieBloqueada(false);
                            }}
                            autoComplete="off"
                        />
                        {!clienteBloqueado && clientes.length > 0 && filtroCliente && (
                            <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                                {clientes
                                    .filter(c => c.nombre_especifico.toLowerCase().includes(filtroCliente.toLowerCase()))
                                    .slice(0, 20)
                                    .map(c => (
                                        <li key={c.id_cliente}
                                            onClick={() => {
                                                setClienteSeleccionado(c.id_cliente); setFiltroCliente(c.nombre_especifico);
                                                setClienteBloqueado(true); setSerieSeleccionada(null); setSkuSeleccionado(null);
                                                setSkus([]); setSeries([]);
                                            }}
                                            className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                                        >
                                            {c.nombre_especifico}
                                        </li>
                                    ))}
                            </ul>
                        )}
                        {clienteBloqueado && (
                            <button type="button" onClick={() => { setClienteBloqueado(false); setFiltroCliente(''); setClienteSeleccionado(null); }}
                                className="absolute right-2 top-8 text-xs text-blue-600 hover:underline">
                                Cambiar
                            </button>
                        )}
                    </label>

                    {/* SERIE */}
                    <label className="block relative">
                        <span className="text-sm font-medium text-gray-700">Serie Impresora</span>
                        <input
                            type="text"
                            className="border rounded p-2 w-full mt-1 disabled:bg-gray-100"
                            placeholder={!clienteSeleccionado ? 'Selecciona primero un cliente' : 'Buscar serie...'}
                            value={filtroSerie}
                            disabled={!clienteSeleccionado || serieBloqueada}
                            onFocus={() => setFiltroSerie('')}
                            onChange={(e) => setFiltroSerie(e.target.value)}
                            autoComplete="off"
                        />
                        {!serieBloqueada && series.length > 0 && filtroSerie && clienteSeleccionado && (
                            <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                                {series
                                    .filter(s => s.serie.toLowerCase().includes(filtroSerie.toLowerCase()))
                                    .slice(0, 20)
                                    .map(s => (
                                        <li key={s.serie}
                                            onClick={() => {
                                                setSerieSeleccionada(s.serie); setFiltroSerie(s.serie);
                                                setSerieBloqueada(true); setSkuSeleccionado(null); setSkus([]);
                                            }}
                                            className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                                        >
                                            {s.serie}
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </label>

                    {/* SKU */}
                    <label className="block relative">
                        <span className="text-sm font-medium text-gray-700">Código SKU</span>
                        <input
                            type="text"
                            className="border rounded p-2 w-full mt-1 cursor-pointer disabled:bg-gray-100"
                            placeholder={!serieSeleccionada ? 'Selecciona primero una serie' : 'Seleccionar SKU...'}
                            value={filtroSku}
                            disabled={!serieSeleccionada}
                            onClick={() => serieSeleccionada && setSkuDropdownOpen(!skuDropdownOpen)}
                            readOnly
                            autoComplete="off"
                        />
                        {skuDropdownOpen && skus.length > 0 && (
                            <ul className="absolute z-10 bg-white border rounded-md mt-1 w-full max-h-48 overflow-y-auto shadow-lg">
                                {skus.map(s => (
                                    <li key={s.cod_sku}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setSkuSeleccionado(s.cod_sku);
                                            setFiltroSku(`${s.cod_sku} — ${s.color}`);
                                            setSkuDropdownOpen(false);
                                        }}
                                        className="px-3 py-2 hover:bg-blue-100 cursor-pointer flex justify-between text-sm"
                                    >
                                        <span>{s.cod_sku}</span>
                                        <span className="text-gray-500">{s.color}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </label>

                    {/* PORCENTAJE */}
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Porcentaje</span>
                        <input name="porcentaje" type="number" min={0} max={100} defaultValue={0}
                            className="border rounded p-2 w-full mt-1" required />
                    </label>

                    {/* DÍAS RESTANTES */}
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Días Restantes</span>
                        <input name="dias_restantes" type="number" min={0} defaultValue={0}
                            className="border rounded p-2 w-full mt-1" required />
                    </label>

                    {/* FECHA INSTALACIÓN */}
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Fecha de Instalación (dd/mm/yyyy)</span>
                        <input
                            type="text"
                            value={fechaInstalacion}
                            onChange={handleFechaChange}
                            placeholder="dd/mm/yyyy"
                            maxLength={10}
                            className={`border rounded p-2 w-full mt-1 ${fechaError ? 'border-red-500' : ''}`}
                        />
                        {fechaError && <span className="text-red-500 text-xs mt-1">{fechaError}</span>}
                    </label>

                    {/* OBSERVACIÓN */}
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Observación</span>
                        <textarea name="observacion" className="border rounded p-2 w-full mt-1" rows={3} />
                    </label>

                    {/* BOTONES */}
                    <div className="flex justify-between pt-2">
                        <button type="button" onClick={resetForm}
                            className="bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200 text-sm">
                            Reiniciar
                        </button>
                        <div className="flex gap-2">
                            <button type="button" onClick={handleClose}
                                className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 text-sm">
                                Cancelar
                            </button>
                            <button type="submit" disabled={submitting}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                {submitting ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
