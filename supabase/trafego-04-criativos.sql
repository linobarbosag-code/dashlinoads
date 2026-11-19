-- =====================================================
-- CENTRAL DE TRÁFEGO — arte dos anúncios
-- Rodar depois de trafego-03-recargas.sql. Já aplicado em produção em 18/11/2026.
-- =====================================================

create table trafego_criativos (
  ad_id text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  anuncio text,
  campanha text,
  tipo text not null default 'outro' check (tipo in ('imagem','video','outro')),
  imagem_url text,
  video_url text,
  miniatura_url text,
  link_instagram text,
  link_previa text,
  titulo text,
  texto text,
  status_veiculacao text,
  atualizado_em timestamptz not null default now()
);
comment on table trafego_criativos is 'Arte de cada anúncio com gasto recente: imagem, vídeo (quando a Meta libera o arquivo), miniatura e links. As URLs de mídia da Meta expiram; a coleta renova a cada hora.';
create index trafego_criativos_cliente_idx on trafego_criativos (client_id);
alter table trafego_criativos enable row level security;
create policy "admin le criativos" on trafego_criativos for select using (is_admin());

-- trafego_clientes passa a expor também o identificador do grupo de WhatsApp
create or replace view trafego_clientes with (security_invoker = true) as
select c.id as client_id, c.name as cliente, c.ad_account_id as conta_anuncio, c.objetivo,
  m.verba_diaria, m.orcamento_mensal, m.meta_custo_resultado, m.meta_cpc, m.meta_roas,
  coalesce(m.grupo_whatsapp, ns.group_name) as grupo_whatsapp, m.observacoes,
  m.valor_recarga_padrao,
  ns.group_id as grupo_whatsapp_id
from clients c
left join trafego_metas m on m.client_id = c.id
left join notification_settings ns on ns.client_id = c.id
where c.active and coalesce(m.monitorar, true);
