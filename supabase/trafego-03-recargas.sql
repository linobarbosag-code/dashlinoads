-- =====================================================
-- CENTRAL DE TRÁFEGO — recargas de saldo pré-pago
-- Rodar depois de trafego-02-referencia.sql. Já aplicado em produção em 18/11/2026.
-- Controle do fluxo: proposta ao gestor, aprovação, Pix gerado no Gerenciador
-- de Anúncios, envio ao cliente e confirmação do pagamento.
-- =====================================================

alter table trafego_metas add column valor_recarga_padrao numeric(12,2);
comment on column trafego_metas.valor_recarga_padrao is 'Valor que o agente de recargas propõe ao gestor quando o saldo pré-pago fica baixo.';

create table trafego_recargas (
  id bigint generated always as identity primary key,
  client_id uuid not null references clients(id) on delete cascade,
  criado_em timestamptz not null default now(),
  saldo_no_momento numeric(12,2),
  valor numeric(12,2),
  status text not null default 'proposta' check (status in ('proposta','aprovada','codigo_gerado','enviada','paga','cancelada')),
  aprovada_em timestamptz,
  codigo_pix text,
  codigo_gerado_em timestamptz,
  enviada_em timestamptz,
  paga_em timestamptz,
  observacao text
);
comment on table trafego_recargas is 'Recargas de saldo pré-pago: proposta ao gestor, aprovação, Pix gerado no Gerenciador da Meta, envio ao cliente e confirmação. Cada etapa só avança com ok do gestor.';
create index trafego_recargas_cliente_status_idx on trafego_recargas (client_id, status);
alter table trafego_recargas enable row level security;
create policy "admin le recargas" on trafego_recargas for select using (is_admin());

create or replace view trafego_clientes with (security_invoker = true) as
select c.id as client_id, c.name as cliente, c.ad_account_id as conta_anuncio, c.objetivo,
  m.verba_diaria, m.orcamento_mensal, m.meta_custo_resultado, m.meta_cpc, m.meta_roas,
  coalesce(m.grupo_whatsapp, ns.group_name) as grupo_whatsapp, m.observacoes,
  m.valor_recarga_padrao
from clients c
left join trafego_metas m on m.client_id = c.id
left join notification_settings ns on ns.client_id = c.id
where c.active and coalesce(m.monitorar, true);

-- Contas pré-pagas que precisam de recarga e ainda não têm recarga em andamento
create view trafego_recargas_pendentes with (security_invoker = true) as
select d.client_id, d.cliente, d.situacao, d.valor as saldo, d.detalhe,
  c.conta_anuncio, c.grupo_whatsapp, c.valor_recarga_padrao
from trafego_diagnostico d
join trafego_clientes c on c.client_id = d.client_id
where d.item = 'saldo da conta' and d.situacao in ('FORA', 'atencao')
  and not exists (
    select 1 from trafego_recargas r
    where r.client_id = d.client_id and r.status in ('proposta','aprovada','codigo_gerado','enviada')
  );
comment on view trafego_recargas_pendentes is 'Contas pré-pagas com saldo zerado ou baixo, sem recarga em andamento.';
