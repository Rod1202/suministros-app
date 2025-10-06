// src/app/dashboard/page.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/hooks/useUserRole';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type KPI = {
  pendientes: number;
  sinStock: number;
  atendidosMes: number;
  enTransito: number;
};

type MonthPoint = {
  month: string; // "Ene", "Feb", ...
  value: number;
};

type TopItem = { key: string; count: number };

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // e.g. "2025-03"
}

function monthLabelFromKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]}`;
}

export default function DashboardPage() {
  const { profile, loading: authLoading } = useUserRole();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [kpi, setKpi] = useState<KPI>({ pendientes: 0, sinStock: 0, atendidosMes: 0, enTransito: 0 });
  const [monthlyData, setMonthlyData] = useState<MonthPoint[]>([]);
  const [topClients, setTopClients] = useState<TopItem[]>([]);
  const [topSkusSinStock, setTopSkusSinStock] = useState<TopItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Utility: last 12 month keys incl. current
  const last12MonthKeys = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(monthKeyFromDate(d));
    }
    return keys;
  }, []);

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    try {
      // 1) Fetch active requerimientos
      const { data: reqData, error: reqError } = await supabase
        .from('requerimiento')
        .select('*');

      if (reqError) throw reqError;

      // 2) Fetch historical requerimientos
      const { data: histData, error: histError } = await supabase
        .from('requerimiento_historico')
        .select('*');

      if (histError) throw histError;

      // Combine sources for some aggregations
      const active = Array.isArray(reqData) ? reqData : [];
      const hist = Array.isArray(histData) ? histData : [];

      // -------------------------
      // KPI: pendientes, sin stock, en transito --> mostly in active table
      // -------------------------
      const pendientes = active.filter((r: any) => r.estado === 'pendiente').length;
      const sinStock = active.filter((r: any) => r.estado === 'sin stock').length;
      const enTransito = active.filter((r: any) => r.estado === 'transito').length;

      // -------------------------
      // KPI: atendidos en el mes -> from historico (or active if any)
      // -------------------------
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // hist entries with fecha_atencion in current month and estado = 'atendido'
      const atendidosMes = hist.filter((h: any) => {
        if (!h.fecha_atencion) return false;
        const d = new Date(h.fecha_atencion);
        return d >= startOfMonth && d < endOfMonth && h.estado === 'atendido';
      }).length;

      setKpi({ pendientes, sinStock, atendidosMes, enTransito });

      // -------------------------
      // Monthly trend: solicitudes por mes (last 12 months) using fecha_solicitud from historico
      // We'll combine historical + active (some recent might still be active)
      // -------------------------
      const combinedForTrend: any[] = [
        ...hist.map((h: any) => ({ fecha_solicitud: h.fecha_solicitud })),
        ...active.map((r: any) => ({ fecha_solicitud: r.fecha_solicitud })),
      ];

      // Build a map monthKey -> count
      const monthCountMap: Record<string, number> = {};
      last12MonthKeys.forEach(k => (monthCountMap[k] = 0));

      combinedForTrend.forEach((row) => {
        if (!row || !row.fecha_solicitud) return;
        const d = new Date(row.fecha_solicitud);
        const key = monthKeyFromDate(d);
        if (Object.prototype.hasOwnProperty.call(monthCountMap, key)) {
          monthCountMap[key] += 1;
        }
      });

      const monthlyPoints: MonthPoint[] = last12MonthKeys.map(k => ({
        month: monthLabelFromKey(k),
        value: monthCountMap[k] || 0,
      }));
      setMonthlyData(monthlyPoints);

      // -------------------------
      // Top clientes atendidos (este mes) from historico
      // -------------------------
      const clientCount: Record<string, number> = {};
      hist.forEach((h: any) => {
        if (!h || h.estado !== 'atendido' || !h.fecha_atencion) return;
        const d = new Date(h.fecha_atencion);
        if (d >= startOfMonth && d < endOfMonth) {
          const cliente = (h.cliente || 'Sin cliente').toString();
          clientCount[cliente] = (clientCount[cliente] || 0) + 1;
        }
      });
      const topClientsArr = Object.entries(clientCount)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopClients(topClientsArr);

      // -------------------------
      // Top suministros sin stock (actual) from active table (estado = 'sin stock')
      // -------------------------
      const skuCount: Record<string, number> = {};
      active.forEach((r: any) => {
        if (!r || r.estado !== 'sin stock') return;
        const sku = (r.sku || 'SIN SKU').toString();
        skuCount[sku] = (skuCount[sku] || 0) + 1;
      });
      const topSkusArr = Object.entries(skuCount)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopSkusSinStock(topSkusArr);

      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error cargando dashboard:', err);
      setError(err?.message || 'Error al cargar datos del dashboard');
    } finally {
      setLoading(false);
    }
  }, [profile, last12MonthKeys]);

  useEffect(() => {
    if (!authLoading && profile) {
      fetchAll();
    }
  }, [authLoading, profile, fetchAll]);

  // UI helpers
  const refresh = () => fetchAll();

  // Simple KPI card
  const KpiCard: React.FC<{ title: string; value: number; hint?: string }> = ({ title, value, hint }) => (
    <div className="bg-white rounded-lg p-4 shadow-sm border">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-800 mt-2">{value}</div>
      {hint && <div className="text-xs text-green-600 mt-1">{hint}</div>}
    </div>
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-indigo-600 text-xl font-semibold">Cargando dashboard...</div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Panel</h2>
        <p className="text-sm text-gray-500 mt-1">Resumen de operaciones y análisis</p>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Pendientes" value={kpi.pendientes} />
        <KpiCard title="Total Sin Stock" value={kpi.sinStock} />
        <KpiCard title="Atendidos en el Mes" value={kpi.atendidosMes} />
        <KpiCard title="En Tránsito" value={kpi.enTransito} />
      </section>

      {/* Main area: chart + detail boxes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart area spanning 2 cols on large screens */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-5 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Histórico de Solicitudes</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={refresh}
                className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
              >
                Refrescar
              </button>
              <Link href="/dashboard/requirements" className="text-sm text-blue-600 hover:underline">
                Ver Requerimientos
              </Link>
            </div>
          </div>

          <div className="text-sm text-gray-500 mb-4">Solicitudes por Mes (últimos 12 meses)</div>

          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#0066ff" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Última actualización: {lastUpdated ? lastUpdated.toLocaleString() : '—'}
          </div>
        </div>

        {/* Right column: analysis cards */}
        <div className="space-y-6">
          {/* Top clientes atendidos */}
          <div className="bg-white rounded-xl shadow p-5 border">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-800">Top Clientes Atendidos</h4>
                <p className="text-sm text-gray-500">Este Mes</p>
              </div>
              <Link href="/dashboard/clients" className="text-sm text-blue-600 hover:underline">Ver</Link>
            </div>

            <div className="mt-4 space-y-3">
              {topClients.length === 0 ? (
                <div className="text-sm text-gray-500">No hay registros.</div>
              ) : (
                topClients.map((c, idx) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-800 w-8">{idx + 1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{c.key}</div>
                      <div className="h-2 bg-gray-100 rounded mt-2 overflow-hidden">
                        <div
                          className="h-2 bg-blue-500 rounded"
                          style={{ width: `${Math.min(100, (c.count / (topClients[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 font-medium">{c.count}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top suministros sin stock */}
          <div className="bg-white rounded-xl shadow p-5 border">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-800">Top Suministros Sin Stock</h4>
                <p className="text-sm text-gray-500">Actual</p>
              </div>
              <Link href="/dashboard/sku" className="text-sm text-blue-600 hover:underline">Ver</Link>
            </div>

            <div className="mt-4 space-y-3">
              {topSkusSinStock.length === 0 ? (
                <div className="text-sm text-gray-500">No hay registros.</div>
              ) : (
                topSkusSinStock.map((s, idx) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-800 w-8">{idx + 1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{s.key}</div>
                      <div className="h-2 bg-gray-100 rounded mt-2 overflow-hidden">
                        <div
                          className="h-2 bg-red-500 rounded"
                          style={{ width: `${Math.min(100, (s.count / (topSkusSinStock[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 font-medium">{s.count}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Optional: footer or extra analytics */}
      <footer className="mt-8 text-sm text-gray-500">
        Datos extraídos de <strong>requerimientos</strong> y <strong>requerimiento_historico</strong>.
      </footer>

      {/* Error notice */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-50 border border-red-200 text-red-700 p-3 rounded shadow">
          {error}
        </div>
      )}
    </div>
  );
}
