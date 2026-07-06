(function () {
  const DEFAULT_DIRECT_ASSET_BASE = "https://assets.gridwild.com";
  const DEFAULT_CURRENT_POINTER_PATH = "builds/current.json";
  const CDN_CATALOG_TIMEOUT_MS = 3500;
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
    manifest: null,
    manifestPromise: null,
    coarsePyramidManifestPromise: null,
    coarsePMTilesShardManifestPromise: null,
    metadataShardManifestPromise: null,
    pmtilesShardManifestPromise: null
  };

  function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/g, "");
  }

  function normalizeMode(mode) {
    return String(mode || "auto")
      .trim()
      .toLowerCase();
  }

  function normalizeRelativePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/g, "");
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

  function localFallbackAllowed(mode = getMode()) {
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode === "local" || normalizedMode === "local-csv") return true;
    if (window.GW_ALLOW_LOCAL_GRID_ASSET_FALLBACK === true) return true;
    return false;
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

  function currentPointerUrl(base = DEFAULT_DIRECT_ASSET_BASE) {
    return `${trimTrailingSlash(base)}/${DEFAULT_CURRENT_POINTER_PATH}`;
  }

  function resolveAssetUrl(value, baseUrl) {
    if (!value) return "";
    try {
      return new URL(String(value), baseUrl || window.location.href).href;
    } catch {
      return String(value);
    }
  }

  function getDirectManifestConfig(mode = getMode()) {
    const manifestUrl = getConfigValue(
      "gwAssetManifest",
      "GW_GRID_ASSET_MANIFEST_URL",
      "GW_GRID_ASSET_MANIFEST_URL"
    );
    if (manifestUrl) {
      return {
        url: resolveAssetUrl(manifestUrl),
        source: "direct-manifest",
        required: true
      };
    }

    const currentUrl = getConfigValue(
      "gwAssetCurrent",
      "GW_GRID_ASSET_CURRENT_URL",
      "GW_GRID_ASSET_CURRENT_URL"
    );
    if (currentUrl) {
      return {
        url: resolveAssetUrl(currentUrl),
        source: "direct-current",
        required: true
      };
    }

    const normalizedMode = normalizeMode(mode);
    const base =
      getConfigValue("gwAssetBase", "GW_GRID_ASSET_BASE", "GW_GRID_ASSET_BASE") ||
      DEFAULT_DIRECT_ASSET_BASE;

    if (normalizedMode === "cdn" || normalizedMode === "r2") {
      return {
        url: currentPointerUrl(base),
        source: "direct-current",
        required: true
      };
    }

    if (normalizedMode === "auto") {
      return {
        url: currentPointerUrl(base),
        source: "direct-current",
        required: false
      };
    }

    return null;
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

  function inferAssetRoot(manifestUrl) {
    try {
      const parts = new URL(manifestUrl).pathname.split("/").filter(Boolean);
      const buildsIndex = parts.lastIndexOf("builds");
      if (buildsIndex >= 0 && parts[buildsIndex + 1]) {
        return `builds/${parts[buildsIndex + 1]}`;
      }
    } catch {
      // Keep catalog metadata best-effort; URLs are still authoritative.
    }
    return null;
  }

  function isGridWildManifest(data) {
    return Boolean(
      data &&
      typeof data === "object" &&
      data.build_id &&
      (Array.isArray(data.superchunks) ||
        data.heat_file ||
        data.pmtiles_file ||
        data.pmtiles_shard_manifest_file ||
        data.coarse_pmtiles_shard_manifest_file)
    );
  }

  function catalogFromManifest({ manifest, manifestUrl, source }) {
    const assetUrl = (manifestKey, fallback) =>
      resolveAssetUrl(normalizeRelativePath(manifest?.[manifestKey] || fallback), manifestUrl);

    return {
      source,
      build: {
        build_id: manifest?.build_id || null,
        schema_version: manifest?.schema_version || null,
        generated_at: manifest?.generated_at || null,
        asset_root: inferAssetRoot(manifestUrl)
      },
      urls: {
        manifest: manifestUrl,
        heat: assetUrl("heat_file", "dc_heat.csv"),
        observerDictionary: assetUrl("observer_dictionary_file", "observer_dictionary.json"),
        squareSummary: manifest?.square_summary_file
          ? assetUrl("square_summary_file", "squares_genus_summary.json")
          : null,
        superchunkBase: assetUrl("superchunk_dir", "square_genera_superchunks")
      }
    };
  }

  function pointerManifestUrl(pointer, pointerUrl) {
    const explicitManifest =
      pointer?.manifest_url || pointer?.manifestUrl || pointer?.manifest || pointer?.urls?.manifest;
    if (explicitManifest) return resolveAssetUrl(explicitManifest, pointerUrl);

    const assetBase = pointer?.asset_base || pointer?.assetBase || pointer?.publicAssetBase;
    const manifestPath = pointer?.manifest_path || pointer?.manifestPath;
    if (manifestPath) {
      if (assetBase) {
        return `${trimTrailingSlash(assetBase)}/${normalizeRelativePath(manifestPath)}`;
      }
      try {
        const pointerOrigin = new URL(pointerUrl).origin;
        return `${pointerOrigin}/${normalizeRelativePath(manifestPath)}`;
      } catch {
        return resolveAssetUrl(normalizeRelativePath(manifestPath), pointerUrl);
      }
    }

    const buildId = pointer?.build_id || pointer?.buildId;
    if (buildId && assetBase) {
      return `${trimTrailingSlash(assetBase)}/builds/${normalizeRelativePath(buildId)}/manifest.json`;
    }

    if (buildId) {
      return resolveAssetUrl(`${normalizeRelativePath(buildId)}/manifest.json`, pointerUrl);
    }

    const assetRoot = pointer?.asset_root || pointer?.assetRoot;
    if (assetRoot && assetBase) {
      return `${trimTrailingSlash(assetBase)}/${normalizeRelativePath(assetRoot)}/manifest.json`;
    }

    throw new Error("GridWild CDN asset pointer did not include a manifest URL or build ID.");
  }

  function cacheManifest(manifest) {
    state.manifest = manifest || null;
    state.manifestPromise = Promise.resolve(state.manifest);
    return state.manifest;
  }

  async function fetchDirectManifestCatalog(config) {
    const pointerOrManifest = await fetchJson(config.url, "GridWild CDN asset pointer", {
      timeoutMs: CDN_CATALOG_TIMEOUT_MS,
      forceCacheBust: config.source === "direct-current"
    });

    const manifestUrl = isGridWildManifest(pointerOrManifest)
      ? config.url
      : pointerManifestUrl(pointerOrManifest, config.url);
    const manifest = isGridWildManifest(pointerOrManifest)
      ? pointerOrManifest
      : await fetchJson(manifestUrl, "GridWild CDN asset manifest", {
          timeoutMs: CDN_CATALOG_TIMEOUT_MS,
          forceCacheBust: config.source === "direct-current"
        });

    cacheManifest(manifest);
    return catalogFromManifest({ manifest, manifestUrl, source: config.source });
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
    const normalizedMode = normalizeMode(mode);

    state.catalogPromise = (async () => {
      if (normalizedMode === "local" || normalizedMode === "local-csv") {
        state.catalog = localCatalog("Forced by gwAssets=local or GW_GRID_ASSET_MODE.");
        return state.catalog;
      }

      const directConfig = getDirectCatalogConfig();
      if (directConfig) {
        state.catalog = directCatalog(directConfig);
        console.info("GridWild assets loaded from direct CDN override.", state.catalog.build);
        return state.catalog;
      }

      const manifestConfig = getDirectManifestConfig(mode);
      if (manifestConfig) {
        try {
          state.catalog = await fetchDirectManifestCatalog(manifestConfig);
          console.info("GridWild assets loaded from CDN manifest.", state.catalog.build);
          return state.catalog;
        } catch (err) {
          if (manifestConfig.required) {
            console.warn("GridWild CDN asset manifest unavailable.", err);
            throw err;
          }
          console.warn(
            "GridWild CDN current asset pointer unavailable; trying catalog function.",
            err
          );
        }
      }

      try {
        state.catalog = await fetchSupabaseCatalog();
        console.info(`GridWild assets loaded from ${state.catalog.source}.`, state.catalog.build);
        return state.catalog;
      } catch (err) {
        if (normalizedMode === "supabase" || !localFallbackAllowed(mode)) {
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

  async function fetchJson(url, label, options = {}) {
    if (!url) return null;

    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
    const controller = timeoutMs ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    const requestUrl = cacheBustedJsonUrl(url, options);
    const resp = await fetch(requestUrl, {
      cache: "no-store",
      signal: controller?.signal
    }).finally(() => {
      if (timeout) window.clearTimeout(timeout);
    });
    if (!resp.ok) {
      throw new Error(`Failed to load ${label}: HTTP ${resp.status} for ${requestUrl}`);
    }
    return resp.json();
  }

  function jsonCacheBuster() {
    const params = new URLSearchParams(window.location.search);
    return params.get("gwAssetVersion") || params.get("v") || "";
  }

  function cacheBustedJsonUrl(url, options = {}) {
    const buster = jsonCacheBuster() || (options.forceCacheBust ? String(Date.now()) : "");
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
    return url || null;
  }

  async function loadManifest() {
    if (state.manifestPromise) return state.manifestPromise;
    state.manifestPromise = (async () => {
      const url = await assetUrl("manifest");
      const manifest = await fetchJson(url, "GridWild asset manifest");
      return cacheManifest(manifest);
    })();
    return state.manifestPromise;
  }

  function reset() {
    state.catalogPromise = null;
    state.catalog = null;
    state.manifest = null;
    state.manifestPromise = null;
    state.coarsePyramidManifestPromise = null;
    state.coarsePMTilesShardManifestPromise = null;
    state.metadataShardManifestPromise = null;
    state.pmtilesShardManifestPromise = null;
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

  async function loadMetadataShardManifest() {
    if (state.metadataShardManifestPromise) return state.metadataShardManifestPromise;
    state.metadataShardManifestPromise = (async () => {
      const manifest = await loadManifest();
      const file = manifest?.metadata_shard_manifest_file;
      if (!file) return null;
      const url = await assetRelativeUrl(file);
      return fetchJson(url, "GridWild metadata shard manifest");
    })();
    return state.metadataShardManifestPromise;
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

  async function metadataShardsInfo() {
    const shardManifest = await loadMetadataShardManifest();
    if (!shardManifest?.shards?.length) return null;

    return {
      ...shardManifest,
      dictionaries_url: await assetRelativeUrl(shardManifest.dictionaries_file),
      shards: await Promise.all(
        shardManifest.shards.map(async (shard) => ({
          ...shard,
          url: await assetRelativeUrl(shard.file)
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
    loadMetadataShardManifest,
    coarsePyramidTileUrl,
    pmtilesUrl,
    pmtilesInfo,
    pmtilesShardsInfo,
    coarsePMTilesShardsInfo,
    metadataShardsInfo,
    superchunkUrl,
    localCatalog,
    localFallbackAllowed,
    reset
  };

  window.GridWildAssets.hasDirectCatalogConfig = function hasDirectCatalogConfig() {
    return Boolean(getDirectCatalogConfig() || getDirectManifestConfig());
  };
})();
