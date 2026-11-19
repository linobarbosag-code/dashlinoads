-- =====================================================
-- CENTRAL DE TRÁFEGO — referência de 90 dias
-- Rodar depois de trafego.sql. Já aplicado em produção em 18/11/2026.
-- O diagnóstico passa a comparar a última semana com a meta cadastrada ou,
-- na falta dela, com a média de 90 dias do próprio cliente.
-- =====================================================

alter table trafego_metas add column historico_carregado_em timestamptz;
comment on column trafego_metas.historico_carregado_em is 'Quando a rota de coleta carregou o histórico de 100 dias deste cliente.';

insert into trafego_config (chave, valor, descricao) values
  ('limite_atencao_media_pct', '1.15', 'Quando a referência é a média de 90 dias do próprio cliente: ATENÇÃO acima de 115% dela. Padrão sugerido; ajuste.');

-- Referência de cada cliente: média dos 90 dias anteriores à última semana, e mediana da carteira por objetivo.
create view trafego_referencia with (security_invoker = true) as
with hoje as (select (now() at time zone 'America/Campo_Grande')::date as d),
base as (
  select c.client_id, c.cliente, c.objetivo,
    count(distinct mt.data) filter (where mt.gasto > 0) as dias_com_gasto_90d,
    coalesce(sum(mt.gasto), 0) as gasto_90d,
    coalesce(sum(mt.resultados), 0) as resultados_90d,
    coalesce(sum(mt.cliques_link), 0) as cliques_90d,
    coalesce(sum(mt.impressoes), 0) as impressoes_90d,
    coalesce(sum(mt.gasto) filter (where mt.data >= h.d - 37), 0) as gasto_30d,
    count(distinct mt.data) filter (where mt.data >= h.d - 37 and mt.gasto > 0) as dias_com_gasto_30d
  from trafego_clientes c
  cross join hoje h
  left join trafego_metricas mt
    on mt.client_id = c.client_id and mt.nivel = 'campanha' and mt.data >= h.d - 97 and mt.data < h.d - 7
  group by c.client_id, c.cliente, c.objetivo
),
calc as (
  select base.*,
    round(gasto_90d / nullif(resultados_90d, 0), 2) as custo_resultado_90d,
    round(gasto_90d / nullif(cliques_90d, 0), 2) as cpc_90d,
    round(cliques_90d::numeric / nullif(impressoes_90d, 0) * 100, 2) as ctr_link_90d,
    round(gasto_30d / nullif(dias_com_gasto_30d, 0), 2) as gasto_diario_medio_30d
  from base
),
carteira as (
  select objetivo,
    count(custo_resultado_90d) as n_custo,
    round((percentile_cont(0.5) within group (order by custo_resultado_90d))::numeric, 2) as mediana_custo,
    count(cpc_90d) as n_cpc,
    round((percentile_cont(0.5) within group (order by cpc_90d))::numeric, 2) as mediana_cpc,
    round((percentile_cont(0.5) within group (order by ctr_link_90d))::numeric, 2) as mediana_ctr
  from calc
  group by objetivo
)
select calc.client_id, calc.cliente, calc.objetivo,
  calc.dias_com_gasto_90d, calc.gasto_90d, calc.resultados_90d,
  calc.custo_resultado_90d, calc.cpc_90d, calc.ctr_link_90d, calc.gasto_diario_medio_30d,
  case when k.n_custo >= 3 then k.mediana_custo end as carteira_custo_resultado,
  case when k.n_cpc >= 3 then k.mediana_cpc end as carteira_cpc,
  case when k.n_cpc >= 3 then k.mediana_ctr end as carteira_ctr_link,
  k.n_custo as clientes_na_comparacao
from calc
left join carteira k on k.objetivo = calc.objetivo;
comment on view trafego_referencia is 'Média de 90 dias de cada cliente (dias -97 a -8) e mediana dos seus clientes de mesmo objetivo (só com 3 ou mais). Só leitura.';

-- Diagnóstico passa a usar a meta cadastrada ou, na falta dela, a média do próprio cliente.
create or replace view trafego_diagnostico with (security_invoker = true) as
with hoje as (select (now() at time zone 'America/Campo_Grande')::date as d),
cfg as (
  select
    (select valor::numeric from trafego_config where chave = 'limite_gasto_diario_pct') as lim_gasto,
    (select valor::numeric from trafego_config where chave = 'limite_subentrega_pct') as lim_sub,
    (select valor::numeric from trafego_config where chave = 'limite_custo_pct') as lim_custo,
    (select valor::numeric from trafego_config where chave = 'limite_cpc_pct') as lim_cpc,
    (select valor::numeric from trafego_config where chave = 'limite_atencao_media_pct') as lim_media,
    (select valor::numeric from trafego_config where chave = 'saldo_minimo_dias') as saldo_dias,
    (select valor::numeric from trafego_config where chave = 'limite_orcamento_mensal_pct') as lim_mes,
    (select valor::numeric from trafego_config where chave = 'coleta_atraso_horas') as atraso_h
),
m as (
  select mt.client_id,
    sum(mt.gasto) filter (where mt.data >= h.d - 7 and mt.data < h.d) as gasto_7d,
    sum(mt.resultados) filter (where mt.data >= h.d - 7 and mt.data < h.d) as resultados_7d,
    sum(mt.cliques_link) filter (where mt.data >= h.d - 7 and mt.data < h.d) as cliques_7d,
    sum(mt.gasto) filter (where mt.data = h.d - 1) as gasto_ontem,
    sum(mt.gasto) filter (where mt.data >= date_trunc('month', (h.d - 1)::timestamp)::date and mt.data < h.d) as gasto_mes
  from trafego_metricas mt cross join hoje h
  where mt.nivel = 'campanha' and mt.data >= least(h.d - 7, date_trunc('month', (h.d - 1)::timestamp)::date)
  group by mt.client_id
),
b as (
  select c.client_id, c.cliente, c.orcamento_mensal,
    coalesce(c.verba_diaria, r.gasto_diario_medio_30d) as ref_verba,
    (c.verba_diaria is null) as verba_e_media,
    coalesce(c.meta_custo_resultado, r.custo_resultado_90d) as ref_custo,
    (c.meta_custo_resultado is null) as custo_e_media,
    coalesce(c.meta_cpc, r.cpc_90d) as ref_cpc,
    (c.meta_cpc is null) as cpc_e_media,
    r.carteira_custo_resultado, r.carteira_cpc,
    h.d, cfg.*,
    coalesce(m.gasto_7d, 0) as gasto_7d, coalesce(m.resultados_7d, 0) as resultados_7d, coalesce(m.cliques_7d, 0) as cliques_7d,
    coalesce(m.gasto_ontem, 0) as gasto_ontem, coalesce(m.gasto_mes, 0) as gasto_mes,
    ct.coletado_em as conta_coletada_em, ct.status_conta, ct.pre_pago, ct.saldo_disponivel,
    ct.anuncios_reprovados, ct.anuncios_com_problema, ct.anuncios_afetados,
    (ct.coletado_em is not null and ct.coletado_em > now() - make_interval(hours => cfg.atraso_h::int)) as coleta_em_dia,
    extract(day from (h.d - 1))::numeric as dias_corridos,
    extract(day from (date_trunc('month', (h.d - 1)::timestamp) + interval '1 month - 1 day'))::numeric as dias_no_mes
  from trafego_clientes c
  cross join hoje h cross join cfg
  left join trafego_referencia r on r.client_id = c.client_id
  left join m on m.client_id = c.client_id
  left join lateral (
    select * from trafego_contas x where x.client_id = c.client_id order by x.coletado_em desc limit 1
  ) ct on true
)
select b.client_id, b.cliente, v.ordem, v.item, v.situacao, v.valor, v.limite, v.detalhe
from b
cross join lateral (values
  (1, 'coleta',
     case when b.coleta_em_dia then 'ok' else 'FORA' end,
     null::numeric, null::numeric,
     case when b.conta_coletada_em is null then 'Conta nunca foi consultada.'
          else 'Última consulta: ' || to_char(b.conta_coletada_em at time zone 'America/Campo_Grande', 'DD/MM HH24:MI') || '.' end),
  (2, 'situação da conta',
     case when not b.coleta_em_dia then 'sem dado' when b.status_conta <> 'ativa' then 'FORA' else 'ok' end,
     null::numeric, null::numeric,
     case when b.status_conta is null then null else 'Conta ' || replace(b.status_conta, '_', ' ') || '.' end),
  (3, 'saldo da conta',
     case when not b.coleta_em_dia then 'sem dado'
          when b.pre_pago is distinct from true then 'ok'
          when b.saldo_disponivel is null then 'sem dado'
          when b.saldo_disponivel <= 0 then 'FORA'
          when b.ref_verba is not null and b.saldo_disponivel < b.ref_verba * b.saldo_dias then 'atencao'
          else 'ok' end,
     b.saldo_disponivel, round(b.ref_verba * b.saldo_dias, 2),
     case when not b.coleta_em_dia then null
          when b.pre_pago is distinct from true then 'Conta pós-paga: não depende de saldo.'
          when b.saldo_disponivel is null then 'A Meta não informou o saldo.'
          when b.saldo_disponivel <= 0 then 'Conta sem saldo.'
          when b.ref_verba > 0 then 'Saldo cobre cerca de ' || round(b.saldo_disponivel / b.ref_verba, 1)::text || ' dia(s) de gasto'
            || case when b.verba_e_media then ' (pela média diária dos últimos 30 dias).' else ' (pela verba diária cadastrada).' end
          else 'Sem verba cadastrada nem histórico para estimar os dias de saldo.' end),
  (4, 'anúncios reprovados ou com problema',
     case when not b.coleta_em_dia then 'sem dado'
          when b.anuncios_reprovados > 0 then 'FORA'
          when b.anuncios_com_problema > 0 then 'atencao'
          else 'ok' end,
     (coalesce(b.anuncios_reprovados, 0) + coalesce(b.anuncios_com_problema, 0))::numeric, 0::numeric,
     b.anuncios_afetados),
  (5, 'gasto de ontem',
     case when b.ref_verba is null or b.ref_verba = 0 then 'sem dado'
          when b.gasto_ontem = 0 then 'FORA'
          when b.gasto_ontem > b.ref_verba * b.lim_gasto then 'FORA'
          when b.gasto_ontem < b.ref_verba * b.lim_sub then 'atencao'
          else 'ok' end,
     b.gasto_ontem, b.ref_verba,
     case when b.ref_verba is null or b.ref_verba = 0 then 'Sem verba cadastrada nem histórico de gasto.'
          else case when b.gasto_ontem = 0 then 'Nenhum gasto ontem. '
                    when b.gasto_ontem > b.ref_verba * b.lim_gasto then 'Gastou acima do normal. '
                    when b.gasto_ontem < b.ref_verba * b.lim_sub then 'Gastou bem abaixo do normal. '
                    else '' end
            || case when b.verba_e_media then 'Referência: média diária dos últimos 30 dias.' else 'Referência: verba diária cadastrada.' end
          end),
  (6, 'custo por resultado (7 dias)',
     case when b.ref_custo is null or b.gasto_7d = 0 then 'sem dado'
          when b.resultados_7d = 0 then 'FORA'
          when b.gasto_7d / b.resultados_7d > b.ref_custo * b.lim_custo then 'FORA'
          when b.gasto_7d / b.resultados_7d > b.ref_custo * (case when b.custo_e_media then b.lim_media else 1 end) then 'atencao'
          else 'ok' end,
     round(b.gasto_7d / nullif(b.resultados_7d, 0), 2), b.ref_custo,
     case when b.ref_custo is null then 'Sem meta cadastrada nem histórico de 90 dias.'
          else case when b.gasto_7d > 0 and b.resultados_7d = 0 then 'Houve gasto e nenhum resultado em 7 dias. ' else '' end
            || case when b.custo_e_media then 'Referência: média de 90 dias do próprio cliente.' else 'Referência: meta cadastrada.' end
            || coalesce(' Mediana dos seus clientes de mesmo objetivo: ' || b.carteira_custo_resultado::text || '.', '')
          end),
  (7, 'CPC do link (7 dias)',
     case when b.ref_cpc is null or b.cliques_7d = 0 then 'sem dado'
          when b.gasto_7d / b.cliques_7d > b.ref_cpc * b.lim_cpc then 'FORA'
          when b.gasto_7d / b.cliques_7d > b.ref_cpc * (case when b.cpc_e_media then b.lim_media else 1 end) then 'atencao'
          else 'ok' end,
     round(b.gasto_7d / nullif(b.cliques_7d, 0), 2), b.ref_cpc,
     case when b.ref_cpc is null then 'Sem meta cadastrada nem histórico de 90 dias.'
          else case when b.cpc_e_media then 'Referência: média de 90 dias do próprio cliente.' else 'Referência: meta cadastrada.' end
            || coalesce(' Mediana dos seus clientes de mesmo objetivo: ' || b.carteira_cpc::text || '.', '')
          end),
  (8, 'orçamento do mês (projeção)',
     case when b.orcamento_mensal is null or b.dias_corridos = 0 then 'sem dado'
          when b.gasto_mes / b.dias_corridos * b.dias_no_mes > b.orcamento_mensal * b.lim_mes then 'FORA'
          when b.gasto_mes / b.dias_corridos * b.dias_no_mes > b.orcamento_mensal then 'atencao'
          else 'ok' end,
     round(b.gasto_mes / nullif(b.dias_corridos, 0) * b.dias_no_mes, 2), b.orcamento_mensal,
     case when b.orcamento_mensal is null then 'Orçamento mensal não cadastrado.'
          else 'Gasto no mês até ontem: ' || b.gasto_mes::text || '.' end)
) as v(ordem, item, situacao, valor, limite, detalhe)
order by b.cliente, v.ordem;
