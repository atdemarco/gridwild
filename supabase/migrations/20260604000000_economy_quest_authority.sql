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

alter table public.gridwild_store_items enable row level security;
alter table public.gridwild_rewarded_quest_evidence enable row level security;
alter table public.gridwild_economy_ledger enable row level security;
alter table public.gridwild_player_inat_accounts enable row level security;
alter table public.gridwild_verified_observations enable row level security;
alter table public.gridwild_verified_achievements enable row level security;
alter table public.gridwild_quest_issuance enable row level security;

revoke all on table public.gridwild_store_items
  from public, anon, authenticated;
revoke all on table public.gridwild_rewarded_quest_evidence
  from public, anon, authenticated;
revoke all on table public.gridwild_economy_ledger
  from public, anon, authenticated;
revoke all on table public.gridwild_player_inat_accounts
  from public, anon, authenticated;
revoke all on table public.gridwild_verified_observations
  from public, anon, authenticated;
revoke all on table public.gridwild_verified_achievements
  from public, anon, authenticated;
revoke all on table public.gridwild_quest_issuance
  from public, anon, authenticated;

revoke insert, update, delete on table public.players
  from anon, authenticated;
revoke insert, update, delete on table public.quests
  from anon, authenticated;
revoke insert, update, delete on table public.player_quests
  from anon, authenticated;
revoke insert, update, delete on table public.quest_evidence
  from anon, authenticated;
revoke insert, update, delete on table public.player_achievements
  from anon, authenticated;
revoke insert, update, delete on table public.player_inventory
  from anon, authenticated;
revoke insert, update, delete on table public.player_equipment
  from anon, authenticated;

create or replace function public.gridwild_issue_quest(
  p_player_id uuid,
  p_title text,
  p_description text,
  p_quest_type text,
  p_recipe jsonb,
  p_source text,
  p_reward_wildpoints integer,
  p_issuance_key text,
  p_niche_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_existing public.quests%rowtype;
  v_quest public.quests%rowtype;
  v_count integer;
  v_reward integer;
begin
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found.';
  end if;

  if p_source not in ('manual', 'today', 'onboarding', 'local_niche', 'patch') then
    raise exception 'Quest source is not allowed.';
  end if;

  if coalesce(trim(p_issuance_key), '') = '' then
    raise exception 'Quest issuance key is required.';
  end if;

  if p_source = 'local_niche' and p_niche_id is null then
    raise exception 'Local niche quest requires a niche.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text || ':quest-issue', 0));

  select q.*
  into v_existing
  from public.gridwild_quest_issuance issuance
  join public.quests q on q.id = issuance.quest_id
  where issuance.player_id = p_player_id
    and issuance.issuance_channel = p_source
    and issuance.issuance_key = p_issuance_key
    and (
      p_source in ('onboarding', 'local_niche')
      or issuance.issued_on = v_today
    )
  order by issuance.issued_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'already_issued', true,
      'quest', to_jsonb(v_existing)
    );
  end if;

  select count(*)
  into v_count
  from public.gridwild_quest_issuance
  where player_id = p_player_id
    and issuance_channel = p_source
    and issued_on = v_today;

  if p_source = 'today' and v_count >= 7 then
    raise exception 'Daily quest issuance limit reached.';
  end if;
  if p_source = 'local_niche' and v_count >= 3 then
    raise exception 'Daily local-niche quest issuance limit reached.';
  end if;
  if p_source = 'patch' and v_count >= 5 then
    raise exception 'Daily patch quest issuance limit reached.';
  end if;
  if p_source = 'manual' and v_count >= 20 then
    raise exception 'Daily manual quest issuance limit reached.';
  end if;
  if p_source = 'onboarding' and exists (
    select 1
    from public.gridwild_quest_issuance
    where player_id = p_player_id
      and issuance_channel = 'onboarding'
  ) then
    raise exception 'Onboarding quest has already been issued.';
  end if;

  v_reward := case p_source
    when 'manual' then 0
    when 'onboarding' then 100
    when 'today' then least(250, greatest(0, coalesce(p_reward_wildpoints, 0)))
    when 'local_niche' then least(200, greatest(0, coalesce(p_reward_wildpoints, 0)))
    when 'patch' then least(150, greatest(0, coalesce(p_reward_wildpoints, 0)))
    else 0
  end;

  insert into public.quests (
    title,
    description,
    quest_type,
    reward_wildpoints,
    recipe,
    source,
    created_by,
    is_active,
    niche_id
  )
  values (
    left(coalesce(nullif(trim(p_title), ''), 'Untitled Quest'), 180),
    left(p_description, 1200),
    left(coalesce(nullif(trim(p_quest_type), ''), 'explore'), 40),
    v_reward,
    coalesce(p_recipe, '{}'::jsonb),
    p_source,
    p_player_id,
    true,
    p_niche_id
  )
  returning * into v_quest;

  insert into public.gridwild_quest_issuance (
    player_id,
    issuance_channel,
    issuance_key,
    issued_on,
    quest_id
  )
  values (
    p_player_id,
    p_source,
    p_issuance_key,
    v_today,
    v_quest.id
  );

  return jsonb_build_object(
    'already_issued', false,
    'quest', to_jsonb(v_quest)
  );
end;
$$;

create or replace function public.gridwild_refresh_verified_achievements(
  p_player_id uuid
)
returns setof public.gridwild_verified_achievements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.gridwild_verified_achievements (
    player_id,
    achievement_id,
    unlocked,
    progress,
    target,
    achieved_at,
    source,
    updated_at
  )
  with stats as (
    select
      count(*) filter (where taxonomy_text ~* '\m(fly|diptera)\M')::integer as fly_count,
      count(*) filter (where taxonomy_text ~* '\m(fern|polypodiopsida)\M')::integer as fern_count,
      count(*) filter (where taxonomy_text ~* '\m(beetle|coleoptera)\M')::integer as beetle_count,
      count(*) filter (where taxonomy_text ~* '\mlichen\M')::integer as lichen_count,
      count(*) filter (
        where observed_local_hour is not null
          and (observed_local_hour >= 21 or observed_local_hour < 5)
      )::integer as night_count
    from public.gridwild_verified_observations
    where player_id = p_player_id
  ),
  rows as (
    select 'fly_obs_25'::text as achievement_id, fly_count as progress, 25 as target from stats
    union all
    select 'fern_obs_25', fern_count, 25 from stats
    union all
    select 'beetle_obs_25', beetle_count, 25 from stats
    union all
    select 'lichen_obs_25', lichen_count, 25 from stats
    union all
    select 'night_10', night_count, 10 from stats
  )
  select
    p_player_id,
    rows.achievement_id,
    rows.progress >= rows.target,
    rows.progress,
    rows.target,
    case when rows.progress >= rows.target then now() else null end,
    'server_verified_inat',
    now()
  from rows
  on conflict (player_id, achievement_id) do update
  set
    unlocked = excluded.unlocked,
    progress = excluded.progress,
    target = excluded.target,
    achieved_at = case
      when gridwild_verified_achievements.achieved_at is not null
        then gridwild_verified_achievements.achieved_at
      else excluded.achieved_at
    end,
    source = excluded.source,
    updated_at = now();

  return query
  select verified.*
  from public.gridwild_verified_achievements verified
  where verified.player_id = p_player_id
  order by verified.achievement_id;
end;
$$;

create or replace function public.gridwild_purchase_store_item(
  p_player_id uuid,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.gridwild_store_items%rowtype;
  v_player public.players%rowtype;
  v_inventory public.player_inventory%rowtype;
begin
  select *
  into v_item
  from public.gridwild_store_items
  where item_id = p_item_id
    and is_active = true;

  if not found then
    raise exception 'Store item is not available.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Player not found.';
  end if;

  select *
  into v_inventory
  from public.player_inventory
  where player_id = p_player_id
    and item_id = p_item_id;

  if found then
    return jsonb_build_object(
      'already_owned', true,
      'price_paid', 0,
      'player', to_jsonb(v_player),
      'inventory_item', to_jsonb(v_inventory)
    );
  end if;

  if v_item.requires_achievement is not null and not exists (
    select 1
    from public.gridwild_verified_achievements
    where player_id = p_player_id
      and achievement_id = v_item.requires_achievement
      and unlocked = true
  ) then
    raise exception 'Required achievement is not unlocked.';
  end if;

  if coalesce(v_player.wildpoints, 0) < v_item.price then
    raise exception 'Not enough Wild Points.';
  end if;

  update public.players
  set wildpoints = coalesce(wildpoints, 0) - v_item.price
  where id = p_player_id
  returning * into v_player;

  insert into public.player_inventory (player_id, item_id)
  values (p_player_id, p_item_id)
  returning * into v_inventory;

  insert into public.gridwild_economy_ledger (
    player_id,
    wildpoints_delta,
    reason,
    reference_id,
    balance_after,
    metadata
  )
  values (
    p_player_id,
    -v_item.price,
    'store_purchase',
    p_item_id,
    coalesce(v_player.wildpoints, 0),
    jsonb_build_object('item_id', p_item_id)
  );

  return jsonb_build_object(
    'already_owned', false,
    'price_paid', v_item.price,
    'player', to_jsonb(v_player),
    'inventory_item', to_jsonb(v_inventory)
  );
end;
$$;

create or replace function public.gridwild_set_owned_equipment(
  p_player_id uuid,
  p_slot text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.gridwild_store_items%rowtype;
  v_equipment public.player_equipment%rowtype;
begin
  if p_slot not in ('title', 'frame', 'trail', 'companion', 'hat') then
    raise exception 'Invalid equipment slot.';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found.';
  end if;

  if p_item_id is not null then
    select *
    into v_item
    from public.gridwild_store_items
    where item_id = p_item_id
      and is_active = true;

    if not found then
      raise exception 'Store item is not available.';
    end if;

    if v_item.slot <> p_slot then
      raise exception 'Item does not belong in that equipment slot.';
    end if;

    if not exists (
      select 1
      from public.player_inventory
      where player_id = p_player_id
        and item_id = p_item_id
    ) then
      raise exception 'Item is not owned.';
    end if;
  end if;

  insert into public.player_equipment (
    player_id,
    title,
    frame,
    trail,
    companion,
    hat,
    updated_at
  )
  values (
    p_player_id,
    case when p_slot = 'title' then p_item_id else null end,
    case when p_slot = 'frame' then p_item_id else null end,
    case when p_slot = 'trail' then p_item_id else null end,
    case when p_slot = 'companion' then p_item_id else null end,
    case when p_slot = 'hat' then p_item_id else null end,
    now()
  )
  on conflict (player_id) do update
  set
    title = case when p_slot = 'title' then excluded.title else player_equipment.title end,
    frame = case when p_slot = 'frame' then excluded.frame else player_equipment.frame end,
    trail = case when p_slot = 'trail' then excluded.trail else player_equipment.trail end,
    companion = case when p_slot = 'companion' then excluded.companion else player_equipment.companion end,
    hat = case when p_slot = 'hat' then excluded.hat else player_equipment.hat end,
    updated_at = now()
  returning * into v_equipment;

  return jsonb_build_object('equipment', to_jsonb(v_equipment));
end;
$$;

create or replace function public.gridwild_complete_quest(
  p_player_id uuid,
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quest public.quests%rowtype;
  v_player_quest public.player_quests%rowtype;
  v_player public.players%rowtype;
  v_required_text text;
  v_required integer;
  v_evidence_count integer;
  v_consumed_count integer;
  v_reward integer;
  v_channel text;
  v_identification boolean;
  v_niche_observation_count integer;
begin
  select *
  into v_quest
  from public.quests
  where id = p_quest_id;

  if not found then
    raise exception 'Quest not found.';
  end if;

  if coalesce(v_quest.reward_wildpoints, 0) > 0 and v_quest.created_by is distinct from p_player_id then
    raise exception 'Reward-bearing quests can only be completed by the explorer they were issued to.';
  end if;

  if coalesce(v_quest.reward_wildpoints, 0) > 0 and not exists (
    select 1
    from public.gridwild_quest_issuance issuance
    where issuance.player_id = p_player_id
      and issuance.quest_id = p_quest_id
  ) then
    raise exception 'Reward-bearing quest was not issued by the GridWild quest authority.';
  end if;

  select *
  into v_player_quest
  from public.player_quests
  where player_id = p_player_id
    and quest_id = p_quest_id
  for update;

  if not found then
    raise exception 'Quest must be accepted before it can be completed.';
  end if;

  if v_player_quest.rewarded_at is not null then
    select *
    into v_player
    from public.players
    where id = p_player_id;

    return jsonb_build_object(
      'already_rewarded', true,
      'reward', 0,
      'evidence_count', 0,
      'required_evidence', 0,
      'player_quest', to_jsonb(v_player_quest),
      'player', to_jsonb(v_player)
    );
  end if;

  if coalesce(v_player_quest.status, '') not in ('active', 'paused') then
    raise exception 'Quest must be active or paused before it can be completed.';
  end if;

  v_required_text := coalesce(
    nullif(v_quest.recipe ->> 'quantity', ''),
    nullif(v_quest.recipe ->> 'targetCount', ''),
    nullif(v_quest.recipe ->> 'requiredObservationCount', ''),
    '1'
  );

  if v_required_text ~ '^[0-9]+$' then
    v_required := least(100, greatest(1, v_required_text::integer));
  else
    v_required := 1;
  end if;

  v_identification :=
    lower(coalesce(v_quest.quest_type, '')) = 'identify'
    or coalesce(v_quest.recipe ->> 'objectiveType', '') = 'identify_unknowns'
    or coalesce(v_quest.recipe ->> 'evidence', '') = 'identification'
    or coalesce(v_quest.recipe ->> 'evidenceType', '') = 'identification';

  v_channel := case
    when v_quest.source = 'today' then 'daily'
    when coalesce(v_quest.recipe ->> 'surveyId', 'none') <> 'none' then 'survey'
    else 'codex'
  end;

  select count(distinct qe.obs_id)
  into v_evidence_count
  from public.quest_evidence qe
  where qe.player_id = p_player_id
    and qe.quest_id = p_quest_id
    and qe.obs_id is not null
    and qe.status = 'verified'
    and qe.verification_status = 'verified'
    and (
      (
        v_identification
        and qe.source = 'identification'
        and qe.evidence_type = 'identification'
      )
      or (
        not v_identification
        and qe.source = 'inat_observation'
        and qe.evidence_type = 'observation'
      )
    )
    and not exists (
      select 1
      from public.gridwild_rewarded_quest_evidence consumed
      where consumed.player_id = p_player_id
        and consumed.evidence_channel = v_channel
        and consumed.obs_id = qe.obs_id
    );

  if v_evidence_count < v_required then
    raise exception 'Quest needs % qualifying evidence item(s); % available.', v_required, v_evidence_count;
  end if;

  insert into public.gridwild_rewarded_quest_evidence (
    player_id,
    reward_quest_id,
    evidence_channel,
    obs_id
  )
  select
    p_player_id,
    p_quest_id,
    v_channel,
    candidates.obs_id
  from (
    select distinct on (qe.obs_id)
      qe.obs_id,
      qe.claimed_at
    from public.quest_evidence qe
    where qe.player_id = p_player_id
      and qe.quest_id = p_quest_id
      and qe.obs_id is not null
      and qe.status = 'verified'
      and qe.verification_status = 'verified'
      and (
        (
          v_identification
          and qe.source = 'identification'
          and qe.evidence_type = 'identification'
        )
        or (
          not v_identification
          and qe.source = 'inat_observation'
          and qe.evidence_type = 'observation'
        )
      )
      and not exists (
        select 1
        from public.gridwild_rewarded_quest_evidence consumed
        where consumed.player_id = p_player_id
          and consumed.evidence_channel = v_channel
          and consumed.obs_id = qe.obs_id
      )
    order by qe.obs_id, qe.claimed_at asc nulls last
  ) candidates
  order by candidates.claimed_at asc nulls last
  limit v_required
  on conflict do nothing;

  get diagnostics v_consumed_count = row_count;
  if v_consumed_count < v_required then
    raise exception 'Quest evidence was already used by another reward.';
  end if;

  v_reward := case
    when v_quest.source = 'today'
      then least(250, greatest(0, coalesce(v_quest.reward_wildpoints, 0)))
    when v_quest.source = 'onboarding'
      then least(100, greatest(0, coalesce(v_quest.reward_wildpoints, 0)))
    when v_quest.source = 'local_niche'
      then least(200, greatest(0, coalesce(v_quest.reward_wildpoints, 0)))
    when v_quest.source = 'patch'
      then least(150, greatest(0, coalesce(v_quest.reward_wildpoints, 0)))
    else 0
  end;

  update public.player_quests
  set
    status = 'completed',
    completed_at = now(),
    rewarded_at = now()
  where player_id = p_player_id
    and quest_id = p_quest_id
  returning * into v_player_quest;

  update public.players
  set wildpoints = coalesce(wildpoints, 0) + v_reward
  where id = p_player_id
  returning * into v_player;

  if not found then
    raise exception 'Player not found.';
  end if;

  insert into public.gridwild_economy_ledger (
    player_id,
    wildpoints_delta,
    reason,
    reference_id,
    balance_after,
    metadata
  )
  values (
    p_player_id,
    v_reward,
    'quest_reward',
    p_quest_id::text,
    coalesce(v_player.wildpoints, 0),
    jsonb_build_object(
      'quest_id', p_quest_id,
      'required_evidence', v_required,
      'evidence_channel', v_channel
    )
  );

  update public.player_state
  set
    active_quest_id = null,
    updated_at = now()
  where player_id = p_player_id
    and active_quest_id = p_quest_id;

  if v_quest.quest_type = 'sample_niche' and v_quest.niche_id is not null then
    v_niche_observation_count := case
      when coalesce(v_quest.recipe ->> 'requiredObservationCount', '') ~ '^[0-9]+$'
        then greatest(0, (v_quest.recipe ->> 'requiredObservationCount')::integer)
      when coalesce(v_quest.recipe ->> 'quantity', '') ~ '^[0-9]+$'
        then greatest(0, (v_quest.recipe ->> 'quantity')::integer)
      else 0
    end;

    update public.local_niches
    set
      quest_completion_count = coalesce(quest_completion_count, 0) + 1,
      observations_generated_count = coalesce(observations_generated_count, 0) + v_niche_observation_count,
      last_validated_at = now(),
      status = 'active',
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'last_completion_quest_id', v_quest.id,
        'last_completion_player_id', p_player_id,
        'last_productive', true
      )
    where id = v_quest.niche_id;
  end if;

  return jsonb_build_object(
    'already_rewarded', false,
    'reward', v_reward,
    'evidence_count', v_evidence_count,
    'required_evidence', v_required,
    'player_quest', to_jsonb(v_player_quest),
    'player', to_jsonb(v_player)
  );
end;
$$;

revoke all on function public.gridwild_purchase_store_item(uuid, text)
  from public, anon, authenticated;
revoke all on function public.gridwild_set_owned_equipment(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.gridwild_complete_quest(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.gridwild_issue_quest(uuid, text, text, text, jsonb, text, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.gridwild_refresh_verified_achievements(uuid)
  from public, anon, authenticated;

grant execute on function public.gridwild_purchase_store_item(uuid, text)
  to service_role;
grant execute on function public.gridwild_set_owned_equipment(uuid, text, text)
  to service_role;
grant execute on function public.gridwild_complete_quest(uuid, uuid)
  to service_role;
grant execute on function public.gridwild_issue_quest(uuid, text, text, text, jsonb, text, integer, text, uuid)
  to service_role;
grant execute on function public.gridwild_refresh_verified_achievements(uuid)
  to service_role;
