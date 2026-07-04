// lib/report-send.ts — monta os dados, gera o PDF e envia no grupo
import {
  getInsights,
  previousRange,
  detectObjetivo,
  extractResult,
  buildFunnel,
  RESULT_META,
  type Range,
} from "@/lib/meta-v2";
import { buildReportPdf } from "@/lib/report-pdf";
import { sendText, sendDocument } from "@/lib/whatsapp";

const fInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fMoney = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fComp = (n: number) => {
  if (n >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "M";
  if (n >= 1000) return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return fInt(n);
};

function deltaStr(cur: number, prev: number | null, invert = false) {
  if (!prev || !isFinite(prev)) return undefined;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  return {
    text: `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs semana anterior`,
    good,
  };
}

export async function sendWeeklyReport(client: {
  id: string;
  name: string;
  ad_account_id: string;
  group_id: string;
}) {
  // Últimos 7 dias fechados (ontem para trás)
  const end = new Date(Date.now() - 4 * 3600e3); // America/Campo_Grande (UTC-4)
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const range: Range = { since: iso(start), until: iso(end) };

  const [curArr, prevArr, campaigns] = await Promise.all([
    getInsights(client.ad_account_id, range, "account"),
    getInsights(client.ad_account_id, previousRange(range), "account"),
    getInsights(client.ad_account_id, range, "campaign"),
  ]);
  const cur = curArr[0];
  if (!cur || Number(cur.spend) === 0) {
    return { skipped: true, reason: "Sem veiculação no período" };
  }
  const prv = prevArr[0] ?? null;
  const objetivo = detectObjetivo(cur);
  const meta = RESULT_META[objetivo];

  const curR = extractResult(cur, objetivo);
  const prvR = prv ? extractResult(prv, objetivo) : null;
  const spend = Number(cur.spend);

  const fmt = (d: Date) =>
    `${("0" + d.getUTCDate()).slice(-2)}/${("0" + (d.getUTCMonth() + 1)).slice(-2)}`;
  const periodLabel = `${fmt(start)} a ${fmt(end)}`;

  const dSpend = deltaStr(spend, prv ? Number(prv.spend) : null);
  const dRes = deltaStr(curR.results, prvR?.results ?? null);
  const dCusto = deltaStr(curR.costPerResult ?? 0, prvR?.costPerResult ?? null, true);

  const pdf = await buildReportPdf({
    clientName: client.name,
    periodLabel,
    resultKey: meta.resultKey,
    custoKey: meta.custoShort,
    kpis: [
      { label: "Investimento", value: fMoney(spend), delta: dSpend?.text, deltaGood: dSpend?.good },
      { label: meta.resultKey, value: fInt(curR.results), delta: dRes?.text, deltaGood: dRes?.good },
      { label: meta.custoKey, value: curR.costPerResult ? fMoney(curR.costPerResult) : "—", delta: dCusto?.text, deltaGood: dCusto?.good },
      { label: "Impressões", value: fComp(Number(cur.impressions)) },
      { label: "Cliques", value: fComp(Number(cur.clicks)) },
      { label: "CTR", value: Number(cur.ctr).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%" },
    ],
    funnel: buildFunnel(cur, objetivo).map((f) => ({
      stage: f.stage,
      value: f.value,
      valueStr: fComp(f.value),
    })),
    campaigns: campaigns
      .filter((c) => Number(c.spend) > 0)
      .map((c) => ({ c, r: extractResult(c, objetivo) }))
      .sort((a, b) => Number(b.c.spend) - Number(a.c.spend))
      .map(({ c, r }) => ({
        name: c.campaign_name ?? "",
        results: fInt(r.results),
        cost: r.costPerResult ? fMoney(r.costPerResult) : "—",
        spend: fMoney(Number(c.spend)),
      })),
  });

  const msg =
    `📊 *Relatório semanal — ${client.name}*\n` +
    `_Período: ${periodLabel}_\n\n` +
    `💰 Investimento: *${fMoney(spend)}*\n` +
    `🎯 ${meta.resultKey}: *${fInt(curR.results)}*` + (dRes ? ` (${dRes.text})` : "") + `\n` +
    `📉 ${meta.custoKey}: *${curR.costPerResult ? fMoney(curR.costPerResult) : "—"}*\n\n` +
    `O relatório completo está no PDF abaixo. Qualquer dúvida, é só chamar por aqui! 🚀\n` +
    `_Equipe LinoADS_`;

  await sendText(client.group_id, msg);
  const b64 = Buffer.from(pdf).toString("base64");
  await sendDocument(
    client.group_id,
    b64,
    `Relatorio_${client.name.replace(/\s+/g, "_")}_${range.since}_${range.until}.pdf`
  );
  return { skipped: false, period: periodLabel };
}
