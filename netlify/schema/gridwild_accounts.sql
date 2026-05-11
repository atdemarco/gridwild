create extension if not exists pgcrypto;

create table if not exists public.gridwild_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  player_id uuid not null unique references public.players(id) on delete cascade,
  password_hash text not null,
  password_salt text not null,
  password_iterations integer not null default 210000,
  session_token_hash text,
  session_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gridwild_accounts_player_id_idx
  on public.gridwild_accounts(player_id);

create or replace function public.set_gridwild_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gridwild_accounts_updated_at on public.gridwild_accounts;

create trigger gridwild_accounts_updated_at
before update on public.gridwild_accounts
for each row
execute function public.set_gridwild_accounts_updated_at();
