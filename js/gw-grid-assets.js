(function () {
  const DEFAULT_DIRECT_ASSET_BASE = "https://assets.gridwild.com";
  const SUPABASE_CATALOG_TIMEOUT_MS = 5000;

  const LOCAL_URLS = {
    manifest: null,
    heat: "assets/dc_heat.csv",
    observerDictionary: "assets/observer_dictionary.json",
    superchunkBase: "assets/square_genera_superchunks"
  };

  const state = {
    catalogPromise: null,
    catalog: null,
    manifestPromise: null,
    coarsePyramidManifestPromise: null,
    coarsePMTilesShardManifestPromise: null,
    pmtilesShardManifestPromise: null
  };

  function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/g, "");
  }

  function getMode() {
    const queryMode = new URLSearchParams(window.location.search).get("gwAssets");
    return (
      queryMode ||
      window.localStorage?.getItem("GW_GRID_ASSET_MODE") ||
      window.GW_GRID_ASSET_MODE ||
      "auto"
    );
  }

  function isLocalAssetHost() {
    const hostname = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  }

  function localFallbackAllowed(mode = getMode()) {
    if (mode === "local") return true;
    if (window.GW_ALLOW_LOCAL_GRID_ASSET_FALLBACK === true) return true;
    return mode === "auto" && isLocalAssetHost();
  }

  function getConfigValue(queryKey, storageKey, globalKey) {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get(queryKey) || window.localStorage?.getItem(storageKey) || window[globalKey] || ""
    );
  }

  function getDirectCatalogConfig() {
    const buildId = getConfigValue(
      "gwAssetBuild",
      "GW_GRID_ASSET_BUILD_ID",
      "GW_GRID_ASSET_BUILD_ID"
    );
    if (!buildId) return null;

    const base =
      getConfigValue("gwAssetBase", "GW_GRID_ASSET_BASE", "GW_GRID_ASSET_BASE") ||
      DEFAULT_DIRECT_ASSET_BASE;

    return {
      buildId: String(buildId).trim(),
      base: trimTrailingSlash(base)
    };
  }

  function directCatalog(config) {
    const buildRoot = `${config.base}/builds/${config.buildId}`;
    return {
      source: "direct-r2",
      build: {
        build_id: config.buildId,
        asset_root: `builds/${config.buildId}`
      },
      urls: {
        manifest: `${buildRoot}/manifest.json`,
        heat: `${buildRoot}/dc_heat.csv`,
        observerDictionary: `${buildRoot}/observer_dictionary.json`,
        squareSummary: `${buildRoot}/squares_genus_summary.json`,
        superchunkBase: `${buildRoot}/square_genera_superchunks`
      }
    };
  }

  function localCatalog(reason) {
    return {
      source: "local",
      reason: reason || null,
      build: null,
      urls: { ...LOCAL_URLS }
    };
  }

  async function fetchSupabaseCatalog() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SUPABASE_CATALOG_TIMEOUT_MS);

    const resp = await fetch("/.netlify/functions/get-grid-assets-build", {
      headers: { accept: "application/json" },
      signal: controller.signal
    }).finally(() => window.clearTimeout(timeout));

    if (!resp.ok) {
      throw new Error(`Grid asset catalog request failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data?.urls?.heat || !data?.urls?.observerDictionary || !data?.urls?.superchunkBase) {
      throw new Error("Grid asset catalog response is missing required Storage URLs.");
    }

    return {
      source: data.publicAssetBase ? "r2" : "supabase",
      build: data.build || null,
      urls: data.urls
    };
  }

  async function getCatalog() {
    if (state.catalog) return state.catalog;
    if (state.catalogPromise) return state.catalogPromise;

    const mode = getMode();

    state.catalogPromise = (async () => {
      if (mode === "local") {
        state.catalog = localCatalog("Forced by gwAssets=local or GW_GRID_ASSET_MODE.");
        return state.catalog;
      }

      const directConfig = getDirectCatalogConfig();
      if (directConfig) {
        state.catalog = directCatalog(directConfig);
        console.info("GridWild assets loaded from direct CDN override.", state.catalog.build);
        return state.catalog;
      }

      try {
        state.catalog = await fetchSupabaseCatalog();
        console.info(`GridWild assets loaded from ${state.catalog.source}.`, state.catalog.build);
        return state.catalog;
      } catch (err) {
        if (mode === "supabase" || !localFallbackAllowed(mode)) {
          console.warn("GridWild asset catalog unavailable; local fallback is disabled.", err);
          state.catalogPromise = null;
          throw err;
        }
        console.warn("Falling back to local GridWild assets.", err);
        state.catalog = localCatalog(err.message);
        return state.catalog;
      }
    })();

    return state.catalogPromise;
  }

  async function assetUrl(key) {
    const catalog = await getCatalog();
    return catalog.urls[key] || null;
  }

  async function fetchJson(url, label) {
    if (!url) return null;

    const requestUrl = cacheBustedJsonUrl(url);
    const resp = await fetch(requestUrl, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Failed to load ${label}: HTTP ${resp.status} for ${requestUrl}`);
    }
    return resp.json();
  }

  function jsonCacheBuster() {
    const params = new URLSearchParams(window.location.search);
    return params.get("gwAssetVersion") || params.get("v") || "";
  }

  function cacheBustedJsonUrl(url) {
    const buster = jsonCacheBuster();
    if (!buster) return url;

    try {
      const parsed = new URL(url, window.location.href);
      parsed.searchParams.set("gw_json_v", buster);
      return parsed.href;
    } catch {
      const separator = String(url).includes("?") ? "&" : "?";
      return `${url}${separator}gw_json_v=${encodeURIComponent(buster)}`;
    }
  }

  async function assetRelativeUrl(relativePath) {
    if (!relativePath) return null;
    const catalog = await getCatalog();
    const manifestUrl = catalog.urls.manifest;
    if (!manifestUrl) return null;
    return new URL(String(relativePath).replace(/^\/+/g, ""), manifestUrl).href;
  }

  function rangeFriendlyUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.href);
      parsed.searchParams.set("gw_pmtiles_range", "1");
      return parsed.href;
    } catch {
      const separator = String(url).includes("?") ? "&" : "?";
      return `${url}${separator}gw_pmtiles_range=1`;
    }
  }

  async function loadManifest() {
    if (state.manifestPromise) return state.manifestPromise;
    state.manifestPromise = (async () => {
      const url = await assetUrl("manifest");
      return fetchJson(url, "GridWild asset manifest");
    })();
    return state.manifestPromise;
  }

  async function loadCoarsePyramidManifest() {
    if (state.coarsePyramidManifestPromise) return state.coarsePyramidManifestPromise;
    state.coarsePyramidManifestPromise = (async () => {
      const manifest = await loadManifest();
      const file = manifest?.coarse_pyramid_manifest_file;
      if (!file) return null;
      const url = await assetRelativeUrl(file);
      return fetchJson(url, "GridWild coarse pyramid manifest");
    })();
    return state.coarsePyramidManifestPromise;
  }

  async function loadPMTilesShardManifest() {
    if (state.pmtilesShardManifestPromise) return state.pmtilesShardManifestPromise;
    state.pmtilesShardManifestPromise = (async () => {
      const manifest = await loadManifest();
      const file = manifest?.pmtiles_shard_manifest_file;
      if (!file) return null;
      const url = await assetRelativeUrl(file);
      return fetchJson(url, "GridWild PMTiles shard manifest");
    })();
    return state.pmtilesShardManifestPromise;
  }

  async function loadCoarsePMTilesShardManifest() {
    if (state.coarsePMTilesShardManifestPromise) return state.coarsePMTilesShardManifestPromise;
    state.coarsePMTilesShardManifestPromise = (async () => {
      const manifest = await loadManifest();
      const file = manifest?.coarse_pmtiles_shard_manifest_file;
      if (!file) return null;
      const url = await assetRelativeUrl(file);
      return fetchJson(url, "GridWild coarse PMTiles shard manifest");
    })();
    return state.coarsePMTilesShardManifestPromise;
  }

  async function coarsePyramidTileUrl(tileFile) {
    return assetRelativeUrl(tileFile);
  }

  async function pmtilesUrl() {
    const manifest = await loadManifest();
    if (manifest?.pmtiles_shard_manifest_file) return null;
    return rangeFriendlyUrl(await assetRelativeUrl(manifest?.pmtiles_file));
  }

  async function pmtilesInfo() {
    const manifest = await loadManifest();
    if (manifest?.pmtiles_shard_manifest_file) {
      return {
        url: null,
        file: null,
        layer: manifest?.pmtiles_layer || "gridwild_cells",
        payload: manifest?.pmtiles_payload || null,
        mode: "spatial_shards"
      };
    }

    const url = rangeFriendlyUrl(await assetRelativeUrl(manifest?.pmtiles_file));
    return {
      url,
      file: manifest?.pmtiles_file || null,
      layer: manifest?.pmtiles_layer || "gridwild_cells",
      payload: manifest?.pmtiles_payload || null
    };
  }

  async function pmtilesShardsInfo() {
    const shardManifest = await loadPMTilesShardManifest();
    if (!shardManifest?.shards?.length) return null;

    return {
      ...shardManifest,
      shards: await Promise.all(
        shardManifest.shards.map(async (shard) => ({
          ...shard,
          url: rangeFriendlyUrl(await assetRelativeUrl(shard.file))
        }))
      )
    };
  }

  async function coarsePMTilesShardsInfo() {
    const shardManifest = await loadCoarsePMTilesShardManifest();
    if (!shardManifest?.shards?.length) return null;

    return {
      ...shardManifest,
      shards: await Promise.all(
        shardManifest.shards.map(async (shard) => ({
          ...shard,
          url: rangeFriendlyUrl(await assetRelativeUrl(shard.file))
        }))
      )
    };
  }

  async function superchunkUrl(superIx, superIy) {
    const catalog = await getCatalog();
    const base = trimTrailingSlash(catalog.urls.superchunkBase);
    return `${base}/super_${superIx}_${superIy}.json`;
  }

  window.GridWildAssets = {
    getMode,
    getCatalog,
    assetUrl,
    assetRelativeUrl,
    loadManifest,
    loadCoarsePyramidManifest,
    loadPMTilesShardManifest,
    loadCoarsePMTilesShardManifest,
    coarsePyramidTileUrl,
    pmtilesUrl,
    pmtilesInfo,
    pmtilesShardsInfo,
    coarsePMTilesShardsInfo,
    superchunkUrl,
    localCatalog,
    localFallbackAllowed
  };

  window.GridWildAssets.hasDirectCatalogConfig = function hasDirectCatalogConfig() {
    return Boolean(getDirectCatalogConfig());
  };
})();
