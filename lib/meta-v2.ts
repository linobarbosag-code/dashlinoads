// lib/meta.ts
// Cliente da Meta Marketing API — System User Token da agência.

const META_BASE = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_SYSTEM_TOKEN!;

export interface Range {
  since: string; // YYYY-MM-DD
  until: string;
}

export interface MetaInsight {
  spend: string;
  impressions: string;
  reach?: string;
  clicks: string;
  inline_link_clicks?: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  purchase_roas?: { action_type: string; value: string }[];
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start: string;
  date_stop: string;
  [key: string]: any;
}

const BASE_FIELDS =
  "spend,impressions,reach,frequency,clicks,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,ctr,cpc,cpm,actions,action_values,cost_per_action_type,purchase_roas,video_thruplay_watched_actions";

const LEVEL_FIELDS: Record<string, string> = {
  account: BASE_FIELDS,
  campaign: BASE_FIELDS + ",campaign_id,campaign_name",
  adset: BASE_FIELDS + ",adset_id,adset_name,campaign_id,campaign_name",
  ad: BASE_FIELDS + ",ad_id,ad_name,adset_name,campaign_id,campaign_name",
};

const META_TIMEOUT_MS = 25000;

async function metaFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { next: { revalidate: 0 }, signal: ctrl.signal });
  } catch (e: any) {
    throw new Error(
      e?.name === "AbortError"
        ? `Meta API não respondeu em ${META_TIMEOUT_MS / 1000}s (${path})`
        : `Meta API falhou (${path}): ${e.message}`
    );
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json();
  if (json.error) {
    const { code, message } = json.error;
    throw new Error(`Meta API [${code}]: ${message}`);
  }
  return json;
}

const rangeParam = (r: Range) =>
  JSON.stringify({ since: r.since, until: r.until });

export interface Focus {
  type: "campaign" | "adset" | "ad";
  ids: string[];
}

const filteringParam = (f: Focus) =>
  JSON.stringify([{ field: `${f.type}.id`, operator: "IN", value: f.ids }]);

/** Janela anterior de mesma duração (para os comparativos). */
export function previousRange(r: Range): Range {
  const s = new Date(r.since + "T12:00:00");
  const e = new Date(r.until + "T12:00:00");
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const pe = new Date(s);
  pe.setDate(pe.getDate() - 1);
  const ps = new Date(pe);
  ps.setDate(ps.getDate() - days + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(ps), until: iso(pe) };
}

/** Insights agregados (level=account) ou por nível, com paginação. */
export async function getInsights(
  adAccountId: string,
  range: Range,
  level: "account" | "campaign" | "adset" | "ad" = "account",
  focus?: Focus | null
): Promise<MetaInsight[]> {
  const params: Record<string, string> = {
    fields: LEVEL_FIELDS[level],
    time_range: rangeParam(range),
    limit: "100",
  };
  if (level !== "account") params.level = level;
  if (focus) params.filtering = filteringParam(focus);

  const all: MetaInsight[] = [];
  let json = await metaFetch(`/${adAccountId}/insights`, params);
  all.push(...(json.data ?? []));
  while (json.paging?.next && all.length < 500) {
    const res = await fetch(json.paging.next);
    json = await res.json();
    if (json.error) break;
    all.push(...(json.data ?? []));
  }
  return all;
}

/** Série diária (gráficos). */
export async function getDaily(
  adAccountId: string,
  range: Range,
  focus?: Focus | null
): Promise<MetaInsight[]> {
  const params: Record<string, string> = {
    fields: "spend,impressions,clicks,inline_link_clicks,actions,date_start,date_stop",
    time_range: rangeParam(range),
    time_increment: "1",
    limit: "200",
  };
  if (focus) params.filtering = filteringParam(focus);
  const json = await metaFetch(`/${adAccountId}/insights`, params);
  return json.data ?? [];
}

/** Breakdown (gender, publisher_platform, age...). */
export async function getBreakdown(
  adAccountId: string,
  range: Range,
  breakdown: string,
  focus?: Focus | null
): Promise<MetaInsight[]> {
  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,inline_link_clicks,actions",
    time_range: rangeParam(range),
    breakdowns: breakdown,
    limit: "100",
  };
  if (focus) params.filtering = filteringParam(focus);
  const json = await metaFetch(`/${adAccountId}/insights`, params);
  return json.data ?? [];
}

/** Extrai o valor numérico de um display_string tipo "Saldo disponível (R$1.234,56)". */
function parseMoneyFromDisplay(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/([\d][\d.,]*)/);
  if (!m) return null;
  let raw = m[1];
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma > lastDot) {
    raw = raw.replace(/\./g, "").replace(",", "."); // pt-BR: 1.234,56
  } else if (lastDot > lastComma) {
    raw = raw.replace(/,/g, ""); // en: 1,234.56
  }
  const n = Number(raw);
  return isFinite(n) ? n : null;
}

/** Info da conta: saldo disponível (pré-pago), moeda, status.
 *  IMPORTANTE: o campo `balance` da Meta é o valor EM ABERTO (gasto não faturado),
 *  não o saldo. O saldo disponível de conta pré-paga vem no display_string. */
export async function getAccountInfo(adAccountId: string): Promise<{
  balance: number;                 // valor em aberto (gasto não faturado)
  available: number | null;        // saldo disponível (pré-pago), extraído do display_string
  currency: string;
  isPrepaid: boolean;
  displayString: string | null;
  accountStatus: number;
}> {
  const json = await metaFetch(`/${adAccountId}`, {
    fields: "balance,currency,funding_source_details,account_status",
  });
  const fs = json.funding_source_details ?? {};
  const display: string | null = fs.display_string ?? null;
  const isPrepaid = fs.type === 20 || /saldo|balance|dispon/i.test(display ?? "");
  return {
    balance: Number(json.balance ?? 0) / 100,
    available: isPrepaid ? parseMoneyFromDisplay(display) : null,
    currency: json.currency ?? "BRL",
    isPrepaid,
    displayString: display,
    accountStatus: Number(json.account_status ?? 1),
  };
}

/** Lista leve de entidades (para o filtro global). */
export async function listEntities(
  adAccountId: string,
  type: "campaigns" | "adsets" | "ads"
): Promise<{ id: string; name: string; status: string }[]> {
  const all: any[] = [];
  let json = await metaFetch(`/${adAccountId}/${type}`, {
    fields: "id,name,effective_status",
    limit: "100",
  });
  all.push(...(json.data ?? []));
  while (json.paging?.next && all.length < 500) {
    const res = await fetch(json.paging.next);
    json = await res.json();
    if (json.error) break;
    all.push(...(json.data ?? []));
  }
  return all.map((e) => ({ id: e.id, name: e.name, status: e.effective_status }));
}

// ===== Extração de resultado por objetivo =====

export type Objetivo =
  | "auto"
  | "compras"
  | "infoproduto"
  | "leads"
  | "conversas"
  | "leads_conversas"
  | "perfil"
  | "engajamento";

export type Obj = Exclude<Objetivo, "auto">;

const LEAD_TYPES = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const CONV_TYPES = ["onsite_conversion.messaging_conversation_started_7d"];
const PURCHASE_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];

const ACTION_SETS: Record<"compras" | "infoproduto" | "leads" | "conversas" | "engajamento", string[]> = {
  compras: PURCHASE_TYPES,
  infoproduto: PURCHASE_TYPES,
  leads: LEAD_TYPES,
  conversas: CONV_TYPES,
  engajamento: ["post_engagement"],
};

export const RESULT_META: Record<Obj, { resultKey: string; custoKey: string; custoShort: string }> = {
  compras: { resultKey: "Compras", custoKey: "Custo por compra", custoShort: "Custo/compra" },
  infoproduto: { resultKey: "Compras", custoKey: "Custo por compra", custoShort: "Custo/compra" },
  leads: { resultKey: "Leads", custoKey: "Custo por lead", custoShort: "CPL" },
  conversas: { resultKey: "Conversas", custoKey: "Custo por conversa", custoShort: "Custo/conv." },
  leads_conversas: { resultKey: "Contatos", custoKey: "Custo por contato", custoShort: "Custo/cont." },
  perfil: { resultKey: "Visitas ao perfil", custoKey: "Custo por visita ao perfil", custoShort: "Custo/visita" },
  engajamento: { resultKey: "Engajamentos", custoKey: "Custo por engajamento", custoShort: "Custo/eng." },
};

/** Valor de uma action (primeiro tipo encontrado da lista). */
export function actionOf(insight: MetaInsight, types: string[]): number {
  return actionValue(insight, types);
}

function actionValue(insight: MetaInsight, types: string[]): number {
  for (const t of types) {
    const a = insight.actions?.find((x) => x.action_type === t);
    if (a) return Number(a.value);
  }
  return 0;
}

/** Leads de formulário/site (sem conversas). */
export function leadCount(i: MetaInsight): number {
  return actionValue(i, LEAD_TYPES);
}
/** Conversas iniciadas (WhatsApp, Direct, Messenger). */
export function conversationCount(i: MetaInsight): number {
  return actionValue(i, CONV_TYPES);
}

/**
 * Visitas ao perfil do Instagram em campanhas de tráfego com destino ao perfil.
 * A Meta passou a expor a métrica em 2025, mas o nome do action_type não é estável na documentação:
 * procuramos qualquer action de visita ao perfil; se não vier, usamos cliques no link
 * (é assim que a Meta conta a visita em anúncios com destino ao perfil).
 */
export function profileVisitCount(i: MetaInsight): number {
  const hit = i.actions?.find((a) => /profile_visit|ig_profile|instagram_profile/i.test(a.action_type));
  if (hit) return Number(hit.value);
  const lc = actionValue(i, ["link_click"]);
  return lc || Number(i.inline_link_clicks || 0);
}

/** Todos os action_types presentes (diagnóstico). */
export function actionTypes(i: MetaInsight): string[] {
  return (i.actions ?? []).map((a) => a.action_type);
}

export function resultCount(i: MetaInsight, objetivo: Obj): number {
  if (objetivo === "leads_conversas") return leadCount(i) + conversationCount(i);
  if (objetivo === "perfil") return profileVisitCount(i);
  return actionValue(i, ACTION_SETS[objetivo]);
}

export function detectObjetivo(insight: MetaInsight): Obj {
  if (actionValue(insight, PURCHASE_TYPES) > 0) return "compras";
  const l = leadCount(insight);
  const c = conversationCount(insight);
  if (l > 0 && c > 0) return "leads_conversas";
  if (l > 0) return "leads";
  if (c > 0) return "conversas";
  if (insight.actions?.some((a) => /profile_visit|ig_profile|instagram_profile/i.test(a.action_type))) return "perfil";
  if (actionValue(insight, ["post_engagement"]) > 0) return "engajamento";
  return "leads";
}

export function extractResult(insight: MetaInsight, objetivo: Obj): { results: number; costPerResult: number | null } {
  const results = resultCount(insight, objetivo);
  const spend = Number(insight.spend || 0);
  return { results, costPerResult: results > 0 ? spend / results : null };
}

export function extractRoas(insight: MetaInsight): number | null {
  const r = insight.purchase_roas?.[0];
  return r ? Number(r.value) : null;
}

/** Valor de conversão (receita de compras atribuída pelo pixel). */
export function extractConversionValue(insight: MetaInsight): number | null {
  const values = (insight as any).action_values as { action_type: string; value: string }[] | undefined;
  if (!values?.length) return null;
  for (const t of PURCHASE_TYPES) {
    const v = values.find((x) => x.action_type === t);
    if (v) return Number(v.value);
  }
  return null;
}

/** Etapas do funil montadas com as actions reais disponíveis. */
export function buildFunnel(insight: MetaInsight, objetivo: Obj): { stage: string; value: number }[] {
  const stages: { stage: string; value: number }[] = [{ stage: "Impressões", value: Number(insight.impressions || 0) }];
  const push = (label: string, v: number) => {
    if (v > 0) stages.push({ stage: label, value: v });
  };
  const linkClicks = Number(insight.inline_link_clicks || 0);

  if (objetivo === "perfil") {
    push("Pessoas alcançadas", Number(insight.reach || 0));
    push("Engajamentos", actionValue(insight, ["post_engagement"]));
    push("Visitas ao perfil", profileVisitCount(insight));
    return stages;
  }
  if (objetivo === "engajamento") {
    push("Pessoas alcançadas", Number(insight.reach || 0));
    push("Engajamentos", actionValue(insight, ["post_engagement"]));
    push("Reações", actionValue(insight, ["post_reaction"]));
    push("Comentários", actionValue(insight, ["comment"]));
    return stages;
  }

  push("Cliques no link", linkClicks || Number(insight.clicks || 0));
  if (objetivo === "compras") {
    push("Visualizou página", actionValue(insight, ["landing_page_view"]));
    push("Adicionou ao carrinho", actionValue(insight, ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"]));
    push("Iniciou checkout", actionValue(insight, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"]));
    push("Compras", actionValue(insight, PURCHASE_TYPES));
  } else if (objetivo === "infoproduto") {
    push("Visualizou página", actionValue(insight, ["landing_page_view"]));
    push("Iniciou checkout", actionValue(insight, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"]));
    push("Compras", actionValue(insight, PURCHASE_TYPES));
  } else if (objetivo === "leads") {
    push("Visualizou página", actionValue(insight, ["landing_page_view"]));
    push("Leads", leadCount(insight));
  } else if (objetivo === "conversas") {
    push("Conversas iniciadas", conversationCount(insight));
  } else if (objetivo === "leads_conversas") {
    push("Contatos", leadCount(insight) + conversationCount(insight));
  }
  return stages;
}


export interface CreativeInfo {
  thumb: string | null;
  image: string | null;
  permalink: string | null;
  previewLink: string | null;
  body: string | null;
  title: string | null;
  type: string | null; // VIDEO | PHOTO | SHARE ...
  status: string | null;
}

/** Criativos de uma lista de anúncios: miniatura, imagem, copy, tipo e links. */
export async function getCreatives(adIds: string[]): Promise<Record<string, CreativeInfo>> {
  const ids = Array.from(new Set(adIds.filter(Boolean)));
  if (!ids.length) return {};
  const FULL =
    "effective_status,preview_shareable_link,creative.thumbnail_width(600).thumbnail_height(600){thumbnail_url,image_url,instagram_permalink_url,object_type,body,title}";
  const MIN = "creative.thumbnail_width(600).thumbnail_height(600){thumbnail_url,image_url,instagram_permalink_url}";
  const out: Record<string, CreativeInfo> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let json: any;
    try {
      json = await metaFetch(`/`, { ids: chunk.join(","), fields: FULL });
    } catch {
      json = await metaFetch(`/`, { ids: chunk.join(","), fields: MIN }); // fallback de campos
    }
    for (const id of chunk) {
      const ad = json[id] ?? {};
      const c = ad.creative ?? {};
      out[id] = {
        thumb: c.thumbnail_url ?? null,
        image: c.image_url ?? c.thumbnail_url ?? null,
        permalink: c.instagram_permalink_url ?? null,
        previewLink: ad.preview_shareable_link ?? null,
        body: c.body ?? null,
        title: c.title ?? null,
        type: c.object_type ?? null,
        status: ad.effective_status ?? null,
      };
    }
  }
  return out;
}
