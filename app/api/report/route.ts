// app/api/report/route.ts — PDF do período escolhido no dashboard (Meta)
// ?client_id=...&since=YYYY-MM-DD&until=YYYY-MM-DD&objetivo=auto|...
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { previousRange, type Objetivo, type Focus } from "@/lib/meta-v2";
import { collectReport } from "@/lib/report-data";
import { buildReportPdf } from "@/lib/report-pdf";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const since = sp.get("since") ?? "";
  const until = sp.get("until") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || since > until) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  // RLS garante que o usuário só gera PDF das contas dele
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, ad_account_id, objetivo")
    .eq("id", sp.get("client_id"))
    .single();
  if (!client) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  // Filtro opcional vindo do dashboard (campanha, conjunto ou anúncio)
  const focusType = sp.get("focus_type");
  const focusIds = (sp.get("focus_ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  const focus: Focus | null =
    focusType && focusIds.length && ["campaign", "adset", "ad"].includes(focusType)
      ? { type: focusType as Focus["type"], ids: focusIds }
      : null;
  const focusNames = sp.getAll("focus_name").map((s) => s.trim()).filter(Boolean);
  const kind = focus?.type === "adset" ? ["Conjunto", "conjuntos"] : focus?.type === "ad" ? ["Anúncio", "anúncios"] : ["Campanha", "campanhas"];
  const scopeLabel = focus
    ? focus.ids.length === 1 && focusNames[0]
      ? `${kind[0]}: ${focusNames[0]}`
      : `${focus.ids.length} ${kind[1]} selecionad${focus.type === "ad" ? "os" : "as"}`
    : null;

  const range = { since, until };
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  try {
    const r = await collectReport({
      client,
      range,
      prevRange: previousRange(range),
      periodLabel: since === until ? d(since) : `${d(since)} a ${d(until)}`,
      compareLabel: "período anterior",
      deltaSuffix: "vs período anterior",
      objetivoOverride: (sp.get("objetivo") as Objetivo) ?? null,
      focus,
      scopeLabel,
    });
    if (r.skipped) return NextResponse.json({ error: focus ? `${r.reason} para o filtro escolhido` : r.reason }, { status: 400 });
    const pdf = await buildReportPdf(r.data);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Relatorio_${client.name.replace(/[^\w]+/g, "_")}${focus ? "_" + (focusNames.length === 1 ? focusNames[0] : kind[1]).normalize("NFD").replace(/[^\w]+/g, "_").slice(0, 40) : ""}_${since}_${until}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
