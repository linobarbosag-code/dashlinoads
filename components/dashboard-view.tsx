// components/dashboard-view.tsx — port fiel do design "Dashboard LinoADS v2" (somente Meta Ads)
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

interface Client {
  id: string;
  name: string;
  ad_account_id: string;
  currency: string;
}

// ===== Tokens do design =====
const NAVY = "#1A1442";
const MUTED = "#9096AA";
const MUTED2 = "#A0A4B4";
const INK2 = "#4A4568";
const BORDER = "#E2E4EE";
const CARD_BORDER = "#ECEDF3";
const GREEN = "#12A66A";
const CARD: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(20,15,50,.04)",
};
const DISPLAY = "'Space Grotesk', sans-serif";
const BODY = "'Plus Jakarta Sans', sans-serif";

const CLIENT_COLORS = ["#E8336E", "#EF5A57", "#F5813C", "#F7A233", "#D9308A", "#EF6D2E"];
const CLIENT_TINTS = ["#FCE7EF", "#FDE9E8", "#FDEEE1", "#FDF0DE", "#FBE6F1", "#FDECE2"];
const FUNNEL_COLORS = ["#E8336E", "#EF5A57", "#F26D33", "#F5813C", "#F7A233", "#F9C22E"];
const SEG_COLORS = ["#E8336E", "#F5813C", "#F9C22E", "#12A66A", "#8B5CF6"];

const OBJ_OPTIONS = [
  { key: "auto", label: "Automático" },
  { key: "compras", label: "E-commerce (Compras)" },
  { key: "infoproduto", label: "Infoproduto (Compras)" },
  { key: "leads", label: "Cadastro (Leads)" },
  { key: "conversas", label: "Mensagem (Conversas)" },
  { key: "engajamento", label: "Engajamento" },
];

const GENDER_LABEL: Record<string, string> = {
  male: "Homens",
  female: "Mulheres",
  unknown: "Não informado",
};
const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
  unknown: "Outros",
};

// ===== Formatadores =====
const fInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n >= 100 ? 0 : 2 });
const fMoney2 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPct = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const fComp = (n: number) => {
  if (n >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "M";
  if (n >= 1000) return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return fInt(n);
};
const pad = (n: number) => ("0" + n).slice(-2);
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MON_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MON_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function Delta({ cur, prev, invert = false, suffix = "vs período anterior" }: { cur: number; prev: number | null; invert?: boolean; suffix?: string }) {
  if (prev === null || prev === 0 || !isFinite(prev)) {
    return <span style={{ font: `600 11px ${BODY}`, color: MUTED }}>sem base de comparação</span>;
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  const arrow = pct >= 0 ? "▲" : "▼";
  return (
    <span style={{ font: `600 11px ${BODY}`, color: MUTED }}>
      <span style={{ color: good ? GREEN : "#E8336E", font: `700 12px ${DISPLAY}` }}>
        {arrow} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </span>{" "}
      {invert && good ? "mais barato" : suffix}
    </span>
  );
}

function KpiIcon({ grad, children }: { grad: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        width: 42,
        height: 42,
        borderRadius: 11,
        background: grad,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export default function DashboardView({
  userName,
  isAdmin,
  clients,
}: {
  userName: string;
  isAdmin: boolean;
  clients: Client[];
}) {
  const today = useMemo(() => new Date(), []);
  const d7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d;
  }, []);

  const [clientIdx, setClientIdx] = useState(0);
  const [open, setOpen] = useState<null | "client" | "obj" | "date" | "filter">(null);
  const [objetivo, setObjetivo] = useState("auto");
  const [preset, setPreset] = useState("7d");
  const [rangeStart, setRangeStart] = useState(iso(d7));
  const [rangeEnd, setRangeEnd] = useState(iso(today));
  const [calY, setCalY] = useState(today.getFullYear());
  const [calM, setCalM] = useState(today.getMonth());
  const [pick, setPick] = useState<"start" | "end">("start");
  const [level, setLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [focus, setFocus] = useState<{ type: "campaign" | "adset" | "ad"; ids: string[]; names: string[] } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [filterTab, setFilterTab] = useState<"campaign" | "adset" | "ad">("campaign");
  const [entities, setEntities] = useState<Record<string, { id: string; name: string; status: string }[]>>({});
  const [entLoading, setEntLoading] = useState(false);
  const [entSearch, setEntSearch] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = clients[clientIdx];
  const clientColor = CLIENT_COLORS[clientIdx % CLIENT_COLORS.length];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        client_id: client.id,
        since: rangeStart,
        until: rangeEnd,
        objetivo,
        level,
      });
      if (focus) {
        q.set("focus_type", focus.type);
        q.set("focus_ids", focus.ids.join(","));
      }
      const res = await fetch(`/api/insights?${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client.id, rangeStart, rangeEnd, objetivo, level, focus]);

  useEffect(() => {
    load();
  }, [load]);

  const loadEntities = useCallback(
    async (tab: "campaign" | "adset" | "ad") => {
      const key = `${client.id}:${tab}`;
      if (entities[key]) return;
      setEntLoading(true);
      try {
        const map = { campaign: "campaigns", adset: "adsets", ad: "ads" } as const;
        const res = await fetch(`/api/entities?client_id=${client.id}&type=${map[tab]}`);
        const json = await res.json();
        if (res.ok) setEntities((e) => ({ ...e, [key]: json.entities }));
      } finally {
        setEntLoading(false);
      }
    },
    [client.id, entities]
  );

  useEffect(() => {
    if (open === "filter") loadEntities(filterTab);
  }, [open, filterTab, loadEntities]);

  function toggleFocus(type: "campaign" | "adset" | "ad", id: string, name: string) {
    setFocus((f) => {
      if (!f || f.type !== type) return { type, ids: [id], names: [name] };
      const idx = f.ids.indexOf(id);
      if (idx >= 0) {
        const ids = f.ids.filter((x) => x !== id);
        const names = f.names.filter((_, i) => i !== idx);
        return ids.length ? { type, ids, names } : null;
      }
      return { type, ids: [...f.ids, id], names: [...f.names, name] };
    });
  }
  const focusLabel = focus
    ? focus.ids.length === 1
      ? focus.names[0]
      : `${focus.ids.length} ${focus.type === "campaign" ? "campanhas" : focus.type === "adset" ? "conjuntos" : "anúncios"}`
    : null;

  // ===== calendário =====
  const [defaultPreset, setDefaultPreset] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("linoads_default_period") : null;
    if (stored) {
      setDefaultPreset(stored);
      setPresetRange(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveDefaultPreset(k: string | null) {
    setDefaultPreset(k);
    if (k) localStorage.setItem("linoads_default_period", k);
    else localStorage.removeItem("linoads_default_period");
  }

  function setPresetRange(k: string) {
    const t = new Date();
    let s = new Date(t);
    let e = new Date(t);
    if (k === "hoje") { /* s = e = hoje */ }
    else if (k === "7d") s.setDate(t.getDate() - 6);
    else if (k === "14d") s.setDate(t.getDate() - 13);
    else if (k === "30d") s.setDate(t.getDate() - 29);
    else if (k === "mes") s = new Date(t.getFullYear(), t.getMonth(), 1);
    else if (k === "mespassado") {
      s = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      e = new Date(t.getFullYear(), t.getMonth(), 0);
    }
    setPreset(k);
    setRangeStart(iso(s));
    setRangeEnd(iso(e));
    setCalY(s.getFullYear());
    setCalM(s.getMonth());
    setOpen(null);
  }

  function pickDay(dIso: string) {
    if (pick === "start") {
      setRangeStart(dIso);
      setRangeEnd(dIso);
      setPick("end");
      setPreset("custom");
    } else {
      let a = rangeStart;
      let b = dIso;
      if (b < a) [a, b] = [b, a];
      setRangeStart(a);
      setRangeEnd(b);
      setPick("start");
      setPreset("custom");
    }
  }

  const calCells = useMemo(() => {
    const lead = new Date(calY, calM, 1).getDay();
    const dim = new Date(calY, calM + 1, 0).getDate();
    const cells: { label: string; iso?: string; state: "empty" | "in" | "edge" | "normal" }[] = [];
    for (let i = 0; i < lead; i++) cells.push({ label: "", state: "empty" });
    for (let d = 1; d <= dim; d++) {
      const s = `${calY}-${pad(calM + 1)}-${pad(d)}`;
      const state = s === rangeStart || s === rangeEnd ? "edge" : s > rangeStart && s < rangeEnd ? "in" : "normal";
      cells.push({ label: String(d), iso: s, state });
    }
    return cells;
  }, [calY, calM, rangeStart, rangeEnd]);

  const days = Math.round((new Date(rangeEnd + "T12:00").getTime() - new Date(rangeStart + "T12:00").getTime()) / 86400000) + 1;
  const ds = new Date(rangeStart + "T12:00");
  const de = new Date(rangeEnd + "T12:00");
  const dateLabel =
    preset === "hoje" ? "Hoje" :
    preset === "mes" ? MON_LONG[ds.getMonth()] :
    preset === "mespassado" ? MON_LONG[ds.getMonth()] :
    `${ds.getDate()} ${MON_SHORT[ds.getMonth()]} – ${de.getDate()} ${MON_SHORT[de.getMonth()]}`;

  // ===== dados derivados =====
  const acc = data?.account;
  const prv = data?.previous;
  const spend = Number(acc?.spend ?? 0);
  const meta = data?.meta ?? { resultKey: "Resultados", custoKey: "Custo por resultado", custoShort: "Custo/result." };
  const funnel: { stage: string; value: number }[] = data?.funnel ?? [];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);
  const funnelRate =
    funnel.length >= 2 && funnel[0].value > 0
      ? ((funnel[funnel.length - 1].value / funnel[0].value) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%"
      : "—";

  const genderKnown = (data?.gender ?? []).filter((g: any) => g.gender !== "unknown");
  const genderTotal = genderKnown.reduce((a: number, g: any) => a + g.spend, 0);
  const CIRC = 2 * Math.PI * 54;
  let segOffset = 0;
  const genderSegs = genderKnown
    .filter((g: any) => g.spend > 0)
    .map((g: any, i: number) => {
      const pct = genderTotal > 0 ? g.spend / genderTotal : 0;
      const seg = {
        label: GENDER_LABEL[g.gender] ?? g.gender,
        color: SEG_COLORS[i % SEG_COLORS.length],
        pctStr: fPct(pct * 100),
        dash: `${pct * CIRC} ${CIRC}`,
        offset: -segOffset,
      };
      segOffset += pct * CIRC;
      return seg;
    });

  const platTotal = (data?.platform ?? []).reduce((a: number, p: any) => a + p.spend, 0);
  const platBars = (data?.platform ?? [])
    .filter((p: any) => p.spend > 0)
    .sort((a: any, b: any) => b.spend - a.spend)
    .map((p: any, i: number) => ({
      label: PLATFORM_LABEL[p.platform] ?? p.platform,
      valStr: fMoney(p.spend),
      pctStr: platTotal > 0 ? fPct((p.spend / platTotal) * 100) : "",
      width: platTotal > 0 ? (p.spend / platTotal) * 100 : 0,
      color: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
    }));

  const rows = (data?.rows ?? [])
    .slice()
    .sort((a: any, b: any) => Number(b.spend) - Number(a.spend));
  const rowName = (r: any) =>
    data?.level === "ad" ? r.ad_name : data?.level === "adset" ? r.adset_name : r.campaign_name;
  const destaques = rows
    .slice()
    .sort((a: any, b: any) => b.results - a.results)
    .slice(0, 3);

  const dd = { position: "absolute" as const, top: "calc(100% + 8px)", zIndex: 50, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 7, boxShadow: "0 20px 44px -18px rgba(20,15,50,.4)" };

  return (
    <main style={{ minHeight: "100vh", background: "#F5F6FA", padding: "22px 24px", fontFamily: BODY }} onClick={() => open && setOpen(null)}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* ===== TOP BAR ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 18, position: "relative", zIndex: 45 }}>
          {/* Client selector */}
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(open === "client" ? null : "client")}
              style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 13, padding: "9px 14px", cursor: isAdmin ? "pointer" : "default", boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, background: clientColor, display: "flex", alignItems: "center", justifyContent: "center", font: `700 13px ${DISPLAY}`, color: "#fff" }}>
                {client.name.charAt(0)}
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", font: `700 14px ${DISPLAY}`, color: NAVY }}>{client.name}</span>
                <span style={{ display: "block", font: `600 10px ${BODY}`, color: MUTED }}>{meta.resultKey}</span>
              </span>
              {isAdmin && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" style={{ marginLeft: 4 }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>
            {open === "client" && isAdmin && (
              <div style={{ ...dd, left: 0, width: 290 }}>
                <div style={{ font: `600 10px ${BODY}`, letterSpacing: ".05em", textTransform: "uppercase", color: MUTED2, padding: "6px 10px 4px" }}>Escolher cliente</div>
                {clients.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => { setClientIdx(i); setFocus(null); setEntities({}); setOpen(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", border: "none", cursor: "pointer", background: i === clientIdx ? "#F5F6FA" : "transparent", borderRadius: 10, padding: "9px 10px", textAlign: "left" }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: CLIENT_COLORS[i % CLIENT_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", font: `700 12px ${DISPLAY}`, color: "#fff", flexShrink: 0 }}>
                      {c.name.charAt(0)}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", font: `600 13px ${BODY}`, color: NAVY }}>{c.name}</span>
                    </span>
                    <span style={{ font: `600 10px ${BODY}`, color: CLIENT_COLORS[i % CLIENT_COLORS.length], background: CLIENT_TINTS[i % CLIENT_TINTS.length], padding: "3px 9px", borderRadius: 20 }}>
                      Meta
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Objetivo */}
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(open === "obj" ? null : "obj")}
              style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}
            >
              <span style={{ font: `600 11px ${BODY}`, color: MUTED }}>Tipo:</span>
              <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY }}>
                {OBJ_OPTIONS.find((o) => o.key === objetivo)?.label ?? "Automático"}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {open === "obj" && (
              <div style={{ ...dd, left: 0, width: 230 }}>
                <div style={{ font: `600 10px ${BODY}`, letterSpacing: ".05em", textTransform: "uppercase", color: MUTED2, padding: "6px 10px 4px" }}>Objetivo da campanha</div>
                {OBJ_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => { setObjetivo(o.key); setOpen(null); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: "none", cursor: "pointer", background: o.key === objetivo ? "#F5F6FA" : "transparent", borderRadius: 10, padding: 10, textAlign: "left" }}
                  >
                    <span style={{ font: `600 13px ${BODY}`, color: NAVY }}>{o.label}</span>
                    {o.key === objetivo && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5813C" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro global: campanha / conjunto / anúncio */}
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(open === "filter" ? null : "filter")}
              style={{ display: "flex", alignItems: "center", gap: 9, background: focus ? "#1A1442" : "#fff", border: `1px solid ${focus ? "#1A1442" : BORDER}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={focus ? "#F9C22E" : "#F5813C"} strokeWidth="2"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
              <span style={{ font: `700 13px ${DISPLAY}`, color: focus ? "#fff" : NAVY, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {focusLabel ?? "Filtrar"}
              </span>
              {focus ? (
                <span
                  onClick={(e) => { e.stopPropagation(); setFocus(null); setOpen(null); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 6, background: "rgba(255,255,255,.18)", cursor: "pointer" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              )}
            </button>
            {open === "filter" && (
              <div style={{ ...dd, left: 0, width: 330 }}>
                <div style={{ display: "inline-flex", background: "#F4F5F9", borderRadius: 10, padding: 3, gap: 2, margin: "4px 4px 8px" }}>
                  {[
                    { k: "campaign", label: "Campanhas" },
                    { k: "adset", label: "Conjuntos" },
                    { k: "ad", label: "Anúncios" },
                  ].map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setFilterTab(t.k as any)}
                      style={{ border: "none", cursor: "pointer", padding: "7px 12px", borderRadius: 8, font: `600 12px ${BODY}`, background: filterTab === t.k ? "#fff" : "transparent", color: filterTab === t.k ? NAVY : MUTED, boxShadow: filterTab === t.k ? "0 1px 2px rgba(20,15,50,.08)" : "none" }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input
                  value={entSearch}
                  onChange={(e) => setEntSearch(e.target.value)}
                  placeholder="Buscar..."
                  style={{ width: "calc(100% - 8px)", margin: "0 4px 8px", borderRadius: 9, border: `1px solid ${BORDER}`, padding: "9px 11px", font: `600 12px ${BODY}`, color: NAVY, outline: "none" }}
                />
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  {entLoading && (
                    <div style={{ font: `500 12px ${BODY}`, color: MUTED, padding: 12, textAlign: "center" }}>Carregando...</div>
                  )}
                  {(entities[`${client.id}:${filterTab}`] ?? [])
                    .filter((e) => e.name.toLowerCase().includes(entSearch.toLowerCase()))
                    .map((e) => {
                      const checked = focus?.type === filterTab && focus.ids.includes(e.id);
                      return (
                      <button
                        key={e.id}
                        onClick={() => toggleFocus(filterTab, e.id, e.name)}
                        style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", border: "none", cursor: "pointer", background: checked ? "#FDEEE1" : "transparent", borderRadius: 10, padding: "9px 10px", textAlign: "left" }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 5, border: checked ? "none" : `1.5px solid #C9CBD6`, background: checked ? "linear-gradient(135deg,#E8336E,#F5813C)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}
                        </span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.status === "ACTIVE" ? "#12A66A" : "#C9CBD6", flexShrink: 0 }} />
                        <span style={{ font: `600 12px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                      </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Calendário */}
          <div style={{ position: "relative", marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(open === "date" ? null : "date")}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F5813C" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
              <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY }}>{dateLabel}</span>
              <span style={{ font: `600 11px ${BODY}`, color: MUTED }}>{days} dias</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {open === "date" && (
              <div style={{ ...dd, right: 0, width: 520, borderRadius: 16, padding: 14, display: "flex", gap: 14 }}>
                <div style={{ width: 168, display: "flex", flexDirection: "column", gap: 4, borderRight: "1px solid #F0F1F6", paddingRight: 12 }}>
                  <div style={{ font: `600 10px ${BODY}`, letterSpacing: ".05em", textTransform: "uppercase", color: MUTED2, padding: "4px 8px 6px" }}>Atalhos</div>
                  {[
                    { k: "hoje", label: "Hoje" },
                    { k: "7d", label: "Últimos 7 dias" },
                    { k: "14d", label: "Últimos 14 dias" },
                    { k: "30d", label: "Últimos 30 dias" },
                    { k: "mes", label: "Este mês" },
                    { k: "mespassado", label: "Mês passado" },
                  ].map((p) => {
                    const active = preset === p.k;
                    const isDefault = defaultPreset === p.k;
                    return (
                    <div key={p.k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => setPresetRange(p.k)}
                        style={{ flex: 1, textAlign: "left", border: "none", cursor: "pointer", background: active ? "#1A1442" : "transparent", color: active ? "#fff" : INK2, borderRadius: 9, padding: "10px 12px", font: `600 12px ${BODY}` }}
                      >
                        {p.label}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); saveDefaultPreset(isDefault ? null : p.k); }}
                        title={isDefault ? "Padrão ao abrir o app (clique para remover)" : "Definir como padrão ao abrir o app"}
                        style={{ border: "none", cursor: "pointer", background: "transparent", padding: 4, display: "flex", alignItems: "center" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={isDefault ? "#F5813C" : "none"} stroke={isDefault ? "#F5813C" : "#C9CBD6"} strokeWidth="2">
                          <path d="M12 17v5M9 3h6l1 7 2.5 2.5a1 1 0 0 1-.7 1.5H6.2a1 1 0 0 1-.7-1.5L8 10z" />
                        </svg>
                      </button>
                    </div>
                    );
                  })}
                  <div style={{ marginTop: "auto", padding: 8, font: `500 11px/1.4 ${BODY}`, color: MUTED }}>
                    Clique em dois dias no calendário para um intervalo personalizado.
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <button onClick={() => { let m = calM - 1, y = calY; if (m < 0) { m = 11; y--; } setCalM(m); setCalY(y); }} style={{ border: "none", background: "#F5F6FA", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK2} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <span style={{ font: `700 14px ${DISPLAY}`, color: NAVY }}>{MON_LONG[calM]} {calY}</span>
                    <button onClick={() => { let m = calM + 1, y = calY; if (m > 11) { m = 0; y++; } setCalM(m); setCalY(y); }} style={{ border: "none", background: "#F5F6FA", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK2} strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
                    {WEEKDAYS.map((w, i) => (
                      <span key={i} style={{ textAlign: "center", font: `600 10px ${BODY}`, color: "#B4B8C6", padding: "4px 0" }}>{w}</span>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                    {calCells.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => c.iso && pickDay(c.iso)}
                        style={{
                          border: "none",
                          cursor: c.iso ? "pointer" : "default",
                          background: c.state === "edge" ? NAVY : c.state === "in" ? "#EDEAF7" : "transparent",
                          color: c.state === "edge" ? "#fff" : c.state === "in" ? NAVY : INK2,
                          borderRadius: 9,
                          height: 34,
                          font: `600 12px ${BODY}`,
                          padding: 0,
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => window.print()} style={{ border: "none", cursor: "pointer", background: NAVY, color: "#fff", borderRadius: 13, padding: "12px 18px", font: `600 13px ${BODY}`, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
            Exportar PDF
          </button>
        </div>

        {/* ===== Selo Meta Ads (tabs de plataforma removidas: Google entra depois) ===== */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 4, boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 11, font: `700 13px ${DISPLAY}`, background: NAVY, color: "#fff" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: error ? "#E8336E" : "#4FBF8B" }} />
              Meta Ads
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {data?.account_info?.isPrepaid && (
              <span style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "9px 14px", boxShadow: "0 1px 2px rgba(20,15,50,.04)" }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#12A66A,#4FBF8B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2.5" /><path d="M2 10h20" /></svg>
                </span>
                <span>
                  <span style={{ display: "block", font: `600 9px ${BODY}`, color: MUTED, letterSpacing: ".04em", textTransform: "uppercase" }}>Saldo da conta</span>
                  <span style={{ display: "block", font: `700 13px ${DISPLAY}`, color: NAVY }}>
                    {data.account_info.displayString ?? fMoney2(data.account_info.balance)}
                  </span>
                </span>
              </span>
            )}
            <div style={{ font: `500 12px ${BODY}`, color: MUTED }}>
              {client.name} · Meta Ads{focusLabel ? ` · ${focusLabel}` : ""} · {dateLabel}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ ...CARD, borderColor: "#F5C4D2", background: "#FDF2F6", padding: "14px 18px", marginBottom: 16, font: `600 13px ${BODY}`, color: "#C21E56" }}>
            {error}
          </div>
        )}

        {/* ===== KPI GRID ===== */}
        <div className="kpi-grid" style={{ display: "grid", gap: 14, marginBottom: 16 }}>
          {[
            {
              key: "invest",
              icon: <KpiIcon grad="linear-gradient(135deg,#EF6D2E,#F9C22E)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2.5" /><path d="M16 12h.01M2 10h20" /></svg></KpiIcon>,
              label: "Investimento · Valor gasto",
              value: acc ? fMoney2(spend) : null,
              delta: acc ? <Delta cur={spend} prev={prv ? Number(prv.spend) : null} /> : null,
            },
            {
              key: "result",
              icon: <KpiIcon grad="linear-gradient(135deg,#E8336E,#F26D33)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2s5 3 5 9c0 2-1 4-1 4l-4 4-4-4s-1-2-1-4c0-6 5-9 5-9z" /><circle cx="12" cy="10" r="1.5" /></svg></KpiIcon>,
              label: `Resultado · ${meta.resultKey}`,
              value: acc ? fInt(acc.results) : null,
              delta: acc ? <Delta cur={acc.results} prev={prv ? prv.results : null} /> : null,
            },
            {
              key: "custo",
              icon: <KpiIcon grad="linear-gradient(135deg,#F26D33,#F7A233)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg></KpiIcon>,
              label: meta.custoKey,
              value: acc ? (acc.costPerResult ? fMoney2(acc.costPerResult) : "—") : null,
              delta: acc ? <Delta cur={acc.costPerResult ?? 0} prev={prv?.costPerResult ?? null} invert /> : null,
            },
            ...(["compras", "infoproduto"].includes(data?.objetivo)
              ? [{
                  key: "valorconv",
                  icon: <KpiIcon grad="linear-gradient(135deg,#D9308A,#E8336E)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="9" cy="21" r="1.5" /><circle cx="19" cy="21" r="1.5" /><path d="M2 3h3l3 13h11l3-9H7" /></svg></KpiIcon>,
                  label: "Valor de conversão · Vendas",
                  value: acc ? (acc.conversionValue ? fMoney2(acc.conversionValue) : "—") : null,
                  delta: acc ? <Delta cur={acc.conversionValue ?? 0} prev={prv?.conversionValue ?? null} suffix="vs período anterior" /> : null,
                }]
              : []),
            {
              key: "retorno",
              icon: <KpiIcon grad="linear-gradient(135deg,#12A66A,#4FBF8B)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5A2.5 2.5 0 0 1 12 8c1.5 0 2.5 1 2.5 2s-1 2-2.5 2-2.5 1-2.5 2 1 2 2.5 2a2.5 2.5 0 0 0 2.5-1.5" /></svg></KpiIcon>,
              label: "Retorno (ROAS)",
              value: acc ? (acc.roas ? acc.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x" : "—") : null,
              delta: acc ? <span style={{ font: `600 11px ${BODY}`, color: MUTED }}>{acc.roas ? "receita atribuída pelo pixel" : "disponível com evento de compra"}</span> : null,
            },
            {
              key: "cpm",
              icon: <KpiIcon grad="linear-gradient(135deg,#F5813C,#F9C22E)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 20V12M9 20V6M14 20v-9M19 20V9" /></svg></KpiIcon>,
              label: "CPM · custo por mil",
              value: acc ? fMoney2(Number(acc.cpm)) : null,
              delta: acc ? <Delta cur={Number(acc.cpm)} prev={prv ? Number(prv.cpm) : null} invert /> : null,
            },
            {
              key: "ctr",
              icon: <KpiIcon grad="linear-gradient(135deg,#E8336E,#F5813C)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" fill="#fff" stroke="none" /></svg></KpiIcon>,
              label: "CTR · taxa de clique",
              value: acc ? fPct(Number(acc.ctr)) : null,
              delta: acc ? <Delta cur={Number(acc.ctr)} prev={prv ? Number(prv.ctr) : null} /> : null,
            },
          ].map((k) => (
            <div key={k.key} style={{ ...CARD, borderRadius: 16, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {k.icon}
                <div>
                  <div style={{ font: `600 11px ${BODY}`, color: MUTED }}>{k.label}</div>
                  {k.value !== null ? (
                    <div style={{ font: `700 26px/1.05 ${DISPLAY}`, color: NAVY, marginTop: 3 }}>{k.value}</div>
                  ) : (
                    <div style={{ height: 27, width: 110, marginTop: 3, background: "#F0F1F6", borderRadius: 6 }} className="animate-pulse" />
                  )}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>{k.delta}</div>
            </div>
          ))}
        </div>

        {/* ===== FUNIL + COLUNA DIREITA ===== */}
        <div className="mid-grid" style={{ display: "grid", gap: 16, marginBottom: 16, alignItems: "start" }}>
          <div style={{ ...CARD, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#EF6D2E,#F9C22E)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
                </span>
                <div>
                  <div style={{ font: `700 16px ${DISPLAY}`, color: NAVY }}>Funil de conversão</div>
                  <div style={{ font: `500 11px ${BODY}`, color: MUTED }}>eventos reais do pixel · Meta Ads</div>
                </div>
              </div>
              <span style={{ font: `700 11px ${DISPLAY}`, color: "#EF6D2E", background: "#FDEEE1", padding: "6px 13px", borderRadius: 20 }}>
                Conversão {funnelRate}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {funnel.map((f, i) => {
                // Escala log: preserva o formato de funil mesmo quando a 1ª etapa é ordens de grandeza maior
                const width = Math.max(
                  26,
                  26 + 74 * (Math.log10(f.value + 1) / Math.log10(maxFunnel + 1))
                );
                const costPer = f.value > 0 ? spend / f.value : null;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "74px 1fr 148px", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      {i > 0 && funnel[i - 1].value > 0 && (
                        <span style={{ font: `700 11px ${DISPLAY}`, color: "#6A6A85", background: "#F4F5F9", padding: "4px 9px", borderRadius: 20 }}>
                          {fPct((f.value / funnel[i - 1].value) * 100)}
                        </span>
                      )}
                    </div>
                    <div style={{ width: `${width}%`, minWidth: 150, margin: "0 auto", background: FUNNEL_COLORS[i % FUNNEL_COLORS.length], borderRadius: 11, padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "width .55s cubic-bezier(.4,0,.2,1)" }}>
                      <span style={{ font: `600 12px ${BODY}`, color: "rgba(255,255,255,.94)" }}>{f.stage}</span>
                      <span style={{ font: `700 18px ${DISPLAY}`, color: "#fff" }}>{fComp(f.value)}</span>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ font: `500 10px ${BODY}`, color: MUTED2 }}>custo por etapa</div>
                      <div style={{ font: `700 13px ${DISPLAY}`, color: INK2 }}>{costPer !== null ? fMoney2(costPer) : "—"}</div>
                    </div>
                  </div>
                );
              })}
              {!funnel.length && !loading && (
                <div style={{ font: `500 13px ${BODY}`, color: MUTED, padding: 20, textAlign: "center" }}>Sem eventos no período selecionado.</div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Donut gênero */}
            <div style={{ ...CARD, padding: "20px 22px" }}>
              <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 4 }}>Investimento por gênero</div>
              <div style={{ font: `500 11px ${BODY}`, color: MUTED }}>distribuição do valor gasto</div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
                <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
                  <svg viewBox="0 0 140 140" width="132" height="132">
                    <circle cx="70" cy="70" r="54" fill="none" stroke="#F1F2F7" strokeWidth="16" />
                    {genderSegs.map((s: any, i: number) => (
                      <circle key={i} cx="70" cy="70" r="54" fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={s.dash} strokeDashoffset={s.offset} transform="rotate(-90 70 70)" />
                    ))}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="" style={{ width: 42, height: 42 }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {genderSegs.map((s: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, font: `600 12px ${BODY}`, color: INK2 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                        {s.label}
                      </span>
                      <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY }}>{s.pctStr}</span>
                    </div>
                  ))}
                  {!genderSegs.length && <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Sem dados no período.</span>}
                </div>
              </div>
            </div>
            {/* Barras por plataforma */}
            <div style={{ ...CARD, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#E8336E,#F5813C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" fill="#fff" stroke="none" /></svg>
                </span>
                <span style={{ font: `700 15px ${DISPLAY}`, color: NAVY }}>Onde seu anúncio aparece</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {platBars.map((b: any, i: number) => (
                  <div key={i}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ font: `600 12px ${BODY}`, color: INK2 }}>{b.label}</span>
                      <span style={{ font: `700 12px ${DISPLAY}`, color: NAVY }}>
                        {b.valStr} <span style={{ color: MUTED2, font: `600 11px ${BODY}` }}>{b.pctStr}</span>
                      </span>
                    </div>
                    <div style={{ height: 9, background: "#F4F5F9", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${b.width}%`, background: b.color, borderRadius: 6, transition: "width .5s" }} />
                    </div>
                  </div>
                ))}
                {!platBars.length && <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Sem dados no período.</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ===== TABELA + DESTAQUES ===== */}
        <div className="bottom-grid" style={{ display: "grid", gap: 16, alignItems: "start" }}>
          <div style={{ ...CARD, padding: "20px 22px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY }}>Visão geral</div>
              <div style={{ display: "inline-flex", background: "#F4F5F9", borderRadius: 10, padding: 3, gap: 2 }}>
                {[
                  { k: "campaign", label: "Campanhas" },
                  { k: "adset", label: "Conjuntos" },
                  { k: "ad", label: "Anúncios" },
                ].map((l) => (
                  <button
                    key={l.k}
                    onClick={() => setLevel(l.k as any)}
                    style={{ border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 8, font: `600 12px ${BODY}`, background: level === l.k ? "#fff" : "transparent", color: level === l.k ? NAVY : MUTED, boxShadow: level === l.k ? "0 1px 2px rgba(20,15,50,.08)" : "none", transition: "all .2s" }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
            <div className="table-grid" style={{ display: "grid", padding: "8px 12px", borderBottom: "1px solid #F0F1F6" }}>
              {[
                level === "ad" ? "Anúncio" : level === "adset" ? "Conjunto" : "Campanha",
                meta.resultKey, "CTR", "Cliques", meta.custoShort, "Investido",
              ].map((h, i) => (
                <span key={i} style={{ font: `600 10px ${BODY}`, letterSpacing: ".04em", textTransform: "uppercase", color: MUTED2, textAlign: i === 0 ? "left" : "right" }}>{h}</span>
              ))}
            </div>
            {rows.map((r: any, i: number) => {
              const rid = data?.level === "ad" ? r.ad_id : data?.level === "adset" ? r.adset_id : r.campaign_id;
              const isFocused = focus !== null && focus.type === (data?.level ?? "campaign") && focus.ids.includes(rid);
              return (
              <div
                key={i}
                onClick={() => toggleFocus(data?.level ?? "campaign", rid, rowName(r))}
                title={isFocused ? "Clique para remover o filtro" : "Clique para filtrar o dashboard"}
                className="table-grid"
                style={{ display: "grid", alignItems: "center", padding: "13px 12px", borderRadius: 10, cursor: "pointer", background: isFocused ? "#FDEEE1" : "transparent", outline: isFocused ? "1px solid #F5813C" : "none" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length], flexShrink: 0 }} />
                  <span style={{ font: `600 13px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rowName(r)}</span>
                </span>
                <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY, textAlign: "right" }}>{fInt(r.results)}</span>
                <span style={{ font: `600 12px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fPct(Number(r.ctr))}</span>
                <span style={{ font: `600 12px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{fInt(Number(r.clicks))}</span>
                <span style={{ font: `600 12px ${DISPLAY}`, color: INK2, textAlign: "right" }}>{r.costPerResult ? fMoney2(r.costPerResult) : "—"}</span>
                <span style={{ font: `700 13px ${DISPLAY}`, color: NAVY, textAlign: "right" }}>{fMoney2(Number(r.spend))}</span>
              </div>
              );
            })}
            </div>
            {!rows.length && !loading && (
              <div style={{ font: `500 13px ${BODY}`, color: MUTED, padding: 20, textAlign: "center" }}>Sem veiculação no período.</div>
            )}
          </div>

          <div style={{ ...CARD, padding: "20px 22px" }}>
            <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 3 }}>Destaques</div>
            <div style={{ font: `500 11px ${BODY}`, color: MUTED, marginBottom: 14 }}>criativos com mais resultados no período</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(data?.highlights ?? []).map((d: any, i: number) => (
                <button
                  key={d.ad_id}
                  onClick={() => setPreview(d)}
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, border: "1px solid #F0F1F6", borderRadius: 12, background: "#fff", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  {d.thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.thumb} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#F4F5F9" }} />
                  ) : (
                    <span style={{ width: 52, height: 52, borderRadius: 10, background: `linear-gradient(135deg,${FUNNEL_COLORS[i]},${FUNNEL_COLORS[i + 2] ?? "#F9C22E"})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 13px ${BODY}`, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <span style={{ font: `600 11px ${BODY}`, color: "#6A6A85" }}>{fInt(d.results)} {meta.resultKey.toLowerCase()}</span>
                      <span style={{ font: `600 11px ${BODY}`, color: "#EF6D2E" }}>{d.costPerResult ? fMoney2(d.costPerResult) : "—"}</span>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9CBD6" strokeWidth="2"><path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
                </button>
              ))}
              {!(data?.highlights ?? []).length && !loading && (
                <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Sem dados no período.</span>
              )}
            </div>
          </div>
        </div>

        {preview && (
          <div
            onClick={() => setPreview(null)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,20,66,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440, overflow: "hidden", boxShadow: "0 30px 70px -20px rgba(20,15,50,.5)" }}>
              {preview.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview.image} alt={preview.name} style={{ width: "100%", maxHeight: 440, objectFit: "contain", background: "#0E0A26", display: "block" }} />
              ) : (
                <div style={{ height: 200, background: "linear-gradient(135deg,#E8336E,#F5813C,#F9C22E)", display: "grid", placeItems: "center", font: `700 15px ${DISPLAY}`, color: "#fff" }}>
                  Prévia indisponível
                </div>
              )}
              <div style={{ padding: "18px 20px" }}>
                <div style={{ font: `700 14px ${BODY}`, color: NAVY, marginBottom: 10 }}>{preview.name}</div>
                <div style={{ display: "flex", gap: 18, marginBottom: 16 }}>
                  <div>
                    <div style={{ font: `600 9px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em" }}>{meta.resultKey}</div>
                    <div style={{ font: `700 18px ${DISPLAY}`, color: NAVY }}>{fInt(preview.results)}</div>
                  </div>
                  <div>
                    <div style={{ font: `600 9px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em" }}>{meta.custoShort}</div>
                    <div style={{ font: `700 18px ${DISPLAY}`, color: NAVY }}>{preview.costPerResult ? fMoney2(preview.costPerResult) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ font: `600 9px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em" }}>Investido</div>
                    <div style={{ font: `700 18px ${DISPLAY}`, color: NAVY }}>{fMoney2(preview.spend)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {preview.permalink && (
                    <a href={preview.permalink} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", textDecoration: "none", borderRadius: 11, padding: "11px 0", font: `700 12px ${DISPLAY}`, color: "#fff", background: "linear-gradient(135deg,#E8336E,#F5813C)" }}>
                      Ver no Instagram
                    </a>
                  )}
                  <button onClick={() => setPreview(null)} style={{ flex: 1, border: "1px solid #E2E4EE", cursor: "pointer", background: "#fff", borderRadius: 11, padding: "11px 0", font: `700 12px ${DISPLAY}`, color: INK2 }}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {data?.fetched_at && (
          <p style={{ font: `500 11px ${BODY}`, color: MUTED2, marginTop: 18 }}>
            Dados da Meta atualizados em {new Date(data.fetched_at).toLocaleString("pt-BR")}. A Meta pode levar até algumas horas para consolidar os resultados do dia.
          </p>
        )}
      </div>
    </main>
  );
}
