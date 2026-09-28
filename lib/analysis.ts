// lib/analysis.ts — métricas derivadas, ranking e selos.
// Fonte única para o dashboard e para o PDF: os dois mostram exatamente os mesmos números.

import {
  actionOf,
  extractResult,
  leadCount,
  conversationCount,
  profileVisitCount,
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
  // Contatos e perfil
  leads: number;
  conversations: number;
  profileVisits: number;
  costPerProfileVisit: number | null;
  // Engajamento
  engagement: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number | null; // engajamentos / impressões, %
  costPerEngagement: number | null;
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
  const profileVisits = profileVisitCount(i);
  const engagement = actionOf(i, ["post_engagement"]);

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
    convRate:
      objetivo !== "perfil" && objetivo !== "engajamento" && linkClicks > 0 && results > 0 ? (results / linkClicks) * 100 : null,
    conversionValue,
    roas: roasApi ?? (conversionValue && spend > 0 ? conversionValue / spend : null),
    ticket: conversionValue && purchases > 0 ? conversionValue / purchases : null,
    video3s,
    thruplays,
    hookRate: impressions > 0 && video3s > 0 ? (video3s / impressions) * 100 : null,
    holdRate: video3s > 0 && thruplays > 0 ? (thruplays / video3s) * 100 : null,
    leads: leadCount(i),
    conversations: conversationCount(i),
    profileVisits,
    costPerProfileVisit: profileVisits > 0 ? spend / profileVisits : null,
    engagement,
    reactions: actionOf(i, ["post_reaction"]),
    comments: actionOf(i, ["comment"]),
    shares: actionOf(i, ["post"]),
    saves: actionOf(i, ["onsite_conversion.post_save"]),
    engagementRate: impressions > 0 && engagement > 0 ? (engagement / impressions) * 100 : null,
    costPerEngagement: engagement > 0 ? spend / engagement : null,
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

  if (objetivo === "leads_conversas" && account.leads > 0 && account.conversations > 0) {
    out.push({
      kind: "info",
      text: `Dos ${intFmt(account.results)} contatos, ${intFmt(account.leads)} vieram por formulário/cadastro e ${intFmt(account.conversations)} por conversa iniciada.`,
    });
  }
  if ((objetivo === "perfil" || objetivo === "engajamento") && account.engagement > 0) {
    const parts = [
      account.reactions > 0 ? `${intFmt(account.reactions)} reações` : "",
      account.comments > 0 ? `${intFmt(account.comments)} comentários` : "",
      account.shares > 0 ? `${intFmt(account.shares)} compartilhamentos` : "",
      account.saves > 0 ? `${intFmt(account.saves)} salvamentos` : "",
    ].filter(Boolean);
    out.push({
      kind: "info",
      text: `Os anúncios geraram ${intFmt(account.engagement)} engajamentos${parts.length ? ` (${parts.join(", ")})` : ""}${account.costPerEngagement ? `, a ${moneyFmt(account.costPerEngagement)} cada` : ""}.`,
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


// ===== Público: onde (estado) e quem (idade) =====

export interface AudienceRow {
  key: string;
  label: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  results: number;
  costPerResult: number | null;
  spendShare: number; // %
  resultShare: number; // %
}

export interface AgeGenderRow {
  label: string; // "25-34"
  female: number; // % do total (base = metricKey)
  male: number; // % do total
  femaleValue: number;
  maleValue: number;
}

export interface Audience {
  regions: AudienceRow[];
  ages: AudienceRow[];
  /** Idade x gênero: participação de cada faixa por sexo no total */
  ageGender: AgeGenderRow[];
  /** base das barras de idade x gênero: "results" (quando a Meta informa) ou "reach" */
  ageGenderBase: "results" | "reach";
  /** false quando a Meta não devolve o resultado por região (ex.: compras do pixel) */
  regionResults: boolean;
  ageResults: boolean;
}

/** "Mato Grosso do Sul (state)" -> "Mato Grosso do Sul"; "Federal District" -> "Distrito Federal" */
export function cleanRegion(name: string): string {
  const s = (name ?? "").replace(/\s*\((state|province|region|district)\)\s*$/i, "").trim();
  if (/^federal district$/i.test(s)) return "Distrito Federal";
  if (/^unknown$/i.test(s) || !s) return "Não identificado";
  return s;
}

function summarize(rows: MetaInsight[], key: string, objetivo: Obj, label: (v: string) => string): AudienceRow[] {
  const map = new Map<string, AudienceRow>();
  for (const r of rows) {
    const raw = String((r as any)[key] ?? "");
    const lbl = label(raw);
    const cur =
      map.get(lbl) ??
      { key: raw, label: lbl, spend: 0, impressions: 0, reach: 0, linkClicks: 0, results: 0, costPerResult: null, spendShare: 0, resultShare: 0 };
    cur.spend += n(r.spend);
    cur.impressions += n(r.impressions);
    cur.reach += n(r.reach);
    cur.linkClicks += n(r.inline_link_clicks);
    cur.results += extractResult(r, objetivo).results;
    map.set(lbl, cur);
  }
  const list = Array.from(map.values()).filter((x) => x.spend > 0 || x.impressions > 0);
  const totS = list.reduce((a, x) => a + x.spend, 0);
  const totR = list.reduce((a, x) => a + x.results, 0);
  for (const x of list) {
    x.costPerResult = x.results > 0 ? x.spend / x.results : null;
    x.spendShare = totS > 0 ? (x.spend / totS) * 100 : 0;
    x.resultShare = totR > 0 ? (x.results / totR) * 100 : 0;
  }
  return list;
}

const ageLabel = (v: string) => (v === "Unknown" || !v ? "Não informado" : v);

/**
 * regionRows: breakdown "region"; ageGenderRows: breakdown "age,gender"
 * (cada linha traz age e gender; a idade total é a soma dos dois sexos + desconhecido).
 */
export function buildAudience(regionRows: MetaInsight[], ageGenderRows: MetaInsight[], objetivo: Obj): Audience {
  const regions = summarize(regionRows, "region", objetivo, cleanRegion).sort((a, b) => b.spend - a.spend);
  const ages = summarize(ageGenderRows, "age", objetivo, ageLabel)
    .filter((a) => a.label !== "Não informado")
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));

  // Idade x gênero
  const totalResults = ageGenderRows.reduce((a, r) => a + extractResult(r, objetivo).results, 0);
  const base: "results" | "reach" = totalResults > 0 ? "results" : "reach";
  const val = (r: MetaInsight) => (base === "results" ? extractResult(r, objetivo).results : n(r.reach));
  const byAge = new Map<string, { f: number; m: number }>();
  let total = 0;
  for (const r of ageGenderRows) {
    const age = ageLabel(String((r as any).age ?? ""));
    const g = String((r as any).gender ?? "");
    if (age === "Não informado" || (g !== "female" && g !== "male")) continue;
    const v = val(r);
    const cur = byAge.get(age) ?? { f: 0, m: 0 };
    if (g === "female") cur.f += v;
    else cur.m += v;
    byAge.set(age, cur);
    total += v;
  }
  const ageGender: AgeGenderRow[] = Array.from(byAge, ([label, x]) => ({
    label,
    femaleValue: x.f,
    maleValue: x.m,
    female: total > 0 ? (x.f / total) * 100 : 0,
    male: total > 0 ? (x.m / total) * 100 : 0,
  }))
    .filter((x) => x.femaleValue > 0 || x.maleValue > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));

  return {
    regions,
    ages,
    ageGender,
    ageGenderBase: base,
    regionResults: regions.some((r) => r.results > 0),
    ageResults: ages.some((r) => r.results > 0),
  };
}
