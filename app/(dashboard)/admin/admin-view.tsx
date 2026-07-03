// app/(dashboard)/admin/admin-view.tsx
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

const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 11,
  background: "#fff",
  border: "1px solid #E2E4EE",
  padding: "11px 13px",
  font: `600 13px ${BODY}`,
  color: NAVY,
  outline: "none",
};
const label: React.CSSProperties = {
  display: "block",
  font: `600 11px ${BODY}`,
  color: INK2,
  margin: "0 0 5px",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  borderRadius: 11,
  padding: "12px 18px",
  font: `700 13px ${DISPLAY}`,
  color: "#fff",
  background: "linear-gradient(135deg,#E8336E,#F5813C)",
};

interface Client {
  id: string;
  name: string;
  ad_account_id: string;
  active: boolean;
}

export default function AdminView({ initialClients }: { initialClients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // form conta
  const [cName, setCName] = useState("");
  const [cAcct, setCAcct] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // form usuário
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPass, setUPass] = useState("");
  const [uClients, setUClients] = useState<string[]>([]);
  const [savingUser, setSavingUser] = useState(false);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (res.ok) setUsers(json.users);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function addClient() {
    setSavingClient(true);
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cName, ad_account_id: cAcct }),
    });
    const json = await res.json();
    setSavingClient(false);
    if (!res.ok) return flash(false, json.error);
    setClients((c) => [...c, json.client]);
    setCName("");
    setCAcct("");
    flash(true, `Conta ${json.client.name} cadastrada.`);
  }

  async function toggleClient(c: Client) {
    const res = await fetch("/api/admin/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    if (res.ok) {
      setClients((list) =>
        list.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x))
      );
    }
  }

  async function addUser() {
    setSavingUser(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: uName,
        email: uEmail,
        password: uPass,
        client_ids: uClients,
      }),
    });
    const json = await res.json();
    setSavingUser(false);
    if (!res.ok) return flash(false, json.error);
    setUName("");
    setUEmail("");
    setUPass("");
    setUClients([]);
    flash(true, "Acesso criado. O cliente já pode entrar com o email e a senha definidos.");
    loadUsers();
  }

  return (
    <main style={{ padding: "26px 30px", fontFamily: BODY, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ font: `700 22px ${DISPLAY}`, color: NAVY }}>Administração</h1>
      <p style={{ font: `500 12px ${BODY}`, color: MUTED, margin: "4px 0 22px" }}>
        Contas de anúncio e acessos dos clientes.
      </p>

      {msg && (
        <div
          style={{
            ...CARD,
            borderColor: msg.ok ? "#BFE8D4" : "#F5C4D2",
            background: msg.ok ? "#F0FAF5" : "#FDF2F6",
            color: msg.ok ? "#0E7A4E" : "#C21E56",
            padding: "13px 16px",
            marginBottom: 16,
            font: `600 13px ${BODY}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Nova conta de anúncio */}
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 3 }}>
            Nova conta de anúncio
          </div>
          <div style={{ font: `500 11px ${BODY}`, color: MUTED, marginBottom: 16 }}>
            A conta precisa estar atribuída ao usuário do sistema no Business Manager.
          </div>
          <label style={label}>Nome do cliente</label>
          <input style={{ ...input, marginBottom: 12 }} value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ex.: Autobel" />
          <label style={label}>ID da conta de anúncio</label>
          <input style={{ ...input, marginBottom: 16 }} value={cAcct} onChange={(e) => setCAcct(e.target.value)} placeholder="act_1234567890 ou só os números" />
          <button style={{ ...primaryBtn, opacity: savingClient ? 0.6 : 1 }} disabled={savingClient} onClick={addClient}>
            {savingClient ? "Cadastrando..." : "Cadastrar conta"}
          </button>
        </div>

        {/* Novo acesso */}
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 3 }}>
            Novo acesso de cliente
          </div>
          <div style={{ font: `500 11px ${BODY}`, color: MUTED, marginBottom: 16 }}>
            O usuário enxerga somente a conta vinculada a ele.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Nome</label>
              <input style={input} value={uName} onChange={(e) => setUName(e.target.value)} />
            </div>
            <div>
              <label style={label}>Email</label>
              <input style={input} type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={label}>Senha (mín. 8)</label>
              <input style={input} type="text" value={uPass} onChange={(e) => setUPass(e.target.value)} />
            </div>
            <div>
              <label style={label}>Contas de anúncio ({uClients.length} selecionada{uClients.length === 1 ? "" : "s"})</label>
              <div style={{ border: "1px solid #E2E4EE", borderRadius: 11, maxHeight: 132, overflowY: "auto", padding: 4 }}>
                {clients.filter((c) => c.active).map((c) => {
                  const checked = uClients.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setUClients((list) =>
                          checked ? list.filter((x) => x !== c.id) : [...list, c.id]
                        )
                      }
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", cursor: "pointer", background: checked ? "#FDEEE1" : "transparent", borderRadius: 8, padding: "8px 9px", textAlign: "left" }}
                    >
                      <span style={{ width: 15, height: 15, borderRadius: 5, border: checked ? "none" : "1.5px solid #C9CBD6", background: checked ? "linear-gradient(135deg,#E8336E,#F5813C)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}
                      </span>
                      <span style={{ font: `600 12px ${BODY}`, color: NAVY }}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button style={{ ...primaryBtn, opacity: savingUser ? 0.6 : 1 }} disabled={savingUser} onClick={addUser}>
            {savingUser ? "Criando..." : "Criar acesso"}
          </button>
        </div>
      </div>

      {/* Lista de contas */}
      <div style={{ ...CARD, padding: "20px 22px", marginBottom: 16 }}>
        <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 12 }}>
          Contas cadastradas ({clients.length})
        </div>
        {clients.map((c, i) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid #F0F1F6" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: COLORS[i % COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", font: `700 13px ${DISPLAY}`, color: "#fff" }}>
              {c.name.charAt(0)}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ font: `600 13px ${BODY}`, color: NAVY }}>{c.name}</div>
              <div style={{ font: `500 11px ${BODY}`, color: MUTED }}>{c.ad_account_id}</div>
            </div>
            <span style={{ font: `600 10px ${BODY}`, color: c.active ? "#0E7A4E" : MUTED, background: c.active ? "#E7F6EF" : "#F0F1F6", padding: "4px 10px", borderRadius: 20 }}>
              {c.active ? "Ativa" : "Inativa"}
            </span>
            <button onClick={() => toggleClient(c)} style={{ border: "1px solid #E2E4EE", cursor: "pointer", background: "#fff", borderRadius: 9, padding: "7px 12px", font: `600 11px ${BODY}`, color: INK2 }}>
              {c.active ? "Desativar" : "Reativar"}
            </button>
          </div>
        ))}
      </div>

      {/* Lista de acessos */}
      <div style={{ ...CARD, padding: "20px 22px" }}>
        <div style={{ font: `700 15px ${DISPLAY}`, color: NAVY, marginBottom: 12 }}>
          Acessos ({users.length})
        </div>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid #F0F1F6" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: u.role === "admin" ? NAVY : "#F5813C", display: "flex", alignItems: "center", justifyContent: "center", font: `700 13px ${DISPLAY}`, color: "#fff" }}>
              {(u.full_name || "?").charAt(0).toUpperCase()}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ font: `600 13px ${BODY}`, color: NAVY }}>{u.full_name}</div>
              <div style={{ font: `500 11px ${BODY}`, color: MUTED }}>{u.email}</div>
            </div>
            <span style={{ font: `600 11px ${BODY}`, color: INK2 }}>
              {u.role === "admin" ? "Todas as contas" : (u.clients.join(", ") || "Sem vínculo")}
            </span>
            <span style={{ font: `600 10px ${BODY}`, color: u.role === "admin" ? "#fff" : "#EF6D2E", background: u.role === "admin" ? NAVY : "#FDECE2", padding: "4px 10px", borderRadius: 20 }}>
              {u.role === "admin" ? "Admin" : "Cliente"}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
