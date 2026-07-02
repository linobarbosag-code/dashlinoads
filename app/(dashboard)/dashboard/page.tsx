// app/(dashboard)/dashboard/page.tsx
// Server component: resolve o usuário, os clientes vinculados e o papel.
// Admin vê seletor com todos os clientes; cliente vê só a própria conta.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import DashboardView from "@/components/dashboard-view";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  // RLS já filtra: admin recebe todos, cliente recebe só os vinculados
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, currency")
    .eq("active", true)
    .order("name");

  if (!clients?.length) {
    return (
      <main className="min-h-screen grid place-items-center bg-neutral-950 text-neutral-300">
        Nenhuma conta vinculada ao seu acesso. Fale com a agência.
      </main>
    );
  }

  return (
    <DashboardView
      userName={profile?.full_name ?? ""}
      isAdmin={profile?.role === "admin"}
      clients={clients}
    />
  );
}
