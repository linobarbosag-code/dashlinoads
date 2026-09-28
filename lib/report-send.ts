// lib/report-send.ts — monta o relatório do mês, gera o PDF e envia no grupo
import type { Objetivo } from "@/lib/meta-v2";
import { buildReportPdf } from "@/lib/report-pdf";
import { collectReport, monthToDate, fMoney, fInt } from "@/lib/report-data";
import { sendText, sendDocument } from "@/lib/whatsapp";

export async function sendWeeklyReport(client: {
  id: string;
  name: string;
  ad_account_id: string;
  group_id: string;
  objetivo?: Objetivo;
}) {
  const { range, prevRange, periodLabel } = monthToDate();
  const r = await collectReport({
    client,
    range,
    prevRange,
    periodLabel,
    compareLabel: "mesmo período do mês anterior",
    deltaSuffix: "vs mês anterior",
  });
  if (r.skipped) return { skipped: true as const, reason: r.reason };

  const pdf = await buildReportPdf(r.data);
  const s = r.summary;

  let msg =
    `📊 *Relatório do mês — ${client.name}*\n` +
    `_Período: ${periodLabel} · comparado ao mesmo período do mês anterior_\n\n` +
    `💰 Investimento: *${fMoney(s.spend)}*\n` +
    `🎯 ${s.resultKey}: *${fInt(s.results)}*` + (s.resultsDelta ? ` (${s.resultsDelta})` : "") + `\n` +
    `📉 ${s.custoKey}: *${s.costPerResult ? fMoney(s.costPerResult) : "—"}*\n`;
  if (s.bestCampaign && s.bestCampaign.results > 0) {
    msg += `\n🏆 Campanha destaque: *${s.bestCampaign.name}* — ${fInt(s.bestCampaign.results)} ${s.resultKey.toLowerCase()}` +
      (s.bestCampaign.cpr ? ` a ${fMoney(s.bestCampaign.cpr)}` : "") + `\n`;
  }
  if (s.bestCreative && s.bestCreative.results > 0) {
    msg += `🎨 Criativo destaque: *${s.bestCreative.name}*` + (s.bestCreative.cpr ? ` (${fMoney(s.bestCreative.cpr)} por resultado)` : "") + `\n`;
  }
  msg += `\nNo PDF abaixo estão o ranking de campanhas, os criativos e a leitura completa do período. Qualquer dúvida, é só chamar por aqui! 🚀\n_Equipe LinoADS_`;

  await sendText(client.group_id, msg);
  await sendDocument(
    client.group_id,
    Buffer.from(pdf).toString("base64"),
    `Relatorio_${client.name.replace(/\s+/g, "_")}_${range.since}_${range.until}.pdf`
  );
  return { skipped: false as const, period: periodLabel };
}
