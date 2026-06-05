create extension if not exists pgcrypto;

create table if not exists public.player_interactions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending',
  sender_player_id uuid not null references public.players(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete cascade,
  room_id uuid,
  party_id uuid,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  read_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_interactions_type_check
    check (type in ('chat_request', 'party_invite', 'party_join_request')),
  constraint player_interactions_status_check
    check (status in ('pending', 'accepted', 'declined', 'dismissed', 'expired')),
  constraint player_interactions_distinct_players_check
    check (sender_player_id <> recipient_player_id)
);

create index if not exists player_interactions_recipient_status_idx
  on public.player_interactions (recipient_player_id, status, created_at desc);

create index if not exists player_interactions_sender_status_idx
  on public.player_interactions (sender_player_id, status, created_at desc);

create index if not exists player_interactions_room_idx
  on public.player_interactions (room_id)
  where room_id is not null;

create index if not exists player_interactions_party_idx
  on public.player_interactions (party_id, status, created_at desc)
  where party_id is not null;

create table if not exists public.player_blocks (
  blocker_player_id uuid not null references public.players(id) on delete cascade,
  blocked_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_player_id, blocked_player_id),
  constraint player_blocks_distinct_players_check
    check (blocker_player_id <> blocked_player_id)
);

create index if not exists player_blocks_blocked_idx
  on public.player_blocks (blocked_player_id, created_at desc);
