# GridWild Asset Publishing

This workflow publishes generated GridWild biodiversity assets to Supabase:

- Supabase Storage holds the actual CSV and JSON files.
- Supabase Postgres holds build and superchunk metadata for lookup.
- The `service_role` key is used only from local scripts or CI, never browser code.

## 1. Create the Storage Bucket

In the Supabase dashboard:

1. Open your project.
2. Go to Storage.
3. Create a new bucket named `gridwild-assets`.
4. Make it public.

For now, a public bucket is the simplest fit because these are public map assets. Public files can later be fetched by the Netlify frontend without signed URLs.

## 2. Create the Postgres Tables

Open the Supabase SQL Editor and run:

```sql
-- From supabase/sql/create_grid_asset_tables.sql
```

Paste the contents of `supabase/sql/create_grid_asset_tables.sql` and run it. The script creates:

- `gw_asset_builds`
- `gw_superchunks`
- Helpful indexes for current-build and superchunk lookups

## 3. Configure Environment Variables

Find these values in Supabase Project Settings:

- `SUPABASE_URL`: Project Settings > API > Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Project Settings > API > service_role key

Do not expose the `service_role` key in frontend code.

For deployed Netlify functions, also add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `GRIDWILD_STORAGE_BUCKET` in Netlify Site configuration > Environment variables. The local `.env` file is only read by local scripts and local Netlify development.

You can create a local `.env` file:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
GRIDWILD_ASSET_DIR=C:\Users\ad1470\Documents\GRIDWILD_ASSETS
GRIDWILD_STORAGE_BUCKET=gridwild-assets
```

`GRIDWILD_STORAGE_BUCKET` is optional and defaults to `gridwild-assets`.

## 4. Publish Assets

From PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:GRIDWILD_ASSET_DIR="C:\Users\ad1470\Documents\GRIDWILD_ASSETS"
npm.cmd run publish:grid-assets
```

From Git Bash:

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
GRIDWILD_ASSET_DIR="/c/Users/ad1470/Documents/GRIDWILD_ASSETS" \
npm run publish:grid-assets
```

Or, if `.env` is populated:

```bash
npm run publish:grid-assets
```

The script uploads files under a build-specific prefix:

```text
builds/<manifest.build_id>/manifest.json
builds/<manifest.build_id>/dc_heat.csv
builds/<manifest.build_id>/observer_dictionary.json
builds/<manifest.build_id>/squares_genus_summary.json
builds/<manifest.build_id>/square_genera_superchunks/super_123_456.json
```

The script is safe to rerun for the same build. It overwrites Storage objects and upserts Postgres rows.

## 5. Verify

In Supabase Table Editor or SQL Editor:

```sql
select build_id, is_current, n_superchunks, asset_root
from public.gw_asset_builds
order by created_at desc;
```

```sql
select count(*)
from public.gw_superchunks
where build_id = 'YOUR_BUILD_ID';
```

```sql
select build_id
from public.gw_asset_builds
where is_current = true;
```

You should see:

- One row in `gw_asset_builds` for the published build.
- One row in `gw_superchunks` per manifest superchunk.
- Exactly one current build with `is_current = true`.
- Files in Storage under `gridwild-assets/builds/<build_id>/`.

## Notes

- Keep only a few recent builds on the free Supabase plan. The current asset set is roughly 122 MB per build.
- Do not upload `square_genera_chunks/` unless the runtime needs it. The publish workflow uses the manifest's `superchunks` list.

## Frontend Runtime

The frontend loads the current build through `/.netlify/functions/get-grid-assets-build`. That function uses the server-side `SUPABASE_SERVICE_ROLE_KEY` to read `gw_asset_builds`, then returns public Storage URLs for:

- `manifest.json`
- `dc_heat.csv`
- `observer_dictionary.json`
- `squares_genus_summary.json`
- `square_genera_superchunks/`

The browser never receives the `service_role` key.

By default the browser uses Supabase assets and falls back to local `assets/` files if the catalog function is unavailable. For local development, you can force a mode with:

```text
?gwAssets=supabase
?gwAssets=local
```

You can also set a persistent browser override in DevTools:

```js
localStorage.setItem("GW_GRID_ASSET_MODE", "local");
localStorage.setItem("GW_GRID_ASSET_MODE", "supabase");
localStorage.removeItem("GW_GRID_ASSET_MODE");
```

Use `supabase` mode when you want failures to be loud instead of falling back to local static assets.
