create extension if not exists pgcrypto;

create table if not exists public.draft_observations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  client_draft_id text not null,
  status text not null default 'draft',
  observed_at timestamptz,
  location jsonb default '{}'::jsonb,
  notes text,
  captive_cultivated text,
  suggested_id jsonb default '{}'::jsonb,
  photos jsonb default '[]'::jsonb,
  primary_photo_id text,
  handoff jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, client_draft_id)
);

create index if not exists draft_observations_player_updated_idx
  on public.draft_observations(player_id, client_updated_at desc, updated_at desc);

create index if not exists draft_observations_status_idx
  on public.draft_observations(player_id, status);

create or replace function public.set_draft_observations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists draft_observations_updated_at on public.draft_observations;

create trigger draft_observations_updated_at
before update on public.draft_observations
for each row
execute function public.set_draft_observations_updated_at();
