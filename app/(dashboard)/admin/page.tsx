import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminView from "./admin-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, active")
    .order("name");

  return <AdminView initialClients={clients ?? []} />;
}
