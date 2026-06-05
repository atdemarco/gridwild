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

