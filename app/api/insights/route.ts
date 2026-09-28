// app/api/insights/route.ts — v2
// ?client_id=...&since=YYYY-MM-DD&until=YYYY-MM-DD&objetivo=auto|compras|infoproduto|leads|conversas|leads_conversas|perfil|engajamento&level=campaign|adset|ad

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getInsights,
  getDaily,
  getBreakdown,
  getAccountInfo,
  previousRange,
  detectObjetivo,
  actionTypes,
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
import { deriveMetrics, rankEntities, buildInsights, buildAudience, type Obj } from "@/lib/analysis";
import { googleConfigured, warmupToken, gAccount, gCampaigns, gDaily, gNetworks, gKeywords, gSearchTerms } from "@/lib/google-ads";

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
      console.log(`[insights/google] início cid=${gcid} ${range.since}..${range.until}`);
      await warmupToken();
      const prevG = previousRange(range);
      const [gCur, gPrv, gRows, gDay, gNets, gKw, gSt] = await Promise.all([
        gAccount(gcid, range),
        gAccount(gcid, prevG),
        gCampaigns(gcid, range),
        gDaily(gcid, range),
        gNetworks(gcid, range),
        gKeywords(gcid, range).catch(() => []),
        gSearchTerms(gcid, range).catch(() => []),
      ]);
      console.log(`[insights/google] concluído cid=${gcid}`);
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
        keywords: gKw,
        search_terms: gSt,
        level: "campaign",
        focus: null,
        account_info: null,
        daily: gDay,
        gender: [],
        platform_breakdown: gNets,
        fetched_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[insights/google] erro: ${err?.message ?? err}`);
      return NextResponse.json({ error: String(err?.message ?? err) }, { status: 502 });
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

    const obj = objetivo as Obj;
    const enrich = (i: any) => {
      const m = deriveMetrics(i, obj);
      return { ...i, ...m, m };
    };
    const accM = cur ? deriveMetrics(cur, obj) : null;
    const prvM = prv ? deriveMetrics(prv, obj) : null;

    // Campanhas e anúncios sempre disponíveis (independente da aba da tabela)
    const [campRows, adRows, regionRows, ageRows] = await Promise.all([
      level === "campaign" ? Promise.resolve(rows) : getInsights(client.ad_account_id, range, "campaign", focus),
      level === "ad" ? Promise.resolve(rows) : getInsights(client.ad_account_id, range, "ad", focus),
      getBreakdown(client.ad_account_id, range, "region", focus).catch(() => [] as any[]),
      getBreakdown(client.ad_account_id, range, "age,gender", focus).catch(() => [] as any[]),
    ]);
    const audience = buildAudience(regionRows, ageRows, obj);

    // Diagnóstico: quais actions a Meta devolve (confirma o nome da métrica de visitas ao perfil)
    if (obj === "perfil" && cur) {
      console.log("[insights] perfil action_types", client.name, JSON.stringify(actionTypes(cur)));
    }

    const accountCpr = accM?.costPerResult ?? null;
    const rankedCampaigns = rankEntities(campRows, obj, { idKey: "campaign_id", nameKey: "campaign_name", accountCpr });
    const rankedAds = rankEntities(adRows, obj, { idKey: "ad_id", nameKey: "ad_name", accountCpr, withHook: true });

    // Criativos: top 12 (por resultados e por verba) + todos que têm selo
    const pick = new Map<string, (typeof rankedAds)[number]>();
    rankedAds.slice(0, 12).forEach((a) => pick.set(a.id, a));
    [...rankedAds].sort((a, b) => b.m.spend - a.m.spend).slice(0, 6).forEach((a) => pick.set(a.id, a));
    rankedAds.filter((a) => a.badges.length).forEach((a) => pick.set(a.id, a));
    const chosen = Array.from(pick.values()).slice(0, 18);
    const creativeInfo = await getCreatives(chosen.map((a) => a.id)).catch(() => ({} as Record<string, any>));

    const creatives = rankedAds
      .filter((a) => pick.has(a.id))
      .map((a) => ({
        ad_id: a.id,
        name: a.name,
        campaign_name: (a.raw as any).campaign_name ?? "",
        adset_name: (a.raw as any).adset_name ?? "",
        m: a.m,
        spendShare: a.spendShare,
        resultShare: a.resultShare,
        index: a.index,
        tier: a.tier,
        badges: a.badges,
        ...((creativeInfo as any)[a.id] ?? {}),
      }));

    const campaigns = rankedCampaigns.map((c) => ({
      campaign_id: c.id,
      name: c.name,
      m: c.m,
      spendShare: c.spendShare,
      resultShare: c.resultShare,
      index: c.index,
      tier: c.tier,
      badges: c.badges,
    }));

    const insights = accM
      ? buildInsights({
          objetivo: obj,
          account: accM,
          previous: prvM,
          campaigns: rankedCampaigns,
          creatives: rankedAds,
          compareLabel: "período anterior",
        })
      : [];

    // Compatibilidade: destaques antigos (top 5 criativos por resultado)
    const highlights = creatives.slice(0, 5).map((c: any) => ({
      ad_id: c.ad_id,
      name: c.name,
      results: c.m.results,
      costPerResult: c.m.costPerResult,
      spend: c.m.spend,
      thumb: c.thumb,
      image: c.image,
      permalink: c.permalink,
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
      campaigns,
      creatives,
      insights,
      audience,
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
