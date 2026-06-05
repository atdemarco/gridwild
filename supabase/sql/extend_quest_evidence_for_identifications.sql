-- GridWild quest evidence extension for identification quests.
-- Keeps existing observation evidence intact while allowing evidence rows to
-- describe observations, identifications, or future external proof types.

alter table if exists public.quest_evidence
  add column if not exists evidence_type text not null default 'observation',
  add column if not exists target_type text not null default 'observation',
  add column if not exists target_id text,
  add column if not exists external_id text,
  add column if not exists confidence text,
  add column if not exists verification_status text not null default 'claimed',
  add column if not exists payload jsonb not null default '{}'::jsonb;

update public.quest_evidence
set
  evidence_type = coalesce(nullif(evidence_type, ''), source, 'observation'),
  target_type = coalesce(nullif(target_type, ''), 'observation'),
  target_id = coalesce(nullif(target_id, ''), obs_id::text),
  verification_status = coalesce(nullif(verification_status, ''), status, 'claimed')
where target_id is null
   or evidence_type is null
   or target_type is null
   or verification_status is null;

update public.quest_evidence
set target_type = 'observation'
where target_type = 'inat_observation';

update public.quest_evidence
set target_type = 'external'
where target_type not in ('observation', 'identification', 'draft', 'external');

do $$
begin
  if to_regclass('public.quest_evidence') is not null and not exists (
    select 1 from pg_constraint where conname = 'quest_evidence_type_check'
  ) then
    alter table public.quest_evidence
      add constraint quest_evidence_type_check
      check (evidence_type in ('observation', 'identification', 'draft', 'manual'));
  end if;

  if to_regclass('public.quest_evidence') is not null and not exists (
    select 1 from pg_constraint where conname = 'quest_evidence_target_type_check'
  ) then
    alter table public.quest_evidence
      add constraint quest_evidence_target_type_check
      check (target_type in ('observation', 'identification', 'draft', 'external'));
  end if;

  if to_regclass('public.quest_evidence') is not null and not exists (
    select 1 from pg_constraint where conname = 'quest_evidence_confidence_check'
  ) then
    alter table public.quest_evidence
      add constraint quest_evidence_confidence_check
      check (confidence is null or confidence in ('coarse', 'likely', 'careful', 'expert'));
  end if;
end $$;

create index if not exists quest_evidence_type_idx
  on public.quest_evidence (player_id, quest_id, evidence_type, status);

create index if not exists quest_evidence_target_idx
  on public.quest_evidence (target_type, target_id);

create table if not exists public.identification_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  quest_id uuid,
  observation_id text not null,
  observation_uri text,
  taxon_id integer not null,
  taxon_name text not null,
  taxon_common_name text,
  confidence text not null default 'coarse'
    check (confidence in ('coarse', 'likely', 'careful', 'expert')),
  source text not null default 'gridwild',
  status text not null default 'claimed'
    check (status in ('claimed', 'submitted', 'verified', 'rejected')),
  external_identification_id text,
  submitted_at timestamptz,
  claimed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists identification_claims_player_quest_observation_idx
  on public.identification_claims (player_id, quest_id, observation_id)
  where quest_id is not null;

create index if not exists identification_claims_player_status_idx
  on public.identification_claims (player_id, status, claimed_at desc);

comment on table public.identification_claims is
  'GridWild identification evidence claims. A row may be local-only, pending iNaturalist submission, or linked to an external iNaturalist identification id.';

comment on column public.quest_evidence.evidence_type is
  'High-level evidence family: observation, identification, draft, or manual.';

comment on column public.quest_evidence.payload is
  'Typed evidence metadata such as taxon_id, confidence, observation URI, adapter result, or future verification details.';
