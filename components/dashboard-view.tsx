// components/dashboard-view.tsx — LinoADS v2
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

// Gradiente único por cliente (mesma lógica do ERP LinoADS)
const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-violet-600",
];
function clientGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

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

  const activeClient = clients.find((c) => c.id === clientId) ?? clients[0];

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

  const secondary = acc
    ? [
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

  const totalSpend = Number(acc?.spend ?? 0);

  return (
    <main className="min-h-screen">
      {/* ===== Topbar ===== */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[rgba(10,10,11,0.85)] backdrop-blur px-5 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 mr-auto">
          <span className="font-[family-name:var(--font-display)] font-bold tracking-tight text-lg">
            Lino<span className="text-[var(--accent)]">ADS</span>
          </span>
          <span className="hidden sm:block text-neutral-600">/</span>
          <span className="hidden sm:block text-sm text-neutral-400">
            Portal do cliente
          </span>
        </div>

        {isAdmin && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <span className="text-xs text-neutral-500">{userName}</span>
      </header>

      <div className="px-5 py-8 max-w-6xl mx-auto">
        {/* ===== Identidade do cliente + período ===== */}
        <section className="flex flex-wrap items-center gap-4 mb-8">
          <div
            className={`h-12 w-12 rounded-xl bg-gradient-to-br ${clientGradient(
              activeClient.name
            )} grid place-items-center font-[family-name:var(--font-display)] font-bold text-lg shadow-lg`}
          >
            {activeClient.name.charAt(0)}
          </div>
          <div className="mr-auto">
            <h1 className="font-[family-name:var(--font-display)] font-semibold text-xl leading-tight">
              {activeClient.name}
            </h1>
            <p className="text-xs text-neutral-500 flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full glow-dot ${
                  error ? "text-[var(--negative)] bg-[var(--negative)]" : "text-[var(--positive)] bg-[var(--positive)]"
                }`}
              />
              {error ? "Falha na sincronização" : "Sincronizado com a Meta"}
            </p>
          </div>

          <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  period === p.value
                    ? "bg-[var(--accent)] text-neutral-950 font-semibold"
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
            className="text-xs border border-[var(--border)] rounded-lg px-3 py-2 text-neutral-300 hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 transition"
          >
            {loading ? "Atualizando..." : "Atualizar agora"}
          </button>
        </section>

        {error && (
          <div className="mb-8 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ===== Hero: a pergunta do cliente ===== */}
        <section className="grid md:grid-cols-3 gap-3 mb-3">
          {[
            { label: "Investimento", value: acc ? brl(totalSpend) : null, hero: false },
            { label: resultLabel, value: acc ? num(acc.results) : null, hero: true },
            {
              label: `Custo por ${resultLabel.toLowerCase().replace(/s$/, "")}`,
              value: acc ? (acc.costPerResult ? brl(acc.costPerResult) : "—") : null,
              hero: false,
            },
          ].map((kpi, i) => (
            <div
              key={i}
              className={`card-hover rounded-2xl border p-6 ${
                kpi.hero
                  ? "border-[var(--accent)]/40 bg-gradient-to-b from-[#a78bfa14] to-transparent"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <p className="text-xs uppercase tracking-widest text-neutral-500 mb-2">
                {kpi.label}
              </p>
              {kpi.value !== null ? (
                <p
                  className={`font-[family-name:var(--font-display)] font-bold tabular-nums ${
                    kpi.hero ? "text-4xl text-[var(--accent)]" : "text-3xl"
                  }`}
                >
                  {kpi.value}
                </p>
              ) : (
                <div className="h-10 animate-pulse bg-[var(--surface-2)] rounded" />
              )}
            </div>
          ))}
        </section>

        {/* ===== KPIs secundários ===== */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
          {(loading && !data ? Array(5).fill(null) : secondary).map(
            (kpi, i) => (
              <div
                key={i}
                className="card-hover rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                {kpi ? (
                  <>
                    <p className="text-[11px] text-neutral-500">{kpi.label}</p>
                    <p className="font-[family-name:var(--font-display)] font-semibold tabular-nums">
                      {kpi.value}
                    </p>
                  </>
                ) : (
                  <div className="h-9 animate-pulse bg-[var(--surface-2)] rounded" />
                )}
              </div>
            )
          )}
        </section>

        {/* ===== Gráfico diário ===== */}
        {chartData.length > 1 && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-10">
            <p className="text-sm text-neutral-400 mb-4">
              Investimento por dia
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f1f23" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#52525b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `R$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#17171a",
                    border: "1px solid #2e2e35",
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [brl(v), "Investimento"]}
                />
                <Area
                  type="monotone"
                  dataKey="investimento"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#spend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}

        {/* ===== Campanhas ===== */}
        <section>
          <h2 className="font-[family-name:var(--font-display)] font-semibold mb-3">
            Campanhas
          </h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Investimento
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      Resultados
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      Custo/result.
                    </th>
                    <th className="px-4 py-3 font-medium text-right">CTR</th>
                    <th className="px-4 py-3 font-medium text-right w-32">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.campaigns ?? []).map((c: any) => {
                    const share =
                      totalSpend > 0
                        ? (Number(c.spend) / totalSpend) * 100
                        : 0;
                    return (
                      <tr
                        key={c.campaign_id}
                        className="border-b border-[var(--border)]/60 hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <td className="px-4 py-3 max-w-[280px] truncate">
                          {c.campaign_name}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {brl(Number(c.spend))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--accent)]">
                          {num(c.results)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.costPerResult ? brl(c.costPerResult) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {Number(c.ctr).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                              style={{ width: `${Math.min(share, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {data?.fetched_at && (
          <p className="text-xs text-neutral-600 mt-5">
            Dados da Meta atualizados em{" "}
            {new Date(data.fetched_at).toLocaleString("pt-BR")}. A Meta pode
            levar até algumas horas para consolidar resultados do dia.
          </p>
        )}
      </div>
    </main>
  );
}
