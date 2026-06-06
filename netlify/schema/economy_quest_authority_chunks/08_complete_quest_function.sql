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
