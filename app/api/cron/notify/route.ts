// Cron horário: relatórios semanais agendados + alerta de saldo baixo
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWeeklyReport } from "@/lib/report-send";
import { sendText } from "@/lib/whatsapp";
import { getAccountInfo } from "@/lib/meta-v2";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date(Date.now() - 4 * 3600e3); // America/Campo_Grande (UTC-4, sem horário de verão)
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const firstRunOfHour = minute < 10;
  const MAX_REPORTS_PER_RUN = 3;      // escalona envios: evita rajada no WhatsApp e timeout
  const DELAY_BETWEEN_SENDS = 8000;    // pausa entre relatórios (cadência humana)
  let sentThisRun = 0;

  const { data: rows } = await db
    .from("notification_settings")
    .select("*, clients(id, name, ad_account_id, active, objetivo)")
    .not("group_id", "is", null);

  const out: Record<string, string> = {};
  for (const s of rows ?? []) {
    const client = (s as any).clients;
    if (!client?.active) continue;
    const tag = client.name;

    // ===== Relatório semanal (janela: a hora configurada inteira; fila de até 3 por rodada de 10 min)
    if (
      s.weekly_enabled &&
      s.weekly_day === day &&
      s.weekly_hour === hour &&
      sentThisRun < MAX_REPORTS_PER_RUN
    ) {
      const last = s.last_weekly_sent ? new Date(s.last_weekly_sent).getTime() : 0;
      if (Date.now() - last > 6 * 86400e3) {
        if (sentThisRun > 0) await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SENDS));
        try {
          const r = await sendWeeklyReport({ ...client, group_id: s.group_id });
          if (!r.skipped) {
            await db.from("notification_settings").update({ last_weekly_sent: new Date().toISOString() }).eq("client_id", client.id);
            await db.from("notification_log").insert({ client_id: client.id, type: "weekly_report", status: "sent", detail: `Automático · ${r.period}` });
            out[tag] = "relatório enviado";
            sentThisRun++;
          } else {
            out[tag] = `pulado: ${r.reason}`;
          }
        } catch (e: any) {
          await db.from("notification_log").insert({ client_id: client.id, type: "weekly_report", status: "error", detail: e.message });
          out[tag] = `erro: ${e.message}`;
        }
      }
    }

    // ===== Saldo baixo (só pré-pago; verificado 2x/dia: 10h e 15h)
    if (s.low_balance_enabled && firstRunOfHour && (hour === 10 || hour === 15)) {
      try {
        const info = await getAccountInfo(client.ad_account_id);
        // Só alerta com leitura CONFIÁVEL do saldo disponível (display_string da Meta).
        // info.balance é gasto em aberto, não saldo — nunca usar para alertar.
        if (info.isPrepaid && info.available !== null) {
          const threshold = Number(s.low_balance_threshold);
          if (info.available < threshold && !s.low_balance_alerted) {
            await sendText(
              s.group_id,
              `⚠️ *Aviso de saldo — ${client.name}*\n\nO saldo disponível da conta de anúncios está em *R$ ${info.available.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*, abaixo do limite de R$ ${threshold.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.\n\nPara as campanhas não pausarem, recomendamos recarregar a conta. Qualquer dúvida estamos à disposição!\n_Equipe LinoADS_`
            );
            await db.from("notification_settings").update({ low_balance_alerted: true }).eq("client_id", client.id);
            await db.from("notification_log").insert({ client_id: client.id, type: "low_balance", status: "sent", detail: `Saldo disponível R$ ${info.available.toFixed(2)} < R$ ${threshold.toFixed(2)}` });
            out[tag] = (out[tag] ? out[tag] + " · " : "") + "alerta de saldo enviado";
          }
          // Rearma o alerta quando o saldo se recupera (20% acima do limite)
          if (s.low_balance_alerted && info.available > threshold * 1.2) {
            await db.from("notification_settings").update({ low_balance_alerted: false }).eq("client_id", client.id);
          }
        }
      } catch (e: any) {
        out[tag] = (out[tag] ? out[tag] + " · " : "") + `saldo erro: ${e.message}`;
      }
    }
  }
  return NextResponse.json({ hour, day, minute, sentThisRun, results: out });
}
