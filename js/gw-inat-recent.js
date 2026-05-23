// -----------------------------------------------------------------------------
// Recent iNaturalist observation sync for fog/documented cells.
// Pulls only recent public/open observations with positional accuracy <= 20m.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_recent_inat_obs_v2";
  const LEGACY_MIGRATION_MAX_CHARS = 4000000;

  const DAYS_BACK = 7;
  const MAX_ACCURACY_M = 20;
  const PER_PAGE = 100;
  const PAGE_DELAY_MS = 900;
  const MAX_PAGES = 30;
  const MORE_OBS_TARGET = 2000;
  const MORE_OBS_MAX_PAGES = 120;
  const PHOTO_CACHE_KEEP_COUNT = 120;
  const PHOTO_BACKFILL_BATCH_SIZE = 20;

  let recentObsCache = loadMetadata();
  let storeReadyPromise = initObservationStore();
  const photoBackfillPending = new Map();

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isoDateDaysAgo(daysBack) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  function emptyCache() {
    return { observations: [], refreshed_at: null };
  }

  function stripObservationsFromMetadata(value) {
    const copy = value && typeof value === "object" ? { ...value } : {};
    delete copy.observations;
    return {
      ...emptyCache(),
      ...copy,
      observations: []
    };
  }

  function loadMetadata() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyCache();

      if (raw.length > LEGACY_MIGRATION_MAX_CHARS) {
        console.warn("GridWild recent observation localStorage cache is large; skipping parse and moving to IndexedDB-only cache.");
        localStorage.removeItem(STORAGE_KEY);
        return emptyCache();
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? stripObservationsFromMetadata(parsed)
        : emptyCache();
    } catch {
      return emptyCache();
    }
  }

  function saveMetadata() {
    const meta = stripObservationsFromMetadata(recentObsCache);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripObservationsFromMetadata(meta)));
    }
  }

  async function loadLegacyObservationsForMigration() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > LEGACY_MIGRATION_MAX_CHARS) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.observations)
        ? {
          meta: stripObservationsFromMetadata(parsed),
          observations: parsed.observations
        }
        : null;
    } catch {
      return null;
    }
  }

  async function initObservationStore() {
    if (!window.GridWildObservationStore) return recentObsCache;

    const username = recentObsCache.username || window.__gwUser?.username || "";

    try {
      const legacy = await loadLegacyObservationsForMigration();
      if (legacy?.observations?.length) {
        const legacyUser = legacy.meta.username || username;
        const compacted = compactObservationPhotos(legacy.observations);
        await window.GridWildObservationStore.replaceForUser(legacyUser, compacted);
        recentObsCache = {
          ...legacy.meta,
          username: legacyUser,
          migrated_to_indexeddb_at: new Date().toISOString()
        };
        saveMetadata();
      }

      const cacheUser = recentObsCache.username || username;
      const rows = await window.GridWildObservationStore.getAll(cacheUser);
      const needsCompaction = rows.some(row =>
        row?.username ||
        row?.uri ||
        row?.photo_url ||
        row?.photo_square_url ||
        row?.photo_medium_url ||
        row?.u ||
        !("acc" in row) ||
        !("d" in row) ||
        !("t" in row)
      );
      const compactedRows = needsCompaction ? compactObservationPhotos(rows) : rows;

      if (needsCompaction && compactedRows.length) {
        await window.GridWildObservationStore.replaceForUser(cacheUser, compactedRows);
      }

      recentObsCache = {
        ...recentObsCache,
        observations: sortObservationsNewestFirst(compactedRows)
      };

      window.dispatchEvent(new CustomEvent("gwRecentINatUpdated", {
        detail: recentObsCache
      }));

      return recentObsCache;
    } catch (err) {
      console.warn("GridWild IndexedDB observation cache unavailable; using in-memory recent observations.", err);
      return recentObsCache;
    }
  }

  async function persistObservations(observations, options = {}) {
    const username = options.username || recentObsCache.username || window.__gwUser?.username || "";
    const compacted = compactObservationPhotos(observations);

    if (window.GridWildObservationStore) {
      if (options.replace) {
        await window.GridWildObservationStore.replaceForUser(username, compacted);
      } else {
        await window.GridWildObservationStore.putMany(compacted, { username });
      }
    }

    recentObsCache.observations = sortObservationsNewestFirst(compacted);
    saveMetadata();
  }

  function isQuotaError(err) {
    return err?.name === "QuotaExceededError" ||
      err?.code === 22 ||
      String(err?.message || "").includes("quota");
  }

  function asSquarePhotoUrl(url) {
    const raw = String(url || "").trim();
    return raw
      ? raw.replace(/\/(small|medium|large|original)\./, "/square.")
      : null;
  }

  function getSmallObservationPhotoUrl(obs) {
    return asSquarePhotoUrl(
      obs?.ps ||
      obs?.photo_square_url ||
      obs?.photo_url ||
      obs?.photo_medium_url ||
      obs?.photos?.[0]?.url ||
      ""
    );
  }

  function unpackObservationPayload(obs) {
    if (!obs || typeof obs !== "object") return null;
    if (!("acc" in obs) && !("d" in obs) && !("sci" in obs) && !("icon" in obs)) {
      return obs;
    }

    const id = obs.id;
    const photoSquare = getSmallObservationPhotoUrl(obs);
    return {
      id,
      lat: obs.lat,
      lng: obs.lng,
      accuracy: obs.acc,
      observed_on: obs.d || null,
      time_observed_at: obs.t || null,
      observed_time_zone: null,
      taxon: obs.com || obs.sci || "Unknown taxon",
      common_name: obs.com || "",
      scientific_name: obs.sci || "",
      genus_name: obs.gen || "",
      iconic_taxon_name: obs.icon || "Unknown",
      uri: id ? `https://www.inaturalist.org/observations/${encodeURIComponent(id)}` : null,
      photo_url: photoSquare,
      photo_square_url: photoSquare,
      photo_medium_url: null,
      quality_grade: null,
      created_at: null
    };
  }

  function compactObservationPayload(obs, options = {}) {
    const unpacked = unpackObservationPayload(obs) || {};
    const compact = {
      id: String(unpacked.id || ""),
      lat: Number(unpacked.lat),
      lng: Number(unpacked.lng),
      acc: Number(unpacked.accuracy) || null,
      d: String(unpacked.observed_on || unpacked.time_observed_at || unpacked.created_at || "").slice(0, 10) || null,
      t: unpacked.time_observed_at || null,
      sci: unpacked.scientific_name || "",
      com: unpacked.common_name || "",
      gen: unpacked.genus_name || "",
      icon: unpacked.iconic_taxon_name || "Unknown"
    };

    const photoSquare = options.includePhoto === false ? null : getSmallObservationPhotoUrl(obs);
    if (photoSquare) compact.ps = photoSquare;

    return compact;
  }

  function compactObservationPhotos(observations, keepCount = PHOTO_CACHE_KEEP_COUNT) {
    return sortObservationsNewestFirst(observations)
      .map((obs, index) => {
        return compactObservationPayload(obs, {
          includePhoto: index < keepCount
        });
      });
  }

  function hasOlderCachedPhotos(observations) {
    return sortObservationsNewestFirst(observations)
      .slice(PHOTO_CACHE_KEEP_COUNT)
      .some(obs => obs?.ps || obs?.photo_url || obs?.photo_square_url || obs?.photo_medium_url);
  }

  async function compactExistingPhotoCache() {
    const observations = getRecentObservations();
    if (!hasOlderCachedPhotos(observations)) return;

    recentObsCache = {
      ...recentObsCache,
      compacted_at: new Date().toISOString(),
      observations: compactObservationPhotos(observations)
    };

    await persistObservations(recentObsCache.observations, {
      username: recentObsCache.username || window.__gwUser?.username || "",
      replace: true
    });
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
      created_at: obs?.created_at || null,
    };
  }

  function getRecentObservations() {
    return Array.isArray(recentObsCache.observations)
      ? recentObsCache.observations.map(unpackObservationPayload).filter(Boolean)
      : [];
  }

  function observationSortTime(obs) {
    const raw = obs?.time_observed_at || obs?.observed_on || obs?.created_at || obs?.d || "";
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

  async function fetchObservationPhotoBatch(ids) {
    const cleaned = [...new Set((ids || []).map(id => String(id || "").trim()).filter(Boolean))];
    if (!cleaned.length) return new Map();

    const url = new URL("https://api.inaturalist.org/v1/observations");
    url.searchParams.set("id", cleaned.join(","));
    url.searchParams.set("per_page", String(Math.min(200, cleaned.length)));

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      throw new Error(`iNaturalist thumbnail request failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const photoById = new Map();
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const obs of results) {
      const id = String(obs?.id || "");
      const thumb = getSmallObservationPhotoUrl(obs);
      if (id && thumb) photoById.set(id, thumb);
    }

    return photoById;
  }

  async function applyObservationPhotoBackfill(photoById, options = {}) {
    if (!(photoById instanceof Map) || !photoById.size) return 0;

    const rows = Array.isArray(recentObsCache.observations)
      ? sortObservationsNewestFirst(recentObsCache.observations)
      : [];

    let changed = 0;
    const merged = rows.map(row => {
      const id = String(row?.id || "");
      const thumb = photoById.get(id);
      if (!id || !thumb || getSmallObservationPhotoUrl(row)) return row;

      changed++;
      return {
        ...compactObservationPayload(row, { includePhoto: true }),
        ps: thumb
      };
    });

    if (!changed) return 0;

    recentObsCache = {
      ...recentObsCache,
      observations: merged,
      photo_backfilled_at: new Date().toISOString()
    };

    if (options.persist !== false && window.GridWildObservationStore) {
      const username = recentObsCache.username || window.__gwUser?.username || "";
      await window.GridWildObservationStore.replaceForUser(username, compactObservationPhotos(merged));
    }

    saveMetadata();

    window.dispatchEvent(new CustomEvent("gwRecentINatUpdated", {
      detail: recentObsCache
    }));

    return changed;
  }

  async function ensureObservationPhotos(ids, options = {}) {
    await storeReadyPromise;

    const uniqueIds = [...new Set((ids || []).map(id => String(id || "").trim()).filter(Boolean))];
    if (!uniqueIds.length) return { requested: 0, fetched: 0, updated: 0 };

    const obsById = new Map(getRecentObservations().map(obs => [String(obs.id), obs]));
    const missingIds = uniqueIds.filter(id => {
      const obs = obsById.get(id);
      return obs && !getSmallObservationPhotoUrl(obs);
    });

    if (!missingIds.length) {
      return { requested: uniqueIds.length, fetched: 0, updated: 0 };
    }

    const pending = missingIds
      .map(id => photoBackfillPending.get(id))
      .filter(Boolean);
    const toFetch = missingIds.filter(id => !photoBackfillPending.has(id));

    const fetchTasks = [];
    for (let i = 0; i < toFetch.length; i += PHOTO_BACKFILL_BATCH_SIZE) {
      const batch = toFetch.slice(i, i + PHOTO_BACKFILL_BATCH_SIZE);
      const task = (async () => {
        const photoById = await fetchObservationPhotoBatch(batch);
        return applyObservationPhotoBackfill(photoById, options);
      })();

      for (const id of batch) {
        photoBackfillPending.set(id, task.finally(() => {
          photoBackfillPending.delete(id);
        }));
      }

      fetchTasks.push(task);
    }

    const settled = await Promise.allSettled([...pending, ...fetchTasks]);
    const updated = settled.reduce((sum, result) => {
      return sum + (result.status === "fulfilled" ? Number(result.value) || 0 : 0);
    }, 0);

    const failed = settled.find(result => result.status === "rejected");
    if (failed && options.throwOnError) throw failed.reason;

    return {
      requested: uniqueIds.length,
      fetched: toFetch.length,
      updated
    };
  }

  function applyRecentObservationsToFog() {
    if (!window.GridWildFog || typeof window.getCellKeyForLatLng !== "function") {
      return;
    }

    const applyFogMarks = () => {
      window.GridWildFog.clearRecentINatObserved();

      for (const obs of getRecentObservations()) {
        const key = window.getCellKeyForLatLng(obs.lat, obs.lng);
        window.GridWildFog.markRecentINatObserved(key, {
          timestamp: obs.observed_on ? new Date(obs.observed_on).getTime() : Date.now(),
          obsCountIncrement: 1
        });
      }
    };

    if (typeof window.GridWildFog.batchUpdates === "function") {
      window.GridWildFog.batchUpdates(applyFogMarks);
    } else {
      applyFogMarks();
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
    await storeReadyPromise;

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
      observations: []
    };

    await persistObservations(accepted, { username, replace: true });
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
    await storeReadyPromise;

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
      observations: []
    };

    await persistObservations(mergeUniqueObservations(existing, additions), {
      username,
      replace: true
    });
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
      retained: getRecentObservations().length,
      fetched,
      rejected,
      duplicates
    };
  }

  window.GridWildRecentINat = {
    refreshRecentObservations,
    getMoreObservations,
    getRecentObservations,
    ensureObservationPhotos,
    applyRecentObservationsToFog,
    ready: () => storeReadyPromise,
    getCache: () => recentObsCache
  };

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await storeReadyPromise;
      await compactExistingPhotoCache();
    } catch (err) {
      console.warn("Could not compact cached observation photos:", err);
    }

    setTimeout(applyRecentObservationsToFog, 250);
  });
})();
