// components/dashboard-view.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface Client {
  id: string;
  name: string;
  ad_account_id: string;
  currency: string;
}

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "7 dias" },
  { value: "last_14d", label: "14 dias" },
  { value: "last_30d", label: "30 dias" },
  { value: "this_month", label: "Este mês" },
];

const RESULT_LABELS: Record<string, string> = {
  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras",
  lead: "Leads",
  "offsite_conversion.fb_pixel_lead": "Leads",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas",
  landing_page_view: "Visitas à página",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");

export default function DashboardView({
  userName,
  isAdmin,
  clients,
}: {
  userName: string;
  isAdmin: boolean;
  clients: Client[];
}) {
  const [clientId, setClientId] = useState(clients[0].id);
  const [period, setPeriod] = useState("last_7d");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/insights?client_id=${clientId}&period=${period}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, period]);

  useEffect(() => {
    load();
  }, [load]);

  const acc = data?.account;
  const resultLabel = acc?.resultType
    ? RESULT_LABELS[acc.resultType] ?? "Resultados"
    : "Resultados";

  const kpis = acc
    ? [
        { label: "Investimento", value: brl(Number(acc.spend)) },
        { label: resultLabel, value: num(acc.results) },
        {
          label: `Custo por ${resultLabel.toLowerCase().replace(/s$/, "")}`,
          value: acc.costPerResult ? brl(acc.costPerResult) : "-",
        },
        { label: "Impressões", value: num(Number(acc.impressions)) },
        { label: "Cliques", value: num(Number(acc.clicks)) },
        { label: "CTR", value: `${Number(acc.ctr).toFixed(2)}%` },
        { label: "CPC", value: brl(Number(acc.cpc)) },
        { label: "CPM", value: brl(Number(acc.cpm)) },
      ]
    : [];

  const chartData =
    data?.daily?.map((d: any) => ({
      date: new Date(d.date_start + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      investimento: Number(d.spend),
    })) ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-900 px-6 py-4 flex flex-wrap items-center gap-4">
        <div className="mr-auto">
          <h1 className="font-semibold">
            {isAdmin ? "LinoADS — Visão geral" : data?.client?.name ?? ""}
          </h1>
          <p className="text-xs text-neutral-500">Olá, {userName}</p>
        </div>

        {isAdmin && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                period === p.value
                  ? "bg-white text-neutral-950 font-medium"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="text-xs border border-neutral-800 rounded-lg px-3 py-2 text-neutral-300 hover:border-neutral-600 disabled:opacity-50"
        >
          {loading ? "Atualizando..." : "Atualizar agora"}
        </button>
      </header>

      <div className="p-6 max-w-7xl mx-auto">
        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {(loading && !data ? Array(8).fill(null) : kpis).map((kpi, i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4"
            >
              {kpi ? (
                <>
                  <p className="text-xs text-neutral-500 mb-1">{kpi.label}</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {kpi.value}
                  </p>
                </>
              ) : (
                <div className="h-12 animate-pulse bg-neutral-900 rounded" />
              )}
            </div>
          ))}
        </section>

        {/* Gráfico diário */}
        {chartData.length > 1 && (
          <section className="rounded-xl border border-neutral-900 p-4 mb-8">
            <p className="text-sm text-neutral-400 mb-4">
              Investimento por dia
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#525252"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `R$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#171717",
                    border: "1px solid #262626",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => [brl(v), "Investimento"]}
                />
                <Area
                  type="monotone"
                  dataKey="investimento"
                  stroke="#fff"
                  strokeWidth={2}
                  fill="url(#spend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}

        {/* Campanhas */}
        <section className="rounded-xl border border-neutral-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-900 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">Campanha</th>
                  <th className="px-4 py-3 font-medium text-right">Invest.</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Resultados
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Custo/result.
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Cliques</th>
                  <th className="px-4 py-3 font-medium text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {(data?.campaigns ?? []).map((c: any) => (
                  <tr
                    key={c.campaign_id}
                    className="border-b border-neutral-900/60 hover:bg-neutral-900/40"
                  >
                    <td className="px-4 py-3">{c.campaign_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {brl(Number(c.spend))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {num(c.results)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.costPerResult ? brl(c.costPerResult) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {num(Number(c.clicks))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(c.ctr).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {data?.fetched_at && (
          <p className="text-xs text-neutral-600 mt-4">
            Dados da Meta atualizados em{" "}
            {new Date(data.fetched_at).toLocaleString("pt-BR")}. A Meta pode
            levar até algumas horas para consolidar resultados do dia.
          </p>
        )}
      </div>
    </main>
  );
}
