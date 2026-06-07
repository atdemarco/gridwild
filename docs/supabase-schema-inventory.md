# Supabase Schema Inventory

Generated during the migration hygiene pass on 2026-06-04.

## What Is Now In Migrations

Loose schema files now have ordered migration coverage:

| Source file                                                  | Migration                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `netlify/schema/economy_quest_authority.sql`                 | `supabase/migrations/20260604000000_economy_quest_authority.sql`                         |
| `supabase/sql/extend_quest_evidence_for_identifications.sql` | `supabase/migrations/20260604001000_extend_quest_evidence_and_legacy_local_issuance.sql` |
| `netlify/schema/gridwild_accounts.sql`                       | `supabase/migrations/20260604002000_gridwild_accounts.sql`                               |
| GridWild account multi-device sessions                       | `supabase/migrations/20260607000000_gridwild_account_sessions.sql`                       |
| `netlify/schema/player_presence.sql`                         | `supabase/migrations/20260604003000_player_presence.sql`                                 |
| `netlify/schema/party_locations.sql`                         | `supabase/migrations/20260604004000_party_locations.sql`                                 |
| `netlify/schema/local_niches.sql`                            | `supabase/migrations/20260604005000_local_niches.sql`                                    |
| `netlify/schema/chat_messages.sql`                           | `supabase/migrations/20260604006000_chat_messages.sql`                                   |
| `supabase/sql/create_grid_asset_tables.sql`                  | `supabase/migrations/20260604007000_grid_asset_tables.sql`                               |
| Legacy local-niche issuance backfill                         | `supabase/migrations/20260604008000_backfill_legacy_local_niche_quest_issuance.sql`      |

## Remote Objects Not Yet Represented By Local DDL

Supabase type generation against the linked remote project showed these public
tables exist remotely but are not defined by local schema files or migrations:

- `campaigns`
- `field_stations`
- `party_events`
- `party_evidence`
- `party_members`
- `party_route_points`
- `player_achievements`
- `player_equipment`
- `player_inventory`
- `player_quests`
- `player_state`
- `player_surveys`
- `players`
- `surveys`

These should be captured from the real database with `pg_dump`/`supabase db dump`
before treating this repo as a complete greenfield database baseline.

## Current Limitation

`npx supabase gen types typescript --linked --schema public` was enough to
inventory remote tables, columns, relationships, and RPCs. It does not fully
capture indexes, triggers, policies, comments, defaults, grants, or exact
constraint definitions.

`npx supabase db dump --linked --schema public` would provide a real DDL dump,
but on this Windows machine the Supabase CLI requires Docker for that command.
Use Docker Desktop or a machine with `pg_dump` available to create the missing
baseline migrations.
