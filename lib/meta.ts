// lib/meta.ts
// Cliente da Meta Marketing API usando System User Token da agência.
// Docs: https://developers.facebook.com/docs/marketing-api/insights

const META_BASE = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_SYSTEM_TOKEN!;

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month";

export interface MetaInsight {
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  campaign_id?: string;
  campaign_name?: string;
  date_start: string;
  date_stop: string;
}

const FIELDS =
  "spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,campaign_id,campaign_name,date_start,date_stop";

// Tipos de ação que contam como "resultado" (ordem de prioridade)
const RESULT_PRIORITY = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "landing_page_view",
];

async function metaFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  const json = await res.json();

  if (json.error) {
    // Código 17 / 80004 = rate limit da Meta. Repassa mensagem limpa.
    const { code, message } = json.error;
    throw new Error(`Meta API [${code}]: ${message}`);
  }
  return json;
}

/** Insights agregados da conta no período. */
export async function getAccountInsights(
  adAccountId: string,
  datePreset: DatePreset = "last_7d"
): Promise<MetaInsight | null> {
  const json = await metaFetch(`/${adAccountId}/insights`, {
    fields: FIELDS.replace(",campaign_id,campaign_name", ""),
    date_preset: datePreset,
  });
  return json.data?.[0] ?? null;
}

/** Insights por campanha (com paginação). */
export async function getCampaignInsights(
  adAccountId: string,
  datePreset: DatePreset = "last_7d"
): Promise<MetaInsight[]> {
  const all: MetaInsight[] = [];
  let json = await metaFetch(`/${adAccountId}/insights`, {
    fields: FIELDS,
    date_preset: datePreset,
    level: "campaign",
    limit: "50",
  });
  all.push(...(json.data ?? []));

  // Paginação
  while (json.paging?.next && all.length < 500) {
    const res = await fetch(json.paging.next);
    json = await res.json();
    if (json.error) break;
    all.push(...(json.data ?? []));
  }
  return all;
}

/** Série diária da conta (para o gráfico). */
export async function getDailyInsights(
  adAccountId: string,
  datePreset: DatePreset = "last_30d"
): Promise<MetaInsight[]> {
  const json = await metaFetch(`/${adAccountId}/insights`, {
    fields: "spend,impressions,clicks,actions,date_start,date_stop",
    date_preset: datePreset,
    time_increment: "1",
  });
  return json.data ?? [];
}

/** Extrai o "resultado" principal (lead, compra, conversa) de um insight. */
export function extractResult(insight: MetaInsight): {
  results: number;
  resultType: string | null;
  costPerResult: number | null;
} {
  if (!insight.actions?.length)
    return { results: 0, resultType: null, costPerResult: null };

  for (const type of RESULT_PRIORITY) {
    const action = insight.actions.find((a) => a.action_type === type);
    if (action) {
      const cost = insight.cost_per_action_type?.find(
        (c) => c.action_type === type
      );
      return {
        results: Number(action.value),
        resultType: type,
        costPerResult: cost ? Number(cost.value) : null,
      };
    }
  }
  return { results: 0, resultType: null, costPerResult: null };
}
