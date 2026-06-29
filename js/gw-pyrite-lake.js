(function () {
  const DB_NAME = "gridwild-pyrite-lake";
  const DB_VERSION = 1;
  const STORE_NAME = "state";
  const STATE_ID = "current";
  const ENABLED_KEY = "gw_pyrite_lake_enabled";
  const TAXONOMY_URL = "assets/genus_taxonomy_dictionary.json";

  const PER_PAGE = 200;
  const PAGE_DELAY_MS = 1100;
  const MAX_PAGES = 50;
  const MAX_OBSERVATIONS_PER_SEED = 10000;
  const MAX_ACCURACY_M = 100;
  const REQUEST_TIMEOUT_MS = 25000;
  const MAX_PAGE_RETRIES = 2;
  const RETRY_DELAY_MS = 1800;
  const MONTH_COUNT = 12;

  let dbPromise = null;
  let taxonomyPromise = null;
  let taxonomyByName = null;
  let observationsById = new Map();
  let recordsByKey = new Map();
  let metricsByKey = new Map();
  let summary = emptySummary();
  let enabled = localStorage.getItem(ENABLED_KEY) === "true";
  let readyPromise = loadPersisted();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function emptySummary() {
    return {
      observations: 0,
      cells: 0,
      genera: 0,
      observers: 0,
      updated_at: null,
      last_seeded_at: null,
      last_added: 0,
      last_fetched: 0,
      last_rejected: 0,
      last_duplicates: 0,
      max_accuracy_m: MAX_ACCURACY_M
    };
  }

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available."));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open pyrite lake cache."));
      req.onblocked = () =>
        reject(new Error("Pyrite lake cache upgrade is blocked by another tab."));
    });

    return dbPromise;
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Pyrite lake cache transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Pyrite lake cache transaction aborted."));
    });
  }

  async function readState() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const value = await new Promise((resolve, reject) => {
      const req = store.get(STATE_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("Could not read pyrite lake cache."));
    });
    await txDone(tx);
    return value;
  }

  async function writeState() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id: STATE_ID,
      schema_version: 1,
      enabled,
      observations: Array.from(observationsById.values()),
      summary,
      saved_at: new Date().toISOString()
    });
    await txDone(tx);
  }

  async function loadPersisted() {
    try {
      const saved = await readState();

      const rows = Array.isArray(saved?.observations) ? saved.observations : [];
      observationsById = new Map();
      for (const obs of rows) {
        const compact = compactObservation(obs);
        if (compact?.id) observationsById.set(compact.id, compact);
      }

      if (enabled) await rebuildAggregates();
      emitUpdated({ source: "load" });
    } catch (err) {
      console.warn("GridWild pyrite lake cache unavailable; using in-memory pyrite lake.", err);
    }

    return getState();
  }

  async function loadTaxonomyByName() {
    if (taxonomyByName) return taxonomyByName;
    if (taxonomyPromise) return taxonomyPromise;

    taxonomyPromise = fetch(TAXONOMY_URL)
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((data) => {
        taxonomyByName = new Map();
        for (const rec of Object.values(data || {})) {
          const name = rec?.name || rec?.genus_name;
          if (name && !taxonomyByName.has(name)) taxonomyByName.set(name, rec);
        }
        return taxonomyByName;
      })
      .catch((err) => {
        console.warn("Pyrite lake taxonomy lookup unavailable.", err);
        taxonomyByName = new Map();
        return taxonomyByName;
      });

    return taxonomyPromise;
  }

  function normalizeLatLngBounds(bounds) {
    const sw =
      typeof bounds?.getSouthWest === "function"
        ? bounds.getSouthWest()
        : bounds?.sw || bounds?.southWest || bounds;
    const ne =
      typeof bounds?.getNorthEast === "function"
        ? bounds.getNorthEast()
        : bounds?.ne || bounds?.northEast || bounds;

    const swlat = Number(bounds?.swlat ?? bounds?.south ?? sw?.lat);
    const swlng = Number(bounds?.swlng ?? bounds?.west ?? sw?.lng ?? sw?.lon);
    const nelat = Number(bounds?.nelat ?? bounds?.north ?? ne?.lat);
    const nelng = Number(bounds?.nelng ?? bounds?.east ?? ne?.lng ?? ne?.lon);

    if (![swlat, swlng, nelat, nelng].every(Number.isFinite)) return null;

    return {
      swlat: Math.min(swlat, nelat),
      swlng: Math.min(swlng, nelng),
      nelat: Math.max(swlat, nelat),
      nelng: Math.max(swlng, nelng)
    };
  }

  function coordsForApiObs(obs) {
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
    if (obs?.obscured === true || obs?.coordinates_obscured === true) return false;
    if (geoprivacy !== "open") return false;
    if (taxonGeoprivacy !== "open") return false;
    return true;
  }

  function isPreciseEnough(obs, maxAccuracyM = MAX_ACCURACY_M) {
    const acc = Number(obs?.positional_accuracy);
    return Number.isFinite(acc) && acc > 0 && acc <= maxAccuracyM;
  }

  function genusFromTaxon(taxon) {
    const sci = String(taxon?.name || "").trim();
    const m = sci.match(/^([A-Z][a-zA-Z-]+)(?:\s|$)/);
    return m ? m[1] : "";
  }

  function observedDate(obs) {
    const raw = obs?.observed_on || obs?.time_observed_at || obs?.created_at || "";
    const text = String(raw || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function compactObservation(obs) {
    if (!obs || typeof obs !== "object") return null;

    const id = String(obs.id || "").trim();
    const lat = Number(obs.lat);
    const lng = Number(obs.lng);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      id,
      lat,
      lng,
      acc: Number(obs.acc) || null,
      d: observedDate(obs) || obs.d || null,
      t: obs.t || obs.time_observed_at || null,
      sci: String(obs.sci || obs.scientific_name || ""),
      com: String(obs.com || obs.common_name || ""),
      gen: String(obs.gen || obs.genus_name || ""),
      icon: String(obs.icon || obs.iconic_taxon_name || "Unknown"),
      order: String(obs.order || obs.order_name || ""),
      family: String(obs.family || obs.family_name || ""),
      captive: obs.captive === true,
      observer_id: Number(obs.observer_id) || null,
      observer_login: String(obs.observer_login || ""),
      observer_name: String(obs.observer_name || ""),
      uri:
        obs.uri ||
        (id ? `https://www.inaturalist.org/observations/${encodeURIComponent(id)}` : null)
    };
  }

  function normalizeApiObservation(obs, options = {}) {
    const coords = coordsForApiObs(obs);
    if (!coords) return null;

    const maxAccuracyM = Number(options.maxAccuracyM) || MAX_ACCURACY_M;
    if (!isOpenObservation(obs) || !isPreciseEnough(obs, maxAccuracyM)) return null;

    const taxon = obs?.taxon || {};
    const user = obs?.user || {};
    const id = String(obs?.id || "");
    const genus = genusFromTaxon(taxon);

    return compactObservation({
      id,
      lat: coords.lat,
      lng: coords.lng,
      acc: Number(obs?.positional_accuracy) || null,
      d: observedDate(obs),
      t: obs?.time_observed_at || null,
      sci: taxon.name || "",
      com: taxon.preferred_common_name || "",
      gen: genus,
      icon: taxon.iconic_taxon_name || "Unknown",
      captive: obs?.captive === true || obs?.captive_cultivated === true,
      observer_id: Number(user.id) || null,
      observer_login: user.login || "",
      observer_name: user.name || "",
      uri:
        obs?.uri ||
        (id ? `https://www.inaturalist.org/observations/${encodeURIComponent(id)}` : null)
    });
  }

  function cellForObservation(obs) {
    const api = window.GridWildGrid;
    if (!api?.latLngToCell) return null;
    const cell = api.latLngToCell([obs.lat, obs.lng]);
    return Number.isFinite(cell?.ix) && Number.isFinite(cell?.iy) ? cell : null;
  }

  function dateMs(value) {
    if (!value) return 0;
    const ms = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : 0;
  }

  function dateIsoFromMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function median(values) {
    const nums = values
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!nums.length) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function medianLastTenDate(values) {
    const newest = values
      .map(Number)
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => b - a)
      .slice(0, 10);
    return dateIsoFromMs(median(newest));
  }

  function entropy(values) {
    const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    if (!total) return 0;
    return values.reduce((h, value) => {
      const p = (Number(value) || 0) / total;
      return p > 0 ? h - p * Math.log2(p) : h;
    }, 0);
  }

  function metricsFromRecord(record) {
    const rows = Array.isArray(record?.genera)
      ? record.genera
      : record?.genera
        ? [record.genera]
        : [];
    const monthTotals = Array(MONTH_COUNT).fill(0);
    const iconicCounts = {};
    const genusSet = new Set();
    let count = 0;
    let latestMs = dateMs(record?.last_observed);
    let medianMs = dateMs(record?.median_last10_observed);

    for (const row of rows) {
      const c = Number(row?.count) || 0;
      count += c;
      if (row?.genus_name) genusSet.add(row.genus_name);
      const iconic = row?.iconic_taxon_name || "Unknown";
      iconicCounts[iconic] = (iconicCounts[iconic] || 0) + c;
      (row?.month_counts || []).forEach((value, index) => {
        if (index >= 0 && index < MONTH_COUNT) monthTotals[index] += Number(value) || 0;
      });
      latestMs = Math.max(latestMs, dateMs(row?.last_observed));
      medianMs = Math.max(medianMs, dateMs(row?.median_last10_observed));
    }

    const observers = Array.isArray(record?.top_observers)
      ? record.top_observers.filter((row) => Number(row?.count) > 0).length
      : 0;
    const peak = Math.max(...monthTotals);
    const total = monthTotals.reduce((sum, value) => sum + value, 0);
    const dominant = Object.entries(iconicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    return {
      count,
      species: genusSet.size,
      genera: genusSet.size,
      observers,
      n_captive: Number(record?.n_captive) || 0,
      iconic_counts: iconicCounts,
      dominant_iconic: dominant,
      iconic_n: Object.keys(iconicCounts).length,
      month_totals: monthTotals,
      peak_month: monthTotals.indexOf(peak) + 1,
      seasonal_strength: total ? peak / total : 0,
      month_entropy: entropy(monthTotals),
      last_observed: dateIsoFromMs(latestMs),
      median_last10_observed: dateIsoFromMs(medianMs),
      last_observed_ms: latestMs,
      median_last10_observed_ms: medianMs,
      nActiveSquares: count > 0 ? 1 : 0,
      activity_score: Math.log1p(count) * (1 + genusSet.size * 0.05),
      source: "pyrite"
    };
  }

  function filteredRecord(record, iconicTaxa = []) {
    const taxa = Array.isArray(iconicTaxa) ? iconicTaxa.filter(Boolean) : [];
    if (!record || !taxa.length) return record;

    const selected = new Set(taxa);
    const genera = (Array.isArray(record.genera) ? record.genera : []).filter((row) =>
      selected.has(row?.iconic_taxon_name || "Unknown")
    );
    if (!genera.length) return null;

    const totalCount = (Array.isArray(record.genera) ? record.genera : []).reduce(
      (sum, row) => sum + (Number(row?.count) || 0),
      0
    );
    const filteredCount = genera.reduce((sum, row) => sum + (Number(row?.count) || 0), 0);
    const ratio = totalCount > 0 ? Math.max(0, Math.min(1, filteredCount / totalCount)) : 1;
    const topObservers = (Array.isArray(record.top_observers) ? record.top_observers : [])
      .map((row) => ({
        ...row,
        count: Math.round((Number(row?.count) || 0) * ratio),
        species: Math.max(1, Math.round((Number(row?.species) || 0) * ratio))
      }))
      .filter((row) => row.count > 0);

    return {
      ...record,
      genera,
      top_observers: topObservers,
      __metrics: metricsFromRecord({ ...record, genera, top_observers: topObservers })
    };
  }

  async function rebuildAggregates() {
    const cellAcc = new Map();
    const observerIds = new Set();
    const generaSeen = new Set();

    if (!observationsById.size) {
      recordsByKey = new Map();
      metricsByKey = new Map();
      summary = {
        ...summary,
        observations: 0,
        cells: 0,
        genera: 0,
        observers: 0,
        updated_at: new Date().toISOString(),
        max_accuracy_m: MAX_ACCURACY_M
      };
      return;
    }

    const taxonomy = await loadTaxonomyByName();

    for (const obs of observationsById.values()) {
      const cell = cellForObservation(obs);
      if (!cell) continue;

      const key = `${cell.ix},${cell.iy}`;
      if (!cellAcc.has(key)) {
        cellAcc.set(key, {
          ix: cell.ix,
          iy: cell.iy,
          observations: 0,
          captive: 0,
          dates: [],
          genera: new Map(),
          observers: new Map()
        });
      }

      const acc = cellAcc.get(key);
      const genus = obs.gen || String(obs.sci || obs.com || "Unknown").split(/\s+/)[0] || "Unknown";
      const taxonomyRec = taxonomy.get(genus) || null;
      const path = Array.isArray(taxonomyRec?.path_names) ? taxonomyRec.path_names : [];
      const iconic = obs.icon || path[2] || "Unknown";
      const order = obs.order || path[3] || "Unknown";
      const family = obs.family || path[4] || "Unknown";
      const date = obs.d || null;
      const ms = dateMs(date);
      const genusKey = [iconic, order, family, genus].join("||");

      acc.observations++;
      if (obs.captive) acc.captive++;
      if (ms) acc.dates.push(ms);
      generaSeen.add(genus);

      if (!acc.genera.has(genusKey)) {
        acc.genera.set(genusKey, {
          iconic_taxon_name: iconic,
          order_name: order,
          family_name: family,
          genus_name: genus,
          count: 0,
          month_counts: Array(MONTH_COUNT).fill(0),
          dates: []
        });
      }

      const genusRow = acc.genera.get(genusKey);
      genusRow.count++;
      if (ms) {
        genusRow.dates.push(ms);
        const month = new Date(ms).getUTCMonth();
        if (month >= 0 && month < MONTH_COUNT) genusRow.month_counts[month]++;
      }

      const observerKey = obs.observer_id
        ? String(obs.observer_id)
        : obs.observer_login || "unknown";
      if (!acc.observers.has(observerKey)) {
        acc.observers.set(observerKey, {
          observer_id: obs.observer_id || null,
          observer_login: obs.observer_login || "",
          observer_name: obs.observer_name || "",
          observer_url: obs.observer_login
            ? `https://www.inaturalist.org/people/${encodeURIComponent(obs.observer_login)}`
            : "",
          count: 0,
          genera: new Set()
        });
      }
      const observer = acc.observers.get(observerKey);
      observer.count++;
      observer.genera.add(genus);
      if (obs.observer_id) observerIds.add(String(obs.observer_id));
    }

    recordsByKey = new Map();
    metricsByKey = new Map();

    for (const [key, acc] of cellAcc.entries()) {
      const lastObserved = dateIsoFromMs(Math.max(0, ...acc.dates));
      const medianLastTen = medianLastTenDate(acc.dates);
      const genera = Array.from(acc.genera.values())
        .map((row) => {
          const dates = row.dates || [];
          const out = {
            iconic_taxon_name: row.iconic_taxon_name,
            order_name: row.order_name,
            family_name: row.family_name,
            genus_name: row.genus_name,
            count: row.count,
            month_counts: row.month_counts.slice(),
            last_observed: dateIsoFromMs(Math.max(0, ...dates)),
            median_last10_observed: medianLastTenDate(dates)
          };
          return out;
        })
        .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));

      const topObservers = Array.from(acc.observers.values())
        .map((row) => ({
          observer_id: row.observer_id,
          observer_login: row.observer_login,
          observer_name: row.observer_name,
          observer_url: row.observer_url,
          count: row.count,
          species: row.genera.size
        }))
        .sort(
          (a, b) =>
            Number(b.count) - Number(a.count) ||
            Number(b.species) - Number(a.species) ||
            String(a.observer_login || a.observer_id || "").localeCompare(
              String(b.observer_login || b.observer_id || "")
            )
        )
        .slice(0, 20);

      const record = {
        ix: acc.ix,
        iy: acc.iy,
        last_observed: lastObserved,
        median_last10_observed: medianLastTen,
        n_captive: acc.captive,
        genera,
        top_observers: topObservers,
        source: "pyrite"
      };

      record.__metrics = metricsFromRecord(record);
      recordsByKey.set(key, record);
      metricsByKey.set(key, record.__metrics);
    }

    summary = {
      ...summary,
      observations: observationsById.size,
      cells: recordsByKey.size,
      genera: generaSeen.size,
      observers: observerIds.size,
      updated_at: new Date().toISOString(),
      max_accuracy_m: MAX_ACCURACY_M
    };
  }

  function getState() {
    return {
      enabled,
      hasData: observationsById.size > 0,
      summary: { ...summary }
    };
  }

  function hasData() {
    return observationsById.size > 0;
  }

  function isEnabled() {
    return enabled && hasData();
  }

  function selectedTaxaFromOptions(options = {}) {
    return Array.isArray(options.iconicTaxa) ? options.iconicTaxa.filter(Boolean) : [];
  }

  function getMetricsForCell(ix, iy, options = {}) {
    if (!isEnabled()) return null;
    const key = `${ix},${iy}`;
    const taxa = selectedTaxaFromOptions(options);
    if (!taxa.length) return metricsByKey.get(key) || null;

    const rec = filteredRecord(recordsByKey.get(key), taxa);
    return rec?.__metrics || null;
  }

  function getRecordForCell(ix, iy, options = {}) {
    if (!isEnabled()) return null;
    return filteredRecord(recordsByKey.get(`${ix},${iy}`), selectedTaxaFromOptions(options));
  }

  function recordsForBounds(bounds, options = {}) {
    if (!isEnabled() || !bounds) return [];
    const taxa = selectedTaxaFromOptions(options);
    const records = [];

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
        const rec = filteredRecord(recordsByKey.get(`${ix},${iy}`), taxa);
        if (rec) records.push(rec);
      }
    }

    return records;
  }

  function emitProgress(detail = {}) {
    window.dispatchEvent(new CustomEvent("gwPyriteLakeProgress", { detail }));
  }

  function emitUpdated(detail = {}) {
    const state = getState();
    window.dispatchEvent(
      new CustomEvent("gwPyriteLakeUpdated", {
        detail: { ...detail, ...state }
      })
    );

    window.GridWildCoarseHeatCache?.invalidate?.();
    if (typeof window.updateGrid === "function") window.updateGrid();
    if (typeof window.refreshGridWildMobileInfo === "function") window.refreshGridWildMobileInfo();
  }

  function buildQueryUrl(box, page) {
    const url = new URL("https://api.inaturalist.org/v1/observations");
    url.searchParams.set("swlat", String(box.swlat));
    url.searchParams.set("swlng", String(box.swlng));
    url.searchParams.set("nelat", String(box.nelat));
    url.searchParams.set("nelng", String(box.nelng));
    url.searchParams.set("order_by", "observed_on");
    url.searchParams.set("order", "desc");
    url.searchParams.set("geo", "true");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("geoprivacy", "open");
    url.searchParams.set("taxon_geoprivacy", "open");
    return url;
  }

  function formatFetchError(err) {
    if (err?.name === "AbortError") return "request timed out";
    return err?.message || String(err || "request failed");
  }

  function isRetryableFetchError(err) {
    if (err?.name === "AbortError") return true;
    const message = String(err?.message || "");
    return /HTTP (429|5\d\d)/.test(message);
  }

  async function fetchJsonWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url.toString(), {
        signal: controller.signal,
        cache: "no-store"
      });
      if (!resp.ok) throw new Error(`iNaturalist request failed: HTTP ${resp.status}`);
      return await resp.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchInatPageJson(url, progress = {}) {
    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_PAGE_RETRIES + 1; attempt++) {
      try {
        return await fetchJsonWithTimeout(url);
      } catch (err) {
        lastErr = err;
        const canRetry = attempt <= MAX_PAGE_RETRIES && isRetryableFetchError(err);
        if (!canRetry) break;

        emitProgress({
          ...progress,
          status: "retrying",
          attempt,
          maxAttempts: MAX_PAGE_RETRIES + 1,
          message: `iNaturalist page ${progress.page || "?"} ${formatFetchError(err)}; retrying`
        });
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    throw lastErr || new Error("iNaturalist request failed.");
  }

  async function seedFromBounds(bounds, options = {}) {
    await readyPromise;

    const box = normalizeLatLngBounds(bounds);
    if (!box) throw new Error("Selection bounds are not available.");

    const maxPages = Math.max(
      1,
      Math.min(MAX_PAGES, Math.round(Number(options.maxPages) || MAX_PAGES))
    );
    const maxObservations = Math.max(
      1,
      Math.min(
        MAX_OBSERVATIONS_PER_SEED,
        Math.round(Number(options.maxObservations) || MAX_OBSERVATIONS_PER_SEED)
      )
    );
    const maxAccuracyM = Math.max(
      1,
      Math.min(1000, Number(options.maxAccuracyM) || MAX_ACCURACY_M)
    );
    const existingIds = new Set(observationsById.keys());
    const additions = [];
    let fetched = 0;
    let rejected = 0;
    let duplicates = 0;
    let totalResults = null;
    let stoppedEarly = null;

    emitProgress({
      status: "starting",
      context: "selection",
      page: 0,
      fetched,
      accepted: 0,
      rejected,
      duplicates,
      totalResults,
      pct: 0
    });

    for (let page = 1; page <= maxPages; page++) {
      const url = buildQueryUrl(box, page);

      emitProgress({
        status: "fetching",
        context: "selection",
        page,
        fetched,
        accepted: additions.length,
        rejected,
        duplicates,
        totalResults,
        pct: totalResults ? Math.min(98, (fetched / totalResults) * 100) : null
      });

      let data = null;
      try {
        data = await fetchInatPageJson(url, {
          context: "selection",
          page,
          fetched,
          accepted: additions.length,
          rejected,
          duplicates,
          totalResults,
          pct: totalResults ? Math.min(98, (fetched / totalResults) * 100) : null
        });
      } catch (err) {
        stoppedEarly = {
          page,
          message: formatFetchError(err)
        };
        emitProgress({
          status: "stopped_early",
          context: "selection",
          page,
          fetched,
          accepted: additions.length,
          rejected,
          duplicates,
          totalResults,
          message: `Stopped at page ${page}: ${stoppedEarly.message}`,
          pct: totalResults
            ? Math.min(98, (fetched / totalResults) * 100)
            : Math.min(98, (additions.length / maxObservations) * 100)
        });
        break;
      }

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

        const coords = coordsForApiObs(obs);
        if (
          !coords ||
          coords.lat < box.swlat ||
          coords.lat > box.nelat ||
          coords.lng < box.swlng ||
          coords.lng > box.nelng
        ) {
          rejected++;
          continue;
        }

        const normalized = normalizeApiObservation(obs, { maxAccuracyM });
        if (!normalized) {
          rejected++;
          continue;
        }

        existingIds.add(id);
        additions.push(normalized);
        if (additions.length >= maxObservations) break;
      }

      emitProgress({
        status: "page_done",
        context: "selection",
        page,
        fetched,
        accepted: additions.length,
        rejected,
        duplicates,
        totalResults,
        pct: totalResults
          ? Math.min(98, (fetched / totalResults) * 100)
          : Math.min(98, (additions.length / maxObservations) * 100)
      });

      if (additions.length >= maxObservations) break;
      if (results.length < PER_PAGE) break;
      if (totalResults != null && fetched >= totalResults) break;
      await sleep(PAGE_DELAY_MS);
    }

    for (const obs of additions) {
      observationsById.set(obs.id, obs);
    }

    enabled = true;
    localStorage.setItem(ENABLED_KEY, "true");

    emitProgress({
      status: "building",
      context: "selection",
      page: 0,
      fetched,
      accepted: additions.length,
      rejected,
      duplicates,
      totalResults,
      message: "Building pyrite heat cells",
      pct: 99
    });
    await rebuildAggregates();
    summary = {
      ...summary,
      last_seeded_at: new Date().toISOString(),
      last_added: additions.length,
      last_fetched: fetched,
      last_rejected: rejected,
      last_duplicates: duplicates,
      max_accuracy_m: maxAccuracyM
    };
    try {
      emitProgress({
        status: "saving",
        context: "selection",
        page: 0,
        fetched,
        accepted: additions.length,
        rejected,
        duplicates,
        totalResults,
        message: "Saving pyrite lake",
        pct: 99
      });
      await writeState();
    } catch (err) {
      console.warn("Could not persist pyrite seed; using in-memory pyrite lake.", err);
    }

    emitProgress({
      status: "done",
      context: "selection",
      page: 0,
      fetched,
      accepted: additions.length,
      rejected,
      duplicates,
      totalResults,
      stoppedEarly,
      pct: 100
    });
    emitUpdated({ source: "seed", added: additions.length, stoppedEarly });

    return {
      added: additions.length,
      retained: observationsById.size,
      fetched,
      rejected,
      duplicates,
      totalResults,
      stoppedEarly,
      summary: { ...summary }
    };
  }

  async function setEnabled(value) {
    await readyPromise;
    enabled = value !== false;
    if (enabled && observationsById.size && !recordsByKey.size) {
      await rebuildAggregates();
    }
    localStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
    try {
      await writeState();
    } catch (err) {
      console.warn("Could not persist pyrite enabled state.", err);
    }
    emitUpdated({ source: "toggle" });
    return getState();
  }

  async function clear() {
    await readyPromise;
    observationsById = new Map();
    recordsByKey = new Map();
    metricsByKey = new Map();
    summary = emptySummary();
    try {
      await writeState();
    } catch (err) {
      console.warn("Could not persist pyrite clear.", err);
    }
    emitUpdated({ source: "clear" });
    return getState();
  }

  window.GridWildPyriteLake = {
    ready: () => readyPromise,
    seedFromBounds,
    getState,
    hasData,
    isEnabled,
    setEnabled,
    clear,
    getMetricsForCell,
    getRecordForCell,
    recordsForBounds
  };
})();
