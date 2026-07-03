import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh", background: "#F5F6FA" }}>
      <Sidebar
        userName={profile?.full_name ?? ""}
        isAdmin={profile?.role === "admin"}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
