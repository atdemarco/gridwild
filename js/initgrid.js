// Static heatmap store (when I introduced static assets)
window.__staticGridCounts = new Map();
const FOG_RADIUS_CELLS = 10;
window.GW_SHOW_MOBILE_SMALL_TEXT = window.GW_SHOW_MOBILE_SMALL_TEXT ?? false;

function shouldShowSmallText() {
  const mobileLike = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  return !mobileLike || window.GW_SHOW_MOBILE_SMALL_TEXT;
}

window.shouldShowSmallText = shouldShowSmallText;

function getCurrentUserCellIndices() {
  if (typeof lastFix === "undefined" || !lastFix) return null;

  const p = map.options.crs.project(
    L.latLng(lastFix.latitude, lastFix.longitude)
  );

  return {
    ix: Math.floor(p.x / GRID_SIZE_M),
    iy: Math.floor(p.y / GRID_SIZE_M)
  };
}

// 100x100 ft grid overlay + heat-tinted tiles
// Uses EPSG:3857 meters via map.project/unproject

// Heat tiles under the grid lines, but above base map tiles
map.createPane("gridHeatPane");
map.getPane("gridHeatPane").style.zIndex = 415;
map.getPane("gridHeatPane").style.pointerEvents = "none";
//map.getPane("gridHeatPane").style.filter = "blur(1px)";

// Grid lines pane (above heat tiles)
map.createPane("gridPane");
map.getPane("gridPane").style.zIndex = 650;
map.getPane("gridPane").style.pointerEvents = "none";

// Shimmer overlay pane: above heat fill, below bold grid outline
map.createPane("gridShimmerPane");
map.getPane("gridShimmerPane").style.zIndex = 418;
map.getPane("gridShimmerPane").style.pointerEvents = "none";

// Layer containers
const gridHeatLayer = L.layerGroup([], { pane: "gridHeatPane" }).addTo(map);
const gridLineLayer = L.layerGroup([], { pane: "gridPane" }).addTo(map);
const gridShimmerLayer = L.layerGroup([], { pane: "gridShimmerPane" }).addTo(map);

let gridHeatCanvas = null;
let gridHeatCtx = null;
let gridHeatRaf = null;
let gridHeatCanvasTopLeft = L.point(0, 0);

function ensureGridHeatCanvas() {
  if (gridHeatCanvas) return gridHeatCanvas;

  gridHeatCanvas = document.createElement("canvas");
  gridHeatCanvas.id = "gwGridHeatCanvas";

  gridHeatCanvas.style.position = "absolute";
  gridHeatCanvas.style.left = "0px";
  gridHeatCanvas.style.top = "0px";
  gridHeatCanvas.style.width = "100%";
  gridHeatCanvas.style.height = "100%";
  gridHeatCanvas.style.pointerEvents = "none";
  gridHeatCanvas.style.zIndex = "";

  const heatPane = map.getPane("gridHeatPane");
  heatPane.appendChild(gridHeatCanvas);

  gridHeatCtx = gridHeatCanvas.getContext("2d", { alpha: true });

  return gridHeatCanvas;
}

function positionGridHeatCanvas() {
  ensureGridHeatCanvas();

  gridHeatCanvasTopLeft = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(gridHeatCanvas, gridHeatCanvasTopLeft);
}

function gridHeatLayerPoint(latlng) {
  return map.latLngToLayerPoint(latlng).subtract(gridHeatCanvasTopLeft);
}

function resizeGridHeatCanvas() {
  ensureGridHeatCanvas();
  positionGridHeatCanvas();

  const size = map.getSize();
  const dpr = window.devicePixelRatio || 1;

  const wantW = Math.round(size.x * dpr);
  const wantH = Math.round(size.y * dpr);

  if (gridHeatCanvas.width !== wantW || gridHeatCanvas.height !== wantH) {
    gridHeatCanvas.width = wantW;
    gridHeatCanvas.height = wantH;
    gridHeatCanvas.style.width = `${size.x}px`;
    gridHeatCanvas.style.height = `${size.y}px`;
  }

  gridHeatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.setShimmerVisible = function(show = true) {
  window.__gwState = window.__gwState || {};
  window.__gwState.showShimmer = !!show;

  const pane = map.getPane("gridShimmerPane");
  if (pane) pane.style.display = show ? "block" : "none";

  if (!show) {
    gridShimmerLayer.clearLayers();
  }

  if (typeof window.updateGrid === "function") {
    window.updateGrid();
  }
};

map.getPane("gridShimmerPane").style.display = "none";

// 20 ft in meters
const GRID_SIZE_M = 20 * 0.3048;


function getCaptiveFrac(metrics) {
  if (!metrics) return 0;

  const count = Number(metrics.count) || 0;
  const nCaptive = Number(metrics.n_captive) || 0;

  if (count <= 0) return 0;
  return Math.max(0, Math.min(1, nCaptive / count));
}

function parseGridDateMs(value) {
  if (!value) return 0;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function gridDateIsoFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function captiveFracToShimmerStyle(frac) {
  if (frac < 0.20) return null;

  if (frac < 0.40) {
    return {
      tileSizePx: 18,
      streakWidthPx: 1.0,
      overlayOpacity: 0.16,
      strokeA: "rgba(255,255,255,0.34)",
      strokeB: "rgba(255,255,255,0.12)"
    };
  }

  if (frac < 0.70) {
    return {
      tileSizePx: 16,
      streakWidthPx: 1.15,
      overlayOpacity: 0.40,
      strokeA: "rgba(255,255,255,0.42)",
      strokeB: "rgba(255,255,255,0.16)"
    };
  }

  return {
    tileSizePx: 14,
    streakWidthPx: 1.3,
    overlayOpacity: 0.74,
    strokeA: "rgba(255,255,255,0.50)",
    strokeB: "rgba(255,255,255,0.20)"
  };
}

function makeShimmerIcon(style) {
  const { tileSizePx, streakWidthPx, overlayOpacity, strokeA, strokeB } = style;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${tileSizePx}" height="${tileSizePx}"
         viewBox="0 0 ${tileSizePx} ${tileSizePx}">
      <line x1="-2" y1="${tileSizePx - 2}" x2="${tileSizePx - 6}" y2="-2"
            stroke="${strokeA}" stroke-width="${streakWidthPx}" stroke-linecap="round" />
      <line x1="5" y1="${tileSizePx + 1}" x2="${tileSizePx + 1}" y2="5"
            stroke="${strokeB}" stroke-width="${Math.max(0.6, streakWidthPx * 0.7)}" stroke-linecap="round" />
    </svg>
  `;

  return L.divIcon({
    className: "gw-shimmer-icon",
    html: `<div style="
      width:100%;
      height:100%;
      background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}');
      background-repeat:repeat;
      opacity:${overlayOpacity};
      pointer-events:none;
    "></div>`,
    iconSize: null
  });
}

function drawShimmerOverlayForCell(sw, ne, metrics) {
  const frac = getCaptiveFrac(metrics);
  const shimmerStyle = captiveFracToShimmerStyle(frac);
  if (!shimmerStyle) return;

  const bounds = L.latLngBounds(sw, ne);
  const center = bounds.getCenter();
  const icon = makeShimmerIcon(shimmerStyle);

  const marker = L.marker(center, {
    icon,
    pane: "gridShimmerPane",
    interactive: false
  });

  marker.on("add", () => {
    const el = marker.getElement();
    if (!el) return;

    const nw = map.latLngToLayerPoint(bounds.getNorthWest());
    const se = map.latLngToLayerPoint(bounds.getSouthEast());

    const w = Math.max(1, se.x - nw.x);
    const h = Math.max(1, se.y - nw.y);

    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.marginLeft = `${-w / 2}px`;
    el.style.marginTop = `${-h / 2}px`;
    el.style.opacity = "1";
    el.style.pointerEvents = "none";
  });

  marker.addTo(gridShimmerLayer);
}

// // // // // define helpers for the central 3×3 macro square

const CENTER_MACRO_SIZE_CELLS = 3;
const CENTER_MACRO_SIZE_M = GRID_SIZE_M * CENTER_MACRO_SIZE_CELLS;

function getCenterFineCell() {
  const c = map.getCenter();
  const p = map.options.crs.project(c);
  return {
    ix: Math.floor(p.x / GRID_SIZE_M),
    iy: Math.floor(p.y / GRID_SIZE_M)
  };
}

function getCenterMacroAnchor() {
  const { ix, iy } = getCenterFineCell();

  // Anchor the macro block so the user’s current fine cell is the middle of a 3x3 block
  return {
    ix0: ix - 1,
    iy0: iy - 1
  };
}

function fineCellBoundsLL(ix, iy) {
  const x0 = ix * GRID_SIZE_M;
  const y0 = iy * GRID_SIZE_M;
  const sw = map.options.crs.unproject(L.point(x0, y0));
  const ne = map.options.crs.unproject(L.point(x0 + GRID_SIZE_M, y0 + GRID_SIZE_M));
  return { sw, ne };
}

function macroCellBoundsLL(ix0, iy0) {
  const x0 = ix0 * GRID_SIZE_M;
  const y0 = iy0 * GRID_SIZE_M;
  const sw = map.options.crs.unproject(L.point(x0, y0));
  const ne = map.options.crs.unproject(
    L.point(x0 + CENTER_MACRO_SIZE_M, y0 + CENTER_MACRO_SIZE_M)
  );
  return { sw, ne };
}

// // // // ///

function getCenterMacroCellKeys() {
  const { ix0, iy0 } = getCenterMacroAnchor();
  const keys = [];

  for (let dx = 0; dx < CENTER_MACRO_SIZE_CELLS; dx++) {
    for (let dy = 0; dy < CENTER_MACRO_SIZE_CELLS; dy++) {
      keys.push(`${ix0 + dx},${iy0 + dy}`);
    }
  }
  return keys;
}

const GODS_EYE_TRANSIENT_RADIUS_CELLS = 5;

function isGodsEyeTransientVisibleCell(key) {
  if (!window.__gwState?.godsEyeEnabled) return false;

  const parts = String(key).split(",");
  if (parts.length !== 2) return false;

  const ix = Number(parts[0]);
  const iy = Number(parts[1]);
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return false;

  const center = getCenterFineCell();

  const dx = ix - center.ix;
  const dy = iy - center.iy;

  return Math.sqrt(dx * dx + dy * dy) <= GODS_EYE_TRANSIENT_RADIUS_CELLS;
}

window.isGodsEyeTransientVisibleCell = isGodsEyeTransientVisibleCell;


function markCenterMacroVisitedByGodsEye(force = false) {
  const state = window.__gwState || {};
  if (!state.godsEyeEnabled) return;
  if (!window.GridWildFog || typeof window.GridWildFog.markVisited !== "function") return;

  const center = getCenterFineCell();
  const centerKey = `${center.ix},${center.iy}`;

  if (!force && state.lastGodsEyeCenterKey === centerKey) return;

  state.lastGodsEyeCenterKey = centerKey;

  const timestamp = Date.now();
  const keys = getCenterMacroCellKeys();



  keys.forEach(key => {
    window.GridWildFog.markVisited(key, timestamp);
  });

  if (window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }

  if (typeof window.updateGrid === "function") {
  window.updateGrid();
  }

  if (typeof window.refreshGridWildMobileInfo === "function") {
    window.refreshGridWildMobileInfo();
  }
}

window.markCenterMacroVisitedByGodsEye = markCenterMacroVisitedByGodsEye;

function summarizeCenterMacroSquare() {

  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) {
    return null;
  }

  const keys = getCenterMacroCellKeys();

  let nCells = 0;
  let nNonzero = 0;
  let sumObs = 0;
  let sumSpecies = 0;
  let sumObservers = 0;

  let maxObs = 0;
  let maxSpecies = 0;
  let maxObservers = 0;

  for (const key of keys) {
    nCells += 1;

    const m = counts.get(key);
    if (!m) continue;

    const obs = m.count || 0;
    const species = m.species || 0;
    const observers = m.observers || 0;

    if (obs > 0 || species > 0 || observers > 0) nNonzero += 1;

    sumObs += obs;
    sumSpecies += species;
    sumObservers += observers;

    if (obs > maxObs) maxObs = obs;
    if (species > maxSpecies) maxSpecies = species;
    if (observers > maxObservers) maxObservers = observers;
  }


  // COOL CUSTOM FANCY METRICS!
  const speciesDensity = sumObs > 0 ? (sumSpecies / sumObs) : 0;
  //const discoveryScore = sumSpecies / (sumObservers + 1);
  const discoveryScore =  sumSpecies / Math.max(1, sumObservers); // smooth



  return {
    nCells,
    nNonzero,
    sumObs,
    sumSpecies,
    sumObservers,
    meanObsPerCell: nCells ? sumObs / nCells : 0,
    meanSpeciesPerCell: nCells ? sumSpecies / nCells : 0,
    meanObserversPerCell: nCells ? sumObservers / nCells : 0,
    maxObs,
    maxSpecies,
    maxObservers,
    speciesDensity,
    discoveryScore
  };
}


function getCellKeyForLatLng(lat, lng) {
  const p = map.options.crs.project(L.latLng(lat, lng));
  const ix = Math.floor(p.x / GRID_SIZE_M);
  const iy = Math.floor(p.y / GRID_SIZE_M);
  return `${ix},${iy}`;
}

window.getCellKeyForLatLng = getCellKeyForLatLng;




function getCenterSquareLabel() {
  const n = CENTER_MACRO_SIZE_CELLS;
  const widthFeet = Math.round((n * GRID_SIZE_M) / 0.3048);
  return `Center square (${n}×${n} cells ≈ ${widthFeet} ft × ${widthFeet} ft)`;
}


window.updateHudCenterSummary = async function updateHudCenterSummary() {

  const el = document.getElementById("gwSummaryBody");
  if (!el) return;

  const titleEl =
    document.querySelector("#gwSummaryPane .gw-summary-title");

  if (titleEl) {
    titleEl.textContent = getCenterSquareLabel();
  }

  try {

    const keys = getCenterMacroCellKeys();

    const squareRecords = await Promise.all(
      keys.map((key) => {
        const [ixStr, iyStr] = key.split(",");
        return getSquareGeneraRecord(
          Number(ixStr),
          Number(iyStr)
        );
      })
    );

    const merged =
      mergeSquareGeneraRecords(
        squareRecords.filter(Boolean)
      );

    const m = merged.__metrics;

    if (!m) {
      el.innerHTML =
        `<div class="gw-muted">No center-square data.</div>`;
      return;
    }

    const speciesDensity =
      m.count > 0 ? (m.species / m.count) : 0;

    const discoveryScore =
      m.species / Math.max(1, m.count * 0.25);

    const dominant =
      m.dominant_iconic || "Unknown";

    el.innerHTML = `
      <div class="gw-summary-grid">

        <div class="gw-summary-k">Discovery</div>
        <div class="gw-summary-v">
          ${discoveryScore.toFixed(2)}
        </div>

        <div class="gw-summary-k">Observations</div>
        <div class="gw-summary-v">
          ${m.count}
        </div>

        <div class="gw-summary-k">Genera</div>
        <div class="gw-summary-v">
          ${m.genera}
        </div>

        <div class="gw-summary-k">Species density</div>
        <div class="gw-summary-v">
          ${speciesDensity.toFixed(2)}
        </div>

        <div class="gw-summary-k">Active cells</div>
        <div class="gw-summary-v">
          ${m.nActiveSquares}/${m.nSquares}
        </div>

        <div class="gw-summary-k">Peak month</div>
        <div class="gw-summary-v">
          ${GWMetrics.monthName(m.peak_month)}
        </div>

        <div class="gw-summary-k">Seasonality</div>
        <div class="gw-summary-v">
          ${(100*m.seasonal_strength).toFixed(0)}%
        </div>

        <div class="gw-summary-k">Dominant life</div>
        <div class="gw-summary-v">
          ${dominant}
        </div>

      </div>
    `;

  } catch(err) {

    console.warn("Center summary failed:", err);

    el.innerHTML =
      `<div class="gw-muted">Could not load center summary.</div>`;
  }
};

window.updateHudCenterSummary = function updateHudCenterSummaryOLD() {
  const el = document.getElementById("gwSummaryBody");
  if (!el) return;

  const titleEl = document.querySelector("#gwSummaryPane .gw-summary-title");
if (titleEl) {
  titleEl.textContent = getCenterSquareLabel();
}

  const s = summarizeCenterMacroSquare();
  if (!s) {
    el.textContent = "No center-square data loaded yet.";
    return;
  }

  el.innerHTML = `
    <div class="gw-summary-grid">
    
      <div class="gw-summary-k">Discovery</div>
      <div class="gw-summary-v">${s.discoveryScore.toFixed(2)}</div>

      <div class="gw-summary-k">Observations</div>
      <div class="gw-summary-v">${s.sumObs}</div>

      <div class="gw-summary-k">Species</div>
      <div class="gw-summary-v">${s.sumSpecies}</div>

      <div class="gw-summary-k">Species density</div>
      <div class="gw-summary-v">${s.speciesDensity.toFixed(2)}</div>

      <div class="gw-summary-k">Observers</div>
      <div class="gw-summary-v">${s.sumObservers}</div>

      <div class="gw-summary-k">Mean obs/cell</div>
      <div class="gw-summary-v">${s.meanObsPerCell.toFixed(1)}</div>

      <div class="gw-summary-k">Cells</div>
      <div class="gw-summary-v">${s.nCells}</div>

      <div class="gw-summary-k">Active cells</div>
      <div class="gw-summary-v">${s.nNonzero}</div>

    </div>
  `;
};

window.updateTopObserversPanel = async function updateTopObserversPanel() {
  const el = document.getElementById("gwTopObserversBody");
  if (!el) return;

  try {
    const observerDict = await loadObserverDictionary();
    const keys = getCenterMacroCellKeys();

    const squareRecords = await Promise.all(
      keys.map((key) => {
        const [ixStr, iyStr] = key.split(",");
        return getSquareGeneraRecord(Number(ixStr), Number(iyStr));
      })
    );

    const agg = new Map();

    for (const rec of squareRecords) {
      const top = Array.isArray(rec?.top_observers) ? rec.top_observers : [];

      for (const row of top) {
        const observerId = Number(row.observer_id);
        if (!Number.isFinite(observerId)) continue;

        if (!agg.has(observerId)) {
          agg.set(observerId, {
            observer_id: observerId,
            count: 0,
            species: 0
          });
        }

        const dest = agg.get(observerId);
        dest.count += Number(row.count || 0);

        // approximate union would need raw taxon IDs, so for now keep max
        dest.species = Math.max(dest.species, Number(row.species || 0));
      }
    }

    const mergedTop = Array.from(agg.values())
      .sort((a, b) =>
        (b.count - a.count) ||
        (b.species - a.species) ||
        (a.observer_id - b.observer_id)
      )
      .slice(0, 5);

    if (!mergedTop.length) {
      el.innerHTML = `<div class="gw-muted">No observer leaderboard for this center 3×3 square.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="gw-list">
        ${mergedTop.map((row, idx) => {
          const meta = getObserverMeta(observerDict, row.observer_id) || {};
          const login = meta.login || `user ${row.observer_id}`;
          const name = meta.name || "";
          const icon = meta.icon_url || "";
          const count = Number(row.count || 0);
          const species = Number(row.species || 0);

          return `
            <div class="gw-rowline">
              <span style="display:flex;align-items:center;gap:10px;min-width:0;">
                <span class="gw-muted">#${idx + 1}</span>
                ${icon ? `
                  <img
                    src="${escapeHtml(icon)}"
                    alt=""
                    style="
                      width:26px;
                      height:26px;
                      border-radius:999px;
                      object-fit:cover;
                      flex:0 0 auto;
                      border:1px solid rgba(0,0,0,0.08);
                    "
                  >
                ` : ""}
                <span style="min-width:0;display:flex;flex-direction:column;line-height:1.15;">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  <a
                    href="https://www.inaturalist.org/people/${encodeURIComponent(login)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="gw-inat-link"
                    onclick="event.stopPropagation();"
                  >
                    @${escapeHtml(login)}
                  </a>
                </span>
                  ${name ? `
                    <span class="gw-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      ${escapeHtml(name)}
                    </span>
                  ` : ""}
                </span>
              </span>

              <span class="gw-muted" style="white-space:nowrap;">
                ${count} obs · ${species} spp
              </span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (err) {
    console.warn("Failed to renderconst genusMap = new Map(); top observers panel:", err);
    el.innerHTML = `<div class="gw-muted">Could not load top observers.</div>`;
  }
};

function mergeSquareGeneraRecords(squareRecords) {
  const genusMap = new Map();

  const mergedMetrics =
    window.GWMetrics?.mergeSquareMetrics
      ? window.GWMetrics.mergeSquareMetrics(squareRecords)
      : null;
      
  for (const rec of squareRecords) {
    const genera = Array.isArray(rec?.genera) ? rec.genera : [];

    for (const g of genera) {
      const iconic = g?.iconic_taxon_name || "Unknown";
      const order  = g?.order_name || "Unknown";
      const family = g?.family_name || "Unknown";
      const genus  = g?.genus_name || "Unknown";

      const key = [iconic, order, family, genus].join("||");

      if (!genusMap.has(key)) {
        genusMap.set(key, {
          iconic_taxon_name: iconic,
          order_name: order,
          family_name: family,
          genus_name: genus,
          count: 0,
          month_counts: new Array(12).fill(0)
        });
      }

      const dest = genusMap.get(key);
      dest.count += Number(g?.count) || 0;

      const srcMonths = Array.isArray(g?.month_counts) ? g.month_counts : [];
      for (let i = 0; i < 12; i++) {
        dest.month_counts[i] += Number(srcMonths[i]) || 0;
      }
    }
  }

  return {
    genera: Array.from(genusMap.values()),
    __metrics: mergedMetrics
  };

}

// ─────────────────────────────────────────────────────────────
// Taxonomy dictionary + square genera superchunk caches
// ─────────────────────────────────────────────────────────────
window.__genusTaxonomyDict = window.__genusTaxonomyDict || null;
window.__squareGeneraSuperchunkCache = window.__squareGeneraSuperchunkCache || new Map();

// Caches for in-flight fetches to prevent duplicate requests for the same data
window.__richGridMetrics = window.__richGridMetrics || new Map();
window.__richGridMetricsPending = window.__richGridMetricsPending || new Map();
window.__squareGeneraSuperchunkPending = window.__squareGeneraSuperchunkPending || new Map();


const GENERA_SUPERCHUNK_SIZE = 32; // must match your MATLAB writer
const GENERA_SUPERCHUNK_BASE = "assets/square_genera_superchunks";
const GENUS_TAXONOMY_DICT_URL = "assets/genus_taxonomy_dictionary.json";

window.__gwObserverDict = window.__gwObserverDict || null;
const OBSERVER_DICT_URL = "assets/observer_dictionary.json";

async function getGridAssetUrl(key, fallbackUrl) {
  try {
    if (window.GridWildAssets?.assetUrl) {
      return (await window.GridWildAssets.assetUrl(key)) || fallbackUrl;
    }
  } catch (err) {
    console.warn(`Falling back to local ${key} asset.`, err);
  }

  return fallbackUrl;
}

async function loadGridWildStaticAssets() {
  if (window.GridWildAssets?.getCatalog) {
    window.GridWildAssets.getCatalog()
      .then((catalog) => {
        window.__gwAssetBuild = catalog?.build || null;
      })
      .catch((err) => console.warn("GridWild asset catalog unavailable.", err));
  }

  if (window.GridWildAssets?.loadManifest) {
    window.GridWildAssets.loadManifest()
      .then((manifest) => {
        window.__gwAssetManifest = manifest || null;
      })
      .catch((err) => console.warn("GridWild asset manifest unavailable.", err));
  }

  if (window.GridWildAssets?.loadSquareSummary) {
    window.GridWildAssets.loadSquareSummary()
      .then((summary) => {
        window.__gwSquareGenusSummary = summary || null;
      })
      .catch((err) => console.warn("GridWild square summary unavailable.", err));
  }

  loadObserverDictionary()
    .catch((err) => console.warn("GridWild observer dictionary unavailable.", err));

  const heatUrl = await getGridAssetUrl("heat", "assets/dc_heat.csv");
  loadStaticHeatmapCsv(heatUrl);
}

async function loadObserverDictionary() {
  if (window.__gwObserverDict) return window.__gwObserverDict;

  const url = await getGridAssetUrl("observerDictionary", OBSERVER_DICT_URL);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load observer dictionary: HTTP ${resp.status} for ${url}`);
  }

  const data = await resp.json();
  window.__gwObserverDict = data || {};
  return window.__gwObserverDict;
}

async function loadGenusTaxonomyDictionary() {
  if (window.__genusTaxonomyDict) return window.__genusTaxonomyDict;

  const resp = await fetch(GENUS_TAXONOMY_DICT_URL);
  if (!resp.ok) {
    throw new Error(`Failed to load genus taxonomy dictionary: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  window.__genusTaxonomyDict = data;
  return data;
}

async function loadGeneraSuperchunk(ix, iy) {
  const key = getGeneraSuperchunkKey(ix, iy);
  const cache = window.__squareGeneraSuperchunkCache;
  const pending = window.__squareGeneraSuperchunkPending;

  if (cache.has(key)) {
    return cache.get(key);
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const url = await getGeneraSuperchunkUrlAsync(ix, iy);

  const job = fetch(url)
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`Failed to load square genera superchunk: HTTP ${resp.status} for ${url}`);
      }
      return resp.json();
    })
    .then((data) => {
      cache.set(key, data);
      pending.delete(key);
      return data;
    })
    .catch((err) => {
      pending.delete(key);
      throw err;
    });

  pending.set(key, job);
  return job;
}


function getGeneraSuperchunkKey(ix, iy) {
  const super_ix = Math.floor(ix / GENERA_SUPERCHUNK_SIZE);
  const super_iy = Math.floor(iy / GENERA_SUPERCHUNK_SIZE);
  return `${super_ix}_${super_iy}`;
}

function getGeneraSuperchunkUrl(ix, iy) {
  const key = getGeneraSuperchunkKey(ix, iy);
  const url = `${GENERA_SUPERCHUNK_BASE}/super_${key}.json`;
  //console.log("GENERA url", { ix, iy, key, url });
  return url;
}

async function getGeneraSuperchunkUrlAsync(ix, iy) {
  if (window.GridWildAssets?.superchunkUrl) {
    const key = getGeneraSuperchunkKey(ix, iy);
    const [superIx, superIy] = key.split("_").map(Number);
    return window.GridWildAssets.superchunkUrl(superIx, superIy);
  }

  return getGeneraSuperchunkUrl(ix, iy);
}

async function loadGeneraSuperchunkOLD(ix, iy) {
  const key = getGeneraSuperchunkKey(ix, iy);
  const cache = window.__squareGeneraSuperchunkCache;

  if (cache.has(key)) {
    const data = cache.get(key);
    //console.log("GENERA cache hit", key);
    //console.log("GENERA cached keys sample", Object.keys(data?.squares || {}).slice(0, 20));
    return data;
  }

  const url = await getGeneraSuperchunkUrlAsync(ix, iy);
  const resp = await fetch(url);
  //console.log("GENERA fetch", url, resp.status);

  if (!resp.ok) {
    throw new Error(`Failed to load square genera superchunk: HTTP ${resp.status} for ${url}`);
  }

  const data = await resp.json();
//  console.log("GENERA loaded keys sample", Object.keys(data?.squares || {}).slice(0, 20));
  cache.set(key, data);
  return data;
}

function encodeGeneraSquareId(ix, iy) {
  const enc = (n) => (n < 0 ? `m${Math.abs(n)}` : `p${n}`);
  return `sq_${enc(ix)}_${enc(iy)}`;
}

async function getSquareGeneraRecord(ix, iy) {
  const squareId = encodeGeneraSquareId(ix, iy);
  //console.log("GENERA squareId wanted", squareId);

  try {
    const chunk = await loadGeneraSuperchunk(ix, iy);
    const rec = chunk?.squares?.[squareId] || null;
    //console.log("GENERA record found?", !!rec, rec);
    return rec;
  } catch (err) {
    console.warn("No square genera record available:", err);
    return null;
  }
}

async function warmRichMetricsForCell(ix, iy) {
  const key = `${ix},${iy}`;
  const richCache = window.__richGridMetrics;
  const pending = window.__richGridMetricsPending;

  if (richCache.has(key)) return richCache.get(key);
  if (pending.has(key)) return pending.get(key);

  const job = getSquareGeneraRecord(ix, iy).then((rec) => {
    if (!rec || !window.GWMetrics?.buildSquareMetrics) return null;

    const staticMetrics = window.__staticGridCounts?.get(key) || {};
    const richMetrics = window.GWMetrics.buildSquareMetrics(rec);

    const merged = {
      ...staticMetrics,
      ...richMetrics,
      observers: Number(staticMetrics.observers) || 0,
      n_captive: Number(staticMetrics.n_captive) || 0,
      last_observed: richMetrics.last_observed || staticMetrics.last_observed || null,
      median_last10_observed: richMetrics.median_last10_observed || staticMetrics.median_last10_observed || null,
      last_observed_ms: Number(richMetrics.last_observed_ms) || Number(staticMetrics.last_observed_ms) || 0,
      median_last10_observed_ms: Number(richMetrics.median_last10_observed_ms) || Number(staticMetrics.median_last10_observed_ms) || 0
    };

    richCache.set(key, merged);
    return merged;
  }).finally(() => {
    pending.delete(key);
  });

  pending.set(key, job);
  return job;
}

// Modular iconic-taxon overlay adapter. It leaves the base static metrics and
// lens recipes intact, but swaps in filtered metrics right before painting.
window.GridWildIconicOverlayFilter = window.GridWildIconicOverlayFilter || (function () {
  let enabled = true;

  function selectedTaxa() {
    const taxa = window.__gwFilters?.iconicTaxa || [];
    return Array.isArray(taxa) ? taxa.filter(Boolean) : [];
  }

  function isActive() {
    return enabled && selectedTaxa().length > 0;
  }

  function getCachedSquareRecord(ix, iy) {
    const cache = window.__squareGeneraSuperchunkCache;
    if (!(cache instanceof Map)) return null;

    const chunk = cache.get(getGeneraSuperchunkKey(ix, iy));
    const squareId = encodeGeneraSquareId(ix, iy);
    return chunk?.squares?.[squareId] || null;
  }

  function rowsForRecord(rec) {
    if (!rec) return [];
    if (Array.isArray(rec.genera)) return rec.genera;
    if (rec.genera) return [rec.genera];
    return [];
  }

  function requestRecord(ix, iy) {
    warmRichMetricsForCell(ix, iy).then((metrics) => {
      if (metrics) scheduleGridHeatCanvasRender();
    });
  }

  function metricsForCell(ix, iy, baseMetrics = {}) {
    if (!isActive()) return baseMetrics;
    if (!window.GWMetrics?.buildSquareMetrics) return baseMetrics;

    const rec = getCachedSquareRecord(ix, iy);
    if (!rec) {
      requestRecord(ix, iy);
      return null;
    }

    const taxa = new Set(selectedTaxa());
    const filteredRows = rowsForRecord(rec)
      .filter(row => taxa.has(row?.iconic_taxon_name || "Unknown"));

    if (!filteredRows.length) return null;

    const filtered = window.GWMetrics.buildSquareMetrics({ genera: filteredRows });
    if (!filtered || (filtered.count || 0) <= 0) return null;

    const totalCount = Number(baseMetrics.count) || Number(rec.__metrics?.count) || filtered.count;
    const ratio = totalCount > 0
      ? Math.max(0, Math.min(1, filtered.count / totalCount))
      : 1;

    return {
      ...baseMetrics,
      ...filtered,
      observers: Math.round((Number(baseMetrics.observers) || 0) * ratio),
      n_captive: Math.round((Number(baseMetrics.n_captive) || 0) * ratio),
      last_observed: baseMetrics.last_observed || filtered.last_observed || null,
      median_last10_observed: baseMetrics.median_last10_observed || filtered.median_last10_observed || null,
      last_observed_ms: Number(baseMetrics.last_observed_ms) || Number(filtered.last_observed_ms) || 0,
      median_last10_observed_ms: Number(baseMetrics.median_last10_observed_ms) || Number(filtered.median_last10_observed_ms) || 0,
      nActiveSquares: filtered.count > 0 ? 1 : 0
    };
  }

  function setEnabled(value) {
    enabled = value !== false;
    scheduleGridHeatCanvasRender();
  }

  return {
    isActive,
    metricsForCell,
    selectedTaxa,
    setEnabled
  };
})();

function warmRichMetricsForVisibleCells() {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  const lens = window.__gwState?.activeLens || "classic";
  const needsRichMetrics =
    lens === "dominantlife" ||
    window.GridWildIconicOverlayFilter?.isActive?.();

  if (!needsRichMetrics) return;

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      if (!counts.has(key)) continue;

      warmRichMetricsForCell(ix, iy).then((m) => {
        if (m) scheduleGridHeatCanvasRender();
      });
    }
  }
}

window.warmRichMetricsAroundCenter = function warmRichMetricsAroundCenter(radius = 4) {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  const center = getCenterFineCell();

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const ix = center.ix + dx;
      const iy = center.iy + dy;
      const key = `${ix},${iy}`;

      if (!counts.has(key)) continue;

      warmRichMetricsForCell(ix, iy).then((m) => {
        if (m) scheduleGridHeatCanvasRender();
      });
    }
  }
};




function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getObserverMeta(observerDict, observerId) {
  if (!observerDict) return null;

  return (
    observerDict[String(observerId)] ||
    observerDict[`id_${observerId}`] ||
    null
  );
}

window.__genusNameToTaxonomyEntry = window.__genusNameToTaxonomyEntry || null;

function buildGenusNameToTaxonomyEntryIndex(genusDict) {
  const idx = Object.create(null);

  for (const [genusId, entry] of Object.entries(genusDict || {})) {
    const name = entry?.name;
    if (!name) continue;

    idx[name] = {
      genus_id: genusId,
      ...entry
    };
  }

  return idx;
}

async function loadGenusNameToTaxonomyEntryIndex() {
  if (window.__genusNameToTaxonomyEntry) {
    return window.__genusNameToTaxonomyEntry;
  }

  const genusDict = await loadGenusTaxonomyDictionary();
  const idx = buildGenusNameToTaxonomyEntryIndex(genusDict);
  window.__genusNameToTaxonomyEntry = idx;
  return idx;
}

function buildTaxonomyTreeFromSquareRecord(squareRec) {
  const root = {
    name: "Life",
    rank: "root",
    children: new Map(),
    weight: 0,
    genusCount: 0,
    depth: 0
  };

  const genera = Array.isArray(squareRec?.genera) ? squareRec.genera : [];
  const seenGeneraPerNode = new Map();

  function markGenus(node, genusKey) {
    if (!seenGeneraPerNode.has(node)) {
      seenGeneraPerNode.set(node, new Set());
    }
    const s = seenGeneraPerNode.get(node);
    if (!s.has(genusKey)) {
      s.add(genusKey);
      node.genusCount = (node.genusCount || 0) + 1;
    }
  }

  for (const g of genera) {
    const iconic = g?.iconic_taxon_name || "Unknown";
    const order  = g?.order_name || "Unknown";
    const family = g?.family_name || "Unknown";
    const genus  = g?.genus_name || "Unknown";

    const genusKey = [iconic, order, family, genus].join("||");
    const n = Math.max(1, Number(g?.count) || 1);

    const fixedPath = [
      { name: iconic, rank: "iconic_taxon" },
      { name: order,  rank: "order" },
      { name: family, rank: "family" },
      { name: genus,  rank: "genus" }
    ];

    let node = root;
    node.weight += n;
    markGenus(node, genusKey);

    fixedPath.forEach((part, depthIdx) => {
      const childKey = `${part.rank}:${part.name}`;

      if (!node.children.has(childKey)) {
        node.children.set(childKey, {
          key: childKey,
          name: part.name,
          rank: part.rank,
          children: new Map(),
          weight: 0,
          genusCount: 0,
          depth: depthIdx + 1
        });
      }

      node = node.children.get(childKey);
      node.weight += n;
      markGenus(node, genusKey);
    });
  }

  return root;
}

function finalizeTree(node, parent = null, out = []) {
  const kids = Array.from(node.children.values())
    .sort((a, b) =>
      (b.genusCount || 0) - (a.genusCount || 0) ||
      (b.weight || 0) - (a.weight || 0) ||
      a.name.localeCompare(b.name)
    );

  const finalized = {
    name: node.name,
    rank: node.rank || null,
    weight: node.weight || 0,
    genusCount: node.genusCount || 0,
    depth: node.depth || 0,
    parent,
    children: kids.map(child => finalizeTree(child, node.name, out))
  };

  out.push(finalized);
  return finalized;
}

function getLeafCount(node) {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((s, c) => s + getLeafCount(c), 0);
}

function assignTreeLayout(root) {
  let maxDepth = 0;

  function prep(node, depth = 0) {
    node.depth = depth;
    maxDepth = Math.max(maxDepth, depth);

    const kids = node.children || [];
    if (kids.length === 0) {
      node._leafCount = 1;
      return 1;
    }

    let total = 0;
    kids.forEach((child) => {
      total += prep(child, depth + 1);
    });

    node._leafCount = Math.max(1, total);
    return node._leafCount;
  }

  prep(root, 0);

  function assignSpan(node, x0, x1) {
    node._x0 = x0;
    node._x1 = x1;
    node._x = 0.5 * (x0 + x1);

    const kids = node.children || [];
    if (kids.length === 0) return;

    const totalLeaves = kids.reduce((s, c) => s + (c._leafCount || 1), 0) || 1;
    let cursor = x0;

    kids.forEach((child) => {
      const frac = (child._leafCount || 1) / totalLeaves;
      const w = (x1 - x0) * frac;
      assignSpan(child, cursor, cursor + w);
      cursor += w;
    });
  }

  // Use a normalized 0..1 horizontal domain
  assignSpan(root, 0, 1);

  return {
    leafCount: Math.max(1, root._leafCount || 1),
    maxDepth
  };
}


function flattenTree(root) {
  const nodes = [];
  const edges = [];

  function walk(node, parent = null) {
    nodes.push(node);
    if (parent) edges.push({ source: parent, target: node });
    (node.children || []).forEach(child => walk(child, node));
  }

  walk(root);
  return { nodes, edges };
}


function slugifyCladoName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}

function annotateTreePaths(node, parentPath = "root") {
  const myPath = node.depth === 0
    ? "root"
    : `${parentPath}/${slugifyCladoName(node.name)}`;

  node._path = myPath;
  (node.children || []).forEach(child => annotateTreePaths(child, myPath));
  return node;
}



// ─────────────────────────────────────────────────────────────
// Simple pie-navigation state
// ─────────────────────────────────────────────────────────────
window.__gwCladoState = window.__gwCladoState || {
  fullTree: null,
  currentNodePath: "root",
  pathStack: []
};

function findNodeByPath(node, path) {
  if (!node) return null;
  if (node._path === path) return node;

  for (const child of (node.children || [])) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

function getCurrentPieNode() {
  const state = window.__gwCladoState || {};
  return findNodeByPath(state.fullTree, state.currentNodePath || "root");
}

function colorForPieDepth(depth, frac = 0.5) {
  const hue = 120 + depth * 38 + frac * 30;
  const sat = 58;
  const light = 52 - Math.min(depth * 2, 10);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function colorForPieSlice(child, diversityFrac, siblingIndexFrac = 0.5) {
  // Keep hue mostly stable within a view, with a slight spread across siblings
  const baseHue = 120 + 18 * siblingIndexFrac;

  // Diversity drives vividness and a bit of darkness
  const sat = 28 + 58 * diversityFrac;     // low diversity = duller
  const light = 70 - 20 * diversityFrac;   // high diversity = a bit darker/richer

  return `hsl(${baseHue}, ${sat}%, ${light}%)`;
}


function polarToCartesian(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a)
  };
}

function describeArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);

  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z"
  ].join(" ");
}

const TAXON_COMMON_NAMES = {
  Aves: "Birds",
  Mammalia: "Mammals",
  Plantae: "Plants",
  Fungi: "Fungi",
  Insecta: "Insects",
  Reptilia: "Reptiles",
  Amphibia: "Amphibians",
  Arachnida: "Arachnids",
  Mollusca: "Mollusks",
  Actinopterygii: "Ray-finned Fishes",

  Diptera: "Flies",
  Lepidoptera: "Butterflies & Moths",
  Coleoptera: "Beetles",
  Hymenoptera: "Bees, Wasps & Ants",
  Hemiptera: "True Bugs",
  Orthoptera: "Grasshoppers & Crickets",
  Odonata: "Dragonflies & Damselflies",
  Araneae: "Spiders",
  Unknown: "Unknown"
};

function getDisplayName(node) {
  return TAXON_COMMON_NAMES[node.name] || node.name;
}

function renderPieSvg(node) {
  
const mobile = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
const W = 260;
const H = mobile ? 10 : 240;
const cx     = 130;
const cy     = mobile ? 5 : 120;
const rOuter = mobile ? 100 : 92;
const rInner = mobile ? 20 : 28;

  const showSmallText = shouldShowSmallText();

  const kids = (node?.children || []).slice();

  if (!kids.length) {
    return `
      <svg id="gwCladoSvg" class="gw-clado-svg" viewBox="0 0 ${W} ${H}">
        <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="rgba(80,120,80,0.08)" stroke="rgba(0,0,0,0.08)" />
        <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="white" stroke="rgba(0,0,0,0.08)" />
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(node?.name || "Node")}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" opacity="0.65">Leaf node</text>
      </svg>
    `;
  }

  const total = kids.reduce((s, k) => s + Math.max(1, k.weight || 1), 0) || 1;
  const maxDiversity = Math.max(...kids.map(k => k.genusCount || 0), 1);

  let cursor = 0;
  const slices = kids.map((child, i) => {
    const value = Math.max(1, child.weight || 1);
    const frac = value / total;
    const startAngle = cursor * 360;
    const endAngle = (cursor + frac) * 360;
    cursor += frac;

    const mid = 0.5 * (startAngle + endAngle);
    const labelPt = polarToCartesian(cx, cy, 62, mid);
    
    // const fill = colorForPieDepth(child.depth || 1, i / Math.max(1, kids.length - 1));
    const diversityFrac = (child.genusCount || 0) / maxDiversity;
    const fill = colorForPieSlice(
      child,
      diversityFrac,
      i / Math.max(1, kids.length - 1)
    );


    return `
      <g class="gw-pie-slice-group" data-node-path="${escapeHtml(child._path || "")}">
        <title>
        ${getDisplayName(child)} (${child.name}) • ${child.weight} obs • ${child.genusCount} genera
        </title>
        <path
          class="gw-pie-slice"
          d="${describeArc(cx, cy, rOuter, rInner, startAngle, endAngle)}"
          fill="${fill}"
          stroke="rgba(255,255,255,0.95)"
          stroke-width="1.5"
        />
        ${frac > 0.06 ? `
          <text
            x="${labelPt.x}"
            y="${labelPt.y}"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="${mobile ? 10.5 : 10.5}"
            font-weight="600"
            fill="rgba(28, 22, 14, 0.96)"
            pointer-events="none"
          >${escapeHtml(getDisplayName(child))}</text>
        ` : ""}
      </g>
    `;
  }).join("");

  return `
    <svg id="gwCladoSvg" class="gw-clado-svg" viewBox="0 0 ${W} ${H}">
      <circle
        id="gwPieBackHit"
        cx="${cx}" cy="${cy}" r="${rOuter + 18}"
        fill="transparent"
        pointer-events="all"
      />
      ${slices}
      <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="white" stroke="rgba(0,0,0,0.10)" />
      <text
  x="${cx}"
  y="${cy - 4}"
  text-anchor="middle"
  dominant-baseline="middle"
  font-size="${mobile ? 11 : 10}"
  font-weight="800"
  fill="rgba(36,28,18,0.96)"
  stroke="rgba(255,255,255,0.30)"
  stroke-width="0.7"
  paint-order="stroke"
  style="letter-spacing:0.4px; text-transform:uppercase;"
>
  ${escapeHtml(getDisplayName(node))}
</text>
      ${showSmallText ? `
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10.5" opacity="0.64">
          tap slice to drill in
        </text>
      ` : ""}
    </svg>
  `;
}

function rerenderCladogram() {
  const state = window.__gwCladoState || {};
  const el = document.getElementById("gwCladoBody");
  if (!el || !state.fullTree) return;

  const node = getCurrentPieNode();
  if (!node) return;

  el.className = "";
  el.innerHTML = renderPieSvg(node);
  bindCladogramInteractions();
}

function bindCladogramInteractions() {
  const svg = document.getElementById("gwCladoSvg");
  if (!svg) return;

  const state = window.__gwCladoState || {};

  function drillToNodePath(nodePath) {
    if (!nodePath) return;

    const nextNode = findNodeByPath(state.fullTree, nodePath);
    if (!nextNode) return;
 
    if (!nextNode.children || nextNode.children.length === 0) {
    const genusName = nextNode.name || nextNode.label || nextNode.genus_name || "";
    if (genusName && window.GridWildGenusCodex) {
      window.GridWildGenusCodex.open(genusName);
    }
    return;
   }

    state.pathStack = state.pathStack || [];
    state.pathStack.push(state.currentNodePath || "root");
    state.currentNodePath = nodePath;

    rerenderCladogram();
  }

  function stepBack() {
    if (state.pathStack && state.pathStack.length > 0) {
      state.currentNodePath = state.pathStack.pop();
      rerenderCladogram();
    }
  }

  // ------------------------------------------------------------
  // Slice drill-down
  // Desktop: dblclick
  // Mobile: single click / tap
  // ------------------------------------------------------------
  svg.querySelectorAll(".gw-pie-slice-group").forEach((g) => {
    const nodePath = g.dataset.nodePath;

    g.addEventListener("dblclick", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      drillToNodePath(nodePath);
    });

    g.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      drillToNodePath(nodePath);
    });
  });

  // ------------------------------------------------------------
  // Back navigation
  // Tap/click center or empty background to go back
  // ------------------------------------------------------------
  const backHit = svg.querySelector("#gwPieBackHit");
  if (backHit) {
    backHit.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      stepBack();
    });

    backHit.addEventListener("dblclick", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      stepBack();
    });
  }

  svg.addEventListener("dblclick", (evt) => {
    const hitSlice = evt.target.closest(".gw-pie-slice-group");
    if (hitSlice) return;

    evt.preventDefault();
    evt.stopPropagation();
    stepBack();
  });
}

function getCladoElements() {
  return {
    wrap: document.getElementById("gwCladoWrap"),
    svg: document.getElementById("gwCladoSvg")
  };
}


function getPointerDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function getPointerMidpoint(a, b) {
  return {
    clientX: 0.5 * (a.clientX + b.clientX),
    clientY: 0.5 * (a.clientY + b.clientY)
  };
}




function formatViewBox(vb) {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

function setSvgViewBox(vb) {
  const svg = document.getElementById("gwCladoSvg");
  if (!svg) return;
  svg.setAttribute("viewBox", formatViewBox(vb));
  window.__gwCladoState.currentViewBox = formatViewBox(vb);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.updateHudCladogram = async function updateHudCladogram() {
  const el = document.getElementById("gwCladoBody");
  if (!el) return;

  try {
    const showSmallText = shouldShowSmallText();
    const subtitleEl = document.querySelector("#gwCladoPane .gw-clado-subtitle");
    if (subtitleEl) {
      subtitleEl.hidden = !showSmallText;
      subtitleEl.textContent =
        `Center ${CENTER_MACRO_SIZE_CELLS}×${CENTER_MACRO_SIZE_CELLS} square taxonomy: iconic taxon → order → family → genus; slice size = observations, color vividness = genus diversity`;
    }

    const hintEl = document.querySelector("#gwCladoPane .gw-clado-hint");
    if (hintEl) hintEl.hidden = !showSmallText;

    const keys = getCenterMacroCellKeys();

    const squareRecords = await Promise.all(
      keys.map((key) => {
        const [ixStr, iyStr] = key.split(",");
        return getSquareGeneraRecord(Number(ixStr), Number(iyStr));
      })
    );

    const mergedRecord = mergeSquareGeneraRecords(squareRecords.filter(Boolean));

    if (!Array.isArray(mergedRecord.genera) || mergedRecord.genera.length === 0) {
      el.className = "gw-clado-empty";
      el.innerHTML = `No taxonomy data for the current center ${CENTER_MACRO_SIZE_CELLS}×${CENTER_MACRO_SIZE_CELLS} square.`;
      return;
    }

    const rawTree = buildTaxonomyTreeFromSquareRecord(mergedRecord);
    const tree = annotateTreePaths(finalizeTree(rawTree));

    window.__gwCladoState.fullTree = tree;
    window.__gwCladoState.currentNodePath = "root";
    window.__gwCladoState.pathStack = [];

    el.className = "";
    el.innerHTML = renderPieSvg(tree);
    bindCladogramInteractions();

  } catch (err) {
    console.warn("Failed to update cladogram:", err);
    el.className = "gw-clado-empty";
    el.innerHTML = "Could not load taxonomy data.";
  }
};

function findNodeByPath(node, path) {
  if (!node) return null;
  if (node._path === path) return node;

  for (const child of (node.children || [])) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}


// Optional: style (grid lines)
const GRID_LINE_STYLE = {
  pane: "gridPane",
  interactive: false,
  weight: .8,
  opacity: 0.25
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

// NEW
function countToFill(count) {
  if (!count || count <= 0) return null;

  //const maxCount = HEAT_MAX_COUNT;
  const maxCount = getHeatCap(); // dynamic
  const logDen = Math.log1p(maxCount);
  const tLinear = Math.min(count, maxCount) / maxCount;
  const tLog = Math.log1p(Math.min(count, maxCount)) / logDen;

  const useLog = window.__gwState?.logHeat ?? true;
  const t = useLog ? tLog : tLinear;

  const hue = 200 + (20 - 200) * t;
  const sat = 85;
  const light = 60 - 12 * t;
  const fillColor = `hsl(${hue.toFixed(1)}, ${sat}%, ${light.toFixed(1)}%)`;
  const fillOpacity = 0.10 + 0.55 * Math.pow(t, 0.85);

  return { fillColor, fillOpacity };
}


function metricsToFill(metrics){
  if (window.GWLenses?.compose) {
    return window.GWLenses.compose(metrics);
  }
  return metricsToFillOLD(metrics);
}

// BLENDED COLORMAP!!!!!
function metricsToFillOLD(metrics) {
  if (!metrics) return null;

  const obs = metrics.count || 0;
  const species = metrics.species || 0;
  const observers = metrics.observers || 0;

  if (obs <= 0) return null;

  // caps (tweak later)
  const OBS_CAP = 30;
  const SPECIES_CAP = 15;
  const OBSERVER_CAP = 6;

// make room for log scaling on the colormap...
//  const tObs = Math.min(obs, OBS_CAP) / OBS_CAP;
const logDen = Math.log1p(OBS_CAP);
const tObsLinear = Math.min(obs, OBS_CAP) / OBS_CAP;
const tObsLog = Math.log1p(Math.min(obs, OBS_CAP)) / logDen;
const useLog = window.__gwState?.logHeat ?? true;
const tObs = useLog ? tObsLog : tObsLinear;

// make room for log scaling of species... :\
//  const tSpecies = Math.min(species, SPECIES_CAP) / SPECIES_CAP;
const logDenSpecies = Math.log1p(SPECIES_CAP);
const tSpeciesLinear = Math.min(species, SPECIES_CAP) / SPECIES_CAP;
const tSpeciesLog = Math.log1p(Math.min(species, SPECIES_CAP)) / logDenSpecies;
const tSpecies = useLog ? tSpeciesLog : tSpeciesLinear;

  const tObservers = Math.min(observers, OBSERVER_CAP) / OBSERVER_CAP;

  // observers control hue
  const hue = 200 + (20 - 200) * tObservers;

  // species control saturation
  const sat = 40 + 50 * tSpecies;

  // observations control lightness
  const light = 65 - 20 * tObs;

  const fillColor = `hsl(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%)`;

  const fillOpacity = 0.15 + 0.65 * Math.pow(tObs, 0.8);

  return { fillColor, fillOpacity };
}

window.metricsToFill = metricsToFill;

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
function getHeatCap() {
  const metric = window.__gwState?.heatMetric ?? "count";

  if (metric === "species") return 20;
  if (metric === "observers") return 5;
  return 30;
}

function updateGridHeat(results) {
  gridHeatLayer.clearLayers();

  const counts = obsResultsToGridCounts(results);
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);

      const key = `${ix},${iy}`;
      const metrics = counts.get(key) || null;
      const style = metricsToFill(metrics);

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
};


// Grid lines rendering
function updateGridLines() {
  gridLineLayer.clearLayers();

  const { ix0, iy0 } = getCenterMacroAnchor();
  const { sw, ne } = macroCellBoundsLL(ix0, iy0);

  // Draw only ONE big square = the central 3x3 block
  L.rectangle([sw, ne], {
    pane: "gridPane",
    interactive: false,
    color: "#000",
    opacity: 0.45,
    weight: 3,
    fill: false
  }).addTo(gridLineLayer);
}

// this now renders the static assets
function updateGrid() {
  markCenterMacroVisitedByGodsEye();
  updateGridLines();
  updateStaticGridHeat();
    if (typeof window.updateHudCenterSummary === "function") {
    window.updateHudCenterSummary();
  }

  if (typeof window.updateTopObserversPanel === "function") {
    window.updateTopObserversPanel();
  }

  if (typeof window.updateHudCladogram === "function") {
    window.updateHudCladogram();
  }

}

map.on("move zoom resize viewreset zoomend moveend", scheduleGridHeatCanvasRender);
map.on("zoomend resize moveend", updateGrid);
updateGrid();

loadGridWildStaticAssets();

// RPG-style grid cell popup on double click
// Disable Leaflet dblclick-to-zoom so we can use dblclick for UI
map.doubleClickZoom.disable();

// One-time CSS inject for the RPG popup
(function injectRPGPopupCSS() {
  if (document.getElementById("rpg-popup-css")) return;
  const css = `

  .rpg-popup .leaflet-popup-content-wrapper{
    border-radius: 16px;
    padding: 0;
    background:
      linear-gradient(180deg, rgba(42,35,29,0.97), rgba(19,16,14,0.985));
    color: #efe6d3;
    box-shadow:
      0 14px 34px rgba(0,0,0,0.42),
      inset 0 1px 0 rgba(255,255,255,0.04),
      inset 0 0 0 1px rgba(255,255,255,0.02);
    border: 1px solid rgba(215,183,116,0.28);
    backdrop-filter: blur(5px);
  }

  .rpg-popup .leaflet-popup-tip{
    background: rgba(24,20,17,0.98);
    border: 1px solid rgba(215,183,116,0.20);
  }

  .rpg-card{
    font-family: Georgia, "Times New Roman", serif;
    width: 264px;
    padding: 12px 12px 11px 12px;
    position: relative;
    color: #efe6d3;
    text-shadow: 0 1px 0 rgba(0,0,0,0.55);
  }

  .rpg-card::before{
    content:"";
    position:absolute;
    inset: 7px;
    border: 1px solid rgba(215,183,116,0.10);
    border-radius: 11px;
    pointer-events:none;
  }

  .rpg-title{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    font-size: 13px;
    margin-bottom: 6px;
    color: #d7b774;
    text-transform: uppercase;
  }

  .rpg-badge{
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 999px;
    color: #f5ead3;
    background: linear-gradient(180deg, rgba(101,78,42,0.92), rgba(61,45,24,0.96));
    border: 1px solid rgba(215,183,116,0.24);
    white-space: nowrap;
    letter-spacing: 0.5px;
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
    background:
      linear-gradient(180deg, rgba(71,57,45,0.54), rgba(39,31,25,0.74));
    border: 1px solid rgba(215,183,116,0.10);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
  }

  .rpg-k{
    font-size: 10px;
    color: rgba(239,230,211,0.64);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .rpg-v{
    font-size: 13px;
    font-weight: 700;
    line-height: 1.1;
    color: #f4e8cf;
  }

  .rpg-mini{
    font-size: 10px;
    color: rgba(239,230,211,0.74);
    margin-top: 9px;
    line-height: 1.35;
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

// ─────────────────────────────────────────────────────────────
// Superchunk taxonomy store
// ─────────────────────────────────────────────────────────────

function getStaticMetricsForCell(ix, iy) {
  const m = window.__staticGridCounts?.get(`${ix},${iy}`);
  return {
    count: Number(m?.count) || 0,
    species: Number(m?.species) || 0,
    observers: Number(m?.observers) || 0,
    n_captive: Number(m?.n_captive) || 0,
    last_observed: m?.last_observed || null,
    median_last10_observed: m?.median_last10_observed || null,
    last_observed_ms: Number(m?.last_observed_ms) || 0,
    median_last10_observed_ms: Number(m?.median_last10_observed_ms) || 0
  };
}

function summarizeSquareGenera(squareRec) {
  const genera = Array.isArray(squareRec?.genera) ? squareRec.genera : [];

  const nGenera = genera.length;
  const totalGenusObs = genera.reduce((s, g) => s + (Number(g.count) || 0), 0);

  const topGenera = genera
    .slice(0, 5)
    .map(g => `${g.genus_name} (${g.count})`)
    .join(", ");

  return {
    nGenera,
    totalGenusObs,
    topGenera: topGenera || "—"
  };
}

function buildRPGPopupHTML({ ix, iy, centerLL, metrics, genusSummary }) {
  const cls = classifyCell(metrics.count);

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
          <div class="rpg-k">Observations</div>
          <div class="rpg-v">${metrics.count}</div>
        </div>

        <div class="rpg-stat">
          <div class="rpg-k">Species</div>
          <div class="rpg-v">${metrics.species}</div>
        </div>
      
        <div class="rpg-stat">
          <div class="rpg-k">Captive</div>
          <div class="rpg-v">${
            metrics.count > 0
              ? `${Math.round(100 * metrics.n_captive / metrics.count)}%`
              : "0%"
          }</div>
        </div>

        <div class="rpg-stat">
          <div class="rpg-k">Observers</div>
          <div class="rpg-v">${metrics.observers}</div>
        </div>

        <div class="rpg-stat">
          <div class="rpg-k">Genera</div>
          <div class="rpg-v">${genusSummary.nGenera}</div>
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

      <div class="rpg-mini" style="margin-top:10px;">
        Top genera: ${escapeHtml(genusSummary.topGenera)}
      </div>
    </div>
  `;
}

// The function you asked for: attach the dblclick behavior
window.enableGridRPGPopup = function enableGridRPGPopup() {
  map.off("dblclick", __onGridDblClick);
  map.on("dblclick", __onGridDblClick);
};

async function __onGridDblClick(e) {
  if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault();
  if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();

  const pMeters = map.options.crs.project(e.latlng);
  const { ix, iy } = metersToGridIndex(pMeters);

  const { swLL, neLL } = gridIndexToBoundsLL(ix, iy);
  flashGridCell(swLL, neLL);

  const centerLL = L.latLng(
    (swLL.lat + neLL.lat) / 2,
    (swLL.lng + neLL.lng) / 2
  );

  // Pull precomputed square metrics from static heat store
  const metrics = getStaticMetricsForCell(ix, iy);

  // Load optional genus record from superchunk asset
  const squareGeneraRec = await getSquareGeneraRecord(ix, iy);
  const genusSummary = summarizeSquareGenera(squareGeneraRec);

  const html = buildRPGPopupHTML({
    ix,
    iy,
    centerLL,
    metrics,
    genusSummary
  });

  showGridWildTopPopup(e.latlng, html);
}

// Enable by default
window.enableGridRPGPopup();

function showGridWildTopPopup(latlng, html) {
  document.getElementById("gwTopPopup")?.remove();

  const p = map.latLngToContainerPoint(latlng);

  const el = document.createElement("div");
  el.id = "gwTopPopup";
  el.className = "gw-top-popup";
  el.innerHTML = `
    <button class="gw-top-popup-close" type="button">&times;</button>
    ${html}
  `;

  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;

  map.getContainer().appendChild(el);

  el.querySelector(".gw-top-popup-close").onclick = () => el.remove();

  function reposition() {
    if (!document.body.contains(el)) {
      map.off("move zoom resize", reposition);
      return;
    }

    const p2 = map.latLngToContainerPoint(latlng);
    el.style.left = `${p2.x}px`;
    el.style.top = `${p2.y}px`;
  }

  map.on("move zoom resize", reposition);
}

// Allow UI SIDEBAR to toggle the heat overlay
window.setHeatVisible = function (visible) {
  window.__gwFilters = window.__gwFilters || {};
  window.__gwFilters.showHeat = !!visible;

  ensureGridHeatCanvas();
  gridHeatCanvas.style.display = visible ? "block" : "none";

  if (!visible && gridHeatCtx) {
    const size = map.getSize();
    gridHeatCtx.clearRect(0, 0, size.x, size.y);
  }

  scheduleGridHeatCanvasRender();
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
//    if (header !== "ix,iy,count,species,observers") {
 //     console.warn(`Unexpected CSV header: ${header}`);
 //   }
    
    const allowedHeaders = new Set([
      "ix,iy,count,species,observers,n_captive",
      "ix,iy,count,n_species,n_observers,n_captive",
      "ix,iy,count,species,observers",
      "ix,iy,count,n_genera,n_observers,n_captive,last_observed,median_last10_observed"
    ]);

    if (!allowedHeaders.has(header)) {
      console.warn(`Unexpected CSV header: ${header}`);
    }

    const columns = header.split(",").map(s => s.trim());
    const col = (...names) => {
      for (const name of names) {
        const i = columns.indexOf(name);
        if (i >= 0) return i;
      }
      return -1;
    };

    const ixCol = col("ix");
    const iyCol = col("iy");
    const countCol = col("count");
    const speciesCol = col("species", "n_species", "n_genera");
    const observersCol = col("observers", "n_observers");
    const captiveCol = col("n_captive");
    const lastObservedCol = col("last_observed");
    const medianLast10Col = col("median_last10_observed");

    const counts = new Map();

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;

      const ix = Number(parts[ixCol]);
      const iy = Number(parts[iyCol]);
      const count = Number(parts[countCol]);
      const species = Number(parts[speciesCol]);
      const observers = Number(parts[observersCol]);
      const n_captive = captiveCol >= 0 ? Number(parts[captiveCol] ?? 0) : 0;
      const last_observed = lastObservedCol >= 0 ? (parts[lastObservedCol] || null) : null;
      const median_last10_observed = medianLast10Col >= 0 ? (parts[medianLast10Col] || null) : null;
      const last_observed_ms = parseGridDateMs(last_observed);
      const median_last10_observed_ms = parseGridDateMs(median_last10_observed);

      if (
        !Number.isFinite(ix) ||
        !Number.isFinite(iy) ||
        !Number.isFinite(count) ||
        !Number.isFinite(species) ||
        !Number.isFinite(observers) ||
        !Number.isFinite(n_captive)
      ) {
        continue;
      }

      counts.set(`${ix},${iy}`, {
        count,
        species,
        observers,
        n_captive,
        last_observed,
        median_last10_observed,
        last_observed_ms,
        median_last10_observed_ms
      });
    }

    window.__staticGridCounts = counts;
    window.GridWildCoarseHeatCache?.invalidate?.();

//    console.log(`Loaded static heatmap cells: ${counts.size}`);

    // updating the static grid heat
    updateStaticGridHeat();

    if (typeof window.updateHudCenterSummary === "function") {
      window.updateHudCenterSummary();
    }

    if (typeof window.updateTopObserversPanel === "function") {
      window.updateTopObserversPanel();
    }

    if (typeof window.updateHudCladogram === "function") {
      window.updateHudCladogram();
    }
  } catch (err) {
    console.error("Failed to load static heat CSV:", err);
  }
}

// more for static assets -- Render precomputed static heatmap
function isWithinFogRadius(ix, iy, cx, cy, radiusCells = 25) {
  return Math.abs(ix - cx) <= radiusCells && Math.abs(iy - cy) <= radiusCells;
}

// render which heat metric?
function getHeatValueForCell(cellMetrics) {
  if (!cellMetrics) return 0;

  const metric = window.__gwState?.heatMetric ?? "count";

  if (metric === "species") return cellMetrics.species || 0;
  if (metric === "observers") return cellMetrics.observers || 0;

  return cellMetrics.count || 0;
}

function isHeatZThresholdEnabled() {
  return window.__gwState?.heatZThresholdEnabled === true;
}

function getHeatZThreshold() {
  const raw = Number(window.__gwState?.heatZThreshold);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-3, Math.min(3, raw));
}

function buildZStats(values) {
  const nums = values
    .map(Number)
    .filter(Number.isFinite);

  if (!nums.length) return null;

  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const variance = nums.reduce((sum, value) => {
    const d = value - mean;
    return sum + d * d;
  }, 0) / nums.length;

  return {
    mean,
    sd: Math.sqrt(variance)
  };
}

function passesHeatZThreshold(value, stats) {
  if (!isHeatZThresholdEnabled() || !stats) return true;

  const threshold = getHeatZThreshold();
  const z = stats.sd > 0 ? ((Number(value) || 0) - stats.mean) / stats.sd : 0;
  return z >= threshold;
}

function collectRegularHeatZStats(counts, startX, endX, startY, endY) {
  const values = [];

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics =
        window.__richGridMetrics?.get(key) ||
        counts.get(key);

      if (!metrics) continue;

      const displayMetrics =
        window.GridWildIconicOverlayFilter?.metricsForCell?.(ix, iy, metrics) ||
        null;

      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue > 0) values.push(heatValue);
    }
  }

  return buildZStats(values);
}

function isCoarseHeatEnabled() {
  return window.__gwState?.coarseHeatEnabled === true;
}

function getCoarseHeatBinSize() {
  const raw = Number(window.__gwState?.coarseHeatBinSize);
  if (!Number.isFinite(raw)) return 8;
  return Math.max(2, Math.min(64, Math.round(raw)));
}

// Coarse heat calculation cache. This is intentionally narrow and removable:
// deleting this object plus the getCachedCoarseMedianMetrics call below returns
// coarse rendering to direct runtime aggregation.
window.GridWildCoarseHeatCache = window.GridWildCoarseHeatCache || (function () {
  const MAX_ENTRIES = 5000;
  let dataVersion = 0;
  let cache = new Map();

  function makeKey(anchorIx, anchorIy, binSize) {
    return `${dataVersion}|${binSize}|${anchorIx}|${anchorIy}`;
  }

  function get(anchorIx, anchorIy, binSize, compute) {
    const key = makeKey(anchorIx, anchorIy, binSize);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    const value = compute();
    cache.set(key, value);

    if (cache.size > MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    return value;
  }

  function invalidate() {
    dataVersion++;
    cache.clear();
  }

  return {
    get,
    invalidate,
    size: () => cache.size
  };
})();

function median(values) {
  const nums = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!nums.length) return 0;

  const mid = Math.floor(nums.length / 2);
  return nums.length % 2
    ? nums[mid]
    : (nums[mid - 1] + nums[mid]) / 2;
}

function getCachedCoarseMedianMetrics(anchorIx, anchorIy, binSize) {
  return window.GridWildCoarseHeatCache?.get?.(
    anchorIx,
    anchorIy,
    binSize,
    () => getCoarseMedianMetrics(anchorIx, anchorIy, binSize)
  ) ?? getCoarseMedianMetrics(anchorIx, anchorIy, binSize);
}

function getCoarseMedianMetrics(anchorIx, anchorIy, binSize) {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map)) return null;

  const centerIx = anchorIx + Math.floor(binSize / 2);
  const centerIy = anchorIy + Math.floor(binSize / 2);
  const radius = Math.max(1, Math.floor(binSize / 2));
  const values = {
    count: [],
    species: [],
    observers: [],
    n_captive: [],
    median_last10_observed_ms: []
  };

  let nActiveSquares = 0;
  let latestLastObservedMs = 0;

  for (let ix = centerIx - radius; ix <= centerIx + radius; ix++) {
    for (let iy = centerIy - radius; iy <= centerIy + radius; iy++) {
      const m = counts.get(`${ix},${iy}`);
      if (!m) continue;

      const count = Number(m.count) || 0;
      const species = Number(m.species) || 0;
      const observers = Number(m.observers) || 0;
      const nCaptive = Number(m.n_captive) || 0;
      const lastObservedMs = Number(m.last_observed_ms) || parseGridDateMs(m.last_observed);
      const medianLast10Ms = Number(m.median_last10_observed_ms) || parseGridDateMs(m.median_last10_observed);

      values.count.push(count);
      values.species.push(species);
      values.observers.push(observers);
      values.n_captive.push(nCaptive);
      if (medianLast10Ms) values.median_last10_observed_ms.push(medianLast10Ms);
      latestLastObservedMs = Math.max(latestLastObservedMs, lastObservedMs || 0);

      if (count > 0) nActiveSquares++;
    }
  }

  if (!values.count.length) {
    return getNearestCoarseMetrics(centerIx, centerIy, binSize);
  }

  return {
    count: median(values.count),
    species: median(values.species),
    observers: median(values.observers),
    n_captive: median(values.n_captive),
    last_observed: gridDateIsoFromMs(latestLastObservedMs),
    median_last10_observed: gridDateIsoFromMs(median(values.median_last10_observed_ms)),
    last_observed_ms: latestLastObservedMs,
    median_last10_observed_ms: median(values.median_last10_observed_ms),
    nSquares: binSize * binSize,
    nActiveSquares
  };
}

function getNearestCoarseMetrics(centerIx, centerIy, binSize) {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map)) return null;

  let best = null;
  let bestDist = Infinity;
  const searchRadius = Math.max(binSize, 4);

  for (let ix = centerIx - searchRadius; ix <= centerIx + searchRadius; ix++) {
    for (let iy = centerIy - searchRadius; iy <= centerIy + searchRadius; iy++) {
      const m = counts.get(`${ix},${iy}`);
      if (!m) continue;

      const d = Math.abs(ix - centerIx) + Math.abs(iy - centerIy);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
  }

  if (!best) return null;

  return {
    count: Number(best.count) || 0,
    species: Number(best.species) || 0,
    observers: Number(best.observers) || 0,
    n_captive: Number(best.n_captive) || 0,
    last_observed: best.last_observed || null,
    median_last10_observed: best.median_last10_observed || null,
    last_observed_ms: Number(best.last_observed_ms) || parseGridDateMs(best.last_observed),
    median_last10_observed_ms: Number(best.median_last10_observed_ms) || parseGridDateMs(best.median_last10_observed),
    nSquares: binSize * binSize,
    nActiveSquares: 1
  };
}

function coarseCellBoundsLL(anchorIx, anchorIy, binSize) {
  const x0 = anchorIx * GRID_SIZE_M;
  const y0 = anchorIy * GRID_SIZE_M;
  const sizeM = binSize * GRID_SIZE_M;

  const sw = map.options.crs.unproject(L.point(x0, y0));
  const ne = map.options.crs.unproject(L.point(x0 + sizeM, y0 + sizeM));
  return { sw, ne };
}


function updateStaticGridHeat() {
  warmRichMetricsForVisibleCells();
  scheduleGridHeatCanvasRender();

  updateImportantGridLines();

  if (window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }
}

function updateStaticGridHeatOLD() {
  gridHeatLayer.clearLayers();

  const shimmerOn = window.__gwState?.showShimmer ?? false;
  if (shimmerOn) {
    gridShimmerLayer.clearLayers();
  } else {
    if (gridShimmerLayer.getLayers().length) gridShimmerLayer.clearLayers();
  }

  const fogOn = window.__gwState?.showFog ?? true;

  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics =
        window.__richGridMetrics?.get(key) ||
        counts.get(key);

      if (!metrics) continue;

      const displayMetrics =
        window.GridWildIconicOverlayFilter?.metricsForCell?.(ix, iy, metrics) ||
        null;

      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;

      const baseStyle = metricsToFill(displayMetrics);
      if (!baseStyle) continue;

      const sw = map.options.crs.unproject(L.point(x, y));
      const ne = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));

      // ------------------------------------------------------------------
      // Three-layer fog logic
      // ------------------------------------------------------------------
      let fogState = null;

      const godsEyeTransientVisible =
      typeof window.isGodsEyeTransientVisibleCell === "function" &&
      window.isGodsEyeTransientVisibleCell(key);

      if (fogOn && window.GridWildFog) {
        fogState = window.GridWildFog.getCellFogState(key);

        // Unknown / expired cells stay hidden unless temporarily visible through God’s Eye.
        if (
          !godsEyeTransientVisible &&
          (fogState.state === "unknown" || fogState.state === "expired")
        ) {
          continue;
        }
      }

      // If no biodiversity heat exists, skip unless fog is doing something
      if (!baseStyle) continue;

      let style = { ...baseStyle };

      // Add eye of god?
      if (godsEyeTransientVisible && fogState?.state !== "documented") {
        style.fillOpacity = Math.max(
          Number(baseStyle.fillOpacity || 0.25),
          0.28
        );
      }

      // Surveyed cells are visible but slightly misted/faded over time
      if (fogOn && fogState?.state === "surveyed") {
        style.fillOpacity = Math.max(
          0.08,
          Number(baseStyle.fillOpacity || 0.25) * fogState.reveal
        );
      }

      // Documented cells get a stronger permanent “known land” treatment
      if (fogOn && fogState?.state === "documented") {
        style.fillOpacity = Math.min(
          0.92,
          Number(baseStyle.fillOpacity || 0.35) + 0.12
        );
      }

      L.rectangle([sw, ne], {
        ...HEAT_TILE_STYLE_BASE,
        ...style
      }).addTo(gridHeatLayer);

      if (shimmerOn) {
        drawShimmerOverlayForCell(sw, ne, displayMetrics);
      }

      // Optional gold outline for documented cells
      if (fogOn && fogState?.state === "documented") {
        L.rectangle([sw, ne], {
          pane: "gridHeatPane",
          interactive: false,
          fill: false,
          color: "rgba(240, 209, 138, 0.72)",
          weight: 1.2,
          opacity: 0.8
        }).addTo(gridHeatLayer);
      }
    }
  }

  if (window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }
}

function updateImportantGridLines() {
  gridLineLayer.clearLayers();

  const center = getCenterFineCell();

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const ix = center.ix + dx;
      const iy = center.iy + dy;

      const { sw, ne } = fineCellBoundsLL(ix, iy);

      L.rectangle([sw, ne], {
        pane: "gridPane",
        interactive: false,
        fill: false,
        color: "rgba(240, 209, 138, 0.70)",
        weight: 1.2,
        opacity: 0.85
      }).addTo(gridLineLayer);
    }
  }

  const { sw, ne } = macroCellBoundsLL(center.ix - 1, center.iy - 1);

  L.rectangle([sw, ne], {
    pane: "gridPane",
    interactive: false,
    fill: false,
    color: "rgba(255, 224, 130, 0.98)",
    weight: 2.4,
    opacity: 0.95
  }).addTo(gridLineLayer);
}

window.testDocumentCurrentCell = function () {
  if (typeof lastFix === "undefined" || !lastFix) {
    console.warn("No GPS fix yet.");
    return;
  }

  const key = window.getCellKeyForLatLng(lastFix.latitude, lastFix.longitude);

  if (window.GridWildFog) {
    window.GridWildFog.markObserved(key, {
      obsCountIncrement: 1,
      speciesCountIncrement: 1
    });
  }

  if (typeof window.updateGrid === "function") {
    window.updateGrid();
  }

  console.log("Documented current cell:", key);
};

function scheduleGridHeatCanvasRender() {
  if (gridHeatRaf) return;
  gridHeatRaf = requestAnimationFrame(renderGridHeatCanvas);
}

function renderGridHeatCanvas() {
  gridHeatRaf = null;

  ensureGridHeatCanvas();
  resizeGridHeatCanvas();

  const size = map.getSize();
  gridHeatCtx.clearRect(0, 0, size.x, size.y);

  const heatOn = window.__gwFilters?.showHeat ?? true;
  if (!heatOn) return;

  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  if (isCoarseHeatEnabled()) {
    const painted = renderCoarseMedianHeatCanvas();
    if (painted > 0) {
      return;
    }

    gridHeatCtx.clearRect(0, 0, size.x, size.y);
    console.warn("Coarse median heat had no drawable bins; falling back to regular heat.");
    window.__gwState.coarseHeatEnabled = false;

    const coarseToggle = document.getElementById("toggleSuperchunkHeat");
    const coarseHudToggle = document.getElementById("toggleSuperchunkHeat_hud");
    if (coarseToggle) coarseToggle.checked = false;
    if (coarseHudToggle) coarseHudToggle.checked = false;
  }

  const fogOn = window.__gwState?.showFog ?? true;
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const heatZStats = isHeatZThresholdEnabled()
    ? collectRegularHeatZStats(counts, startX, endX, startY, endY)
    : null;

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics =
        window.__richGridMetrics?.get(key) ||
        counts.get(key);

      if (!metrics) continue;

      const displayMetrics =
        window.GridWildIconicOverlayFilter?.metricsForCell?.(ix, iy, metrics) ||
        null;

      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;
      if (!passesHeatZThreshold(heatValue, heatZStats)) continue;

      const baseStyle = metricsToFill(displayMetrics);
      if (!baseStyle) continue;

      let fogState = null;

      const godsEyeTransientVisible =
        typeof window.isGodsEyeTransientVisibleCell === "function" &&
        window.isGodsEyeTransientVisibleCell(key);

      if (fogOn && window.GridWildFog) {
        fogState = window.GridWildFog.getCellFogState(key);

        if (
          !godsEyeTransientVisible &&
          (fogState.state === "unknown" || fogState.state === "expired")
        ) {
          continue;
        }
      }

      let fillOpacity = Number(baseStyle.fillOpacity || 0.25);

      if (godsEyeTransientVisible && fogState?.state !== "documented") {
        fillOpacity = Math.max(fillOpacity, 0.28);
      }

      if (fogOn && fogState?.state === "surveyed") {
        fillOpacity = Math.max(0.08, fillOpacity * fogState.reveal);
      }

      if (fogOn && fogState?.state === "documented") {
        fillOpacity = Math.min(0.92, fillOpacity + 0.12);
      }

      const sw = map.options.crs.unproject(L.point(x, y));
      const ne = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));

      const nwPx = gridHeatLayerPoint(L.latLng(ne.lat, sw.lng));
      const sePx = gridHeatLayerPoint(L.latLng(sw.lat, ne.lng));

      const pxX = Math.floor(nwPx.x);
      const pxY = Math.floor(nwPx.y);
      const pxW = Math.ceil(sePx.x - nwPx.x);
      const pxH = Math.ceil(sePx.y - nwPx.y);

      gridHeatCtx.globalAlpha = fillOpacity;
      gridHeatCtx.fillStyle = baseStyle.fillColor || "rgba(90,160,90,1)";
      gridHeatCtx.fillRect(pxX, pxY, Math.max(1, pxW), Math.max(1, pxH));

      if (fogOn && fogState?.state === "documented") {
        gridHeatCtx.globalAlpha = 0.8;
        gridHeatCtx.strokeStyle = "rgba(240, 209, 138, 0.72)";
        gridHeatCtx.lineWidth = 1.2;
        gridHeatCtx.strokeRect(pxX, pxY, Math.max(1, pxW), Math.max(1, pxH));
      }
    }
  }

  gridHeatCtx.globalAlpha = 1;
}

function renderCoarseMedianHeatCanvas() {
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const binSize = getCoarseHeatBinSize();
  const binSizeM = binSize * GRID_SIZE_M;
  const startAnchorX = Math.floor(startX / binSizeM) * binSize;
  const endAnchorX = Math.floor((endX - GRID_SIZE_M) / binSizeM) * binSize;
  const startAnchorY = Math.floor(startY / binSizeM) * binSize;
  const endAnchorY = Math.floor((endY - GRID_SIZE_M) / binSizeM) * binSize;
  let painted = 0;
  const items = [];

  for (let ix = startAnchorX; ix <= endAnchorX; ix += binSize) {
    for (let iy = startAnchorY; iy <= endAnchorY; iy += binSize) {
      const metrics = getCachedCoarseMedianMetrics(ix, iy, binSize);
      if (!metrics) continue;

      const heatValue = getHeatValueForCell(metrics);
      if (heatValue <= 0) continue;

      items.push({ ix, iy, metrics, heatValue });
    }
  }

  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(items.map(item => item.heatValue))
    : null;

  for (const item of items) {
      const { ix, iy, metrics, heatValue } = item;
      if (!passesHeatZThreshold(heatValue, heatZStats)) continue;

      const baseStyle = metricsToFill(metrics);
      if (!baseStyle) continue;

      const { sw, ne } = coarseCellBoundsLL(ix, iy, binSize);
      const nwPx = gridHeatLayerPoint(L.latLng(ne.lat, sw.lng));
      const sePx = gridHeatLayerPoint(L.latLng(sw.lat, ne.lng));

      const pxX = Math.floor(nwPx.x);
      const pxY = Math.floor(nwPx.y);
      const pxW = Math.ceil(sePx.x - nwPx.x);
      const pxH = Math.ceil(sePx.y - nwPx.y);

      gridHeatCtx.globalAlpha = Math.min(0.82, Number(baseStyle.fillOpacity || 0.25));
      gridHeatCtx.fillStyle = baseStyle.fillColor || "rgba(90,160,90,1)";
      gridHeatCtx.fillRect(pxX - 1, pxY - 1, Math.max(1, pxW + 2), Math.max(1, pxH + 2));
      painted++;
  }

  gridHeatCtx.globalAlpha = 1;
  return painted;
}

function latLngToDisplayCellKey(lat, lng) {
  const p = map.options.crs.project(L.latLng(lat, lng));
  const ix = Math.floor(p.x / GRID_SIZE_M);
  const iy = Math.floor(p.y / GRID_SIZE_M);
  return `${ix},${iy}`;
}

function latLngToStaticChunkKey(lat, lng) {
  const chunkSize = window.__gwState?.staticChunkSizeM ?? 500;
  const p = map.options.crs.project(L.latLng(lat, lng));
  const cx = Math.floor(p.x / chunkSize);
  const cy = Math.floor(p.y / chunkSize);
  return `${cx},${cy}`;
}

function staticChunkUrlFromKey(chunkKey) {
  return `assets/chunks/${chunkKey}.csv`;
}

function buzzOnNewSquare() {
  if (!("vibrate" in navigator)) return;
  // Short, subtle buzz. You can also use [20, 30, 20] for a double tap.
  navigator.vibrate(35);
}


window.handleUserPositionUpdate = async function(lat, lng, force = false) {
  const cellKey = latLngToDisplayCellKey(lat, lng);

  const state = window.__gwState || {};
  const now = Date.now();

  const suspendUntil = state.suspendAutoCenterUntil ?? 0;

  const autoCenterAllowed =
    state.lockToLocation === true &&
    suspendUntil !== Number.POSITIVE_INFINITY &&
    now >= suspendUntil;

  const enteredNewCell = force || (cellKey !== state.lastUserCellKey);
  state.lastUserCellKey = cellKey;

  if (enteredNewCell && window.GridWildFog) {
    window.GridWildFog.markVisited(cellKey);
  }

  if (enteredNewCell && window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }

  if (autoCenterAllowed) {
    const targetZoom = state.lockZoom ?? 19;
    const currentZoom = map.getZoom();
    const userLatLng = [lat, lng];

    const center = map.getCenter();
    const centerDistM = center.distanceTo(userLatLng);

    // When lock is enabled, always follow.
    // If zoom has drifted, restore the lock zoom.
    if (Math.abs(currentZoom - targetZoom) > 0.05) {
      map.setView(userLatLng, targetZoom, { animate: true });
    } else if (force || centerDistM > 2) {
      map.panTo(userLatLng, { animate: true });
    }
  }


// Buzz when entering a new cell, even if auto-centering is off
//  const previousCellKey = state.lastUserCellKey;
 // const movedToNewCell = previousCellKey && cellKey !== previousCellKey;
 // const enteredNewCell = force || (cellKey !== state.lastUserCellKey);
 // state.lastUserCellKey = cellKey;

//  if (movedToNewCell) {
 //   buzzOnNewSquare();
 // }


  // Update grid and related UI if we entered a new cell

  if (enteredNewCell) {
    updateStaticGridHeat();
    updateGridLines();

    if (typeof window.updateHudCenterSummary === "function") {
      window.updateHudCenterSummary();
    }
    
    if (typeof window.updateTopObserversPanel === "function") {
      window.updateTopObserversPanel();
    }
    if (typeof window.updateHudCladogram === "function") {
      window.updateHudCladogram();
    }

    if (typeof window.maybeRefreshDynamicINat === "function") {
      window.maybeRefreshDynamicINat(false, cellKey);
    }
  }

};

function getCenterMacroBoundsForCurrentLocation() {
  const { ix0, iy0 } = getCenterMacroAnchor();
  const { sw, ne } = macroCellBoundsLL(ix0, iy0);
  return L.latLngBounds(sw, ne);
}

function getStickyZoomTarget() {
  const bounds = getCenterMacroBoundsForCurrentLocation();

  // Fit so the macro square spans the screen width as closely as Leaflet allows
  return map.getBoundsZoom(bounds, false);
}

function applyStickyZoom(force = false) {
  const state = window.__gwState || {};
  if (!state.stickyZoomEnabled) return;

  const targetZoom = getStickyZoomTarget();
  const currentZoom = map.getZoom();
  const tol = state.stickyZoomTolerance ?? 0.35;

  if (!force && Math.abs(currentZoom - targetZoom) > tol) return;
  if (Math.abs(currentZoom - targetZoom) < 0.001) return;

  state.stickyZoomAnimating = true;
  map.setZoom(targetZoom, { animate: true });

  setTimeout(() => {
    state.stickyZoomAnimating = false;
  }, 250);
}

// add sticky zoom enable
map.on("zoomend", applyStickyZoom);

function parseViewBox(svg) {
  const vb = (svg.getAttribute("viewBox") || "0 0 260 280").trim().split(/\s+/).map(Number);
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
}

function setCurrentCladoViewBox(vb) {
  window.__gwCladoState.currentViewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

function clampCladoViewBox(vb, baseW, baseH) {
  // ------------------------------------------------------------
  // Zoom limits
  // ------------------------------------------------------------
  vb.w = Math.max(baseW * 0.18, Math.min(baseW, vb.w));
  vb.h = Math.max(baseH * 0.18, Math.min(baseH, vb.h));

  // ------------------------------------------------------------
  // Extra pan margin so you can reach edge labels / strokes
  // Give MUCH more room at the bottom so the leaf tips/labels
  // can be dragged fully into view.
  // ------------------------------------------------------------
  const padLeft   = Math.max(18, baseW * 0.10);
  const padRight  = Math.max(24, baseW * 0.16);
  const padTop    = Math.max(18, baseH * 0.10);
  //const padBottom = Math.max(150, baseH * 0.88);   // <- bigger bottom allowance
  const padBottom = Math.max(10, baseH * 0.1);   // <- bigger bottom allowance

  const minX = -padLeft;
  const maxX = baseW - vb.w + padRight;

  const minY = -padTop;
  const maxY = baseH - vb.h + padBottom;

  vb.x = Math.max(minX, Math.min(maxX, vb.x));
  vb.y = Math.max(minY, Math.min(maxY, vb.y));

  return vb;
}

function clientToSvgCoords(svg, clientX, clientY, vb) {
  const rect = svg.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  return {
    x: vb.x + px * vb.w,
    y: vb.y + py * vb.h
  };
}
