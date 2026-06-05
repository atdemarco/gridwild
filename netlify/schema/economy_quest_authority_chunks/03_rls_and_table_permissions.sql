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

