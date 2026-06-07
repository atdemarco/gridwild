// -----------------------------------------------------------------------------
// GridWild Quest Layer
// JRPG + Field Ops active quest overlay
// -----------------------------------------------------------------------------

(function () {
  const QUEST_PANE = "gwQuestPane";
  const HUD_COLLAPSED_KEY = "gw_quest_hud_collapsed";
  const TARGET_SET_MIN_ZOOM = 18;
  const TARGET_SET_VISIBLE_GLYPH_CAP = 36;
  const TARGET_SET_COARSE_VISIBLE_BIN_CAP = 72;

  let questLayer = null;
  let targetLayer = null;
  let tetherLayer = null;
  let tetherLine = null;
  let lastTetherKey = "";
  let pulseMarker = null;
  let hudChip = null;
  let hudRaiseTab = null;
  let raiseTabPositionBound = false;
  let targetSetMotionBound = false;
  let targetSetRenderPending = false;
  let targetSetQualifying = false;
  let activeQuest = null;

  function ensurePaneAndLayers() {
    if (!map.getPane(QUEST_PANE)) {
      map.createPane(QUEST_PANE);
      map.getPane(QUEST_PANE).style.zIndex = 760;
      map.getPane(QUEST_PANE).style.pointerEvents = "none";
    }

    if (!questLayer) {
      questLayer = L.layerGroup([], { pane: QUEST_PANE }).addTo(map);
      targetLayer = L.layerGroup([], { pane: QUEST_PANE }).addTo(map);
      tetherLayer = L.layerGroup([], { pane: QUEST_PANE }).addTo(map);
    }

    injectStyles();
    bindTargetSetMotion();
  }

  function injectStyles() {
    if (document.getElementById("gwQuestLayerStyles")) return;

    const style = document.createElement("style");
    style.id = "gwQuestLayerStyles";
    style.textContent = `
      .gw-quest-target-cell {
        stroke: rgba(255,224,130,0.98);
        stroke-width: 2.2;
        stroke-dasharray: 7 5;
        fill: rgba(255,224,130,0.14);
        filter: drop-shadow(0 0 8px rgba(255,224,130,0.75));
        animation: gwQuestPulse 1.35s ease-in-out infinite;
      }

      .gw-quest-target-zone {
        stroke: rgba(118,231,191,0.95);
        stroke-width: 2;
        stroke-dasharray: 10 7;
        fill: rgba(118,231,191,0.10);
        filter: drop-shadow(0 0 10px rgba(118,231,191,0.55));
        animation: gwQuestPulse 1.65s ease-in-out infinite;
      }

      .gw-quest-target-glyph-cell {
        stroke: rgba(255,126,126,0.92);
        stroke-width: 1.6;
        stroke-dasharray: 4 4;
        fill: rgba(255,126,126,0.10);
        filter: drop-shadow(0 0 6px rgba(255,126,126,0.60));
      }

      .gw-quest-target-glyph-cell.is-qualifying {
        stroke: rgba(118,231,191,0.98);
        fill: rgba(118,231,191,0.16);
        filter: drop-shadow(0 0 8px rgba(118,231,191,0.72));
      }

      .gw-quest-target-glyph-cell.is-claimed {
        stroke: rgba(144,238,172,0.98);
        stroke-width: 2;
        stroke-dasharray: none;
        fill: rgba(100,220,145,0.22);
        filter: drop-shadow(0 0 9px rgba(100,220,145,0.82));
      }

      .gw-quest-target-glyph {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        box-sizing: border-box;
        border: 2px solid rgba(255,126,126,0.96);
        box-shadow:
          0 0 0 4px rgba(255,126,126,0.14),
          0 0 16px rgba(255,126,126,0.70);
        position: relative;
        animation: gwQuestTargetGlyph 1.25s ease-in-out infinite;
      }

      .gw-quest-target-glyph.is-qualifying {
        border-color: rgba(118,231,191,0.98);
        box-shadow:
          0 0 0 4px rgba(118,231,191,0.16),
          0 0 17px rgba(118,231,191,0.78);
      }

      .gw-quest-target-glyph.is-claimed {
        border-color: rgba(144,238,172,0.98);
        background: rgba(100,220,145,0.20);
        box-shadow:
          0 0 0 4px rgba(100,220,145,0.17),
          0 0 18px rgba(100,220,145,0.86);
      }

      .gw-quest-target-glyph::before,
      .gw-quest-target-glyph::after {
        content: "";
        position: absolute;
        background: rgba(255,247,223,0.92);
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
      }

      .gw-quest-target-glyph::before {
        width: 2px;
        height: 14px;
      }

      .gw-quest-target-glyph::after {
        width: 14px;
        height: 2px;
      }

      .gw-quest-target-glyph-check {
        position: relative;
        z-index: 2;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: #fff7df;
        font-size: 13px;
        font-weight: 950;
        text-shadow: 0 1px 2px rgba(0,0,0,0.68);
      }

      .gw-quest-target-coarse-cell {
        filter: drop-shadow(0 0 8px rgba(255,126,126,0.52));
      }

      .gw-quest-target-coarse-cell.is-qualifying {
        filter: drop-shadow(0 0 10px rgba(118,231,191,0.68));
      }

      .gw-quest-target-coarse-cell.is-claimed {
        filter: drop-shadow(0 0 11px rgba(100,220,145,0.76));
      }

      .gw-quest-target-coarse-glyph {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        box-sizing: border-box;
        border: 2px solid rgba(255,126,126,0.98);
        background:
          radial-gradient(circle, rgba(255,247,223,0.95) 0 10%, transparent 11% 100%),
          radial-gradient(circle, transparent 0 45%, rgba(255,126,126,0.18) 46% 100%);
        box-shadow:
          0 0 0 5px rgba(255,126,126,0.13),
          0 0 18px rgba(255,126,126,0.74);
        position: relative;
        display: grid;
        place-items: center;
        color: #fff4da;
        font-size: 9px;
        line-height: 1;
        font-weight: 900;
        text-shadow: 0 1px 2px rgba(0,0,0,0.65);
        animation: gwQuestTargetGlyph 1.45s ease-in-out infinite;
      }

      .gw-quest-target-coarse-glyph.is-qualifying {
        border-color: rgba(118,231,191,0.98);
        background:
          radial-gradient(circle, rgba(255,247,223,0.95) 0 10%, transparent 11% 100%),
          radial-gradient(circle, transparent 0 45%, rgba(118,231,191,0.22) 46% 100%);
        box-shadow:
          0 0 0 5px rgba(118,231,191,0.15),
          0 0 20px rgba(118,231,191,0.82);
      }

      .gw-quest-target-coarse-glyph.is-claimed {
        border-color: rgba(144,238,172,0.98);
        background:
          radial-gradient(circle, rgba(255,247,223,0.95) 0 10%, transparent 11% 100%),
          radial-gradient(circle, transparent 0 45%, rgba(100,220,145,0.24) 46% 100%);
        box-shadow:
          0 0 0 5px rgba(100,220,145,0.16),
          0 0 21px rgba(100,220,145,0.84);
      }

      .gw-quest-target-coarse-glyph::before,
      .gw-quest-target-coarse-glyph::after {
        content: "";
        position: absolute;
        background: rgba(255,247,223,0.86);
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
      }

      .gw-quest-target-coarse-glyph::before {
        width: 2px;
        height: 18px;
      }

      .gw-quest-target-coarse-glyph::after {
        width: 18px;
        height: 2px;
      }

      .gw-quest-target-coarse-count {
        position: relative;
        z-index: 1;
        min-width: 12px;
        padding: 1px 3px;
        border-radius: 999px;
        background: rgba(38,21,18,0.74);
      }

      .gw-quest-target-polygon {
        stroke: rgba(255,126,126,0.92);
        stroke-width: 2;
        stroke-dasharray: 8 6;
        fill: rgba(255,126,126,0.08);
        filter: drop-shadow(0 0 8px rgba(255,126,126,0.50));
      }

      .gw-quest-tether {
        stroke: rgba(255,224,130,0.92);
        stroke-width: 3;
        stroke-dasharray: 8 10;
        filter: drop-shadow(0 0 6px rgba(255,224,130,0.62));
        animation: gwQuestDash 0.9s linear infinite;
      }

      .gw-quest-beacon {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background:
          radial-gradient(circle, rgba(255,255,255,0.95) 0 14%, rgba(255,224,130,0.95) 15% 34%, rgba(255,224,130,0.22) 35% 100%);
        border: 2px solid rgba(255,224,130,0.95);
        box-shadow:
          0 0 0 8px rgba(255,224,130,0.12),
          0 0 22px rgba(255,224,130,0.85),
          0 0 42px rgba(118,231,191,0.36);
        animation: gwQuestBeacon 1.15s ease-in-out infinite;
      }

      .gw-active-quest-chip {
        position: fixed;
        left: 50%;
        right: auto;
        top: calc(max(12px, env(safe-area-inset-top)) + 54px);
        width: min(520px, calc(100vw - 128px));
        transform: translateX(-50%);
        z-index: 1410;
        pointer-events: auto;

        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;

        padding: 10px 12px;
        border-radius: 18px;
        color: #efe6d3;
        background:
          radial-gradient(circle at 8% 20%, rgba(255,224,130,0.16), transparent 36%),
          linear-gradient(180deg, rgba(43,36,29,0.97), rgba(20,17,15,0.98));
        border: 1px solid rgba(215,183,116,0.52);
        box-shadow:
          0 12px 30px rgba(0,0,0,0.34),
          inset 0 1px 0 rgba(255,255,255,0.05);
        transition: width 180ms ease, padding 180ms ease, border-radius 180ms ease, transform 180ms ease;
      }

      @media (max-width: 520px) {
        .gw-active-quest-chip {
          width: min(360px, calc(100vw - 92px));
          gap: 8px;
          padding: 9px 10px;
        }
      }

      .gw-active-quest-chip.is-collapsed {
        display: none;
      }

      .gw-active-quest-chip-main {
        min-width: 0;
        flex: 1 1 auto;
      }

      .gw-active-quest-chip.is-collapsed .gw-active-quest-chip-main,
      .gw-active-quest-chip.is-collapsed .gw-active-quest-distance {
        display: none;
      }

      .gw-active-quest-collapsed-label {
        display: none;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.08em;
        color: #ffe082;
      }

      .gw-active-quest-chip.is-collapsed .gw-active-quest-collapsed-label {
        display: inline-flex;
      }

      .gw-active-quest-collapse-btn {
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(215,183,116,0.42);
        border-radius: 8px;
        color: #ffe082;
        background: rgba(255,255,255,0.06);
        cursor: pointer;
      }

      .gw-active-quest-collapse-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        stroke-width: 2.4;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-active-quest-collapse-btn:hover {
        background: rgba(255,224,130,0.14);
      }

      .gw-active-quest-evidence-btn {
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(118,231,191,0.42);
        border-radius: 10px;
        color: #9ff0ce;
        background: rgba(118,231,191,0.10);
        cursor: pointer;
      }

      .gw-active-quest-evidence-btn svg {
        width: 17px;
        height: 17px;
        stroke: currentColor;
        stroke-width: 2.2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-active-quest-evidence-btn:hover {
        background: rgba(118,231,191,0.18);
      }

      .gw-active-quest-abandon-btn {
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(255,126,126,0.42);
        border-radius: 10px;
        color: #ff9b9b;
        background: rgba(255,126,126,0.10);
        cursor: pointer;
      }

      .gw-active-quest-abandon-btn svg {
        width: 17px;
        height: 17px;
        stroke: currentColor;
        stroke-width: 2.3;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-active-quest-abandon-btn:hover {
        background: rgba(255,126,126,0.18);
      }

      .gw-active-quest-chip.is-collapsed .gw-active-quest-evidence-btn,
      .gw-active-quest-chip.is-collapsed .gw-active-quest-abandon-btn {
        display: none;
      }

.gw-quest-reward-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(7, 10, 8, 0.58);
}

.gw-quest-reward-card {
  width: min(390px, 92vw);
  border-radius: 26px;
  padding: 22px 18px 18px;
  text-align: center;
  color: #efe6d3;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,224,130,0.20), transparent 42%),
    linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
  border: 2px solid rgba(255,224,130,0.72);
  box-shadow:
    0 24px 80px rgba(0,0,0,0.58),
    0 0 42px rgba(255,224,130,0.18);
  animation: gwRewardPop 220ms ease-out;
}

.gw-quest-reward-kicker {
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f0d18a;
}

.gw-quest-reward-title {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 950;
}

.gw-quest-reward-xp {
  margin-top: 14px;
  font-size: 42px;
  line-height: 1;
  font-weight: 1000;
  color: #ffe082;
  text-shadow: 0 0 18px rgba(255,224,130,0.35);
}

.gw-quest-reward-sub {
  margin-top: 10px;
  font-size: 13px;
  color: rgba(239,230,211,0.68);
}

.gw-quest-reward-btn {
  margin-top: 18px;
  width: 100%;
  border: 0;
  border-radius: 999px;
  padding: 13px 14px;
  font-weight: 950;
  cursor: pointer;
  background: linear-gradient(180deg, #ffe082, #d7b774);
  color: #1f271d;
}

@keyframes gwRewardPop {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

      .gw-active-quest-kicker {
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #f0d18a;
      }

      .gw-active-quest-title {
        margin-top: 2px;
        font-size: 13px;
        font-weight: 900;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-active-quest-sub {
        margin-top: 2px;
        font-size: 11px;
        color: rgba(239,230,211,0.68);
      }

      .gw-active-quest-distance {
        flex: 0 0 auto;
        min-width: 58px;
        text-align: right;
        font-size: 18px;
        font-weight: 950;
        color: #ffe082;
      }

      @keyframes gwQuestPulse {
        0%, 100% { opacity: 0.62; }
        50% { opacity: 1; }
      }

      @keyframes gwQuestBeacon {
        0%, 100% { transform: scale(0.88); opacity: 0.72; }
        50% { transform: scale(1.08); opacity: 1; }
      }

      @keyframes gwQuestTargetGlyph {
        0%, 100% { opacity: 0.70; transform: scale(0.94); }
        50% { opacity: 1; transform: scale(1.06); }
      }

      @keyframes gwQuestDash {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -18; }
      }
    `;

    document.head.appendChild(style);
  }

  function clear() {
    activeQuest = null;
    targetLayer?.clearLayers();
    questLayer?.clearLayers();
    targetSetRenderPending = false;
    targetSetQualifying = false;
    clearTetherLine();
    if (pulseMarker) {
      pulseMarker.remove();
      pulseMarker = null;
    }
    if (hudChip) {
      hudChip.remove();
      hudChip = null;
    }
    removeHudRaiseTab();
  }

  function closeOpenSheetsAndModals() {
    document
      .querySelectorAll(".gw-quest-modal-backdrop, .gw-codex-backdrop")
      .forEach((el) => el.remove());

    document.querySelectorAll(".gw-sheet.is-open").forEach((el) => {
      el.classList.remove("is-open");
    });

    document.querySelectorAll(".gw-backdrop.is-open").forEach((el) => {
      el.classList.remove("is-open");
    });

    document.querySelectorAll(".gw-navbtn.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
  }

  function cellBounds(ix, iy, radiusCells = 0) {
    const r = Math.max(0, Number(radiusCells) || 0);

    const x0 = (ix - r) * GRID_SIZE_M;
    const y0 = (iy - r) * GRID_SIZE_M;
    const x1 = (ix + r + 1) * GRID_SIZE_M;
    const y1 = (iy + r + 1) * GRID_SIZE_M;

    const sw = map.options.crs.unproject(L.point(x0, y0));
    const ne = map.options.crs.unproject(L.point(x1, y1));

    return L.latLngBounds(sw, ne);
  }

  function cellSpanBounds(ix, iy, spanCells = 1) {
    const span = Math.max(1, Math.round(Number(spanCells) || 1));

    const x0 = ix * GRID_SIZE_M;
    const y0 = iy * GRID_SIZE_M;
    const x1 = (ix + span) * GRID_SIZE_M;
    const y1 = (iy + span) * GRID_SIZE_M;

    const sw = map.options.crs.unproject(L.point(x0, y0));
    const ne = map.options.crs.unproject(L.point(x1, y1));

    return L.latLngBounds(sw, ne);
  }

  function centerOfCell(ix, iy) {
    const x = (ix + 0.5) * GRID_SIZE_M;
    const y = (iy + 0.5) * GRID_SIZE_M;
    return map.options.crs.unproject(L.point(x, y));
  }

  function targetSetCellKey(ix, iy) {
    return `${ix},${iy}`;
  }

  function pointCellKey(lat, lng) {
    const p = map.options.crs.project(L.latLng(lat, lng));
    const ix = Math.floor(p.x / GRID_SIZE_M);
    const iy = Math.floor(p.y / GRID_SIZE_M);
    return {
      ix,
      iy,
      key: targetSetCellKey(ix, iy)
    };
  }

  function normalizeTargetSetCells(rawCells = []) {
    const seen = new Set();
    return (Array.isArray(rawCells) ? rawCells : [])
      .map((cell) => {
        const ix = Math.round(Number(cell?.ix));
        const iy = Math.round(Number(cell?.iy));
        if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
        const key = targetSetCellKey(ix, iy);
        if (seen.has(key)) return null;
        seen.add(key);
        const center = centerOfCell(ix, iy);
        return {
          ix,
          iy,
          key,
          lat: center.lat,
          lng: center.lng
        };
      })
      .filter(Boolean);
  }

  function targetSortOrigin() {
    return getUserLatLng() || map.getCenter();
  }

  function representativeTargetSetCell(cells = []) {
    if (!cells.length) return null;
    const origin = targetSortOrigin();
    return (
      cells
        .map((cell) => ({
          cell,
          distance: origin ? L.latLng(cell.lat, cell.lng).distanceTo(origin) : Infinity
        }))
        .sort((a, b) => a.distance - b.distance || a.cell.key.localeCompare(b.cell.key))[0]?.cell ||
      cells[0]
    );
  }

  function visibleTargetSetCells(target) {
    if (!target?.cells?.length || map.getZoom() < TARGET_SET_MIN_ZOOM) return [];

    const bounds = map.getBounds();
    const origin = targetSortOrigin();
    return target.cells
      .filter((cell) => bounds.contains([cell.lat, cell.lng]))
      .map((cell) => ({
        cell,
        distance: origin ? L.latLng(cell.lat, cell.lng).distanceTo(origin) : Infinity
      }))
      .sort((a, b) => a.distance - b.distance || a.cell.key.localeCompare(b.cell.key))
      .slice(0, TARGET_SET_VISIBLE_GLYPH_CAP)
      .map((entry) => entry.cell);
  }

  function targetSetCoarseBinSize() {
    const stateBin = Number(window.getGridWildCoarseHeatState?.()?.effectiveBinSize);
    if (Number.isFinite(stateBin)) return Math.max(2, Math.min(64, Math.round(stateBin)));

    const raw = Number(window.__gwState?.coarseHeatBinSize);
    if (Number.isFinite(raw)) return Math.max(2, Math.min(64, Math.round(raw)));

    return 8;
  }

  function targetSetCoarseBinAnchor(cell, binSize) {
    return {
      ix: Math.floor(cell.ix / binSize) * binSize,
      iy: Math.floor(cell.iy / binSize) * binSize
    };
  }

  function visibleTargetSetCoarseBins(target) {
    if (!target?.cells?.length) return [];

    const binSize = targetSetCoarseBinSize();
    const bounds = map.getBounds();
    const origin = targetSortOrigin();
    const bins = new Map();

    target.cells.forEach((cell) => {
      if (!bounds.contains([cell.lat, cell.lng])) return;

      const anchor = targetSetCoarseBinAnchor(cell, binSize);
      const key = targetSetCellKey(anchor.ix, anchor.iy);
      let entry = bins.get(key);

      if (!entry) {
        const binBounds = cellSpanBounds(anchor.ix, anchor.iy, binSize);
        const center = binBounds.getCenter();
        entry = {
          key,
          ix: anchor.ix,
          iy: anchor.iy,
          binSize,
          bounds: binBounds,
          center,
          cells: [],
          distance: origin ? center.distanceTo(origin) : Infinity
        };
        bins.set(key, entry);
      }

      entry.cells.push(cell);
    });

    return Array.from(bins.values())
      .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
      .slice(0, TARGET_SET_COARSE_VISIBLE_BIN_CAP);
  }

  function renderTargetSetCoarseGeometry(target) {
    const bins = visibleTargetSetCoarseBins(target);
    const claimedKeys = claimedTargetSetCellKeys();
    const qualifyingClass = targetSetQualifying ? "is-qualifying" : "";
    const palette = targetSetQualifying
      ? {
          stroke: "rgba(118,231,191,0.98)",
          fill: "rgba(82,220,166,1)"
        }
      : {
          stroke: "rgba(255,126,126,0.94)",
          fill: "rgba(255,73,73,1)"
        };

    bins.forEach((bin) => {
      const density = Math.min(1, Math.log1p(bin.cells.length) / Math.log1p(bin.binSize * 2));
      const claimedCount = bin.cells.filter((cell) => claimedKeys.has(cell.key)).length;
      const claimedClass = claimedCount > 0 ? "is-claimed" : "";
      const binPalette =
        claimedCount > 0 && !targetSetQualifying
          ? {
              stroke: "rgba(144,238,172,0.98)",
              fill: "rgba(100,220,145,1)"
            }
          : palette;

      L.rectangle(bin.bounds, {
        pane: QUEST_PANE,
        interactive: false,
        color: binPalette.stroke,
        weight: density > 0.55 ? 1.8 : 1.3,
        opacity: 0.78 + density * 0.2,
        fillColor: binPalette.fill,
        fillOpacity: 0.11 + density * 0.26,
        dashArray: "6 5",
        className: ["gw-quest-target-coarse-cell", qualifyingClass, claimedClass]
          .filter(Boolean)
          .join(" ")
      }).addTo(targetLayer);

      const countLabel =
        claimedCount > 0
          ? `<span class="gw-quest-target-coarse-count">${claimedCount}/${bin.cells.length}</span>`
          : bin.cells.length > 1
            ? `<span class="gw-quest-target-coarse-count">${bin.cells.length}</span>`
            : "";

      L.marker(bin.center, {
        pane: QUEST_PANE,
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="gw-quest-target-coarse-glyph ${qualifyingClass} ${claimedClass}">${countLabel}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(targetLayer);
    });
  }

  function renderTargetSetGeometry(target = activeQuest?.__gwNormalizedTarget) {
    if (!targetLayer || !target || target.mode !== "target_set") return;

    targetLayer.clearLayers();

    if (map.getZoom() < TARGET_SET_MIN_ZOOM) {
      renderTargetSetCoarseGeometry(target);
      return;
    }

    const qualifyingClass = targetSetQualifying ? "is-qualifying" : "";
    const claimedKeys = claimedTargetSetCellKeys();

    visibleTargetSetCells(target).forEach((cell) => {
      const bounds = cellBounds(cell.ix, cell.iy, 0);
      const claimedClass = claimedKeys.has(cell.key) ? "is-claimed" : "";
      L.rectangle(bounds, {
        pane: QUEST_PANE,
        interactive: false,
        className: ["gw-quest-target-glyph-cell", qualifyingClass, claimedClass]
          .filter(Boolean)
          .join(" ")
      }).addTo(targetLayer);

      L.marker(bounds.getCenter(), {
        pane: QUEST_PANE,
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="gw-quest-target-glyph ${qualifyingClass} ${claimedClass}">${
            claimedClass ? '<span class="gw-quest-target-glyph-check">✓</span>' : ""
          }</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(targetLayer);
    });
  }

  function scheduleTargetSetRender() {
    const target = activeQuest?.__gwNormalizedTarget;
    if (!target || target.mode !== "target_set") return;
    if (targetSetRenderPending) return;

    targetSetRenderPending = true;
    const render = () => {
      targetSetRenderPending = false;
      renderTargetSetGeometry();
    };

    if (window.GridWildMapMotionQueue?.requestFrame) {
      window.GridWildMapMotionQueue.requestFrame("quest-target-set", render);
    } else {
      requestAnimationFrame(render);
    }
  }

  function bindTargetSetMotion() {
    if (targetSetMotionBound) return;
    targetSetMotionBound = true;

    if (window.GridWildMapMotionQueue?.subscribe) {
      window.GridWildMapMotionQueue.subscribe("quest-target-set-motion", scheduleTargetSetRender);
    } else {
      map.on("move zoom resize viewreset zoomend moveend", scheduleTargetSetRender);
    }
  }

  function setTargetSetQualifying(inside) {
    const next = inside === true;
    if (targetSetQualifying === next) return;

    targetSetQualifying = next;
    renderTargetSetGeometry();
  }

  function claimedTargetSetCellKeys() {
    const keys = window.GridWildQuestEvidence?.getClaimedTargetCellKeys?.(activeQuest);
    if (keys instanceof Set) return keys;
    return new Set(Array.isArray(keys) ? keys : []);
  }

  function targetSetProgressLabel() {
    const progress = window.GridWildQuestEvidence?.getQuestProgress?.(activeQuest);
    if (!progress || progress.mode !== "target_cells") return "";
    return `${progress.claimed} / ${progress.target} target squares complete`;
  }

  function normalizeTargetSet(raw = {}) {
    const cells = normalizeTargetSetCells(raw.cells);
    const representative = representativeTargetSetCell(cells) || null;
    const cellKeySet = new Set(cells.map((cell) => cell.key));

    return {
      ...raw,
      mode: "target_set",
      radiusCells: 0,
      cells,
      cellKeySet,
      lat: representative?.lat ?? Number(raw.lat),
      lng: representative?.lng ?? Number(raw.lng),
      ix: representative?.ix ?? Number(raw.ix),
      iy: representative?.iy ?? Number(raw.iy),
      cellKey: representative?.key || raw.cellKey || "",
      label: raw.patchName || raw.label || "Patch target cells"
    };
  }

  function normalizePolygonRings(rawRings = []) {
    return (Array.isArray(rawRings) ? rawRings : [])
      .map((ring) =>
        (Array.isArray(ring) ? ring : [])
          .map((point) => ({
            lat: Number(point?.lat),
            lng: Number(point?.lng)
          }))
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      )
      .filter((ring) => ring.length >= 3);
  }

  function pointInRing(point, ring = []) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      const intersects =
        pi.lat > point.lat !== pj.lat > point.lat &&
        point.lng <
          ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat || 1e-12) + pi.lng;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInRings(point, rings = []) {
    return rings.some((ring) => pointInRing(point, ring));
  }

  function normalizePatchPolygonTarget(raw = {}) {
    const rings = normalizePolygonRings(raw.rings);
    const points = rings.flat();
    const centroid =
      Number.isFinite(Number(raw.lat)) && Number.isFinite(Number(raw.lng))
        ? { lat: Number(raw.lat), lng: Number(raw.lng) }
        : points.length
          ? {
              lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
              lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length
            }
          : null;

    return {
      ...raw,
      mode: "patch_polygon",
      rings,
      radiusCells: null,
      lat: centroid?.lat ?? Number(raw.lat),
      lng: centroid?.lng ?? Number(raw.lng),
      label: raw.patchName || raw.label || "Patch polygon"
    };
  }

  function fallbackTargetForQuest(quest) {
    const r = quest.recipe || {};
    const c = map.getCenter();
    const p = map.options.crs.project(c);
    const ix = Math.floor(p.x / GRID_SIZE_M);
    const iy = Math.floor(p.y / GRID_SIZE_M);

    return {
      mode: r.targetLocation || "area_3x3",
      lat: c.lat,
      lng: c.lng,
      ix,
      iy,
      cellKey: `${ix},${iy}`,
      radiusCells:
        r.targetLocation === "specific_square"
          ? 0
          : r.targetLocation === "area_20x20"
            ? 10
            : r.targetLocation === "anywhere"
              ? null
              : 1,
      label: "Current map center"
    };
  }

  function normalizeTarget(quest) {
    const r = quest.recipe || {};
    const raw = r.target || fallbackTargetForQuest(quest);

    if ((r.targetLocation || raw.mode) === "anywhere") {
      return {
        mode: "anywhere",
        label: "Anywhere",
        radiusCells: null
      };
    }

    if ((r.targetLocation || raw.mode) === "target_set") {
      return normalizeTargetSet(raw);
    }

    if ((r.targetLocation || raw.mode) === "patch_polygon") {
      return normalizePatchPolygonTarget(raw);
    }

    let ix = Number(raw.ix);
    let iy = Number(raw.iy);

    if (!Number.isFinite(ix) || !Number.isFinite(iy)) {
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      const p = map.options.crs.project(L.latLng(lat, lng));
      ix = Math.floor(p.x / GRID_SIZE_M);
      iy = Math.floor(p.y / GRID_SIZE_M);
    }

    const mode = r.targetLocation || raw.mode || "area_3x3";
    const radiusCells = Number.isFinite(Number(raw.radiusCells))
      ? Number(raw.radiusCells)
      : mode === "specific_square"
        ? 0
        : mode === "area_20x20"
          ? 10
          : 1;

    const center = centerOfCell(ix, iy);

    return {
      ...raw,
      mode,
      ix,
      iy,
      radiusCells,
      lat: center.lat,
      lng: center.lng,
      cellKey: `${ix},${iy}`
    };
  }

  function formatMeters(m) {
    if (window.GridWildUnits?.formatDistance) return window.GridWildUnits.formatDistance(m);
    if (!Number.isFinite(m)) return "—";
    if (m < 1000) return `${Math.round(m)}m`;
    return `${(m / 1000).toFixed(1)}km`;
  }

  function getUserLatLng() {
    if (typeof lastFix !== "undefined" && lastFix) {
      return L.latLng(lastFix.latitude, lastFix.longitude);
    }

    return null;
  }

  function targetLatLng(target) {
    const lat = Number(target?.lat);
    const lng = Number(target?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return L.latLng(lat, lng);
  }

  function isHudCollapsed() {
    return localStorage.getItem(HUD_COLLAPSED_KEY) === "1";
  }

  function setHudCollapsed(value) {
    localStorage.setItem(HUD_COLLAPSED_KEY, value ? "1" : "0");
    syncHudCollapsed();
  }

  function raiseChevronSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6.5 15.5 5.5-5.5 5.5 5.5"></path>
        <path d="m7.5 10.5 4.5-4.5 4.5 4.5"></path>
      </svg>
    `;
  }

  function positionHudRaiseTab() {
    if (!hudRaiseTab) return;
    const navBtn = document.getElementById("btnQuest");
    const nav = document.querySelector(".gw-bottomnav");
    if (!navBtn || !nav) return;

    const btnRect = navBtn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    hudRaiseTab.style.setProperty("--gw-raise-tab-left", `${btnRect.left + btnRect.width / 2}px`);
    hudRaiseTab.style.setProperty(
      "--gw-raise-tab-bottom",
      `${Math.max(0, window.innerHeight - navRect.top - 10)}px`
    );
  }

  function bindRaiseTabPositioning() {
    if (raiseTabPositionBound) return;
    raiseTabPositionBound = true;
    window.addEventListener("resize", positionHudRaiseTab);
    window.addEventListener("orientationchange", () => setTimeout(positionHudRaiseTab, 150));
  }

  function renderHudRaiseTab(show) {
    if (!show) {
      removeHudRaiseTab();
      return;
    }

    if (!hudRaiseTab) {
      hudRaiseTab = document.createElement("button");
      hudRaiseTab.className = "gw-hud-raise-tab gw-hud-raise-tab-quest";
      hudRaiseTab.type = "button";
      hudRaiseTab.setAttribute("aria-label", "Expand quest banner");
      hudRaiseTab.title = "Expand quest banner";
      hudRaiseTab.innerHTML = raiseChevronSvg();
      hudRaiseTab.addEventListener("click", () => setHudCollapsed(false));
      document.body.appendChild(hudRaiseTab);
      bindRaiseTabPositioning();
    }

    positionHudRaiseTab();
  }

  function removeHudRaiseTab() {
    if (!hudRaiseTab) return;
    hudRaiseTab.remove();
    hudRaiseTab = null;
  }

  function collapseIconSvg(collapsed) {
    return collapsed
      ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"></path></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 6-6 6 6 6"></path></svg>`;
  }

  function syncHudCollapsed() {
    if (!hudChip) return;

    const collapsed = isHudCollapsed();
    const btn = hudChip.querySelector(".gw-active-quest-collapse-btn");

    hudChip.classList.toggle("is-collapsed", collapsed);
    renderHudRaiseTab(collapsed);

    if (btn) {
      btn.innerHTML = collapseIconSvg(collapsed);
      btn.setAttribute("aria-label", collapsed ? "Expand quest banner" : "Collapse quest banner");
      btn.title = collapsed ? "Expand quest banner" : "Collapse quest banner";
    }
  }

  function initialHudSubText(target) {
    if (target?.mode === "anywhere") return "Anywhere target - scan when ready";
    if (target?.mode === "target_set") return "Target squares marked on HUD";
    if (target?.mode === "patch_polygon") return "Patch unknowns constrained to polygon";
    return "Drawing field tether...";
  }

  function makeHudChip(quest, target) {
    hudChip = document.createElement("div");
    hudChip.className = "gw-active-quest-chip";
    hudChip.innerHTML = `
      <div class="gw-active-quest-chip-main">
        <div class="gw-active-quest-kicker">Active Quest</div>
        <div class="gw-active-quest-title">${escapeHtml(quest.title || "Field quest")}</div>
        <div class="gw-active-quest-sub" id="gwActiveQuestSub">
          ${initialHudSubText(target)}
        </div>
      </div>
      <button class="gw-active-quest-abandon-btn" type="button" aria-label="Abandon quest" title="Abandon quest">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12"></path>
          <path d="M18 6L6 18"></path>
        </svg>
      </button>
      <button class="gw-active-quest-evidence-btn" type="button" aria-label="Open quest evidence selector" title="Claim evidence">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 11l2 2 4-5"></path>
          <path d="M5 4h14v16H5z"></path>
          <path d="M8 17h8"></path>
        </svg>
      </button>
      <div class="gw-active-quest-distance" id="gwActiveQuestDistance">—</div>
      <span class="gw-active-quest-collapsed-label" aria-hidden="true">QUEST</span>
      <button class="gw-active-quest-collapse-btn" type="button" aria-label="Collapse quest banner" title="Collapse quest banner">
        ${collapseIconSvg(false)}
      </button>
    `;

    hudChip.querySelector(".gw-active-quest-evidence-btn")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      window.GridWildQuestEvidence?.openEvidenceSelector?.(quest);
    });

    hudChip
      .querySelector(".gw-active-quest-abandon-btn")
      ?.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        if (!window.GridWildQuests?.abandonQuest) {
          alert("Quest controls are not loaded.");
          return;
        }

        const ok = await window.GridWildQuests.openQuestConfirmDialog({
          title: "Abandon Quest?",
          message: "This quest will disappear from your active quest list.",
          subject: quest.title || "Untitled Quest",
          confirmLabel: "Abandon",
          cancelLabel: "Keep Quest",
          danger: true
        });
        if (!ok) return;

        const abandoned = await window.GridWildQuests.abandonQuest(quest.dbId || quest.id);
        if (abandoned) clear();
      });

    hudChip.querySelector(".gw-active-quest-collapse-btn")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      setHudCollapsed(!isHudCollapsed());
    });

    hudChip.addEventListener("click", () => {
      if (isHudCollapsed()) {
        setHudCollapsed(false);
        return;
      }

      const targetLL = targetLatLng(target);
      if (target.mode !== "anywhere" && targetLL) {
        map.flyTo(targetLL, Math.max(map.getZoom(), 18), { duration: 0.65 });
      }
    });

    document.body.appendChild(hudChip);
    syncHudCollapsed();
  }

  function drawTargetGeometry(quest, target) {
    if (target.mode === "anywhere") return;
    if (target.mode === "target_set") {
      renderTargetSetGeometry(target);
      return;
    }
    if (target.mode === "patch_polygon") {
      if (target.rings?.length) {
        target.rings.forEach((ring) => {
          L.polygon(
            ring.map((point) => [point.lat, point.lng]),
            {
              pane: QUEST_PANE,
              interactive: false,
              className: "gw-quest-target-polygon"
            }
          ).addTo(targetLayer);
        });
      }
      return;
    }

    const bounds = cellBounds(target.ix, target.iy, target.radiusCells);
    const isSpecific = target.radiusCells === 0;

    L.rectangle(bounds, {
      pane: QUEST_PANE,
      interactive: false,
      className: isSpecific ? "gw-quest-target-cell" : "gw-quest-target-zone"
    }).addTo(targetLayer);

    const icon = L.divIcon({
      className: "",
      html: `<div class="gw-quest-beacon"></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    pulseMarker = L.marker(bounds.getCenter(), {
      pane: QUEST_PANE,
      icon,
      interactive: false
    }).addTo(targetLayer);
  }

  function tetherLatLngKey(userLL, targetLL) {
    return `${userLL.lat},${userLL.lng}|${targetLL.lat},${targetLL.lng}`;
  }

  function clearTetherLine() {
    tetherLayer?.clearLayers();
    tetherLine = null;
    lastTetherKey = "";
  }

  function updateTetherLine(userLL, targetLL) {
    if (!tetherLayer) return;

    const nextKey = tetherLatLngKey(userLL, targetLL);

    if (!tetherLine) {
      tetherLine = L.polyline([userLL, targetLL], {
        pane: QUEST_PANE,
        interactive: false,
        className: "gw-quest-tether"
      }).addTo(tetherLayer);
      lastTetherKey = nextKey;
      return;
    }

    if (nextKey !== lastTetherKey) {
      tetherLine.setLatLngs([userLL, targetLL]);
      lastTetherKey = nextKey;
    }
  }

  function updateTetherAndHud() {
    if (!activeQuest) return;

    const target = activeQuest.__gwNormalizedTarget;
    const subEl = document.getElementById("gwActiveQuestSub");
    const distEl = document.getElementById("gwActiveQuestDistance");

    if (!target || target.mode === "anywhere") {
      setTargetSetQualifying(false);
      clearTetherLine();
      if (distEl) distEl.textContent = "ANY";
      if (subEl) subEl.textContent = "Open-world quest · any qualifying observation";
      return;
    }

    const userLL = getUserLatLng();
    const targetLL = targetLatLng(target);

    if (!targetLL) {
      if (target.mode === "target_set") setTargetSetQualifying(false);
      clearTetherLine();
      if (distEl) distEl.textContent = target.mode === "target_set" ? "HUD" : "GPS";
      if (subEl) subEl.textContent = initialHudSubText(target);
      return;
    }

    if (!userLL) {
      if (target.mode === "target_set") setTargetSetQualifying(false);
      clearTetherLine();
      if (distEl) distEl.textContent = "GPS";
      if (subEl) subEl.textContent = "Waiting for GPS fix";
      return;
    }

    const d = userLL.distanceTo(targetLL);

    updateTetherLine(userLL, targetLL);

    if (distEl) distEl.textContent = formatMeters(d);

    if (target.mode === "target_set") {
      const status = activeTargetStatus(userLL.lat, userLL.lng);
      const progressText = targetSetProgressLabel();
      setTargetSetQualifying(status.inside);
      if (subEl) {
        if (status.inside) {
          subEl.textContent = progressText
            ? `Target square reached - ${progressText}`
            : "Target square reached - scan nature to complete";
        } else if (d <= 50) {
          subEl.textContent = progressText
            ? `${progressText} - target squares nearby`
            : "Target squares nearby";
        } else {
          subEl.textContent = progressText
            ? `${progressText} - target squares marked`
            : `${target.label || target.cellKey || "Patch targets"} - target squares marked`;
        }
      }
      return;
    }

    if (target.mode === "patch_polygon") {
      setTargetSetQualifying(false);
      const status = activeTargetStatus(userLL.lat, userLL.lng);
      if (subEl) {
        if (status.inside) {
          subEl.textContent = "Inside Patch - identify an unknown";
        } else if (d <= 50) {
          subEl.textContent = "Patch boundary nearby";
        } else {
          subEl.textContent = `${target.label || "Patch"} - identify unknowns inside`;
        }
      }
      return;
    }

    setTargetSetQualifying(false);
    if (subEl) {
      if (d <= Math.max(12, GRID_SIZE_M * (target.radiusCells + 1))) {
        subEl.textContent = "Arrived · scan nature to complete";
      } else if (d <= 50) {
        subEl.textContent = "Quest nearby · target in sight";
      } else if (d <= 100) {
        subEl.textContent = "Getting warmer";
      } else {
        subEl.textContent = `${target.placeName || target.cellKey || "Target"} · approach the beacon`;
      }
    }
  }

  function activeTargetStatus(lat, lng) {
    if (!activeQuest) return { inside: false, questId: null, targetKey: "" };

    const target = activeQuest.__gwNormalizedTarget || normalizeTarget(activeQuest);
    if (!target || target.mode === "anywhere") {
      return { inside: false, questId: activeQuest.id || null, targetKey: "anywhere" };
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return { inside: false, questId: activeQuest.id || null, targetKey: target.cellKey || "" };
    }

    if (target.mode === "target_set") {
      const cell = pointCellKey(latNum, lngNum);
      const inside = target.cellKeySet?.has?.(cell.key) || false;
      return {
        inside,
        questId: activeQuest.id || null,
        targetKey: inside ? cell.key : target.cellKey || "target_set"
      };
    }

    if (target.mode === "patch_polygon") {
      const inside = pointInRings({ lat: latNum, lng: lngNum }, target.rings || []);
      return {
        inside,
        questId: activeQuest.id || null,
        targetKey: target.patchId || target.label || "patch_polygon"
      };
    }

    const p = map.options.crs.project(L.latLng(latNum, lngNum));
    const ix = Math.floor(p.x / GRID_SIZE_M);
    const iy = Math.floor(p.y / GRID_SIZE_M);
    const radius = Math.max(0, Number(target.radiusCells) || 0);
    const inside =
      Math.abs(ix - Number(target.ix)) <= radius && Math.abs(iy - Number(target.iy)) <= radius;

    return {
      inside,
      questId: activeQuest.id || null,
      targetKey: `${target.cellKey || `${target.ix},${target.iy}`}:${radius}`
    };
  }

  function embark(quest) {
    if (!quest) return;

    ensurePaneAndLayers();
    clear();
    closeOpenSheetsAndModals();

    activeQuest = quest;
    activeQuest.__gwNormalizedTarget = normalizeTarget(quest);
    targetSetQualifying = false;

    const userLL = getUserLatLng();
    if (activeQuest.__gwNormalizedTarget.mode === "target_set" && userLL) {
      targetSetQualifying = activeTargetStatus(userLL.lat, userLL.lng).inside === true;
    }

    window.__gwState = window.__gwState || {};
    window.__gwState.activeQuestId = quest.id;

    drawTargetGeometry(quest, activeQuest.__gwNormalizedTarget);
    makeHudChip(quest, activeQuest.__gwNormalizedTarget);
    updateTetherAndHud();

    const targetLL = targetLatLng(activeQuest.__gwNormalizedTarget);
    if (activeQuest.__gwNormalizedTarget.mode !== "anywhere" && targetLL) {
      map.flyTo(targetLL, Math.max(map.getZoom(), 18), { duration: 0.75 });
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.addEventListener("gridwild:unitschange", updateTetherAndHud);
  window.addEventListener("gwUserLocationUpdated", updateTetherAndHud);
  window.addEventListener("gwQuestEvidenceChanged", () => {
    if (activeQuest?.__gwNormalizedTarget?.mode === "target_set") {
      renderTargetSetGeometry();
    }
    updateTetherAndHud();
  });

  window.addEventListener("gwQuestStarted", (evt) => {
    // Do not auto-embark newly created quests; user explicitly chooses Embark.
    // This listener is here for later sparkle/toast hooks.
  });

  function showRewardPopup(quest) {
    const old = document.getElementById("gwQuestRewardPopup");
    if (old) old.remove();

    const root = document.createElement("div");
    root.id = "gwQuestRewardPopup";
    root.className = "gw-quest-reward-backdrop";

    root.innerHTML = `
    <div class="gw-quest-reward-card">
      <div class="gw-quest-reward-kicker">Quest Complete</div>
      <div class="gw-quest-reward-title">${escapeHtml(quest?.title || "Field quest")}</div>
      <div class="gw-quest-reward-xp">+${escapeHtml(quest?.pointValue || 0)} XP</div>
      <div class="gw-quest-reward-sub">Field record accepted. Territory memory strengthened.</div>
      <button class="gw-quest-reward-btn" id="gwQuestRewardClose">Claim Reward</button>
    </div>
  `;

    document.body.appendChild(root);

    root.querySelector("#gwQuestRewardClose").onclick = () => root.remove();

    setTimeout(() => {
      if (document.body.contains(root)) root.remove();
    }, 4500);
  }

  function completeQuest(quest) {
    if (activeQuest?.id === quest?.id) {
      clear();
      activeQuest = null;
    }

    if (window.__gwState?.activeQuestId === quest?.id) {
      delete window.__gwState.activeQuestId;
      window.refreshQuestBadge?.();
    }

    showRewardPopup(quest);
  }

  window.GridWildQuestLayer = {
    embark,
    clear,
    completeQuest,
    activeTargetStatus,
    showRewardPopup,
    update: updateTetherAndHud,
    getActiveQuest: () => activeQuest
  };
})();
