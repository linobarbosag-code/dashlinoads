import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardView from "@/components/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, currency, google_customer_id")
    .eq("active", true)
    .order("name");

  if (!clients?.length) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#9096AA", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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
