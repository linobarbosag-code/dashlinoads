// app/api/insights/route.ts
// Insights sob demanda: valida a sessão, confere se o usuário tem acesso
// à conta pedida (via RLS) e chama a Meta ao vivo (botão "Atualizar agora").

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountInsights,
  getCampaignInsights,
  getDailyInsights,
  extractResult,
  type DatePreset,
} from "@/lib/meta";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("client_id");
  const preset = (req.nextUrl.searchParams.get("period") ??
    "last_7d") as DatePreset;

  // RLS resolve o acesso: se o select retornar vazio, o usuário não tem vínculo.
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, currency")
    .eq("id", clientId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const [account, campaigns, daily] = await Promise.all([
      getAccountInsights(client.ad_account_id, preset),
      getCampaignInsights(client.ad_account_id, preset),
      getDailyInsights(client.ad_account_id, preset),
    ]);

    return NextResponse.json({
      client: { name: client.name, currency: client.currency },
      account: account
        ? { ...account, ...extractResult(account) }
        : null,
      campaigns: campaigns.map((c) => ({ ...c, ...extractResult(c) })),
      daily,
      fetched_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
