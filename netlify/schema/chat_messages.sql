create extension if not exists pgcrypto;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_type text not null,
  room_id uuid not null,
  sender_player_id uuid not null references public.players(id) on delete cascade,
  message_type text not null default 'text',
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_type_check
    check (message_type in ('text', 'location', 'share')),
  constraint chat_messages_body_length_check
    check (char_length(coalesce(body, '')) <= 500)
);

alter table public.chat_messages
  drop constraint if exists chat_messages_type_check;

alter table public.chat_messages
  add constraint chat_messages_type_check
    check (message_type in ('text', 'location', 'share'));

create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room_type, room_id, created_at desc);

create index if not exists chat_messages_sender_idx
  on public.chat_messages (sender_player_id, created_at desc);
