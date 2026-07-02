// components/login-form.tsx — LinoADS v2
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

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

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Painel de marca */}
      <div className="hidden lg:flex flex-col justify-between p-10 border-r border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,#a78bfa14,transparent_60%)]">
        <span className="font-[family-name:var(--font-display)] font-bold tracking-tight text-xl">
          Lino<span className="text-[var(--accent)]">ADS</span>
        </span>
        <div>
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl leading-snug max-w-md">
            Resultado não é opinião.
            <br />
            <span className="text-[var(--accent)]">É número na tela.</span>
          </h2>
          <p className="text-neutral-400 mt-4 max-w-sm text-sm leading-relaxed">
            Investimento, leads e custo por resultado das suas campanhas,
            direto da Meta, sem intermediário.
          </p>
        </div>
        <p className="text-xs text-neutral-600">
          © {new Date().getFullYear()} LinoADS · Campo Grande, MS
        </p>
      </div>

      {/* Formulário */}
      <div className="grid place-items-center px-4 py-16">
        <div className="w-full max-w-sm">
          <span className="lg:hidden block font-[family-name:var(--font-display)] font-bold tracking-tight text-xl mb-10">
            Lino<span className="text-[var(--accent)]">ADS</span>
          </span>

          <h1 className="font-[family-name:var(--font-display)] font-semibold text-2xl mb-1">
            Portal do cliente
          </h1>
          <p className="text-neutral-400 text-sm mb-8">
            Entre para acompanhar suas campanhas.
          </p>

          <label className="block text-sm text-neutral-300 mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2.5 outline-none focus:border-[var(--accent)] transition"
          />

          <label className="block text-sm text-neutral-300 mb-1.5">
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full mb-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2.5 outline-none focus:border-[var(--accent)] transition"
          />

          {error && (
            <p className="text-[var(--negative)] text-sm mb-4">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-[var(--accent)] text-neutral-950 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 transition"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </main>
  );
}
