import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { name, ad_account_id } = await req.json();
  if (!name || !ad_account_id)
    return NextResponse.json({ error: "Nome e ID da conta são obrigatórios" }, { status: 400 });

  const acct = String(ad_account_id).trim();
  const normalized = acct.startsWith("act_") ? acct : `act_${acct.replace(/\D/g, "")}`;
  if (!/^act_\d{5,}$/.test(normalized))
    return NextResponse.json({ error: "ID de conta inválido" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("clients")
    .insert({ name: String(name).trim(), ad_account_id: normalized })
    .select()
    .single();
  if (error) {
    const msg = error.code === "23505" ? "Essa conta de anúncio já está cadastrada" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ client: data });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id, active, objetivo } = await req.json();
  const db = createAdminClient();
  const patch: Record<string, any> = {};
  if (active !== undefined) patch.active = active;
  if (objetivo !== undefined) patch.objetivo = objetivo;
  const { error } = await db.from("clients").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}


export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await req.json();
  const db = createAdminClient();
  const { error } = await db.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // insights_cache, client_users e notification_settings caem em cascata
  return NextResponse.json({ ok: true });
}
