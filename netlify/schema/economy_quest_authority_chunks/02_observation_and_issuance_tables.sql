create table if not exists public.gridwild_player_inat_accounts (
  player_id uuid primary key references public.players(id) on delete cascade,
  inat_user_id bigint not null unique,
  inat_login text not null,
  linked_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, inat_user_id)
);

create table if not exists public.gridwild_verified_observations (
  player_id uuid not null references public.players(id) on delete cascade,
  obs_id text not null,
  inat_user_id bigint not null,
  observed_at timestamptz,
  observed_local_hour integer check (observed_local_hour between 0 and 23),
  iconic_taxon text,
  taxon_name text,
  common_name text,
  taxonomy_text text not null default '',
  quality_grade text,
  latitude double precision,
  longitude double precision,
  positional_accuracy double precision,
  photo_count integer not null default 0,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, obs_id),
  foreign key (player_id, inat_user_id)
    references public.gridwild_player_inat_accounts(player_id, inat_user_id)
    on delete cascade
);

create index if not exists gridwild_verified_observations_player_verified_idx
  on public.gridwild_verified_observations(player_id, verified_at desc);

create table if not exists public.gridwild_verified_achievements (
  player_id uuid not null references public.players(id) on delete cascade,
  achievement_id text not null,
  unlocked boolean not null default false,
  progress integer not null default 0,
  target integer not null default 1,
  achieved_at timestamptz,
  achieved_where jsonb,
  source text not null default 'server_verified_inat',
  updated_at timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

create table if not exists public.gridwild_quest_issuance (
  player_id uuid not null references public.players(id) on delete cascade,
  issuance_channel text not null,
  issuance_key text not null,
  issued_on date not null,
  quest_id uuid not null unique references public.quests(id) on delete cascade,
  issued_at timestamptz not null default now(),
  primary key (player_id, issuance_channel, issuance_key, issued_on)
);

create index if not exists gridwild_quest_issuance_player_day_idx
  on public.gridwild_quest_issuance(player_id, issuance_channel, issued_on);

