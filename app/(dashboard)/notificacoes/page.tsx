import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotifView from "./notif-view";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: clients } = await supabase
    .from("clients").select("id, name").eq("active", true).order("name");

  return <NotifView clients={clients ?? []} />;
}
