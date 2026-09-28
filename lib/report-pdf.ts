// lib/report-pdf.ts — Relatório de desempenho em PDF (3 páginas), identidade LinoADS.
// Página 1: resumo, KPIs, métricas detalhadas, evolução diária, leitura do período
// Página 2: funil + ranking de campanhas
// Página 3: criativos em destaque (com imagem)
import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
  type PDFFont,
  type PDFPage,
  type PDFImage,
  type RGB,
} from "pdf-lib";
import fs from "fs";
import path from "path";

// ===== Tokens
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NAVY = hex("#1A1442");
const INK2 = hex("#4A4568");
const MUTED = hex("#9096AA");
const MUTED2 = hex("#A0A4B4");
const LINE = hex("#ECEDF3");
const LINE2 = hex("#F1F2F7");
const BG = hex("#F5F6FA");
const WHITE = rgb(1, 1, 1);
const PINK = hex("#E8336E");
const ORANGE = hex("#F5813C");
const YELLOW = hex("#F9C22E");
const GREEN = hex("#12A66A");
const FUNNEL = ["#E8336E", "#EF5A57", "#F26D33", "#F5813C", "#F7A233", "#F9C22E"].map(hex);

const BADGE: Record<string, { label: string; fg: RGB; bg: RGB }> = {
  most_results: { label: "Mais resultados", fg: hex("#C21E56"), bg: hex("#FCE7EF") },
  best_cost: { label: "Menor custo", fg: hex("#0E7A4E"), bg: hex("#E7F6EF") },
  best_ctr: { label: "Maior CTR", fg: hex("#C2410C"), bg: hex("#FDEEE1") },
  best_roas: { label: "Maior ROAS", fg: hex("#6D28D9"), bg: hex("#F1EAFE") },
  best_hook: { label: "Melhor gancho", fg: hex("#B45309"), bg: hex("#FDF0DE") },
};
const TIER: Record<string, { label: string; fg: RGB; bg: RGB }> = {
  top: { label: "Acima da média", fg: hex("#0E7A4E"), bg: hex("#E7F6EF") },
  ok: { label: "Na média", fg: INK2, bg: hex("#F0F1F6") },
  low: { label: "Abaixo da média", fg: hex("#B45309"), bg: hex("#FDF0DE") },
  none: { label: "Sem resultado", fg: MUTED, bg: hex("#F4F5F9") },
};

// ===== Tipos
export interface ReportImage {
  bytes: Uint8Array;
  kind: "jpg" | "png";
}
export interface ReportCampaign {
  name: string;
  badges: string[];
  tier: string;
  results: string;
  cost: string;
  ctr: string;
  spend: string;
  spendShare: number;
  resultShare: number;
}
export interface ReportCreative {
  name: string;
  campaign: string;
  badges: string[];
  tier: string;
  isVideo: boolean;
  image: ReportImage | null;
  stats: { label: string; value: string }[]; // 4 itens
  resultShare: number;
}
export interface ReportData {
  clientName: string;
  periodLabel: string;
  platformLabel: string;
  resultKey: string;
  custoShort: string;
  headline: string;
  compareNote: string;
  kpis: { label: string; value: string; delta?: string; deltaGood?: boolean }[];
  secondary: { label: string; value: string }[];
  daily: { label: string; spend: number; results: number }[];
  highlights: string[];
  funnel: { stage: string; value: number; valueStr: string }[];
  campaigns: ReportCampaign[];
  moreCampaigns: number;
  creatives: ReportCreative[];
}

// ===== Texto seguro para WinAnsi (Helvetica)
export function winAnsiSafe(s: string): string {
  return (s ?? "")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/\s*[^\u0000-ÿ]+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/ "(?=[\s.,;:!?)]|$)/g, '"')
    .trim();
}

// ===== Helpers de desenho
const W = 595;
const H = 842;
const M = 34;
const CW = W - 2 * M;

type Fonts = { reg: PDFFont; bold: PDFFont };

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + "...";
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number, maxLines = 99): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(font, lines.slice(maxLines - 1).join(" "), size, maxWidth);
    return kept;
  }
  return lines;
}

function rr(page: PDFPage, x: number, y: number, w: number, h: number, r: number, o: { fill?: RGB; stroke?: RGB; bw?: number; opacity?: number }) {
  r = Math.min(r, w / 2, h / 2);
  const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(p, {
    x,
    y: y + h,
    color: o.fill,
    borderColor: o.stroke,
    borderWidth: o.stroke ? o.bw ?? 0.8 : 0,
    opacity: o.opacity,
  });
}

function card(page: PDFPage, x: number, y: number, w: number, h: number) {
  rr(page, x, y, w, h, 10, { fill: WHITE, stroke: LINE, bw: 0.8 });
}

function txt(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = NAVY) {
  page.drawText(s, { x, y, size, font, color });
}
function txtR(page: PDFPage, s: string, xr: number, y: number, size: number, font: PDFFont, color: RGB = NAVY) {
  page.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y, size, font, color });
}
function label(page: PDFPage, f: Fonts, s: string, x: number, y: number, size = 6.5, color: RGB = MUTED) {
  page.drawText(s.toUpperCase(), { x, y, size, font: f.bold, color });
}

function pill(page: PDFPage, f: Fonts, s: string, x: number, y: number, fg: RGB, bg: RGB, size = 5.8): number {
  const w = f.bold.widthOfTextAtSize(s, size) + 8;
  rr(page, x, y, w, size + 5.5, (size + 5.5) / 2, { fill: bg });
  txt(page, s, x + 4, y + 3, size, f.bold, fg);
  return w;
}

function badgeRow(page: PDFPage, f: Fonts, keys: string[], x: number, y: number, maxW: number, size = 5.8) {
  let cx = x;
  for (const k of keys) {
    const b = BADGE[k];
    if (!b) continue;
    const w = f.bold.widthOfTextAtSize(b.label, size) + 8;
    if (cx + w > x + maxW) break;
    pill(page, f, b.label, cx, y, b.fg, b.bg, size);
    cx += w + 3;
  }
}

function roundedClip(page: PDFPage, x: number, y: number, w: number, h: number, r: number) {
  const k = 0.5523 * r;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
    clip(),
    endPath()
  );
}

const compact = (v: number) =>
  v >= 1e6
    ? (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "M"
    : v >= 1000
    ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil"
    : Math.round(v).toLocaleString("pt-BR");

// ===== Estrutura de página
function header(page: PDFPage, f: Fonts, d: ReportData, logo: PDFImage | null, section: string) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: NAVY });
  // faixa de marca
  const third = W / 3;
  page.drawRectangle({ x: 0, y: H - 73, width: third, height: 3, color: PINK });
  page.drawRectangle({ x: third, y: H - 73, width: third, height: 3, color: ORANGE });
  page.drawRectangle({ x: 2 * third, y: H - 73, width: third + 1, height: 3, color: YELLOW });
  if (logo) page.drawImage(logo, { x: M, y: H - 56, width: 40, height: 40 });
  txt(page, "LinoADS", M + 50, H - 35, 17, f.bold, WHITE);
  txt(page, `RELATÓRIO DE DESEMPENHO · ${d.platformLabel}`, M + 50, H - 48, 6.5, f.bold, hex("#B9B6D3"));
  txtR(page, fit(f.bold, d.clientName, 13, 240), W - M, H - 34, 13, f.bold, WHITE);
  txtR(page, d.periodLabel, W - M, H - 48, 8.5, f.reg, hex("#CFCDE3"));
  // título da seção
  txt(page, section, M, H - 100, 13, f.bold, NAVY);
}

function footer(page: PDFPage, f: Fonts, n: number, total: number) {
  page.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.6, color: LINE });
  txt(page, "Relatório gerado automaticamente pelo portal LinoADS · Campo Grande, MS", M, 20, 6.8, f.reg, MUTED);
  const dt = new Date().toLocaleString("pt-BR", { timeZone: "America/Campo_Grande", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  txtR(page, `Página ${n} de ${total} · ${dt}`, W - M, 20, 6.8, f.reg, MUTED);
}

// ===== Página 1
function drawDailyChart(page: PDFPage, f: Fonts, d: ReportData, x: number, y: number, w: number, h: number) {
  card(page, x, y, w, h);
  txt(page, "Evolução diária", x + 14, y + h - 20, 9.5, f.bold);
  // legenda
  const lx = x + w - 14;
  const legR = `${d.resultKey} (linha)`;
  const legRw = f.reg.widthOfTextAtSize(legR, 6.8);
  txtR(page, legR, lx, y + h - 19, 6.8, f.reg, INK2);
  page.drawLine({ start: { x: lx - legRw - 18, y: y + h - 16.5 }, end: { x: lx - legRw - 6, y: y + h - 16.5 }, thickness: 1.6, color: NAVY });
  const legS = "Investimento (barras)";
  const sx = lx - legRw - 26;
  txtR(page, legS, sx, y + h - 19, 6.8, f.reg, INK2);
  rr(page, sx - f.reg.widthOfTextAtSize(legS, 6.8) - 12, y + h - 20, 8, 7, 1.5, { fill: hex("#F7B98E") });

  const days = d.daily;
  if (days.length === 0) {
    txt(page, "Sem dados diários no período.", x + 14, y + h / 2, 8, f.reg, MUTED);
    return;
  }
  const px0 = x + 46;
  const px1 = x + w - 34;
  const py0 = y + 22;
  const py1 = y + h - 34;
  const maxS = Math.max(...days.map((d) => d.spend), 1);
  const maxR = Math.max(...days.map((d) => d.results), 1);
  const slot = (px1 - px0) / days.length;

  // grade
  for (let g = 0; g <= 2; g++) {
    const gy = py0 + ((py1 - py0) * g) / 2;
    page.drawLine({ start: { x: px0, y: gy }, end: { x: px1, y: gy }, thickness: 0.5, color: LINE2 });
  }
  txtR(page, "R$ " + compact(maxS), px0 - 5, py1 - 2, 6.3, f.reg, MUTED);
  txtR(page, "R$ 0", px0 - 5, py0 - 2, 6.3, f.reg, MUTED);
  txt(page, compact(maxR), px1 + 5, py1 - 2, 6.3, f.bold, NAVY);
  txt(page, "0", px1 + 5, py0 - 2, 6.3, f.reg, MUTED);

  // barras
  const bw = Math.max(2, Math.min(16, slot * 0.62));
  days.forEach((dd, i) => {
    const bh = ((py1 - py0) * dd.spend) / maxS;
    const bx = px0 + slot * i + (slot - bw) / 2;
    if (bh > 0.5) rr(page, bx, py0, bw, bh, Math.min(2, bw / 2), { fill: hex("#F7B98E") });
  });
  // linha de resultados
  const pts = days.map((dd, i) => ({ x: px0 + slot * i + slot / 2, y: py0 + ((py1 - py0) * dd.results) / maxR }));
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({ start: pts[i - 1], end: pts[i], thickness: 1.6, color: NAVY });
  }
  if (pts.length <= 45) pts.forEach((p) => page.drawCircle({ x: p.x, y: p.y, size: 1.9, color: PINK }));

  // rótulos do eixo X
  const step = Math.max(1, Math.ceil(days.length / 10));
  days.forEach((dd, i) => {
    if (i % step !== 0 && i !== days.length - 1) return;
    const cx = px0 + slot * i + slot / 2;
    const lw = f.reg.widthOfTextAtSize(dd.label, 6);
    txt(page, dd.label, cx - lw / 2, y + 9, 6, f.reg, MUTED);
  });
}

function page1(page: PDFPage, f: Fonts, d: ReportData): number {
  let y = H - 116;

  // Resumo em uma frase
  const lines = wrap(f.bold, d.headline, 11.5, CW - 40, 4);
  const hh = 34 + lines.length * 15 + 16;
  card(page, M, y - hh, CW, hh);
  rr(page, M, y - hh, 5, hh, 2.5, { fill: PINK });
  label(page, f, "Em uma frase", M + 18, y - 18, 6.5, PINK);
  lines.forEach((l, i) => txt(page, l, M + 18, y - 34 - i * 15, 11.5, f.bold, NAVY));
  txt(page, d.compareNote, M + 18, y - hh + 11, 7, f.reg, MUTED);
  y -= hh + 12;

  // KPIs 3x2
  const kw = (CW - 2 * 10) / 3;
  const kh = 64;
  d.kpis.slice(0, 6).forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (kw + 10);
    const yy = y - kh - row * (kh + 10);
    card(page, x, yy, kw, kh);
    page.drawCircle({ x: x + 16, y: yy + kh - 17, size: 3, color: FUNNEL[i % FUNNEL.length] });
    label(page, f, fit(f.bold, k.label.toUpperCase(), 6.5, kw - 40), x + 24, yy + kh - 19.5, 6.5);
    txt(page, fit(f.bold, k.value, 17, kw - 26), x + 13, yy + kh - 42, 17, f.bold, NAVY);
    if (k.delta) txt(page, fit(f.bold, k.delta, 7, kw - 26), x + 13, yy + 11, 7, f.bold, k.deltaGood === false ? PINK : GREEN);
  });
  y -= 2 * kh + 10 + 16;

  // Métricas detalhadas
  if (d.secondary.length) {
    label(page, f, "Métricas detalhadas", M, y, 6.8, INK2);
    y -= 8;
    const cols = 4;
    const sw = (CW - (cols - 1) * 8) / cols;
    const sh = 36;
    const items = d.secondary.slice(0, 8);
    items.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = M + col * (sw + 8);
      const yy = y - sh - row * (sh + 8);
      rr(page, x, yy, sw, sh, 8, { fill: WHITE, stroke: LINE, bw: 0.7 });
      label(page, f, fit(f.bold, s.label.toUpperCase(), 5.9, sw - 18), x + 10, yy + sh - 13, 5.9, MUTED2);
      txt(page, fit(f.bold, s.value, 11.5, sw - 18), x + 10, yy + 9, 11.5, f.bold, NAVY);
    });
    const rows = Math.ceil(items.length / cols);
    y -= rows * (sh + 8) + 10;
  }

  // Evolução diária
  const ch = 150;
  drawDailyChart(page, f, d, M, y - ch, CW, ch);
  y -= ch + 12;
  return y;
}

function drawHighlights(page: PDFPage, f: Fonts, d: ReportData, yTop: number, bottom: number): number {
  if (!d.highlights.length) return yTop;
  const maxW = CW - 44;
  const blocks = d.highlights.map((h) => wrap(f.reg, h, 8.3, maxW, 3));
  let needed = 34;
  const fitBlocks: string[][] = [];
  for (const b of blocks) {
    const bh = b.length * 11.5 + 7;
    if (yTop - needed - bh < bottom) break;
    needed += bh;
    fitBlocks.push(b);
  }
  if (!fitBlocks.length) return yTop;
  const hgt = needed + 6;
  card(page, M, yTop - hgt, CW, hgt);
  txt(page, "Leitura do período", M + 14, yTop - 20, 9.5, f.bold);
  let y = yTop - 38;
  for (const b of fitBlocks) {
    rr(page, M + 14, y - 1.5, 9, 9, 2.5, { fill: hex("#E7F6EF") });
    page.drawLine({ start: { x: M + 16.2, y: y + 3 }, end: { x: M + 18, y: y + 1 }, thickness: 1.1, color: GREEN });
    page.drawLine({ start: { x: M + 18, y: y + 1 }, end: { x: M + 21, y: y + 5.5 }, thickness: 1.1, color: GREEN });
    b.forEach((l, i) => txt(page, l, M + 30, y - i * 11.5, 8.3, f.reg, INK2));
    y -= b.length * 11.5 + 7;
  }
  return yTop - hgt - 12;
}

// ===== Página 2
function drawFunnel(page: PDFPage, f: Fonts, d: ReportData, yTop: number): number {
  const stages = d.funnel.slice(0, 6);
  if (!stages.length) return yTop;
  const rowH = 21;
  const h = 40 + stages.length * rowH + 6;
  card(page, M, yTop - h, CW, h);
  txt(page, "Funil de conversão", M + 14, yTop - 20, 9.5, f.bold);
  const last = stages[stages.length - 1];
  if (stages.length >= 2 && stages[0].value > 0) {
    const rate = ((last.value / stages[0].value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
    txtR(page, `Conversão total ${rate}`, M + CW - 14, yTop - 20, 7.5, f.bold, ORANGE);
  }
  const maxV = Math.max(...stages.map((s) => s.value), 1);
  const barX = M + 110;
  const barMax = CW - 110 - 80;
  stages.forEach((s, i) => {
    const yy = yTop - 40 - i * rowH;
    txt(page, fit(f.bold, s.stage, 7.5, 92), M + 14, yy - 11, 7.5, f.bold, INK2);
    const bw = Math.max(0.18, 0.18 + 0.82 * (Math.log10(s.value + 1) / Math.log10(maxV + 1))) * barMax;
    rr(page, barX, yy - 15, bw, 15, 4, { fill: FUNNEL[i % FUNNEL.length] });
    const vs = s.valueStr;
    const vw = f.bold.widthOfTextAtSize(vs, 8);
    if (vw + 12 < bw) txt(page, vs, barX + bw - vw - 7, yy - 10.5, 8, f.bold, WHITE);
    else txt(page, vs, barX + bw + 5, yy - 10.5, 8, f.bold, NAVY);
    if (i > 0 && stages[i - 1].value > 0) {
      const r = ((s.value / stages[i - 1].value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
      txtR(page, r, M + CW - 14, yy - 11, 7.5, f.bold, INK2);
    }
  });
  txtR(page, "passagem", M + CW - 14, yTop - 33, 5.8, f.reg, MUTED);
  return yTop - h - 14;
}

function drawCampaigns(page: PDFPage, f: Fonts, d: ReportData, yTop: number, bottom: number) {
  if (!d.campaigns.length) return;
  txt(page, "Ranking de campanhas", M, yTop - 4, 9.5, f.bold);
  txt(page, "Ordenado por resultados. Eficiência comparada ao custo médio da conta no período.", M, yTop - 16, 6.8, f.reg, MUTED);
  let y = yTop - 28;

  const X = {
    rank: M + 10,
    name: M + 30,
    share: M + 182,
    results: M + 306,
    cost: M + 358,
    ctr: M + 396,
    spend: M + 448,
    tier: M + 452,
  };
  const headH = 20;
  const rowH = 36;
  const rowsFit = Math.max(1, Math.floor((y - headH - bottom - 20) / rowH));
  const rows = d.campaigns.slice(0, rowsFit);
  const tableH = headH + rows.length * rowH + 6;
  card(page, M, y - tableH, CW, tableH);

  const hy = y - 13;
  label(page, f, "#", X.rank - 2, hy, 5.9);
  label(page, f, "Campanha", X.name, hy, 5.9);
  label(page, f, "Verba  x  resultados", X.share, hy, 5.9);
  const hr = (s: string, xr: number) => txtR(page, s.toUpperCase(), xr, hy, 5.9, f.bold, MUTED);
  hr(fit(f.bold, d.resultKey.toUpperCase(), 5.9, 50), X.results);
  hr(fit(f.bold, d.custoShort.toUpperCase(), 5.9, 52), X.cost);
  hr("CTR link", X.ctr);
  hr("Investido", X.spend);
  label(page, f, "Eficiência", X.tier + 4, hy, 5.9);
  page.drawLine({ start: { x: M + 8, y: y - headH }, end: { x: M + CW - 8, y: y - headH }, thickness: 0.6, color: LINE });

  rows.forEach((c, i) => {
    const top = y - headH - i * rowH;
    const mid = top - rowH / 2;
    if (i > 0) page.drawLine({ start: { x: M + 8, y: top }, end: { x: M + CW - 8, y: top }, thickness: 0.4, color: LINE2 });
    // posição
    rr(page, X.rank - 6, mid - 7, 16, 14, 4, { fill: i < 3 ? [PINK, ORANGE, YELLOW][i] : hex("#F0F1F6") });
    const rs = String(i + 1);
    txt(page, rs, X.rank + 2 - f.bold.widthOfTextAtSize(rs, 7.5) / 2, mid - 2.7, 7.5, f.bold, i === 2 ? NAVY : i < 3 ? WHITE : INK2);
    // nome + selos
    const hasBadges = c.badges.some((b) => BADGE[b]);
    txt(page, fit(f.bold, c.name, 7.8, 146), X.name, hasBadges ? mid + 2.5 : mid - 2.8, 7.8, f.bold, NAVY);
    if (hasBadges) badgeRow(page, f, c.badges, X.name, mid - 12, 148, 5.4);
    // participação
    const bw = 64;
    const bars = [
      { v: c.spendShare, color: hex("#C9CBD6"), yy: mid + 2 },
      { v: c.resultShare, color: PINK, yy: mid - 6 },
    ];
    bars.forEach((b) => {
      rr(page, X.share, b.yy, bw, 4.5, 2.2, { fill: LINE2 });
      if (b.v > 0) rr(page, X.share, b.yy, Math.max(3, (bw * Math.min(100, b.v)) / 100), 4.5, 2.2, { fill: b.color });
      txt(page, `${b.v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`, X.share + bw + 5, b.yy - 0.3, 6.3, f.bold, INK2);
    });
    txtR(page, c.results, X.results, mid - 3, 9, f.bold, NAVY);
    txtR(page, c.cost, X.cost, mid - 3, 7.6, f.reg, INK2);
    txtR(page, c.ctr, X.ctr, mid - 3, 7.6, f.reg, INK2);
    txtR(page, c.spend, X.spend, mid - 3, 7.8, f.bold, NAVY);
    const t = TIER[c.tier] ?? TIER.ok;
    pill(page, f, t.label, X.tier + 4, mid - 5.5, t.fg, t.bg, 5.6);
  });

  let ly = y - tableH - 12;
  // legenda
  rr(page, M, ly - 1, 10, 4.5, 2.2, { fill: hex("#C9CBD6") });
  txt(page, "% da verba", M + 14, ly - 1, 6.3, f.reg, MUTED);
  rr(page, M + 62, ly - 1, 10, 4.5, 2.2, { fill: PINK });
  txt(page, "% dos resultados — quando a barra rosa é maior, a campanha entrega mais do que consome.", M + 76, ly - 1, 6.3, f.reg, MUTED);
  const extra = d.moreCampaigns + (d.campaigns.length - rows.length);
  if (extra > 0) txtR(page, `+ ${extra} campanha(s) com menor investimento no período`, M + CW, ly - 1, 6.3, f.reg, MUTED);
  ly -= 10;
}

// ===== Página 3
async function drawCreatives(doc: PDFDocument, page: PDFPage, f: Fonts, d: ReportData, yTop: number) {
  txt(page, "Os anúncios com melhor desempenho no período, com o resultado de cada um.", M, yTop + 2, 7, f.reg, MUTED);
  const cols = 3;
  const gap = 12;
  const cw = (CW - gap * (cols - 1)) / cols;
  const img = cw - 12;
  const chh = 6 + img + 124;
  const list = d.creatives.slice(0, 6);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cw + gap);
    const top = yTop - 12 - row * (chh + gap);
    const y = top - chh;
    card(page, x, y, cw, chh);

    // imagem (cover + recorte arredondado)
    const ix = x + 6;
    const iy = top - 6 - img;
    rr(page, ix, iy, img, img, 7, { fill: hex("#0E0A26") });
    if (c.image) {
      try {
        const emb = c.image.kind === "png" ? await doc.embedPng(c.image.bytes) : await doc.embedJpg(c.image.bytes);
        const s = Math.max(img / emb.width, img / emb.height);
        const dw = emb.width * s;
        const dh = emb.height * s;
        roundedClip(page, ix, iy, img, img, 7);
        page.drawImage(emb, { x: ix + (img - dw) / 2, y: iy + (img - dh) / 2, width: dw, height: dh });
        page.pushOperators(popGraphicsState());
      } catch {
        txt(page, "Prévia indisponível", ix + 12, iy + img / 2, 7, f.bold, WHITE);
      }
    } else {
      txt(page, "Prévia indisponível", ix + 12, iy + img / 2, 7, f.bold, WHITE);
    }
    // posição e vídeo
    rr(page, ix + 6, top - 6 - 20, 17, 14, 4, { fill: i < 3 ? [PINK, ORANGE, YELLOW][i] : NAVY });
    const rs = String(i + 1);
    txt(page, rs, ix + 14.5 - f.bold.widthOfTextAtSize(rs, 7.5) / 2, top - 6 - 15.5, 7.5, f.bold, i === 2 ? NAVY : WHITE);
    if (c.isVideo) {
      const vw = f.bold.widthOfTextAtSize("VÍDEO", 5.8) + 10;
      rr(page, ix + img - vw - 6, top - 6 - 19, vw, 11, 5.5, { fill: NAVY, opacity: 0.85 });
      txt(page, "VÍDEO", ix + img - vw - 1, top - 6 - 15.5, 5.8, f.bold, WHITE);
    }

    // textos
    let ty = iy - 13;
    const nameLines = wrap(f.bold, c.name, 7.8, cw - 16, 2);
    nameLines.forEach((l, k) => txt(page, l, x + 8, ty - k * 10, 7.8, f.bold, NAVY));
    ty -= 20;
    txt(page, fit(f.reg, c.campaign, 6.3, cw - 16), x + 8, ty, 6.3, f.reg, MUTED);
    ty -= 14;
    if (c.badges.some((b) => BADGE[b])) badgeRow(page, f, c.badges, x + 8, ty - 2, cw - 16, 5.4);
    ty -= 18;
    // métricas 2x2
    const half = (cw - 16) / 2;
    c.stats.slice(0, 4).forEach((s, k) => {
      const sx = x + 8 + (k % 2) * half;
      const sy = ty - Math.floor(k / 2) * 22;
      label(page, f, fit(f.bold, s.label.toUpperCase(), 5.5, half - 4), sx, sy, 5.5, MUTED2);
      txt(page, fit(f.bold, s.value, k === 0 ? 11 : 9, half - 4), sx, sy - 11, k === 0 ? 11 : 9, f.bold, NAVY);
    });
    // eficiência
    const t = TIER[c.tier] ?? TIER.ok;
    pill(page, f, t.label, x + 8, y + 8, t.fg, t.bg, 5.6);
    txtR(page, `${c.resultShare.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% dos resultados`, x + cw - 8, y + 10, 6, f.reg, MUTED);
  }
}

// ===== Montagem
export async function buildReportPdf(input: ReportData): Promise<Uint8Array> {
  const S = winAnsiSafe;
  const d: ReportData = {
    ...input,
    clientName: S(input.clientName),
    periodLabel: S(input.periodLabel),
    platformLabel: S(input.platformLabel),
    resultKey: S(input.resultKey),
    custoShort: S(input.custoShort),
    headline: S(input.headline),
    compareNote: S(input.compareNote),
    kpis: input.kpis.map((k) => ({ ...k, label: S(k.label), value: S(k.value), delta: k.delta ? S(k.delta) : undefined })),
    secondary: input.secondary.map((s) => ({ label: S(s.label), value: S(s.value) })),
    daily: input.daily.map((x) => ({ ...x, label: S(x.label) })),
    highlights: input.highlights.map(S).filter(Boolean),
    funnel: input.funnel.map((x) => ({ ...x, stage: S(x.stage), valueStr: S(x.valueStr) })),
    campaigns: input.campaigns.map((c) => ({ ...c, name: S(c.name) || "(sem nome)", results: S(c.results), cost: S(c.cost), ctr: S(c.ctr), spend: S(c.spend) })),
    creatives: input.creatives.map((c) => ({
      ...c,
      name: S(c.name) || "(sem nome)",
      campaign: S(c.campaign),
      stats: c.stats.map((s) => ({ label: S(s.label), value: S(s.value) })),
    })),
  };

  const doc = await PDFDocument.create();
  doc.setTitle(`Relatório ${d.clientName} - ${d.periodLabel}`);
  doc.setAuthor("LinoADS");
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "logo.png")));
  } catch {}

  const hasCreatives = d.creatives.length > 0;
  const pages: PDFPage[] = [];

  // Página 1
  const p1 = doc.addPage([W, H]);
  pages.push(p1);
  header(p1, f, d, logo, "Resumo do período");
  let y1 = page1(p1, f, d);
  const beforeHl = y1;
  y1 = drawHighlights(p1, f, d, y1, 48);
  const highlightsOnP1 = y1 !== beforeHl;

  // Página 2
  const p2 = doc.addPage([W, H]);
  pages.push(p2);
  header(p2, f, d, logo, "Funil e campanhas");
  let y2 = H - 116;
  if (!highlightsOnP1) y2 = drawHighlights(p2, f, d, y2, 300);
  y2 = drawFunnel(p2, f, d, y2);
  drawCampaigns(p2, f, d, y2, 48);

  // Página 3
  if (hasCreatives) {
    const p3 = doc.addPage([W, H]);
    pages.push(p3);
    header(p3, f, d, logo, "Criativos em destaque");
    await drawCreatives(doc, p3, f, d, H - 112);
  }

  pages.forEach((p, i) => footer(p, f, i + 1, pages.length));
  return doc.save();
}
