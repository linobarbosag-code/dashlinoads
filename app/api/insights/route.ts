// app/api/insights/route.ts — v2
// ?client_id=...&since=YYYY-MM-DD&until=YYYY-MM-DD&objetivo=auto|compras|leads|conversas|engajamento&level=campaign|adset|ad

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getInsights,
  getDaily,
  getBreakdown,
  getAccountInfo,
  previousRange,
  detectObjetivo,
  extractResult,
  extractRoas,
  extractConversionValue,
  buildFunnel,
  getCreatives,
  RESULT_META,
  type Objetivo,
  type Range,
  type Focus,
} from "@/lib/meta-v2";
import { googleConfigured, gAccount, gCampaigns, gDaily, gNetworks } from "@/lib/google-ads";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id");
  const since = sp.get("since");
  const until = sp.get("until");
  const objetivoParam = (sp.get("objetivo") ?? "auto") as Objetivo;
  const level = (sp.get("level") ?? "campaign") as "campaign" | "adset" | "ad";
  const focusType = sp.get("focus_type");
  const focusIds = (sp.get("focus_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const focus: Focus | null =
    focusType && focusIds.length && ["campaign", "adset", "ad"].includes(focusType)
      ? { type: focusType as Focus["type"], ids: focusIds }
      : null;

  if (!since || !until || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  const range: Range = { since, until };

  // RLS decide o acesso
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, currency, objetivo, google_customer_id")
    .eq("id", clientId)
    .single();
  if (!client) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // ===== Google Ads =====
  if (sp.get("platform") === "google") {
    if (!googleConfigured()) {
      return NextResponse.json({ error: "Google Ads ainda não configurado: adicione as variáveis GOOGLE_ADS_* na Vercel." }, { status: 400 });
    }
    const gcid = (client as any).google_customer_id;
    if (!gcid) {
      return NextResponse.json({ error: "Este cliente não tem conta Google Ads cadastrada." }, { status: 400 });
    }
    try {
      const prevG = previousRange(range);
      const [gCur, gPrv, gRows, gDay, gNets] = await Promise.all([
        gAccount(gcid, range),
        gAccount(gcid, prevG),
        gCampaigns(gcid, range),
        gDaily(gcid, range),
        gNetworks(gcid, range),
      ]);
      const funnelG = gCur
        ? [
            { stage: "Impressões", value: Number(gCur.impressions) },
            { stage: "Cliques", value: Number(gCur.clicks) },
            { stage: "Conversões", value: gCur.results },
          ].filter((f) => f.value > 0)
        : [];
      return NextResponse.json({
        platform: "google",
        client: { name: client.name, currency: client.currency },
        objetivo: "conversoes",
        meta: { resultKey: "Conversões", custoKey: "Custo por conversão", custoShort: "Custo/conv." },
        account: gCur,
        previous: gPrv,
        funnel: funnelG,
        highlights: [],
        rows: gRows,
        level: "campaign",
        focus: null,
        account_info: null,
        daily: gDay,
        gender: [],
        platform_breakdown: gNets,
        fetched_at: new Date().toISOString(),
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
  }

  try {
    const prev = previousRange(range);
    const [curArr, prevArr, rows, daily, gender, platform, accountInfo] =
      await Promise.all([
        getInsights(client.ad_account_id, range, "account", focus),
        getInsights(client.ad_account_id, prev, "account", focus),
        getInsights(client.ad_account_id, range, level, focus),
        getDaily(client.ad_account_id, range, focus),
        getBreakdown(client.ad_account_id, range, "gender", focus),
        getBreakdown(client.ad_account_id, range, "publisher_platform", focus),
        getAccountInfo(client.ad_account_id).catch(() => null),
      ]);

    const cur = curArr[0] ?? null;
    const prv = prevArr[0] ?? null;

    const clientDefault = (client as any).objetivo as Objetivo | undefined;
    const objetivo =
      objetivoParam !== "auto"
        ? objetivoParam
        : clientDefault && clientDefault !== "auto"
        ? (clientDefault as Exclude<Objetivo, "auto">)
        : cur
        ? detectObjetivo(cur)
        : "leads";

    const enrich = (i: any) => ({
      ...i,
      ...extractResult(i, objetivo),
      roas: extractRoas(i),
      conversionValue: extractConversionValue(i),
    });

    // Destaques: sempre os anúncios com mais resultados no período, com criativo
    const adRows =
      level === "ad" ? rows : await getInsights(client.ad_account_id, range, "ad", focus);
    const topAds = adRows
      .map(enrich)
      .filter((a: any) => Number(a.spend) > 0 || Number(a.impressions) > 0)
      .sort((a: any, b: any) => b.results - a.results || Number(b.spend) - Number(a.spend))
      .slice(0, 5);
    const creatives = await getCreatives(topAds.map((a: any) => a.ad_id)).catch(() => ({}));
    const highlights = topAds.map((a: any) => ({
      ad_id: a.ad_id,
      name: a.ad_name,
      results: a.results,
      costPerResult: a.costPerResult,
      spend: Number(a.spend),
      ...(creatives as any)[a.ad_id],
    }));

    const delivered = rows
      .map(enrich)
      .filter((r: any) => Number(r.spend) > 0 || Number(r.impressions) > 0);

    return NextResponse.json({
      client: { name: client.name, currency: client.currency },
      objetivo,
      meta: RESULT_META[objetivo],
      account: cur ? enrich(cur) : null,
      previous: prv ? enrich(prv) : null,
      funnel: cur ? buildFunnel(cur, objetivo) : [],
      highlights,
      rows: delivered,
      level,
      focus,
      account_info: accountInfo,
      daily,
      gender: gender.map((g: any) => ({
        gender: g.gender,
        spend: Number(g.spend || 0),
        results: extractResult(g, objetivo).results,
      })),
      platform: "meta",
      platform_breakdown: platform.map((p: any) => ({
        platform: p.publisher_platform,
        spend: Number(p.spend || 0),
        results: extractResult(p, objetivo).results,
      })),
      fetched_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
