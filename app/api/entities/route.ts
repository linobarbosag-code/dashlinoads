import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listEntities } from "@/lib/meta-v2";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id");
  const type = sp.get("type") as "campaigns" | "adsets" | "ads";
  if (!["campaigns", "adsets", "ads"].includes(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("ad_account_id")
    .eq("id", clientId)
    .single();
  if (!client) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const entities = await listEntities(client.ad_account_id, type);
    return NextResponse.json({ entities });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
