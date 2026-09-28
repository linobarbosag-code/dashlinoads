// lib/analysis.ts — métricas derivadas, ranking e selos.
// Fonte única para o dashboard e para o PDF: os dois mostram exatamente os mesmos números.

import {
  actionOf,
  extractResult,
  extractRoas,
  extractConversionValue,
  RESULT_META,
  type MetaInsight,
  type Objetivo,
} from "@/lib/meta-v2";

export type Obj = Exclude<Objetivo, "auto">;

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  linkClicks: number;
  ctr: number; // CTR (todos os cliques), %
  linkCtr: number | null; // CTR do link, %
  cpc: number | null; // custo por clique no link
  cpm: number | null;
  lpv: number; // visualizações da página de destino
  costPerLpv: number | null;
  results: number;
  costPerResult: number | null;
  convRate: number | null; // resultados / cliques no link, %
  conversionValue: number | null;
  roas: number | null;
  ticket: number | null; // valor de conversão / compras
  video3s: number;
  thruplays: number;
  hookRate: number | null; // views 3s / impressões, %
  holdRate: number | null; // thruplays / views 3s, %
}

const n = (v: any) => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

export function deriveMetrics(i: MetaInsight, objetivo: Obj): Metrics {
  const spend = n(i.spend);
  const impressions = n(i.impressions);
  const reach = n(i.reach);
  const clicks = n(i.clicks);
  const linkClicks = n(i.inline_link_clicks);
  const { results, costPerResult } = extractResult(i, objetivo);
  const lpv = actionOf(i, ["landing_page_view", "omni_landing_page_view"]);
  const video3s = actionOf(i, ["video_view"]);
  const thruplays = n((i as any).video_thruplay_watched_actions?.[0]?.value);
  const conversionValue = extractConversionValue(i);
  const purchases = actionOf(i, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);
  const roasApi = extractRoas(i);

  return {
    spend,
    impressions,
    reach,
    frequency: reach > 0 ? impressions / reach : i.frequency ? n(i.frequency) : null,
    clicks,
    linkClicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : n(i.ctr),
    linkCtr: impressions > 0 && linkClicks > 0 ? (linkClicks / impressions) * 100 : null,
    cpc: linkClicks > 0 ? spend / linkClicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    lpv,
    costPerLpv: lpv > 0 ? spend / lpv : null,
    results,
    costPerResult,
    convRate: linkClicks > 0 && results > 0 ? (results / linkClicks) * 100 : null,
    conversionValue,
    roas: roasApi ?? (conversionValue && spend > 0 ? conversionValue / spend : null),
    ticket: conversionValue && purchases > 0 ? conversionValue / purchases : null,
    video3s,
    thruplays,
    hookRate: impressions > 0 && video3s > 0 ? (video3s / impressions) * 100 : null,
    holdRate: video3s > 0 && thruplays > 0 ? (thruplays / video3s) * 100 : null,
  };
}

// ===== Ranking e selos =====

export type BadgeKey = "best_cost" | "most_results" | "best_ctr" | "best_roas" | "best_hook" | "attention";
export type Tier = "top" | "ok" | "low" | "none";

export const BADGE_LABEL: Record<BadgeKey, string> = {
  best_cost: "Menor custo",
  most_results: "Mais resultados",
  best_ctr: "Maior CTR",
  best_roas: "Maior ROAS",
  best_hook: "Melhor gancho",
  attention: "Atenção",
};

export const TIER_LABEL: Record<Tier, string> = {
  top: "Acima da média",
  ok: "Na média",
  low: "Abaixo da média",
  none: "Sem resultado",
};

export interface Ranked<T> {
  raw: T;
  id: string;
  name: string;
  m: Metrics;
  spendShare: number; // % da verba total
  resultShare: number; // % dos resultados totais
  index: number | null; // eficiência vs conta: 100 = média; >100 = mais barato que a média
  tier: Tier;
  badges: BadgeKey[];
}

/**
 * Ranqueia campanhas ou anúncios.
 * Selos só vão para quem tem volume relevante — um anúncio de R$ 5 com 1 lead não vira "Menor custo".
 */
export function rankEntities<T extends MetaInsight>(
  list: T[],
  objetivo: Obj,
  opts: { idKey: string; nameKey: string; accountCpr: number | null; withHook?: boolean }
): Ranked<T>[] {
  const items = list
    .filter((r) => n(r.spend) > 0 || n(r.impressions) > 0)
    .map((raw) => ({ raw, m: deriveMetrics(raw, objetivo) }));

  const totalSpend = items.reduce((a, x) => a + x.m.spend, 0) || 1;
  const totalResults = items.reduce((a, x) => a + x.m.results, 0);
  const minSpend = totalSpend * 0.05;

  const ranked: Ranked<T>[] = items.map(({ raw, m }) => {
    const index =
      opts.accountCpr && m.costPerResult ? (opts.accountCpr / m.costPerResult) * 100 : null;
    const tier: Tier =
      m.results === 0 ? "none" : index === null ? "ok" : index >= 115 ? "top" : index >= 85 ? "ok" : "low";
    return {
      raw,
      id: String((raw as any)[opts.idKey] ?? ""),
      name: String((raw as any)[opts.nameKey] ?? ""),
      m,
      spendShare: (m.spend / totalSpend) * 100,
      resultShare: totalResults > 0 ? (m.results / totalResults) * 100 : 0,
      index,
      tier,
      badges: [],
    };
  });

  const eligible = ranked.filter((r) => r.m.spend >= minSpend || r.m.results >= 3);
  const award = (key: BadgeKey, pool: Ranked<T>[], score: (r: Ranked<T>) => number | null, higher = true) => {
    let best: Ranked<T> | null = null;
    let bestVal = 0;
    for (const r of pool) {
      const v = score(r);
      if (v === null || !isFinite(v) || v <= 0) continue;
      if (!best || (higher ? v > bestVal : v < bestVal)) {
        best = r;
        bestVal = v;
      }
    }
    if (best) best.badges.push(key);
  };

  award("most_results", ranked, (r) => r.m.results || null);
  award("best_cost", eligible.filter((r) => r.m.results > 0), (r) => r.m.costPerResult, false);
  award("best_ctr", eligible.filter((r) => r.m.impressions >= 1000), (r) => r.m.linkCtr);
  if (objetivo === "compras" || objetivo === "infoproduto") {
    award("best_roas", eligible, (r) => r.m.roas);
  }
  if (opts.withHook) {
    award("best_hook", eligible.filter((r) => r.m.impressions >= 1000), (r) => r.m.hookRate);
  }
  // Atenção (uso interno): verba relevante sem resultado, ou custo 50%+ acima da média
  for (const r of ranked) {
    if (r.spendShare >= 10 && (r.m.results === 0 || (r.index !== null && r.index < 67))) {
      r.badges.push("attention");
    }
  }

  // Ordem: mais resultados; empate -> menor custo; sem resultado por último, por verba
  return ranked.sort((a, b) => {
    if (b.m.results !== a.m.results) return b.m.results - a.m.results;
    if (a.m.costPerResult && b.m.costPerResult) return a.m.costPerResult - b.m.costPerResult;
    return b.m.spend - a.m.spend;
  });
}

// ===== Leitura do período (frases automáticas) =====

export interface Insight {
  kind: "win" | "info" | "alert"; // alert = uso interno (não vai para o PDF)
  text: string;
}

const pctFmt = (v: number) => Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%";
const moneyFmt = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = (v: number) => Math.round(v).toLocaleString("pt-BR");

export function buildInsights(opts: {
  objetivo: Obj;
  account: Metrics;
  previous: Metrics | null;
  campaigns: Ranked<any>[];
  creatives: Ranked<any>[];
  compareLabel: string; // "período anterior" | "mesmo período do mês anterior"
}): Insight[] {
  const { objetivo, account, previous, campaigns, creatives, compareLabel } = opts;
  const meta = RESULT_META[objetivo];
  const out: Insight[] = [];
  const unit = meta.custoKey.toLowerCase(); // "custo por lead"

  if (previous && previous.results > 0 && account.results > 0) {
    const dRes = ((account.results - previous.results) / previous.results) * 100;
    const dCpr =
      previous.costPerResult && account.costPerResult
        ? ((account.costPerResult - previous.costPerResult) / previous.costPerResult) * 100
        : null;
    const resPart = `${meta.resultKey} ${dRes >= 0 ? "cresceram" : "caíram"} ${pctFmt(dRes)} em relação ao ${compareLabel}`;
    const cprPart =
      dCpr !== null && Math.abs(dCpr) >= 1
        ? `, com ${unit} ${pctFmt(dCpr)} ${dCpr < 0 ? "menor" : "maior"}`
        : "";
    out.push({ kind: dRes >= 0 && (dCpr === null || dCpr <= 5) ? "win" : "info", text: resPart + cprPart + "." });
  }

  const topCamp = campaigns.find((c) => c.badges.includes("most_results"));
  if (topCamp && topCamp.m.results > 0) {
    const eff =
      topCamp.index !== null && topCamp.index >= 110
        ? `, com ${unit} ${pctFmt(100 - 10000 / topCamp.index)} abaixo da média da conta`
        : "";
    out.push({
      kind: "win",
      text: `A campanha “${topCamp.name}” trouxe ${intFmt(topCamp.m.results)} ${meta.resultKey.toLowerCase()} (${pctFmt(topCamp.resultShare)} do total) usando ${pctFmt(topCamp.spendShare)} da verba${eff}.`,
    });
  }

  const cheapCamp = campaigns.find((c) => c.badges.includes("best_cost") && c !== topCamp);
  if (cheapCamp && cheapCamp.m.costPerResult) {
    out.push({
      kind: "win",
      text: `Menor ${unit} entre as campanhas: “${cheapCamp.name}”, a ${moneyFmt(cheapCamp.m.costPerResult)}.`,
    });
  }

  const cheapAd = creatives.find((c) => c.badges.includes("best_cost"));
  if (cheapAd && cheapAd.m.costPerResult) {
    out.push({
      kind: "win",
      text: `Criativo mais eficiente: “${cheapAd.name}”, com ${intFmt(cheapAd.m.results)} ${meta.resultKey.toLowerCase()} a ${moneyFmt(cheapAd.m.costPerResult)} cada.`,
    });
  }

  const ctrAd = creatives.find((c) => c.badges.includes("best_ctr"));
  if (ctrAd && ctrAd.m.linkCtr && ctrAd !== cheapAd) {
    out.push({
      kind: "info",
      text: `O criativo “${ctrAd.name}” teve o maior CTR do link (${ctrAd.m.linkCtr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%) — é o que mais desperta clique.`,
    });
  }

  if (account.reach > 0) {
    out.push({
      kind: "info",
      text: `Os anúncios alcançaram ${intFmt(account.reach)} pessoas, com ${intFmt(account.impressions)} impressões${account.frequency ? ` (média de ${account.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por pessoa)` : ""}.`,
    });
  }

  // ===== Internos (só admin no dashboard; nunca no PDF)
  if (account.frequency && account.frequency >= 3) {
    out.push({
      kind: "alert",
      text: `Frequência de ${account.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} — acima de 3 costuma indicar saturação do público. Vale renovar criativos ou ampliar o público.`,
    });
  }
  for (const c of campaigns.filter((x) => x.badges.includes("attention")).slice(0, 3)) {
    out.push({
      kind: "alert",
      text:
        c.m.results === 0
          ? `“${c.name}” investiu ${moneyFmt(c.m.spend)} (${pctFmt(c.spendShare)} da verba) sem ${meta.resultKey.toLowerCase()} no período.`
          : `“${c.name}” está com ${unit} de ${moneyFmt(c.m.costPerResult ?? 0)}, ${pctFmt(10000 / (c.index ?? 100) - 100)} acima da média da conta.`,
    });
  }
  return out;
}
