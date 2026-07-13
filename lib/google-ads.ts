// lib/google-ads.ts — Google Ads API via GAQL/REST, centralizado na MCC da agência.
// Env: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//      GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC, só dígitos)
//      GOOGLE_ADS_API_VERSION (opcional, padrão v19)

import type { Range } from "@/lib/meta-v2";

// O Google aposenta versões a cada ~12 meses (v19 morreu em fev/2026; cadência mensal desde 2026).
// Tentamos da mais nova para a mais antiga e memorizamos a que responder.
const VERSION_CANDIDATES = process.env.GOOGLE_ADS_API_VERSION
  ? [process.env.GOOGLE_ADS_API_VERSION]
  : ["v26", "v25", "v24", "v23", "v22", "v21", "v20"];
let workingVersion: string | null = null;
const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

export async function warmupToken(): Promise<void> {
  console.log("[gads] obtendo access token...");
  await getAccessToken();
  console.log("[gads] access token ok");
}

export function googleConfigured(): boolean {
  return !!(DEV_TOKEN && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && LOGIN_CID);
}

// ===== OAuth: access token com cache em memória
let cachedToken: { value: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60000) return cachedToken.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        refresh_token: REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
      signal: ctrl.signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`OAuth Google [${res.status}]: ${json.error_description ?? json.error}`);
    cachedToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
    return cachedToken.value;
  } finally {
    clearTimeout(timer);
  }
}

// ===== GAQL
async function gaqlAt(version: string, cid: string, query: string, token: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${cid}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": DEV_TOKEN!,
          "login-customer-id": LOGIN_CID!.replace(/\D/g, ""),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: ctrl.signal,
      }
    );
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, ok: res.ok, json, text };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Google Ads API não respondeu em 25s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function gaql(customerId: string, query: string): Promise<any[]> {
  const cid = customerId.replace(/\D/g, "");
  const t0 = Date.now();
  const from = query.match(/FROM\s+(\w+)/)?.[1] ?? "?";
  const token = await getAccessToken();

  const versions = workingVersion ? [workingVersion] : VERSION_CANDIDATES;
  let last: { status: number; json: any; text: string } | null = null;

  for (const v of versions) {
    const r = await gaqlAt(v, cid, query, token);
    // 404 (HTML ou JSON "Method not found") = versão inexistente/aposentada -> tenta a próxima
    if (r.status === 404) {
      console.log(`[gads] versão ${v} indisponível (404), tentando a próxima...`);
      last = r;
      continue;
    }
    if (!r.ok) {
      const detail =
        r.json?.error?.details?.[0]?.errors?.[0]?.message ??
        r.json?.error?.message ??
        (r.json ? JSON.stringify(r.json).slice(0, 200) : r.text.slice(0, 150));
      throw new Error(`Google Ads API [${r.status}]: ${detail}`);
    }
    if (!workingVersion) {
      workingVersion = v;
      console.log(`[gads] versão ativa: ${v}`);
    }
    console.log(`[gads] ${from} ok em ${Date.now() - t0}ms (${(r.json.results ?? []).length} linhas)`);
    return r.json.results ?? [];
  }
  throw new Error(
    `Google Ads API: nenhuma versão candidata respondeu (última: ${last?.status}). Defina GOOGLE_ADS_API_VERSION na Vercel.`
  );
}

// ===== Normalização para o formato do dashboard
const METRICS =
  "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.conversions_value, metrics.cost_per_conversion";

function normalize(m: any) {
  const spend = Number(m.costMicros ?? 0) / 1e6;
  const conversions = Number(m.conversions ?? 0);
  const conversionValue = Number(m.conversionsValue ?? 0);
  return {
    spend: String(spend),
    impressions: String(m.impressions ?? 0),
    clicks: String(m.clicks ?? 0),
    ctr: String(Number(m.ctr ?? 0) * 100), // Google entrega fração; dashboard espera %
    cpc: String(Number(m.averageCpc ?? 0) / 1e6),
    cpm: String(Number(m.averageCpm ?? 0) / 1e6),
    results: Math.round(conversions),
    costPerResult: conversions > 0 ? spend / conversions : null,
    conversionValue: conversionValue > 0 ? conversionValue : null,
    roas: spend > 0 && conversionValue > 0 ? conversionValue / spend : null,
  };
}

const between = (r: Range) => `segments.date BETWEEN '${r.since}' AND '${r.until}'`;

/** Métricas agregadas da conta no período. */
export async function gAccount(customerId: string, range: Range) {
  const rows = await gaql(customerId, `SELECT ${METRICS} FROM customer WHERE ${between(range)}`);
  if (!rows.length) return null;
  // FROM customer com date range pode segmentar; soma tudo
  const acc: any = {};
  for (const r of rows) {
    const m = r.metrics ?? {};
    for (const k of ["costMicros", "impressions", "clicks", "conversions", "conversionsValue"]) {
      acc[k] = (acc[k] ?? 0) + Number(m[k] ?? 0);
    }
  }
  const spend = acc.costMicros / 1e6;
  return {
    ...normalize({ ...acc }),
    ctr: String(acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0),
    cpc: String(acc.clicks > 0 ? spend / acc.clicks : 0),
    cpm: String(acc.impressions > 0 ? (spend / acc.impressions) * 1000 : 0),
  };
}

/** Campanhas com veiculação no período. */
export async function gCampaigns(customerId: string, range: Range) {
  const rows = await gaql(
    customerId,
    `SELECT campaign.id, campaign.name, ${METRICS} FROM campaign WHERE ${between(range)} AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC`
  );
  return rows.map((r: any) => ({
    campaign_id: String(r.campaign?.id ?? ""),
    campaign_name: r.campaign?.name ?? "",
    ...normalize(r.metrics ?? {}),
  }));
}

/** Série diária. */
export async function gDaily(customerId: string, range: Range) {
  const rows = await gaql(
    customerId,
    `SELECT segments.date, metrics.cost_micros FROM customer WHERE ${between(range)} ORDER BY segments.date`
  );
  return rows.map((r: any) => ({
    date_start: r.segments?.date ?? "",
    spend: String(Number(r.metrics?.costMicros ?? 0) / 1e6),
  }));
}

/** Investimento por rede (Pesquisa, Display, YouTube...) — análogo do "onde aparece". */
const NETWORK_LABEL: Record<string, string> = {
  SEARCH: "Pesquisa Google",
  SEARCH_PARTNERS: "Parceiros de pesquisa",
  CONTENT: "Rede de Display",
  YOUTUBE_SEARCH: "YouTube (busca)",
  YOUTUBE_WATCH: "YouTube",
  MIXED: "Performance Max",
  UNKNOWN: "Outros",
  UNSPECIFIED: "Outros",
};

export async function gNetworks(customerId: string, range: Range) {
  const rows = await gaql(
    customerId,
    `SELECT segments.ad_network_type, metrics.cost_micros, metrics.conversions FROM customer WHERE ${between(range)}`
  );
  const agg: Record<string, { spend: number; results: number }> = {};
  for (const r of rows) {
    const key = NETWORK_LABEL[r.segments?.adNetworkType ?? "UNKNOWN"] ?? "Outros";
    agg[key] = agg[key] ?? { spend: 0, results: 0 };
    agg[key].spend += Number(r.metrics?.costMicros ?? 0) / 1e6;
    agg[key].results += Number(r.metrics?.conversions ?? 0);
  }
  return Object.entries(agg).map(([platform, v]) => ({
    platform,
    spend: v.spend,
    results: Math.round(v.results),
  }));
}
