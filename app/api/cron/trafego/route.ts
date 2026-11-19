// app/api/cron/trafego/route.ts
// Alimenta a Central de Tráfego (tabelas trafego_*), lida pelos agentes.
// A cada hora grava, por conta ativa:
//   - métricas por dia, por campanha e por anúncio (últimos 3 dias, para pegar a consolidação da Meta);
//   - a situação da conta: status, saldo e anúncios reprovados.
// Só leitura na Meta. Usa service role e valida CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getAccountInfo,
  getCreativeMedia,
  getDailyByLevel,
  getInsights,
  listEntities,
  detectObjetivo,
  resultCount,
  extractConversionValue,
  RESULT_META,
  type MetaInsight,
  type Obj,
  type Range,
} from "@/lib/meta-v2";

export const maxDuration = 300;

const DIAS_REPROCESSADOS = 3;
const PAUSA_ENTRE_CONTAS_MS = 1500;
const DIAS_HISTORICO = 100;
const HISTORICOS_POR_EXECUCAO = 3;

/** Data local (America/Campo_Grande, UTC-4 sem horário de verão), deslocada em dias. */
function dataLocal(deslocamentoDias = 0): string {
  const d = new Date(Date.now() - 4 * 3600e3 + deslocamentoDias * 86400e3);
  return d.toISOString().slice(0, 10);
}

// account_status da Meta: 1 ativa, 2 desativada, 3 não quitada, 7 em análise de risco,
// 8 quitação pendente, 9 período de carência, 100 fechamento pendente, 101 fechada.
function statusConta(codigo: number): string {
  if (codigo === 1) return "ativa";
  if (codigo === 2) return "desativada";
  if (codigo === 3 || codigo === 8 || codigo === 9) return "pagamento_pendente";
  if (codigo === 7) return "em_analise";
  if (codigo === 100 || codigo === 101) return "encerrada";
  return "outro";
}

const num = (v: unknown) => Number(v || 0);

function linhaMetrica(
  i: MetaInsight,
  clientId: string,
  nivel: "campanha" | "anuncio",
  objetivo: Obj,
  statusPorAnuncio: Map<string, string>
) {
  const entidadeId = nivel === "campanha" ? i.campaign_id : i.ad_id;
  if (!entidadeId) return null;
  return {
    data: i.date_start,
    client_id: clientId,
    nivel,
    entidade_id: entidadeId,
    campanha: i.campaign_name ?? null,
    conjunto: nivel === "anuncio" ? i.adset_name ?? null : null,
    anuncio: nivel === "anuncio" ? i.ad_name ?? null : null,
    status_veiculacao: nivel === "anuncio" ? statusPorAnuncio.get(entidadeId) ?? null : null,
    gasto: num(i.spend),
    impressoes: num(i.impressions),
    alcance: i.reach != null ? num(i.reach) : null,
    frequencia: i.frequency != null ? num(i.frequency) : null,
    cliques_link: num(i.inline_link_clicks),
    resultados: resultCount(i, objetivo),
    tipo_resultado: RESULT_META[objetivo].resultKey,
    valor_compras: extractConversionValue(i),
    coletado_em: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const hoje = dataLocal(0);
  const janela: Range = { since: dataLocal(-DIAS_REPROCESSADOS), until: hoje };

  const { data: coleta } = await db.from("trafego_coletas").insert({}).select("id").single();

  const { data: clients, error: erroClientes } = await db
    .from("clients")
    .select("id, name, ad_account_id, objetivo")
    .eq("active", true);
  if (erroClientes) {
    return NextResponse.json({ error: erroClientes.message }, { status: 500 });
  }

  const { data: marcas } = await db
    .from("trafego_metas")
    .select("client_id")
    .not("historico_carregado_em", "is", null);
  const comHistorico = new Set((marcas ?? []).map((m: { client_id: string }) => m.client_id));
  let historicosNestaExecucao = 0;

  const erros: Record<string, string> = {};
  const avisos: Record<string, string> = {};
  let ok = 0;

  for (const client of clients ?? []) {
    try {
      // 1) Situação da conta e anúncios reprovados
      const info = await getAccountInfo(client.ad_account_id);
      const anuncios = await listEntities(client.ad_account_id, "ads");
      const statusPorAnuncio = new Map(anuncios.map((a) => [a.id, a.status]));
      const reprovados = anuncios.filter((a) => a.status === "DISAPPROVED");
      const comProblema = anuncios.filter((a) => a.status === "WITH_ISSUES");
      const afetados = [...reprovados, ...comProblema].slice(0, 5).map((a) => a.name).join("; ");

      const { error: erroConta } = await db.from("trafego_contas").upsert(
        {
          data: hoje,
          client_id: client.id,
          status_conta: statusConta(info.accountStatus),
          status_codigo: info.accountStatus,
          pre_pago: info.isPrepaid,
          saldo_disponivel: info.available,
          valor_em_aberto: info.balance,
          moeda: info.currency,
          anuncios_reprovados: reprovados.length,
          anuncios_com_problema: comProblema.length,
          anuncios_afetados: afetados || null,
          coletado_em: new Date().toISOString(),
        },
        { onConflict: "data,client_id" }
      );
      if (erroConta) throw new Error(`trafego_contas: ${erroConta.message}`);

      // 2) Objetivo: o cadastrado ou, em "auto", o detectado no total da janela
      let objetivo: Obj;
      if (client.objetivo && client.objetivo !== "auto") {
        objetivo = client.objetivo as Obj;
      } else {
        const [total] = await getInsights(client.ad_account_id, janela, "account");
        objetivo = total ? detectObjetivo(total) : "leads";
      }

      // 3) Métricas por dia, por campanha e por anúncio
      const porCampanha = await getDailyByLevel(client.ad_account_id, janela, "campaign");
      const porAnuncio = await getDailyByLevel(client.ad_account_id, janela, "ad");
      const linhas = [
        ...porCampanha.map((i) => linhaMetrica(i, client.id, "campanha", objetivo, statusPorAnuncio)),
        ...porAnuncio.map((i) => linhaMetrica(i, client.id, "anuncio", objetivo, statusPorAnuncio)),
      ].filter(Boolean);

      for (let i = 0; i < linhas.length; i += 500) {
        const { error: erroMetricas } = await db
          .from("trafego_metricas")
          .upsert(linhas.slice(i, i + 500), { onConflict: "data,client_id,nivel,entidade_id" });
        if (erroMetricas) throw new Error(`trafego_metricas: ${erroMetricas.message}`);
      }

      // 3b) Arte dos anúncios com gasto na janela (imagem, vídeo, miniatura e links).
      //     Falha aqui não invalida a coleta da conta: fica registrada como aviso.
      try {
        const idsComGasto = Array.from(
          new Set(porAnuncio.filter((i) => num(i.spend) > 0 && i.ad_id).map((i) => i.ad_id as string))
        );
        const nomes = new Map(porAnuncio.map((i) => [i.ad_id as string, i]));
        const midias = await getCreativeMedia(idsComGasto);
        const criativos = idsComGasto.map((id) => ({
          ad_id: id,
          client_id: client.id,
          anuncio: nomes.get(id)?.ad_name ?? null,
          campanha: nomes.get(id)?.campaign_name ?? null,
          tipo: midias[id]?.tipo ?? "outro",
          imagem_url: midias[id]?.imagem ?? null,
          video_url: midias[id]?.video ?? null,
          miniatura_url: midias[id]?.miniatura ?? null,
          link_instagram: midias[id]?.permalink ?? null,
          link_previa: midias[id]?.previewLink ?? null,
          titulo: midias[id]?.titulo ?? null,
          texto: midias[id]?.texto ?? null,
          status_veiculacao: midias[id]?.status ?? null,
          atualizado_em: new Date().toISOString(),
        }));
        if (criativos.length) {
          const { error: erroCriativos } = await db.from("trafego_criativos").upsert(criativos, { onConflict: "ad_id" });
          if (erroCriativos) throw new Error(erroCriativos.message);
        }
      } catch (err: any) {
        avisos[client.name ?? client.ad_account_id] = `criativos: ${err?.message ?? String(err)}`;
      }

      // 4) Histórico de 100 dias (só campanha), uma vez por cliente e poucas contas por execução.
      //    É a base da média de 90 dias usada como referência no diagnóstico.
      if (!comHistorico.has(client.id) && historicosNestaExecucao < HISTORICOS_POR_EXECUCAO) {
        historicosNestaExecucao++;
        const antigo: Range = { since: dataLocal(-DIAS_HISTORICO), until: dataLocal(-DIAS_REPROCESSADOS - 1) };
        const historico = (await getDailyByLevel(client.ad_account_id, antigo, "campaign"))
          .map((i) => linhaMetrica(i, client.id, "campanha", objetivo, statusPorAnuncio))
          .filter(Boolean);
        for (let i = 0; i < historico.length; i += 500) {
          const { error: erroHistorico } = await db
            .from("trafego_metricas")
            .upsert(historico.slice(i, i + 500), { onConflict: "data,client_id,nivel,entidade_id" });
          if (erroHistorico) throw new Error(`histórico: ${erroHistorico.message}`);
        }
        const { error: erroMarca } = await db
          .from("trafego_metas")
          .upsert({ client_id: client.id, historico_carregado_em: new Date().toISOString() }, { onConflict: "client_id" });
        if (erroMarca) throw new Error(`trafego_metas: ${erroMarca.message}`);
      }
      ok++;
    } catch (err: any) {
      // Uma conta com erro ou rate limit não derruba as outras
      erros[client.name ?? client.ad_account_id] = err?.message ?? String(err);
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONTAS_MS));
  }

  if (coleta?.id) {
    await db
      .from("trafego_coletas")
      .update({
        fim: new Date().toISOString(),
        contas_ok: ok,
        contas_com_erro: Object.keys(erros).length,
        erros:
          Object.keys(erros).length || Object.keys(avisos).length
            ? { ...erros, ...(Object.keys(avisos).length ? { avisos } : {}) }
            : null,
      })
      .eq("id", coleta.id);
  }

  return NextResponse.json({ contas_ok: ok, erros, avisos });
}
