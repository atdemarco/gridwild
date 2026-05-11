(function () {
  const STORAGE_KEY = "gw_saved_locations_v1";
  const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
  const REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

  let root = null;
  let pickerMap = null;
  let marker = null;
  let selectedLocation = null;
  let searchTimer = null;
  let reverseTimer = null;
  let activeSearchController = null;
  let activeReverseController = null;
  let suppressMapMove = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatCoord(value) {
    return Number(value).toFixed(6);
  }

  function formatCoordPair(lat, lng) {
    return `${formatCoord(lat)}, ${formatCoord(lng)}`;
  }

  function normalizeLocation(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng ?? location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      id: location.id || `loc_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: String(location.label || location.name || formatCoordPair(lat, lng)).trim(),
      lat,
      lng,
      source: location.source || "manual",
      savedAt: location.savedAt || new Date().toISOString()
    };
  }

  function parseCoordinates(text) {
    const match = String(text || "").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return { lat, lng };
  }

  function loadSavedLocations() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(normalizeLocation).filter(Boolean);
    } catch (err) {
      console.warn("Could not read saved GridWild locations:", err);
      return [];
    }
  }

  function persistSavedLocations(locations) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    window.dispatchEvent(new CustomEvent("gwSavedLocationsChanged", {
      detail: { locations }
    }));
  }

  function saveLocation(location) {
    const next = normalizeLocation(location);
    if (!next) return null;

    const locations = loadSavedLocations();
    const existingIndex = locations.findIndex(item =>
      Math.abs(item.lat - next.lat) < 0.000001 &&
      Math.abs(item.lng - next.lng) < 0.000001
    );

    if (existingIndex >= 0) {
      locations[existingIndex] = {
        ...locations[existingIndex],
        label: next.label || locations[existingIndex].label,
        savedAt: new Date().toISOString()
      };
    } else {
      locations.unshift(next);
    }

    persistSavedLocations(locations.slice(0, 40));
    return existingIndex >= 0 ? locations[existingIndex] : next;
  }

  function clearSavedLocations() {
    persistSavedLocations([]);
  }

  function injectStyles() {
    if (document.getElementById("gwLocationPickerStyles")) return;

    const style = document.createElement("style");
    style.id = "gwLocationPickerStyles";
    style.textContent = `
      .gw-location-picker-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99998;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 14px;
        background: rgba(8, 12, 10, 0.72);
      }

      .gw-location-picker {
        width: min(980px, 96vw);
        max-height: 92vh;
        overflow: hidden;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        border-radius: 22px;
        border: 2px solid rgba(215, 183, 116, 0.58);
        color: #efe6d3;
        background: linear-gradient(180deg, rgba(47, 40, 33, 0.99), rgba(20, 17, 15, 0.99));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      }

      .gw-location-picker-head,
      .gw-location-picker-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px;
        border-color: rgba(215, 183, 116, 0.20);
      }

      .gw-location-picker-head {
        border-bottom: 1px solid rgba(215, 183, 116, 0.20);
      }

      .gw-location-picker-actions {
        border-top: 1px solid rgba(215, 183, 116, 0.20);
      }

      .gw-location-picker-title {
        color: #f0d18a;
        font-size: 20px;
        font-weight: 950;
      }

      .gw-location-picker-subtitle {
        margin-top: 3px;
        color: rgba(239, 230, 211, 0.66);
        font-size: 12px;
      }

      .gw-location-picker-close,
      .gw-location-picker-btn {
        appearance: none;
        border: 1px solid rgba(215, 183, 116, 0.32);
        border-radius: 12px;
        color: #efe6d3;
        background: rgba(255, 255, 255, 0.09);
        font-weight: 900;
        cursor: pointer;
      }

      .gw-location-picker-close {
        width: 36px;
        height: 36px;
        font-size: 20px;
        line-height: 1;
      }

      .gw-location-picker-btn {
        padding: 10px 12px;
      }

      .gw-location-picker-btn.primary {
        border-color: rgba(240, 209, 138, 0.64);
        background: linear-gradient(180deg, #f0d18a, #b8893e);
        color: #201510;
      }

      .gw-location-picker-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .gw-location-picker-body {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        gap: 14px;
        padding: 14px;
      }

      .gw-location-picker-panel {
        min-height: 0;
        overflow: auto;
        padding-right: 2px;
      }

      .gw-location-picker-field {
        display: grid;
        gap: 7px;
      }

      .gw-location-picker-label {
        color: #d7b774;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }

      .gw-location-picker-input {
        width: 100%;
        box-sizing: border-box;
        border-radius: 14px;
        border: 1px solid rgba(215, 183, 116, 0.34);
        padding: 11px;
        color: #efe6d3;
        background: rgba(20, 17, 15, 0.88);
        font-size: 14px;
      }

      .gw-location-picker-status,
      .gw-location-picker-attribution {
        color: rgba(239, 230, 211, 0.60);
        font-size: 11px;
        line-height: 1.35;
      }

      .gw-location-picker-results,
      .gw-location-picker-saved {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .gw-location-picker-section-title {
        margin-top: 16px;
        color: #f0d18a;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-location-picker-row {
        appearance: none;
        width: 100%;
        display: grid;
        gap: 3px;
        text-align: left;
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(215, 183, 116, 0.18);
        color: #efe6d3;
        background: rgba(255, 255, 255, 0.06);
        cursor: pointer;
      }

      .gw-location-picker-row strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }

      .gw-location-picker-row span {
        color: rgba(239, 230, 211, 0.62);
        font-size: 11px;
      }

      .gw-location-picker-mapwrap {
        position: relative;
        min-height: clamp(320px, 58vh, 540px);
        height: 100%;
        border-radius: 16px;
        border: 1px solid rgba(215, 183, 116, 0.22);
        overflow: hidden;
        background: #1c211d;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      #gwLocationPickerMap {
        position: absolute;
        inset: 0;
      }

      .gw-location-picker-crosshair {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 500;
        width: 28px;
        height: 28px;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .gw-location-picker-crosshair::before,
      .gw-location-picker-crosshair::after {
        content: "";
        position: absolute;
        background: rgba(240, 209, 138, 0.92);
        box-shadow: 0 0 0 1px rgba(20, 17, 15, 0.75);
      }

      .gw-location-picker-crosshair::before {
        left: 13px;
        top: 0;
        width: 2px;
        height: 28px;
      }

      .gw-location-picker-crosshair::after {
        left: 0;
        top: 13px;
        width: 28px;
        height: 2px;
      }

      .gw-location-picker-coords {
        position: absolute;
        left: 12px;
        bottom: 12px;
        z-index: 501;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(215, 183, 116, 0.36);
        color: #f0d18a;
        background: rgba(20, 17, 15, 0.90);
        font-size: 12px;
        font-weight: 900;
        pointer-events: none;
      }

      @media (max-width: 720px) {
        .gw-location-picker {
          width: 100%;
          max-height: 94vh;
        }

        .gw-location-picker-body {
          grid-template-columns: 1fr;
          gap: 12px;
          padding: 12px;
        }

        .gw-location-picker-panel {
          max-height: 38vh;
          border-right: 0;
          padding-right: 0;
        }

        .gw-location-picker-mapwrap {
          min-height: clamp(240px, 36vh, 360px);
          height: clamp(240px, 36vh, 360px);
        }

        .gw-location-picker-actions {
          align-items: stretch;
          flex-direction: column;
        }

        .gw-location-picker-actions .gw-location-picker-btn {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function geocodeUrl(query) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6"
    });
    return `${SEARCH_ENDPOINT}?${params.toString()}`;
  }

  function reverseUrl(lat, lng) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      zoom: "16",
      addressdetails: "1"
    });
    return `${REVERSE_ENDPOINT}?${params.toString()}`;
  }

  function setStatus(message) {
    const el = root?.querySelector("#gwLocationPickerStatus");
    if (el) el.textContent = message || "";
  }

  function renderResults(results) {
    const el = root?.querySelector("#gwLocationPickerResults");
    if (!el) return;

    if (!results.length) {
      el.innerHTML = `<div class="gw-location-picker-status">No matching locations found.</div>`;
      return;
    }

    el.innerHTML = results.map(result => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      return `
        <button class="gw-location-picker-row" type="button" data-lat="${lat}" data-lng="${lng}" data-label="${escapeHtml(result.display_name || "")}">
          <strong>${escapeHtml(result.name || result.display_name || formatCoordPair(lat, lng))}</strong>
          <span>${escapeHtml(result.display_name || formatCoordPair(lat, lng))}</span>
        </button>
      `;
    }).join("");

    el.querySelectorAll(".gw-location-picker-row").forEach(row => {
      row.addEventListener("click", () => {
        setSelectedLocation({
          lat: Number(row.dataset.lat),
          lng: Number(row.dataset.lng),
          label: row.dataset.label,
          source: "search"
        }, { panMap: true, inputValue: row.dataset.label });
      });
    });
  }

  async function searchLocations(query) {
    if (!query.trim()) {
      renderResults([]);
      setStatus("");
      return;
    }

    const parsed = parseCoordinates(query);
    if (parsed) {
      setSelectedLocation({
        ...parsed,
        label: formatCoordPair(parsed.lat, parsed.lng),
        source: "typed-coordinates"
      }, { panMap: true, inputValue: formatCoordPair(parsed.lat, parsed.lng), reverseLookup: true });
      renderResults([]);
      return;
    }

    activeSearchController?.abort();
    activeSearchController = new AbortController();
    setStatus("Looking up locations...");

    try {
      const response = await fetch(geocodeUrl(query), {
        signal: activeSearchController.signal,
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`Lookup failed (${response.status})`);

      const results = await response.json();
      renderResults(Array.isArray(results) ? results : []);
      setStatus("Choose a result or place the crosshair on the map.");
    } catch (err) {
      if (err.name === "AbortError") return;
      console.warn("GridWild location lookup failed:", err);
      setStatus("Location lookup is unavailable right now.");
    }
  }

  async function reverseLookup(lat, lng) {
    activeReverseController?.abort();
    activeReverseController = new AbortController();

    try {
      const response = await fetch(reverseUrl(lat, lng), {
        signal: activeReverseController.signal,
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`Reverse lookup failed (${response.status})`);

      const data = await response.json();
      if (!selectedLocation) return;
      selectedLocation.label = data?.display_name || selectedLocation.label || formatCoordPair(lat, lng);
      setStatus(selectedLocation.label);
    } catch (err) {
      if (err.name !== "AbortError") {
        setStatus("Coordinates set. Place name lookup is unavailable.");
      }
    }
  }

  function scheduleReverseLookup(lat, lng) {
    clearTimeout(reverseTimer);
    reverseTimer = setTimeout(() => reverseLookup(lat, lng), 550);
  }

  function updateSelectedUi(inputValue) {
    const input = root?.querySelector("#gwLocationPickerInput");
    const coord = root?.querySelector("#gwLocationPickerCoords");
    const saveBtn = root?.querySelector("#gwLocationPickerSaveBtn");

    if (input && inputValue != null) input.value = inputValue;
    if (coord && selectedLocation) {
      coord.textContent = formatCoordPair(selectedLocation.lat, selectedLocation.lng);
    }
    if (saveBtn) saveBtn.disabled = !selectedLocation;
  }

  function clearSelectionForPendingSearch() {
    selectedLocation = null;
    const saveBtn = root?.querySelector("#gwLocationPickerSaveBtn");
    if (saveBtn) saveBtn.disabled = true;
  }

  function setSelectedLocation(location, options = {}) {
    const normalized = normalizeLocation(location);
    if (!normalized) return;

    selectedLocation = normalized;
    updateSelectedUi(options.inputValue ?? formatCoordPair(normalized.lat, normalized.lng));

    if (marker) {
      marker.setLatLng([normalized.lat, normalized.lng]);
    }

    if (pickerMap && options.panMap) {
      suppressMapMove = true;
      pickerMap.setView([normalized.lat, normalized.lng], Math.max(pickerMap.getZoom(), 14), { animate: true });
      window.setTimeout(() => {
        suppressMapMove = false;
      }, 350);
    }

    if (options.reverseLookup) {
      scheduleReverseLookup(normalized.lat, normalized.lng);
    } else {
      setStatus(normalized.label);
    }
  }

  function renderSavedLocations() {
    const el = root?.querySelector("#gwLocationPickerSaved");
    if (!el) return;

    const saved = loadSavedLocations();
    if (!saved.length) {
      el.innerHTML = `<div class="gw-location-picker-status">No saved locations yet.</div>`;
      return;
    }

    el.innerHTML = saved.map(location => `
      <button class="gw-location-picker-row" type="button" data-id="${escapeHtml(location.id)}">
        <strong>${escapeHtml(location.label)}</strong>
        <span>${escapeHtml(formatCoordPair(location.lat, location.lng))}</span>
      </button>
    `).join("");

    el.querySelectorAll(".gw-location-picker-row").forEach(row => {
      row.addEventListener("click", () => {
        const location = saved.find(item => item.id === row.dataset.id);
        if (location) {
          setSelectedLocation(location, {
            panMap: true,
            inputValue: location.label || formatCoordPair(location.lat, location.lng)
          });
        }
      });
    });
  }

  function initInsetMap(startLocation) {
    if (!window.L) {
      setStatus("Leaflet is not loaded, so the picker map cannot start.");
      return;
    }

    const host = root.querySelector("#gwLocationPickerMap");
    const center = startLocation || { lat: 38.911325, lng: -77.076678 };
    const zoom = window.map?.getZoom?.() || 16;

    pickerMap = L.map(host, {
      zoomControl: true,
      attributionControl: true
    }).setView([center.lat, center.lng], Math.min(Math.max(zoom, 12), 18));

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
    }).addTo(pickerMap);

    marker = L.circleMarker([center.lat, center.lng], {
      radius: 7,
      weight: 2,
      color: "#201510",
      fillColor: "#f0d18a",
      fillOpacity: 0.95
    }).addTo(pickerMap);

    pickerMap.on("click", event => {
      setSelectedLocation({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        label: formatCoordPair(event.latlng.lat, event.latlng.lng),
        source: "map-click"
      }, { inputValue: formatCoordPair(event.latlng.lat, event.latlng.lng), reverseLookup: true });
    });

    pickerMap.on("moveend", () => {
      if (suppressMapMove) return;
      const centerPoint = pickerMap.getCenter();
      setSelectedLocation({
        lat: centerPoint.lat,
        lng: centerPoint.lng,
        label: formatCoordPair(centerPoint.lat, centerPoint.lng),
        source: "map-center"
      }, { inputValue: formatCoordPair(centerPoint.lat, centerPoint.lng), reverseLookup: true });
    });

    window.setTimeout(() => pickerMap.invalidateSize(), 60);
  }

  function getInitialLocation(options = {}) {
    const optionLocation = normalizeLocation(options.location);
    if (optionLocation) return optionLocation;

    const center = window.map?.getCenter?.();
    if (center) {
      return {
        id: "current_map_center",
        label: formatCoordPair(center.lat, center.lng),
        lat: center.lat,
        lng: center.lng,
        source: "current-map"
      };
    }

    return {
      id: "default_gridwild_home",
      label: "Georgetown Pollinator Garden",
      lat: 38.911325,
      lng: -77.076678,
      source: "default"
    };
  }

  function close() {
    activeSearchController?.abort();
    activeReverseController?.abort();
    clearTimeout(searchTimer);
    clearTimeout(reverseTimer);

    if (pickerMap) {
      pickerMap.remove();
      pickerMap = null;
      marker = null;
    }

    root?.remove();
    root = null;
  }

  function open(options = {}) {
    if (root) close();
    injectStyles();

    const initial = getInitialLocation(options);
    selectedLocation = initial;

    root = document.createElement("div");
    root.className = "gw-location-picker-backdrop";
    root.setAttribute("role", "presentation");
    root.innerHTML = `
      <div class="gw-location-picker" role="dialog" aria-modal="true" aria-labelledby="gwLocationPickerTitle">
        <header class="gw-location-picker-head">
          <div>
            <div class="gw-location-picker-title" id="gwLocationPickerTitle">Location Picker</div>
            <div class="gw-location-picker-subtitle">Search by place name, type coordinates, or move the inset map.</div>
          </div>
          <button class="gw-location-picker-close" id="gwLocationPickerCloseBtn" type="button" aria-label="Close">&times;</button>
        </header>

        <div class="gw-location-picker-body">
          <section class="gw-location-picker-panel">
            <label class="gw-location-picker-field">
              <span class="gw-location-picker-label">Location</span>
              <input class="gw-location-picker-input" id="gwLocationPickerInput" type="text" autocomplete="off" value="${escapeHtml(formatCoordPair(initial.lat, initial.lng))}">
            </label>

            <div class="gw-location-picker-status" id="gwLocationPickerStatus">Move the map crosshair or search for a place.</div>
            <div class="gw-location-picker-attribution">Lookup uses OpenStreetMap Nominatim.</div>

            <div class="gw-location-picker-results" id="gwLocationPickerResults"></div>

            <div class="gw-location-picker-section-title">Saved Locations</div>
            <div class="gw-location-picker-saved" id="gwLocationPickerSaved"></div>
          </section>

          <section class="gw-location-picker-mapwrap">
            <div id="gwLocationPickerMap"></div>
            <div class="gw-location-picker-crosshair" aria-hidden="true"></div>
            <div class="gw-location-picker-coords" id="gwLocationPickerCoords">${escapeHtml(formatCoordPair(initial.lat, initial.lng))}</div>
          </section>
        </div>

        <footer class="gw-location-picker-actions">
          <button class="gw-location-picker-btn" id="gwLocationPickerUseMainMapBtn" type="button">Use Main Map Center</button>
          ${
            typeof options.onSelect === "function"
              ? `<button class="gw-location-picker-btn" id="gwLocationPickerUseSelectedBtn" type="button">${escapeHtml(options.selectButtonLabel || "Use selected")}</button>`
              : ""
          }
          <button class="gw-location-picker-btn" id="gwLocationPickerGoBtn" type="button">Go To Location</button>
          <button class="gw-location-picker-btn primary" id="gwLocationPickerSaveBtn" type="button">Save location</button>
        </footer>
      </div>
    `;

    document.body.appendChild(root);
    renderSavedLocations();
    initInsetMap(initial);
    setSelectedLocation(initial, { inputValue: formatCoordPair(initial.lat, initial.lng) });

    const input = root.querySelector("#gwLocationPickerInput");
    input?.focus();
    input?.select();

    input?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      if (!parseCoordinates(input.value)) {
        clearSelectionForPendingSearch();
      }
      searchTimer = setTimeout(() => searchLocations(input.value), 350);
    });

    input?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        clearTimeout(searchTimer);
        searchLocations(input.value);
      }
    });

    root.querySelector("#gwLocationPickerCloseBtn")?.addEventListener("click", close);

    root.querySelector("#gwLocationPickerUseMainMapBtn")?.addEventListener("click", () => {
      const center = window.map?.getCenter?.();
      if (!center) return;
      setSelectedLocation({
        lat: center.lat,
        lng: center.lng,
        label: formatCoordPair(center.lat, center.lng),
        source: "current-map"
      }, { panMap: true, inputValue: formatCoordPair(center.lat, center.lng), reverseLookup: true });
    });

    root.querySelector("#gwLocationPickerUseSelectedBtn")?.addEventListener("click", () => {
      if (!selectedLocation || typeof options.onSelect !== "function") return;
      options.onSelect({ ...selectedLocation });
      close();
    });

    root.querySelector("#gwLocationPickerGoBtn")?.addEventListener("click", () => {
      if (!selectedLocation) return;

      const didJump = typeof window.jumpToGridWildGps === "function"
        ? window.jumpToGridWildGps(selectedLocation.lat, selectedLocation.lng)
        : false;

      if (!didJump && window.map) {
        window.map.setView(
          [selectedLocation.lat, selectedLocation.lng],
          Math.max(window.map.getZoom(), 18),
          { animate: true }
        );
      }

      close();
    });

    root.querySelector("#gwLocationPickerSaveBtn")?.addEventListener("click", () => {
      if (!selectedLocation) return;
      const typed = input?.value?.trim();
      const parsed = parseCoordinates(typed);
      const label = parsed ? selectedLocation.label : typed;
      const saved = saveLocation({
        ...selectedLocation,
        label: label || selectedLocation.label || formatCoordPair(selectedLocation.lat, selectedLocation.lng)
      });
      selectedLocation = saved || selectedLocation;
      renderSavedLocations();
      setStatus("Location saved.");
    });

    root.addEventListener("click", event => {
      if (event.target === root) close();
    });

    root.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
    });
  }

  function bindLauncher() {
    document.getElementById("gwLocationPickerBtn")?.addEventListener("click", () => open());
  }

  window.GridWildLocationPicker = {
    open,
    close,
    saveLocation,
    clearSavedLocations,
    getSavedLocations: loadSavedLocations
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLauncher);
  } else {
    bindLauncher();
  }
})();
