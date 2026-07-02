// components/login-form.tsx — visual do design LinoADS v2
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const NAVY = "#1A1442";
const DISPLAY = "'Space Grotesk', sans-serif";
const BODY = "'Plus Jakarta Sans', sans-serif";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const input: React.CSSProperties = {
    width: "100%",
    borderRadius: 13,
    background: "#fff",
    border: "1px solid #E2E4EE",
    padding: "12px 14px",
    font: `600 14px ${BODY}`,
    color: NAVY,
    outline: "none",
    boxShadow: "0 1px 2px rgba(20,15,50,.04)",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F5F6FA",
        display: "grid",
        placeItems: "center",
        padding: 16,
        fontFamily: BODY,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="LinoADS"
            style={{ width: 64, height: 64, marginBottom: 14 }}
          />
          <span
            style={{
              font: `700 26px ${DISPLAY}`,
              color: NAVY,
              letterSpacing: "-.01em",
            }}
          >
            LinoADS
          </span>
          <span
            style={{
              font: `600 9px ${BODY}`,
              color: "#A0A4B4",
              letterSpacing: ".18em",
              marginTop: 4,
            }}
          >
            ASSESSORIA DE MARKETING
          </span>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #ECEDF3",
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 1px 2px rgba(20,15,50,.04)",
          }}
        >
          <div style={{ font: `700 18px ${DISPLAY}`, color: NAVY }}>
            Portal do cliente
          </div>
          <div
            style={{
              font: `500 12px ${BODY}`,
              color: "#9096AA",
              marginTop: 3,
              marginBottom: 22,
            }}
          >
            Entre para acompanhar os resultados das suas campanhas.
          </div>

          <label
            style={{
              display: "block",
              font: `600 12px ${BODY}`,
              color: "#4A4568",
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...input, marginBottom: 16 }}
          />

          <label
            style={{
              display: "block",
              font: `600 12px ${BODY}`,
              color: "#4A4568",
              marginBottom: 6,
            }}
          >
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{ ...input, marginBottom: 20 }}
          />

          {error && (
            <p
              style={{
                font: `600 12px ${BODY}`,
                color: "#E8336E",
                marginBottom: 14,
              }}
            >
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: "100%",
              border: "none",
              cursor: "pointer",
              borderRadius: 13,
              padding: "13px 0",
              font: `700 14px ${DISPLAY}`,
              color: "#fff",
              background: "linear-gradient(135deg,#E8336E,#F5813C,#F9C22E)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>

        <p
          style={{
            textAlign: "center",
            font: `500 11px ${BODY}`,
            color: "#A0A4B4",
            marginTop: 18,
          }}
        >
          © {new Date().getFullYear()} LinoADS · Campo Grande, MS
        </p>
      </div>
    </main>
  );
}
