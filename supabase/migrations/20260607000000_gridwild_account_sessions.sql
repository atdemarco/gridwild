create extension if not exists pgcrypto;

create table if not exists public.gridwild_account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.gridwild_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists gridwild_account_sessions_account_idx
  on public.gridwild_account_sessions(account_id);

create index if not exists gridwild_account_sessions_expires_idx
  on public.gridwild_account_sessions(expires_at);
