-- =====================================================
-- CENTRAL DE TRÁFEGO
-- Base que os agentes (Coletor, Vigia, Relatórios, Suporte) leem e escrevem.
-- Rodar uma vez no SQL Editor do Supabase do dashboard, depois de schema.sql.
-- Quem grava métricas e contas é a rota /api/cron/trafego (service role).
-- =====================================================

-- Configurações e limites (só o gestor edita)
create table trafego_config (
  chave text primary key,
  valor text,
  descricao text,
  updated_at timestamptz not null default now()
);

insert into trafego_config (chave, valor, descricao) values
  ('agencia', 'LINOADS', 'Nome que o Suporte usa ao se apresentar.'),
  ('gestor_nome', 'Lino', 'Nome citado quando o Suporte passa um assunto para o gestor.'),
  ('gestor_whatsapp', null, 'PREENCHER. Número que recebe o diagnóstico diário e os rascunhos. Formato 55 + DDD + número.'),
  ('modo_suporte', 'rascunho', 'rascunho = o Suporte manda a resposta sugerida só para o gestor. ativo = responde direto no grupo.'),
  ('horario_suporte', 'seg-sex 08:00-18:00', 'Fora desse horário o Suporte só registra a pergunta.'),
  ('limite_gasto_diario_pct', '1.2', 'FORA se o gasto de ontem passar de 120% da verba diária. Padrão sugerido; ajuste.'),
  ('limite_subentrega_pct', '0.5', 'ATENÇÃO se o gasto de ontem ficar abaixo de 50% da verba diária. Padrão sugerido; ajuste.'),
  ('limite_custo_pct', '1.3', 'FORA se o custo por resultado de 7 dias passar de 130% da meta. Padrão sugerido; ajuste.'),
  ('limite_cpc_pct', '1.3', 'FORA se o CPC de 7 dias passar de 130% da meta de CPC. Padrão sugerido; ajuste.'),
  ('saldo_minimo_dias', '2', 'ATENÇÃO se o saldo pré-pago cobrir menos que esse número de dias de verba. Padrão sugerido; ajuste.'),
  ('limite_orcamento_mensal_pct', '1.1', 'FORA se a projeção de gasto do mês passar de 110% do orçamento mensal. Padrão sugerido; ajuste.'),
  ('coleta_atraso_horas', '3', 'FORA se a conta não for consultada com sucesso há mais que esse número de horas.');

-- Metas de cada cliente (uma linha por cliente; o cadastro em si continua em clients)
create table trafego_metas (
  client_id uuid primary key references clients(id) on delete cascade,
  monitorar boolean not null default true,
  verba_diaria numeric(12,2),
  orcamento_mensal numeric(12,2),
  meta_custo_resultado numeric(12,2),
  meta_cpc numeric(12,2),
  meta_roas numeric(8,2),
  grupo_whatsapp text,
  observacoes text,
  updated_at timestamptz not null default now()
);
comment on table trafego_metas is 'Metas e limites por cliente. grupo_whatsapp é o nome exato do grupo usado pelo agente Suporte.';

-- Métricas por dia, por campanha e por anúncio (gravadas pela rota /api/cron/trafego)
create table trafego_metricas (
  id bigint generated always as identity primary key,
  data date not null,
  client_id uuid not null references clients(id) on delete cascade,
  nivel text not null check (nivel in ('campanha','anuncio')),
  entidade_id text not null,
  campanha text,
  conjunto text,
  anuncio text,
  status_veiculacao text,
  gasto numeric(12,2) not null default 0,
  impressoes bigint not null default 0,
  alcance bigint,
  frequencia numeric(8,2),
  cliques_link bigint not null default 0,
  resultados numeric(12,2) not null default 0,
  tipo_resultado text,
  valor_compras numeric(12,2),
  coletado_em timestamptz not null default now(),
  unique (data, client_id, nivel, entidade_id)
);
comment on table trafego_metricas is 'Uma linha por campanha e por anúncio, por dia. Para somar gasto e resultados use só nivel = campanha.';
create index trafego_metricas_cliente_data_idx on trafego_metricas (client_id, data);

-- Foto diária da conta de anúncio
create table trafego_contas (
  id bigint generated always as identity primary key,
  data date not null,
  client_id uuid not null references clients(id) on delete cascade,
  status_conta text not null check (status_conta in ('ativa','desativada','pagamento_pendente','em_analise','encerrada','outro')),
  status_codigo integer,
  pre_pago boolean,
  saldo_disponivel numeric(12,2),
  valor_em_aberto numeric(12,2),
  moeda text,
  anuncios_reprovados integer not null default 0,
  anuncios_com_problema integer not null default 0,
  anuncios_afetados text,
  coletado_em timestamptz not null default now(),
  unique (data, client_id)
);
comment on table trafego_contas is 'Situação e saldo da conta por dia. saldo_disponivel só vale para conta pré-paga; valor_em_aberto é gasto ainda não faturado.';

-- Registro de cada execução da coleta
create table trafego_coletas (
  id bigint generated always as identity primary key,
  inicio timestamptz not null default now(),
  fim timestamptz,
  contas_ok integer not null default 0,
  contas_com_erro integer not null default 0,
  erros jsonb
);
comment on table trafego_coletas is 'Uma linha por execução de /api/cron/trafego. erros = {conta: mensagem}.';

-- Alertas (gravados pelo agente Vigia; o gestor marca resolvido)
create table trafego_alertas (
  id bigint generated always as identity primary key,
  data_hora timestamptz not null default now(),
  client_id uuid not null references clients(id) on delete cascade,
  tipo text not null check (tipo in (
    'sem_coleta','conta_restrita','sem_saldo','saldo_baixo','anuncio_reprovado','gasto_zero',
    'gasto_acima_da_verba','subentrega','custo_acima_da_meta','cpc_acima_da_meta','orcamento_mensal')),
  gravidade text not null check (gravidade in ('alta','media','baixa')),
  onde text,
  descricao text,
  valor_atual numeric(12,2),
  limite numeric(12,2),
  status text not null default 'aberto' check (status in ('aberto','resolvido')),
  resolvido_em timestamptz,
  observacao text
);
create index trafego_alertas_cliente_status_idx on trafego_alertas (client_id, status);

-- Atendimentos (gravados pelo agente Suporte)
create table trafego_atendimentos (
  id bigint generated always as identity primary key,
  data_hora timestamptz not null default now(),
  client_id uuid not null references clients(id) on delete cascade,
  grupo text,
  quem_perguntou text,
  pergunta text not null,
  resposta text,
  escalado text not null default 'nao' check (escalado in ('sim','nao')),
  status text not null default 'rascunho' check (status in ('rascunho','respondido','aguardando gestor','resolvido')),
  observacao text
);
create index trafego_atendimentos_cliente_status_idx on trafego_atendimentos (client_id, status);

-- Leituras semanais (gravadas pelo agente Relatórios, para o gestor)
create table trafego_relatorios (
  id bigint generated always as identity primary key,
  semana_inicio date not null,
  semana_fim date not null,
  client_id uuid not null references clients(id) on delete cascade,
  investimento numeric(12,2),
  resultados numeric(12,2),
  custo_resultado numeric(12,2),
  variacao_custo_pct numeric(8,4),
  texto text,
  status text not null default 'rascunho' check (status in ('rascunho','aprovado','enviado')),
  created_at timestamptz not null default now(),
  unique (semana_inicio, client_id)
);

-- RLS: escrita só com service role; leitura também para admin logado no dashboard.
alter table trafego_config enable row level security;
alter table trafego_metas enable row level security;
alter table trafego_metricas enable row level security;
alter table trafego_contas enable row level security;
alter table trafego_coletas enable row level security;
alter table trafego_alertas enable row level security;
alter table trafego_atendimentos enable row level security;
alter table trafego_relatorios enable row level security;

create policy "admin le config" on trafego_config for select using (is_admin());
create policy "admin le metas" on trafego_metas for select using (is_admin());
create policy "admin le metricas" on trafego_metricas for select using (is_admin());
create policy "admin le contas" on trafego_contas for select using (is_admin());
create policy "admin le coletas" on trafego_coletas for select using (is_admin());
create policy "admin le alertas" on trafego_alertas for select using (is_admin());
create policy "admin le atendimentos" on trafego_atendimentos for select using (is_admin());
create policy "admin le relatorios" on trafego_relatorios for select using (is_admin());

-- Clientes monitorados, com as metas ao lado (o que os agentes consultam)
create view trafego_clientes with (security_invoker = true) as
select c.id as client_id, c.name as cliente, c.ad_account_id as conta_anuncio, c.objetivo,
  m.verba_diaria, m.orcamento_mensal, m.meta_custo_resultado, m.meta_cpc, m.meta_roas,
  coalesce(m.grupo_whatsapp, ns.group_name) as grupo_whatsapp, m.observacoes
from clients c
left join trafego_metas m on m.client_id = c.id
left join notification_settings ns on ns.client_id = c.id
where c.active and coalesce(m.monitorar, true);

-- Diagnóstico diário: uma linha por cliente e por item, dizendo se está dentro ou fora de ordem.
create view trafego_diagnostico with (security_invoker = true) as
with hoje as (select (now() at time zone 'America/Campo_Grande')::date as d),
cfg as (
  select
    (select valor::numeric from trafego_config where chave = 'limite_gasto_diario_pct') as lim_gasto,
    (select valor::numeric from trafego_config where chave = 'limite_subentrega_pct') as lim_sub,
    (select valor::numeric from trafego_config where chave = 'limite_custo_pct') as lim_custo,
    (select valor::numeric from trafego_config where chave = 'limite_cpc_pct') as lim_cpc,
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
  select c.client_id, c.cliente, c.verba_diaria, c.meta_custo_resultado, c.meta_cpc, c.orcamento_mensal,
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
          when b.verba_diaria is not null and b.saldo_disponivel < b.verba_diaria * b.saldo_dias then 'atencao'
          else 'ok' end,
     b.saldo_disponivel, b.verba_diaria * b.saldo_dias,
     case when not b.coleta_em_dia then null
          when b.pre_pago is distinct from true then 'Conta pós-paga: não depende de saldo.'
          when b.saldo_disponivel is null then 'A Meta não informou o saldo.'
          when b.saldo_disponivel <= 0 then 'Conta sem saldo.'
          when b.verba_diaria > 0 then 'Saldo cobre cerca de ' || round(b.saldo_disponivel / b.verba_diaria, 1)::text || ' dia(s) de verba.'
          else 'Verba diária não cadastrada: não dá para estimar os dias de saldo.' end),
  (4, 'anúncios reprovados ou com problema',
     case when not b.coleta_em_dia then 'sem dado'
          when b.anuncios_reprovados > 0 then 'FORA'
          when b.anuncios_com_problema > 0 then 'atencao'
          else 'ok' end,
     (coalesce(b.anuncios_reprovados, 0) + coalesce(b.anuncios_com_problema, 0))::numeric, 0::numeric,
     b.anuncios_afetados),
  (5, 'gasto de ontem x verba diária',
     case when b.verba_diaria is null then 'sem dado'
          when b.gasto_ontem = 0 then 'FORA'
          when b.gasto_ontem > b.verba_diaria * b.lim_gasto then 'FORA'
          when b.gasto_ontem < b.verba_diaria * b.lim_sub then 'atencao'
          else 'ok' end,
     b.gasto_ontem, b.verba_diaria,
     case when b.verba_diaria is null then 'Verba diária não cadastrada.'
          when b.gasto_ontem = 0 then 'Nenhum gasto ontem.'
          when b.gasto_ontem > b.verba_diaria * b.lim_gasto then 'Gastou acima da verba diária.'
          when b.gasto_ontem < b.verba_diaria * b.lim_sub then 'Gastou bem abaixo da verba diária.'
          else null end),
  (6, 'custo por resultado (7 dias)',
     case when b.meta_custo_resultado is null or b.gasto_7d = 0 then 'sem dado'
          when b.resultados_7d = 0 then 'FORA'
          when b.gasto_7d / b.resultados_7d > b.meta_custo_resultado * b.lim_custo then 'FORA'
          when b.gasto_7d / b.resultados_7d > b.meta_custo_resultado then 'atencao'
          else 'ok' end,
     round(b.gasto_7d / nullif(b.resultados_7d, 0), 2), b.meta_custo_resultado,
     case when b.meta_custo_resultado is null then 'Meta de custo por resultado não cadastrada.'
          when b.gasto_7d > 0 and b.resultados_7d = 0 then 'Houve gasto e nenhum resultado em 7 dias.'
          else null end),
  (7, 'CPC do link (7 dias)',
     case when b.meta_cpc is null or b.cliques_7d = 0 then 'sem dado'
          when b.gasto_7d / b.cliques_7d > b.meta_cpc * b.lim_cpc then 'FORA'
          when b.gasto_7d / b.cliques_7d > b.meta_cpc then 'atencao'
          else 'ok' end,
     round(b.gasto_7d / nullif(b.cliques_7d, 0), 2), b.meta_cpc,
     case when b.meta_cpc is null then 'Meta de CPC não cadastrada.' else null end),
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
comment on view trafego_diagnostico is 'Checagem por cliente monitorado. situacao = ok, atencao, FORA ou sem dado. Só leitura.';

-- Painel: resumo de 7 dias por cliente
create view trafego_painel with (security_invoker = true) as
with hoje as (select (now() at time zone 'America/Campo_Grande')::date as d),
m as (
  select mt.client_id,
    sum(mt.gasto) as gasto_7d, sum(mt.resultados) as resultados_7d,
    sum(mt.cliques_link) as cliques_7d, sum(mt.valor_compras) as valor_7d
  from trafego_metricas mt cross join hoje h
  where mt.nivel = 'campanha' and mt.data >= h.d - 7 and mt.data < h.d
  group by mt.client_id
)
select c.client_id, c.cliente, c.objetivo,
  coalesce(m.gasto_7d, 0) as gasto_7d,
  coalesce(m.resultados_7d, 0) as resultados_7d,
  round(m.gasto_7d / nullif(m.resultados_7d, 0), 2) as custo_resultado_7d,
  c.meta_custo_resultado,
  round(m.gasto_7d / nullif(m.cliques_7d, 0), 2) as cpc_7d,
  c.meta_cpc,
  round(m.valor_7d / nullif(m.gasto_7d, 0), 2) as roas_7d,
  (select count(*) from trafego_diagnostico d where d.client_id = c.client_id and d.situacao = 'FORA') as itens_fora,
  (select count(*) from trafego_diagnostico d where d.client_id = c.client_id and d.situacao = 'atencao') as itens_atencao,
  (select count(*) from trafego_alertas a where a.client_id = c.client_id and a.status = 'aberto') as alertas_abertos,
  (select count(*) from trafego_atendimentos t where t.client_id = c.client_id and t.status = 'aguardando gestor') as atend_aguardando_gestor
from trafego_clientes c
left join m on m.client_id = c.client_id
order by c.cliente;
comment on view trafego_painel is 'Resumo dos últimos 7 dias fechados por cliente monitorado. Só leitura.';
