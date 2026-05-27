create table if not exists public.player_presence (
  player_id uuid primary key references public.players(id) on delete cascade,
  lat double precision,
  lng double precision,
  accuracy_meters double precision,
  heading double precision,
  visibility text not null default 'hidden',
  status text not null default 'offline',
  last_seen_at timestamptz,
  last_logout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_presence_visibility_check
    check (visibility in ('visible', 'hidden')),
  constraint player_presence_status_check
    check (status in ('online', 'offline'))
);

create index if not exists player_presence_visible_recent_idx
  on public.player_presence (visibility, status, last_seen_at desc, last_logout_at desc);

create index if not exists player_presence_location_idx
  on public.player_presence (lat, lng)
  where visibility = 'visible';

create or replace function public.set_player_presence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists player_presence_updated_at on public.player_presence;

create trigger player_presence_updated_at
before update on public.player_presence
for each row
execute function public.set_player_presence_updated_at();
