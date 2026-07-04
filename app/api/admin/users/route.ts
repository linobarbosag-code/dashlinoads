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

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { user_id, role } = await req.json();
  if (!["admin", "client"].includes(role))
    return NextResponse.json({ error: "Cargo inválido" }, { status: 400 });
  if (user_id === admin.id && role !== "admin")
    return NextResponse.json({ error: "Você não pode rebaixar o próprio acesso" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role }).eq("id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { user_id } = await req.json();
  if (user_id === admin.id)
    return NextResponse.json({ error: "Você não pode remover o próprio acesso" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // profiles e client_users caem em cascata pelo FK de auth.users
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const db = createAdminClient();
  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, role, created_at");
  const { data: links } = await db
    .from("client_users")
    .select("user_id, client_id, clients(name)");
  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 200 });

  const emailById: Record<string, string> = {};
  for (const u of authUsers?.users ?? []) emailById[u.id] = u.email ?? "";

  const users = (profiles ?? []).map((p: any) => ({
    ...p,
    email: emailById[p.id] ?? "",
    clients: (links ?? [])
      .filter((l: any) => l.user_id === p.id)
      .map((l: any) => l.clients?.name)
      .filter(Boolean),
  }));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { full_name, email, password, client_ids } = await req.json();
  if (!full_name || !email || !password)
    return NextResponse.json({ error: "Nome, email e senha são obrigatórios" }, { status: 400 });
  if (String(password).length < 8)
    return NextResponse.json({ error: "Senha precisa de ao menos 8 caracteres" }, { status: 400 });

  const db = createAdminClient();
  const { data: created, error } = await db.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const userId = created.user.id;
  // O trigger cria o profile; garante o nome
  await db.from("profiles").update({ full_name }).eq("id", userId);

  const ids: string[] = Array.isArray(client_ids) ? client_ids.filter(Boolean) : [];
  if (ids.length) {
    const { error: linkErr } = await db
      .from("client_users")
      .insert(ids.map((client_id: string) => ({ user_id: userId, client_id })));
    if (linkErr)
      return NextResponse.json({ error: "Usuário criado, mas falhou o vínculo: " + linkErr.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, user_id: userId });
}
