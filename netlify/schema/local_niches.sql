create extension if not exists pgcrypto;

create table if not exists public.local_niches (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  title text not null,
  short_title text,
  description text,
  niche_type text not null,
  theme text,
  centroid_lat double precision not null,
  centroid_lng double precision not null,
  geometry jsonb,
  grid_cell_ids text[] default '{}',
  radius_m integer default 75,
  scale_level text default 'walking-radius',
  taxon_focus jsonb,
  seasonal_profile jsonb,
  evidence_summary jsonb default '{}'::jsonb,
  metrics jsonb default '{}'::jsonb,
  confidence numeric default 0,
  novelty_score numeric default 0,
  sampling_need_score numeric default 0,
  biodiversity_score numeric default 0,
  questability_score numeric default 0,
  place_context jsonb default '{}'::jsonb,
  primary_place_label text,
  secondary_place_label text,
  place_label_confidence numeric default 0,
  generated_by text default 'gridwild_local_niche_generator_v1',
  created_by_user_id uuid references public.players(id) on delete set null,
  visibility text default 'public',
  status text default 'active',
  visits_count integer default 0,
  quest_completion_count integer default 0,
  observations_generated_count integer default 0,
  taxa_found jsonb default '[]'::jsonb,
  last_validated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists local_niches_centroid_idx
  on public.local_niches(centroid_lat, centroid_lng);

create index if not exists local_niches_status_visibility_idx
  on public.local_niches(status, visibility);

create index if not exists local_niches_source_key_idx
  on public.local_niches(source_key);

create table if not exists public.local_niche_comments (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.local_niches(id) on delete cascade,
  user_id uuid references public.players(id) on delete set null,
  comment_text text not null,
  comment_type text default 'general_comment',
  created_at timestamptz default now()
);

create index if not exists local_niche_comments_niche_id_idx
  on public.local_niche_comments(niche_id, created_at desc);

create table if not exists public.local_niche_stewards (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.local_niches(id) on delete cascade,
  user_id uuid not null references public.players(id) on delete cascade,
  stewardship_type text not null default 'home',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id),
  unique(niche_id, user_id)
);

create index if not exists local_niche_stewards_niche_id_idx
  on public.local_niche_stewards(niche_id, created_at asc);

create index if not exists local_niche_stewards_user_id_idx
  on public.local_niche_stewards(user_id);

alter table if exists public.quests
  add column if not exists niche_id uuid references public.local_niches(id) on delete set null;

create index if not exists quests_niche_id_idx
  on public.quests(niche_id);

create or replace function public.set_local_niches_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists local_niches_updated_at on public.local_niches;

create trigger local_niches_updated_at
before update on public.local_niches
for each row
execute function public.set_local_niches_updated_at();

drop trigger if exists local_niche_stewards_updated_at on public.local_niche_stewards;

create trigger local_niche_stewards_updated_at
before update on public.local_niche_stewards
for each row
execute function public.set_local_niches_updated_at();
