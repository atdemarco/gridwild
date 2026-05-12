create table if not exists public.gw_asset_builds (
  build_id text primary key,
  schema_version text not null,
  generator text,
  generated_at timestamptz,
  grid_size_m numeric,
  grid_size_ft numeric,
  superchunk_size integer,
  asset_root text,
  heat_file text,
  observer_dictionary_file text,
  square_summary_file text,
  superchunk_dir text,
  n_observations integer,
  n_squares integer,
  n_superchunks integer,
  n_observers integer,
  taxonomy_levels jsonb,
  manifest jsonb,
  is_current boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.gw_superchunks (
  build_id text references public.gw_asset_builds(build_id) on delete cascade,
  superchunk_id text not null,
  super_ix integer,
  super_iy integer,
  file text,
  storage_path text not null,
  n_squares integer,
  bbox_grid jsonb,
  cell_count integer,
  manifest_row jsonb,
  created_at timestamptz default now(),
  primary key (build_id, superchunk_id)
);

create index if not exists gw_asset_builds_is_current_idx
  on public.gw_asset_builds(is_current);

create index if not exists gw_superchunks_build_id_idx
  on public.gw_superchunks(build_id);

create index if not exists gw_superchunks_super_ix_super_iy_idx
  on public.gw_superchunks(super_ix, super_iy);
