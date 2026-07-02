-- =====================================================
-- SCHEMA: Dashboard multi-cliente LinoADS
-- Rodar no SQL Editor do Supabase
-- =====================================================

-- Perfis (espelha auth.users, define papel)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz default now()
);

-- Clientes da agência (1 cliente pode ter N usuários e N contas)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,                      -- ex: 'Autobel', 'Donacon Saúde'
  ad_account_id text not null unique,      -- ex: 'act_1234567890'
  currency text default 'BRL',
  active boolean default true,
  created_at timestamptz default now()
);

-- Vínculo usuário ↔ cliente
create table public.client_users (
  user_id uuid references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- Cache de insights (alimentado pelo cron a cada 15 min)
create table public.insights_cache (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients(id) on delete cascade,
  level text not null check (level in ('account', 'campaign')),
  campaign_id text,                        -- null quando level = 'account'
  campaign_name text,
  date_start date not null,
  date_stop date not null,
  spend numeric(12,2) default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  ctr numeric(8,4) default 0,
  cpc numeric(10,4) default 0,
  cpm numeric(10,4) default 0,
  results bigint default 0,                -- leads / compras / conversas
  result_type text,                        -- ex: 'lead', 'purchase', 'messaging'
  cost_per_result numeric(10,4),
  raw jsonb,                               -- resposta completa da Meta p/ auditoria
  synced_at timestamptz default now(),
  unique (client_id, level, campaign_id, date_start, date_stop)
);

create index idx_insights_client_date on public.insights_cache (client_id, date_start desc);

-- =====================================================
-- RLS: cada cliente só enxerga o que é dele
-- =====================================================

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.insights_cache enable row level security;

-- Helper: usuário é admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles: cada um vê o próprio; admin vê todos
create policy "own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- clients: cliente vê os que estão vinculados a ele; admin vê todos
create policy "linked clients" on public.clients
  for select using (
    public.is_admin()
    or id in (select client_id from public.client_users where user_id = auth.uid())
  );

-- client_users: só o próprio vínculo; admin vê todos
create policy "own links" on public.client_users
  for select using (user_id = auth.uid() or public.is_admin());

-- insights: mesmo critério do clients
create policy "linked insights" on public.insights_cache
  for select using (
    public.is_admin()
    or client_id in (select client_id from public.client_users where user_id = auth.uid())
  );

-- Escrita no cache: somente service_role (o cron usa a service key, que ignora RLS).
-- Nenhuma policy de insert/update para usuários = ninguém escreve via client.

-- =====================================================
-- Trigger: cria profile automaticamente ao criar usuário
-- =====================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
