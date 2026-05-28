# GridWild Asset Publishing

This workflow publishes generated GridWild biodiversity assets:

- Cloudflare R2 can hold the actual CSV and JSON files for CDN delivery.
- Supabase Storage can still be used as the legacy/default blob backend.
- Supabase Postgres holds build and superchunk metadata for lookup.
- The `service_role` key is used only from local scripts or CI, never browser code.

## 1. Create the Blob Storage Bucket

### Cloudflare R2

In the Cloudflare dashboard:

1. Go to R2 Object Storage.
2. Create a bucket named `gridwild-assets`.
3. Connect a custom domain such as `assets.gridwild.com`.
4. Add a CORS policy that allows `https://gridwild.com`, `https://www.gridwild.com`, and local development origins.
5. Add a cache rule for `assets.gridwild.com` so JSON and CSV files are eligible for cache.

R2 is the preferred backend for large public assets because it avoids sending public asset bandwidth through Supabase Storage.

### Supabase Storage Legacy Backend

If you want to publish blobs to Supabase Storage instead, create a public bucket named `gridwild-assets` in the Supabase dashboard. This is still supported by leaving `GRIDWILD_STORAGE_BACKEND` unset or setting it to `supabase`.

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

For deployed Netlify functions, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GRIDWILD_ASSET_PUBLIC_BASE` in Netlify Site configuration > Environment variables. The local `.env` file is only read by local scripts and local Netlify development.

You can create a local `.env` file:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
GRIDWILD_ASSET_DIR=C:\Users\ad1470\Documents\GRIDWILD_ASSETS

GRIDWILD_STORAGE_BACKEND=r2
GRIDWILD_R2_BUCKET=gridwild-assets
GRIDWILD_ASSET_PUBLIC_BASE=https://assets.gridwild.com
CLOUDFLARE_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
```

`GRIDWILD_STORAGE_BACKEND` defaults to `supabase` for backward compatibility. Use `r2` to upload blobs to Cloudflare R2 while keeping Supabase Postgres as the metadata store.

`GRIDWILD_R2_BUCKET` and `GRIDWILD_STORAGE_BUCKET` both default to `gridwild-assets`.

R2 publishes `.csv` and `.json` objects with `Content-Encoding: gzip` by default while keeping the same public URLs. Set `GRIDWILD_R2_GZIP=false` only for debugging.

`GRIDWILD_ASSET_PUBLIC_BASE` is used by the Netlify function to return CDN URLs. For production, also set it in Netlify:

```env
GRIDWILD_ASSET_PUBLIC_BASE=https://assets.gridwild.com
```

Do not commit `.env`; it contains service keys.

## 4. Publish Assets

From PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:GRIDWILD_ASSET_DIR="C:\Users\ad1470\Documents\GRIDWILD_ASSETS"
$env:GRIDWILD_STORAGE_BACKEND="r2"
$env:GRIDWILD_R2_BUCKET="gridwild-assets"
$env:GRIDWILD_ASSET_PUBLIC_BASE="https://assets.gridwild.com"
$env:CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
$env:R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID"
$env:R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY"
npm.cmd run publish:grid-assets
```

From Git Bash:

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
GRIDWILD_ASSET_DIR="/c/Users/ad1470/Documents/GRIDWILD_ASSETS" \
GRIDWILD_STORAGE_BACKEND="r2" \
GRIDWILD_R2_BUCKET="gridwild-assets" \
GRIDWILD_ASSET_PUBLIC_BASE="https://assets.gridwild.com" \
CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID" \
R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID" \
R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY" \
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

The script is safe to rerun for the same build. It overwrites Storage/R2 objects and upserts Postgres rows.

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
- Files in R2 or Storage under `gridwild-assets/builds/<build_id>/`.
- Public CDN URLs under `https://assets.gridwild.com/builds/<build_id>/` when using R2.

## Notes

- Keep only a few recent builds on the free Supabase plan if using Supabase Storage. The current asset set is roughly 122 MB per build.
- R2 object paths are build-versioned, so long-lived caching is safe as long as published build contents are immutable.
- Do not upload `square_genera_chunks/` unless the runtime needs it. The publish workflow uses the manifest's `superchunks` list.

## Frontend Runtime

The frontend loads the current build through `/.netlify/functions/get-grid-assets-build`. That function uses the server-side `SUPABASE_SERVICE_ROLE_KEY` to read `gw_asset_builds`, then returns public URLs for:

- `manifest.json`
- `dc_heat.csv`
- `observer_dictionary.json`
- `squares_genus_summary.json`
- `square_genera_superchunks/`

If `GRIDWILD_ASSET_PUBLIC_BASE` is set, those URLs point to Cloudflare R2/CDN. Otherwise, they fall back to Supabase Storage public URLs.

The browser never receives the `service_role` key or R2 write credentials.

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
