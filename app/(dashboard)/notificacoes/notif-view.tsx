// app/(dashboard)/notificacoes/notif-view.tsx
"use client";

import { useEffect, useState, useCallback } from "react";

const NAVY = "#1A1442";
const MUTED = "#9096AA";
const INK2 = "#4A4568";
const DISPLAY = "'Space Grotesk', sans-serif";
const BODY = "'Plus Jakarta Sans', sans-serif";
const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ECEDF3",
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(20,15,50,.04)",
};
const COLORS = ["#E8336E", "#EF5A57", "#F5813C", "#F7A233", "#D9308A", "#EF6D2E"];
const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const input: React.CSSProperties = {
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #E2E4EE",
  padding: "9px 11px",
  font: `600 12px ${BODY}`,
  color: NAVY,
  outline: "none",
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40, height: 22, borderRadius: 20, border: "none", cursor: "pointer",
        background: on ? "linear-gradient(135deg,#E8336E,#F5813C)" : "#DDDFE8",
        position: "relative", transition: "background .2s", flexShrink: 0,
      }}
    >
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

export default function NotifView({ clients }: { clients: { id: string; name: string }[] }) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notifications");
    const json = await res.json();
    if (res.ok) {
      setData(json);
      const f: Record<string, any> = {};
      for (const c of clients) {
        const s = json.settings.find((x: any) => x.client_id === c.id);
        f[c.id] = {
          group_id: s?.group_id ?? "",
          weekly_enabled: s?.weekly_enabled ?? false,
          weekly_day: s?.weekly_day ?? 1,
          weekly_hour: s?.weekly_hour ?? 8,
          low_balance_enabled: s?.low_balance_enabled ?? false,
          low_balance_threshold: s?.low_balance_threshold ?? 200,
        };
      }
      setForm(f);
    }
  }, [clients]);

  useEffect(() => { load(); }, [load]);

  async function save(clientId: string) {
    setSaving(clientId);
    const f = form[clientId];
    const group = (data?.groups ?? []).find((g: any) => g.id === f.group_id);
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, ...f, group_name: group?.name ?? null }),
    });
    const json = await res.json();
    setSaving(null);
    flash(res.ok, res.ok ? "Configuração salva." : json.error);
  }

  async function act(clientId: string, action: "test" | "send_now") {
    setActing(clientId + action);
    const res = await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, client_id: clientId }),
    });
    const json = await res.json();
    setActing(null);
    flash(res.ok, res.ok ? json.msg : json.error);
    if (res.ok) load();
  }

  const set = (id: string, k: string, v: any) =>
    setForm((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));

  const connected = data?.status?.connected;

  return (
    <main style={{ padding: "26px 30px", fontFamily: BODY, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ font: `700 22px ${DISPLAY}`, color: NAVY }}>Notificações</h1>
          <p style={{ font: `500 12px ${BODY}`, color: MUTED, margin: "4px 0 0" }}>
            Relatórios semanais e alertas de saldo direto no grupo do cliente, via WhatsApp.
          </p>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #E2E4EE", borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: connected ? "#12A66A" : "#E8336E" }} />
          <span style={{ font: `600 12px ${BODY}`, color: INK2 }}>
            {data === null ? "Verificando WhatsApp..." : connected ? "WhatsApp conectado" : data?.waError ? "WhatsApp indisponível" : `WhatsApp: ${data?.status?.raw ?? "desconectado"}`}
          </span>
        </span>
      </div>

      {data?.waError && (
        <div style={{ ...CARD, borderColor: "#F5C4D2", background: "#FDF2F6", padding: "12px 16px", margin: "16px 0 0", font: `600 12px ${BODY}`, color: "#C21E56" }}>
          Erro ao falar com a uazapi: {data.waError} — confira UAZAPI_URL e UAZAPI_TOKEN na Vercel.
        </div>
      )}
      {msg && (
        <div style={{ ...CARD, borderColor: msg.ok ? "#BFE8D4" : "#F5C4D2", background: msg.ok ? "#F0FAF5" : "#FDF2F6", padding: "12px 16px", margin: "16px 0 0", font: `600 12px ${BODY}`, color: msg.ok ? "#0E7A4E" : "#C21E56" }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {clients.map((c, i) => {
          const f = form[c.id];
          if (!f) return null;
          return (
            <div key={c.id} style={{ ...CARD, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: COLORS[i % COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", font: `700 14px ${DISPLAY}`, color: "#fff" }}>
                  {c.name.charAt(0)}
                </span>
                <span style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginRight: "auto" }}>{c.name}</span>
                <button onClick={() => act(c.id, "test")} disabled={!!acting || !f.group_id} style={{ border: "1px solid #E2E4EE", cursor: "pointer", background: "#fff", borderRadius: 10, padding: "9px 14px", font: `600 12px ${BODY}`, color: INK2, opacity: !f.group_id ? 0.5 : 1 }}>
                  {acting === c.id + "test" ? "Enviando..." : "Testar conexão"}
                </button>
                <button onClick={() => act(c.id, "send_now")} disabled={!!acting || !f.group_id} style={{ border: "none", cursor: "pointer", background: "linear-gradient(135deg,#E8336E,#F5813C)", borderRadius: 10, padding: "9px 14px", font: `700 12px ${DISPLAY}`, color: "#fff", opacity: !f.group_id ? 0.5 : 1 }}>
                  {acting === c.id + "send_now" ? "Gerando PDF..." : "Enviar agora"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", font: `600 10px ${BODY}`, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 }}>
                    Grupo do WhatsApp
                  </label>
                  <select style={{ ...input, width: "100%" }} value={f.group_id} onChange={(e) => set(c.id, "group_id", e.target.value)}>
                    <option value="">Selecione o grupo...</option>
                    {(data?.groups ?? []).map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <Toggle on={f.weekly_enabled} onClick={() => set(c.id, "weekly_enabled", !f.weekly_enabled)} />
                    <span style={{ font: `600 12px ${BODY}`, color: NAVY }}>Relatório semanal</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, opacity: f.weekly_enabled ? 1 : 0.45 }}>
                    <select style={{ ...input, flex: 1 }} value={f.weekly_day} onChange={(e) => set(c.id, "weekly_day", Number(e.target.value))}>
                      {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
                    </select>
                    <select style={{ ...input, width: 80 }} value={f.weekly_hour} onChange={(e) => set(c.id, "weekly_hour", Number(e.target.value))}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{("0" + h).slice(-2)}h</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <Toggle on={f.low_balance_enabled} onClick={() => set(c.id, "low_balance_enabled", !f.low_balance_enabled)} />
                    <span style={{ font: `600 12px ${BODY}`, color: NAVY }}>Alerta de saldo baixo</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: f.low_balance_enabled ? 1 : 0.45 }}>
                    <span style={{ font: `600 12px ${BODY}`, color: MUTED }}>Abaixo de R$</span>
                    <input type="number" style={{ ...input, width: 90 }} value={f.low_balance_threshold} onChange={(e) => set(c.id, "low_balance_threshold", e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => save(c.id)} disabled={saving === c.id} style={{ border: "none", cursor: "pointer", background: NAVY, borderRadius: 10, padding: "10px 20px", font: `700 12px ${DISPLAY}`, color: "#fff", opacity: saving === c.id ? 0.6 : 1 }}>
                  {saving === c.id ? "Salvando..." : "Salvar configuração"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Log */}
      <div style={{ ...CARD, padding: "20px 22px", marginTop: 18 }}>
        <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 12 }}>Histórico de envios</div>
        {(data?.log ?? []).map((l: any) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: "1px solid #F0F1F6" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.status === "sent" ? "#12A66A" : "#E8336E", flexShrink: 0 }} />
            <span style={{ font: `600 12px ${BODY}`, color: NAVY, width: 150 }}>{l.clients?.name}</span>
            <span style={{ font: `600 11px ${BODY}`, color: INK2, width: 130 }}>
              {l.type === "weekly_report" ? "Relatório semanal" : l.type === "low_balance" ? "Alerta de saldo" : "Teste"}
            </span>
            <span style={{ font: `500 11px ${BODY}`, color: MUTED, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.detail}</span>
            <span style={{ font: `500 11px ${BODY}`, color: MUTED }}>
              {new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Campo_Grande", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        {!(data?.log ?? []).length && <span style={{ font: `500 12px ${BODY}`, color: MUTED }}>Nenhum envio ainda.</span>}
      </div>
    </main>
  );
}
