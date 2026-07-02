// app/api/cron/sync/route.ts
// Roda a cada 15 min (vercel.json). Sincroniza insights de todas as contas
// ativas para o cache. Usa service role (ignora RLS) e valida CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getAccountInsights,
  getCampaignInsights,
  extractResult,
} from "@/lib/meta";

export const maxDuration = 300;

const PRESETS = ["last_7d", "last_30d"] as const;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: clients } = await db
    .from("clients")
    .select("id, ad_account_id")
    .eq("active", true);

  const results: Record<string, string> = {};

  for (const client of clients ?? []) {
    try {
      for (const preset of PRESETS) {
        const account = await getAccountInsights(client.ad_account_id, preset);
        if (account) {
          const r = extractResult(account);
          await db.from("insights_cache").upsert(
            {
              client_id: client.id,
              level: "account",
              campaign_id: null,
              date_start: account.date_start,
              date_stop: account.date_stop,
              spend: Number(account.spend),
              impressions: Number(account.impressions),
              clicks: Number(account.clicks),
              ctr: Number(account.ctr),
              cpc: Number(account.cpc || 0),
              cpm: Number(account.cpm || 0),
              results: r.results,
              result_type: r.resultType,
              cost_per_result: r.costPerResult,
              raw: account,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "client_id,level,campaign_id,date_start,date_stop" }
          );
        }

        const campaigns = await getCampaignInsights(
          client.ad_account_id,
          preset
        );
        for (const c of campaigns) {
          const r = extractResult(c);
          await db.from("insights_cache").upsert(
            {
              client_id: client.id,
              level: "campaign",
              campaign_id: c.campaign_id,
              campaign_name: c.campaign_name,
              date_start: c.date_start,
              date_stop: c.date_stop,
              spend: Number(c.spend),
              impressions: Number(c.impressions),
              clicks: Number(c.clicks),
              ctr: Number(c.ctr),
              cpc: Number(c.cpc || 0),
              cpm: Number(c.cpm || 0),
              results: r.results,
              result_type: r.resultType,
              cost_per_result: r.costPerResult,
              raw: c,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "client_id,level,campaign_id,date_start,date_stop" }
          );
        }
      }
      results[client.ad_account_id] = "ok";
    } catch (err: any) {
      // Não derruba o lote inteiro por causa de uma conta com erro/rate limit
      results[client.ad_account_id] = err.message;
    }
    // Pausa entre contas para respeitar rate limit da Meta
    await new Promise((r) => setTimeout(r, 1500));
  }

  return NextResponse.json({ synced: results });
}
