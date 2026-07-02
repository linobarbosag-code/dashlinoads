// app/login/page.tsx
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
    <main className="min-h-screen grid place-items-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white mb-1">
          Portal do cliente
        </h1>
        <p className="text-neutral-400 text-sm mb-8">
          Acompanhe os resultados das suas campanhas.
        </p>

        <label className="block text-sm text-neutral-300 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-white outline-none focus:border-neutral-600"
        />

        <label className="block text-sm text-neutral-300 mb-1">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full mb-6 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-white outline-none focus:border-neutral-600"
        />

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-lg bg-white text-neutral-950 font-medium py-2.5 hover:bg-neutral-200 disabled:opacity-50 transition"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </main>
  );
}
