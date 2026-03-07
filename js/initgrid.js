// Static heatmap store (when I introduced static assets)
window.__staticGridCounts = new Map();

// 100x100 ft grid overlay + heat-tinted tiles
// Uses EPSG:3857 meters via map.project/unproject

// Heat tiles under the grid lines, but above base map tiles
map.createPane("gridHeatPane");
map.getPane("gridHeatPane").style.zIndex = 415;
map.getPane("gridHeatPane").style.pointerEvents = "none";

// Grid lines pane (above heat tiles)
map.createPane("gridPane");
map.getPane("gridPane").style.zIndex = 420;
map.getPane("gridPane").style.pointerEvents = "none";

// Layer containers
const gridHeatLayer = L.layerGroup([], { pane: "gridHeatPane" }).addTo(map);
const gridLineLayer = L.layerGroup([], { pane: "gridPane" }).addTo(map);

// 50  ft in meters
const GRID_SIZE_M = 20 * 0.3048;

// Optional: style (grid lines)
const GRID_LINE_STYLE = {
  pane: "gridPane",
  interactive: false,
  weight: 1,
  opacity: 0.35
  // color: "#000"   // uncomment if you want to force a color
};

// Optional: style (heat tiles)
const HEAT_TILE_STYLE_BASE = {
  pane: "gridHeatPane",
  interactive: false,
  weight: 0,
  stroke: false
};

// How far beyond the viewport to draw (avoids edge gaps)
const GRID_PAD_PX = 200;

// Heat scale cap ( max color at 25)
const HEAT_MAX_COUNT = 5;

// Cache the last iNat results so heat can redraw on pan/zoom
window.__inatLastResults = window.__inatLastResults || [];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function snapDown(x, step) {
  return Math.floor(x / step) * step;
}
function snapUp(x, step) {
  return Math.ceil(x / step) * step;
}
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

// Pleasant ramp using HSL: blue -> orange/red
function countToFill(count) {
  if (!count || count <= 0) return null; // transparent for 0
  const t = clamp01(Math.min(count, HEAT_MAX_COUNT) / HEAT_MAX_COUNT);

  // Hue from 200 (blue) down to 20 (orange/red)
  const hue = 200 + (20 - 200) * t;

  // Keep saturation high; reduce lightness slightly as density increases
  const sat = 85;
  const light = 60 - 12 * t;

  const fillColor = `hsl(${hue.toFixed(1)}, ${sat}%, ${light.toFixed(1)}%)`;

  // Opacity ramps up with density; stays "pleasant"
  const fillOpacity = 0.10 + 0.55 * Math.pow(t, 0.85);

  return { fillColor, fillOpacity };
}

function getPaddedBoundsMeters() {
  const z = map.getZoom();

  const b = map.getBounds();
  const nw = map.project(b.getNorthWest(), z);
  const se = map.project(b.getSouthEast(), z);

  const paddedNW = L.point(nw.x - GRID_PAD_PX, nw.y - GRID_PAD_PX);
  const paddedSE = L.point(se.x + GRID_PAD_PX, se.y + GRID_PAD_PX);

  const llNW = map.unproject(paddedNW, z);
  const llSE = map.unproject(paddedSE, z);

  const pNWm = map.options.crs.project(llNW);
  const pSEm = map.options.crs.project(llSE);

  const minX = Math.min(pNWm.x, pSEm.x);
  const maxX = Math.max(pNWm.x, pSEm.x);
  const minY = Math.min(pNWm.y, pSEm.y);
  const maxY = Math.max(pNWm.y, pSEm.y);

  const startX = snapDown(minX, GRID_SIZE_M);
  const endX   = snapUp(maxX, GRID_SIZE_M);
  const startY = snapDown(minY, GRID_SIZE_M);
  const endY   = snapUp(maxY, GRID_SIZE_M);

  return { startX, endX, startY, endY };
}

function obsResultsToGridCounts(results) {
  const counts = new Map();
  if (!Array.isArray(results)) return counts;

  for (const obs of results) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const oLng = coords[0];
    const oLat = coords[1];

    const p = map.options.crs.project(L.latLng(oLat, oLng)); // meters
    const ix = Math.floor(p.x / GRID_SIZE_M);
    const iy = Math.floor(p.y / GRID_SIZE_M);
    const key = `${ix},${iy}`;

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

// Grid heat rendering
function updateGridHeat(results) {
  gridHeatLayer.clearLayers();

  const counts = obsResultsToGridCounts(results);
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const c = counts.get(key) || 0;
      const style = countToFill(c);
      if (!style) continue; // 0 obs => transparent => skip drawing

      const sw = map.options.crs.unproject(L.point(x, y));
      const ne = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));

      L.rectangle([sw, ne], {
        ...HEAT_TILE_STYLE_BASE,
        ...style
      }).addTo(gridHeatLayer);
    }
  }
}

window.updateGridHeatmap = function(results) {
  // Keep caching results for popup logic, etc.
  window.__inatLastResults = Array.isArray(results) ? results : [];
  // DO NOT redraw heat from live iNat results.
  // Static CSV is the source of truth for the heat layer.
};

// Expose a global for the iNat fetcher to call
//window.updateGridHeatmap = function(results) {
//  window.__inatLastResults = Array.isArray(results) ? results : [];
//  updateGridHeat(window.__inatLastResults);
//};


// ─────────────────────────────────────────────────────────────
// Grid lines rendering
// ─────────────────────────────────────────────────────────────

function updateGridLines() {
  gridLineLayer.clearLayers();

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  // Vertical lines
  for (let x = startX; x <= endX; x += GRID_SIZE_M) {
    const a = map.options.crs.unproject(L.point(x, startY));
    const b = map.options.crs.unproject(L.point(x, endY));
    L.polyline([a, b], GRID_LINE_STYLE).addTo(gridLineLayer);
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += GRID_SIZE_M) {
    const a = map.options.crs.unproject(L.point(startX, y));
    const b = map.options.crs.unproject(L.point(endX, y));
    L.polyline([a, b], GRID_LINE_STYLE).addTo(gridLineLayer);
  }
}

// THIS WAS COMMENTED OUT WHEN I INTRODUCED STATIC ASSETS
//function updateGrid() {
//  updateGridLines();
//  updateGridHeat(window.__inatLastResults);
//}

// this now renders the static assets
function updateGrid() {
  updateGridLines();
  updateStaticGridHeat();
}

map.on("moveend zoomend resize", updateGrid);
updateGrid();
loadStaticHeatmapCsv("assets/dc_heat.csv");

////////

// RPG-style grid cell popup on double click

// Disable Leaflet dblclick-to-zoom so we can use dblclick for UI
map.doubleClickZoom.disable();

// One-time CSS inject for the RPG popup
(function injectRPGPopupCSS() {
  if (document.getElementById("rpg-popup-css")) return;

  const css = `
    .rpg-popup .leaflet-popup-content-wrapper{
      border-radius: 14px;
      padding: 0;
      background: rgba(18,18,22,0.95);
      color: #f3f3f7;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.10);
      backdrop-filter: blur(6px);
    }
    .rpg-popup .leaflet-popup-tip{
      background: rgba(18,18,22,0.95);
      border: 1px solid rgba(255,255,255,0.10);
    }
    .rpg-card{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      width: 260px;
      padding: 12px 12px 10px 12px;
    }
    .rpg-title{
      display:flex; align-items:center; justify-content:space-between;
      gap: 10px;
      font-weight: 800;
      letter-spacing: 0.3px;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .rpg-badge{
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.12);
      white-space: nowrap;
    }
    .rpg-statgrid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .rpg-stat{
      border-radius: 10px;
      padding: 8px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
    }
    .rpg-k{
      font-size: 10px;
      opacity: 0.85;
      margin-bottom: 4px;
    }
    .rpg-v{
      font-size: 13px;
      font-weight: 700;
      line-height: 1.1;
    }
    .rpg-mini{
      font-size: 10px;
      opacity: 0.75;
      margin-top: 8px;
    }
  `;

  const style = document.createElement("style");
  style.id = "rpg-popup-css";
  style.textContent = css;
  document.head.appendChild(style);
})();

// Optional: highlight rectangle for the clicked cell (auto-fades)
let __gridClickHighlight = null;
function flashGridCell(swLL, neLL) {
  if (__gridClickHighlight) {
    map.removeLayer(__gridClickHighlight);
    __gridClickHighlight = null;
  }

  __gridClickHighlight = L.rectangle([swLL, neLL], {
    weight: 2,
    opacity: 0.9,
    fill: false
  }).addTo(map);

  setTimeout(() => {
    if (__gridClickHighlight) {
      map.removeLayer(__gridClickHighlight);
      __gridClickHighlight = null;
    }
  }, 900);
}

function metersToGridIndex(pMeters) {
  const ix = Math.floor(pMeters.x / GRID_SIZE_M);
  const iy = Math.floor(pMeters.y / GRID_SIZE_M);
  return { ix, iy };
}

function gridIndexToBoundsLL(ix, iy) {
  const x0 = ix * GRID_SIZE_M;
  const y0 = iy * GRID_SIZE_M;

  const swLL = map.options.crs.unproject(L.point(x0, y0));
  const neLL = map.options.crs.unproject(L.point(x0 + GRID_SIZE_M, y0 + GRID_SIZE_M));

  return { swLL, neLL };
}

function countObsInCell(ix, iy, results) {
  if (!Array.isArray(results) || results.length === 0) return 0;

  let c = 0;
  for (const obs of results) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const oLng = coords[0];
    const oLat = coords[1];
    const p = map.options.crs.project(L.latLng(oLat, oLng));

    const jx = Math.floor(p.x / GRID_SIZE_M);
    const jy = Math.floor(p.y / GRID_SIZE_M);

    if (jx === ix && jy === iy) c++;
  }
  return c;
}

function classifyCell(count) {
  if (count <= 0) return { label: "Undiscovered", badge: "FOG" };
  if (count < 5)  return { label: "Lightly Scouted", badge: "SCOUT" };
  if (count < 15) return { label: "Active Zone", badge: "ACTIVE" };
  return { label: "Hotspot", badge: "HOT" };
}

function buildRPGPopupHTML({ ix, iy, count, centerLL }) {
  const cls = classifyCell(count);

  // Convert meters->feet for display
  const cellFeet = (GRID_SIZE_M / 0.3048).toFixed(0);

  const lat = centerLL.lat.toFixed(6);
  const lng = centerLL.lng.toFixed(6);

  return `
    <div class="rpg-card">
      <div class="rpg-title">
        <div>Tile ${ix},${iy}</div>
        <div class="rpg-badge">${cls.badge}</div>
      </div>

      <div style="font-size:11px; opacity:0.9;">
        ${cls.label} • ${cellFeet}ft × ${cellFeet}ft
      </div>

      <div class="rpg-statgrid">
        <div class="rpg-stat">
          <div class="rpg-k">Observations (cached)</div>
          <div class="rpg-v">${count}</div>
        </div>
        <div class="rpg-stat">
          <div class="rpg-k">Heat cap</div>
          <div class="rpg-v">${HEAT_MAX_COUNT}</div>
        </div>
        <div class="rpg-stat">
          <div class="rpg-k">Center lat</div>
          <div class="rpg-v">${lat}</div>
        </div>
        <div class="rpg-stat">
          <div class="rpg-k">Center lon</div>
          <div class="rpg-v">${lng}</div>
        </div>
      </div>

      <div class="rpg-mini">
        Tip: “Undiscovered” means 0 obs in the last fetched iNat batch (not necessarily 0 in reality).
      </div>
    </div>
  `;
}

// The function you asked for: attach the dblclick behavior
window.enableGridRPGPopup = function enableGridRPGPopup() {
  map.off("dblclick", __onGridDblClick);
  map.on("dblclick", __onGridDblClick);
  console.log("Grid RPG popup enabled (dblclick).");
};

function __onGridDblClick(e) {
  // Stop other dblclick behaviors
  if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault();
  if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();

  const pMeters = map.options.crs.project(e.latlng);
  const { ix, iy } = metersToGridIndex(pMeters);

  const { swLL, neLL } = gridIndexToBoundsLL(ix, iy);
  flashGridCell(swLL, neLL);

  const count = countObsInCell(ix, iy, window.__inatLastResults || []);

  const centerLL = L.latLng(
    (swLL.lat + neLL.lat) / 2,
    (swLL.lng + neLL.lng) / 2
  );

  const html = buildRPGPopupHTML({ ix, iy, count, centerLL });

  L.popup({
    className: "rpg-popup",
    closeButton: true,
    autoPan: true,
    maxWidth: 320
  })
    .setLatLng(e.latlng)
    .setContent(html)
    .openOn(map);
}

// Enable by default
window.enableGridRPGPopup();

// Allow UI SIDEBAR to toggle the heat overlay
window.setHeatVisible = function (visible) {
  if (visible) {
    if (!map.hasLayer(gridHeatLayer)) gridHeatLayer.addTo(map);
  } else {
    if (map.hasLayer(gridHeatLayer)) map.removeLayer(gridHeatLayer);
  }
};
// End allow  UI to toggle the heat overlay


// Load static CSV: ix,iy,count -- when I added static assets
async function loadStaticHeatmapCsv(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 2) {
      console.warn("Static heat CSV is empty or header-only.");
      return;
    }

    const header = lines[0].trim().toLowerCase();
    if (header !== "ix,iy,count") {
      console.warn(`Unexpected CSV header: ${header}`);
    }

    const counts = new Map();

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 3) continue;

      const ix = Number(parts[0]);
      const iy = Number(parts[1]);
      const count = Number(parts[2]);

      if (!Number.isFinite(ix) || !Number.isFinite(iy) || !Number.isFinite(count)) {
        continue;
      }

      counts.set(`${ix},${iy}`, count);
    }

    window.__staticGridCounts = counts;
    console.log(`Loaded static heatmap cells: ${counts.size}`);

    updateStaticGridHeat();
  } catch (err) {
    console.error("Failed to load static heat CSV:", err);
  }
}

// more for static assets -- Render precomputed static heatmap
function updateStaticGridHeat() {
  gridHeatLayer.clearLayers();

  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const c = counts.get(key) || 0;
      const style = countToFill(c);
      if (!style) continue;

      const sw = map.options.crs.unproject(L.point(x, y));
      const ne = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));

      L.rectangle([sw, ne], {
        ...HEAT_TILE_STYLE_BASE,
        ...style
      }).addTo(gridHeatLayer);
    }
  }
}
