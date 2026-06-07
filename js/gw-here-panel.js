(function () {
  const HERE_RADIUS_CELLS = 7;
  const MAX_TAXA_CELLS = 225;
  const MAX_SELECTION_TAXA_CELLS = 1600;
  const TAXON_COLORS = [
    "#79c86b",
    "#e0b24d",
    "#62b7c7",
    "#d47b63",
    "#9a8bd8",
    "#c77fb6",
    "#7fb069",
    "#d19a66",
    "#6f9ed4"
  ];

  const HERE_MAP_3D_STORAGE_KEY = "gw_here_map_3d_enabled";
  const HERE_ELEVATION_STORAGE_KEY = "gw_here_elevation_cache_v1";
  const HERE_ELEVATION_ENDPOINT = "/.netlify/functions/get-elevation";
  const HERE_ELEVATION_SAMPLE_CELLS = 24;
  const HERE_ELEVATION_MAX_BATCH = 40;
  const HERE_ELEVATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 120;
  const HERE_ELEVATION_MAX_CACHE_ENTRIES = 2600;
  const HERE_ELEVATION_MIN_FETCH_INTERVAL_MS = 1000 * 60;
  const HERE_ELEVATION_REQUEST_COOLDOWN_MS = 1000 * 60 * 20;
  const HERE_ELEVATION_RETRY_BASE_MS = 1000 * 60 * 10;
  const HERE_ELEVATION_RETRY_MAX_MS = 1000 * 60 * 60 * 2;
  const HERE_ELEVATION_QUEUE_DELAY_MS = 2500;
  const HERE_ELEVATION_MAX_PENDING = 180;
  const HERE_ELEVATION_LOCAL_Z_SCALE_M = 34;
  const HERE_ELEVATION_LOCAL_Z_MIN = -0.9;
  const HERE_ELEVATION_LOCAL_Z_MAX = 3.6;
  const HERE_LIST_VIEWS = [
    { id: "common", label: "Common Taxa" },
    { id: "rare", label: "Rare Taxa" },
    { id: "observers", label: "Top Observers" }
  ];
  let hereMap3dEnabled = localStorage.getItem(HERE_MAP_3D_STORAGE_KEY) === "true";
  let hereMap3dExpanded = false;
  let hereMap3dYawOffsetDeg = 0;
  let hereMap3dDrag = null;
  let hereListView = "common";
  let hereElevationCacheLoaded = false;
  let hereElevationFetchInFlight = false;
  let hereElevationFetchQueued = false;
  let hereElevationDisabledUntil = 0;
  let hereElevationLastFetchAt = 0;
  let hereElevationRetryDelayMs = HERE_ELEVATION_RETRY_BASE_MS;
  const hereElevationCache = new Map();
  const hereElevationPending = new Map();
  const hereElevationRequestedAt = new Map();
  const hereObservationDownload = {
    busy: false,
    progressText: "",
    progressPct: 0
  };
  const herePyriteSeed = {
    busy: false,
    progressText: "",
    progressPct: 0
  };
  const HERE_3D_CAMERA = {
    pitchDeg: 48,
    fovDeg: 52,
    avatarScreenY: 0.76
  };

  function gridApi() {
    return window.GridWildGrid;
  }

  function esc(value) {
    return gridApi()?.escapeHtml?.(value) || String(value ?? "");
  }

  function toast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    }
  }

  function injectStyles() {
    if (document.getElementById("gwHerePanelStyles")) return;
    const style = document.createElement("style");
    style.id = "gwHerePanelStyles";
    style.textContent = `
      .gw-hud-toolband.has-here-tools {
        width: var(--gw-hud-control-width);
        grid-template-columns: repeat(3, var(--gw-hud-round-button-size));
        grid-auto-flow: row;
      }

      .gw-hud-toolband.has-here-tools .gw-hud-round-btn {
        box-sizing: border-box;
      }

      .gw-hud-select-btn.is-armed,
      .gw-hud-select-btn.has-selection,
      .gw-hud-investigate-btn.is-on {
        color: #ffe7a3;
        border-color: rgba(240,209,138,0.72);
        box-shadow:
          0 14px 34px rgba(0,0,0,0.46),
          inset 0 0 0 1px rgba(255,225,151,0.28),
          0 0 12px rgba(240,209,138,0.18);
      }

      .gw-hud-select-btn .gw-select-hand-icon,
      .gw-hud-select-btn.has-selection .gw-select-lasso-icon {
        display: none;
      }

      .gw-hud-select-btn.has-selection .gw-select-hand-icon {
        display: block;
      }

      .gw-selection-active #map {
        cursor: crosshair;
        touch-action: none;
      }

      .gw-here-panel {
        box-sizing: border-box;
        position: absolute;
        right: 12px;
        top: max(74px, calc(env(safe-area-inset-top) + 74px));
        z-index: 1325;
        width: 248px;
        pointer-events: auto;
        color: #efe6d3;
        background:
          linear-gradient(180deg, rgba(43, 36, 29, 0.97), rgba(20, 17, 15, 0.99));
        border: 1px solid rgba(240, 209, 138, 0.42);
        border-radius: 8px;
        box-shadow:
          0 14px 34px rgba(0,0,0,0.46),
          inset 0 1px 0 rgba(255,255,255,0.06),
          inset 0 0 0 1px rgba(255,255,255,0.025);
        padding: 9px;
        backdrop-filter: blur(4px) saturate(0.85);
        -webkit-backdrop-filter: blur(4px) saturate(0.85);
      }

      .gw-here-panel[hidden] {
        display: none;
      }

      .gw-here-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .gw-here-title {
        font-size: 11px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: 0;
        text-transform: uppercase;
        color: #f0d18a;
      }

      .gw-here-meta {
        font-size: 9.5px;
        line-height: 1;
        color: rgba(239,230,211,0.62);
        white-space: nowrap;
      }

      .gw-here-map {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 0.72;
        overflow: hidden;
        border: 1px solid rgba(240,209,138,0.26);
        border-radius: 6px;
        background: rgba(8, 10, 9, 0.56);
      }

      .gw-here-map-toggle {
        position: absolute;
        top: 5px;
        right: 5px;
        z-index: 3;
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.36);
        background: rgba(20,17,15,0.82);
        color: rgba(239,230,211,0.72);
        box-shadow: 0 5px 12px rgba(0,0,0,0.28);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .gw-here-map-toggle input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .gw-here-map-toggle-mark {
        width: 11px;
        height: 7px;
        border-left: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(-45deg) translate(1px, -1px);
        opacity: 0.28;
      }

      .gw-here-map-toggle input:checked + .gw-here-map-toggle-mark {
        color: #f0d18a;
        opacity: 1;
      }

      .gw-here-map.is-3d {
        background:
          radial-gradient(circle at 50% 12%, rgba(240,209,138,0.10), transparent 42%),
          linear-gradient(180deg, rgba(13,18,17,0.78), rgba(6,8,8,0.92));
        touch-action: none;
        cursor: grab;
      }

      .gw-here-map.is-3d:active {
        cursor: grabbing;
      }

      .gw-here-map.is-expanded {
        position: fixed;
        top: max(72px, calc(env(safe-area-inset-top) + 72px));
        right: 14px;
        width: min(680px, calc(100vw - 28px));
        height: min(520px, calc(100vh - 138px));
        aspect-ratio: auto;
        z-index: 1580;
        border-color: rgba(240,209,138,0.58);
        box-shadow:
          0 24px 90px rgba(0,0,0,0.62),
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 0 0 1px rgba(255,231,163,0.10);
      }

      .gw-here-map-expand {
        position: absolute;
        top: 31px;
        right: 5px;
        z-index: 3;
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.36);
        background: rgba(20,17,15,0.82);
        color: #f0d18a;
        box-shadow: 0 5px 12px rgba(0,0,0,0.28);
        cursor: pointer;
        padding: 0;
        font-size: 14px;
        font-weight: 950;
        line-height: 1;
      }

      .gw-here-map.is-expanded .gw-here-map-expand {
        font-size: 16px;
      }

      .gw-here-3d-controls {
        position: absolute;
        left: 7px;
        bottom: 7px;
        z-index: 3;
        display: inline-flex;
        gap: 4px;
        padding: 3px;
        border-radius: 999px;
        background: rgba(20,17,15,0.72);
        border: 1px solid rgba(240,209,138,0.22);
        box-shadow: 0 5px 12px rgba(0,0,0,0.22);
      }

      .gw-here-3d-control {
        width: 22px;
        height: 20px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 999px;
        padding: 0;
        color: rgba(239,230,211,0.82);
        background: rgba(255,255,255,0.06);
        cursor: pointer;
        font-size: 12px;
        font-weight: 950;
        line-height: 1;
      }

      .gw-here-3d-control:hover {
        color: #f0d18a;
        background: rgba(240,209,138,0.14);
      }

      .gw-here-map svg,
      .gw-here-pie svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .gw-here-pie {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 0.76;
        margin-top: 9px;
        overflow: hidden;
        border-radius: 6px;
        background: rgba(239,230,211,0.08);
        border: 1px solid rgba(240,209,138,0.16);
      }

      .gw-here-pie-chart {
        width: 100%;
        height: 100%;
      }

      .gw-here-pie-home {
        position: absolute;
        right: 5px;
        top: 5px;
        z-index: 2;
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: #f0d18a;
        background: rgba(20,17,15,0.82);
        border: 1px solid rgba(240,209,138,0.36);
        box-shadow: 0 5px 12px rgba(0,0,0,0.28);
        padding: 0;
        cursor: pointer;
      }

      .gw-here-pie-home svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-here-pie-slice {
        cursor: zoom-in;
        transition: filter 120ms ease, transform 120ms ease;
      }

      .gw-here-pie-slice:hover {
        filter: brightness(1.12) saturate(1.08);
      }

      .gw-here-taxa-list {
        display: grid;
        gap: 6px;
        margin-top: 8px;
      }

      .gw-here-list-switch {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 3px;
        padding: 2px;
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.18);
        background: rgba(0,0,0,0.18);
        min-width: 0;
      }

      .gw-here-list-option {
        position: relative;
        display: block;
        min-width: 0;
      }

      .gw-here-list-option input {
        position: absolute;
        inset: 0;
        opacity: 0;
        margin: 0;
        cursor: pointer;
      }

      .gw-here-list-pill {
        box-sizing: border-box;
        min-width: 0;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0 5px;
        color: rgba(239,230,211,0.72);
        font-size: 7.4px;
        line-height: 1;
        font-weight: 950;
        text-align: center;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
        user-select: none;
      }

      .gw-here-list-option input:checked + .gw-here-list-pill {
        color: #201a14;
        background: #f0d18a;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.34),
          0 5px 12px rgba(0,0,0,0.24);
      }

      .gw-here-list-option input:focus-visible + .gw-here-list-pill {
        outline: 2px solid rgba(255,231,163,0.72);
        outline-offset: 2px;
      }

      .gw-here-list-option:hover .gw-here-list-pill {
        color: #f0d18a;
      }

      .gw-here-list-option:hover input:checked + .gw-here-list-pill {
        color: #201a14;
      }

      .gw-here-list-body {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .gw-here-taxa-group {
        display: grid;
        gap: 4px;
      }

      .gw-here-taxa-heading {
        font-size: 8.5px;
        line-height: 1;
        color: rgba(240,209,138,0.72);
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-here-inline-list {
        display: block;
        color: rgba(239,230,211,0.76);
        font-size: 10px;
        line-height: 1.55;
      }

      .gw-here-inline-item {
        display: inline-block;
        vertical-align: baseline;
        white-space: nowrap;
      }

      .gw-here-inline-link {
        display: inline;
        border: 0;
        background: transparent;
        color: rgba(239,230,211,0.92);
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: 850;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }

      .gw-here-inline-link:hover {
        color: #f0d18a;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .gw-here-inline-count {
        color: rgba(239,230,211,0.50);
        font-size: 0.82em;
        font-weight: 750;
      }

      .gw-here-inline-comma {
        color: rgba(239,230,211,0.42);
      }

      .gw-here-taxa-row {
        width: 100%;
        min-width: 0;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 7px;
        border: 1px solid rgba(240,209,138,0.13);
        border-radius: 6px;
        background: rgba(0,0,0,0.14);
        color: rgba(239,230,211,0.88);
        padding: 5px 6px;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-here-taxa-row:hover {
        border-color: rgba(240,209,138,0.30);
        background: rgba(240,209,138,0.08);
      }

      .gw-here-observer-row {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        border: 1px solid rgba(240,209,138,0.13);
        border-radius: 6px;
        background: rgba(0,0,0,0.14);
        color: rgba(239,230,211,0.88);
        padding: 5px 6px;
        box-sizing: border-box;
      }

      .gw-here-observer-avatar {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        background: rgba(240,209,138,0.10);
        border: 1px solid rgba(240,209,138,0.22);
      }

      .gw-here-observer-avatar.is-empty {
        display: grid;
        place-items: center;
        color: rgba(240,209,138,0.82);
        font-size: 10px;
        font-weight: 950;
      }

      .gw-here-observer-name {
        min-width: 0;
        display: grid;
        gap: 1px;
      }

      .gw-here-observer-login,
      .gw-here-observer-real {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-observer-login {
        font-size: 10px;
        font-weight: 850;
      }

      .gw-here-observer-real {
        font-size: 8.5px;
        font-weight: 750;
        color: rgba(239,230,211,0.50);
      }

      .gw-here-taxa-name {
        min-width: 0;
        display: grid;
        gap: 1px;
        overflow: hidden;
        font-size: 10px;
        font-weight: 850;
      }

      .gw-here-taxa-name-main,
      .gw-here-taxa-name-sub {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-taxa-name-sub {
        font-size: 8.5px;
        font-weight: 750;
        color: rgba(239,230,211,0.50);
      }

      .gw-here-taxa-count {
        flex: 0 0 auto;
        font-size: 9px;
        color: rgba(239,230,211,0.58);
        white-space: nowrap;
      }

      .gw-here-stats {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        margin-top: 6px;
        padding: 5px 6px;
        border-radius: 6px;
        border: 1px solid rgba(240,209,138,0.14);
        background: rgba(0,0,0,0.16);
        overflow: hidden;
      }

      .gw-here-stat {
        min-width: 0;
        flex: 0 1 auto;
        display: inline-flex;
        align-items: baseline;
        justify-content: center;
        gap: 2px;
        padding: 0;
        line-height: 1;
      }

      .gw-here-stat + .gw-here-stat::before {
        content: "|";
        color: rgba(240,209,138,0.32);
        font-size: 9px;
        font-weight: 800;
        line-height: 1;
        margin-right: 5px;
      }

      .gw-here-stat b,
      .gw-here-stat span {
        display: inline;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-stat b {
        font-size: 10px;
        line-height: 1.05;
      }

      .gw-here-stat span {
        font-size: 7.7px;
        line-height: 1;
        color: rgba(239,230,211,0.58);
        text-transform: uppercase;
        font-weight: 850;
      }

      .gw-here-download {
        display: grid;
        gap: 5px;
        margin-top: 6px;
      }

      .gw-here-download.is-hidden {
        display: none;
      }

      .gw-here-download-btn {
        width: 100%;
        min-height: 21px;
        border-radius: 6px;
        border: 1px solid rgba(240,209,138,0.18);
        background: rgba(240,209,138,0.06);
        color: rgba(239,230,211,0.72);
        font-size: 8px;
        line-height: 1;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0;
        cursor: pointer;
      }

      .gw-here-download-btn:hover:not(:disabled) {
        color: #f0d18a;
        border-color: rgba(240,209,138,0.34);
        background: rgba(240,209,138,0.10);
      }

      .gw-here-download-btn:disabled {
        opacity: 0.48;
        cursor: default;
      }

      .gw-here-pyrite-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 4px;
      }

      .gw-here-pyrite-actions .gw-here-download-btn {
        min-width: 0;
        padding: 0 5px;
      }

      .gw-here-pyrite-summary {
        margin-top: 4px;
        font-size: 8px;
        line-height: 1.25;
        color: rgba(239,230,211,0.58);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-here-download-progress {
        display: none;
        gap: 4px;
      }

      .gw-here-download-progress.is-active {
        display: grid;
      }

      .gw-here-download-progress-text {
        color: rgba(239,230,211,0.56);
        font-size: 8px;
        line-height: 1.15;
        font-weight: 800;
      }

      .gw-here-download-progress-track {
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(215,183,116,0.16);
      }

      .gw-here-download-progress-bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
        transition: width 160ms ease;
      }

      .gw-selection-rect {
        stroke: #ffe7a3;
        stroke-width: 2.4;
        stroke-dasharray: 6 5;
        stroke-linejoin: round;
        fill: rgba(255,231,163,0.08);
        animation: gw-selection-dash 1.1s linear infinite;
      }

      @keyframes gw-selection-dash {
        to { stroke-dashoffset: -22; }
      }

      @media (max-width: 760px) {
        .gw-here-panel {
          top: max(70px, calc(env(safe-area-inset-top) + 70px));
          right: 9px;
          width: 176px;
          padding: 7px;
        }

        .gw-here-map {
          aspect-ratio: 1 / 0.82;
        }

        .gw-here-pie {
          aspect-ratio: 1 / 0.88;
        }

        .gw-here-taxa-list {
          max-height: 154px;
          overflow: auto;
        }

        .gw-here-list-switch {
          gap: 2px;
        }

        .gw-here-list-pill {
          height: 21px;
          padding: 0 3px;
          font-size: 6.4px;
        }

        .gw-here-stat {
          gap: 1px;
        }

        .gw-here-stat span {
          margin-top: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const band = document.querySelector(".gw-hud-toolband");
    if (!band) return;

    band.classList.add("has-here-tools");

    if (!document.getElementById("gwHudInvestigateBtn")) {
      const investigateBtn = document.createElement("button");
      investigateBtn.className = "gw-pill gw-hud-round-btn gw-hud-investigate-btn";
      investigateBtn.id = "gwHudInvestigateBtn";
      investigateBtn.type = "button";
      investigateBtn.setAttribute("aria-label", "Investigate here");
      investigateBtn.setAttribute("aria-expanded", "false");
      investigateBtn.setAttribute("aria-controls", "gwHerePanel");
      investigateBtn.title = "Investigate";
      investigateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 6.5h8.5l2.5 2.5v8.5H7z"></path>
          <path d="M15.5 6.5V9h2.5"></path>
          <circle cx="10.6" cy="11.6" r="3.1"></circle>
          <path d="m12.9 13.9 3.6 3.6"></path>
        </svg>
      `;
      band.appendChild(investigateBtn);
    }

    if (document.getElementById("gwHudSelectTool")) return;

    const btn = document.createElement("button");
    btn.className = "gw-pill gw-hud-round-btn gw-hud-select-btn";
    btn.id = "gwHudSelectTool";
    btn.type = "button";
    btn.setAttribute("aria-label", "Select cells");
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Select cells";
    btn.innerHTML = `
      <svg class="gw-select-lasso-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.2 6.8c2.2-2.1 7.5-2.6 10.5-.8 3.4 2.1 3.1 6.8-.1 8.8-3 1.9-8.5 1.6-10.9-.5-2.4-2.1-2-5.5.5-7.5Z" stroke-dasharray="2.2 2.4"></path>
        <path d="M15.6 14.7 20 20"></path>
        <path d="M18.3 20h3.1"></path>
      </svg>
      <svg class="gw-select-hand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 12.5V6.8a1.4 1.4 0 0 1 2.8 0v5"></path>
        <path d="M10.8 11.8V5.5a1.4 1.4 0 0 1 2.8 0v6.3"></path>
        <path d="M13.6 12V7a1.35 1.35 0 0 1 2.7 0v6"></path>
        <path d="M16.3 13v-2.2a1.3 1.3 0 0 1 2.6 0v4.4c0 3.8-2.5 5.8-5.8 5.8h-1.1c-2 0-3.4-.8-4.7-2.5L4.9 15a1.45 1.45 0 0 1 2.2-1.9L9 14.6"></path>
      </svg>
    `;
    band.appendChild(btn);
  }

  function ensurePanel() {
    let panel = document.getElementById("gwHerePanel");
    if (panel) return panel;

    panel = document.createElement("aside");
    panel.className = "gw-here-panel";
    panel.id = "gwHerePanel";
    panel.setAttribute("aria-label", "Here panel");
    panel.hidden = !herePanelOpen;
    panel.innerHTML = `
      <div class="gw-here-head">
        <div class="gw-here-title" id="gwHereTitle">Here</div>
        <div class="gw-here-meta" id="gwHereMeta">15 x 15</div>
      </div>
      <div class="gw-here-map" id="gwHereMap"></div>
      <div class="gw-here-pie" id="gwHerePie">
        <button class="gw-here-pie-home" id="gwHerePieHome" type="button" aria-label="Reset taxa chart" title="Reset taxa chart">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 11.5 12 4l9 7.5"></path>
            <path d="M6 10.5V20h12v-9.5"></path>
            <path d="M10 20v-5h4v5"></path>
          </svg>
        </button>
        <div class="gw-here-pie-chart" id="gwHerePieChart"></div>
      </div>
      <div class="gw-here-taxa-list" id="gwHereTaxaList"></div>
      <div class="gw-here-stats" id="gwHereStats"></div>
      <div class="gw-here-download is-hidden" id="gwHereObservationDownload">
        <button class="gw-here-download-btn" id="gwHereObservationDownloadBtn" type="button">Download My Observations</button>
        <div class="gw-here-download-progress" id="gwHereObservationDownloadProgress">
          <div class="gw-here-download-progress-text" id="gwHereObservationDownloadProgressText">Preparing download...</div>
          <div class="gw-here-download-progress-track">
            <div class="gw-here-download-progress-bar" id="gwHereObservationDownloadProgressBar"></div>
          </div>
        </div>
      </div>
      <div class="gw-here-download is-hidden" id="gwHerePyriteLake">
        <div class="gw-here-pyrite-actions">
          <button class="gw-here-download-btn" id="gwHerePyriteSeedBtn" type="button">Seed Pyrite</button>
          <button class="gw-here-download-btn" id="gwHerePyriteToggleBtn" type="button">On</button>
          <button class="gw-here-download-btn" id="gwHerePyriteClearBtn" type="button">Clear</button>
        </div>
        <div class="gw-here-download-progress" id="gwHerePyriteProgress">
          <div class="gw-here-download-progress-text" id="gwHerePyriteProgressText">Preparing seed...</div>
          <div class="gw-here-download-progress-track">
            <div class="gw-here-download-progress-bar" id="gwHerePyriteProgressBar"></div>
          </div>
        </div>
        <div class="gw-here-pyrite-summary" id="gwHerePyriteSummary">Pyrite: 0 obs</div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle, explode = 0) {
    const mid = (startAngle + endAngle) / 2;
    const offX = Math.cos(mid) * explode;
    const offY = Math.sin(mid) * explode;
    const point = (r, a) => ({
      x: cx + offX + Math.cos(a) * r,
      y: cy + offY + Math.sin(a) * r
    });
    const p1 = point(rOuter, startAngle);
    const p2 = point(rOuter, endAngle);
    const p3 = point(rInner, endAngle);
    const p4 = point(rInner, startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
      "Z"
    ].join(" ");
  }

  function keyForCell(cell) {
    if (!cell) return "";
    return cell.key || `${Math.floor(Number(cell.ix))},${Math.floor(Number(cell.iy))}`;
  }

  function boundsForCells(cells = []) {
    const normalized = (Array.isArray(cells) ? cells : [])
      .map((cell) => ({
        ix: Number(cell?.ix),
        iy: Number(cell?.iy)
      }))
      .filter((cell) => Number.isFinite(cell.ix) && Number.isFinite(cell.iy));

    if (!normalized.length) return null;

    return {
      minIx: Math.min(...normalized.map((cell) => Math.floor(cell.ix))),
      maxIx: Math.max(...normalized.map((cell) => Math.floor(cell.ix))),
      minIy: Math.min(...normalized.map((cell) => Math.floor(cell.iy))),
      maxIy: Math.max(...normalized.map((cell) => Math.floor(cell.iy)))
    };
  }

  function selectionKeySet(selection) {
    const cells = Array.isArray(selection?.cells) ? selection.cells : [];
    if (!cells.length) return null;
    return new Set(cells.map(keyForCell).filter(Boolean));
  }

  function selectionBounds(selectionOrBounds) {
    if (!selectionOrBounds) return null;
    if (selectionOrBounds.bounds) return selectionOrBounds.bounds;
    return selectionOrBounds;
  }

  function isCellSelected(item, selectedBounds, selectedKeys) {
    if (selectedKeys) return selectedKeys.has(keyForCell(item));
    return Boolean(
      selectedBounds &&
      item.ix >= selectedBounds.minIx &&
      item.ix <= selectedBounds.maxIx &&
      item.iy >= selectedBounds.minIy &&
      item.iy <= selectedBounds.maxIy
    );
  }

  function renderMiniMap(bounds, selectedContext) {
    const api = gridApi();
    if (!api) return "";

    const cells = api.cellsForBounds(bounds);
    const heatStats = buildHereHeatZStats(cells);
    const widthCells = bounds.maxIx - bounds.minIx + 1;
    const heightCells = bounds.maxIy - bounds.minIy + 1;
    const cell = 12;
    const gap = 0.8;
    const w = widthCells * cell;
    const h = heightCells * cell;
    const selected = selectionBounds(selectedContext);
    const selectedKeys = selectionKeySet(selectedContext);
    const userCell = api.currentUserCell?.();
    const centerCell = api.centerCell?.();

    const rects = cells
      .map((item) => {
        const selectedCell = isCellSelected(item, selected, selectedKeys);
        const x = (item.ix - bounds.minIx) * cell;
        const y = (bounds.maxIy - item.iy) * cell;
        const style = hereHeatStyleForCell(item, heatStats);
        const fill = style.fillColor || "rgba(239,230,211,0.12)";
        const alpha =
          Math.max(
            style.heatVisible ? 0.16 : 0.04,
            Math.min(0.9, Number(style.fillOpacity || 0.18))
          ) * (selectedKeys && !selectedCell ? 0.38 : 1);
        const stroke = selectedCell ? ` stroke="#ffe7a3" stroke-width="1.25"` : "";
        return `<rect x="${x + gap / 2}" y="${y + gap / 2}" width="${cell - gap}" height="${cell - gap}" rx="1.2" fill="${fill}" opacity="${alpha}"${stroke}></rect>`;
      })
      .join("");

    const selectionRect = selected
      ? (() => {
          const x = (selected.minIx - bounds.minIx) * cell;
          const y = (bounds.maxIy - selected.maxIy) * cell;
          const rw = (selected.maxIx - selected.minIx + 1) * cell;
          const rh = (selected.maxIy - selected.minIy + 1) * cell;
          return `<rect class="gw-selection-rect" x="${x + 1.2}" y="${y + 1.2}" width="${Math.max(0, rw - 2.4)}" height="${Math.max(0, rh - 2.4)}" rx="2.2"></rect>`;
        })()
      : "";

    function markerFor(cellInfo, cls, label, color) {
      if (!cellInfo) return "";
      if (
        cellInfo.ix < bounds.minIx ||
        cellInfo.ix > bounds.maxIx ||
        cellInfo.iy < bounds.minIy ||
        cellInfo.iy > bounds.maxIy
      )
        return "";

      const x = (cellInfo.ix - bounds.minIx + 0.5) * cell;
      const y = (bounds.maxIy - cellInfo.iy + 0.5) * cell;
      return `
        <g class="${cls}">
          <circle cx="${x}" cy="${y}" r="4.3" fill="${color}" stroke="rgba(20,17,15,0.9)" stroke-width="1.3"></circle>
          <text x="${x}" y="${y + 2.8}" text-anchor="middle" font-size="6.4" font-weight="950" fill="rgba(20,17,15,0.96)">${label}</text>
        </g>
      `;
    }

    return `
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Here minimap">
        <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(7,9,8,0.58)"></rect>
        ${rects}
        ${selectionRect}
        ${markerFor(centerCell, "gw-here-center", "+", "#f0d18a")}
        ${markerFor(userCell, "gw-here-avatar", "A", "#98e6c4")}
      </svg>
    `;
  }

  function colorWithAlpha(color, alpha = 1) {
    const raw = String(color || "").trim();
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    if (raw.startsWith("#") && (raw.length === 7 || raw.length === 4)) {
      const hex =
        raw.length === 4
          ? raw
              .slice(1)
              .split("")
              .map((ch) => ch + ch)
              .join("")
          : raw.slice(1);
      const value = parseInt(hex, 16);
      if (Number.isFinite(value)) {
        const r = (value >> 16) & 255;
        const g = (value >> 8) & 255;
        const b = value & 255;
        return `rgba(${r},${g},${b},${a})`;
      }
    }
    if (raw.startsWith("hsl(")) {
      return raw.replace("hsl(", "hsla(").replace(/\)$/, `,${a})`);
    }
    if (raw.startsWith("rgba(")) {
      const parts = raw
        .slice(5, -1)
        .split(",")
        .map((part) => part.trim());
      if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
    }
    return raw.startsWith("rgb(") ? raw.replace("rgb(", "rgba(").replace(")", `,${a})`) : raw;
  }

  function stableHash(value) {
    const text = String(value || "");
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function activeQuestTarget() {
    return window.GridWildQuestLayer?.getActiveQuest?.()?.__gwNormalizedTarget || null;
  }

  function overlappingNiches(bounds) {
    const niches = window.GridWildLocalNiches?.getNiches?.() || [];
    return niches
      .map((niche) => ({
        niche,
        cells: (Array.isArray(niche?.grid_cell_ids) ? niche.grid_cell_ids : [])
          .map((key) => {
            const [ix, iy] = String(key).split(",").map(Number);
            return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy } : null;
          })
          .filter(
            (cell) =>
              cell &&
              cell.ix >= bounds.minIx &&
              cell.ix <= bounds.maxIx &&
              cell.iy >= bounds.minIy &&
              cell.iy <= bounds.maxIy
          )
      }))
      .filter((entry) => entry.cells.length);
  }

  function fogInfoForCell(key) {
    if (!(window.__gwState?.showFog ?? false)) return null;
    return window.GridWildFog?.getCellFogState?.(key) || null;
  }

  function hereHeatValue(metrics = {}) {
    const metric = window.__gwState?.heatMetric ?? "count";
    if (metric === "species") return Number(metrics.species) || 0;
    if (metric === "observers") return Number(metrics.observers) || 0;
    return Number(metrics.count) || 0;
  }

  function buildHereHeatZStats(cells = []) {
    if (window.__gwState?.heatZThresholdEnabled !== true) return null;

    const values = cells
      .map((item) => hereHeatValue(item?.metrics || {}))
      .filter((value) => value > 0);

    if (!values.length) return null;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => {
        const d = value - mean;
        return sum + d * d;
      }, 0) / values.length;

    return {
      mean,
      sd: Math.sqrt(variance)
    };
  }

  function passesHereHeatZThreshold(value, stats) {
    if (window.__gwState?.heatZThresholdEnabled !== true || !stats) return true;

    const raw = Number(window.__gwState?.heatZThreshold);
    const threshold = Number.isFinite(raw) ? Math.max(-3, Math.min(3, raw)) : 0;
    const direction = window.__gwState?.heatZThresholdDirection === "below" ? "below" : "above";
    const z = stats.sd > 0 ? ((Number(value) || 0) - stats.mean) / stats.sd : 0;
    return direction === "below" ? z <= threshold : z >= threshold;
  }

  function hereHeatStyleForCell(item, stats) {
    const neutral = {
      fillColor: "rgb(239,230,211)",
      fillOpacity: 0.1,
      heatVisible: false
    };

    if ((window.__gwFilters?.showHeat ?? true) === false) return neutral;

    const metrics = item?.metrics || null;
    const heatValue = metrics ? hereHeatValue(metrics) : 0;
    if (!metrics || heatValue <= 0 || !passesHereHeatZThreshold(heatValue, stats)) {
      return neutral;
    }

    const style = item?.style || gridApi()?.metricsToFill?.(metrics) || null;
    if (!style) return neutral;

    return {
      fillColor: style.fillColor || neutral.fillColor,
      fillOpacity: Number(style.fillOpacity ?? neutral.fillOpacity),
      heatVisible: true
    };
  }

  function latLngToGridPoint(latlng, gridSizeM) {
    const leafletMap = typeof map !== "undefined" ? map : window.map;
    const leaflet = typeof L !== "undefined" ? L : window.L;
    if (!leafletMap?.options?.crs?.project || !Number.isFinite(gridSizeM) || gridSizeM <= 0)
      return null;

    const lat = Number(latlng?.lat ?? latlng?.[0]);
    const lng = Number(latlng?.lng ?? latlng?.lon ?? latlng?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const projected = leafletMap.options.crs.project(
      leaflet?.latLng ? leaflet.latLng(lat, lng) : { lat, lng }
    );
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
    return {
      ix: projected.x / gridSizeM,
      iy: projected.y / gridSizeM
    };
  }

  function clipSegmentToCellBounds(a, b, bounds, pad = 0.4) {
    const minX = bounds.minIx - pad;
    const maxX = bounds.maxIx + 1 + pad;
    const minY = bounds.minIy - pad;
    const maxY = bounds.maxIy + 1 + pad;
    const dx = b.ix - a.ix;
    const dy = b.iy - a.iy;
    let t0 = 0;
    let t1 = 1;

    function clip(p, q) {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    if (
      clip(-dx, a.ix - minX) &&
      clip(dx, maxX - a.ix) &&
      clip(-dy, a.iy - minY) &&
      clip(dy, maxY - a.iy)
    ) {
      return {
        a: { ix: a.ix + dx * t0, iy: a.iy + dy * t0 },
        b: { ix: a.ix + dx * t1, iy: a.iy + dy * t1 }
      };
    }

    return null;
  }

  function highwayClass(tags = {}) {
    const highway = String(tags.highway || "").toLowerCase();
    if (["motorway", "trunk", "primary", "secondary"].includes(highway)) return "major";
    if (["tertiary", "residential", "unclassified", "living_street", "road"].includes(highway))
      return "street";
    if (["path", "footway", "cycleway", "bridleway", "track"].includes(highway)) return "trail";
    return "service";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function loadHereElevationCache() {
    if (hereElevationCacheLoaded) return;
    hereElevationCacheLoaded = true;

    try {
      const parsed = JSON.parse(localStorage.getItem(HERE_ELEVATION_STORAGE_KEY) || "null");
      const rows = Array.isArray(parsed?.entries) ? parsed.entries : [];
      const now = Date.now();

      for (const row of rows) {
        const key = String(row?.key || "");
        const elevationM = Number(row?.elevation_m);
        const fetchedAt = Number(row?.fetched_at);
        if (!key || !Number.isFinite(elevationM) || !Number.isFinite(fetchedAt)) continue;
        if (now - fetchedAt > HERE_ELEVATION_CACHE_TTL_MS) continue;
        hereElevationCache.set(key, {
          elevationM,
          fetchedAt,
          lastUsedAt: now
        });
      }
    } catch (err) {
      localStorage.removeItem(HERE_ELEVATION_STORAGE_KEY);
    }
  }

  function saveHereElevationCache() {
    loadHereElevationCache();

    try {
      const entries = Array.from(hereElevationCache.entries())
        .sort(
          (a, b) =>
            (b[1].lastUsedAt || b[1].fetchedAt || 0) - (a[1].lastUsedAt || a[1].fetchedAt || 0)
        )
        .slice(0, HERE_ELEVATION_MAX_CACHE_ENTRIES)
        .map(([key, entry]) => ({
          key,
          elevation_m: entry.elevationM,
          fetched_at: entry.fetchedAt
        }));

      localStorage.setItem(
        HERE_ELEVATION_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          entries
        })
      );
    } catch (err) {
      // Terrain still renders flat if localStorage is unavailable.
    }
  }

  function gridPointToLatLng(ix, iy) {
    const api = gridApi();
    const leafletMap = typeof map !== "undefined" ? map : window.map;
    const leaflet = typeof L !== "undefined" ? L : window.L;
    const gridSizeM = Number(api?.gridSizeM) || 1;
    if (!leafletMap?.options?.crs?.unproject || !leaflet?.point) return null;
    const ll = leafletMap.options.crs.unproject(leaflet.point(ix * gridSizeM, iy * gridSizeM));
    if (!ll || !Number.isFinite(Number(ll.lat)) || !Number.isFinite(Number(ll.lng))) return null;
    return { lat: Number(ll.lat), lng: Number(ll.lng) };
  }

  function hereElevationSampleFor(ix, iy) {
    const q = HERE_ELEVATION_SAMPLE_CELLS;
    const sx = Math.round((Number(ix) || 0) / q) * q;
    const sy = Math.round((Number(iy) || 0) / q) * q;
    const key = `${sx},${sy}`;
    return { key, ix: sx, iy: sy };
  }

  function getHereElevationEntry(key) {
    loadHereElevationCache();
    const entry = hereElevationCache.get(key);
    if (!entry) return null;

    if (Date.now() - Number(entry.fetchedAt || 0) > HERE_ELEVATION_CACHE_TTL_MS) {
      hereElevationCache.delete(key);
      return null;
    }

    entry.lastUsedAt = Date.now();
    return entry;
  }

  function getHereElevationMeters(ix, iy) {
    const sample = hereElevationSampleFor(ix, iy);
    const entry = getHereElevationEntry(sample.key);
    return Number.isFinite(entry?.elevationM) ? entry.elevationM : null;
  }

  function addHereElevationSample(samples, ix, iy) {
    const sample = hereElevationSampleFor(ix, iy);
    if (samples.has(sample.key) || getHereElevationEntry(sample.key)) return sample;

    const ll = gridPointToLatLng(sample.ix, sample.iy);
    if (!ll) return sample;

    samples.set(sample.key, {
      ...sample,
      lat: ll.lat,
      lng: ll.lng
    });
    return sample;
  }

  function parseRetryAfterMs(value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const dateMs = Date.parse(value || "");
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());

    return 0;
  }

  function scheduleHereElevationFlush(delayMs) {
    if (hereElevationFetchQueued) return;
    hereElevationFetchQueued = true;
    setTimeout(
      () => {
        hereElevationFetchQueued = false;
        flushHereElevationQueue();
      },
      Math.max(0, Number(delayMs) || 0)
    );
  }

  function flushHereElevationQueue() {
    if (hereElevationFetchInFlight || !hereElevationPending.size) return;
    const now = Date.now();
    const nextAllowedAt = Math.max(
      hereElevationDisabledUntil,
      hereElevationLastFetchAt + HERE_ELEVATION_MIN_FETCH_INTERVAL_MS
    );
    if (now < nextAllowedAt) {
      scheduleHereElevationFlush(nextAllowedAt - now);
      return;
    }

    const batch = Array.from(hereElevationPending.values()).slice(0, HERE_ELEVATION_MAX_BATCH);
    for (const point of batch) hereElevationPending.delete(point.key);
    if (!batch.length) return;

    hereElevationFetchInFlight = true;
    hereElevationLastFetchAt = now;

    fetch(HERE_ELEVATION_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        points: batch.map((point) => ({
          key: point.key,
          lat: point.lat,
          lng: point.lng
        }))
      })
    })
      .then((resp) => {
        if (!resp.ok) {
          const err = new Error(`Elevation HTTP ${resp.status}`);
          err.status = resp.status;
          err.retryAfterMs = parseRetryAfterMs(resp.headers?.get?.("Retry-After"));
          throw err;
        }
        return resp.json();
      })
      .then((data) => {
        const now = Date.now();
        hereElevationRetryDelayMs = HERE_ELEVATION_RETRY_BASE_MS;
        for (const point of data?.points || []) {
          const key = String(point?.key || "");
          const elevationM = Number(point?.elevation_m);
          if (!key || !Number.isFinite(elevationM)) continue;
          hereElevationCache.set(key, {
            elevationM,
            fetchedAt: now,
            lastUsedAt: now
          });
        }
        saveHereElevationCache();
        scheduleRefresh(40);
      })
      .catch((err) => {
        const retryMs =
          err.status === 429
            ? Math.max(err.retryAfterMs || 0, hereElevationRetryDelayMs)
            : Math.min(HERE_ELEVATION_RETRY_BASE_MS, 1000 * 60 * 3);
        hereElevationDisabledUntil = Date.now() + retryMs;
        hereElevationRetryDelayMs = Math.min(
          HERE_ELEVATION_RETRY_MAX_MS,
          hereElevationRetryDelayMs * 2
        );
        if (err.status === 429) {
          console.info("GridWild elevation lookup is rate-limited; backing off.");
        } else {
          console.warn("GridWild elevation lookup failed:", err);
        }
      })
      .finally(() => {
        hereElevationFetchInFlight = false;
        if (hereElevationPending.size) {
          scheduleHereElevationFlush(
            Math.max(HERE_ELEVATION_MIN_FETCH_INTERVAL_MS, hereElevationDisabledUntil - Date.now())
          );
        }
      });
  }

  function queueHereElevationSamples(samples) {
    loadHereElevationCache();
    const now = Date.now();
    if (!samples?.size || now < hereElevationDisabledUntil || hereMap3dDrag) return;

    for (const point of samples.values()) {
      if (hereElevationPending.size >= HERE_ELEVATION_MAX_PENDING) break;
      if (!point?.key || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      if (getHereElevationEntry(point.key)) continue;
      if (
        now - Number(hereElevationRequestedAt.get(point.key) || 0) <
        HERE_ELEVATION_REQUEST_COOLDOWN_MS
      )
        continue;
      hereElevationRequestedAt.set(point.key, now);
      hereElevationPending.set(point.key, point);
    }

    if (!hereElevationPending.size || hereElevationFetchQueued) return;
    scheduleHereElevationFlush(HERE_ELEVATION_QUEUE_DELAY_MS);
  }

  function collectHereElevationSamples(bounds, headingRad, origin) {
    const samples = new Map();
    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const localStep = Math.max(4, Math.ceil(Math.max(width, height) / 4));
    const centerIx = (bounds.minIx + bounds.maxIx + 1) / 2;
    const centerIy = (bounds.minIy + bounds.maxIy + 1) / 2;

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy += localStep) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix += localStep) {
        addHereElevationSample(samples, ix + 0.5, iy + 0.5);
      }
    }

    [
      [bounds.minIx + 0.5, bounds.minIy + 0.5],
      [bounds.maxIx + 0.5, bounds.minIy + 0.5],
      [bounds.minIx + 0.5, bounds.maxIy + 0.5],
      [bounds.maxIx + 0.5, bounds.maxIy + 0.5],
      [centerIx, centerIy],
      [origin.ix + 0.5, origin.iy + 0.5]
    ].forEach((point) => addHereElevationSample(samples, point[0], point[1]));

    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);
    const ringDistances = hereMap3dExpanded ? [90, 220, 520, 1100] : [110, 300, 700];
    const sampleCounts = hereMap3dExpanded ? [9, 11, 13, 15] : [7, 9, 11];
    const fovRad = (HERE_3D_CAMERA.fovDeg * Math.PI) / 180;
    const ridgeBands = [];

    ringDistances.forEach((forward, ringIndex) => {
      const count = sampleCounts[ringIndex] || 15;
      const bandSamples = [];
      const lateralMax = Math.tan(fovRad * 0.62) * forward;

      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0 : (i / (count - 1)) * 2 - 1;
        const right = t * lateralMax;
        const dx = right * cos + forward * sin;
        const dy = -right * sin + forward * cos;
        const sample = addHereElevationSample(samples, origin.ix + dx, origin.iy + dy);
        bandSamples.push(sample);
      }

      ridgeBands.push({
        ringIndex,
        distanceCells: forward,
        samples: bandSamples
      });
    });

    return { samples, ridgeBands };
  }

  function buildHereElevationModel(bounds, headingRad, cameraCell, centerCell) {
    const origin = cameraCell ||
      centerCell || {
        ix: (bounds.minIx + bounds.maxIx) / 2,
        iy: (bounds.minIy + bounds.maxIy) / 2
      };
    const { samples, ridgeBands } = collectHereElevationSamples(bounds, headingRad, origin);
    queueHereElevationSamples(samples);

    const originM = getHereElevationMeters(origin.ix + 0.5, origin.iy + 0.5);
    const localElevations = [
      [origin.ix + 0.5, origin.iy + 0.5],
      [(bounds.minIx + bounds.maxIx + 1) / 2, (bounds.minIy + bounds.maxIy + 1) / 2],
      [bounds.minIx + 0.5, bounds.minIy + 0.5],
      [bounds.maxIx + 0.5, bounds.maxIy + 0.5],
      [bounds.minIx + 0.5, bounds.maxIy + 0.5],
      [bounds.maxIx + 0.5, bounds.minIy + 0.5]
    ]
      .map((point) => getHereElevationMeters(point[0], point[1]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const baseM = Number.isFinite(originM)
      ? originM
      : localElevations.length
        ? localElevations[Math.floor(localElevations.length / 2)]
        : null;

    function metersAt(ix, iy) {
      return getHereElevationMeters(ix, iy);
    }

    function zAt(ix, iy) {
      const elevationM = metersAt(ix, iy);
      if (!Number.isFinite(baseM) || !Number.isFinite(elevationM)) return 0;
      return clamp(
        (elevationM - baseM) / HERE_ELEVATION_LOCAL_Z_SCALE_M,
        HERE_ELEVATION_LOCAL_Z_MIN,
        HERE_ELEVATION_LOCAL_Z_MAX
      );
    }

    return {
      baseM,
      metersAt,
      zAt,
      ridgeBands,
      hasElevation: Number.isFinite(baseM)
    };
  }

  function renderHereViewport3d(bounds, selectedContext) {
    const api = gridApi();
    if (!api) return "";

    const cells = api.cellsForBounds(bounds);
    const selectedBounds = selectionBounds(selectedContext);
    const selectedKeys = selectionKeySet(selectedContext);
    const w = 220;
    const h = 150;
    const userCell = api.currentUserCell?.();
    const centerCell = api.centerCell?.();
    const cameraCell = inBounds(userCell) ? userCell : centerCell;
    const heading = Number(window.GridWildCompass?.getState?.()?.heading);
    const headingDeg = (Number.isFinite(heading) ? heading : 0) + hereMap3dYawOffsetDeg;
    const headingRad = (headingDeg * Math.PI) / 180;
    const pitchRad = (HERE_3D_CAMERA.pitchDeg * Math.PI) / 180;
    const fovRad = (HERE_3D_CAMERA.fovDeg * Math.PI) / 180;
    const avatarY = h * HERE_3D_CAMERA.avatarScreenY;
    const focal = (w * 0.5) / Math.tan(fovRad / 2);
    const cameraDepth = 5.8;

    function inBounds(cellInfo) {
      return (
        cellInfo &&
        cellInfo.ix >= bounds.minIx &&
        cellInfo.ix <= bounds.maxIx &&
        cellInfo.iy >= bounds.minIy &&
        cellInfo.iy <= bounds.maxIy
      );
    }

    const elevationModel = buildHereElevationModel(bounds, headingRad, cameraCell, centerCell);

    function worldToCamera(ix, iy, z = 0) {
      const origin = cameraCell || {
        ix: (bounds.minIx + bounds.maxIx) / 2,
        iy: (bounds.minIy + bounds.maxIy) / 2
      };
      const dx = ix - origin.ix;
      const dy = iy - origin.iy;
      const right = dx * Math.cos(headingRad) - dy * Math.sin(headingRad);
      const forward = dx * Math.sin(headingRad) + dy * Math.cos(headingRad);
      const depth = cameraDepth + forward * Math.cos(pitchRad) - z * Math.sin(pitchRad);
      const lift = forward * Math.sin(pitchRad) + z * Math.cos(pitchRad);
      return {
        right,
        forward,
        lift,
        depth: Math.max(1.1, depth)
      };
    }

    function project(ix, iy, z = 0) {
      const cam = worldToCamera(ix, iy, z);
      const scale = focal / cam.depth;
      return {
        x: w / 2 + cam.right * scale * 0.72,
        y: avatarY - cam.lift * scale * 0.34,
        scale,
        depth: cam.depth,
        forward: cam.forward
      };
    }

    function cellPolygon(ix, iy, z = 0, inset = 0.04) {
      const a = inset;
      const b = 1 - inset;
      return [
        project(ix + a, iy + a, z),
        project(ix + b, iy + a, z),
        project(ix + b, iy + b, z),
        project(ix + a, iy + b, z)
      ];
    }

    function terrainZAt(ix, iy, lift = 0) {
      return elevationModel.zAt(ix, iy) + lift;
    }

    function terrainCellPolygon(ix, iy, inset = 0.04, lift = 0) {
      const a = inset;
      const b = 1 - inset;
      return [
        project(ix + a, iy + a, terrainZAt(ix + a, iy + a, lift)),
        project(ix + b, iy + a, terrainZAt(ix + b, iy + a, lift)),
        project(ix + b, iy + b, terrainZAt(ix + b, iy + b, lift)),
        project(ix + a, iy + b, terrainZAt(ix + a, iy + b, lift))
      ];
    }

    function pointsAttr(points) {
      return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    }

    function isVisiblePoly(points) {
      return points.some((p) => p.x > -30 && p.x < w + 30 && p.y > -30 && p.y < h + 40);
    }

    function isVisibleLine(points) {
      return points.some((p) => p.x > -35 && p.x < w + 35 && p.y > -35 && p.y < h + 45);
    }

    const sorted = cells
      .slice()
      .sort(
        (a, b) =>
          worldToCamera(a.ix + 0.5, a.iy + 0.5, terrainZAt(a.ix + 0.5, a.iy + 0.5)).forward -
          worldToCamera(b.ix + 0.5, b.iy + 0.5, terrainZAt(b.ix + 0.5, b.iy + 0.5)).forward
      );

    const heatStats = buildHereHeatZStats(cells);
    const maxCount = Math.max(...sorted.map((item) => Number(item.metrics?.count) || 0), 1);
    const osmByKey = new Map();
    for (const item of sorted) {
      const prior = window.GridWildOsmPriorsLayer?.getCell?.(item.ix, item.iy) || null;
      if (prior) osmByKey.set(item.key, prior.osm || null);
    }

    function renderRaisedOsmLines() {
      const source = window.GridWildOsmFeaturesLayer;
      const features = source?.getFeatures?.() || {};
      const gridSizeM = Number(api.gridSizeM) || 1;
      const groups = [];

      if ((window.__gwState?.showOsmRoads ?? true) !== false) {
        groups.push({ kind: "road", features: features.roads || [] });
      }
      if ((window.__gwState?.showOsmTrails ?? true) !== false) {
        groups.push({ kind: "trail", features: features.trails || [] });
      }

      const segments = [];
      for (const group of groups) {
        for (const feature of group.features.slice(0, 90)) {
          const points = (feature.points || [])
            .map((point) => latLngToGridPoint(point, gridSizeM))
            .filter(Boolean);
          if (points.length < 2) continue;

          const cls = group.kind === "trail" ? "trail" : highwayClass(feature.tags);
          for (let i = 1; i < points.length; i++) {
            const clipped = clipSegmentToCellBounds(points[i - 1], points[i], bounds);
            if (!clipped) continue;

            const lift = cls === "trail" ? 0.33 : cls === "major" ? 0.52 : 0.43;
            const groundA = project(
              clipped.a.ix,
              clipped.a.iy,
              terrainZAt(clipped.a.ix, clipped.a.iy, 0.04)
            );
            const groundB = project(
              clipped.b.ix,
              clipped.b.iy,
              terrainZAt(clipped.b.ix, clipped.b.iy, 0.04)
            );
            const raisedA = project(
              clipped.a.ix,
              clipped.a.iy,
              terrainZAt(clipped.a.ix, clipped.a.iy, lift)
            );
            const raisedB = project(
              clipped.b.ix,
              clipped.b.iy,
              terrainZAt(clipped.b.ix, clipped.b.iy, lift)
            );
            if (!isVisibleLine([groundA, groundB, raisedA, raisedB])) continue;

            const width =
              cls === "major" ? 2.7 : cls === "street" ? 2.1 : cls === "trail" ? 1.35 : 1.75;
            const stroke = cls === "trail" ? "rgba(212,177,112,0.78)" : "rgba(108,96,86,0.86)";
            const core = cls === "trail" ? "rgba(255,231,163,0.72)" : "rgba(239,222,194,0.50)";
            const dGround = `M${groundA.x.toFixed(1)} ${groundA.y.toFixed(1)} L${groundB.x.toFixed(1)} ${groundB.y.toFixed(1)}`;
            const dRaised = `M${raisedA.x.toFixed(1)} ${raisedA.y.toFixed(1)} L${raisedB.x.toFixed(1)} ${raisedB.y.toFixed(1)}`;

            segments.push({
              depth: (raisedA.forward + raisedB.forward) / 2,
              markup: `
                <g data-layer="osm-${cls}">
                  <path d="${dGround}" fill="none" stroke="rgba(0,0,0,0.26)" stroke-width="${(width + 2.2).toFixed(1)}" stroke-linecap="round"></path>
                  <path d="${dRaised}" fill="none" stroke="rgba(255,231,163,0.18)" stroke-width="${(width + 3.1).toFixed(1)}" stroke-linecap="round"></path>
                  <path d="${dRaised}" fill="none" stroke="${stroke}" stroke-width="${width.toFixed(1)}" stroke-linecap="round"></path>
                  <path d="${dRaised}" fill="none" stroke="${core}" stroke-width="${Math.max(0.5, width * 0.34).toFixed(1)}" stroke-linecap="round"></path>
                </g>
              `
            });

            if (segments.length >= 180) break;
          }
          if (segments.length >= 180) break;
        }
        if (segments.length >= 180) break;
      }

      return segments
        .sort((a, b) => a.depth - b.depth)
        .map((segment) => segment.markup)
        .join("");
    }

    function renderElevationRidges() {
      if (!elevationModel.hasElevation) return "";

      const gridSizeM = Number(api.gridSizeM) || 1;
      const maxRingIndex = Math.max(1, elevationModel.ridgeBands.length - 1);
      return elevationModel.ridgeBands
        .slice()
        .reverse()
        .map((band, bandIndex) => {
          const points = band.samples
            .map((sample, index) => {
              const elevationM = elevationModel.metersAt(sample.ix, sample.iy);
              if (!Number.isFinite(elevationM)) return null;
              return {
                index,
                elevationM
              };
            })
            .filter(Boolean);

          if (points.length < Math.max(5, Math.floor(band.samples.length * 0.45))) return "";

          const elevations = points.map((point) => point.elevationM);
          const minM = Math.min(...elevations);
          const maxM = Math.max(...elevations);
          const maxRelM = maxM - elevationModel.baseM;
          const reliefM = maxM - minM;
          if (maxRelM < 55 && reliefM < 65) return "";

          const distanceM = Math.max(80, band.distanceCells * gridSizeM);
          const farFactor = clamp((Number(band.ringIndex) || 0) / maxRingIndex, 0, 1);
          const baseY = h * (0.405 - farFactor * 0.075);
          const bottomY = h * (0.58 - farFactor * 0.08);
          const topPoints = points.map((point) => {
            const x =
              band.samples.length <= 1 ? w / 2 : (point.index / (band.samples.length - 1)) * w;
            const relativeM = clamp(point.elevationM - elevationModel.baseM, -500, 2400);
            const angleDeg = (Math.atan2(relativeM, distanceM) * 180) / Math.PI;
            const reliefLift = clamp((point.elevationM - minM) * 0.014, 0, 18);
            const y = clamp(baseY - angleDeg * 2.35 - reliefLift, 8, h * 0.56);
            return { x, y };
          });

          const path = [
            `M0 ${bottomY.toFixed(1)}`,
            ...topPoints.map((point) => `L${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
            `L${w} ${bottomY.toFixed(1)}`,
            "Z"
          ].join(" ");
          const ridgeLine = topPoints
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
            )
            .join(" ");
          const opacity = 0.09 + (1 - farFactor) * 0.13;
          const strokeOpacity = 0.12 + (1 - farFactor) * 0.2;

          return `
            <g data-layer="elevation-ridge">
              <path d="${path}" fill="rgba(63,91,84,${opacity.toFixed(3)})"></path>
              <path d="${ridgeLine}" fill="none" stroke="rgba(209,231,203,${strokeOpacity.toFixed(3)})" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"></path>
            </g>
          `;
        })
        .join("");
    }

    const terrain = sorted
      .map((item) => {
        const count = Number(item.metrics?.count) || 0;
        const style = hereHeatStyleForCell(item, heatStats);
        const osm = osmByKey.get(item.key);
        const fill = style.fillColor || "rgba(239,230,211,0.14)";
        const alpha = Math.max(
          style.heatVisible ? 0.18 : 0.06,
          Math.min(0.92, Number(style.fillOpacity || 0.2))
        );
        const poly = terrainCellPolygon(item.ix, item.iy);
        if (!isVisiblePoly(poly)) return "";
        const selected = isCellSelected(item, selectedBounds, selectedKeys);
        const fog = fogInfoForCell(item.key);
        const fogAlpha =
          fog && (fog.state === "unknown" || fog.state === "expired")
            ? 0.34
            : fog?.state === "surveyed"
              ? 0.12
              : 0;
        const landTint =
          {
            building: "rgba(126,92,64,0.20)",
            wood: "rgba(71,139,83,0.24)",
            park: "rgba(88,157,84,0.18)",
            grass: "rgba(126,174,83,0.16)",
            water: "rgba(60,138,178,0.28)"
          }[osm?.landuseClass] || "";
        const elevationM = elevationModel.metersAt(item.ix + 0.5, item.iy + 0.5);
        const elevationDeltaM =
          Number.isFinite(elevationM) && Number.isFinite(elevationModel.baseM)
            ? elevationM - elevationModel.baseM
            : 0;
        const elevationTint =
          elevationDeltaM > 25
            ? `<polygon points="${pointsAttr(poly)}" fill="rgba(255,232,176,${clamp(elevationDeltaM / 1800, 0, 0.14).toFixed(3)})"></polygon>`
            : elevationDeltaM < -18
              ? `<polygon points="${pointsAttr(poly)}" fill="rgba(48,96,126,${clamp(Math.abs(elevationDeltaM) / 900, 0, 0.12).toFixed(3)})"></polygon>`
              : "";

        return `
        <g data-layer="terrain">
          <polygon points="${pointsAttr(poly)}" fill="${colorWithAlpha(fill, alpha)}" stroke="${selected ? "#ffe7a3" : "rgba(255,255,255,0.14)"}" stroke-width="${selected ? 1.2 : 0.35}"></polygon>
          ${elevationTint}
          ${landTint ? `<polygon points="${pointsAttr(poly)}" fill="${landTint}"></polygon>` : ""}
          ${style.heatVisible && count > 0 ? `<polygon points="${pointsAttr(terrainCellPolygon(item.ix, item.iy, 0.04, Math.sqrt(count / maxCount) * 0.18))}" fill="rgba(255,255,255,0.05)"></polygon>` : ""}
          ${fogAlpha ? `<polygon points="${pointsAttr(poly)}" fill="rgba(9,12,14,${fogAlpha})"></polygon>` : ""}
        </g>
      `;
      })
      .join("");

    const osmLines = renderRaisedOsmLines();
    const elevationRidges = renderElevationRidges();

    const buildings = sorted
      .map((item) => {
        const osm = osmByKey.get(item.key);
        if (!osm?.insideBuilding) return "";
        const stories = 1 + (stableHash(item.key) % 3);
        const top = terrainCellPolygon(item.ix, item.iy, 0.04, stories * 0.9);
        const base = terrainCellPolygon(item.ix, item.iy);
        if (!isVisiblePoly(top)) return "";
        return `
        <g data-layer="buildings">
          <polygon points="${pointsAttr([top[0], top[1], base[1], base[0]])}" fill="rgba(89,67,52,0.72)"></polygon>
          <polygon points="${pointsAttr([top[1], top[2], base[2], base[1]])}" fill="rgba(119,86,62,0.58)"></polygon>
          <polygon points="${pointsAttr(top)}" fill="rgba(154,112,76,0.76)" stroke="rgba(255,226,181,0.36)" stroke-width="0.45"></polygon>
        </g>
      `;
      })
      .join("");

    const trees = sorted
      .map((item) => {
        const osm = osmByKey.get(item.key);
        if (!(osm?.landuseClass === "wood" || osm?.landuseClass === "park")) return "";
        if (stableHash(item.key) % 3 === 0) return "";
        const p = project(
          item.ix + 0.5,
          item.iy + 0.5,
          terrainZAt(item.ix + 0.5, item.iy + 0.5, 0.7)
        );
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) return "";
        const r = Math.max(2.2, Math.min(5.8, p.scale * 0.19));
        return `
        <g data-layer="trees">
          <line x1="${p.x}" y1="${p.y + r * 1.2}" x2="${p.x}" y2="${p.y + r * 0.15}" stroke="rgba(91,66,38,0.72)" stroke-width="${Math.max(0.7, r * 0.28)}"></line>
          <polygon points="${p.x},${p.y - r} ${p.x + r * 1.15},${p.y - r * 0.05} ${p.x + r * 0.45},${p.y + r} ${p.x - r * 0.55},${p.y + r * 0.86} ${p.x - r * 1.18},${p.y - r * 0.1}" fill="rgba(88,171,102,0.76)" stroke="rgba(199,235,167,0.20)" stroke-width="0.4"></polygon>
        </g>
      `;
      })
      .join("");

    const niches = overlappingNiches(bounds)
      .slice(0, 4)
      .map((entry, index) => {
        const polys = entry.cells
          .slice(0, 90)
          .map((cell) => {
            const poly = terrainCellPolygon(cell.ix, cell.iy, 0.02, 0.72 + index * 0.12);
            if (!isVisiblePoly(poly)) return "";
            return `<polygon points="${pointsAttr(poly)}" fill="rgba(118,231,191,0.13)" stroke="rgba(118,231,191,0.38)" stroke-width="0.5"></polygon>`;
          })
          .join("");
        return `<g data-layer="niches">${polys}</g>`;
      })
      .join("");

    const questTarget = activeQuestTarget();
    const questMarker =
      questTarget &&
      questTarget.mode !== "anywhere" &&
      Number.isFinite(Number(questTarget.ix)) &&
      Number.isFinite(Number(questTarget.iy))
        ? (() => {
            const qBounds = {
              minIx: Number(questTarget.ix) - Math.max(0, Number(questTarget.radiusCells) || 0),
              maxIx: Number(questTarget.ix) + Math.max(0, Number(questTarget.radiusCells) || 0),
              minIy: Number(questTarget.iy) - Math.max(0, Number(questTarget.radiusCells) || 0),
              maxIy: Number(questTarget.iy) + Math.max(0, Number(questTarget.radiusCells) || 0)
            };
            if (
              qBounds.maxIx < bounds.minIx ||
              qBounds.minIx > bounds.maxIx ||
              qBounds.maxIy < bounds.minIy ||
              qBounds.minIy > bounds.maxIy
            ) {
              return "";
            }
            const qx = Number(questTarget.ix) + 0.5;
            const qy = Number(questTarget.iy) + 0.5;
            const p = project(qx, qy, terrainZAt(qx, qy, 0.25));
            return `
          <g data-layer="quest">
            <line x1="${p.x}" y1="${p.y - 62}" x2="${p.x}" y2="${p.y + 3}" stroke="url(#gwHereQuestBeam)" stroke-width="8" stroke-linecap="round"></line>
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="rgba(255,224,130,0.86)" stroke="rgba(255,255,255,0.68)" stroke-width="1"></circle>
          </g>
        `;
          })()
        : "";

    const userAvatar = inBounds(userCell)
      ? (() => {
          const ux = userCell.ix + 0.5;
          const uy = userCell.iy + 0.5;
          const p = project(ux, uy, terrainZAt(ux, uy, 1.05));
          return `
        <g aria-label="Avatar in viewport">
          <ellipse cx="${p.x}" cy="${avatarY + 10}" rx="6.4" ry="2.4" fill="rgba(0,0,0,0.34)"></ellipse>
          <path d="M${p.x - 4.1} ${avatarY + 8.5} L${p.x - 2.5} ${avatarY + 1.4} L${p.x + 2.5} ${avatarY + 1.4} L${p.x + 4.1} ${avatarY + 8.5} Z" fill="#98e6c4" stroke="rgba(20,17,15,0.9)" stroke-width="0.9"></path>
          <circle cx="${p.x}" cy="${avatarY - 2.1}" r="3.7" fill="#f0d18a" stroke="rgba(20,17,15,0.94)" stroke-width="1"></circle>
          <path d="M${p.x} ${avatarY - 8.5} L${p.x + Math.sin(headingRad) * 7} ${avatarY - 2.5}" stroke="#ffe7a3" stroke-width="1.2" stroke-linecap="round"></path>
        </g>
      `;
        })()
      : "";

    const centerMarker = inBounds(centerCell)
      ? (() => {
          const cx = centerCell.ix + 0.5;
          const cy = centerCell.iy + 0.5;
          const p = project(cx, cy, terrainZAt(cx, cy, 0.45));
          return `<circle cx="${p.x}" cy="${p.y}" r="2.7" fill="none" stroke="#f0d18a" stroke-width="1.2"></circle>`;
        })()
      : "";

    return `
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Here 3D viewport">
        <title>Here 3D viewport with Copernicus DEM GLO-90 elevation via Open-Meteo</title>
        <defs>
          <radialGradient id="gwHereViewportVignette" cx="50%" cy="54%" r="66%">
            <stop offset="58%" stop-color="rgba(6,8,8,0)"></stop>
            <stop offset="100%" stop-color="rgba(6,8,8,0.82)"></stop>
          </radialGradient>
          <linearGradient id="gwHereQuestBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(255,224,130,0)"></stop>
            <stop offset="0.28" stop-color="rgba(255,224,130,0.68)"></stop>
            <stop offset="1" stop-color="rgba(118,231,191,0.16)"></stop>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(6,8,8,0.58)"></rect>
        <path d="M0 ${h * 0.34} C56 ${h * 0.2} 150 ${h * 0.2} ${w} ${h * 0.34} L${w} 0 L0 0 Z" fill="rgba(149,196,184,0.08)"></path>
        ${elevationRidges}
        ${terrain}
        ${osmLines}
        ${niches}
        ${buildings}
        ${trees}
        ${questMarker}
        ${centerMarker}
        ${userAvatar}
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#gwHereViewportVignette)"></rect>
        ${elevationModel.hasElevation ? `<text x="${w - 4}" y="${h - 4}" text-anchor="end" font-size="5.2" fill="rgba(239,230,211,0.34)">Copernicus DEM</text>` : ""}
        <path d="M0 0 H${w} V${h} H0 Z" fill="none" stroke="rgba(240,209,138,0.15)" stroke-width="1"></path>
      </svg>
    `;
  }

  function renderMapModeToggle() {
    const checked = hereMap3dEnabled ? "checked" : "";
    const label = hereMap3dEnabled ? "Show 2D Original map" : "Show 3D viewport";
    const title = hereMap3dEnabled ? "3D viewport" : "2D Original";
    return `
      <label class="gw-here-map-toggle" title="${title}" aria-label="${label}">
        <input id="gwHereMap3dToggle" type="checkbox" ${checked}>
        <span class="gw-here-map-toggle-mark" aria-hidden="true"></span>
      </label>
    `;
  }

  function renderHere3dControls() {
    if (!hereMap3dEnabled) return "";
    return `
      <button class="gw-here-map-expand" type="button" data-here-3d-expand aria-label="${hereMap3dExpanded ? "Shrink 3D viewport" : "Expand 3D viewport"}" title="${hereMap3dExpanded ? "Shrink 3D viewport" : "Expand 3D viewport"}">${hereMap3dExpanded ? "−" : "+"}</button>
      <div class="gw-here-3d-controls" aria-label="3D view rotation controls">
        <button class="gw-here-3d-control" type="button" data-here-3d-rotate="-22.5" aria-label="Rotate view left" title="Rotate left">‹</button>
        <button class="gw-here-3d-control" type="button" data-here-3d-reset aria-label="Reset 3D rotation" title="Reset rotation">•</button>
        <button class="gw-here-3d-control" type="button" data-here-3d-rotate="22.5" aria-label="Rotate view right" title="Rotate right">›</button>
      </div>
    `;
  }

  function renderHereMap(bounds, selectedContext) {
    const view = hereMap3dEnabled
      ? renderHereViewport3d(bounds, selectedContext)
      : renderMiniMap(bounds, selectedContext);
    return `${view}${renderMapModeToggle()}${renderHere3dControls()}`;
  }

  function taxonDisplayName(name) {
    return window.GridWildTaxonomy?.displayName?.("iconic_taxon", name) || name || "Unknown";
  }

  function makeTaxonomyTree(record) {
    const root = {
      name: "Life",
      rank: "root",
      path: "root",
      weight: 0,
      genusNames: new Set(),
      rows: [],
      children: new Map()
    };

    const rows = Array.isArray(record?.genera) ? record.genera : [];

    function child(parent, rank, name) {
      const label = name || "Unknown";
      const key = `${rank}:${label}`;
      if (!parent.children.has(key)) {
        parent.children.set(key, {
          name: label,
          rank,
          path: `${parent.path}/${encodeURIComponent(key)}`,
          weight: 0,
          genusNames: new Set(),
          rows: [],
          children: new Map()
        });
      }
      return parent.children.get(key);
    }

    for (const row of rows) {
      const count = Math.max(0, Number(row?.count) || 0);
      if (count <= 0) continue;

      const genus = row?.genus_name || "Unknown";
      const parts = [
        ["iconic_taxon", row?.iconic_taxon_name || "Unknown"],
        ["order", row?.order_name || "Unknown"],
        ["family", row?.family_name || "Unknown"],
        ["genus", genus]
      ];

      let node = root;
      node.weight += count;
      node.rows.push(row);
      if (genus !== "Unknown") node.genusNames.add(genus);

      for (const [rank, name] of parts) {
        node = child(node, rank, name);
        node.weight += count;
        node.rows.push(row);
        if (genus !== "Unknown") node.genusNames.add(genus);
      }
    }

    function finalize(node) {
      return {
        ...node,
        genusCount: node.genusNames.size,
        children: Array.from(node.children.values())
          .map(finalize)
          .sort(
            (a, b) =>
              b.weight - a.weight || b.genusCount - a.genusCount || a.name.localeCompare(b.name)
          )
      };
    }

    return finalize(root);
  }

  function findPieNode(node, path) {
    if (!node) return null;
    if (node.path === path) return node;
    for (const child of node.children || []) {
      const found = findPieNode(child, path);
      if (found) return found;
    }
    return null;
  }

  function currentPieNode() {
    return findPieNode(herePieState.tree, herePieState.currentPath) || herePieState.tree;
  }

  function resetPieState(record, signature) {
    herePieState.signature = signature;
    herePieState.record = record;
    herePieState.tree = makeTaxonomyTree(record);
    herePieState.currentPath = "root";
    herePieState.pathStack = [];
  }

  function renderPie() {
    const node = currentPieNode();
    const counts = (node?.children || []).filter((child) => Number(child.weight) > 0).slice(0, 10);

    if (!counts.length) {
      return `
        <svg viewBox="0 0 220 160" role="img" aria-label="No taxa data" data-pie-back="true">
          <text x="110" y="74" text-anchor="middle" font-size="12" font-weight="850" fill="rgba(239,230,211,0.72)">No taxa yet</text>
          <text x="110" y="92" text-anchor="middle" font-size="10" fill="rgba(239,230,211,0.48)">selected cells are quiet</text>
        </svg>
      `;
    }

    const total = counts.reduce((sum, item) => sum + item.weight, 0) || 1;
    const cx = 75;
    const cy = 80;
    const rOuter = 50;
    const rInner = 22;
    let cursor = -Math.PI / 2;
    const slices = counts
      .map((item, index) => {
        const angle = (item.weight / total) * Math.PI * 2;
        const start = cursor;
        const end = cursor + angle;
        cursor = end;
        const color = TAXON_COLORS[index % TAXON_COLORS.length];
        const mid = (start + end) / 2;
        const lx = cx + Math.cos(mid) * 78;
        const ly = cy + Math.sin(mid) * 58;
        const pct = Math.round((item.weight / total) * 100);
        const label = taxonDisplayName(item.name);
        const canZoom = (item.children || []).length > 0;
        return `
        <g class="gw-here-pie-slice" data-pie-path="${esc(item.path)}" data-can-zoom="${canZoom ? "true" : "false"}">
          <title>${esc(label)} - ${item.weight} obs - ${item.genusCount} genera</title>
          <path d="${arcPath(cx, cy, rOuter, rInner, start, end, 3.5)}" fill="${color}" stroke="rgba(255,255,255,0.82)" stroke-width="1.2"></path>
          ${pct >= 9 ? `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" font-weight="850" fill="rgba(239,230,211,0.88)">${esc(label)}</text>` : ""}
        </g>
      `;
      })
      .join("");

    const legend = counts
      .slice(0, 4)
      .map((item, index) => {
        const label = taxonDisplayName(item.name);
        return `
        <g transform="translate(142 ${38 + index * 22})">
          <rect x="0" y="-8" width="8" height="8" rx="2" fill="${TAXON_COLORS[index % TAXON_COLORS.length]}"></rect>
          <text x="13" y="-2" font-size="9.5" font-weight="800" fill="rgba(239,230,211,0.82)">${esc(label)}</text>
          <text x="13" y="10" font-size="8.5" fill="rgba(239,230,211,0.52)">${item.weight} obs</text>
        </g>
      `;
      })
      .join("");

    const centerLabel = node?.rank === "root" ? "Taxa" : taxonDisplayName(node.name);
    return `
      <svg viewBox="0 0 220 160" role="img" aria-label="Taxa pie chart">
        <rect x="0" y="0" width="220" height="160" fill="transparent" data-pie-back="true"></rect>
        ${slices}
        <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="rgba(20,17,15,0.94)" stroke="rgba(240,209,138,0.18)"></circle>
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="10.5" font-weight="950" fill="#f0d18a">${esc(centerLabel).slice(0, 16)}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="8.5" fill="rgba(239,230,211,0.55)">${node.weight} obs</text>
        ${legend}
      </svg>
    `;
  }

  function formatCommonName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function genusCommonName(genus) {
    const rec = window.GridWildGenusCodex?.genera?.[genus];
    return formatCommonName(
      rec?.common || window.GridWildTaxonomy?.displayName?.("genus", genus) || ""
    );
  }

  function taxonListLabel(row) {
    const genus = row?.genus || row?.genus_name || "Unknown";
    const common = genusCommonName(genus);
    if (common && common !== genus) {
      return { main: common, sub: genus };
    }

    return { main: genus, sub: "" };
  }

  function scaledListFontSize(count, maxCount, minPx = 10, maxPx = 13) {
    const value = Math.max(0, Number(count) || 0);
    const max = Math.max(1, Number(maxCount) || 1);
    const t = Math.sqrt(value / max);
    return (minPx + (maxPx - minPx) * t).toFixed(1);
  }

  function inlineComma(index, total) {
    return index < total - 1 ? `<span class="gw-here-inline-comma">, </span>` : "";
  }

  function aggregateGeneraFromRows(rows) {
    const byGenus = new Map();

    for (const row of rows) {
      const genus = row?.genus_name;
      if (!genus || genus === "Unknown") continue;
      const count = Number(row?.count) || 0;
      if (count <= 0) continue;

      if (!byGenus.has(genus)) {
        byGenus.set(genus, {
          genus,
          count: 0,
          family: row?.family_name || "",
          order: row?.order_name || "",
          iconic: row?.iconic_taxon_name || ""
        });
      }

      byGenus.get(genus).count += count;
    }

    return Array.from(byGenus.values());
  }

  function normalizeHereListView(value) {
    return HERE_LIST_VIEWS.some((option) => option.id === value) ? value : "common";
  }

  function renderHereListSwitcher() {
    const activeView = normalizeHereListView(hereListView);
    return `
      <div class="gw-here-list-switch" role="radiogroup" aria-label="Here detail list">
        ${HERE_LIST_VIEWS.map((option) => {
          const checked = option.id === activeView ? "checked" : "";
          return `
            <label class="gw-here-list-option" for="gwHereListView_${esc(option.id)}">
              <input id="gwHereListView_${esc(option.id)}" type="radio" name="gwHereListView" value="${esc(option.id)}" ${checked}>
              <span class="gw-here-list-pill">${esc(option.label)}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;
  }

  function currentTaxaListContext() {
    const node = currentPieNode();
    const genera = aggregateGeneraFromRows(node?.rows || []);
    const common = genera
      .slice()
      .sort((a, b) => b.count - a.count || a.genus.localeCompare(b.genus))
      .slice(0, 5);
    const commonNames = new Set(common.map((row) => row.genus));
    let rare = genera
      .filter((row) => !commonNames.has(row.genus))
      .sort((a, b) => a.count - b.count || a.genus.localeCompare(b.genus))
      .slice(0, 5);

    if (!rare.length) {
      rare = genera
        .slice()
        .sort((a, b) => a.count - b.count || a.genus.localeCompare(b.genus))
        .slice(0, 5);
    }

    const nodeLabel = node?.rank === "root" ? "" : ` - ${taxonDisplayName(node.name)}`;
    const taxaMaxCount = Math.max(...genera.map((row) => Number(row.count) || 0), 1);

    return { common, genera, nodeLabel, rare, taxaMaxCount };
  }

  function renderTaxaSection(title, rows, context) {
    return `
      <div class="gw-here-taxa-group">
        <div class="gw-here-taxa-heading">${title}${esc(context.nodeLabel)}</div>
        <div class="gw-here-inline-list">
        ${rows
          .map((row, index) => {
            const label = taxonListLabel(row);
            const titleText = label.sub ? `${label.main} (${label.sub})` : label.main;
            const fontSize = scaledListFontSize(row.count, context.taxaMaxCount);
            return `
            <span class="gw-here-inline-item" style="font-size:${fontSize}px">
              <button class="gw-here-inline-link" type="button" data-genus="${esc(row.genus)}" title="${esc(titleText)} - ${esc(row.family || row.order || row.iconic || row.genus)}">${esc(label.main)}</button>
              <span class="gw-here-inline-count">${row.count}</span>${inlineComma(index, rows.length)}
            </span>
          `;
          })
          .join("")}
        </div>
      </div>
    `;
  }

  function renderTaxaList(view = "common") {
    const context = currentTaxaListContext();
    if (!context.genera.length) {
      return `<div class="gw-here-taxa-heading">No genus-level taxa in this context</div>`;
    }

    if (view === "rare") {
      return renderTaxaSection("Rare taxa", context.rare, context);
    }

    return renderTaxaSection("Common taxa", context.common, context);
  }

  function renderTopObserversList(record, observerDict) {
    const rows = (Array.isArray(record?.top_observers) ? record.top_observers : [])
      .filter((row) => (Number(row?.observer_id) || row?.observer_login) && Number(row?.count) > 0)
      .sort(
        (a, b) =>
          Number(b.count) - Number(a.count) ||
          Number(b.species) - Number(a.species) ||
          String(a.observer_login || a.observer_id || "").localeCompare(
            String(b.observer_login || b.observer_id || "")
          )
      )
      .slice(0, 5);

    if (!rows.length) {
      return `
        <div class="gw-here-taxa-group">
          <div class="gw-here-taxa-heading">Top observers</div>
          <div class="gw-here-taxa-heading">No observer leaderboard for this context</div>
        </div>
      `;
    }

    const api = gridApi();
    const maxCount = Math.max(...rows.map((row) => Number(row.count) || 0), 1);

    return `
      <div class="gw-here-taxa-group">
        <div class="gw-here-taxa-heading">Top observers</div>
        <div class="gw-here-inline-list">
        ${rows
          .map((row, index) => {
            const observerId = Number(row.observer_id);
            const meta =
              Number.isFinite(observerId) && observerId > 0
                ? api?.observerMeta?.(observerDict, observerId) || {}
                : {};
            const login = row.observer_login || meta.login || `user ${observerId}`;
            const name = row.observer_name || meta.name || "";
            const count = Number(row.count) || 0;
            const species = Number(row.species) || 0;
            const fontSize = scaledListFontSize(count, maxCount, 9.8, 12.8);
            const url =
              row.observer_url ||
              (login && !login.startsWith("user ")
                ? `https://www.inaturalist.org/people/${encodeURIComponent(login)}`
                : "");

            return `
            <span class="gw-here-inline-item" style="font-size:${fontSize}px" title="${esc(name || login)}">
              ${
                url
                  ? `
                <a class="gw-here-inline-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">@${esc(login)}</a>
              `
                  : `
                <span class="gw-here-inline-link">@${esc(login)}</span>
              `
              }
              <span class="gw-here-inline-count">${count}${species ? `/${species} spp` : ""}</span>${inlineComma(index, rows.length)}
            </span>
          `;
          })
          .join("")}
        </div>
      </div>
    `;
  }

  function renderActiveContextList() {
    const activeView = normalizeHereListView(hereListView);
    if (activeView === "rare") return renderTaxaList("rare");
    if (activeView === "observers") {
      return renderTopObserversList(herePieState.record, herePieState.observerDict);
    }
    return renderTaxaList("common");
  }

  function renderContextLists(previewNote = "", bodyHtml = null) {
    const body = bodyHtml == null ? renderActiveContextList() : bodyHtml;
    return `
      ${renderHereListSwitcher()}
      <div class="gw-here-list-body">
        ${previewNote}${body}
      </div>
    `;
  }

  function contextCells(bounds, selection = null) {
    const api = gridApi();
    const selectedCells = Array.isArray(selection?.cells) ? selection.cells : [];
    return selectedCells.length ? selectedCells : api?.cellsForBounds?.(bounds) || [];
  }

  function summarizeCells(bounds, selection = null) {
    const cells = contextCells(bounds, selection);
    return cells.reduce(
      (acc, cell) => {
        const m = cell.metrics || {};
        const count = Number(m.count) || 0;
        acc.obs += count;
        acc.species += Number(m.species) || 0;
        if (count > 0) acc.active++;
        return acc;
      },
      { cells: cells.length, active: 0, obs: 0, species: 0 }
    );
  }

  function compactStatNumber(value) {
    const n = Math.max(0, Number(value) || 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}m`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(Math.round(n));
  }

  function cellCountForBounds(bounds) {
    if (!bounds) return 0;
    return (
      Math.max(0, bounds.maxIx - bounds.minIx + 1) * Math.max(0, bounds.maxIy - bounds.minIy + 1)
    );
  }

  function centeredTaxaBounds(bounds, maxCells) {
    const count = cellCountForBounds(bounds);
    if (!bounds || count <= maxCells) return bounds;

    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const aspect = Math.max(0.25, Math.min(4, width / Math.max(1, height)));
    let takeW = Math.max(1, Math.min(width, Math.floor(Math.sqrt(maxCells * aspect))));
    let takeH = Math.max(1, Math.min(height, Math.floor(maxCells / takeW)));

    while (takeW * takeH > maxCells && takeH > 1) takeH--;
    while (takeW * takeH > maxCells && takeW > 1) takeW--;

    const centerIx = Math.floor((bounds.minIx + bounds.maxIx) / 2);
    const centerIy = Math.floor((bounds.minIy + bounds.maxIy) / 2);
    let minIx = centerIx - Math.floor((takeW - 1) / 2);
    let minIy = centerIy - Math.floor((takeH - 1) / 2);
    minIx = Math.max(bounds.minIx, Math.min(minIx, bounds.maxIx - takeW + 1));
    minIy = Math.max(bounds.minIy, Math.min(minIy, bounds.maxIy - takeH + 1));

    return {
      minIx,
      maxIx: minIx + takeW - 1,
      minIy,
      maxIy: minIy + takeH - 1
    };
  }

  function centeredCells(cells = [], maxCells = MAX_SELECTION_TAXA_CELLS) {
    if (!Array.isArray(cells) || cells.length <= maxCells) return cells || [];

    const bounds = boundsForCells(cells);
    if (!bounds) return cells.slice(0, maxCells);

    const cx = (bounds.minIx + bounds.maxIx) / 2;
    const cy = (bounds.minIy + bounds.maxIy) / 2;
    return cells
      .slice()
      .sort((a, b) => {
        const ad = Math.hypot(Number(a.ix) - cx, Number(a.iy) - cy);
        const bd = Math.hypot(Number(b.ix) - cx, Number(b.iy) - cy);
        return ad - bd || keyForCell(a).localeCompare(keyForCell(b));
      })
      .slice(0, maxCells);
  }

  function getTaxaBoundsForContext(bounds, selection) {
    const selectedCells = Array.isArray(selection?.cells) ? selection.cells : [];
    if (selectedCells.length) {
      const taxaCells = centeredCells(selectedCells, MAX_SELECTION_TAXA_CELLS);
      return {
        bounds: boundsForCells(taxaCells) || bounds,
        cells: taxaCells,
        capped: selectedCells.length > MAX_SELECTION_TAXA_CELLS,
        cellCount: selectedCells.length,
        taxaCellCount: taxaCells.length
      };
    }

    const maxCells = selection ? MAX_SELECTION_TAXA_CELLS : MAX_TAXA_CELLS;
    const count = cellCountForBounds(bounds);
    const taxaBounds = centeredTaxaBounds(bounds, maxCells);
    return {
      bounds: taxaBounds,
      capped: count > maxCells,
      cellCount: count,
      taxaCellCount: cellCountForBounds(taxaBounds)
    };
  }

  let refreshToken = 0;
  let herePanelOpen = false;
  const herePieState = {
    signature: null,
    record: null,
    observerDict: null,
    previewNote: "",
    tree: null,
    currentPath: "root",
    pathStack: []
  };

  function investigateButton() {
    return document.getElementById("gwHudInvestigateBtn");
  }

  function syncHerePanelState() {
    const panel = ensurePanel();
    const btn = investigateButton();
    if (panel) panel.hidden = !herePanelOpen;
    if (btn) {
      btn.classList.toggle("is-on", herePanelOpen);
      btn.setAttribute("aria-expanded", herePanelOpen ? "true" : "false");
      btn.setAttribute("aria-label", herePanelOpen ? "Close investigation" : "Investigate here");
      btn.title = herePanelOpen ? "Close investigation" : "Investigate";
    }
  }

  function setHerePanelOpen(open, options = {}) {
    herePanelOpen = open === true;
    syncHerePanelState();
    if (herePanelOpen && options.refresh !== false) {
      scheduleRefresh(10);
    }
  }

  function toggleHerePanel() {
    setHerePanelOpen(!herePanelOpen);
  }

  function rerenderPieOnly() {
    const chartEl = document.getElementById("gwHerePieChart");
    if (chartEl) chartEl.innerHTML = renderPie();
  }

  function rerenderTaxaListOnly() {
    const listEl = document.getElementById("gwHereTaxaList");
    if (listEl) listEl.innerHTML = renderContextLists(herePieState.previewNote || "");
  }

  function rerenderTaxaHud() {
    rerenderPieOnly();
    rerenderTaxaListOnly();
  }

  function setHereDownloadProgress(detail = {}) {
    if (detail.context !== "selection") return;

    const pct = Number.isFinite(Number(detail.pct))
      ? Math.max(0, Math.min(100, Number(detail.pct)))
      : Math.min(95, (Number(detail.page || 0) / 10) * 100);

    hereObservationDownload.progressPct = pct;
    hereObservationDownload.progressText =
      `Page ${detail.page || 0} - accepted ${detail.accepted || 0} - rejected ${detail.rejected || 0}` +
      (detail.duplicates ? ` - cached ${detail.duplicates}` : "");

    syncHereDownloadControl();
  }

  function syncHereDownloadControl(
    selection = window.GridWildSelectionTool?.getSelection?.() || null
  ) {
    const wrap = document.getElementById("gwHereObservationDownload");
    const btn = document.getElementById("gwHereObservationDownloadBtn");
    const progress = document.getElementById("gwHereObservationDownloadProgress");
    const progressText = document.getElementById("gwHereObservationDownloadProgressText");
    const progressBar = document.getElementById("gwHereObservationDownloadProgressBar");
    if (!wrap || !btn || !progress || !progressText || !progressBar) return;

    const hasSelection = !!selection?.bounds;
    wrap.classList.toggle("is-hidden", !hasSelection && !hereObservationDownload.busy);

    btn.disabled = !hasSelection || hereObservationDownload.busy;
    btn.textContent = hereObservationDownload.busy ? "Downloading..." : "Download My Observations";
    btn.title = hasSelection
      ? "Add your iNaturalist observations inside this selection to the local cache"
      : "Select cells first";

    progress.classList.toggle("is-active", hereObservationDownload.busy);
    progressText.textContent = hereObservationDownload.progressText || "Preparing download...";
    progressBar.style.width = `${Math.max(0, Math.min(100, hereObservationDownload.progressPct || 0))}%`;
  }

  function setHerePyriteProgress(detail = {}) {
    if (detail.context !== "selection") return;

    const pct = Number.isFinite(Number(detail.pct))
      ? Math.max(0, Math.min(100, Number(detail.pct)))
      : Math.min(95, (Number(detail.page || 0) / 10) * 100);

    herePyriteSeed.progressPct = pct;
    const stats =
      `Page ${detail.page || 0} - accepted ${detail.accepted || 0} - rejected ${detail.rejected || 0}` +
      (detail.duplicates ? ` - cached ${detail.duplicates}` : "");
    herePyriteSeed.progressText = detail.message ? `${stats} - ${detail.message}` : stats;

    syncHerePyriteControl();
  }

  function syncHerePyriteControl(
    selection = window.GridWildSelectionTool?.getSelection?.() || null
  ) {
    const wrap = document.getElementById("gwHerePyriteLake");
    const seedBtn = document.getElementById("gwHerePyriteSeedBtn");
    const toggleBtn = document.getElementById("gwHerePyriteToggleBtn");
    const clearBtn = document.getElementById("gwHerePyriteClearBtn");
    const progress = document.getElementById("gwHerePyriteProgress");
    const progressText = document.getElementById("gwHerePyriteProgressText");
    const progressBar = document.getElementById("gwHerePyriteProgressBar");
    const summaryEl = document.getElementById("gwHerePyriteSummary");
    if (
      !wrap ||
      !seedBtn ||
      !toggleBtn ||
      !clearBtn ||
      !progress ||
      !progressText ||
      !progressBar ||
      !summaryEl
    )
      return;

    const state = window.GridWildPyriteLake?.getState?.() || {
      enabled: false,
      hasData: false,
      summary: {}
    };
    const hasSelection = !!selection?.bounds;
    const hasData = state.hasData === true;
    const isEnabled = state.enabled === true && hasData;
    const s = state.summary || {};

    wrap.classList.toggle("is-hidden", !hasSelection && !herePyriteSeed.busy && !hasData);

    seedBtn.disabled =
      !hasSelection || herePyriteSeed.busy || !window.GridWildPyriteLake?.seedFromBounds;
    seedBtn.textContent = herePyriteSeed.busy ? "Seeding..." : "Seed Pyrite";
    seedBtn.title =
      "Add public iNaturalist observations inside this selection to the local pyrite lake";

    toggleBtn.disabled = !hasData || herePyriteSeed.busy;
    toggleBtn.textContent = isEnabled ? "On" : "Off";
    toggleBtn.title = isEnabled ? "Hide pyrite lake heat" : "Show pyrite lake heat";

    clearBtn.disabled = !hasData || herePyriteSeed.busy;
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear local pyrite lake data";

    progress.classList.toggle("is-active", herePyriteSeed.busy);
    progressText.textContent = herePyriteSeed.progressText || "Preparing seed...";
    progressBar.style.width = `${Math.max(0, Math.min(100, herePyriteSeed.progressPct || 0))}%`;

    summaryEl.textContent = hasData
      ? `Pyrite: ${compactStatNumber(s.observations)} obs - ${compactStatNumber(s.cells)} cells - ${isEnabled ? "on" : "off"}`
      : "Pyrite: 0 obs";
  }

  function latLngBoxForCellBounds(bounds) {
    const latLngBounds = gridApi()?.boundsToLatLngBounds?.(bounds);
    const sw = latLngBounds?.getSouthWest?.();
    const ne = latLngBounds?.getNorthEast?.();
    if (!sw || !ne) return null;

    return {
      swlat: sw.lat,
      swlng: sw.lng,
      nelat: ne.lat,
      nelng: ne.lng
    };
  }

  async function downloadSelectionObservations() {
    const selection = window.GridWildSelectionTool?.getSelection?.() || null;
    const bounds = selection?.bounds;
    if (!bounds) {
      toast("Select cells first");
      return;
    }

    if (!window.GridWildRecentINat?.downloadObservationsInBounds) {
      toast("Observation download is not loaded yet");
      return;
    }

    const latLngBox = latLngBoxForCellBounds(bounds);
    if (!latLngBox) {
      toast("Selection bounds are not available");
      return;
    }

    hereObservationDownload.busy = true;
    hereObservationDownload.progressPct = 0;
    hereObservationDownload.progressText = "Preparing download...";
    syncHereDownloadControl(selection);

    try {
      const result = await window.GridWildRecentINat.downloadObservationsInBounds(latLngBox, {
        username: window.__gwUser?.username || ""
      });
      hereObservationDownload.progressPct = 100;
      hereObservationDownload.progressText = `${result?.added || 0} added - ${result?.duplicates || 0} cached`;
      toast(`Cache updated: ${result?.added || 0} observations added`);
    } catch (err) {
      console.warn("Selection observation download failed:", err);
      toast(`Could not download observations: ${err.message}`);
    } finally {
      hereObservationDownload.busy = false;
      syncHereDownloadControl(window.GridWildSelectionTool?.getSelection?.() || null);
    }
  }

  async function seedSelectionPyriteLake() {
    const selection = window.GridWildSelectionTool?.getSelection?.() || null;
    const bounds = selection?.bounds;
    if (!bounds) {
      toast("Select cells first");
      return;
    }

    if (!window.GridWildPyriteLake?.seedFromBounds) {
      toast("Pyrite lake is not loaded yet");
      return;
    }

    const latLngBox = latLngBoxForCellBounds(bounds);
    if (!latLngBox) {
      toast("Selection bounds are not available");
      return;
    }

    herePyriteSeed.busy = true;
    herePyriteSeed.progressPct = 0;
    herePyriteSeed.progressText = "Preparing seed...";
    syncHerePyriteControl(selection);

    try {
      const result = await window.GridWildPyriteLake.seedFromBounds(latLngBox);
      herePyriteSeed.progressPct = 100;
      herePyriteSeed.progressText = result?.stoppedEarly
        ? `${result?.added || 0} added - stopped at page ${result.stoppedEarly.page}`
        : `${result?.added || 0} added - ${result?.duplicates || 0} cached`;
      toast(
        result?.stoppedEarly
          ? `Pyrite lake saved partial seed: ${result?.added || 0} observations added`
          : `Pyrite lake seeded: ${result?.added || 0} observations added`
      );
    } catch (err) {
      console.warn("Pyrite lake seed failed:", err);
      toast(`Could not seed pyrite lake: ${err.message}`);
    } finally {
      herePyriteSeed.busy = false;
      syncHerePyriteControl(window.GridWildSelectionTool?.getSelection?.() || null);
    }
  }

  async function togglePyriteLake() {
    if (!window.GridWildPyriteLake?.setEnabled) return;
    const state = window.GridWildPyriteLake.getState?.() || {};
    await window.GridWildPyriteLake.setEnabled(!(state.enabled === true));
    syncHerePyriteControl();
  }

  async function clearPyriteLake() {
    if (!window.GridWildPyriteLake?.clear) return;
    await window.GridWildPyriteLake.clear();
    herePyriteSeed.progressPct = 0;
    herePyriteSeed.progressText = "";
    syncHerePyriteControl();
    toast("Pyrite lake cleared");
  }

  function zoomPieTo(path) {
    const node = findPieNode(herePieState.tree, path);
    if (!node) return;

    if (!node.children?.length) {
      if (node.rank === "genus" && node.name && node.name !== "Unknown") {
        window.GridWildGenusCodex?.open?.(node.name);
      }
      return;
    }

    herePieState.pathStack = herePieState.pathStack || [];
    herePieState.pathStack.push(herePieState.currentPath || "root");
    herePieState.currentPath = path;
    rerenderTaxaHud();
  }

  function zoomPieBack() {
    if (herePieState.pathStack?.length) {
      herePieState.currentPath = herePieState.pathStack.pop();
    } else {
      herePieState.currentPath = "root";
    }
    rerenderTaxaHud();
  }

  function zoomPieHome() {
    herePieState.currentPath = "root";
    herePieState.pathStack = [];
    rerenderTaxaHud();
  }

  function setHere3dYawOffset(value) {
    hereMap3dYawOffsetDeg = (((Number(value) || 0) % 360) + 360) % 360;
    if (hereMap3dYawOffsetDeg > 180) hereMap3dYawOffsetDeg -= 360;
    scheduleRefresh(10);
  }

  function rotateHere3d(delta) {
    setHere3dYawOffset(hereMap3dYawOffsetDeg + (Number(delta) || 0));
  }

  function startHere3dDrag(evt) {
    if (!hereMap3dEnabled) return;
    const mapEl = evt.target.closest?.("#gwHereMap.is-3d");
    if (!mapEl) return;
    if (evt.target.closest?.("button, input, label")) return;

    evt.preventDefault();
    hereMap3dDrag = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startYaw: hereMap3dYawOffsetDeg
    };
    mapEl.setPointerCapture?.(evt.pointerId);
  }

  function moveHere3dDrag(evt) {
    if (!hereMap3dDrag || evt.pointerId !== hereMap3dDrag.pointerId) return;
    setHere3dYawOffset(hereMap3dDrag.startYaw + (evt.clientX - hereMap3dDrag.startX) * 0.45);
  }

  function endHere3dDrag(evt) {
    if (!hereMap3dDrag || evt.pointerId !== hereMap3dDrag.pointerId) return;
    hereMap3dDrag = null;
    scheduleRefresh(120);
  }

  function bindHerePanelInteractions() {
    const panel = ensurePanel();
    if (!panel || panel.dataset.interactionsBound === "true") return;
    panel.dataset.interactionsBound = "true";

    panel.addEventListener("click", (evt) => {
      const downloadBtn = evt.target.closest?.("#gwHereObservationDownloadBtn");
      if (downloadBtn) {
        evt.preventDefault();
        evt.stopPropagation();
        if (!downloadBtn.disabled) downloadSelectionObservations();
        return;
      }

      const pyriteSeedBtn = evt.target.closest?.("#gwHerePyriteSeedBtn");
      if (pyriteSeedBtn) {
        evt.preventDefault();
        evt.stopPropagation();
        if (!pyriteSeedBtn.disabled) seedSelectionPyriteLake();
        return;
      }

      const pyriteToggleBtn = evt.target.closest?.("#gwHerePyriteToggleBtn");
      if (pyriteToggleBtn) {
        evt.preventDefault();
        evt.stopPropagation();
        if (!pyriteToggleBtn.disabled) togglePyriteLake();
        return;
      }

      const pyriteClearBtn = evt.target.closest?.("#gwHerePyriteClearBtn");
      if (pyriteClearBtn) {
        evt.preventDefault();
        evt.stopPropagation();
        if (!pyriteClearBtn.disabled) clearPyriteLake();
        return;
      }

      const home = evt.target.closest?.("#gwHerePieHome");
      if (home) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieHome();
        return;
      }

      const taxonRow = evt.target.closest?.("[data-genus]");
      if (taxonRow) {
        evt.preventDefault();
        evt.stopPropagation();
        const genus = taxonRow.dataset.genus;
        if (genus) window.GridWildGenusCodex?.open?.(genus);
        return;
      }

      const mapModeToggle = evt.target.closest?.("#gwHereMap3dToggle");
      if (mapModeToggle) {
        evt.stopPropagation();
        hereMap3dEnabled = mapModeToggle.checked === true;
        if (!hereMap3dEnabled) hereMap3dExpanded = false;
        localStorage.setItem(HERE_MAP_3D_STORAGE_KEY, hereMap3dEnabled ? "true" : "false");
        scheduleRefresh(10);
        return;
      }

      const expand3d = evt.target.closest?.("[data-here-3d-expand]");
      if (expand3d) {
        evt.preventDefault();
        evt.stopPropagation();
        hereMap3dExpanded = !hereMap3dExpanded;
        scheduleRefresh(10);
        return;
      }

      const rotate3d = evt.target.closest?.("[data-here-3d-rotate]");
      if (rotate3d) {
        evt.preventDefault();
        evt.stopPropagation();
        rotateHere3d(Number(rotate3d.getAttribute("data-here-3d-rotate")));
        return;
      }

      const reset3d = evt.target.closest?.("[data-here-3d-reset]");
      if (reset3d) {
        evt.preventDefault();
        evt.stopPropagation();
        setHere3dYawOffset(0);
        return;
      }

      const slice = evt.target.closest?.("[data-pie-path]");
      if (slice) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieTo(slice.dataset.piePath);
        return;
      }

      if (evt.target.closest?.("[data-pie-back]")) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieBack();
        return;
      }

      if (evt.target.closest?.("#gwHerePieChart svg")) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieBack();
      }
    });

    panel.addEventListener("change", (evt) => {
      const input = evt.target.closest?.("input[name='gwHereListView']");
      if (!input) return;

      const nextView = normalizeHereListView(input.value);
      if (nextView === hereListView) return;

      hereListView = nextView;
      rerenderTaxaListOnly();
    });

    panel.addEventListener("pointerdown", startHere3dDrag);
    panel.addEventListener("pointermove", moveHere3dDrag);
    panel.addEventListener("pointerup", endHere3dDrag);
    panel.addEventListener("pointercancel", endHere3dDrag);
  }

  async function refresh() {
    const api = gridApi();
    if (!api) return;

    ensurePanel();
    if (!herePanelOpen) return;

    const token = ++refreshToken;
    const selection = window.GridWildSelectionTool?.getSelection?.() || null;
    const bounds = selection?.bounds || api.centerAreaBounds(HERE_RADIUS_CELLS);
    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const title = document.getElementById("gwHereTitle");
    const meta = document.getElementById("gwHereMeta");
    const mapEl = document.getElementById("gwHereMap");
    const pieChartEl = document.getElementById("gwHerePieChart");
    const taxaListEl = document.getElementById("gwHereTaxaList");
    const statsEl = document.getElementById("gwHereStats");
    const summary = summarizeCells(bounds, selection);
    const taxaContext = getTaxaBoundsForContext(bounds, selection);
    const taxaBounds = taxaContext.bounds;
    const filterSignature = api.activeFilterSignature?.() || "";
    const contextSignature = [
      selection?.signature || (selection ? "selection" : "here"),
      bounds.minIx,
      bounds.maxIx,
      bounds.minIy,
      bounds.maxIy,
      taxaBounds.minIx,
      taxaBounds.maxIx,
      taxaBounds.minIy,
      taxaBounds.maxIy,
      taxaContext.cells ? taxaContext.taxaCellCount : "bounds",
      filterSignature,
      taxaContext.capped ? "preview" : "full"
    ].join(":");

    if (title) title.textContent = selection?.label || (selection ? "Selection" : "Here");
    if (meta) {
      meta.textContent =
        selection?.cells?.length && selection.cells.length !== width * height
          ? `${selection.cells.length} cells`
          : `${width} x ${height}`;
    }
    if (mapEl) {
      mapEl.classList.toggle("is-3d", hereMap3dEnabled);
      mapEl.classList.toggle("is-expanded", hereMap3dEnabled && hereMap3dExpanded);
      mapEl.innerHTML = renderHereMap(bounds, selection || null);
    }
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="gw-here-stat" title="${summary.obs} observations"><b>${compactStatNumber(summary.obs)}</b><span>Obs</span></div>
        <div class="gw-here-stat" title="${summary.species} species"><b>${compactStatNumber(summary.species)}</b><span>Spp</span></div>
        <div class="gw-here-stat" title="${summary.active} active cells of ${summary.cells} cells"><b>${compactStatNumber(summary.active)}/${compactStatNumber(summary.cells)}</b><span>Cells</span></div>
      `;
    }
    syncHereDownloadControl(selection);
    syncHerePyriteControl(selection);

    if (pieChartEl) {
      pieChartEl.innerHTML = `
        <svg viewBox="0 0 220 160" role="img" aria-label="Loading taxa">
          <text x="110" y="82" text-anchor="middle" font-size="11" font-weight="850" fill="rgba(239,230,211,0.64)">Reading taxa...</text>
        </svg>
      `;
    }
    if (taxaListEl) {
      taxaListEl.innerHTML = renderContextLists(
        "",
        `<div class="gw-here-taxa-heading">Reading taxa...</div>`
      );
    }

    const [record, observerDict] = await Promise.all([
      taxaContext.cells && api.mergedGeneraRecordForCells
        ? api.mergedGeneraRecordForCells(taxaContext.cells, { applyFilters: true })
        : api.mergedGeneraRecordForBounds(taxaBounds, { applyFilters: true }),
      api.loadObserverDictionary?.().catch(() => null)
    ]);
    if (token !== refreshToken) return;
    herePieState.taxaContext = taxaContext;
    herePieState.observerDict = observerDict || null;
    herePieState.previewNote = taxaContext.capped
      ? `<div class="gw-here-taxa-heading">Taxa preview: ${taxaContext.taxaCellCount}/${taxaContext.cellCount} selected cells</div>`
      : "";
    if (herePieState.signature !== contextSignature) {
      resetPieState(record, contextSignature);
    } else {
      herePieState.record = record;
      herePieState.tree = makeTaxonomyTree(record);
      if (!findPieNode(herePieState.tree, herePieState.currentPath)) {
        herePieState.currentPath = "root";
        herePieState.pathStack = [];
      }
    }
    if (pieChartEl) pieChartEl.innerHTML = renderPie();
    if (taxaListEl) {
      taxaListEl.innerHTML = renderContextLists(herePieState.previewNote);
    }
  }

  function scheduleRefresh(delay = 90) {
    clearTimeout(scheduleRefresh.timer);
    scheduleRefresh.timer = setTimeout(refresh, delay);
  }

  function ensureSelectionLayer() {
    if (!window.map || !window.L) return null;
    if (!map.getPane("gwSelectionPane")) {
      map.createPane("gwSelectionPane");
      map.getPane("gwSelectionPane").style.zIndex = 735;
      map.getPane("gwSelectionPane").style.pointerEvents = "none";
    }

    if (!ensureSelectionLayer.layer) {
      ensureSelectionLayer.layer = L.layerGroup([], { pane: "gwSelectionPane" }).addTo(map);
    }

    return ensureSelectionLayer.layer;
  }

  function selectionTool() {
    let armed = false;
    let dragging = false;
    let startCell = null;
    let hoverCell = null;
    let selection = null;
    let draftRect = null;
    let finalRect = null;
    let activePointerId = null;
    let gestureState = null;

    function button() {
      return document.getElementById("gwHudSelectTool");
    }

    function mapContainer() {
      return map?.getContainer?.() || document.getElementById("map");
    }

    function isGestureEnabled(handler) {
      return typeof handler?.enabled === "function" ? handler.enabled() : true;
    }

    function setMapGesturesLocked(locked) {
      const container = mapContainer();
      if (locked) {
        if (!gestureState) {
          gestureState = {
            dragging: isGestureEnabled(map.dragging),
            touchZoom: isGestureEnabled(map.touchZoom),
            doubleClickZoom: isGestureEnabled(map.doubleClickZoom)
          };
        }
        map.dragging?.disable?.();
        map.touchZoom?.disable?.();
        map.doubleClickZoom?.disable?.();
        if (container) container.style.touchAction = "none";
        return;
      }

      if (gestureState?.dragging) map.dragging?.enable?.();
      if (gestureState?.touchZoom) map.touchZoom?.enable?.();
      if (gestureState?.doubleClickZoom) map.doubleClickZoom?.enable?.();
      gestureState = null;
      if (container) container.style.touchAction = "";
    }

    function syncButton() {
      const btn = button();
      if (!btn) return;
      btn.classList.toggle("is-armed", armed);
      btn.classList.toggle("has-selection", !!selection);
      btn.setAttribute("aria-pressed", armed || selection ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        selection ? "Clear selection" : armed ? "Cancel cell selection" : "Select cells"
      );
      btn.title = selection ? "Clear selection" : armed ? "Cancel selection" : "Select cells";
      document.body.classList.toggle("gw-selection-active", armed);
    }

    function fireChange() {
      window.dispatchEvent(
        new CustomEvent("gridwild:selectionchange", {
          detail: { selection }
        })
      );
      if (selection) setHerePanelOpen(true);
      scheduleRefresh(10);
    }

    function drawRect(bounds, final = false) {
      const layer = ensureSelectionLayer();
      const api = gridApi();
      if (!layer || !api || !bounds) return null;
      const rect = L.rectangle(api.boundsToLatLngBounds(bounds), {
        pane: "gwSelectionPane",
        interactive: false,
        className: "gw-map-selection-rect",
        color: "#ffe7a3",
        weight: final ? 2.8 : 2,
        opacity: final ? 0.98 : 0.78,
        dashArray: final ? "8 5" : "4 5",
        fillColor: "#ffe7a3",
        fillOpacity: final ? 0.08 : 0.05
      });
      rect.addTo(layer);
      return rect;
    }

    function hydrateCells(rawCells = []) {
      const api = gridApi();
      const seen = new Set();
      return (Array.isArray(rawCells) ? rawCells : [])
        .map((cell) => ({
          ix: Math.floor(Number(cell?.ix)),
          iy: Math.floor(Number(cell?.iy))
        }))
        .filter((cell) => Number.isFinite(cell.ix) && Number.isFinite(cell.iy))
        .filter((cell) => {
          const key = `${cell.ix},${cell.iy}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((cell) => {
          const key = `${cell.ix},${cell.iy}`;
          const baseMetrics =
            window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;
          const metrics =
            typeof window.getDisplayMetricsForCell === "function"
              ? window.getDisplayMetricsForCell(cell.ix, cell.iy, baseMetrics || null)
              : baseMetrics;
          return {
            ...cell,
            key,
            metrics: metrics || null,
            style: metrics ? api?.metricsToFill?.(metrics) || null : null,
            bounds: api?.cellBounds?.(cell.ix, cell.iy) || null
          };
        });
    }

    function normalizedSelectionFromCells(rawCells = [], options = {}) {
      const cells = hydrateCells(rawCells);
      const bounds = options.bounds || boundsForCells(cells);
      if (!cells.length || !bounds) return null;
      const signatureParts = [
        options.source || "cells",
        options.label || "Selection",
        bounds.minIx,
        bounds.maxIx,
        bounds.minIy,
        bounds.maxIy,
        cells.length,
        cells.slice(0, 16).map(keyForCell).join("|")
      ];
      return {
        bounds,
        cells,
        cellKeys: new Set(cells.map(keyForCell).filter(Boolean)),
        rings: Array.isArray(options.rings) ? options.rings : [],
        label: options.label || "Selection",
        source: options.source || "cells",
        signature: options.signature || signatureParts.join(":")
      };
    }

    function drawSelectionShape(nextSelection) {
      const layer = ensureSelectionLayer();
      const api = gridApi();
      if (!layer || !api || !nextSelection?.bounds) return null;

      const rings = (Array.isArray(nextSelection.rings) ? nextSelection.rings : [])
        .map((ring) =>
          (Array.isArray(ring) ? ring : [])
            .map((point) => ({
              lat: Number(point?.lat ?? point?.[0]),
              lng: Number(point?.lng ?? point?.[1])
            }))
            .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        )
        .filter((ring) => ring.length >= 3);

      if (rings.length && window.L) {
        const group = L.layerGroup([], { pane: "gwSelectionPane" }).addTo(layer);
        rings.forEach((ring) => {
          L.polygon(
            ring.map((point) => [point.lat, point.lng]),
            {
              pane: "gwSelectionPane",
              interactive: false,
              className: "gw-map-selection-rect",
              color: "#ffe7a3",
              weight: 2.8,
              opacity: 0.98,
              dashArray: "8 5",
              fillColor: "#ffe7a3",
              fillOpacity: 0.08
            }
          ).addTo(group);
        });
        return group;
      }

      const cells = Array.isArray(nextSelection.cells) ? nextSelection.cells : [];
      if (nextSelection.source !== "lasso" && cells.length && cells.length <= 260 && window.L) {
        const group = L.layerGroup([], { pane: "gwSelectionPane" }).addTo(layer);
        cells.forEach((cell) => {
          L.rectangle(
            api.boundsToLatLngBounds({
              minIx: cell.ix,
              maxIx: cell.ix,
              minIy: cell.iy,
              maxIy: cell.iy
            }),
            {
              pane: "gwSelectionPane",
              interactive: false,
              className: "gw-map-selection-rect",
              color: "#ffe7a3",
              weight: 1.4,
              opacity: 0.76,
              dashArray: "4 4",
              fillColor: "#ffe7a3",
              fillOpacity: 0.06
            }
          ).addTo(group);
        });
        return group;
      }

      return drawRect(nextSelection.bounds, true);
    }

    function applySelection(nextSelection, options = {}) {
      const layer = ensureSelectionLayer();
      if (!layer || !nextSelection) return null;
      if (draftRect) {
        layer.removeLayer(draftRect);
        draftRect = null;
      }
      if (finalRect) layer.removeLayer(finalRect);
      finalRect = drawSelectionShape(nextSelection);
      selection = nextSelection;
      armed = false;
      dragging = false;
      startCell = null;
      hoverCell = null;
      activePointerId = null;
      setMapGesturesLocked(false);
      syncButton();
      fireChange();
      if (options.toast !== false)
        toast(options.toastMessage || `${selection.cells.length} cells selected`);
      return selection;
    }

    function redrawDraft() {
      const layer = ensureSelectionLayer();
      const api = gridApi();
      if (!layer || !api || !startCell || !hoverCell) return;
      if (draftRect) layer.removeLayer(draftRect);
      draftRect = drawRect(api.normalizeCellBounds(startCell, hoverCell), false);
    }

    function setFinal(bounds) {
      const nextSelection = normalizedSelectionFromCells(
        gridApi()?.cellsForBounds?.(bounds) || [],
        {
          bounds,
          label: "Selection",
          source: "lasso"
        }
      );
      applySelection(nextSelection);
    }

    function clearSelection() {
      const layer = ensureSelectionLayer();
      if (draftRect && layer) layer.removeLayer(draftRect);
      if (finalRect && layer) layer.removeLayer(finalRect);
      draftRect = null;
      finalRect = null;
      selection = null;
      dragging = false;
      startCell = null;
      hoverCell = null;
      armed = false;
      activePointerId = null;
      setMapGesturesLocked(false);
      syncButton();
      fireChange();
    }

    function arm() {
      armed = true;
      if (selection) clearSelection();
      armed = true;
      setMapGesturesLocked(true);
      syncButton();
      toast("Drag to select cells");
    }

    function cancelArm() {
      armed = false;
      dragging = false;
      startCell = null;
      hoverCell = null;
      if (draftRect) {
        ensureSelectionLayer()?.removeLayer(draftRect);
        draftRect = null;
      }
      activePointerId = null;
      setMapGesturesLocked(false);
      syncButton();
    }

    function toggleFromButton() {
      if (selection) {
        clearSelection();
        return;
      }

      if (armed) {
        cancelArm();
        return;
      }

      arm();
    }

    function onMouseDown(evt) {
      if (!armed || !evt?.latlng) return;
      evt.originalEvent?.preventDefault?.();
      evt.originalEvent?.stopPropagation?.();
      setMapGesturesLocked(true);
      dragging = true;
      startCell = gridApi().latLngToCell(evt.latlng);
      hoverCell = startCell;
      redrawDraft();
    }

    function onMouseMove(evt) {
      if (!armed || !dragging || !evt?.latlng) return;
      hoverCell = gridApi().latLngToCell(evt.latlng);
      redrawDraft();
    }

    function onMouseUp(evt) {
      if (!armed || !dragging) return;
      evt.originalEvent?.preventDefault?.();
      evt.originalEvent?.stopPropagation?.();
      hoverCell = evt?.latlng ? gridApi().latLngToCell(evt.latlng) : hoverCell;
      setFinal(gridApi().normalizeCellBounds(startCell, hoverCell));
    }

    function latLngForDomEvent(evt) {
      const source = evt?.changedTouches?.[0] || evt?.touches?.[0] || evt;
      if (
        !source ||
        !Number.isFinite(Number(source.clientX)) ||
        !Number.isFinite(Number(source.clientY))
      )
        return null;
      return map.mouseEventToLatLng(source);
    }

    function beginDomDrag(evt) {
      if (!armed || dragging) return;
      if (evt.pointerType === "mouse") return;
      const latlng = latLngForDomEvent(evt);
      if (!latlng) return;

      evt.preventDefault?.();
      evt.stopPropagation?.();
      activePointerId = Number.isFinite(evt.pointerId) ? evt.pointerId : "touch";
      if (Number.isFinite(evt.pointerId)) {
        mapContainer()?.setPointerCapture?.(evt.pointerId);
      }
      setMapGesturesLocked(true);
      dragging = true;
      startCell = gridApi().latLngToCell(latlng);
      hoverCell = startCell;
      redrawDraft();
    }

    function moveDomDrag(evt) {
      if (!armed || !dragging) return;
      if (Number.isFinite(evt.pointerId) && activePointerId !== evt.pointerId) return;
      const latlng = latLngForDomEvent(evt);
      if (!latlng) return;

      evt.preventDefault?.();
      evt.stopPropagation?.();
      hoverCell = gridApi().latLngToCell(latlng);
      redrawDraft();
    }

    function finishDomDrag(evt) {
      if (!armed || !dragging) return;
      if (Number.isFinite(evt.pointerId) && activePointerId !== evt.pointerId) return;
      const latlng = latLngForDomEvent(evt);

      evt.preventDefault?.();
      evt.stopPropagation?.();
      if (latlng) hoverCell = gridApi().latLngToCell(latlng);
      if (startCell && hoverCell) {
        setFinal(gridApi().normalizeCellBounds(startCell, hoverCell));
      } else {
        cancelArm();
      }
    }

    function bind() {
      const btn = button();
      if (!btn || btn.dataset.bound === "true") return;
      btn.dataset.bound = "true";
      btn.addEventListener("click", toggleFromButton);
      map.on("mousedown", onMouseDown);
      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);
      map.on("mouseout", onMouseUp);
      const container = mapContainer();
      if (container) {
        container.addEventListener("pointerdown", beginDomDrag);
        container.addEventListener("pointermove", moveDomDrag);
        container.addEventListener("pointerup", finishDomDrag);
        container.addEventListener("pointercancel", finishDomDrag);
        container.addEventListener("touchstart", beginDomDrag, { passive: false });
        container.addEventListener("touchmove", moveDomDrag, { passive: false });
        container.addEventListener("touchend", finishDomDrag, { passive: false });
        container.addEventListener("touchcancel", finishDomDrag, { passive: false });
      }
      syncButton();
    }

    return {
      bind,
      clear: clearSelection,
      getSelection: () => selection,
      setSelectionFromCells: (cells, options = {}) =>
        applySelection(normalizedSelectionFromCells(cells, options), options)
    };
  }

  function init() {
    if (!window.map || !window.L) return;
    injectStyles();
    ensureButton();
    ensurePanel();
    bindHerePanelInteractions();
    syncHerePanelState();

    window.GridWildSelectionTool = window.GridWildSelectionTool || selectionTool();
    window.GridWildSelectionTool.bind();

    window.GridWildHerePanel = window.GridWildHerePanel || {
      refresh,
      scheduleRefresh,
      open: () => setHerePanelOpen(true),
      close: () => setHerePanelOpen(false),
      toggle: toggleHerePanel,
      isOpen: () => herePanelOpen
    };

    const investigate = investigateButton();
    if (investigate && investigate.dataset.bound !== "true") {
      investigate.dataset.bound = "true";
      investigate.addEventListener("click", toggleHerePanel);
    }

    map.on("moveend zoomend resize", () => {
      if (!window.GridWildSelectionTool?.getSelection?.()) scheduleRefresh();
      else scheduleRefresh(200);
    });
    window.addEventListener("gridwild:selectionchange", () => scheduleRefresh(10));
    window.addEventListener("gridwild:filterschange", () => scheduleRefresh(10));
    window.addEventListener("gridwild:heatchange", () => scheduleRefresh(10));
    window.addEventListener("gwOsmFeaturesUpdated", () => scheduleRefresh(40));
    window.addEventListener("gwRecentINatUpdated", () => scheduleRefresh(80));
    window.addEventListener("gwRecentINatProgress", (evt) =>
      setHereDownloadProgress(evt.detail || {})
    );
    window.addEventListener("gwPyriteLakeUpdated", () => scheduleRefresh(40));
    window.addEventListener("gwPyriteLakeProgress", (evt) =>
      setHerePyriteProgress(evt.detail || {})
    );
    document.addEventListener("change", (evt) => {
      if (
        evt.target?.matches?.(
          "[data-iconic], #taxaChecklist input, #toggleHeat, #toggleHeatZThreshold, input[name='heatMetric'], #gwHeatZThresholdInput"
        )
      ) {
        scheduleRefresh(10);
      }
    });
    document.addEventListener("input", (evt) => {
      if (evt.target?.matches?.("#gwHeatZThresholdSlider, #gwHeatZThresholdInput")) {
        scheduleRefresh(10);
      }
    });
    document.addEventListener("click", (evt) => {
      if (evt.target?.closest?.("#gwHudHighContrastToggle, #gwHeatZThresholdDirectionBtn")) {
        scheduleRefresh(10);
      }
    });
    window.addEventListener("load", () => scheduleRefresh(250));
    scheduleRefresh(200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
