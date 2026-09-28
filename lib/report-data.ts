// lib/report-data.ts — coleta tudo que o relatório precisa (Meta) e monta o ReportData.
// Usado pelo envio automático no WhatsApp e pelo botão "Exportar PDF" do dashboard.
import {
  getInsights,
  getDaily,
  getCreatives,
  detectObjetivo,
  extractResult,
  buildFunnel,
  RESULT_META,
  type Objetivo,
  type Range,
} from "@/lib/meta-v2";
import { deriveMetrics, rankEntities, buildInsights, type Obj, type Metrics, type Ranked } from "@/lib/analysis";
import type { ReportData, ReportImage } from "@/lib/report-pdf";

const fInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fMoney = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPct = (v: number, d = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";
const fComp = (v: number) => {
  if (v >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "M";
  if (v >= 1000) return (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return fInt(v);
};
const pad = (n: number) => ("0" + n).slice(-2);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function delta(cur: number | null | undefined, prev: number | null | undefined, suffix: string, invert = false) {
  if (cur == null || prev == null || !prev || !isFinite(prev)) return {};
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { delta: `estável ${suffix}`, deltaGood: true };
  const good = invert ? pct < 0 : pct > 0;
  return {
    delta: `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${suffix}`,
    deltaGood: good,
  };
}

async function fetchImage(url: string | null | undefined): Promise<ReportImage | null> {
  if (!url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, kind: "jpg" };
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, kind: "png" };
    return null; // webp/gif: pdf-lib não embute
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function eachDay(range: Range): string[] {
  const out: string[] = [];
  const d = new Date(range.since + "T12:00:00Z");
  const end = new Date(range.until + "T12:00:00Z");
  while (d <= end && out.length < 93) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface ReportSummary {
  spend: number;
  results: number;
  costPerResult: number | null;
  resultKey: string;
  custoKey: string;
  resultsDelta: string | null;
  bestCampaign: { name: string; results: number; cpr: number | null } | null;
  bestCreative: { name: string; results: number; cpr: number | null } | null;
}

export async function collectReport(opts: {
  client: { name: string; ad_account_id: string; objetivo?: Objetivo | string | null };
  range: Range;
  prevRange: Range;
  periodLabel: string; // "01/09 a 28/09"
  compareLabel: string; // "mesmo período do mês anterior" | "período anterior"
  deltaSuffix: string; // "vs mês anterior" | "vs período anterior"
  objetivoOverride?: Objetivo | null;
}): Promise<{ skipped: true; reason: string } | { skipped: false; data: ReportData; summary: ReportSummary }> {
  const { client, range, prevRange } = opts;
  const acct = client.ad_account_id;

  const [curArr, prevArr, campRows, adRows, dailyRows] = await Promise.all([
    getInsights(acct, range, "account"),
    getInsights(acct, prevRange, "account"),
    getInsights(acct, range, "campaign"),
    getInsights(acct, range, "ad"),
    getDaily(acct, range).catch(() => []),
  ]);
  const cur = curArr[0];
  if (!cur || Number(cur.spend) === 0) return { skipped: true, reason: "Sem veiculação no período" };
  const prv = prevArr[0] ?? null;

  const pick = (o?: string | null) => (o && o !== "auto" ? (o as Obj) : null);
  const obj: Obj = pick(opts.objetivoOverride) ?? pick(client.objetivo as string) ?? detectObjetivo(cur);
  const meta = RESULT_META[obj];
  const ecommerce = obj === "compras" || obj === "infoproduto";

  const A: Metrics = deriveMetrics(cur, obj);
  const P: Metrics | null = prv ? deriveMetrics(prv, obj) : null;
  const sfx = opts.deltaSuffix;

  const campaigns = rankEntities(campRows, obj, { idKey: "campaign_id", nameKey: "campaign_name", accountCpr: A.costPerResult });
  const ads = rankEntities(adRows, obj, { idKey: "ad_id", nameKey: "ad_name", accountCpr: A.costPerResult, withHook: true });

  // ===== KPIs principais
  const kpis: ReportData["kpis"] = [
    { label: "Investimento", value: fMoney(A.spend), ...delta(A.spend, P?.spend, sfx) },
    { label: meta.resultKey, value: fInt(A.results), ...delta(A.results, P?.results, sfx) },
    { label: meta.custoKey, value: A.costPerResult ? fMoney(A.costPerResult) : "—", ...delta(A.costPerResult, P?.costPerResult, sfx, true) },
  ];
  if (ecommerce) {
    kpis.push(
      { label: "Valor em vendas", value: A.conversionValue ? fMoney(A.conversionValue) : "—", ...delta(A.conversionValue, P?.conversionValue, sfx) },
      { label: "ROAS", value: A.roas ? A.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x" : "—", ...delta(A.roas, P?.roas, sfx) },
      { label: "Ticket médio", value: A.ticket ? fMoney(A.ticket) : "—", ...delta(A.ticket, P?.ticket, sfx) }
    );
  } else {
    kpis.push(
      { label: "Pessoas alcançadas", value: fComp(A.reach), ...delta(A.reach, P?.reach, sfx) },
      { label: "CTR do link", value: A.linkCtr != null ? fPct(A.linkCtr) : "—", ...delta(A.linkCtr, P?.linkCtr, sfx) },
      { label: "Taxa de conversão", value: A.convRate != null ? fPct(A.convRate) : "—", ...delta(A.convRate, P?.convRate, sfx) }
    );
  }

  // ===== Métricas detalhadas (até 8, sem repetir KPIs)
  const used = new Set(kpis.map((k) => k.label));
  const sec: { label: string; value: string }[] = [];
  const add = (l: string, v: string | null) => {
    if (v && !used.has(l)) sec.push({ label: l, value: v });
  };
  add("Impressões", fComp(A.impressions));
  add("Pessoas alcançadas", fComp(A.reach));
  add("Frequência", A.frequency ? A.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : null);
  add("Cliques no link", fComp(A.linkClicks));
  add("CTR do link", A.linkCtr != null ? fPct(A.linkCtr) : null);
  add("CPC do link", A.cpc != null ? fMoney(A.cpc) : null);
  add("CPM", A.cpm != null ? fMoney(A.cpm) : null);
  add("Custo por visita", A.costPerLpv != null ? fMoney(A.costPerLpv) : null);
  add("Taxa de conversão", A.convRate != null ? fPct(A.convRate) : null);
  add("Gancho do vídeo", A.hookRate != null ? fPct(A.hookRate, 1) : null);
  add("Retenção do vídeo", A.holdRate != null ? fPct(A.holdRate, 1) : null);

  // ===== Diário (preenche dias sem veiculação com zero)
  const byDay = new Map<string, { spend: number; results: number }>();
  for (const r of dailyRows) {
    byDay.set(r.date_start, { spend: Number(r.spend || 0), results: extractResult(r, obj).results });
  }
  const daily = eachDay(range).map((iso) => ({ label: ddmm(iso), ...(byDay.get(iso) ?? { spend: 0, results: 0 }) }));

  // ===== Leitura do período (só win/info — alertas internos não vão para o cliente)
  const highlights = buildInsights({ objetivo: obj, account: A, previous: P, campaigns, creatives: ads, compareLabel: opts.compareLabel })
    .filter((i) => i.kind !== "alert")
    .map((i) => i.text)
    .slice(0, 6);

  // ===== Frase-resumo
  let headline = `De ${opts.periodLabel}, investimos ${fMoney(A.spend)} e geramos ${fInt(A.results)} ${meta.resultKey.toLowerCase()}`;
  if (A.costPerResult) headline += `, a ${fMoney(A.costPerResult)} cada`;
  if (ecommerce && A.conversionValue) headline += `, somando ${fMoney(A.conversionValue)} em vendas`;
  if (P && P.results > 0 && A.results > 0) {
    const d = ((A.results - P.results) / P.results) * 100;
    if (Math.abs(d) >= 1)
      headline += ` — ${Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% ${d > 0 ? "a mais" : "a menos"} que no ${opts.compareLabel}`;
  }
  headline += ".";

  // ===== Campanhas
  const maxCamp = 12;
  const repCampaigns = campaigns.slice(0, maxCamp).map((c) => ({
    name: c.name,
    badges: c.badges.filter((b) => b !== "attention"),
    tier: c.tier,
    results: fInt(c.m.results),
    cost: c.m.costPerResult ? fMoney(c.m.costPerResult) : "—",
    ctr: c.m.linkCtr != null ? fPct(c.m.linkCtr) : "—",
    spend: fMoney(c.m.spend),
    spendShare: c.spendShare,
    resultShare: c.resultShare,
  }));

  // ===== Criativos: selos primeiro, depois mais resultados (máx. 6)
  const chosen: Ranked<any>[] = [];
  const pushUnique = (a?: Ranked<any>) => {
    if (a && !chosen.includes(a) && chosen.length < 6) chosen.push(a);
  };
  const converted = ads.filter((a) => a.m.results > 0);
  const pool = converted.length ? converted : [...ads].sort((a, b) => b.m.spend - a.m.spend);
  pool.filter((a) => a.badges.some((b) => b !== "attention")).forEach(pushUnique);
  pool.forEach(pushUnique);
  chosen.sort((a, b) => b.m.results - a.m.results || b.m.spend - a.m.spend);

  const info = await getCreatives(chosen.map((a) => a.id)).catch(() => ({} as Record<string, any>));
  const images = await Promise.all(chosen.map((a) => fetchImage((info as any)[a.id]?.thumb)));

  const creatives = chosen.map((a, i) => {
    const ci = (info as any)[a.id] ?? {};
    const isVideo = ci.type === "VIDEO" || a.m.video3s > 0;
    return {
      name: a.name,
      campaign: (a.raw as any).campaign_name ?? "",
      badges: a.badges.filter((b) => b !== "attention"),
      tier: a.tier,
      isVideo,
      image: images[i],
      resultShare: a.resultShare,
      stats: [
        { label: meta.resultKey, value: fInt(a.m.results) },
        { label: meta.custoShort, value: a.m.costPerResult ? fMoney(a.m.costPerResult) : "—" },
        { label: "CTR do link", value: a.m.linkCtr != null ? fPct(a.m.linkCtr) : "—" },
        isVideo && a.m.hookRate != null
          ? { label: "Gancho (3s)", value: fPct(a.m.hookRate, 1) }
          : { label: "Investido", value: fMoney(a.m.spend) },
      ],
    };
  });

  const data: ReportData = {
    clientName: client.name,
    periodLabel: opts.periodLabel,
    platformLabel: "META ADS",
    resultKey: meta.resultKey,
    custoShort: meta.custoShort,
    headline,
    compareNote: P ? `Variações comparadas ao ${opts.compareLabel}.` : `Sem veiculação no ${opts.compareLabel} para comparação.`,
    kpis,
    secondary: sec,
    daily,
    highlights,
    funnel: buildFunnel(cur, obj).map((x) => ({ stage: x.stage, value: x.value, valueStr: fComp(x.value) })),
    campaigns: repCampaigns,
    moreCampaigns: Math.max(0, campaigns.length - maxCamp),
    creatives,
  };

  const bestC = campaigns.find((c) => c.badges.includes("most_results"));
  const bestA = ads.find((c) => c.badges.includes("best_cost")) ?? ads.find((c) => c.badges.includes("most_results"));
  const dRes = delta(A.results, P?.results, sfx);

  return {
    skipped: false,
    data,
    summary: {
      spend: A.spend,
      results: A.results,
      costPerResult: A.costPerResult,
      resultKey: meta.resultKey,
      custoKey: meta.custoKey,
      resultsDelta: dRes.delta ?? null,
      bestCampaign: bestC ? { name: bestC.name, results: bestC.m.results, cpr: bestC.m.costPerResult } : null,
      bestCreative: bestA ? { name: bestA.name, results: bestA.m.results, cpr: bestA.m.costPerResult } : null,
    },
  };
}

/** Rótulos de período padrão do relatório mensal (mês até a data, fuso de Campo Grande). */
export function monthToDate(): { range: Range; prevRange: Range; periodLabel: string } {
  const now = new Date(Date.now() - 4 * 3600e3);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = now.getUTCDate();
  const pm = new Date(Date.UTC(y, m - 1, 1));
  const lastDayPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    range: { since: `${y}-${pad(m + 1)}-01`, until: `${y}-${pad(m + 1)}-${pad(day)}` },
    prevRange: {
      since: `${pm.getUTCFullYear()}-${pad(pm.getUTCMonth() + 1)}-01`,
      until: `${pm.getUTCFullYear()}-${pad(pm.getUTCMonth() + 1)}-${pad(Math.min(day, lastDayPrev))}`,
    },
    periodLabel: `01/${pad(m + 1)} a ${pad(day)}/${pad(m + 1)}`,
  };
}

export { fMoney, fInt };
