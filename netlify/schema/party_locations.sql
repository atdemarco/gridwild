alter table public.parties
  add column if not exists starts_at timestamptz,
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists target integer not null default 10,
  add column if not exists location_mode text not null default 'anywhere',
  add column if not exists location_user_id text,
  add column if not exists location_label text,
  add column if not exists location_config jsonb not null default '{}'::jsonb,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.parties
  drop constraint if exists parties_location_mode_check;

alter table public.parties
  add constraint parties_location_mode_check
  check (location_mode in ('anywhere', 'user', 'location'));

create index if not exists parties_public_location_idx
  on public.parties (visibility, status, location_mode);
