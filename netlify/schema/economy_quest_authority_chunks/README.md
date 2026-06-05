# Economy and Quest Authority Migration

Run the numbered SQL files in order. Every file ends at a complete SQL
statement boundary, so a failed file can be corrected and rerun without
repasting earlier files.

`04_issue_quest_function.sql` and `08_complete_quest_function.sql` are longer
than 100 lines because each `create or replace function ... as $$ ... $$;`
block is one indivisible PostgreSQL statement. Do not split or partially run
either file.

For a dashboard-free deployment, the complete migration is also available at:

`supabase/migrations/20260604000000_economy_quest_authority.sql`

From the repository root:

```powershell
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

The project reference is the identifier in the Supabase dashboard URL. The
CLI may also prompt for the database password when linking.
