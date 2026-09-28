// components/perf-sections.tsx — métricas detalhadas, ranking de campanhas,
// galeria de criativos e leitura do período. Mesmos tokens do dashboard v2.
"use client";

import { useMemo, useState } from "react";

const NAVY = "#1A1442";
const MUTED = "#9096AA";
const MUTED2 = "#A0A4B4";
const INK2 = "#4A4568";
const CARD_BORDER = "#ECEDF3";
const GREEN = "#12A66A";
const DISPLAY = "'Space Grotesk', sans-serif";
const BODY = "'Plus Jakarta Sans', sans-serif";
const CARD: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(20,15,50,.04)",
};
const GRAD = "linear-gradient(135deg,#E8336E,#F5813C,#F9C22E)";
const FEMALE = "#E8336E";
const MALE = "#1A1442";

const fInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fMoney2 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPct = (v: number, d = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";
const fComp = (v: number) => {
  if (v >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "M";
  if (v >= 1000) return (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return fInt(v);
};

export const BADGE_STYLE: Record<string, { label: string; fg: string; bg: string }> = {
  most_results: { label: "Mais resultados", fg: "#C21E56", bg: "#FCE7EF" },
  best_cost: { label: "Menor custo", fg: "#0E7A4E", bg: "#E7F6EF" },
  best_ctr: { label: "Maior CTR", fg: "#C2410C", bg: "#FDEEE1" },
  best_roas: { label: "Maior ROAS", fg: "#6D28D9", bg: "#F1EAFE" },
  best_hook: { label: "Melhor gancho", fg: "#B45309", bg: "#FDF0DE" },
  attention: { label: "Atenção", fg: "#fff", bg: "#C21E56" },
};
const TIER_STYLE: Record<string, { label: string; fg: string; bg: string }> = {
  top: { label: "Acima da média", fg: "#0E7A4E", bg: "#E7F6EF" },
  ok: { label: "Na média", fg: INK2, bg: "#F0F1F6" },
  low: { label: "Abaixo da média", fg: "#B45309", bg: "#FDF0DE" },
  none: { label: "Sem resultado", fg: MUTED, bg: "#F4F5F9" },
};

function Pill({ k, small }: { k: string; small?: boolean }) {
  const s = BADGE_STYLE[k];
  if (!s) return null;
  return (
    <span
      style={{
        font: `700 ${small ? 9 : 10}px ${BODY}`,
        color: s.fg,
        background: s.bg,
        padding: small ? "2px 7px" : "3px 9px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        letterSpacing: ".01em",
      }}
    >
      {s.label}
    </span>
  );
}

export function TierChip({ tier }: { tier: string }) {
  const s = TIER_STYLE[tier] ?? TIER_STYLE.ok;
  return (
    <span style={{ font: `600 10px ${BODY}`, color: s.fg, background: s.bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function SectionHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <div style={{ font: `700 16px ${DISPLAY}`, color: NAVY }}>{title}</div>
        <div style={{ font: `500 11px ${BODY}`, color: MUTED, marginTop: 2 }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}

// ================= Métricas detalhadas =================

function pctDelta(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur == null || prev == null || !prev || !isFinite(prev)) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function MetricsStrip({ acc, prv, objetivo }: { acc: any; prv: any; objetivo: string }) {
  if (!acc?.m) return null;
  const m = acc.m;
  const p = prv?.m ?? null;
  const tiles: { label: string; value: string; hint: string; delta?: number | null; invert?: boolean }[] = [];
  tiles.push({ label: "Alcance", value: fComp(m.reach), hint: "pessoas únicas", delta: pctDelta(m.reach, p?.reach) });
  if (m.frequency) tiles.push({ label: "Frequência", value: m.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 2 }), hint: "impressões por pessoa" });
  tiles.push({ label: "Cliques no link", value: fComp(m.linkClicks), hint: "visitas geradas", delta: pctDelta(m.linkClicks, p?.linkClicks) });
  if (m.linkCtr != null) tiles.push({ label: "CTR do link", value: fPct(m.linkCtr), hint: "cliques no link ÷ impressões", delta: pctDelta(m.linkCtr, p?.linkCtr) });
  if (m.cpc != null) tiles.push({ label: "CPC do link", value: fMoney2(m.cpc), hint: "custo por clique no link", delta: pctDelta(m.cpc, p?.cpc), invert: true });
  if (m.costPerLpv != null) tiles.push({ label: "Custo por visita", value: fMoney2(m.costPerLpv), hint: `${fInt(m.lpv)} visualizações da página`, delta: pctDelta(m.costPerLpv, p?.costPerLpv), invert: true });
  if (m.convRate != null) tiles.push({ label: "Taxa de conversão", value: fPct(m.convRate), hint: "resultados ÷ cliques no link", delta: pctDelta(m.convRate, p?.convRate) });
  if ((objetivo === "compras" || objetivo === "infoproduto") && m.ticket != null)
    tiles.push({ label: "Ticket médio", value: fMoney2(m.ticket), hint: "valor por compra", delta: pctDelta(m.ticket, p?.ticket) });
  if (objetivo === "leads_conversas") {
    tiles.push({ label: "Leads", value: fInt(m.leads ?? 0), hint: "formulário / cadastro", delta: pctDelta(m.leads, p?.leads) });
    tiles.push({ label: "Conversas", value: fInt(m.conversations ?? 0), hint: "WhatsApp / Direct iniciadas", delta: pctDelta(m.conversations, p?.conversations) });
  }
  if ((objetivo === "perfil" || objetivo === "engajamento") && m.engagement > 0) {
    tiles.push({ label: "Engajamentos", value: fComp(m.engagement), hint: "interações com o anúncio", delta: pctDelta(m.engagement, p?.engagement) });
    if (m.engagementRate != null) tiles.push({ label: "Taxa de engajamento", value: fPct(m.engagementRate, 1), hint: "engajamentos ÷ impressões", delta: pctDelta(m.engagementRate, p?.engagementRate) });
    if (m.costPerEngagement != null && objetivo === "perfil") tiles.push({ label: "Custo por engajamento", value: fMoney2(m.costPerEngagement), hint: "investimento ÷ engajamentos", delta: pctDelta(m.costPerEngagement, p?.costPerEngagement), invert: true });
    if (m.reactions > 0) tiles.push({ label: "Reações", value: fComp(m.reactions), hint: "curtidas e reações", delta: pctDelta(m.reactions, p?.reactions) });
    if (m.comments > 0) tiles.push({ label: "Comentários", value: fComp(m.comments), hint: "nos anúncios", delta: pctDelta(m.comments, p?.comments) });
    if (m.shares > 0) tiles.push({ label: "Compartilhamentos", value: fComp(m.shares), hint: "envios e compartilhamentos", delta: pctDelta(m.shares, p?.shares) });
    if (m.saves > 0) tiles.push({ label: "Salvamentos", value: fComp(m.saves), hint: "salvaram o post", delta: pctDelta(m.saves, p?.saves) });
  }
  if (m.hookRate != null) tiles.push({ label: "Gancho do vídeo", value: fPct(m.hookRate, 1), hint: "assistiram 3s ÷ impressões", delta: pctDelta(m.hookRate, p?.hookRate) });
  if (m.holdRate != null) tiles.push({ label: "Retenção do vídeo", value: fPct(m.holdRate, 1), hint: "ThruPlays ÷ views de 3s", delta: pctDelta(m.holdRate, p?.holdRate) });

  return (
    <div className="metrics-strip" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
      {tiles.map((t) => {
        const good = t.delta == null ? null : t.invert ? t.delta < 0 : t.delta > 0;
        return (
          <div key={t.label} style={{ ...CARD, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ font: `600 9.5px ${BODY}`, color: MUTED2, letterSpacing: ".05em", textTransform: "uppercase" }}>{t.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span style={{ font: `700 19px ${DISPLAY}`, color: NAVY }}>{t.value}</span>
              {t.delta != null && Math.abs(t.delta) >= 0.5 && (
                <span style={{ font: `700 10.5px ${DISPLAY}`, color: good ? GREEN : "#E8336E" }}>
                  {t.delta >= 0 ? "▲" : "▼"} {Math.abs(t.delta).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                </span>
              )}
            </div>
            <div style={{ font: `500 10.5px ${BODY}`, color: MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.hint}</div>
          </div>
        );
      })}
    </div>
  );
}

// ================= Ranking de campanhas =================

function ShareBars({ spend, results }: { spend: number; results: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      {[
        { label: "Verba", v: spend, bg: "#C9CBD6" },
        { label: "Resultados", v: results, bg: GRAD },
      ].map((b) => (
        <div key={b.label} style={{ display: "grid", gridTemplateColumns: "62px 1fr 40px", alignItems: "center", gap: 6 }}>
          <span style={{ font: `600 10px ${BODY}`, color: MUTED }}>{b.label}</span>
          <span style={{ height: 6, background: "#F1F2F7", borderRadius: 6, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.min(100, b.v)}%`, background: b.bg, borderRadius: 6 }} />
          </span>
          <span style={{ font: `700 10.5px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fPct(b.v, 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function CampaignRanking({
  campaigns,
  meta,
  isAdmin,
  focusIds,
  onToggle,
  loading,
}: {
  campaigns: any[];
  meta: { resultKey: string; custoShort: string };
  isAdmin: boolean;
  focusIds: string[];
  onToggle: (id: string, name: string) => void;
  loading: boolean;
}) {
  const [all, setAll] = useState(false);
  const list = all ? campaigns : campaigns.slice(0, 8);
  return (
    <div style={{ ...CARD, padding: "20px 22px", marginBottom: 16 }}>
      <SectionHead
        title="Ranking de campanhas"
        sub="ordenado por resultados · eficiência comparada ao custo médio da conta · clique para filtrar o painel"
      />
      <div className="rank-head" style={{ padding: "0 12px 8px", borderBottom: "1px solid #F0F1F6" }}>
        {["#", "Campanha", "Participação no período", meta.resultKey, meta.custoShort, "CTR link", "Investido", "Eficiência"].map((h, i) => (
          <span key={h} className={i === 2 ? "rank-share" : undefined} style={{ font: `600 10px ${BODY}`, letterSpacing: ".04em", textTransform: "uppercase", color: MUTED2, textAlign: i >= 3 && i <= 6 ? "right" : "left" }}>
            {h}
          </span>
        ))}
      </div>
      {list.map((c, i) => {
        const focused = focusIds.includes(c.campaign_id);
        const badges = (c.badges as string[]).filter((b) => isAdmin || b !== "attention");
        return (
          <div
            key={c.campaign_id}
            onClick={() => onToggle(c.campaign_id, c.name)}
            className="rank-row"
            style={{ padding: "13px 12px", borderRadius: 12, cursor: "pointer", borderBottom: "1px solid #F5F6FA", background: focused ? "#FDEEE1" : "transparent", outline: focused ? "1px solid #F5813C" : "none" }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", font: `700 12px ${DISPLAY}`, color: i < 3 ? "#fff" : INK2, background: i < 3 ? GRAD : "#F0F1F6" }}>
              {i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `600 13px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>{c.name}</div>
              {badges.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                  {badges.map((b) => <Pill key={b} k={b} small />)}
                </div>
              )}
            </div>
            <div className="rank-share"><ShareBars spend={c.spendShare} results={c.resultShare} /></div>
            <span style={{ font: `700 14px ${DISPLAY}`, color: NAVY, textAlign: "right" }}>{fInt(c.m.results)}</span>
            <span style={{ font: `600 12.5px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{c.m.costPerResult ? fMoney2(c.m.costPerResult) : "—"}</span>
            <span style={{ font: `600 12.5px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{c.m.linkCtr != null ? fPct(c.m.linkCtr) : "—"}</span>
            <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY, textAlign: "right" }}>{fMoney2(c.m.spend)}</span>
            <span><TierChip tier={c.tier} /></span>
          </div>
        );
      })}
      {!campaigns.length && !loading && (
        <div style={{ font: `500 13px ${BODY}`, color: MUTED, padding: 20, textAlign: "center" }}>Sem campanhas com veiculação no período.</div>
      )}
      {campaigns.length > 8 && (
        <button onClick={() => setAll(!all)} style={{ marginTop: 10, border: "1px solid #E2E4EE", background: "#fff", borderRadius: 10, padding: "8px 14px", font: `600 12px ${BODY}`, color: INK2, cursor: "pointer" }}>
          {all ? "Mostrar menos" : `Ver todas as ${campaigns.length} campanhas`}
        </button>
      )}
    </div>
  );
}

// ================= Galeria de criativos =================

const SORTS = [
  { k: "results", label: "Resultados" },
  { k: "cost", label: "Menor custo" },
  { k: "ctr", label: "CTR" },
  { k: "spend", label: "Investimento" },
] as const;

export function CreativeGallery({
  creatives,
  meta,
  isAdmin,
  onOpen,
  loading,
}: {
  creatives: any[];
  meta: { resultKey: string; custoShort: string };
  isAdmin: boolean;
  onOpen: (c: any) => void;
  loading: boolean;
}) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["k"]>("results");
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const arr = creatives.slice();
    if (sort === "results") arr.sort((a, b) => b.m.results - a.m.results || b.m.spend - a.m.spend);
    if (sort === "cost") arr.sort((a, b) => (a.m.costPerResult ?? Infinity) - (b.m.costPerResult ?? Infinity));
    if (sort === "ctr") arr.sort((a, b) => (b.m.linkCtr ?? 0) - (a.m.linkCtr ?? 0));
    if (sort === "spend") arr.sort((a, b) => b.m.spend - a.m.spend);
    return arr;
  }, [creatives, sort]);
  const list = all ? sorted : sorted.slice(0, 8);

  return (
    <div style={{ ...CARD, padding: "20px 22px", marginBottom: 16 }}>
      <SectionHead
        title="Criativos"
        sub="desempenho de cada anúncio no período · clique para ver o criativo completo"
        right={
          <div style={{ display: "inline-flex", background: "#F4F5F9", borderRadius: 10, padding: 3, gap: 2, maxWidth: "100%", overflowX: "auto" }}>
            {SORTS.map((s) => (
              <button
                key={s.k}
                onClick={() => setSort(s.k)}
                style={{ border: "none", cursor: "pointer", whiteSpace: "nowrap", padding: "7px 12px", borderRadius: 8, font: `600 12px ${BODY}`, background: sort === s.k ? "#fff" : "transparent", color: sort === s.k ? NAVY : MUTED, boxShadow: sort === s.k ? "0 1px 2px rgba(20,15,50,.08)" : "none" }}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="creative-grid" style={{ display: "grid", gap: 14 }}>
        {list.map((c, i) => {
          const badges = (c.badges as string[]).filter((b) => isAdmin || b !== "attention");
          const isVideo = c.type === "VIDEO" || c.m.video3s > 0;
          return (
            <button
              key={c.ad_id}
              onClick={() => onOpen(c)}
              style={{ textAlign: "left", border: "1px solid #F0F1F6", borderRadius: 16, background: "#fff", padding: 0, cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#0E0A26", overflow: "hidden", minHeight: 0 }}>
                {c.thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.thumb} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: GRAD, display: "grid", placeItems: "center" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                  </div>
                )}
                <span style={{ position: "absolute", top: 8, left: 8, width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", font: `700 11px ${DISPLAY}`, color: "#fff", background: i < 3 && sort === "results" ? GRAD : "rgba(26,20,66,.75)" }}>
                  {i + 1}
                </span>
                {isVideo && (
                  <span style={{ position: "absolute", top: 8, right: 8, font: `700 9.5px ${BODY}`, color: "#fff", background: "rgba(26,20,66,.75)", padding: "3px 8px", borderRadius: 20 }}>▶ Vídeo</span>
                )}
                {badges.length > 0 && (
                  <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {badges.map((b) => <Pill key={b} k={b} small />)}
                  </div>
                )}
              </div>
              <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ font: `600 12.5px/1.3 ${BODY}`, color: NAVY, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 32 }} title={c.name}>{c.name}</div>
                  <div style={{ font: `500 10.5px ${BODY}`, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }} title={c.campaign_name}>{c.campaign_name}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px" }}>
                  {[
                    { l: meta.resultKey, v: fInt(c.m.results), strong: true },
                    { l: meta.custoShort, v: c.m.costPerResult ? fMoney2(c.m.costPerResult) : "—" },
                    { l: "CTR link", v: c.m.linkCtr != null ? fPct(c.m.linkCtr) : "—" },
                    isVideo && c.m.hookRate != null
                      ? { l: "Gancho", v: fPct(c.m.hookRate, 1) }
                      : { l: "Investido", v: fMoney2(c.m.spend) },
                  ].map((x) => (
                    <div key={x.l}>
                      <div style={{ font: `600 9px ${BODY}`, color: MUTED2, textTransform: "uppercase", letterSpacing: ".04em" }}>{x.l}</div>
                      <div style={{ font: `700 ${x.strong ? 15 : 12.5}px ${DISPLAY}`, color: NAVY }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                  <TierChip tier={c.tier} />
                  <span style={{ font: `600 10px ${BODY}`, color: MUTED }}>{fPct(c.resultShare, 0)} dos resultados</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!creatives.length && !loading && (
        <div style={{ font: `500 13px ${BODY}`, color: MUTED, padding: 20, textAlign: "center" }}>Sem anúncios com veiculação no período.</div>
      )}
      {sorted.length > 8 && (
        <button onClick={() => setAll(!all)} style={{ marginTop: 14, border: "1px solid #E2E4EE", background: "#fff", borderRadius: 10, padding: "8px 14px", font: `600 12px ${BODY}`, color: INK2, cursor: "pointer" }}>
          {all ? "Mostrar menos" : `Ver todos os ${sorted.length} criativos`}
        </button>
      )}
    </div>
  );
}

// ================= Leitura do período =================

export function PeriodInsights({ insights, isAdmin, loading }: { insights: { kind: string; text: string }[]; isAdmin: boolean; loading: boolean }) {
  const list = insights.filter((i) => isAdmin || i.kind !== "alert");
  return (
    <div style={{ ...CARD, padding: "20px 22px" }}>
      <SectionHead title="Leitura do período" sub="o que os números dizem, em linguagem direta" />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {list.map((it, i) => {
          const color = it.kind === "win" ? GREEN : it.kind === "alert" ? "#D97706" : NAVY;
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center", background: it.kind === "win" ? "#E7F6EF" : it.kind === "alert" ? "#FDF0DE" : "#EEEDF5" }}>
                {it.kind === "win" ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                ) : it.kind === "alert" ? (
                  <span style={{ font: `800 11px ${DISPLAY}`, color }}>!</span>
                ) : (
                  <span style={{ width: 5, height: 5, borderRadius: 5, background: color }} />
                )}
              </span>
              <span style={{ font: `500 12.5px/1.5 ${BODY}`, color: INK2 }}>
                {it.text}
                {it.kind === "alert" && (
                  <span style={{ marginLeft: 6, font: `700 9px ${BODY}`, color: "#B45309", background: "#FDF0DE", padding: "2px 6px", borderRadius: 10, verticalAlign: "middle" }}>só a agência vê</span>
                )}
              </span>
            </div>
          );
        })}
        {!list.length && !loading && <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Sem dados suficientes no período.</span>}
      </div>
    </div>
  );
}

// ================= Modal do criativo =================

export function CreativeModal({ c, meta, isAdmin, onClose }: { c: any; meta: { resultKey: string; custoShort: string }; isAdmin: boolean; onClose: () => void }) {
  const m = c.m ?? { results: c.results, costPerResult: c.costPerResult, spend: c.spend };
  const badges = ((c.badges ?? []) as string[]).filter((b) => isAdmin || b !== "attention");
  const stats: { l: string; v: string }[] = [
    { l: meta.resultKey, v: fInt(m.results ?? 0) },
    { l: meta.custoShort, v: m.costPerResult ? fMoney2(m.costPerResult) : "—" },
    { l: "Investido", v: fMoney2(m.spend ?? 0) },
  ];
  if (m.impressions != null) stats.push({ l: "Impressões", v: fComp(m.impressions) });
  if (m.linkCtr != null) stats.push({ l: "CTR do link", v: fPct(m.linkCtr) });
  if (m.cpc != null) stats.push({ l: "CPC do link", v: fMoney2(m.cpc) });
  if (m.cpm != null) stats.push({ l: "CPM", v: fMoney2(m.cpm) });
  if (m.hookRate != null) stats.push({ l: "Gancho (3s)", v: fPct(m.hookRate, 1) });
  if (m.holdRate != null) stats.push({ l: "Retenção", v: fPct(m.holdRate, 1) });
  if (m.roas != null) stats.push({ l: "ROAS", v: m.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,20,66,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="creative-modal" style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 820, maxHeight: "92vh", overflow: "auto", boxShadow: "0 30px 70px -20px rgba(20,15,50,.5)" }}>
        <div style={{ background: "#0E0A26", display: "grid", placeItems: "center", minHeight: 260 }}>
          {c.image || c.thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={c.image || c.thumb} alt={c.name} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ font: `700 14px ${DISPLAY}`, color: "#fff", padding: 40 }}>Prévia indisponível</div>
          )}
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ font: `700 15px ${BODY}`, color: NAVY }}>{c.name}</div>
            {c.campaign_name && <div style={{ font: `500 11.5px ${BODY}`, color: MUTED, marginTop: 2 }}>{c.campaign_name}{c.adset_name ? ` · ${c.adset_name}` : ""}</div>}
          </div>
          {(badges.length > 0 || c.tier) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {badges.map((b) => <Pill key={b} k={b} />)}
              {c.tier && <TierChip tier={c.tier} />}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "10px 14px" }}>
            {stats.map((s) => (
              <div key={s.l}>
                <div style={{ font: `600 9px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.l}</div>
                <div style={{ font: `700 16px ${DISPLAY}`, color: NAVY }}>{s.v}</div>
              </div>
            ))}
          </div>
          {(c.title || c.body) && (
            <div style={{ background: "#F7F8FB", borderRadius: 12, padding: "11px 13px" }}>
              <div style={{ font: `600 9px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Texto do anúncio</div>
              {c.title && <div style={{ font: `700 12.5px ${BODY}`, color: NAVY, marginBottom: 3 }}>{c.title}</div>}
              {c.body && <div style={{ font: `500 12px/1.5 ${BODY}`, color: INK2, whiteSpace: "pre-line", maxHeight: 140, overflow: "auto" }}>{c.body}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {c.previewLink && (
              <a href={c.previewLink} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 150, textAlign: "center", textDecoration: "none", borderRadius: 11, padding: "11px 0", font: `700 12px ${DISPLAY}`, color: "#fff", background: NAVY }}>
                Ver prévia do anúncio
              </a>
            )}
            {c.permalink && (
              <a href={c.permalink} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 150, textAlign: "center", textDecoration: "none", borderRadius: 11, padding: "11px 0", font: `700 12px ${DISPLAY}`, color: "#fff", background: "linear-gradient(135deg,#E8336E,#F5813C)" }}>
                Ver no Instagram
              </a>
            )}
            <button onClick={onClose} style={{ flex: 1, minWidth: 110, border: "1px solid #E2E4EE", cursor: "pointer", background: "#fff", borderRadius: 11, padding: "11px 0", font: `700 12px ${DISPLAY}`, color: INK2 }}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= Público: estados e idade =================

type AudRow = { label: string; spend: number; impressions: number; reach: number; linkClicks: number; results: number; costPerResult: number | null; spendShare: number; resultShare: number };

export function AudienceSection({
  audience,
  meta,
  loading,
}: {
  audience:
    | {
        regions: AudRow[];
        ages: AudRow[];
        ageGender: { label: string; female: number; male: number }[];
        ageGenderBase: "results" | "reach";
        regionResults: boolean;
        ageResults: boolean;
      }
    | null
    | undefined;
  meta: { resultKey: string; custoShort: string };
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!audience || (!audience.regions.length && !(audience.ageGender ?? []).length)) {
    if (!loading) return null;
  }
  const regions = audience?.regions ?? [];
  const visible = showAll ? regions : regions.slice(0, 8);
  const maxReg = Math.max(1, ...regions.map((r) => r.spendShare));
  const ageGender = audience?.ageGender ?? [];
  const maxAG = Math.max(1, ...ageGender.map((a) => Math.max(a.female, a.male)));
  const totF = ageGender.reduce((x, a) => x + a.female, 0);
  const totM = ageGender.reduce((x, a) => x + a.male, 0);
  const resKey = meta.resultKey.toLowerCase();

  return (
    <div className="audience-grid" style={{ display: "grid", gap: 16, marginBottom: 16 }}>
      <div style={{ ...CARD, padding: "20px 22px" }}>
        <SectionHead
          title="Onde está o público"
          sub={audience?.regionResults ? `investimento e ${resKey} por estado` : "investimento e alcance por estado"}
        />
        <div className={`aud-row aud-head${audience?.regionResults ? "" : " aud-nores"}`}>
          <span>Estado</span>
          <span>Verba</span>
          <span style={{ textAlign: "right" }}>Alcance</span>
          {audience?.regionResults && <span style={{ textAlign: "right" }}>{meta.resultKey}</span>}
          {audience?.regionResults && <span style={{ textAlign: "right" }}>{meta.custoShort}</span>}
        </div>
        {visible.map((r, i) => (
          <div key={r.label} className={`aud-row${audience?.regionResults ? "" : " aud-nores"}`}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ font: `700 10.5px ${DISPLAY}`, color: MUTED2, width: 16, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ font: `600 12.5px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            </span>
            <span style={{ display: "grid", gridTemplateColumns: "1fr 44px", alignItems: "center", gap: 6 }}>
              <span style={{ height: 7, background: "#F1F2F7", borderRadius: 6, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(r.spendShare / maxReg) * 100}%`, background: GRAD, borderRadius: 6 }} />
              </span>
              <span style={{ font: `700 11px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fPct(r.spendShare, r.spendShare < 1 ? 1 : 0)}</span>
            </span>
            <span style={{ font: `600 12px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fComp(r.reach)}</span>
            {audience?.regionResults && <span style={{ font: `700 12.5px ${DISPLAY}`, color: NAVY, textAlign: "right" }}>{fInt(r.results)}</span>}
            {audience?.regionResults && (
              <span style={{ font: `600 12px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{r.costPerResult != null ? fMoney2(r.costPerResult) : "—"}</span>
            )}
          </div>
        ))}
        {loading && !regions.length && <div style={{ font: `500 12px ${BODY}`, color: MUTED, padding: 12 }}>Carregando…</div>}
        {regions.length > 8 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", font: `700 11.5px ${BODY}`, color: "#E8336E", padding: 0 }}
          >
            {showAll ? "Mostrar menos" : `Ver todos os ${regions.length} estados`}
          </button>
        )}
        {!audience?.regionResults && regions.length > 0 && (
          <div style={{ font: `500 10.5px ${BODY}`, color: MUTED, marginTop: 10 }}>
            A Meta não informa {resKey} por estado para esse tipo de conversão — mostramos onde a verba e o alcance foram entregues.
          </div>
        )}
      </div>

      <div style={{ ...CARD, padding: "20px 22px" }}>
        <SectionHead
          title="Idade e gênero"
          sub={audience?.ageGenderBase === "results" ? `% dos ${resKey} por faixa etária` : "% das pessoas alcançadas por faixa etária"}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {ageGender.map((a) => (
            <div key={a.label} style={{ display: "grid", gridTemplateColumns: "54px 1fr", alignItems: "center", gap: 10 }}>
              <span style={{ font: `700 12px ${DISPLAY}`, color: NAVY }}>{a.label}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { v: a.female, bg: FEMALE, key: "f" },
                  { v: a.male, bg: MALE, key: "m" },
                ].map((b) => (
                  <div key={b.key} style={{ display: "grid", gridTemplateColumns: "1fr 40px", alignItems: "center", gap: 6 }}>
                    <span style={{ height: 7, background: "#F1F2F7", borderRadius: 6, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${(b.v / maxAG) * 100}%`, background: b.bg, borderRadius: 6 }} />
                    </span>
                    <span style={{ font: `700 10.5px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fPct(b.v, b.v < 1 && b.v > 0 ? 1 : 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!ageGender.length && !loading && <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Sem dados no período.</span>}
        </div>
        {ageGender.length > 0 && (
          <div style={{ display: "flex", gap: 14, marginTop: 14, font: `600 10.5px ${BODY}`, color: MUTED, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 6, borderRadius: 3, background: FEMALE }} /> Feminino {fPct(totF, 0)}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 6, borderRadius: 3, background: MALE }} /> Masculino {fPct(totM, 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
