# GridWild Supabase Migrations

Apply database changes through this directory with:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

Do not paste partial function bodies into the SQL editor. PostgreSQL
`create or replace function ... as $$ ... $$;` blocks are single statements.

This migration folder now covers all loose schema files currently present in
`netlify/schema` and `supabase/sql`, but it is not yet a complete greenfield
baseline for the remote database. See `docs/supabase-schema-inventory.md` for
remote tables that still need real DDL capture.
