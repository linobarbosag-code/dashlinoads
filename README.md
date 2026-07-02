# Dashboard Multi-Cliente — LinoADS × Meta Marketing API

Portal onde cada cliente da agência faz login com email e senha e vê os resultados das próprias campanhas (Meta Ads), com dados puxados direto da Marketing API.

## Stack

- Next.js 14 (App Router) + Tailwind
- Supabase (Auth + Postgres + RLS)
- Meta Marketing API v21.0
- Deploy: Vercel (cron nativo) ou Railway

## Decisão de arquitetura mais importante

**Os clientes NÃO se conectam ao Facebook.** Quem se conecta é a agência, uma única vez, via **System User Token** do seu Business Manager. Motivos:

1. Token de System User não expira (diferente do token de usuário, que dura 60 dias).
2. O cliente não precisa ter acesso ao Gerenciador de Negócios. Ele loga no SEU dashboard com email/senha.
3. Um único token com permissão `ads_read` sobre todas as contas de anúncio que o BM da LinoADS administra.

O vínculo cliente ↔ dados é feito no banco: cada cliente tem um `ad_account_id` (ex: `act_1234567890`) e o RLS do Supabase garante que ele só enxerga a própria conta.

## Sobre "tempo real"

A Insights API da Meta tem defasagem natural de 15 min a algumas horas (a própria Meta consolida os dados). A estratégia aqui:

- **Cron a cada 15 min** sincroniza insights de todas as contas ativas para a tabela `insights_cache`.
- O dashboard lê do cache (instantâneo) e tem botão "Atualizar agora" que força chamada direta à API.
- Isso também protege contra rate limit (a Meta limita chamadas por conta/app).

## Setup

### 1. Meta (uma vez só)

1. Crie um app em developers.facebook.com → tipo **Business**.
2. Adicione o produto **Marketing API**.
3. No Business Manager: Configurações → Usuários do sistema → criar System User (função Admin).
4. Atribua ao System User as contas de anúncio dos clientes (ativo → conta de anúncio → permissão de visualizar desempenho).
5. Gere o token com escopos `ads_read` e `business_management`. Marque "nunca expira".
6. Guarde o token em `META_SYSTEM_TOKEN` (variável de ambiente, nunca no código).

### 2. Supabase

1. Crie o projeto e rode `supabase/schema.sql` no SQL Editor.
2. Crie os usuários dos clientes em Authentication → Users (ou via convite por email).
3. Insira em `clients` o vínculo: `user_id` do auth + `ad_account_id` da Meta.

### 3. Projeto

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

### 4. Cron (Vercel)

O arquivo `vercel.json` já agenda `/api/cron/sync` a cada 15 min. Defina `CRON_SECRET` nas variáveis de ambiente.

## Estrutura

```
├── supabase/schema.sql          # Tabelas + RLS
├── lib/meta.ts                  # Cliente da Marketing API
├── lib/supabase/                # Clients server/browser
├── middleware.ts                # Proteção de rotas por sessão
├── app/
│   ├── login/page.tsx           # Login email/senha
│   ├── (dashboard)/dashboard/   # Painel do cliente
│   └── api/
│       ├── insights/route.ts    # Insights sob demanda (respeita RLS)
│       └── cron/sync/route.ts   # Sync periódico de todas as contas
└── components/                  # KPIs, tabela de campanhas, gráfico
```

## Papéis

- **admin** (você e sua equipe): vê todas as contas, alterna entre clientes.
- **client**: vê apenas a própria conta de anúncio. Sem acesso a custo interno da agência, só métricas de mídia.

## Métricas entregues por padrão

Investimento, impressões, cliques, CTR, CPC, CPM, leads/conversões (via `actions`), custo por resultado — por dia e por campanha, últimos 7/14/30 dias ou período customizado.
