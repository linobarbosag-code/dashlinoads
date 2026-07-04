// lib/report-pdf.ts — PDF do relatório semanal com a identidade do dashboard
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";

const NAVY = rgb(0.102, 0.078, 0.259); // #1A1442
const INK2 = rgb(0.29, 0.271, 0.408); // #4A4568
const MUTED = rgb(0.565, 0.588, 0.667); // #9096AA
const CARD_BORDER = rgb(0.925, 0.929, 0.953);
const BG = rgb(0.961, 0.965, 0.98); // #F5F6FA
const FUNNEL = [
  rgb(0.91, 0.2, 0.431), // E8336E
  rgb(0.937, 0.353, 0.341),
  rgb(0.949, 0.427, 0.2),
  rgb(0.961, 0.506, 0.235),
  rgb(0.969, 0.635, 0.2),
  rgb(0.976, 0.761, 0.18), // F9C22E
];
const GREEN = rgb(0.071, 0.651, 0.416);

export interface ReportData {
  clientName: string;
  periodLabel: string;
  resultKey: string;
  custoKey: string;
  kpis: { label: string; value: string; delta?: string; deltaGood?: boolean }[];
  funnel: { stage: string; value: number; valueStr: string }[];
  campaigns: { name: string; results: string; cost: string; spend: string }[];
}

const money = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && font.widthOfTextAtSize(t + "…", size) > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

export async function buildReportPdf(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const W = 595;
  const M = 40;

  // Fundo
  page.drawRectangle({ x: 0, y: 0, width: W, height: 842, color: BG });

  // ===== Header navy
  page.drawRectangle({ x: 0, y: 772, width: W, height: 70, color: NAVY });
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
    const logo = await doc.embedPng(logoBytes);
    page.drawImage(logo, { x: M, y: 786, width: 42, height: 42 });
  } catch {}
  page.drawText("LinoADS", { x: M + 52, y: 806, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("RELATÓRIO DE DESEMPENHO · META ADS", {
    x: M + 52, y: 792, size: 7, font: reg, color: rgb(0.75, 0.75, 0.85),
  });
  const perW = reg.widthOfTextAtSize(data.periodLabel, 9);
  page.drawText(data.periodLabel, { x: W - M - perW, y: 806, size: 9, font: reg, color: rgb(0.85, 0.85, 0.92) });
  const cliW = bold.widthOfTextAtSize(data.clientName, 13);
  page.drawText(data.clientName, { x: W - M - cliW, y: 790, size: 13, font: bold, color: rgb(1, 1, 1) });

  let y = 742;

  // ===== KPIs (grade 3x2)
  const kw = (W - 2 * M - 2 * 12) / 3;
  const kh = 64;
  data.kpis.slice(0, 6).forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (kw + 12);
    const yy = y - row * (kh + 12) - kh;
    page.drawRectangle({ x, y: yy, width: kw, height: kh, color: rgb(1, 1, 1), borderColor: CARD_BORDER, borderWidth: 1 });
    page.drawRectangle({ x, y: yy, width: 4, height: kh, color: FUNNEL[i % FUNNEL.length] });
    page.drawText(fit(reg, k.label.toUpperCase(), 6.5, kw - 20), { x: x + 12, y: yy + kh - 16, size: 6.5, font: reg, color: MUTED });
    page.drawText(fit(bold, k.value, 16, kw - 20), { x: x + 12, y: yy + kh - 36, size: 16, font: bold, color: NAVY });
    if (k.delta) {
      page.drawText(fit(reg, k.delta, 7, kw - 20), {
        x: x + 12, y: yy + 10, size: 7, font: bold,
        color: k.deltaGood === false ? FUNNEL[0] : GREEN,
      });
    }
  });
  y -= 2 * kh + 12 + 30;

  // ===== Funil
  page.drawText("FUNIL DE CONVERSÃO", { x: M, y, size: 9, font: bold, color: NAVY });
  y -= 14;
  const maxV = Math.max(...data.funnel.map((f) => f.value), 1);
  const fullW = W - 2 * M - 120;
  data.funnel.slice(0, 6).forEach((f, i) => {
    const bw = Math.max(0.26, 0.26 + 0.74 * (Math.log10(f.value + 1) / Math.log10(maxV + 1))) * fullW;
    const bx = M + (fullW - bw) / 2;
    page.drawRectangle({ x: bx, y: y - 22, width: bw, height: 20, color: FUNNEL[i % FUNNEL.length] });
    page.drawText(fit(bold, f.stage, 8, bw - 60), { x: bx + 8, y: y - 16, size: 8, font: bold, color: rgb(1, 1, 1) });
    const vw = bold.widthOfTextAtSize(f.valueStr, 9);
    page.drawText(f.valueStr, { x: bx + bw - vw - 8, y: y - 16, size: 9, font: bold, color: rgb(1, 1, 1) });
    if (i > 0 && data.funnel[i - 1].value > 0) {
      const rate = ((f.value / data.funnel[i - 1].value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
      page.drawText(rate, { x: M + fullW + 16, y: y - 16, size: 8, font: bold, color: INK2 });
    }
    y -= 26;
  });
  y -= 20;

  // ===== Top campanhas
  page.drawText("PRINCIPAIS CAMPANHAS", { x: M, y, size: 9, font: bold, color: NAVY });
  y -= 16;
  const cols = [M, M + 250, M + 330, M + 420];
  page.drawText("CAMPANHA", { x: cols[0], y, size: 6.5, font: reg, color: MUTED });
  page.drawText(data.resultKey.toUpperCase(), { x: cols[1], y, size: 6.5, font: reg, color: MUTED });
  page.drawText(data.custoKey.toUpperCase().slice(0, 18), { x: cols[2], y, size: 6.5, font: reg, color: MUTED });
  page.drawText("INVESTIDO", { x: cols[3], y, size: 6.5, font: reg, color: MUTED });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: CARD_BORDER });
  y -= 16;
  for (const c of data.campaigns.slice(0, 9)) {
    if (y < 90) break;
    page.drawText(fit(reg, c.name, 8, 240), { x: cols[0], y, size: 8, font: reg, color: NAVY });
    page.drawText(c.results, { x: cols[1], y, size: 8, font: bold, color: NAVY });
    page.drawText(c.cost, { x: cols[2], y, size: 8, font: reg, color: INK2 });
    page.drawText(c.spend, { x: cols[3], y, size: 8, font: bold, color: NAVY });
    y -= 17;
  }

  // ===== Rodapé
  page.drawRectangle({ x: 0, y: 0, width: W, height: 46, color: NAVY });
  page.drawText("Gerado automaticamente pelo portal LinoADS", { x: M, y: 26, size: 8, font: reg, color: rgb(0.8, 0.8, 0.9) });
  page.drawText("dashlinoads.vercel.app · Campo Grande, MS", { x: M, y: 14, size: 7, font: reg, color: rgb(0.6, 0.6, 0.75) });
  const dt = new Date().toLocaleString("pt-BR", { timeZone: "America/Campo_Grande" });
  const dtw = reg.widthOfTextAtSize(dt, 7);
  page.drawText(dt, { x: W - M - dtw, y: 20, size: 7, font: reg, color: rgb(0.6, 0.6, 0.75) });

  void money;
  return doc.save();
}
