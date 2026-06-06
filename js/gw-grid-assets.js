(function () {
  const LOCAL_URLS = {
    manifest: null,
    heat: "assets/dc_heat.csv",
    observerDictionary: "assets/observer_dictionary.json",
    superchunkBase: "assets/square_genera_superchunks"
  };

  const state = {
    catalogPromise: null,
    catalog: null,
    manifestPromise: null
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

  function localCatalog(reason) {
    return {
      source: "local",
      reason: reason || null,
      build: null,
      urls: { ...LOCAL_URLS }
    };
  }

  async function fetchSupabaseCatalog() {
    const resp = await fetch("/.netlify/functions/get-grid-assets-build", {
      headers: { accept: "application/json" }
    });

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

      try {
        state.catalog = await fetchSupabaseCatalog();
        console.info(`GridWild assets loaded from ${state.catalog.source}.`, state.catalog.build);
        return state.catalog;
      } catch (err) {
        if (mode === "supabase") throw err;
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

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to load ${label}: HTTP ${resp.status} for ${url}`);
    }
    return resp.json();
  }

  async function loadManifest() {
    if (state.manifestPromise) return state.manifestPromise;
    state.manifestPromise = (async () => {
      const url = await assetUrl("manifest");
      return fetchJson(url, "GridWild asset manifest");
    })();
    return state.manifestPromise;
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
    loadManifest,
    superchunkUrl,
    localCatalog
  };
})();
