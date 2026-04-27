// js/gw-inat-recent.js
// -----------------------------------------------------------------------------
// Recent iNaturalist observation sync for fog/documented cells.
// Pulls only recent public/open observations with positional accuracy <= 20m.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_recent_inat_obs_v2";

  const DAYS_BACK = 30;
  const MAX_ACCURACY_M = 20;
  const PER_PAGE = 100;
  const PAGE_DELAY_MS = 900;
  const MAX_PAGES = 30;

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentObsCache));
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

  function normalizeObs(obs) {
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

    return {
      id: obs.id,
      lat: coords.lat,
      lng: coords.lng,
      accuracy: Number(obs.positional_accuracy),
      observed_on: obs.observed_on || obs.time_observed_at || null,

      // Display fields
      taxon: displayName,
      common_name: commonName,
      scientific_name: scientificName,

      // Codex lookup field
      genus_name: genusName,

      iconic_taxon_name: taxon.iconic_taxon_name || "Unknown",
      uri: obs.uri || null
    };
  }

  function getRecentObservations() {
    return Array.isArray(recentObsCache.observations)
      ? recentObsCache.observations
      : [];
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

  window.GridWildRecentINat = {
    refreshRecentObservations,
    getRecentObservations,
    applyRecentObservationsToFog,
    getCache: () => recentObsCache
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(applyRecentObservationsToFog, 250);
  });
})();