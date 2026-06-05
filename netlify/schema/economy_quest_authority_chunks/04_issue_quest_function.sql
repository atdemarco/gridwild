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

  if p_source not in ('manual', 'today', 'onboarding', 'local_niche') then
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

