// GET: settings + log + grupos + status da instância | POST: salvar | PUT: ações (teste/enviar agora)
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { listGroups, instanceStatus, sendText } from "@/lib/whatsapp";
import { sendWeeklyReport } from "@/lib/report-send";

export const maxDuration = 120;

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const db = createAdminClient();

  const [{ data: settings }, { data: log }] = await Promise.all([
    db.from("notification_settings").select("*"),
    db.from("notification_log").select("*, clients(name)").order("created_at", { ascending: false }).limit(30),
  ]);

  let groups: any[] = [];
  let status: any = null;
  let waError: string | null = null;
  try {
    [groups, status] = await Promise.all([listGroups(), instanceStatus()]);
  } catch (e: any) {
    waError = e.message;
  }
  return NextResponse.json({ settings: settings ?? [], log: log ?? [], groups, status, waError });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const body = await req.json();
  const db = createAdminClient();
  const { error } = await db.from("notification_settings").upsert(
    {
      client_id: body.client_id,
      group_id: body.group_id || null,
      group_name: body.group_name || null,
      weekly_enabled: !!body.weekly_enabled,
      weekly_day: Number(body.weekly_day ?? 1),
      weekly_hour: Number(body.weekly_hour ?? 8),
      low_balance_enabled: !!body.low_balance_enabled,
      low_balance_threshold: Number(body.low_balance_threshold ?? 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { action, client_id } = await req.json();
  const db = createAdminClient();

  const { data: client } = await db
    .from("clients").select("id, name, ad_account_id").eq("id", client_id).single();
  const { data: st } = await db
    .from("notification_settings").select("group_id").eq("client_id", client_id).single();

  if (!client || !st?.group_id)
    return NextResponse.json({ error: "Configure e salve o grupo primeiro" }, { status: 400 });

  try {
    if (action === "test") {
      await sendText(st.group_id, `✅ Teste de conexão do portal LinoADS — grupo vinculado à conta *${client.name}* com sucesso.`);
      await db.from("notification_log").insert({ client_id, type: "test", status: "sent", detail: "Mensagem de teste" });
      return NextResponse.json({ ok: true, msg: "Mensagem de teste enviada no grupo" });
    }
    if (action === "send_now") {
      const r = await sendWeeklyReport({ ...client, group_id: st.group_id });
      if (r.skipped) {
        return NextResponse.json({ error: r.reason }, { status: 400 });
      }
      await db.from("notification_settings").update({ last_weekly_sent: new Date().toISOString() }).eq("client_id", client_id);
      await db.from("notification_log").insert({ client_id, type: "weekly_report", status: "sent", detail: `Envio manual · ${r.period}` });
      return NextResponse.json({ ok: true, msg: `Relatório (${r.period}) enviado no grupo` });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e: any) {
    await db.from("notification_log").insert({ client_id, type: action === "test" ? "test" : "weekly_report", status: "error", detail: e.message });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
