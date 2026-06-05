-- Run this migration in Supabase before deploying the matching functions.
-- Economy mutations stay behind service-role Netlify functions; clients never
-- call these RPCs directly.

create table if not exists public.gridwild_store_items (
  item_id text primary key,
  name text not null,
  slot text not null check (slot in ('title', 'frame', 'trail', 'companion', 'hat')),
  currency text not null default 'wildpoints' check (currency = 'wildpoints'),
  price integer not null check (price >= 0),
  requires_achievement text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.gridwild_store_items
  (item_id, name, slot, price, requires_achievement)
values
  ('explorer_cap', 'Explorer Cap', 'hat', 100, null),
  ('fern_crown', 'Fern Crown', 'hat', 500, null),
  ('moth_hood', 'Moth Hood', 'hat', 950, null),
  ('rain_hat', 'Rain Hat', 'hat', 180, null),
  ('professor_hat', 'Professor Hat', 'hat', 650, null),
  ('trail_scout_title', 'Title: Trail Scout', 'title', 150, null),
  ('fly_lord_title', 'Title: Fly Lord', 'title', 700, 'fly_obs_25'),
  ('fern_master_title', 'Title: Fern Master', 'title', 700, 'fern_obs_25'),
  ('night_explorer_title', 'Title: Night Explorer', 'title', 600, 'night_10'),
  ('the_lichened_one_title', 'Title: The Lichened One', 'title', 1500, 'lichen_obs_25'),
  ('brass_field_frame', 'Brass Field Frame', 'frame', 200, null),
  ('fern_border', 'Fern Border', 'frame', 520, null),
  ('beetle_carapace_frame', 'Beetle Carapace Frame', 'frame', 950, 'beetle_obs_25'),
  ('museum_label_frame', 'Museum Label Frame', 'frame', 600, null),
  ('firefly_trail', 'Firefly Trail', 'trail', 800, null),
  ('falling_leaves', 'Falling Leaves', 'trail', 350, null),
  ('spore_drift', 'Spore Drift', 'trail', 700, null),
  ('pollen_drift', 'Pollen Drift', 'trail', 650, null),
  ('moth_dust', 'Moth Dust', 'trail', 1100, 'night_10'),
  ('chickadee_companion', 'Chickadee Companion', 'companion', 450, null),
  ('luna_moth_companion', 'Luna Moth Companion', 'companion', 1200, null),
  ('jumping_spider_companion', 'Jumping Spider Companion', 'companion', 750, null),
  ('salamander_companion', 'Salamander Companion', 'companion', 850, null),
  ('fox_companion', 'Fox Companion', 'companion', 1400, null),
  ('winter_owl_pin', 'Winter Owl Pin', 'frame', 600, null),
  ('spring_ephemeral_cape', 'Spring Ephemeral Cape', 'hat', 900, null),
  ('october_moth_lantern', 'October Moth Lantern', 'companion', 1300, 'night_10'),
  ('summer_cicada_badge', 'Summer Cicada Badge', 'frame', 650, null)
on conflict (item_id) do update
set
  name = excluded.name,
  slot = excluded.slot,
  currency = excluded.currency,
  price = excluded.price,
  requires_achievement = excluded.requires_achievement,
  is_active = true,
  updated_at = now();

create table if not exists public.gridwild_rewarded_quest_evidence (
  player_id uuid not null references public.players(id) on delete cascade,
  reward_quest_id uuid not null references public.quests(id) on delete cascade,
  evidence_channel text not null,
  obs_id text not null,
  consumed_at timestamptz not null default now(),
  primary key (player_id, evidence_channel, obs_id)
);

create index if not exists gridwild_rewarded_quest_evidence_quest_idx
  on public.gridwild_rewarded_quest_evidence(reward_quest_id);

create table if not exists public.gridwild_economy_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  wildpoints_delta integer not null,
  reason text not null,
  reference_id text not null,
  balance_after integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, reason, reference_id)
);

create index if not exists gridwild_economy_ledger_player_created_idx
  on public.gridwild_economy_ledger(player_id, created_at desc);

