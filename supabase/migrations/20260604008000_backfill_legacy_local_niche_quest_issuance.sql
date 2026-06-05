-- Existing local-niche quests created before the authority ledger are still
-- server-generated, capped sample quests. Backfill only that narrow class so
-- old local quest rows can complete without authorizing arbitrary old rewards.

insert into public.gridwild_quest_issuance (
  player_id,
  issuance_channel,
  issuance_key,
  issued_on,
  quest_id,
  issued_at
)
select
  q.created_by,
  'local_niche',
  'legacy-local-niche:' || q.id::text,
  coalesce(q.created_at::date, (timezone('utc', now()))::date),
  q.id,
  coalesce(q.created_at, now())
from public.quests q
where q.created_by is not null
  and q.source = 'local_niche'
  and q.quest_type = 'sample_niche'
  and q.niche_id is not null
  and coalesce(q.reward_wildpoints, 0) > 0
  and coalesce(q.reward_wildpoints, 0) <= 200
  and not exists (
    select 1
    from public.gridwild_quest_issuance issuance
    where issuance.quest_id = q.id
  )
on conflict do nothing;
