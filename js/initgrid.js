// ─────────────────────────────────────────────────────────────
// 100x100 ft grid overlay + heat-tinted tiles
// Uses EPSG:3857 meters via map.project/unproject
// ─────────────────────────────────────────────────────────────

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
const GRID_SIZE_M = 50 * 0.3048;

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

// Heat scale cap (user request: max color at 25)
const HEAT_MAX_COUNT = 25;

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

// ─────────────────────────────────────────────────────────────
// Grid heat rendering
// ─────────────────────────────────────────────────────────────

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

// Expose a global for the iNat fetcher to call
window.updateGridHeatmap = function(results) {
  window.__inatLastResults = Array.isArray(results) ? results : [];
  updateGridHeat(window.__inatLastResults);
};

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

function updateGrid() {
  updateGridLines();
  updateGridHeat(window.__inatLastResults);
}

map.on("moveend zoomend resize", updateGrid);
updateGrid();