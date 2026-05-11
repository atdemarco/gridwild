// -----------------------------------------------------------------------------
// Recent iNaturalist observation sync for fog/documented cells.
// Pulls only recent public/open observations with positional accuracy <= 20m.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_recent_inat_obs_v2";

  const DAYS_BACK = 7;
  const MAX_ACCURACY_M = 20;
  const PER_PAGE = 100;
  const PAGE_DELAY_MS = 900;
  const MAX_PAGES = 30;
  const MORE_OBS_TARGET = 2000;
  const MORE_OBS_MAX_PAGES = 120;
  const PHOTO_CACHE_KEEP_COUNT = 120;

  let recentObsCache = loadCache();

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isoDateDaysAgo(daysBack) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : { observations: [], refreshed_at: null };
      return parsed && typeof parsed === "object"
        ? parsed
        : { observations: [], refreshed_at: null };
    } catch {
      return { observations: [], refreshed_at: null };
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentObsCache));
    } catch (err) {
      if (!isQuotaError(err)) throw err;

      recentObsCache = {
        ...recentObsCache,
        compacted_at: new Date().toISOString(),
        observations: compactObservationPhotos(getRecentObservations(), 0)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentObsCache));
    }
  }

  function isQuotaError(err) {
    return err?.name === "QuotaExceededError" ||
      err?.code === 22 ||
      String(err?.message || "").includes("quota");
  }

  function stripObservationPhotos(obs) {
    return {
      ...obs,
      photo_url: null,
      photo_square_url: null,
      photo_medium_url: null
    };
  }

  function compactObservationPhotos(observations, keepCount = PHOTO_CACHE_KEEP_COUNT) {
    return sortObservationsNewestFirst(observations).map((obs, index) => {
      if (index < keepCount) return obs;
      return stripObservationPhotos(obs);
    });
  }

  function hasOlderCachedPhotos(observations) {
    return sortObservationsNewestFirst(observations)
      .slice(PHOTO_CACHE_KEEP_COUNT)
      .some(obs => obs?.photo_url || obs?.photo_square_url || obs?.photo_medium_url);
  }

  function compactExistingPhotoCache() {
    const observations = getRecentObservations();
    if (!hasOlderCachedPhotos(observations)) return;

    recentObsCache = {
      ...recentObsCache,
      compacted_at: new Date().toISOString(),
      observations: compactObservationPhotos(observations)
    };

    saveCache();
  }

  function getObservationCoords(obs) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  }

  function isOpenObservation(obs) {
    const geoprivacy = obs?.geoprivacy || "open";
    const taxonGeoprivacy = obs?.taxon_geoprivacy || "open";

    if (obs?.obscured === true) return false;
    if (geoprivacy !== "open") return false;
    if (taxonGeoprivacy !== "open") return false;

    return true;
  }

  function isPreciseEnough(obs) {
    const acc = Number(obs?.positional_accuracy);
    return Number.isFinite(acc) && acc > 0 && acc <= MAX_ACCURACY_M;
  }

  function getGenusNameFromTaxon(taxon) {
    const sci = String(taxon?.name || "").trim();

    // iNat scientific names are usually:
    // Genus
    // Genus species
    // Genus species subspecies
    const m = sci.match(/^([A-Z][a-zA-Z-]+)(?:\s|$)/);
    return m ? m[1] : "";
  }

function getPhotoUrls(obs) {
  const url = obs?.photos?.[0]?.url || "";

  if (!url) {
    return {
      square: null,
      medium: null
    };
  }

  return {
    square: url,
    medium: url.replace(/square\./, "medium.")
  };
}


  function normalizeObs(obs, options = {}) {
    const includePhotos = options.includePhotos !== false;
    const coords = getObservationCoords(obs);
    if (!coords) return null;

    const taxon = obs?.taxon || {};
    const scientificName = taxon.name || "";
    const commonName = taxon.preferred_common_name || "";
    const genusName = getGenusNameFromTaxon(taxon);

    const displayName =
      commonName ||
      scientificName ||
      "Unknown taxon";

    const photos = includePhotos
      ? getPhotoUrls(obs)
      : { square: null, medium: null };

    return {
      id: obs.id,
      lat: coords.lat,
      lng: coords.lng,
      accuracy: Number(obs.positional_accuracy),
      observed_on: obs.observed_on || obs.time_observed_at || null,
      time_observed_at: obs.time_observed_at || null,
      observed_time_zone: obs.observed_time_zone || null,

      // Display fields
      taxon: displayName,
      common_name: commonName,
      scientific_name: scientificName,

      // Codex lookup field
      genus_name: genusName,

      iconic_taxon_name: taxon.iconic_taxon_name || "Unknown",
      uri: obs.uri || null,

      // Photo fields for Wildlists / gallery cards
      photo_url: photos.square,
      photo_square_url: photos.square,
      photo_medium_url: photos.medium,

      // Extra display / filtering fields
      quality_grade: obs?.quality_grade || null,
      description: obs?.description || "",
      place_guess: obs?.place_guess || "",
      created_at: obs?.created_at || null,
    };
  }

  function getRecentObservations() {
    return Array.isArray(recentObsCache.observations)
      ? recentObsCache.observations
      : [];
  }

  function observationSortTime(obs) {
    const raw = obs?.time_observed_at || obs?.observed_on || obs?.created_at || "";
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  function sortObservationsNewestFirst(observations) {
    return observations.slice().sort((a, b) => observationSortTime(b) - observationSortTime(a));
  }

  function getOldestCachedObservedDay() {
    const dated = getRecentObservations()
      .map(obs => obs?.observed_on || obs?.time_observed_at || obs?.created_at || "")
      .filter(Boolean)
      .map(raw => String(raw).slice(0, 10))
      .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort();

    return dated[0] || null;
  }

  function mergeUniqueObservations(existing, additions) {
    const seen = new Set();
    const merged = [];

    for (const obs of [...existing, ...additions]) {
      const key = String(obs?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(obs);
    }

    return sortObservationsNewestFirst(merged);
  }

  function applyRecentObservationsToFog() {
    if (!window.GridWildFog || typeof window.getCellKeyForLatLng !== "function") {
      return;
    }

    window.GridWildFog.clearRecentINatObserved();

    for (const obs of getRecentObservations()) {
      const key = window.getCellKeyForLatLng(obs.lat, obs.lng);
      window.GridWildFog.markRecentINatObserved(key, {
        timestamp: obs.observed_on ? new Date(obs.observed_on).getTime() : Date.now(),
        obsCountIncrement: 1
      });
    }

    if (typeof window.updateGrid === "function") {
      window.updateGrid();
    }

    if (window.GridWildFogCanvas) {
      window.GridWildFogCanvas.scheduleRender();
    }
  }

  function emitProgress(detail) {
    window.dispatchEvent(new CustomEvent("gwRecentINatProgress", { detail }));
  }

  async function refreshRecentObservations(username) {
    username = (username || window.__gwUser?.username || "andrew2285")
      .trim()
      .replace(/^@+/, "");

    const d1 = isoDateDaysAgo(DAYS_BACK);

    const baseUrl = new URL("https://api.inaturalist.org/v1/observations");
    baseUrl.searchParams.set("user_login", username);
    baseUrl.searchParams.set("d1", d1);
    baseUrl.searchParams.set("order_by", "observed_on");
    baseUrl.searchParams.set("order", "desc");
    baseUrl.searchParams.set("geo", "true");
    baseUrl.searchParams.set("per_page", String(PER_PAGE));

    // iNat supports geoprivacy/taxon_geoprivacy search params, but we still
    // filter client-side because null/open handling can be subtle.
    baseUrl.searchParams.set("geoprivacy", "open");
    baseUrl.searchParams.set("taxon_geoprivacy", "open");

    const accepted = [];
    let fetched = 0;
    let rejected = 0;
    let totalResults = null;

    emitProgress({
      status: "starting",
      username,
      page: 0,
      fetched,
      accepted: 0,
      rejected,
      totalResults,
      pct: 0
    });

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(baseUrl.toString());
      url.searchParams.set("page", String(page));

      emitProgress({
        status: "fetching",
        username,
        page,
        fetched,
        accepted: accepted.length,
        rejected,
        totalResults,
        pct: totalResults ? Math.min(98, (fetched / totalResults) * 100) : null
      });

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        throw new Error(`iNaturalist request failed: HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const results = Array.isArray(data?.results) ? data.results : [];

      if (totalResults == null && Number.isFinite(Number(data?.total_results))) {
        totalResults = Number(data.total_results);
      }

      fetched += results.length;

      for (const obs of results) {
        const normalized = normalizeObs(obs);

        if (!normalized || !isOpenObservation(obs) || !isPreciseEnough(obs)) {
          rejected++;
          continue;
        }

        accepted.push(normalized);
      }

      emitProgress({
        status: "page_done",
        username,
        page,
        fetched,
        accepted: accepted.length,
        rejected,
        totalResults,
        pct: totalResults ? Math.min(98, (fetched / totalResults) * 100) : null
      });

      if (results.length < PER_PAGE) break;
      if (totalResults != null && fetched >= totalResults) break;

      await sleep(PAGE_DELAY_MS);
    }

    recentObsCache = {
      username,
      refreshed_at: new Date().toISOString(),
      days_back: DAYS_BACK,
      max_accuracy_m: MAX_ACCURACY_M,
      observations: accepted
    };

    saveCache();
    applyRecentObservationsToFog();

    emitProgress({
      status: "done",
      username,
      fetched,
      accepted: accepted.length,
      rejected,
      totalResults,
      pct: 100
    });

    window.dispatchEvent(new CustomEvent("gwRecentINatUpdated", {
      detail: recentObsCache
    }));

    return recentObsCache;
  }

  async function getMoreObservations(username) {
    username = (username || window.__gwUser?.username || recentObsCache?.username || "andrew2285")
      .trim()
      .replace(/^@+/, "");

    const existing = getRecentObservations();
    const existingIds = new Set(existing.map(obs => String(obs?.id || "")).filter(Boolean));
    const d2 = getOldestCachedObservedDay();

    const baseUrl = new URL("https://api.inaturalist.org/v1/observations");
    baseUrl.searchParams.set("user_login", username);
    baseUrl.searchParams.set("order_by", "observed_on");
    baseUrl.searchParams.set("order", "desc");
    baseUrl.searchParams.set("geo", "true");
    baseUrl.searchParams.set("per_page", String(PER_PAGE));

    if (d2) {
      baseUrl.searchParams.set("d2", d2);
    }

    baseUrl.searchParams.set("geoprivacy", "open");
    baseUrl.searchParams.set("taxon_geoprivacy", "open");

    const additions = [];
    let fetched = 0;
    let rejected = 0;
    let duplicates = 0;
    let totalResults = null;

    emitProgress({
      status: "starting_more",
      username,
      page: 0,
      fetched,
      accepted: 0,
      rejected,
      duplicates,
      totalResults,
      pct: 0
    });

    for (let page = 1; page <= MORE_OBS_MAX_PAGES; page++) {
      const url = new URL(baseUrl.toString());
      url.searchParams.set("page", String(page));

      emitProgress({
        status: "fetching_more",
        username,
        page,
        fetched,
        accepted: additions.length,
        rejected,
        duplicates,
        totalResults,
        pct: Math.min(98, (additions.length / MORE_OBS_TARGET) * 100)
      });

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        throw new Error(`iNaturalist request failed: HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const results = Array.isArray(data?.results) ? data.results : [];

      if (totalResults == null && Number.isFinite(Number(data?.total_results))) {
        totalResults = Number(data.total_results);
      }

      fetched += results.length;

      for (const obs of results) {
        const id = String(obs?.id || "");

        if (!id || existingIds.has(id)) {
          duplicates++;
          continue;
        }

        const normalized = normalizeObs(obs, { includePhotos: false });
        if (!normalized || !isOpenObservation(obs) || !isPreciseEnough(obs)) {
          rejected++;
          continue;
        }

        existingIds.add(id);
        additions.push(normalized);

        if (additions.length >= MORE_OBS_TARGET) break;
      }

      emitProgress({
        status: "page_done_more",
        username,
        page,
        fetched,
        accepted: additions.length,
        rejected,
        duplicates,
        totalResults,
        pct: Math.min(98, (additions.length / MORE_OBS_TARGET) * 100)
      });

      if (additions.length >= MORE_OBS_TARGET) break;
      if (results.length < PER_PAGE) break;
      if (totalResults != null && fetched >= totalResults) break;

      await sleep(PAGE_DELAY_MS);
    }

    recentObsCache = {
      ...recentObsCache,
      username,
      refreshed_at: recentObsCache?.refreshed_at || new Date().toISOString(),
      expanded_at: new Date().toISOString(),
      days_back: recentObsCache?.days_back || DAYS_BACK,
      max_accuracy_m: MAX_ACCURACY_M,
      observations: compactObservationPhotos(mergeUniqueObservations(existing, additions))
    };

    saveCache();
    applyRecentObservationsToFog();

    emitProgress({
      status: "done",
      username,
      fetched,
      accepted: additions.length,
      rejected,
      duplicates,
      totalResults,
      pct: 100
    });

    window.dispatchEvent(new CustomEvent("gwRecentINatUpdated", {
      detail: recentObsCache
    }));

    return {
      cache: recentObsCache,
      added: additions.length,
      fetched,
      rejected,
      duplicates
    };
  }

  window.GridWildRecentINat = {
    refreshRecentObservations,
    getMoreObservations,
    getRecentObservations,
    applyRecentObservationsToFog,
    getCache: () => recentObsCache
  };

  document.addEventListener("DOMContentLoaded", () => {
    try {
      compactExistingPhotoCache();
    } catch (err) {
      console.warn("Could not compact cached observation photos:", err);
    }

    setTimeout(applyRecentObservationsToFog, 250);
  });
})();
