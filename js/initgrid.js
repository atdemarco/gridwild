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
  return getCurrentUserFineCell();
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
let gridHeatPendingRenderOptions = null;
let gridHeatThrottleTimer = null;
let gridHeatLastRenderAt = 0;
let gridHeatRenderAttempt = 0;
let gridHeatLastRenderState = null;
let gridHeatCanvasTopLeft = L.point(0, 0);
let gridHeatCanvasLayout = null;
let gridHeatMeterTransform = null;
const gridHeatMotionState = {
  active: false,
  type: null,
  startedAt: 0,
  settledAt: 0,
  frozenAutoBinSize: null,
  frozenEffectiveBinSize: null,
  frozenPMTilesHeatZoom: null,
  frozenPMTilesFineZ19: null,
  skipNextUntypedRender: false
};
const coarseHeatAutoState = {
  binSize: 0,
  mapZoom: null,
  changedAt: 0
};
const GRID_HEAT_INTERACTION_RENDER_INTERVAL_MS = 80;
const GRID_HEAT_STALE_FRAME_MAX_MS = 9000;
const COARSE_HEAT_AUTO_SCALE_PX = 118;
const COARSE_HEAT_AUTO_HYSTERESIS_ZOOM_DELTA = 0.18;
const COARSE_HEAT_AUTO_BIN_SIZES = [4, 8, 16, 32, 64];
const COARSE_HEAT_AUTO_STEPS = [
  { scaleFt: 42240, binSize: 64 },
  { scaleFt: 21120, binSize: 32 },
  { scaleFt: 10560, binSize: 16 },
  { scaleFt: 5280, binSize: 8 },
  { maxZoomMultiplier: 0.06, binSize: 10 },
  { maxZoomMultiplier: 0.13, binSize: 8 },
  { maxZoomMultiplier: 0.25, binSize: 6 },
  { maxZoomMultiplier: 0.5, binSize: 8 },
  { scaleFt: 1320, binSize: 4 },
  { scaleFt: 200, binSize: 2 }
];
const COARSE_HEAT_TILE_BINS = 32;
const COARSE_HEAT_TILE_CACHE_MAX = 96;
const COARSE_HEAT_TILE_MAX_PX = 1200;
const COARSE_HEAT_TILE_ZOOM_BUCKET = 0.5;
const COARSE_HEAT_SOURCE_LOOKUP_CACHE_MAX = 50000;
const COARSE_HEAT_RENDER_BIN_BUDGET = 64000;
const COARSE_HEAT_RENDER_TILE_BUDGET = 160;
const COARSE_HEAT_BIN_PIXEL_OVERLAP = 0;
const COARSE_HEAT_RICH_VIEW_CELL_BUDGET = 700;
const COARSE_HEAT_RICH_VIEW_SUPERCHUNK_BUDGET = 32;
const COARSE_HEAT_RICH_SUPERCHUNK_CONCURRENCY = 4;
const METADATA_FILTER_HEAT_SUPERCHUNK_BUDGET = 32;
const METADATA_FILTER_HEAT_CELL_BUDGET = 80000;
const COARSE_PYRAMID_NEW_TILE_BUDGET = 8;
const COARSE_DATA_VERSION_DEBOUNCE_MS = 360;
const COARSE_DATA_VERSION_MAX_WAIT_MS = 1200;
const PMTILES_HEAT_MODULE_URLS = {
  pmtiles: "/vendor/pmtiles/pmtiles-3.2.1.esm.js",
  vectorTile: "/vendor/pmtiles/vector-tile-1.3.1.esm.js",
  pbf: "/vendor/pmtiles/pbf-3.3.0.esm.js"
};
const PMTILES_HEAT_TILE_CACHE_MAX = 256;
const PMTILES_HEAT_TILE_BUDGET = 72;
const PMTILES_HEAT_TILE_PAD_RATIO = 0.25;
const PMTILES_HEAT_FINE_Z19_MIN_MULTIPLIER = 2.75;
const PMTILES_HEAT_FINE_Z19_TILE_BUDGET = 192;
const PMTILES_HEAT_FINE_Z19_NEW_TILE_BUDGET = 96;
const PMTILES_HEAT_STARTUP_GRACE_MS = 12000;
const PMTILES_HEAT_NEW_TILE_BUDGET = 8;
const PMTILES_HEAT_FEATURE_BUDGET = 45000;
const PMTILES_FINE_METRIC_CACHE_MAX = 80000;
const COARSE_PMTILES_TILE_CACHE_MAX = 160;
const COARSE_PMTILES_TILE_BUDGET = 96;
const COARSE_PMTILES_NEW_TILE_BUDGET = 36;
const COARSE_PMTILES_FEATURE_BUDGET = 65000;
const FEET_PER_METER = 3.280839895;
const GRIDWILD_BOOT_STARTED_AT = performance.now();

window.GridWildCanvasPerf = (function (existing = {}) {
  const DEFAULT_BUFFER_PX = 128;
  const MOBILE_BUFFER_PX = 96;
  const MAX_PADDED_AREA_RATIO = 1.65;
  const ROTATED_MAX_PADDED_AREA_RATIO = 2.5;
  const ROTATED_OVERSCAN_GUARD_PX = 18;
  const BUFFER_EDGE_PX = 16;

  function isMobileLike() {
    return window.matchMedia?.("(max-width: 700px), (pointer: coarse)")?.matches === true;
  }

  function getDpr(label = "canvas") {
    const nativeDpr = window.devicePixelRatio || 1;
    const configuredCap = Number(window.__gwState?.canvasDprCap);
    const cap =
      Number.isFinite(configuredCap) && configuredCap > 0
        ? configuredCap
        : isMobileLike()
          ? 1.5
          : nativeDpr;

    return Math.max(1, Math.min(nativeDpr, cap));
  }

  function currentMapBearingDeg() {
    const stateBearing = Number(window.GridWildCompass?.getState?.()?.cameraBearing);
    if (Number.isFinite(stateBearing)) return stateBearing;
    const debugBearing = Number(window.__gwCompassMapBearing);
    return Number.isFinite(debugBearing) ? debugBearing : 0;
  }

  function normalizeHalfTurnDeg(deg) {
    const n = Math.abs(((Number(deg) || 0) % 180 + 180) % 180);
    return n > 90 ? 180 - n : n;
  }

  function rotatedViewportPadding(viewport = map.getSize(), bearingDeg = currentMapBearingDeg()) {
    const angleDeg = normalizeHalfTurnDeg(bearingDeg);
    if (angleDeg < 0.5) return { x: 0, y: 0, active: false };

    const width = Math.max(1, Number(viewport?.x) || 1);
    const height = Math.max(1, Number(viewport?.y) || 1);
    const theta = (angleDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const rotatedWidth = width * cos + height * sin;
    const rotatedHeight = width * sin + height * cos;

    return {
      x: Math.max(0, (rotatedWidth - width) / 2 + ROTATED_OVERSCAN_GUARD_PX),
      y: Math.max(0, (rotatedHeight - height) / 2 + ROTATED_OVERSCAN_GUARD_PX),
      active: true
    };
  }

  function fitBufferPadding(width, height, targetX, targetY, maxAreaRatio) {
    const maxArea = width * height * maxAreaRatio;
    if ((width + targetX * 2) * (height + targetY * 2) <= maxArea) {
      return { x: targetX, y: targetY };
    }

    let low = 0;
    let high = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) / 2;
      const x = targetX * mid;
      const y = targetY * mid;
      const area = (width + x * 2) * (height + y * 2);
      if (area <= maxArea) low = mid;
      else high = mid;
    }

    return {
      x: targetX * low,
      y: targetY * low
    };
  }

  function getBufferPaddingPx(requestedPx, viewport = map.getSize()) {
    const requested = Number(requestedPx);
    const preferred =
      Number.isFinite(requested) && requested >= 0
        ? requested
        : isMobileLike()
          ? MOBILE_BUFFER_PX
          : DEFAULT_BUFFER_PX;
    const width = Math.max(1, Number(viewport?.x) || 1);
    const height = Math.max(1, Number(viewport?.y) || 1);
    const rotated = rotatedViewportPadding(viewport);
    const targetX = Math.max(preferred, rotated.x);
    const targetY = Math.max(preferred, rotated.y);
    const maxAreaRatio = rotated.active ? ROTATED_MAX_PADDED_AREA_RATIO : MAX_PADDED_AREA_RATIO;
    const fitted = fitBufferPadding(width, height, targetX, targetY, maxAreaRatio);

    return {
      x: Math.max(0, Math.floor(fitted.x)),
      y: Math.max(0, Math.floor(fitted.y)),
      max: Math.max(0, Math.floor(Math.max(fitted.x, fitted.y)))
    };
  }

  function getBufferPx(requestedPx, viewport = map.getSize()) {
    return getBufferPaddingPx(requestedPx, viewport).max;
  }

  function layoutPaddedCanvas(canvas, ctx, label = "canvas", options = {}) {
    const viewport = map.getSize();
    const padding = getBufferPaddingPx(options.bufferPx, viewport);
    const width = Math.max(1, Math.round(viewport.x + padding.x * 2));
    const height = Math.max(1, Math.round(viewport.y + padding.y * 2));
    const topLeft = map.containerPointToLayerPoint([-padding.x, -padding.y]);
    const dpr = getDpr(label);
    const wantW = Math.round(width * dpr);
    const wantH = Math.round(height * dpr);

    L.DomUtil.setPosition(canvas, topLeft);

    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return {
      topLeft,
      width,
      height,
      bufferPx: padding.max,
      bufferX: padding.x,
      bufferY: padding.y,
      viewportWidth: viewport.x,
      viewportHeight: viewport.y,
      zoom: map.getZoom()
    };
  }

  function canvasCoversViewport(layout, edgePx = BUFFER_EDGE_PX) {
    if (!layout || layout.zoom !== map.getZoom()) return false;

    const viewport = map.getSize();
    if (layout.viewportWidth !== viewport.x || layout.viewportHeight !== viewport.y) {
      return false;
    }

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    const bottomRight = map.containerPointToLayerPoint(viewport);
    const edgeX = Math.max(
      0,
      Math.min(Number(layout.bufferX ?? layout.bufferPx) || 0, Number(edgePx) || 0)
    );
    const edgeY = Math.max(
      0,
      Math.min(Number(layout.bufferY ?? layout.bufferPx) || 0, Number(edgePx) || 0)
    );

    return (
      topLeft.x >= layout.topLeft.x + edgeX &&
      topLeft.y >= layout.topLeft.y + edgeY &&
      bottomRight.x <= layout.topLeft.x + layout.width - edgeX &&
      bottomRight.y <= layout.topLeft.y + layout.height - edgeY
    );
  }

  return {
    ...existing,
    getDpr,
    isMobileLike,
    getBufferPx,
    getBufferPaddingPx,
    layoutPaddedCanvas,
    canvasCoversViewport
  };
})(window.GridWildCanvasPerf);

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

function gridHeatLayerPoint(latlng) {
  return map.latLngToLayerPoint(latlng).subtract(gridHeatCanvasTopLeft);
}

function updateGridHeatMeterTransform() {
  const crs = map.options?.crs;
  const transform = crs?.transformation;
  const scale = crs?.scale?.(map.getZoom());
  const pixelOrigin = map.getPixelOrigin?.();
  const values =
    transform && Number.isFinite(scale) && pixelOrigin
      ? {
          a: Number(transform._a),
          b: Number(transform._b),
          c: Number(transform._c),
          d: Number(transform._d),
          scale,
          originX: pixelOrigin.x + gridHeatCanvasTopLeft.x,
          originY: pixelOrigin.y + gridHeatCanvasTopLeft.y
        }
      : null;

  gridHeatMeterTransform =
    values &&
    Number.isFinite(values.a) &&
    Number.isFinite(values.b) &&
    Number.isFinite(values.c) &&
    Number.isFinite(values.d)
      ? values
      : null;
}

function gridHeatPointForMeters(x, y) {
  const t = gridHeatMeterTransform;
  if (t) {
    return {
      x: t.scale * (t.a * x + t.b) - t.originX,
      y: t.scale * (t.c * y + t.d) - t.originY
    };
  }

  return gridHeatLayerPoint(map.options.crs.unproject(L.point(x, y)));
}

function resizeGridHeatCanvas() {
  ensureGridHeatCanvas();
  gridHeatCanvasLayout = window.GridWildCanvasPerf.layoutPaddedCanvas(
    gridHeatCanvas,
    gridHeatCtx,
    "heat"
  );
  gridHeatCanvasTopLeft = gridHeatCanvasLayout.topLeft;
  updateGridHeatMeterTransform();
}

function copyGridHeatCanvasLayout(layout = gridHeatCanvasLayout) {
  if (!layout) return null;
  return {
    topLeft: {
      x: Number(layout.topLeft?.x) || 0,
      y: Number(layout.topLeft?.y) || 0
    },
    width: Number(layout.width) || 0,
    height: Number(layout.height) || 0,
    viewportWidth: Number(layout.viewportWidth) || 0,
    viewportHeight: Number(layout.viewportHeight) || 0,
    zoom: Number(layout.zoom)
  };
}

function captureGridHeatStaleFrame() {
  if (!gridHeatCanvas || !gridHeatCanvas.width || !gridHeatCanvas.height) return null;
  if (gridHeatCanvas.style.display === "none") return null;

  const priorPainted = Number(gridHeatLastRenderState?.painted) || 0;
  const canCarryFrame = priorPainted > 0 || gridHeatLastRenderState?.staleFrameRestored === true;
  if (!canCarryFrame) return null;

  const frame = document.createElement("canvas");
  frame.width = gridHeatCanvas.width;
  frame.height = gridHeatCanvas.height;
  const frameCtx = frame.getContext("2d");
  if (!frameCtx) return null;

  frameCtx.drawImage(gridHeatCanvas, 0, 0);
  return {
    canvas: frame,
    width: frame.width,
    height: frame.height,
    capturedAt: Date.now(),
    layout: copyGridHeatCanvasLayout(),
    previousStatus: gridHeatLastRenderState?.status || null,
    previousPainted: priorPainted
  };
}

function restoreGridHeatStaleFrame(frame, reason) {
  if (!frame || !gridHeatCanvas || !gridHeatCtx) return false;
  if (Date.now() - frame.capturedAt > GRID_HEAT_STALE_FRAME_MAX_MS) return false;
  if (!gridHeatCanvas.width || !gridHeatCanvas.height) return false;

  const currentLayout = copyGridHeatCanvasLayout();
  let dx = 0;
  let dy = 0;
  let dw = gridHeatCanvas.width;
  let dh = gridHeatCanvas.height;

  if (frame.layout && currentLayout) {
    if (frame.layout.zoom !== currentLayout.zoom) return false;

    const dprX = currentLayout.width > 0 ? gridHeatCanvas.width / currentLayout.width : 1;
    const dprY = currentLayout.height > 0 ? gridHeatCanvas.height / currentLayout.height : 1;
    dx = Math.round((frame.layout.topLeft.x - currentLayout.topLeft.x) * dprX);
    dy = Math.round((frame.layout.topLeft.y - currentLayout.topLeft.y) * dprY);
    dw = Math.round(frame.layout.width * dprX);
    dh = Math.round(frame.layout.height * dprY);

    const overlaps =
      dx < gridHeatCanvas.width && dy < gridHeatCanvas.height && dx + dw > 0 && dy + dh > 0;
    if (!overlaps) return false;
  }

  gridHeatCtx.save();
  gridHeatCtx.setTransform(1, 0, 0, 1, 0, 0);
  gridHeatCtx.clearRect(0, 0, gridHeatCanvas.width, gridHeatCanvas.height);
  gridHeatCtx.drawImage(frame.canvas, 0, 0, frame.width, frame.height, dx, dy, dw, dh);
  gridHeatCtx.restore();

  if (gridHeatLastRenderState) {
    gridHeatLastRenderState.staleFrameRestored = true;
    gridHeatLastRenderState.staleFrameReason = reason;
    gridHeatLastRenderState.staleFramePreviousStatus = frame.previousStatus;
    gridHeatLastRenderState.staleFrameAgeMs = Date.now() - frame.capturedAt;
    gridHeatLastRenderState.staleFrameOffset = { dx, dy, dw, dh };
  }

  return true;
}

function isGridHeatPendingOutcome(outcome) {
  return ["pending", "overBudget", "missing", "unavailable"].includes(outcome?.status);
}

window.setShimmerVisible = function (show = true) {
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
  if (frac < 0.2) return null;

  if (frac < 0.4) {
    return {
      tileSizePx: 18,
      streakWidthPx: 1.0,
      overlayOpacity: 0.16,
      strokeA: "rgba(255,255,255,0.34)",
      strokeB: "rgba(255,255,255,0.12)"
    };
  }

  if (frac < 0.7) {
    return {
      tileSizePx: 16,
      streakWidthPx: 1.15,
      overlayOpacity: 0.4,
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

function getMapCenterFineCell() {
  const c = map.getCenter();
  const p = map.options.crs.project(c);
  return {
    ix: Math.floor(p.x / GRID_SIZE_M),
    iy: Math.floor(p.y / GRID_SIZE_M)
  };
}

function getCenterFineCell() {
  if (window.__gwState?.lockToLocation === true) {
    return getCurrentUserFineCell() || getMapCenterFineCell();
  }

  return getMapCenterFineCell();
}

function getCurrentUserFineCell() {
  const loc =
    window.__gwLastUserLocation ||
    (typeof lastFix !== "undefined" && lastFix
      ? { lat: lastFix.latitude, lng: lastFix.longitude }
      : null);
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = map.options.crs.project(L.latLng(lat, lng));
  return {
    ix: Math.floor(p.x / GRID_SIZE_M),
    iy: Math.floor(p.y / GRID_SIZE_M)
  };
}

function getVisualGridFineCell() {
  if (window.__gwState?.lockToLocation === true) {
    return getCurrentUserFineCell() || getCenterFineCell();
  }

  return getCenterFineCell();
}

function getCenterMacroAnchor() {
  const { ix, iy } = getCenterFineCell();

  // Anchor the macro block so the user’s current fine cell is the middle of a 3x3 block
  return {
    ix0: ix - 1,
    iy0: iy - 1
  };
}

function getVisualGridMacroAnchor() {
  const { ix, iy } = getVisualGridFineCell();
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
  const ne = map.options.crs.unproject(L.point(x0 + CENTER_MACRO_SIZE_M, y0 + CENTER_MACRO_SIZE_M));
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
const AVATAR_TRANSIENT_RADIUS_CELLS = GODS_EYE_TRANSIENT_RADIUS_CELLS;
const AVATAR_HALO_BLEND_RADIUS_CELLS = 2;
const AVATAR_HALO_MIN_REVEAL_STRENGTH = 0.16;
const GODS_EYE_BLAST_EXPAND_MS = 500;
const GODS_EYE_BLAST_HOLD_MS = 3000;
const GODS_EYE_BLAST_COLLAPSE_MS = 500;
const GODS_EYE_BLAST_DURATION_MS =
  GODS_EYE_BLAST_EXPAND_MS + GODS_EYE_BLAST_HOLD_MS + GODS_EYE_BLAST_COLLAPSE_MS;
const GODS_EYE_BLAST_MAX_RADIUS_CELLS = 18;
let godsEyeBlastRaf = null;

function parseCellKey(key) {
  const parts = String(key).split(",");
  if (parts.length !== 2) return false;

  const ix = Number(parts[0]);
  const iy = Number(parts[1]);
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return false;

  return { ix, iy };
}

function isCellWithinRadius(cell, center, radiusCells) {
  if (!cell || !center) return false;

  const dx = cell.ix - center.ix;
  const dy = cell.iy - center.iy;

  return Math.sqrt(dx * dx + dy * dy) <= radiusCells;
}

function smoothStep(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return x * x * (3 - 2 * x);
}

function getGodsEyeBlastState(now = Date.now()) {
  const pulse = window.__gwState?.godsEyeBlastPulse;
  if (!pulse?.startedAt || !pulse?.center) return null;

  const elapsed = now - pulse.startedAt;
  const duration = Number(pulse.durationMs || GODS_EYE_BLAST_DURATION_MS);
  if (elapsed < 0 || elapsed > duration) return null;

  const expandMs = Number(pulse.expandMs || GODS_EYE_BLAST_EXPAND_MS);
  const holdMs = Number(pulse.holdMs || GODS_EYE_BLAST_HOLD_MS);
  const collapseMs = Number(pulse.collapseMs || GODS_EYE_BLAST_COLLAPSE_MS);
  const phase =
    elapsed <= expandMs
      ? smoothStep(elapsed / expandMs)
      : elapsed <= expandMs + holdMs
        ? 1
        : smoothStep((duration - elapsed) / collapseMs);

  const maxRadius = Number(pulse.maxRadiusCells || GODS_EYE_BLAST_MAX_RADIUS_CELLS);
  return {
    center: pulse.center,
    radius: Math.max(0, maxRadius * phase),
    strength: phase
  };
}

function getGodsEyeBlastRevealStrength(key, now = Date.now()) {
  const cell = parseCellKey(key);
  const blast = getGodsEyeBlastState(now);
  if (!cell || !blast || blast.radius <= 0) return 0;

  const dx = cell.ix - blast.center.ix;
  const dy = cell.iy - blast.center.iy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > blast.radius) return 0;

  const edgeFalloff = 1 - Math.max(0, dist - blast.radius + 2) / 2;
  return Math.max(0.18, Math.min(1, blast.strength * Math.max(0.35, edgeFalloff)));
}

function isGodsEyeTransientVisibleCell(key) {
  if (!window.__gwState?.godsEyeEnabled) return false;

  const cell = parseCellKey(key);
  if (!cell) return false;

  const center = getCenterFineCell();
  return isCellWithinRadius(cell, center, GODS_EYE_TRANSIENT_RADIUS_CELLS);
}

function isAvatarTransientVisibleCell(key) {
  const cell = parseCellKey(key);
  if (!cell) return false;

  const center = getCurrentUserCellIndices();
  return isCellWithinRadius(cell, center, AVATAR_TRANSIENT_RADIUS_CELLS);
}

function getAvatarTransientRevealStrength(key) {
  const cell = parseCellKey(key);
  if (!cell) return 0;

  const center = getCurrentUserCellIndices();
  if (!center) return 0;

  const dx = cell.ix - center.ix;
  const dy = cell.iy - center.iy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radius = Number(window.__gwState?.avatarRevealRadiusCells ?? AVATAR_TRANSIENT_RADIUS_CELLS);
  const blendRadius = Math.max(
    0,
    Number(window.__gwState?.avatarHaloBlendRadiusCells ?? AVATAR_HALO_BLEND_RADIUS_CELLS)
  );

  if (dist <= radius) return 1;
  if (blendRadius <= 0 || dist > radius + blendRadius) return 0;

  const minStrength = Math.max(
    0,
    Math.min(
      1,
      Number(window.__gwState?.avatarHaloMinRevealStrength ?? AVATAR_HALO_MIN_REVEAL_STRENGTH)
    )
  );
  const edgeT = smoothStep((dist - radius) / blendRadius);

  return minStrength + (1 - minStrength) * (1 - edgeT);
}

function isGridWildTransientVisibleCell(key) {
  return isAvatarTransientVisibleCell(key) || isGodsEyeTransientVisibleCell(key);
}

function getGridWildTransientRevealStrength(key, now = Date.now()) {
  if (isGodsEyeTransientVisibleCell(key)) return 1;

  return Math.max(getAvatarTransientRevealStrength(key), getGodsEyeBlastRevealStrength(key, now));
}

function isGridWildTransientRevealCell(key, now = Date.now()) {
  return getGridWildTransientRevealStrength(key, now) > 0;
}

function triggerGodsEyeBlast() {
  window.__gwState = window.__gwState || {};
  window.__gwState.godsEyeBlastPulse = {
    startedAt: Date.now(),
    durationMs: GODS_EYE_BLAST_DURATION_MS,
    expandMs: GODS_EYE_BLAST_EXPAND_MS,
    holdMs: GODS_EYE_BLAST_HOLD_MS,
    collapseMs: GODS_EYE_BLAST_COLLAPSE_MS,
    maxRadiusCells: GODS_EYE_BLAST_MAX_RADIUS_CELLS,
    center: getCenterFineCell()
  };

  if (godsEyeBlastRaf) cancelAnimationFrame(godsEyeBlastRaf);

  const tick = () => {
    const active = !!getGodsEyeBlastState(Date.now());

    window.GridWildFogCanvas?.scheduleRender?.();
    if (typeof window.updateGrid === "function") window.updateGrid();

    if (active) {
      godsEyeBlastRaf = requestAnimationFrame(tick);
    } else {
      godsEyeBlastRaf = null;
      window.__gwState.godsEyeBlastPulse = null;
      window.GridWildFogCanvas?.scheduleRender?.();
      if (typeof window.updateGrid === "function") window.updateGrid();
    }
  };

  tick();
}

window.isGodsEyeTransientVisibleCell = isGodsEyeTransientVisibleCell;
window.isAvatarTransientVisibleCell = isAvatarTransientVisibleCell;
window.getAvatarTransientRevealStrength = getAvatarTransientRevealStrength;
window.isGridWildTransientVisibleCell = isGridWildTransientVisibleCell;
window.getGridWildTransientRevealStrength = getGridWildTransientRevealStrength;
window.isGridWildTransientRevealCell = isGridWildTransientRevealCell;
window.triggerGodsEyeBlast = triggerGodsEyeBlast;

function timeGridWildVerbose(label, fn, detail = null) {
  const timer = window.GridWildVerboseConsole;
  return timer?.time ? timer.time(label, fn, detail) : fn();
}

function markCenterMacroVisitedByGodsEye(force = false) {
  return timeGridWildVerbose("markCenterMacroVisitedByGodsEye", () => {
    const state = window.__gwState || {};
    if (!state.godsEyeEnabled) return;
    if (!window.GridWildFog || typeof window.GridWildFog.markVisited !== "function") return;

    const center = getCenterFineCell();
    const centerKey = `${center.ix},${center.iy}`;

    if (!force && state.lastGodsEyeCenterKey === centerKey) return;

    state.lastGodsEyeCenterKey = centerKey;

    const timestamp = Date.now();
    const keys = getCenterMacroCellKeys();

    const markKeys = () => {
      keys.forEach((key) => {
        window.GridWildFog.markVisited(key, timestamp);
      });
    };

    if (typeof window.GridWildFog.batchUpdates === "function") {
      window.GridWildFog.batchUpdates(markKeys);
    } else {
      markKeys();
    }

    if (window.GridWildFogCanvas) {
      window.GridWildFogCanvas.scheduleRender();
    }

    if (typeof window.updateGrid === "function") {
      window.updateGrid();
    }

    if (typeof window.refreshGridWildMobileInfo === "function") {
      window.refreshGridWildMobileInfo();
    }
  });
}

window.markCenterMacroVisitedByGodsEye = markCenterMacroVisitedByGodsEye;

function summarizeCenterMacroSquare() {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || (counts.size === 0 && !window.GridWildPyriteLake?.hasData?.())) {
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

    const [ix, iy] = key.split(",").map(Number);
    const m =
      Number.isFinite(ix) && Number.isFinite(iy)
        ? getDisplayMetricsForCell(ix, iy, counts.get(key) || null)
        : counts.get(key);
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
  const speciesDensity = sumObs > 0 ? sumSpecies / sumObs : 0;
  //const discoveryScore = sumSpecies / (sumObservers + 1);
  const discoveryScore = sumSpecies / Math.max(1, sumObservers); // smooth

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

window.GridWildGrid =
  window.GridWildGrid ||
  (function () {
    function latLngToCell(latlng) {
      const ll = Array.isArray(latlng) ? L.latLng(latlng[0], latlng[1]) : L.latLng(latlng);
      const p = map.options.crs.project(ll);
      return {
        ix: Math.floor(p.x / GRID_SIZE_M),
        iy: Math.floor(p.y / GRID_SIZE_M)
      };
    }

    function cellKey(ix, iy) {
      return `${ix},${iy}`;
    }

    function normalizeCellBounds(a, b) {
      return {
        minIx: Math.min(a.ix, b.ix),
        maxIx: Math.max(a.ix, b.ix),
        minIy: Math.min(a.iy, b.iy),
        maxIy: Math.max(a.iy, b.iy)
      };
    }

    function boundsToLatLngBounds(bounds) {
      const { sw } = fineCellBoundsLL(bounds.minIx, bounds.minIy);
      const { ne } = fineCellBoundsLL(bounds.maxIx, bounds.maxIy);
      return L.latLngBounds(sw, ne);
    }

    function centerAreaBounds(radiusCells = 7) {
      const radius = Math.max(1, Math.round(Number(radiusCells) || 7));
      const center = getCenterFineCell();
      return {
        minIx: center.ix - radius,
        maxIx: center.ix + radius,
        minIy: center.iy - radius,
        maxIy: center.iy + radius
      };
    }

    function cellsForBounds(bounds) {
      const out = [];
      if (!bounds) return out;

      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
          const key = cellKey(ix, iy);
          const displayMetrics = getGridWildRuntimeMetricsForCell(ix, iy);

          out.push({
            ix,
            iy,
            key,
            metrics: displayMetrics || null,
            style: displayMetrics ? metricsToFill(displayMetrics) : null,
            bounds: fineCellBoundsLL(ix, iy)
          });
        }
      }

      return out;
    }

    function selectedIconicTaxa() {
      const taxa = window.__gwFilters?.iconicTaxa || [];
      return Array.isArray(taxa) ? taxa.filter(Boolean) : [];
    }

    function filteredSquareGeneraRecord(rec, taxa) {
      if (!rec || !taxa?.length) return rec;

      const selected = new Set(taxa);
      const genera = (Array.isArray(rec.genera) ? rec.genera : []).filter((row) =>
        selected.has(row?.iconic_taxon_name || "Unknown")
      );

      if (!genera.length) return null;

      const totalCount = (Array.isArray(rec.genera) ? rec.genera : []).reduce(
        (sum, row) => sum + (Number(row?.count) || 0),
        0
      );
      const filteredCount = genera.reduce((sum, row) => sum + (Number(row?.count) || 0), 0);
      const ratio = totalCount > 0 ? Math.max(0, Math.min(1, filteredCount / totalCount)) : 1;

      const topObservers = (Array.isArray(rec.top_observers) ? rec.top_observers : [])
        .map((row) => ({
          ...row,
          count: Math.round((Number(row?.count) || 0) * ratio),
          species: Math.max(1, Math.round((Number(row?.species) || 0) * ratio))
        }))
        .filter((row) => row.count > 0);

      const filteredMetrics = window.GWMetrics?.buildSquareMetrics
        ? window.GWMetrics.buildSquareMetrics({ ...rec, genera })
        : null;
      const observerBase = Number(rec.__metrics?.observers) || Number(rec.n_observers) || 0;
      const captiveBase = Number(rec.__metrics?.n_captive) || Number(rec.n_captive) || 0;

      return {
        ...rec,
        genera,
        top_observers: topObservers,
        __metrics: filteredMetrics
          ? {
              ...(rec.__metrics || {}),
              ...filteredMetrics,
              observers: Math.round(observerBase * ratio),
              n_captive: Math.round(captiveBase * ratio),
              source: rec.__metrics?.source || rec.source || "metadata_filter"
            }
          : null
      };
    }

    function activeFilterSignature() {
      return [
        window.__gwFilters?.onlyMe === true ? "me" : "all",
        selectedIconicTaxa().sort().join(",")
      ].join("|");
    }

    async function mergedGeneraRecordForBounds(bounds, options = {}) {
      if (!bounds) return { genera: [], __metrics: null };

      if (options.applyFilters && window.GridWildMeOverlayFilter?.isActive?.()) {
        return (
          window.GridWildMeOverlayFilter.generaRecordForBounds?.(bounds) || {
            genera: [],
            top_observers: [],
            __metrics: null
          }
        );
      }

      await ensureMetadataShardManifest();
      const jobs = [];

      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
          if (!shouldRequestSquareGeneraRecord(ix, iy)) continue;
          jobs.push(getSquareGeneraRecord(ix, iy));
        }
      }

      let records = (await Promise.all(jobs)).filter(Boolean);
      const taxa = options.applyFilters ? selectedIconicTaxa() : [];

      if (options.applyFilters) {
        if (taxa.length) {
          records = records.map((rec) => filteredSquareGeneraRecord(rec, taxa)).filter(Boolean);
        }
      }

      const pyriteRecords =
        window.GridWildPyriteLake?.recordsForBounds?.(bounds, {
          iconicTaxa: taxa
        }) || [];
      records = records.concat(pyriteRecords);

      return mergeSquareGeneraRecords(records);
    }

    async function mergedGeneraRecordForCells(cells = [], options = {}) {
      const normalized = (Array.isArray(cells) ? cells : [])
        .map((cell) => ({
          ix: Number(cell?.ix),
          iy: Number(cell?.iy)
        }))
        .filter((cell) => Number.isFinite(cell.ix) && Number.isFinite(cell.iy))
        .map((cell) => ({
          ix: Math.floor(cell.ix),
          iy: Math.floor(cell.iy)
        }));

      if (!normalized.length) return { genera: [], top_observers: [], __metrics: null };

      const seen = new Set();
      const jobs = [];
      await ensureMetadataShardManifest();

      normalized.forEach((cell) => {
        const key = cellKey(cell.ix, cell.iy);
        if (seen.has(key) || !shouldRequestSquareGeneraRecord(cell.ix, cell.iy)) return;
        seen.add(key);
        jobs.push(getSquareGeneraRecord(cell.ix, cell.iy));
      });

      let records = (await Promise.all(jobs)).filter(Boolean);
      const taxa = options.applyFilters ? selectedIconicTaxa() : [];

      if (options.applyFilters && taxa.length) {
        records = records.map((rec) => filteredSquareGeneraRecord(rec, taxa)).filter(Boolean);
      }

      return mergeSquareGeneraRecords(records);
    }

    function currentUserCell() {
      return getCurrentUserCellIndices();
    }

    function centerCell() {
      return getCenterFineCell();
    }

    return {
      gridSizeM: GRID_SIZE_M,
      latLngToCell,
      cellKey,
      normalizeCellBounds,
      boundsToLatLngBounds,
      centerAreaBounds,
      cellsForBounds,
      mergedGeneraRecordForBounds,
      mergedGeneraRecordForCells,
      activeFilterSignature,
      currentUserCell,
      centerCell,
      cellBounds: fineCellBoundsLL,
      metricsForCell: getGridWildRuntimeMetricsForCell,
      metricsToFill,
      loadObserverDictionary,
      observerMeta: getObserverMeta,
      escapeHtml
    };
  })();

function getCenterSquareLabel() {
  const n = CENTER_MACRO_SIZE_CELLS;
  const widthFeet = Math.round((n * GRID_SIZE_M) / 0.3048);
  return `Center square (${n}×${n} cells ≈ ${widthFeet} ft × ${widthFeet} ft)`;
}

window.updateHudCenterSummary = async function updateHudCenterSummary() {
  const el = document.getElementById("gwSummaryBody");
  if (!el) return;

  const titleEl = document.querySelector("#gwSummaryPane .gw-summary-title");

  if (titleEl) {
    titleEl.textContent = getCenterSquareLabel();
  }

  try {
    const keys = getCenterMacroCellKeys();

    const squareRecords = await Promise.all(
      keys.map((key) => {
        const [ixStr, iyStr] = key.split(",");
        return getSquareGeneraRecord(Number(ixStr), Number(iyStr));
      })
    );

    const merged = mergeSquareGeneraRecords(squareRecords.filter(Boolean));

    const m = merged.__metrics;

    if (!m) {
      el.innerHTML = `<div class="gw-muted">No center-square data.</div>`;
      return;
    }

    const speciesDensity = m.count > 0 ? m.species / m.count : 0;

    const discoveryScore = m.species / Math.max(1, m.count * 0.25);

    const dominant = m.dominant_iconic || "Unknown";

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
          ${(100 * m.seasonal_strength).toFixed(0)}%
        </div>

        <div class="gw-summary-k">Dominant life</div>
        <div class="gw-summary-v">
          ${dominant}
        </div>

      </div>
    `;
  } catch (err) {
    console.warn("Center summary failed:", err);

    el.innerHTML = `<div class="gw-muted">Could not load center summary.</div>`;
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
      .sort((a, b) => b.count - a.count || b.species - a.species || a.observer_id - b.observer_id)
      .slice(0, 5);

    if (!mergedTop.length) {
      el.innerHTML = `<div class="gw-muted">No observer leaderboard for this center 3×3 square.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="gw-list">
        ${mergedTop
          .map((row, idx) => {
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
                ${
                  icon
                    ? `
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
                `
                    : ""
                }
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
                  ${
                    name
                      ? `
                    <span class="gw-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      ${escapeHtml(name)}
                    </span>
                  `
                      : ""
                  }
                </span>
              </span>

              <span class="gw-muted" style="white-space:nowrap;">
                ${count} obs · ${species} spp
              </span>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  } catch (err) {
    console.warn("Failed to renderconst genusMap = new Map(); top observers panel:", err);
    el.innerHTML = `<div class="gw-muted">Could not load top observers.</div>`;
  }
};

function mergeSquareGeneraRecords(squareRecords) {
  const genusMap = new Map();
  const observerMap = new Map();

  const mergedMetrics = window.GWMetrics?.mergeSquareMetrics
    ? window.GWMetrics.mergeSquareMetrics(squareRecords)
    : null;

  for (const rec of squareRecords) {
    const genera = Array.isArray(rec?.genera) ? rec.genera : [];

    for (const g of genera) {
      const iconic = g?.iconic_taxon_name || "Unknown";
      const order = g?.order_name || "Unknown";
      const family = g?.family_name || "Unknown";
      const genus = g?.genus_name || "Unknown";

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

    const observers = Array.isArray(rec?.top_observers) ? rec.top_observers : [];
    for (const row of observers) {
      const observerId = Number(row?.observer_id);
      const observerLogin = String(row?.observer_login || "").trim();
      const observerKey =
        Number.isFinite(observerId) && observerId > 0
          ? `id:${observerId}`
          : observerLogin
            ? `login:${observerLogin}`
            : "";
      if (!observerKey) continue;

      if (!observerMap.has(observerKey)) {
        observerMap.set(observerKey, {
          observer_id: Number.isFinite(observerId) && observerId > 0 ? observerId : null,
          observer_login: observerLogin,
          observer_name: row?.observer_name || "",
          observer_url: row?.observer_url || "",
          count: 0,
          species: 0
        });
      }

      const dest = observerMap.get(observerKey);
      dest.count += Number(row?.count) || 0;
      dest.species = Math.max(dest.species, Number(row?.species) || 0);
      if (!dest.observer_login && observerLogin) dest.observer_login = observerLogin;
      if (!dest.observer_name && row?.observer_name) dest.observer_name = row.observer_name;
      if (!dest.observer_url && row?.observer_url) dest.observer_url = row.observer_url;
    }
  }

  return {
    genera: Array.from(genusMap.values()),
    top_observers: Array.from(observerMap.values()).sort(
      (a, b) =>
        b.count - a.count ||
        b.species - a.species ||
        String(a.observer_login || a.observer_id || "").localeCompare(
          String(b.observer_login || b.observer_id || "")
        )
    ),
    __metrics: mergedMetrics
  };
}

// ─────────────────────────────────────────────────────────────
// Taxonomy dictionary + square genera superchunk caches
// ─────────────────────────────────────────────────────────────
window.__genusTaxonomyDict = window.__genusTaxonomyDict || null;
window.__squareGeneraSuperchunkCache = window.__squareGeneraSuperchunkCache || new Map();
window.__gwMetadataShardCache = window.__gwMetadataShardCache || new Map();
window.__gwMetadataShardPending = window.__gwMetadataShardPending || new Map();
window.__gwMetadataDictionaries = window.__gwMetadataDictionaries || null;
window.__gwMetadataShardManifest = window.__gwMetadataShardManifest || null;
window.__gwMetadataShardUnavailable = window.__gwMetadataShardUnavailable || false;

window.resetGridWildMetadataShards = function resetGridWildMetadataShards() {
  window.GridWildAssets?.reset?.();
  window.__gwMetadataShardManifest = null;
  window.__gwMetadataShardUnavailable = false;
  window.__gwMetadataDictionaries = null;
  window.__gwMetadataShardCache?.clear?.();
  window.__gwMetadataShardPending?.clear?.();
  scheduleGridHeatCanvasRender?.({ force: true, reason: "metadata-shard-reset" });
  return window.getGridWildHeatDataStats?.() || null;
};

// Caches for in-flight fetches to prevent duplicate requests for the same data
window.__richGridMetrics = window.__richGridMetrics || new Map();
window.__richGridMetricsPending = window.__richGridMetricsPending || new Map();
window.__richGridMetricsCoarsePending = window.__richGridMetricsCoarsePending || new Set();
window.__squareGeneraSuperchunkPending = window.__squareGeneraSuperchunkPending || new Map();
window.__gwCoarseDataVersions = window.__gwCoarseDataVersions || {
  superchunks: 0,
  rich: 0
};
window.__squareGeneraSuperchunkDownloadState = window.__squareGeneraSuperchunkDownloadState || {
  active: 0,
  timer: null,
  lastToastAt: 0,
  toastDelayTimer: null
};
window.__gwRichMetricsHydrationState = window.__gwRichMetricsHydrationState || {
  viewKey: "",
  requestedCells: new Set(),
  requestedSuperchunks: new Set(),
  queuedBySuperchunk: new Map(),
  jobQueue: [],
  activeJobs: 0,
  flushTimer: null
};

let coarseDataVersionTimer = null;
let coarseDataVersionFirstQueuedAt = 0;
const pendingCoarseDataVersionKinds = new Set();

function flushCoarseDataVersionBumps() {
  coarseDataVersionTimer = null;
  coarseDataVersionFirstQueuedAt = 0;
  if (!pendingCoarseDataVersionKinds.size) return;

  const versions = (window.__gwCoarseDataVersions = window.__gwCoarseDataVersions || {
    superchunks: 0,
    rich: 0
  });

  for (const pendingKind of pendingCoarseDataVersionKinds) {
    versions[pendingKind] = (Number(versions[pendingKind]) || 0) + 1;
  }
  pendingCoarseDataVersionKinds.clear();

  if (typeof scheduleGridHeatCanvasRender === "function" && isCoarseHeatEnabled()) {
    scheduleGridHeatCanvasRender({ force: true });
  }
}

function queueCoarseDataVersionBump(kind) {
  if (!kind) return;
  pendingCoarseDataVersionKinds.add(kind);

  const now = Date.now();
  if (!coarseDataVersionFirstQueuedAt) coarseDataVersionFirstQueuedAt = now;
  if (coarseDataVersionTimer) window.clearTimeout(coarseDataVersionTimer);

  const elapsed = now - coarseDataVersionFirstQueuedAt;
  const delay = elapsed >= COARSE_DATA_VERSION_MAX_WAIT_MS ? 0 : COARSE_DATA_VERSION_DEBOUNCE_MS;

  coarseDataVersionTimer = window.setTimeout(flushCoarseDataVersionBumps, delay);
}

function getCoarseDataVersions() {
  const versions = window.__gwCoarseDataVersions || {};
  return {
    superchunks: Number(versions.superchunks) || 0,
    rich: Number(versions.rich) || 0
  };
}

window.getGridWildCoarseDataVersions = getCoarseDataVersions;

const GENERA_SUPERCHUNK_SIZE_FALLBACK = 32; // legacy assets generated by the MATLAB writer
const GENERA_SUPERCHUNK_BASE = "assets/square_genera_superchunks";
const GENUS_TAXONOMY_DICT_URL = "assets/genus_taxonomy_dictionary.json";

window.__gwObserverDict = window.__gwObserverDict || null;
const OBSERVER_DICT_URL = "assets/observer_dictionary.json";
window.__gwRegularGridDataDownloadState = window.__gwRegularGridDataDownloadState || {
  active: false,
  toastTimer: null,
  toastShown: false,
  completed: false
};

function showRegularGridDataToast(message) {
  if (typeof window.showGridWildToast === "function") {
    window.showGridWildToast(message);
    return;
  }

  window.setTimeout(() => {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    }
  }, 700);
}

function beginRegularGridDataDownloadToast() {
  const state = window.__gwRegularGridDataDownloadState;
  if (state.active) return;

  state.active = true;
  state.completed = false;
  state.toastShown = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    if (!state.active || state.completed) return;
    state.toastShown = true;
    showRegularGridDataToast("Downloading GridWild map data...");
  }, 450);
}

function finishRegularGridDataDownloadToast() {
  const state = window.__gwRegularGridDataDownloadState;
  state.completed = true;
  state.active = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = null;

  if (state.toastShown) {
    showRegularGridDataToast("GridWild map data downloaded");
  }
}

async function getGridAssetUrl(key, fallbackUrl) {
  try {
    if (window.GridWildAssets?.assetUrl) {
      const url = await window.GridWildAssets.assetUrl(key);
      if (url) return url;
      if (window.GridWildAssets?.localFallbackAllowed?.() === false) {
        throw new Error(`GridWild catalog did not provide a ${key} asset URL.`);
      }
      return fallbackUrl;
    }
  } catch (err) {
    if (window.GridWildAssets?.localFallbackAllowed?.() === false) {
      throw err;
    }
    console.warn(`Falling back to local ${key} asset.`, err);
  }

  return fallbackUrl;
}

function hasStaticHeatmapCounts() {
  return window.__staticGridCounts instanceof Map && window.__staticGridCounts.size > 0;
}

function shouldDeferStaticHeatmapCsvForPMTiles(manifest) {
  if (window.__gwState?.pmtilesHeatEnabled === false) return false;
  return Boolean(
    manifest?.pmtiles_file ||
    manifest?.pmtiles_shard_manifest_file ||
    manifest?.coarse_pmtiles_shard_manifest_file ||
    window.GridWildAssets?.hasDirectCatalogConfig?.()
  );
}

function legacyStaticHeatCsvFallbackAllowed() {
  const mode = String(window.GridWildAssets?.getMode?.() || "").toLowerCase();
  return mode === "local-csv" || window.GW_ENABLE_LEGACY_HEAT_CSV_FALLBACK === true;
}

function shouldSkipLegacyStaticHeatCsv(manifest) {
  if (manifest) return false;
  return !legacyStaticHeatCsvFallbackAllowed();
}

let staticHeatmapCsvPromise = null;

async function ensureStaticHeatmapCsvLoaded(reason = "fallback", options = {}) {
  if (hasStaticHeatmapCounts()) return window.__staticGridCounts;
  if (
    window.__gwStaticHeatCsvFallbackDisabled === true &&
    options.forceLegacyFallback !== true &&
    !legacyStaticHeatCsvFallbackAllowed()
  ) {
    throw new Error(
      "Legacy static heat CSV fallback is disabled until asset metadata is available."
    );
  }
  if (staticHeatmapCsvPromise) return staticHeatmapCsvPromise;

  staticHeatmapCsvPromise = (async () => {
    const heatUrl = await getGridAssetUrl("heat", "assets/dc_heat.csv");
    await loadStaticHeatmapCsv(heatUrl);
    window.__gwStaticHeatDeferredForPMTiles = false;
    return window.__staticGridCounts;
  })().catch((err) => {
    staticHeatmapCsvPromise = null;
    throw new Error(`GridWild static heat CSV load failed during ${reason}: ${err.message}`);
  });

  return staticHeatmapCsvPromise;
}

function scheduleDelayedLegacyStaticHeatCsvFallback(delayMs = 4000) {
  if (!legacyStaticHeatCsvFallbackAllowed()) return;
  if (window.__gwStaticHeatCsvFallbackQueued || hasStaticHeatmapCounts()) return;
  window.__gwStaticHeatCsvFallbackQueued = true;

  const loadAfterBoot = () => {
    window.setTimeout(
      () => {
        if (hasStaticHeatmapCounts()) return;
        if (window.__gwStaticHeatDeferredForPMTiles === true) return;

        window.__gwStaticHeatCsvFallbackDisabled = false;
        ensureStaticHeatmapCsvLoaded("delayed local fallback", { forceLegacyFallback: true })
          .then(() => {
            if (typeof window.updateGrid === "function") window.updateGrid();
          })
          .catch((err) => console.warn("GridWild delayed static heat fallback unavailable.", err));
      },
      Math.max(0, Number(delayMs) || 0)
    );
  };

  if (document.readyState === "complete") {
    loadAfterBoot();
  } else {
    window.addEventListener("load", loadAfterBoot, { once: true });
  }
}

async function loadGridWildStaticAssets() {
  beginRegularGridDataDownloadToast();

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

  try {
    const manifest = await ensureGridWildAssetManifest();
    const deferHeatCsv = shouldDeferStaticHeatmapCsvForPMTiles(manifest);
    const skipLegacyHeatCsv = shouldSkipLegacyStaticHeatCsv(manifest);
    window.__gwStaticHeatDeferredForPMTiles = deferHeatCsv;
    window.__gwStaticHeatCsvFallbackDisabled = skipLegacyHeatCsv;

    if (deferHeatCsv) {
      window.GridWildPMTilesHeat?.ensureSource?.();
    }

    scheduleObserverDictionaryWarmLoad();

    const jobs = [];
    if (!deferHeatCsv && !skipLegacyHeatCsv) {
      jobs.push(ensureStaticHeatmapCsvLoaded("startup"));
    } else if (skipLegacyHeatCsv) {
      console.info(
        "GridWild legacy static heat CSV fallback disabled; waiting for served asset metadata."
      );
    }

    await Promise.allSettled(jobs).then((results) => {
      const [heatResult] = results;
      if (heatResult?.status === "rejected") {
        console.warn("GridWild heat map unavailable.", heatResult.reason);
      }
    });
  } finally {
    finishRegularGridDataDownloadToast();
  }
}

let gridWildStaticAssetsPromise = null;

function ensureGridWildStaticAssetsLoaded() {
  if (gridWildStaticAssetsPromise) return gridWildStaticAssetsPromise;

  gridWildStaticAssetsPromise = loadGridWildStaticAssets().catch((err) => {
    gridWildStaticAssetsPromise = null;
    throw err;
  });

  return gridWildStaticAssetsPromise;
}

function scheduleGridWildStaticAssetsLoad(delay = 1000) {
  if (hasStaticHeatmapCounts()) return;
  if (gridWildStaticAssetsPromise) return;

  const start = () => {
    ensureGridWildStaticAssetsLoaded().catch((err) =>
      console.warn("GridWild static map assets unavailable.", err)
    );
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: Math.max(1800, delay + 500) });
    return;
  }

  window.setTimeout(start, delay);
}

window.ensureGridWildStaticAssetsLoaded = ensureGridWildStaticAssetsLoaded;
window.ensureGridWildStaticHeatmapLoaded = ensureStaticHeatmapCsvLoaded;
window.scheduleGridWildStaticAssetsLoad = scheduleGridWildStaticAssetsLoad;

function scheduleObserverDictionaryWarmLoad(delay = 15000) {
  if (window.__gwObserverDict || window.__gwObserverDictWarmQueued) return;
  window.__gwObserverDictWarmQueued = true;

  const start = () => {
    loadObserverDictionary().catch((err) =>
      console.warn("GridWild observer dictionary warm load unavailable.", err)
    );
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: Math.max(20000, delay + 5000) });
    return;
  }

  window.setTimeout(start, delay);
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

function parseMetadataShardCoords(shard) {
  const directSx = Number(shard?.sx ?? shard?.super_ix);
  const directSy = Number(shard?.sy ?? shard?.super_iy);
  if (Number.isFinite(directSx) && Number.isFinite(directSy)) {
    return { sx: Math.floor(directSx), sy: Math.floor(directSy) };
  }

  const encoded = String(shard?.shard || shard?.file || "");
  const match = /meta_(-?\d+)_(-?\d+)/.exec(encoded);
  if (!match) return null;

  const sx = Number(match[1]);
  const sy = Number(match[2]);
  return Number.isFinite(sx) && Number.isFinite(sy)
    ? { sx: Math.floor(sx), sy: Math.floor(sy) }
    : null;
}

async function ensureMetadataShardManifest() {
  if (window.GW_DISABLE_METADATA_SHARDS === true) return null;
  if (window.__gwMetadataShardManifest) return window.__gwMetadataShardManifest;
  if (window.__gwMetadataShardUnavailable) return null;
  if (!window.GridWildAssets?.loadMetadataShardManifest) return null;

  try {
    const manifest = await window.GridWildAssets.loadMetadataShardManifest();
    if (!manifest?.shards?.length) {
      window.__gwMetadataShardUnavailable = true;
      return null;
    }

    const shardIndex = new Map();
    for (const shard of manifest.shards || []) {
      const coords = parseMetadataShardCoords(shard);
      if (coords) {
        shardIndex.set(`${coords.sx}_${coords.sy}`, {
          ...shard,
          sx: coords.sx,
          sy: coords.sy
        });
      }
    }

    window.__gwMetadataShardManifest = {
      ...manifest,
      __shardIndex: shardIndex
    };
    return window.__gwMetadataShardManifest;
  } catch (err) {
    window.__gwMetadataShardUnavailable = true;
    console.warn("GridWild metadata shards unavailable; falling back to superchunks.", err);
    return null;
  }
}

function buildMetadataDictionaryIndex(dictionaries) {
  const groupsById = new Map();
  const iconicById = new Map();
  const taxaById = new Map();
  const datesById = new Map();

  for (const row of dictionaries?.groups || []) groupsById.set(Number(row.id), row);
  for (const row of dictionaries?.iconic_groups || []) iconicById.set(Number(row.id), row);
  for (const row of dictionaries?.taxa || []) taxaById.set(Number(row.id), row);
  for (const row of dictionaries?.dates || []) datesById.set(Number(row.id), row?.date || "");

  return {
    ...dictionaries,
    __groupsById: groupsById,
    __iconicById: iconicById,
    __taxaById: taxaById,
    __datesById: datesById
  };
}

async function loadMetadataDictionaries() {
  if (window.__gwMetadataDictionaries) return window.__gwMetadataDictionaries;

  const manifest = await ensureMetadataShardManifest();
  if (!manifest?.dictionaries_file || !window.GridWildAssets?.assetRelativeUrl) return null;

  const url = await window.GridWildAssets.assetRelativeUrl(manifest.dictionaries_file);
  const resp = await fetch(url, { cache: "force-cache" });
  if (!resp.ok) {
    throw new Error(
      `Failed to load GridWild metadata dictionaries: HTTP ${resp.status} for ${url}`
    );
  }

  window.__gwMetadataDictionaries = buildMetadataDictionaryIndex(await resp.json());
  return window.__gwMetadataDictionaries;
}

async function fetchMetadataShardJson(url) {
  const resp = await fetch(url, { cache: "force-cache" });
  if (!resp.ok) {
    throw new Error(`Failed to load GridWild metadata shard: HTTP ${resp.status} for ${url}`);
  }

  if (
    String(url || "")
      .toLowerCase()
      .endsWith(".gz") &&
    "DecompressionStream" in window
  ) {
    const stream = resp.body.pipeThrough(new window.DecompressionStream("gzip"));
    return new window.Response(stream).json();
  }

  return resp.json();
}

function metadataDate(dictionaries, id) {
  return dictionaries?.__datesById?.get?.(Number(id)) || "";
}

function metadataTaxonRowToGeneraRow(row, dictionaries) {
  const taxonId = Number(row?.[0]);
  const taxon = dictionaries?.__taxaById?.get?.(taxonId);
  if (!taxon) return null;

  const group = dictionaries?.__groupsById?.get?.(Number(taxon.playable_group_id));
  return {
    iconic_taxon_name: taxon.iconic_taxon_name || "Unknown",
    order_name: taxon.order_name || "Unknown",
    family_name: taxon.family_name || "Unknown",
    genus_name:
      taxon.genus_name || taxon.served_display_name || taxon.served_taxon_key || "Unknown",
    served_rank: taxon.served_rank || "taxon",
    served_taxon_key: taxon.served_taxon_key || "",
    served_display_name: taxon.served_display_name || "",
    playable_group_key: taxon.playable_group_key || group?.key || "unmapped",
    playable_group_name: group?.name || taxon.playable_group_key || "Unmapped Taxa",
    policy_action: taxon.policy_action || "",
    original_policy_action: taxon.original_policy_action || "",
    policy_match_rank: taxon.policy_match_rank || "",
    playability_score: taxon.playability_score ?? null,
    reason_codes: Array.isArray(taxon.reason_codes) ? taxon.reason_codes.slice() : [],
    raw_taxa_count: Number(row?.[2]) || 0,
    count: Number(row?.[1]) || 0,
    last_observed: metadataDate(dictionaries, row?.[3]),
    median_last10_observed: metadataDate(dictionaries, row?.[4]),
    month_counts: Array.isArray(row?.[5])
      ? row[5].slice(0, 12).map((value) => Number(value) || 0)
      : []
  };
}

function metadataCellToSquareRecord(cell, dictionaries) {
  if (!Array.isArray(cell)) return null;

  const taxa = Array.isArray(cell[9]) ? cell[9] : [];
  const genera = taxa.map((row) => metadataTaxonRowToGeneraRow(row, dictionaries)).filter(Boolean);
  if (!genera.length) return null;

  const topObservers = (Array.isArray(cell[10]) ? cell[10] : [])
    .map((row) => ({
      observer_id: Number(row?.[0]) || null,
      count: Number(row?.[1]) || 0,
      species: Number(row?.[2]) || 0
    }))
    .filter((row) => row.count > 0);

  const rec = {
    ix: Number(cell[0]),
    iy: Number(cell[1]),
    key: `${Number(cell[0])},${Number(cell[1])}`,
    count: Number(cell[2]) || 0,
    n_genera: Number(cell[3]) || genera.length,
    n_observers: Number(cell[4]) || topObservers.length,
    n_captive: Number(cell[5]) || 0,
    last_observed: metadataDate(dictionaries, cell[6]),
    median_last10_observed: metadataDate(dictionaries, cell[7]),
    genera,
    top_observers: topObservers,
    source: "metadata_shard"
  };

  rec.__metrics = window.GWMetrics?.buildSquareMetrics
    ? {
        ...window.GWMetrics.buildSquareMetrics(rec),
        observers: rec.n_observers,
        n_captive: rec.n_captive,
        source: "metadata_shard"
      }
    : null;

  return rec;
}

async function loadMetadataGeneraChunk(ix, iy) {
  const manifest = await ensureMetadataShardManifest();
  if (!manifest?.__shardIndex || !window.GridWildAssets?.assetRelativeUrl) return null;

  const key = getGeneraSuperchunkKey(ix, iy);
  const cache = window.__gwMetadataShardCache;
  const pending = window.__gwMetadataShardPending;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);

  const shard = manifest.__shardIndex.get(key);
  if (!shard?.file) return null;

  const job = (async () => {
    const dictionaries = await loadMetadataDictionaries();
    if (!dictionaries) return null;

    const url = await window.GridWildAssets.assetRelativeUrl(shard.file);
    const payload = await fetchMetadataShardJson(url);
    const squares = {};

    for (const cell of payload?.cells || []) {
      const rec = metadataCellToSquareRecord(cell, dictionaries);
      if (!rec) continue;
      squares[encodeGeneraSquareId(Number(cell[0]), Number(cell[1]))] = rec;
    }

    const chunk = {
      schema: "gridwild.metadata-shard.compat-square-genera.v1",
      source: "metadata_shard",
      super_ix: payload?.sx,
      super_iy: payload?.sy,
      squares
    };
    cache.set(key, chunk);
    return chunk;
  })().finally(() => {
    pending.delete(key);
  });

  pending.set(key, job);
  return job;
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
  await ensureGridWildAssetManifest();
  const key = getGeneraSuperchunkKey(ix, iy);
  const cache = window.__squareGeneraSuperchunkCache;
  const pending = window.__squareGeneraSuperchunkPending;

  if (cache.has(key)) {
    return cache.get(key);
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const job = (async () => {
    beginGeneraSuperchunkDownloadToast();

    try {
      const metadataChunk = await loadMetadataGeneraChunk(ix, iy);
      if (metadataChunk) {
        cache.set(key, metadataChunk);
        queueCoarseDataVersionBump("superchunks");
        return metadataChunk;
      }

      const url = await getGeneraSuperchunkUrlAsync(ix, iy);
      const resp = await fetch(url);
      if (!resp.ok) {
        if (resp.status === 400 || resp.status === 404) {
          cache.set(key, null);
          queueCoarseDataVersionBump("superchunks");
          return null;
        }
        throw new Error(`Failed to load square genera superchunk: HTTP ${resp.status} for ${url}`);
      }
      const data = await resp.json();
      cache.set(key, data);
      queueCoarseDataVersionBump("superchunks");
      return data;
    } finally {
      pending.delete(key);
      endGeneraSuperchunkDownloadToast();
    }
  })();

  pending.set(key, job);
  return job;
}

function showGeneraSuperchunkDownloadToast(force = false) {
  if (typeof window.showGridWildToast !== "function") return;

  const state = window.__squareGeneraSuperchunkDownloadState;
  const now = Date.now();
  if (!force && now - state.lastToastAt < 2400) return;

  state.lastToastAt = now;
  const suffix = state.active > 1 ? ` (${state.active} chunks)` : "";
  window.showGridWildToast(`Downloading superchunk data${suffix}...`);
}

function beginGeneraSuperchunkDownloadToast() {
  const state = window.__squareGeneraSuperchunkDownloadState;
  state.active += 1;

  if (!state.toastDelayTimer) {
    state.toastDelayTimer = window.setTimeout(() => {
      state.toastDelayTimer = null;
      if (state.active > 0) showGeneraSuperchunkDownloadToast(true);
    }, 550);
  }

  if (!state.timer) {
    state.timer = window.setInterval(() => {
      if (state.active > 0) showGeneraSuperchunkDownloadToast(false);
    }, 2500);
  }
}

function endGeneraSuperchunkDownloadToast() {
  const state = window.__squareGeneraSuperchunkDownloadState;
  state.active = Math.max(0, state.active - 1);

  if (state.active === 0 && state.toastDelayTimer) {
    window.clearTimeout(state.toastDelayTimer);
    state.toastDelayTimer = null;
  }

  if (state.active === 0 && state.timer) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
}

async function ensureGridWildAssetManifest() {
  if (window.__gwAssetManifest !== undefined) return window.__gwAssetManifest;
  if (!window.GridWildAssets?.loadManifest) {
    window.__gwAssetManifest = null;
    return null;
  }

  try {
    window.__gwAssetManifest = await window.GridWildAssets.loadManifest();
  } catch (err) {
    console.warn("GridWild asset manifest unavailable.", err);
    window.__gwAssetManifest = null;
  }
  return window.__gwAssetManifest;
}

function getGeneraSuperchunkSize() {
  const size = Number(window.__gwAssetManifest?.superchunk_size);
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : GENERA_SUPERCHUNK_SIZE_FALLBACK;
}

function getGeneraSuperchunkKey(ix, iy) {
  const superchunkSize = getGeneraSuperchunkSize();
  const super_ix = Math.floor(ix / superchunkSize);
  const super_iy = Math.floor(iy / superchunkSize);
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
  queueCoarseDataVersionBump("superchunks");
  return data;
}

function encodeGeneraSquareId(ix, iy) {
  const enc = (n) => (n < 0 ? `m${Math.abs(n)}` : `p${n}`);
  return `sq_${enc(ix)}_${enc(iy)}`;
}

function hasStaticGoldCellForGenera(ix, iy) {
  const key = `${ix},${iy}`;
  if (window.__richGridMetrics?.has?.(key)) return true;

  const counts = window.__staticGridCounts;
  if (counts instanceof Map) return counts.has(key);

  return false;
}

function hasMetadataShardForGenera(ix, iy) {
  const manifest = window.__gwMetadataShardManifest;
  const key = getGeneraSuperchunkKey(ix, iy);
  const shard = manifest?.__shardIndex?.get?.(key);
  if (!shard) return false;

  const bbox = Array.isArray(shard.bbox_grid) ? shard.bbox_grid : null;
  if (!bbox || bbox.length < 4) return true;
  return ix >= bbox[0] && iy >= bbox[1] && ix <= bbox[2] && iy <= bbox[3];
}

function shouldRequestSquareGeneraRecord(ix, iy) {
  return hasStaticGoldCellForGenera(ix, iy) || hasMetadataShardForGenera(ix, iy);
}

async function getSquareGeneraRecord(ix, iy) {
  if (!shouldRequestSquareGeneraRecord(ix, iy)) {
    await ensureMetadataShardManifest();
    if (!shouldRequestSquareGeneraRecord(ix, iy)) return null;
  }

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

function buildRichMetricsForGeneraRecord(ix, iy, rec) {
  if (!rec || !window.GWMetrics?.buildSquareMetrics) return null;

  const key = `${ix},${iy}`;
  const staticMetrics = window.__staticGridCounts?.get(key) || {};
  const richMetrics = window.GWMetrics.buildSquareMetrics(rec);

  return {
    ...staticMetrics,
    ...richMetrics,
    observers: Number(staticMetrics.observers) || 0,
    n_captive: Number(staticMetrics.n_captive) || 0,
    last_observed: richMetrics.last_observed || staticMetrics.last_observed || null,
    median_last10_observed:
      richMetrics.median_last10_observed || staticMetrics.median_last10_observed || null,
    last_observed_ms:
      Number(richMetrics.last_observed_ms) || Number(staticMetrics.last_observed_ms) || 0,
    median_last10_observed_ms:
      Number(richMetrics.median_last10_observed_ms) ||
      Number(staticMetrics.median_last10_observed_ms) ||
      0
  };
}

async function warmRichMetricsForCell(ix, iy) {
  const key = `${ix},${iy}`;
  const richCache = window.__richGridMetrics;
  const pending = window.__richGridMetricsPending;

  if (richCache.has(key)) return richCache.get(key);
  if (pending.has(key)) return pending.get(key);
  if (isCoarseHeatEnabled() && window.__richGridMetricsCoarsePending?.has?.(key)) return null;

  const job = getSquareGeneraRecord(ix, iy)
    .then((rec) => {
      const merged = buildRichMetricsForGeneraRecord(ix, iy, rec);
      if (!merged) return null;

      richCache.set(key, merged);
      queueCoarseDataVersionBump("rich");
      return merged;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, job);
  return job;
}

function richMetricsHydrationState() {
  const state = (window.__gwRichMetricsHydrationState = window.__gwRichMetricsHydrationState || {});

  if (!(state.requestedCells instanceof Set)) state.requestedCells = new Set();
  if (!(state.requestedSuperchunks instanceof Set)) state.requestedSuperchunks = new Set();
  if (!(state.requestedNetworkSuperchunks instanceof Set))
    state.requestedNetworkSuperchunks = new Set();
  if (!(state.queuedBySuperchunk instanceof Map)) state.queuedBySuperchunk = new Map();
  if (!Array.isArray(state.jobQueue)) state.jobQueue = [];
  state.activeJobs = Math.max(0, Number(state.activeJobs) || 0);
  state.viewKey = state.viewKey || "";

  return state;
}

function clearQueuedCoarseRichHydration(state) {
  const coarsePending = window.__richGridMetricsCoarsePending;

  for (const cells of state.queuedBySuperchunk.values()) {
    for (const key of cells.keys()) coarsePending.delete(key);
  }

  for (const job of state.jobQueue) {
    for (const cell of job.cells || []) coarsePending.delete(`${cell.ix},${cell.iy}`);
  }

  state.queuedBySuperchunk.clear();
  state.jobQueue.length = 0;

  if (state.flushTimer) {
    window.clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
}

function resetCoarseRichHydrationView(viewKey) {
  const state = richMetricsHydrationState();
  if (!viewKey || state.viewKey === viewKey) return state;

  clearQueuedCoarseRichHydration(state);
  state.viewKey = viewKey;
  state.requestedCells.clear();
  state.requestedSuperchunks.clear();
  state.requestedNetworkSuperchunks.clear();
  return state;
}

function pumpCoarseRichHydrationJobs() {
  const state = richMetricsHydrationState();

  while (state.activeJobs < COARSE_HEAT_RICH_SUPERCHUNK_CONCURRENCY && state.jobQueue.length) {
    const job = state.jobQueue.shift();
    state.activeJobs++;

    hydrateRichMetricsForSuperchunkCells(job.cells)
      .catch((err) => console.warn("Coarse rich metrics hydration failed:", err))
      .finally(() => {
        state.activeJobs = Math.max(0, state.activeJobs - 1);
        pumpCoarseRichHydrationJobs();
      });
  }
}

function flushCoarseRichHydrationQueue() {
  const state = richMetricsHydrationState();
  state.flushTimer = null;

  for (const [superKey, cells] of state.queuedBySuperchunk.entries()) {
    state.jobQueue.push({
      superKey,
      cells: Array.from(cells.values())
    });
  }

  state.queuedBySuperchunk.clear();
  pumpCoarseRichHydrationJobs();
}

function scheduleCoarseRichHydrationFlush() {
  const state = richMetricsHydrationState();
  if (state.flushTimer) return;
  state.flushTimer = window.setTimeout(flushCoarseRichHydrationQueue, 35);
}

async function hydrateRichMetricsForSuperchunkCells(cells) {
  if (!Array.isArray(cells) || !cells.length) return 0;

  const coarsePending = window.__richGridMetricsCoarsePending;
  let changed = 0;

  try {
    const chunk = await loadGeneraSuperchunk(cells[0].ix, cells[0].iy);

    if (chunk?.squares) {
      for (const { ix, iy } of cells) {
        const key = `${ix},${iy}`;
        if (window.__richGridMetrics?.has?.(key)) continue;

        const rec = chunk.squares[encodeGeneraSquareId(ix, iy)] || null;
        const merged = buildRichMetricsForGeneraRecord(ix, iy, rec);
        if (!merged) continue;

        window.__richGridMetrics.set(key, merged);
        changed++;
      }
    }
  } finally {
    for (const { ix, iy } of cells) {
      coarsePending.delete(`${ix},${iy}`);
    }
  }

  if (changed) queueCoarseDataVersionBump("rich");
  return changed;
}

function requestCoarseRichMetricsForCell(ix, iy, options = {}) {
  const key = `${ix},${iy}`;
  const richCache = window.__richGridMetrics;
  const richPending = window.__richGridMetricsPending;
  const coarsePending = window.__richGridMetricsCoarsePending;

  if (richCache?.has?.(key) || richPending?.has?.(key) || coarsePending?.has?.(key)) {
    return false;
  }

  const state = resetCoarseRichHydrationView(options.viewKey || "");
  if (state.requestedCells.has(key)) return false;

  if (state.requestedCells.size >= COARSE_HEAT_RICH_VIEW_CELL_BUDGET) {
    return false;
  }

  const superKey = getGeneraSuperchunkKey(ix, iy);
  const chunkCached =
    window.__squareGeneraSuperchunkCache?.has?.(superKey) === true ||
    window.__gwMetadataShardCache?.has?.(superKey) === true;
  const chunkPending =
    window.__squareGeneraSuperchunkPending?.has?.(superKey) === true ||
    window.__gwMetadataShardPending?.has?.(superKey) === true;

  if (
    !chunkCached &&
    !chunkPending &&
    !state.requestedNetworkSuperchunks.has(superKey) &&
    state.requestedNetworkSuperchunks.size >= COARSE_HEAT_RICH_VIEW_SUPERCHUNK_BUDGET
  ) {
    return false;
  }

  state.requestedCells.add(key);
  state.requestedSuperchunks.add(superKey);
  if (!chunkCached && !chunkPending) state.requestedNetworkSuperchunks.add(superKey);

  let cells = state.queuedBySuperchunk.get(superKey);
  if (!cells) {
    cells = new Map();
    state.queuedBySuperchunk.set(superKey, cells);
  }

  cells.set(key, { ix, iy });
  coarsePending.add(key);
  scheduleCoarseRichHydrationFlush();
  return true;
}

window.getGridWildRichHydrationStats = function getGridWildRichHydrationStats() {
  const state = richMetricsHydrationState();
  return {
    viewKey: state.viewKey,
    requestedCells: state.requestedCells.size,
    requestedSuperchunks: state.requestedSuperchunks.size,
    requestedNetworkSuperchunks: state.requestedNetworkSuperchunks.size,
    queuedSuperchunks: state.queuedBySuperchunk.size,
    queuedJobs: state.jobQueue.length,
    activeJobs: state.activeJobs,
    coarsePendingCells: window.__richGridMetricsCoarsePending?.size || 0
  };
};

// Modular iconic-taxon overlay adapter. It leaves the base static metrics and
// lens recipes intact, but swaps in filtered metrics right before painting.
window.GridWildIconicOverlayFilter =
  window.GridWildIconicOverlayFilter ||
  (function () {
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

    function metricsForCell(ix, iy, baseMetrics = {}, options = {}) {
      if (!isActive()) return baseMetrics;
      if (!window.GWMetrics?.buildSquareMetrics) return baseMetrics;

      const rec = getCachedSquareRecord(ix, iy);
      if (!rec) {
        if (options.requestMissingRecord !== false) requestRecord(ix, iy);
        return null;
      }

      const taxa = new Set(selectedTaxa());
      const filteredRows = rowsForRecord(rec).filter((row) =>
        taxa.has(row?.iconic_taxon_name || "Unknown")
      );

      if (!filteredRows.length) return null;

      const filtered = window.GWMetrics.buildSquareMetrics({ genera: filteredRows });
      if (!filtered || (filtered.count || 0) <= 0) return null;

      const totalCount =
        Number(baseMetrics.count) || Number(rec.__metrics?.count) || filtered.count;
      const ratio = totalCount > 0 ? Math.max(0, Math.min(1, filtered.count / totalCount)) : 1;

      return {
        ...baseMetrics,
        ...filtered,
        observers: Math.round((Number(baseMetrics.observers) || 0) * ratio),
        n_captive: Math.round((Number(baseMetrics.n_captive) || 0) * ratio),
        last_observed: baseMetrics.last_observed || filtered.last_observed || null,
        median_last10_observed:
          baseMetrics.median_last10_observed || filtered.median_last10_observed || null,
        last_observed_ms:
          Number(baseMetrics.last_observed_ms) || Number(filtered.last_observed_ms) || 0,
        median_last10_observed_ms:
          Number(baseMetrics.median_last10_observed_ms) ||
          Number(filtered.median_last10_observed_ms) ||
          0,
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

window.GridWildMeOverlayFilter =
  window.GridWildMeOverlayFilter ||
  (function () {
    let cache = null;
    let signature = "";
    let genusTaxonomyByName = null;

    const MONTH_COUNT = 12;

    function isActive() {
      return window.__gwFilters?.onlyMe === true;
    }

    function selectedTaxa() {
      const taxa = window.__gwFilters?.iconicTaxa || [];
      return Array.isArray(taxa) ? taxa.filter(Boolean) : [];
    }

    function obsSignature(observations) {
      const first = observations[0];
      const last = observations[observations.length - 1];
      return [
        observations.length,
        first?.id || "",
        first?.observed_on || first?.time_observed_at || first?.created_at || "",
        last?.id || "",
        last?.observed_on || last?.time_observed_at || last?.created_at || ""
      ].join("|");
    }

    function dateIsoFromMs(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return new Date(ms).toISOString().slice(0, 10);
    }

    function parseObsTimeMs(obs) {
      const raw = obs?.observed_on || obs?.time_observed_at || obs?.created_at || "";
      const ms = raw ? Date.parse(raw) : 0;
      return Number.isFinite(ms) ? ms : 0;
    }

    function entropy(values) {
      const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
      if (!total) return 0;

      return values.reduce((h, value) => {
        const p = (Number(value) || 0) / total;
        return p > 0 ? h - p * Math.log2(p) : h;
      }, 0);
    }

    function makeAccumulator() {
      return {
        count: 0,
        genusSet: new Set(),
        iconic_counts: {},
        month_totals: Array(MONTH_COUNT).fill(0),
        lastObservedMs: 0,
        recentObservedMs: []
      };
    }

    function addObservation(acc, obs) {
      acc.count++;

      const genus = obs.genus_name || obs.scientific_name || obs.taxon || "Unknown";
      if (genus) acc.genusSet.add(genus);

      const iconic = obs.iconic_taxon_name || "Unknown";
      acc.iconic_counts[iconic] = (acc.iconic_counts[iconic] || 0) + 1;

      const ms = parseObsTimeMs(obs);
      if (ms) {
        acc.lastObservedMs = Math.max(acc.lastObservedMs, ms);
        acc.recentObservedMs.push(ms);
        acc.recentObservedMs.sort((a, b) => b - a);
        if (acc.recentObservedMs.length > 10) acc.recentObservedMs.length = 10;

        const month = new Date(ms).getUTCMonth();
        if (month >= 0 && month < MONTH_COUNT) acc.month_totals[month]++;
      }
    }

    async function getGenusTaxonomyByName() {
      if (genusTaxonomyByName) return genusTaxonomyByName;

      genusTaxonomyByName = new Map();
      try {
        const dict = await loadGenusTaxonomyDictionary();
        for (const rec of Object.values(dict || {})) {
          const name = rec?.name || rec?.genus_name;
          if (name && !genusTaxonomyByName.has(name)) {
            genusTaxonomyByName.set(name, rec);
          }
        }
      } catch (err) {
        console.warn("GridWild Me taxonomy lookup unavailable.", err);
      }

      return genusTaxonomyByName;
    }

    function cellForObservation(obs) {
      const lat = Number(obs?.lat);
      const lng = Number(obs?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const key = getCellKeyForLatLng(lat, lng);
      const comma = key.indexOf(",");
      if (comma <= 0) return null;

      const ix = Number(key.slice(0, comma));
      const iy = Number(key.slice(comma + 1));
      return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy } : null;
    }

    function observationsForCellBounds(bounds) {
      if (!bounds) return [];

      const taxa = new Set(selectedTaxa());
      return (window.GridWildRecentINat?.getRecentObservations?.() || []).filter((obs) => {
        const cell = cellForObservation(obs);
        if (!cell) return false;
        if (
          cell.ix < bounds.minIx ||
          cell.ix > bounds.maxIx ||
          cell.iy < bounds.minIy ||
          cell.iy > bounds.maxIy
        ) {
          return false;
        }
        return !taxa.size || taxa.has(obs?.iconic_taxon_name || "Unknown");
      });
    }

    async function generaRecordForBounds(bounds) {
      const observations = observationsForCellBounds(bounds);
      if (!observations.length) {
        return { genera: [], top_observers: [], __metrics: null };
      }

      const taxonomyByName = await getGenusTaxonomyByName();
      const genusMap = new Map();

      for (const obs of observations) {
        const genus =
          obs?.genus_name ||
          String(obs?.scientific_name || obs?.taxon || "Unknown").split(/\s+/)[0] ||
          "Unknown";
        const taxonomy = taxonomyByName.get(genus);
        const path = Array.isArray(taxonomy?.path_names) ? taxonomy.path_names : [];
        const iconic = obs?.iconic_taxon_name || path[2] || "Unknown";
        const order = path[3] || "Unknown";
        const family = path[4] || "Unknown";
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
        dest.count += 1;

        const ms = parseObsTimeMs(obs);
        if (ms) {
          const month = new Date(ms).getUTCMonth();
          if (month >= 0 && month < MONTH_COUNT) dest.month_counts[month] += 1;
        }
      }

      const genera = Array.from(genusMap.values());
      const metrics = window.GWMetrics?.buildSquareMetrics
        ? window.GWMetrics.buildSquareMetrics({ genera })
        : null;
      const username = window.__gwUser?.username || "me";
      const species = new Set(genera.map((row) => row.genus_name).filter(Boolean)).size;

      return {
        genera,
        top_observers: [
          {
            observer_login: username,
            observer_name: username === "me" ? "Me" : `@${username}`,
            count: observations.length,
            species
          }
        ],
        __metrics: metrics ? { ...metrics, observers: 1 } : null
      };
    }

    function finalizeMetrics(acc) {
      if (!acc || acc.count <= 0) return null;

      const sortedTimes = acc.recentObservedMs.filter(Number.isFinite).sort((a, b) => b - a);

      const lastObservedMs = acc.lastObservedMs || sortedTimes[0] || 0;
      const lastTen = sortedTimes.slice(0, 10).sort((a, b) => a - b);
      const medianIdx = Math.floor(lastTen.length / 2);
      const medianLast10ObservedMs = lastTen.length
        ? lastTen.length % 2
          ? lastTen[medianIdx]
          : (lastTen[medianIdx - 1] + lastTen[medianIdx]) / 2
        : lastObservedMs;

      const peak = Math.max(...acc.month_totals);
      const total = acc.month_totals.reduce((sum, value) => sum + value, 0);
      const dominant =
        Object.entries(acc.iconic_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

      return {
        count: acc.count,
        species: acc.genusSet.size,
        genera: acc.genusSet.size,
        observers: 1,
        n_captive: 0,
        iconic_counts: { ...acc.iconic_counts },
        dominant_iconic: dominant,
        iconic_n: Object.keys(acc.iconic_counts).length,
        month_totals: acc.month_totals.slice(),
        peak_month: acc.month_totals.indexOf(peak) + 1,
        seasonal_strength: total ? peak / total : 0,
        month_entropy: entropy(acc.month_totals),
        last_observed: dateIsoFromMs(lastObservedMs),
        median_last10_observed: dateIsoFromMs(medianLast10ObservedMs),
        last_observed_ms: lastObservedMs,
        median_last10_observed_ms: medianLast10ObservedMs,
        nActiveSquares: 1,
        activity_score: Math.log1p(acc.count) * (1 + acc.genusSet.size * 0.05)
      };
    }

    function mergeMetricsRecords(records) {
      const merged = {
        count: 0,
        species: 0,
        genera: 0,
        observers: 1,
        n_captive: 0,
        iconic_counts: {},
        month_totals: Array(MONTH_COUNT).fill(0),
        last_observed: null,
        median_last10_observed: null,
        last_observed_ms: 0,
        median_last10_observed_ms: 0,
        nActiveSquares: 1
      };

      for (const rec of records) {
        if (!rec) continue;

        merged.count += Number(rec.count) || 0;
        merged.species += Number(rec.species) || 0;
        merged.genera += Number(rec.genera) || 0;

        const lastMs = Number(rec.last_observed_ms) || parseGridDateMs(rec.last_observed);
        if (lastMs > merged.last_observed_ms) {
          merged.last_observed_ms = lastMs;
          merged.last_observed = dateIsoFromMs(lastMs);
        }

        const medianMs =
          Number(rec.median_last10_observed_ms) || parseGridDateMs(rec.median_last10_observed);
        if (medianMs > merged.median_last10_observed_ms) {
          merged.median_last10_observed_ms = medianMs;
          merged.median_last10_observed = dateIsoFromMs(medianMs);
        }

        for (const [iconic, count] of Object.entries(rec.iconic_counts || {})) {
          merged.iconic_counts[iconic] = (merged.iconic_counts[iconic] || 0) + (Number(count) || 0);
        }

        (rec.month_totals || []).forEach((count, index) => {
          if (index >= 0 && index < MONTH_COUNT) {
            merged.month_totals[index] += Number(count) || 0;
          }
        });
      }

      if (merged.count <= 0) return null;

      const peak = Math.max(...merged.month_totals);
      const total = merged.month_totals.reduce((sum, value) => sum + value, 0);
      const dominant =
        Object.entries(merged.iconic_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

      merged.iconic_n = Object.keys(merged.iconic_counts).length;
      merged.dominant_iconic = dominant;
      merged.peak_month = merged.month_totals.indexOf(peak) + 1;
      merged.seasonal_strength = total ? peak / total : 0;
      merged.month_entropy = entropy(merged.month_totals);
      merged.activity_score = Math.log1p(merged.count) * (1 + merged.species * 0.05);

      return merged;
    }

    function buildCache() {
      const observations = window.GridWildRecentINat?.getRecentObservations?.() || [];
      const nextSignature = obsSignature(observations);
      if (cache && signature === nextSignature) return cache;

      signature = nextSignature;
      cache = new Map();

      for (const obs of observations) {
        const lat = Number(obs?.lat);
        const lng = Number(obs?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const key = getCellKeyForLatLng(lat, lng);
        const iconic = obs.iconic_taxon_name || "Unknown";

        if (!cache.has(key)) {
          cache.set(key, {
            all: makeAccumulator(),
            byIconic: new Map()
          });
        }

        const entry = cache.get(key);
        addObservation(entry.all, obs);

        if (!entry.byIconic.has(iconic)) {
          entry.byIconic.set(iconic, makeAccumulator());
        }
        addObservation(entry.byIconic.get(iconic), obs);
      }

      for (const [key, entry] of cache.entries()) {
        const byIconicMetrics = new Map();
        for (const [iconic, acc] of entry.byIconic.entries()) {
          const metrics = finalizeMetrics(acc);
          if (metrics) byIconicMetrics.set(iconic, metrics);
        }

        cache.set(key, {
          all: finalizeMetrics(entry.all),
          byIconic: byIconicMetrics
        });
      }

      return cache;
    }

    function entriesInMeterBounds(startX, endX, startY, endY) {
      if (!isActive()) return [];

      const minIx = Math.floor(startX / GRID_SIZE_M);
      const maxIx = Math.floor((endX - GRID_SIZE_M) / GRID_SIZE_M);
      const minIy = Math.floor(startY / GRID_SIZE_M);
      const maxIy = Math.floor((endY - GRID_SIZE_M) / GRID_SIZE_M);
      const taxa = new Set(selectedTaxa());
      const entries = [];

      for (const [key, entry] of buildCache().entries()) {
        const comma = key.indexOf(",");
        if (comma <= 0) continue;

        const ix = Number(key.slice(0, comma));
        const iy = Number(key.slice(comma + 1));
        if (
          !Number.isFinite(ix) ||
          !Number.isFinite(iy) ||
          ix < minIx ||
          ix > maxIx ||
          iy < minIy ||
          iy > maxIy
        ) {
          continue;
        }

        let metrics = entry.all || null;
        if (taxa.size) {
          const records = Array.from(taxa)
            .map((taxon) => entry.byIconic.get(taxon))
            .filter(Boolean);
          metrics = records.length === 1 ? records[0] : mergeMetricsRecords(records);
        }

        if (metrics) entries.push({ ix, iy, key, metrics });
      }

      return entries;
    }

    function metricsForCell(ix, iy) {
      if (!isActive()) return null;
      const entry = buildCache().get(`${ix},${iy}`);
      if (!entry) return null;

      const taxa = new Set(selectedTaxa());
      if (!taxa.size) return entry.all || null;

      const records = Array.from(taxa)
        .map((taxon) => entry.byIconic.get(taxon))
        .filter(Boolean);

      if (!records.length) return null;
      if (records.length === 1) return records[0];

      return mergeMetricsRecords(records);
    }

    function invalidate() {
      cache = null;
      signature = "";
      window.GridWildCoarseHeatCache?.invalidate?.();
      scheduleGridHeatCanvasRender();
    }

    window.addEventListener("gwRecentINatUpdated", invalidate);

    return {
      isActive,
      metricsForCell,
      entriesInMeterBounds,
      generaRecordForBounds,
      invalidate
    };
  })();

function getDisplayMetricsForCell(ix, iy, baseMetrics = {}, options = {}) {
  if (window.GridWildMeOverlayFilter?.isActive?.()) {
    return window.GridWildMeOverlayFilter.metricsForCell(ix, iy);
  }

  const staticMetrics = hasGridMetricSignal(baseMetrics)
    ? window.GridWildIconicOverlayFilter?.metricsForCell?.(ix, iy, baseMetrics, options) || null
    : null;
  const pyriteMetrics =
    window.GridWildPyriteLake?.getMetricsForCell?.(ix, iy, {
      iconicTaxa: window.GridWildIconicOverlayFilter?.selectedTaxa?.() || []
    }) || null;

  return mergeDisplayMetricRecords([staticMetrics, pyriteMetrics]);
}

function hasGridMetricSignal(metrics) {
  if (!metrics) return false;
  return (
    (Number(metrics.count) || 0) > 0 ||
    (Number(metrics.species) || 0) > 0 ||
    (Number(metrics.genera) || 0) > 0 ||
    (Number(metrics.observers) || 0) > 0
  );
}

function fineHeatRuntimeMetricCache() {
  if (!(window.__gwFineHeatRuntimeMetrics instanceof Map)) {
    window.__gwFineHeatRuntimeMetrics = new Map();
  }
  return window.__gwFineHeatRuntimeMetrics;
}

function cellKeyFromIndices(ix, iy) {
  const x = Math.floor(Number(ix));
  const y = Math.floor(Number(iy));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return `${x},${y}`;
}

function queueRuntimeHeatMetricsChange() {
  if (window.__gwRuntimeHeatMetricsChangeTimer) return;
  window.__gwRuntimeHeatMetricsChangeTimer = window.setTimeout(() => {
    window.__gwRuntimeHeatMetricsChangeTimer = null;
    window.dispatchEvent(
      new CustomEvent("gridwild:heatchange", {
        detail: {
          source: "pmtiles-runtime-metrics",
          finePMTilesCells: fineHeatRuntimeMetricCache().size
        }
      })
    );
  }, 120);
}

function recordFinePMTilesRuntimeMetrics(item) {
  if (!item?.key || !hasGridMetricSignal(item.metrics)) return false;

  const cache = fineHeatRuntimeMetricCache();
  const existed = cache.has(item.key);
  cache.set(item.key, {
    ...item.metrics,
    ix: item.ix,
    iy: item.iy,
    key: item.key,
    nActiveSquares: Number(item.metrics.nActiveSquares) || 1,
    source: item.metrics.source || "pmtiles_fine_visual"
  });

  while (cache.size > PMTILES_FINE_METRIC_CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }

  if (!existed) queueRuntimeHeatMetricsChange();
  return !existed;
}

function canUseFinePMTilesRuntimeMetrics() {
  if (window.__gwState?.pmtilesHeatEnabled === false) return false;
  if (window.GridWildMeOverlayFilter?.isActive?.()) return false;
  if (window.GridWildIconicOverlayFilter?.isActive?.()) return false;
  return true;
}

function getFinePMTilesRuntimeBaseMetrics(ix, iy) {
  if (!canUseFinePMTilesRuntimeMetrics()) return null;
  const key = cellKeyFromIndices(ix, iy);
  if (!key) return null;

  const metrics = fineHeatRuntimeMetricCache().get(key) || null;
  return hasGridMetricSignal(metrics) ? metrics : null;
}

function getGridWildBaseMetricsForCell(ix, iy) {
  const key = cellKeyFromIndices(ix, iy);
  if (!key) return null;

  const richMetrics = window.__richGridMetrics?.get?.(key) || null;
  if (hasGridMetricSignal(richMetrics)) return richMetrics;

  const pmtilesMetrics = getFinePMTilesRuntimeBaseMetrics(ix, iy);
  if (hasGridMetricSignal(pmtilesMetrics)) return pmtilesMetrics;

  const staticMetrics = window.__staticGridCounts?.get?.(key) || null;
  return hasGridMetricSignal(staticMetrics) ? staticMetrics : null;
}

function getGridWildRuntimeMetricsForCell(ix, iy, options = {}) {
  const baseMetrics = hasGridMetricSignal(options.baseMetrics)
    ? options.baseMetrics
    : getGridWildBaseMetricsForCell(ix, iy);

  return getDisplayMetricsForCell(ix, iy, baseMetrics || null, options);
}

function clearFinePMTilesRuntimeMetrics() {
  if (window.__gwFineHeatRuntimeMetrics instanceof Map) {
    window.__gwFineHeatRuntimeMetrics.clear();
  }
  queueRuntimeHeatMetricsChange();
}

window.getGridWildBaseMetricsForCell = getGridWildBaseMetricsForCell;
window.getGridWildRuntimeMetricsForCell = getGridWildRuntimeMetricsForCell;
window.getGridWildRuntimeMetricStats = function getGridWildRuntimeMetricStats() {
  return {
    finePMTilesCells: fineHeatRuntimeMetricCache().size,
    finePMTilesUsable: canUseFinePMTilesRuntimeMetrics()
  };
};

window.GridWildCoarseHeatCoverageIndex =
  window.GridWildCoarseHeatCoverageIndex ||
  (function () {
    let sourceCounts = null;
    let sourceSize = -1;
    const indexesByBin = new Map();

    function parseCellKey(key) {
      const comma = String(key).indexOf(",");
      if (comma <= 0) return null;

      const ix = Number(String(key).slice(0, comma));
      const iy = Number(String(key).slice(comma + 1));
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
      return { ix, iy };
    }

    function ensureFreshSource(counts) {
      if (counts === sourceCounts && counts?.size === sourceSize) return;
      sourceCounts = counts || null;
      sourceSize = counts?.size ?? -1;
      indexesByBin.clear();
    }

    function buildIndex(binSize, counts) {
      const normalizedBin = Math.max(1, Math.round(Number(binSize) || 1));
      const binsByX = new Map();
      let binCount = 0;
      let cellCount = 0;

      for (const [key, metrics] of counts.entries()) {
        if (!hasGridMetricSignal(metrics)) continue;

        const cell = parseCellKey(key);
        if (!cell) continue;

        const bx = Math.floor(cell.ix / normalizedBin) * normalizedBin;
        const by = Math.floor(cell.iy / normalizedBin) * normalizedBin;
        let ySet = binsByX.get(bx);
        if (!ySet) {
          ySet = new Set();
          binsByX.set(bx, ySet);
        }
        if (!ySet.has(by)) binCount++;
        ySet.add(by);
        cellCount++;
      }

      return { binSize: normalizedBin, binsByX, binCount, cellCount };
    }

    function getIndex(binSize) {
      const counts = window.__staticGridCounts;
      if (!(counts instanceof Map) || counts.size === 0) return null;

      ensureFreshSource(counts);

      const normalizedBin = Math.max(1, Math.round(Number(binSize) || 1));
      if (indexesByBin.has(normalizedBin)) return indexesByBin.get(normalizedBin);

      const index = window.GridWildVerboseConsole?.time
        ? window.GridWildVerboseConsole.time(
            `GridWildCoarseHeatCoverageIndex.build(${normalizedBin})`,
            () => buildIndex(normalizedBin, counts)
          )
        : buildIndex(normalizedBin, counts);
      indexesByBin.set(normalizedBin, index);
      return index;
    }

    function hasCoverage(binSize, startAnchorX, endAnchorX, startAnchorY, endAnchorY) {
      if (window.GridWildMeOverlayFilter?.isActive?.()) return true;
      if (window.GridWildPyriteLake?.isEnabled?.()) return true;

      const index = getIndex(binSize);
      if (!index?.binCount) return false;

      for (let ix = startAnchorX; ix <= endAnchorX; ix += index.binSize) {
        const ySet = index.binsByX.get(ix);
        if (!ySet) continue;

        for (let iy = startAnchorY; iy <= endAnchorY; iy += index.binSize) {
          if (ySet.has(iy)) return true;
        }
      }

      return false;
    }

    function invalidate() {
      sourceCounts = null;
      sourceSize = -1;
      indexesByBin.clear();
    }

    return {
      ensure: getIndex,
      hasCoverage,
      invalidate,
      stats: () => ({
        sourceSize,
        binIndexes: indexesByBin.size,
        bins: Array.from(indexesByBin.values()).map((index) => ({
          binSize: index.binSize,
          binCount: index.binCount,
          cellCount: index.cellCount
        }))
      })
    };
  })();

function scheduleCoarseHeatCoverageWarmup() {
  const warm = () => {
    if (!isCoarseHeatEnabled()) return;
    window.GridWildCoarseHeatCoverageIndex?.ensure?.(getEffectiveCoarseHeatBinSize());
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm, { timeout: 1500 });
  } else {
    window.setTimeout(warm, 0);
  }
}

function mergeMetricObjects(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (Number(target[key]) || 0) + (Number(value) || 0);
  }
}

function metricEntropy(values) {
  const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (!total) return 0;
  return values.reduce((h, value) => {
    const p = (Number(value) || 0) / total;
    return p > 0 ? h - p * Math.log2(p) : h;
  }, 0);
}

function mergeDisplayMetricRecords(records) {
  const usable = (records || []).filter(hasGridMetricSignal);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];

  const merged = {
    count: 0,
    species: 0,
    genera: 0,
    observers: 0,
    n_captive: 0,
    iconic_counts: {},
    month_totals: Array(12).fill(0),
    last_observed: null,
    median_last10_observed: null,
    last_observed_ms: 0,
    median_last10_observed_ms: 0,
    nActiveSquares: 0,
    source: "gold+pyrite"
  };

  for (const rec of usable) {
    merged.count += Number(rec.count) || 0;
    merged.species += Number(rec.species) || Number(rec.genera) || 0;
    merged.genera += Number(rec.genera) || Number(rec.species) || 0;
    merged.observers += Number(rec.observers) || 0;
    merged.n_captive += Number(rec.n_captive) || 0;
    merged.nActiveSquares += Number(rec.nActiveSquares) || ((Number(rec.count) || 0) > 0 ? 1 : 0);
    mergeMetricObjects(merged.iconic_counts, rec.iconic_counts);

    (rec.month_totals || []).forEach((value, index) => {
      if (index >= 0 && index < merged.month_totals.length) {
        merged.month_totals[index] += Number(value) || 0;
      }
    });

    const lastMs = Number(rec.last_observed_ms) || parseGridDateMs(rec.last_observed);
    if (lastMs > merged.last_observed_ms) {
      merged.last_observed_ms = lastMs;
      merged.last_observed = gridDateIsoFromMs(lastMs);
    }

    const medianMs =
      Number(rec.median_last10_observed_ms) || parseGridDateMs(rec.median_last10_observed);
    if (medianMs > merged.median_last10_observed_ms) {
      merged.median_last10_observed_ms = medianMs;
      merged.median_last10_observed = gridDateIsoFromMs(medianMs);
    }
  }

  const peak = Math.max(...merged.month_totals);
  const total = merged.month_totals.reduce((sum, value) => sum + value, 0);
  const dominant =
    Object.entries(merged.iconic_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

  merged.iconic_n = Object.keys(merged.iconic_counts).length;
  merged.dominant_iconic = dominant;
  merged.peak_month = merged.month_totals.indexOf(peak) + 1;
  merged.seasonal_strength = total ? peak / total : 0;
  merged.month_entropy = metricEntropy(merged.month_totals);
  merged.activity_score = Math.log1p(merged.count) * (1 + merged.genera * 0.05);

  return merged;
}

function warmRichMetricsForVisibleCells() {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  if (window.GridWildMeOverlayFilter?.isActive?.()) return;
  if (isCoarseHeatEnabled()) return;

  const lens = window.__gwState?.activeLens || "classic";
  const needsRichMetrics = coarseHeatLensNeedsRichMetrics(lens);

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

  return observerDict[String(observerId)] || observerDict[`id_${observerId}`] || null;
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
    const order = g?.order_name || "Unknown";
    const family = g?.family_name || "Unknown";
    const genus = g?.genus_name || "Unknown";

    const genusKey = [iconic, order, family, genus].join("||");
    const n = Math.max(1, Number(g?.count) || 1);

    const fixedPath = [
      { name: iconic, rank: "iconic_taxon" },
      { name: order, rank: "order" },
      { name: family, rank: "family" },
      { name: genus, rank: "genus" }
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
  const kids = Array.from(node.children.values()).sort(
    (a, b) =>
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
    children: kids.map((child) => finalizeTree(child, node.name, out))
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
    (node.children || []).forEach((child) => walk(child, node));
  }

  walk(root);
  return { nodes, edges };
}

function slugifyCladoName(s) {
  return (
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node"
  );
}

function annotateTreePaths(node, parentPath = "root") {
  const myPath = node.depth === 0 ? "root" : `${parentPath}/${slugifyCladoName(node.name)}`;

  node._path = myPath;
  (node.children || []).forEach((child) => annotateTreePaths(child, myPath));
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

  for (const child of node.children || []) {
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
  const sat = 28 + 58 * diversityFrac; // low diversity = duller
  const light = 70 - 20 * diversityFrac; // high diversity = a bit darker/richer

  return `hsl(${baseHue}, ${sat}%, ${light}%)`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
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

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z"
  ].join(" ");
}

function getDisplayName(node) {
  return (
    window.GridWildTaxonomy?.displayName?.(node.rank, node.name) ||
    window.GridWildTaxonomy?.displayName?.("iconic_taxon", node.name) ||
    node.name
  );
}

function renderPieSvg(node) {
  const mobile = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const W = 260;
  const H = mobile ? 10 : 240;
  const cx = 130;
  const cy = mobile ? 5 : 120;
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
  const maxDiversity = Math.max(...kids.map((k) => k.genusCount || 0), 1);

  let cursor = 0;
  const slices = kids
    .map((child, i) => {
      const value = Math.max(1, child.weight || 1);
      const frac = value / total;
      const startAngle = cursor * 360;
      const endAngle = (cursor + frac) * 360;
      cursor += frac;

      const mid = 0.5 * (startAngle + endAngle);
      const labelPt = polarToCartesian(cx, cy, 62, mid);

      // const fill = colorForPieDepth(child.depth || 1, i / Math.max(1, kids.length - 1));
      const diversityFrac = (child.genusCount || 0) / maxDiversity;
      const fill = colorForPieSlice(child, diversityFrac, i / Math.max(1, kids.length - 1));

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
        ${
          frac > 0.06
            ? `
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
        `
            : ""
        }
      </g>
    `;
    })
    .join("");

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
      ${
        showSmallText
          ? `
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10.5" opacity="0.64">
          tap slice to drill in
        </text>
      `
          : ""
      }
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
      subtitleEl.textContent = `Center ${CENTER_MACRO_SIZE_CELLS}×${CENTER_MACRO_SIZE_CELLS} square taxonomy: iconic taxon → order → family → genus; slice size = observations, color vividness = genus diversity`;
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

  for (const child of node.children || []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

// Optional: style (grid lines)
const GRID_LINE_STYLE = {
  pane: "gridPane",
  interactive: false,
  weight: 0.8,
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
  const fillOpacity = 0.1 + 0.55 * Math.pow(t, 0.85);

  return { fillColor, fillOpacity };
}

function metricsToFill(metrics) {
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
  const endX = snapUp(maxX, GRID_SIZE_M);
  const startY = snapDown(minY, GRID_SIZE_M);
  const endY = snapUp(maxY, GRID_SIZE_M);

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

window.updateGridHeatmap = function (results) {
  // Keep caching results for popup logic, etc.
  window.__inatLastResults = Array.isArray(results) ? results : [];
};

// Grid lines rendering
function updateGridLines() {
  gridLineLayer.clearLayers();

  const { ix0, iy0 } = getVisualGridMacroAnchor();
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

let __lastGridWildHudCenterRefreshKey = null;

function getCenterMacroRefreshKey() {
  const { ix0, iy0 } = getCenterMacroAnchor();
  return `${ix0},${iy0}`;
}

function isGridWildInfoPanelVisible() {
  const sheet = document.getElementById("sheetInfo");
  return sheet?.classList?.contains("is-open") === true;
}

function refreshGridWildHudPanels(options = {}) {
  return timeGridWildVerbose("refreshGridWildHudPanels", () => {
    const force = options.force === true;
    const key = getCenterMacroRefreshKey();

    if (!force) {
      if (!isGridWildInfoPanelVisible()) return false;
      if (key === __lastGridWildHudCenterRefreshKey) return false;
    }

    __lastGridWildHudCenterRefreshKey = key;

    if (typeof window.updateHudCenterSummary === "function") {
      timeGridWildVerbose("updateHudCenterSummary", () => window.updateHudCenterSummary());
    }

    if (typeof window.updateTopObserversPanel === "function") {
      timeGridWildVerbose("updateTopObserversPanel", () => window.updateTopObserversPanel());
    }

    if (typeof window.updateHudCladogram === "function") {
      timeGridWildVerbose("updateHudCladogram", () => window.updateHudCladogram());
    }

    return true;
  });
}

window.refreshGridWildHudPanels = refreshGridWildHudPanels;

// this now renders the static assets
function updateGrid() {
  return timeGridWildVerbose("updateGrid", () => {
    timeGridWildVerbose("updateGrid.markCenterMacroVisitedByGodsEye", () =>
      markCenterMacroVisitedByGodsEye()
    );
    timeGridWildVerbose("updateGridLines", () => updateGridLines());
    timeGridWildVerbose("updateStaticGridHeat", () => updateStaticGridHeat());
    timeGridWildVerbose("updateGrid.refreshGridWildHudPanels", () => refreshGridWildHudPanels());
  });
}

if (window.GridWildMapMotionQueue?.subscribe) {
  window.GridWildMapMotionQueue.subscribe("grid-heat-motion", scheduleGridHeatCanvasRender);
} else {
  map.on("move zoom resize viewreset zoomend moveend", scheduleGridHeatCanvasRender);
}
window.addEventListener("gridwild:mapbearingchange", () => {
  scheduleGridHeatCanvasRender({ force: true, reason: "map-bearing-changed" });
});
map.on("movestart zoomstart", beginGridHeatMotion);
map.on("moveend zoomend", endGridHeatMotion);
map.on("zoomend resize moveend", updateGrid);
updateGrid();

scheduleGridWildStaticAssetsLoad(1200);

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
  if (count < 5) return { label: "Lightly Scouted", badge: "SCOUT" };
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
    .map((g) => `${g.genus_name} (${g.count})`)
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
            metrics.count > 0 ? `${Math.round((100 * metrics.n_captive) / metrics.count)}%` : "0%"
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

// Attach the dblclick behavior
window.enableGridRPGPopup = function enableGridRPGPopup() {
  map.off("dblclick", __onGridDblClick);
  map.on("dblclick", __onGridDblClick);
};

async function __onGridDblClick(e) {
  if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault();
  if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();

  if (window.GridWildHudActionMenu?.showPatchHere) {
    await window.GridWildHudActionMenu.showPatchHere(e.latlng);
    return;
  }

  if (window.GridWildPatches?.showPatchViewAtLatLng) {
    const rows =
      (await window.GridWildPatches.showPatchViewAtLatLng(e.latlng, {
        includeINatProjects: false,
        debug: true
      })) || [];
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(
        rows.length
          ? `Showing ${rows.length} patch${rows.length === 1 ? "" : "es"} here.`
          : "No patch geometry found here."
      );
    }
    return;
  }

  if (typeof window.showGridWildToast === "function") {
    window.showGridWildToast("Patch tools are still loading.");
  }
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

  if (visible) {
    ensureGridWildStaticAssetsLoaded().catch((err) =>
      console.warn("GridWild heat assets unavailable.", err)
    );
  }

  ensureGridHeatCanvas();
  gridHeatCanvas.style.display = visible ? "block" : "none";

  if (!visible && gridHeatCtx) {
    const size = map.getSize();
    gridHeatCtx.clearRect(0, 0, size.x, size.y);
  }

  scheduleGridHeatCanvasRender();
};
// End allow  UI to toggle the heat overlay

const STATIC_HEAT_CSV_WORKER_URL = "js/gw-heat-csv-worker.js";
const STATIC_HEAT_FALLBACK_YIELD_ROWS = 1500;

function staticHeatMetricsFromRow(row) {
  return {
    count: row[1],
    species: row[2],
    observers: row[3],
    n_captive: row[4],
    last_observed: row[5],
    median_last10_observed: row[6],
    last_observed_ms: row[7],
    median_last10_observed_ms: row[8]
  };
}

function loadStaticHeatmapCsvInWorker(url) {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL(STATIC_HEAT_CSV_WORKER_URL, document.baseURI);
    const heatUrl = new URL(url, document.baseURI).href;
    const worker = new Worker(workerUrl);
    const counts = new Map();
    let settled = false;

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    }

    worker.onmessage = (event) => {
      const message = event.data || {};

      if (message.type === "chunk") {
        for (const row of message.rows || []) {
          counts.set(row[0], staticHeatMetricsFromRow(row));
        }
        return;
      }

      if (message.type === "warning") {
        console.warn(message.message);
        return;
      }

      if (message.type === "done") {
        finish(resolve, counts);
        return;
      }

      if (message.type === "error") {
        finish(reject, new Error(message.message || "Static heat CSV worker failed."));
      }
    };

    worker.onerror = (event) => {
      finish(reject, new Error(event.message || "Static heat CSV worker failed."));
    };

    worker.postMessage({ url: heatUrl });
  });
}

function parseStaticHeatCsvColumns(header) {
  const columns = header.split(",").map((value) => value.trim());
  const col = (...names) => {
    for (const name of names) {
      const index = columns.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };

  return {
    ix: col("ix"),
    iy: col("iy"),
    count: col("count"),
    species: col("species", "n_species", "n_genera"),
    observers: col("observers", "n_observers"),
    captive: col("n_captive"),
    lastObserved: col("last_observed"),
    medianLast10: col("median_last10_observed")
  };
}

function yieldStaticHeatFallback() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function loadStaticHeatmapCsvFallback(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await response.text();
  const counts = new Map();
  let cursor = 0;
  let columns = null;
  let rowsSinceYield = 0;

  while (cursor < text.length) {
    const nextBreak = text.indexOf("\n", cursor);
    const end = nextBreak >= 0 ? nextBreak : text.length;
    const line = text.slice(cursor, end).replace(/\r$/, "");
    cursor = nextBreak >= 0 ? nextBreak + 1 : text.length;

    if (!line.trim()) continue;

    if (!columns) {
      columns = parseStaticHeatCsvColumns(line.trim().toLowerCase());
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 5) continue;

    const ix = Number(parts[columns.ix]);
    const iy = Number(parts[columns.iy]);
    const count = Number(parts[columns.count]);
    const species = Number(parts[columns.species]);
    const observers = Number(parts[columns.observers]);
    const nCaptive = columns.captive >= 0 ? Number(parts[columns.captive] ?? 0) : 0;

    if (
      !Number.isFinite(ix) ||
      !Number.isFinite(iy) ||
      !Number.isFinite(count) ||
      !Number.isFinite(species) ||
      !Number.isFinite(observers) ||
      !Number.isFinite(nCaptive)
    ) {
      continue;
    }

    const lastObserved = columns.lastObserved >= 0 ? parts[columns.lastObserved] || null : null;
    const medianLast10Observed =
      columns.medianLast10 >= 0 ? parts[columns.medianLast10] || null : null;

    counts.set(`${ix},${iy}`, {
      count,
      species,
      observers,
      n_captive: nCaptive,
      last_observed: lastObserved,
      median_last10_observed: medianLast10Observed,
      last_observed_ms: parseGridDateMs(lastObserved),
      median_last10_observed_ms: parseGridDateMs(medianLast10Observed)
    });

    rowsSinceYield++;
    if (rowsSinceYield >= STATIC_HEAT_FALLBACK_YIELD_ROWS) {
      rowsSinceYield = 0;
      await yieldStaticHeatFallback();
    }
  }

  return counts;
}

function installStaticHeatmapCounts(counts) {
  window.__staticGridCounts = counts;
  window.__gwStaticHeatLoaded = true;
  window.GridWildCoarseHeatCoverageIndex?.invalidate?.();
  window.GridWildCoarseHeatCache?.invalidate?.();
  scheduleCoarseHeatCoverageWarmup();
  window.dispatchEvent(
    new CustomEvent("gridwild:staticheatloaded", {
      detail: { count: counts?.size || 0 }
    })
  );

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

async function loadStaticHeatmapCsv(url) {
  let counts = null;

  if (typeof Worker === "function") {
    try {
      counts = await loadStaticHeatmapCsvInWorker(url);
    } catch (err) {
      console.warn("Static heat CSV worker unavailable; using yielding parser.", err);
    }
  }

  if (!counts) {
    counts = await loadStaticHeatmapCsvFallback(url);
  }

  installStaticHeatmapCounts(counts);
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

function getHeatZThresholdDirection() {
  return window.__gwState?.heatZThresholdDirection === "below" ? "below" : "above";
}

function buildZStats(values) {
  const nums = values.map(Number).filter(Number.isFinite);

  if (!nums.length) return null;

  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const variance =
    nums.reduce((sum, value) => {
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
  const direction = getHeatZThresholdDirection();
  const z = stats.sd > 0 ? ((Number(value) || 0) - stats.mean) / stats.sd : 0;
  return direction === "below" ? z <= threshold : z >= threshold;
}

const HEAT_MORPH_DEFAULT_MIN_SIZE = 10;
const HEAT_MORPH_MAX_SIZE = 999;
const HEAT_MORPH_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

function clampHeatMorphSize(value, fallback) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : fallback;
  return Math.max(1, Math.min(HEAT_MORPH_MAX_SIZE, Math.round(next)));
}

function getHeatMorphologySettings() {
  const state = window.__gwState || {};
  return {
    minEnabled: state.heatMorphMinEnabled === true,
    minSize: clampHeatMorphSize(state.heatMorphMinSize, HEAT_MORPH_DEFAULT_MIN_SIZE)
  };
}

function isHeatMorphologyEnabled() {
  if (!isHeatZThresholdEnabled()) return false;
  const settings = getHeatMorphologySettings();
  return settings.minEnabled;
}

function parseHeatCellKey(key) {
  const parts = String(key || "").split(",");
  if (parts.length !== 2) return null;
  const ix = Number(parts[0]);
  const iy = Number(parts[1]);
  return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy } : null;
}

function heatNeighborKey(ix, iy, dx, dy, step = 1) {
  return `${ix + dx * step},${iy + dy * step}`;
}

function removeSmallHeatComponents(activeKeys, minSize, step = 1) {
  if (minSize <= 1) return new Set(activeKeys);

  const kept = new Set();
  const visited = new Set();

  for (const key of activeKeys) {
    if (visited.has(key)) continue;

    const start = parseHeatCellKey(key);
    if (!start) continue;

    const stack = [key];
    const component = [];
    visited.add(key);

    while (stack.length) {
      const currentKey = stack.pop();
      const cell = parseHeatCellKey(currentKey);
      if (!cell) continue;
      component.push(currentKey);

      for (const [dx, dy] of HEAT_MORPH_OFFSETS) {
        const nextKey = heatNeighborKey(cell.ix, cell.iy, dx, dy, step);
        if (!activeKeys.has(nextKey) || visited.has(nextKey)) continue;
        visited.add(nextKey);
        stack.push(nextKey);
      }
    }

    if (component.length >= minSize) {
      for (const componentKey of component) kept.add(componentKey);
    }
  }

  return kept;
}

function buildThresholdedHeatMorphologyMask(items, heatZStats, options = {}) {
  const step = Math.max(1, Math.round(Number(options.step) || 1));
  const settings = getHeatMorphologySettings();
  const itemMap = new Map();
  let activeKeys = new Set();

  for (const item of items || []) {
    if (!item?.key) continue;
    itemMap.set(item.key, item);
    if (passesHeatZThreshold(item.heatValue, heatZStats)) activeKeys.add(item.key);
  }

  if (!itemMap.size) return activeKeys;

  if (settings.minEnabled) {
    activeKeys = removeSmallHeatComponents(activeKeys, settings.minSize, step);
  }

  return activeKeys;
}

function collectRegularHeatItems(counts, startX, endX, startY, endY) {
  const items = [];

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics = window.__richGridMetrics?.get(key) || counts.get(key) || null;

      const displayMetrics = getDisplayMetricsForCell(ix, iy, metrics);
      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;

      items.push({
        ix,
        iy,
        key,
        x,
        y,
        metrics: displayMetrics,
        heatValue
      });
    }
  }

  return items;
}

function collectMeHeatItems(entries = []) {
  return entries
    .map((entry) => {
      const heatValue = getHeatValueForCell(entry.metrics);
      if (heatValue <= 0) return null;
      return {
        ix: entry.ix,
        iy: entry.iy,
        key: entry.key,
        metrics: entry.metrics,
        heatValue
      };
    })
    .filter(Boolean);
}

function collectRegularHeatZStats(counts, startX, endX, startY, endY) {
  const values = [];

  if (window.GridWildMeOverlayFilter?.isActive?.()) {
    const entries = window.GridWildMeOverlayFilter.entriesInMeterBounds(startX, endX, startY, endY);
    for (const entry of entries) {
      const heatValue = getHeatValueForCell(entry.metrics);
      if (heatValue > 0) values.push(heatValue);
    }
    return buildZStats(values);
  }

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics = window.__richGridMetrics?.get(key) || counts.get(key) || null;

      const displayMetrics = getDisplayMetricsForCell(ix, iy, metrics);

      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue > 0) values.push(heatValue);
    }
  }

  return buildZStats(values);
}

function isCoarseHeatEnabled() {
  return window.__gwState?.coarseHeatEnabled === true || shouldAutoCoarseHeat();
}

function getCoarseHeatBinSize() {
  const raw = Number(window.__gwState?.coarseHeatBinSize);
  if (!Number.isFinite(raw)) return 8;
  return Math.max(2, Math.min(64, Math.round(raw)));
}

function getEffectiveCoarseHeatBinSize() {
  if (gridHeatMotionState.active && Number.isFinite(gridHeatMotionState.frozenEffectiveBinSize)) {
    return gridHeatMotionState.frozenEffectiveBinSize;
  }

  return getAutoCoarseHeatBinSize() || getCoarseHeatBinSize();
}

function getHeatMapMetersPerPixel() {
  const zoom = map.getZoom();
  const lat = map.getCenter().lat;
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function getHeatMapZoomMultiplier() {
  return Math.pow(2, map.getZoom() - 17);
}

function normalizeAutoCoarseHeatBinSize(binSize) {
  const requested = Math.round(Number(binSize) || 0);
  if (requested <= 0) return 0;
  return (
    COARSE_HEAT_AUTO_BIN_SIZES.find((allowedBinSize) => allowedBinSize >= requested) ||
    COARSE_HEAT_AUTO_BIN_SIZES[COARSE_HEAT_AUTO_BIN_SIZES.length - 1] ||
    requested
  );
}

function commitCoarseHeatAutoBinSize(binSize, mapZoom = Number(map.getZoom()) || 0) {
  coarseHeatAutoState.binSize = Number.isFinite(binSize) ? binSize : 0;
  coarseHeatAutoState.mapZoom = Number.isFinite(mapZoom) ? mapZoom : null;
  coarseHeatAutoState.changedAt = Date.now();
  return coarseHeatAutoState.binSize;
}

function applyCoarseHeatAutoHysteresis(binSize) {
  const nextBinSize = Number.isFinite(binSize) ? binSize : 0;
  const currentBinSize = Number.isFinite(coarseHeatAutoState.binSize)
    ? coarseHeatAutoState.binSize
    : 0;
  const mapZoom = Number(map.getZoom()) || 0;

  if (!currentBinSize || nextBinSize === currentBinSize) {
    return commitCoarseHeatAutoBinSize(nextBinSize, mapZoom);
  }

  const lastZoom = Number(coarseHeatAutoState.mapZoom);
  const zoomDelta = Number.isFinite(lastZoom) ? Math.abs(mapZoom - lastZoom) : Infinity;
  if (zoomDelta < COARSE_HEAT_AUTO_HYSTERESIS_ZOOM_DELTA) {
    return currentBinSize;
  }

  return commitCoarseHeatAutoBinSize(nextBinSize, mapZoom);
}

function computeAutoCoarseHeatBinSize() {
  const metersPerPixel = getHeatMapMetersPerPixel();
  const zoomMultiplier = getHeatMapZoomMultiplier();
  if (!(metersPerPixel > 0)) return 0;

  for (const step of COARSE_HEAT_AUTO_STEPS) {
    if (
      Number.isFinite(step.maxZoomMultiplier) &&
      Number.isFinite(zoomMultiplier) &&
      zoomMultiplier <= step.maxZoomMultiplier
    ) {
      return normalizeAutoCoarseHeatBinSize(step.binSize);
    }

    if (!Number.isFinite(step.scaleFt)) continue;

    const scaleMeters = step.scaleFt / FEET_PER_METER;
    const scalePx = scaleMeters / metersPerPixel;
    if (scalePx <= COARSE_HEAT_AUTO_SCALE_PX) {
      return normalizeAutoCoarseHeatBinSize(step.binSize);
    }
  }

  return 0;
}

function getAutoCoarseHeatBinSize() {
  if (gridHeatMotionState.active && Number.isFinite(gridHeatMotionState.frozenAutoBinSize)) {
    return gridHeatMotionState.frozenAutoBinSize;
  }

  return applyCoarseHeatAutoHysteresis(computeAutoCoarseHeatBinSize());
}

function shouldAutoCoarseHeat() {
  return getAutoCoarseHeatBinSize() > 0;
}

function getCoarseHeatState() {
  const manualEnabled = window.__gwState?.coarseHeatEnabled === true;
  const autoBinSize = getAutoCoarseHeatBinSize();
  const autoEnabled = autoBinSize > 0;
  const savedBinSize = getCoarseHeatBinSize();
  const effectiveBinSize = autoEnabled ? autoBinSize : savedBinSize;

  return {
    manualEnabled,
    autoEnabled,
    autoBinSize,
    enabled: manualEnabled || autoEnabled,
    savedBinSize,
    effectiveBinSize
  };
}

function syncCoarseHeatCheckbox(el, state) {
  if (!el) return;

  el.checked = state.enabled;
  el.indeterminate = state.autoEnabled && !state.manualEnabled;
  el.disabled = state.autoEnabled;
  el.dataset.gwAutoCoarse = state.autoEnabled ? "true" : "false";
  el.title = state.autoEnabled
    ? `Coarse enforced at ${state.effectiveBinSize} for this zoom`
    : "Coarse median heat";
}

function syncCoarseHeatControls() {
  const state = getCoarseHeatState();
  syncCoarseHeatCheckbox(document.getElementById("toggleSuperchunkHeat"), state);
  syncCoarseHeatCheckbox(document.getElementById("toggleSuperchunkHeat_hud"), state);
  syncCoarseHeatCheckbox(document.getElementById("toggleSuperchunkHeat_clone"), state);

  const binButton = document.getElementById("gwCoarseHeatBinBtn");
  if (binButton) {
    binButton.textContent = String(state.effectiveBinSize);
    binButton.title = state.autoEnabled
      ? `Auto Coarse ${state.effectiveBinSize}; saved manual size ${state.savedBinSize}`
      : "Set heat bin size";
  }

  return state;
}

window.getGridWildCoarseHeatState = getCoarseHeatState;
window.syncGridWildCoarseHeatControls = syncCoarseHeatControls;

// Coarse heat bin cache. The key includes a render signature because source
// membership depends on the active metric and overlay filters.
window.GridWildCoarseHeatCache =
  window.GridWildCoarseHeatCache ||
  (function () {
    const MAX_ENTRIES = 20000;
    const EMPTY_RESULT = Symbol("empty coarse heat bin");
    let dataVersion = 0;
    let cache = new Map();
    let hits = 0;
    let misses = 0;
    let emptyHits = 0;

    function makeKey(anchorIx, anchorIy, binSize, signature = "") {
      return `${dataVersion}|${signature}|${binSize}|${anchorIx}|${anchorIy}`;
    }

    function readValue(value) {
      return value === EMPTY_RESULT ? null : value;
    }

    function get(anchorIx, anchorIy, binSize, signature, compute) {
      if (typeof signature === "function") {
        compute = signature;
        signature = "";
      }

      const key = makeKey(anchorIx, anchorIy, binSize, signature);
      if (cache.has(key)) {
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);
        hits++;
        if (value === EMPTY_RESULT) emptyHits++;
        return readValue(value);
      }

      misses++;
      const value = compute();
      cache.set(key, value == null ? EMPTY_RESULT : value);

      if (cache.size > MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }

      return value;
    }

    function invalidate() {
      dataVersion++;
      cache.clear();
      hits = 0;
      misses = 0;
      emptyHits = 0;
    }

    return {
      get,
      invalidate,
      size: () => cache.size,
      stats: () => ({ size: cache.size, hits, misses, emptyHits, dataVersion })
    };
  })();

window.GridWildCoarseHeatTileCache =
  window.GridWildCoarseHeatTileCache ||
  (function () {
    const MAX_ENTRIES = COARSE_HEAT_TILE_CACHE_MAX;
    const cache = new Map();
    let hits = 0;
    let misses = 0;

    function get(key, compute) {
      if (cache.has(key)) {
        const value = cache.get(key);
        cache.delete(key);
        cache.set(key, value);
        hits++;
        return value;
      }

      misses++;
      const value = compute();
      if (value == null) return value;

      cache.set(key, value);

      while (cache.size > MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }

      return value;
    }

    function peek(key) {
      if (!cache.has(key)) return null;
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      hits++;
      return value;
    }

    function invalidate() {
      cache.clear();
      hits = 0;
      misses = 0;
    }

    return {
      get,
      peek,
      invalidate,
      size: () => cache.size,
      stats: () => ({ size: cache.size, hits, misses })
    };
  })();

window.GridWildCoarsePyramid =
  window.GridWildCoarsePyramid ||
  (function () {
    const MAX_TILE_CACHE = 160;
    const EMPTY_TILE = Symbol("empty coarse pyramid tile");
    let manifest = null;
    let manifestPromise = null;
    let manifestFailed = false;
    let levelsByBin = new Map();
    const tileCache = new Map();
    const tilePending = new Map();
    let requestedTiles = 0;
    let loadedTiles = 0;
    let failedTiles = 0;
    let lastRender = null;

    function buildIndex(nextManifest) {
      const nextLevels = new Map();
      for (const level of nextManifest?.levels || []) {
        const binSize = Math.round(Number(level?.bin_size) || 0);
        if (!binSize) continue;
        const tilesByKey = new Map();
        for (const tile of level.tiles || []) {
          if (!tile?.file) continue;
          tilesByKey.set(`${Number(tile.tile_ix)},${Number(tile.tile_iy)}`, tile);
        }
        nextLevels.set(binSize, { ...level, tilesByKey });
      }
      levelsByBin = nextLevels;
    }

    function ensureManifest() {
      if (manifest || manifestFailed) return manifest;
      if (manifestPromise) return null;
      if (!window.GridWildAssets?.loadCoarsePyramidManifest) return null;

      manifestPromise = window.GridWildAssets.loadCoarsePyramidManifest()
        .then((nextManifest) => {
          manifest = nextManifest || null;
          manifestFailed = !manifest;
          if (manifest) buildIndex(manifest);
          if (typeof scheduleGridHeatCanvasRender === "function" && isCoarseHeatEnabled()) {
            scheduleGridHeatCanvasRender({ force: true });
          }
          return manifest;
        })
        .catch((err) => {
          manifestFailed = true;
          console.warn("GridWild coarse pyramid unavailable.", err);
          return null;
        })
        .finally(() => {
          manifestPromise = null;
        });

      return null;
    }

    function levelForBin(binSize) {
      ensureManifest();
      return levelsByBin.get(Math.round(Number(binSize) || 0)) || null;
    }

    function levels() {
      ensureManifest();
      return Array.from(levelsByBin.values()).sort(
        (a, b) => Number(a.bin_size) - Number(b.bin_size)
      );
    }

    function isManifestPending() {
      return Boolean(manifestPromise);
    }

    function touchCache(key, value) {
      tileCache.set(key, value);
      while (tileCache.size > MAX_TILE_CACHE) {
        const oldestKey = tileCache.keys().next().value;
        tileCache.delete(oldestKey);
      }
    }

    function readCacheValue(value) {
      return value === EMPTY_TILE ? null : value;
    }

    function tileStatus(level, tileIx, tileIy) {
      if (!level) return "missing";
      const key = `${level.bin_size}:${tileIx}:${tileIy}`;
      if (tileCache.has(key)) {
        return tileCache.get(key) === EMPTY_TILE ? "empty" : "cached";
      }
      if (!level.tilesByKey?.has?.(`${tileIx},${tileIy}`)) return "empty";
      if (tilePending.has(key)) return "pending";
      return "missing";
    }

    function tileFor(level, tileIx, tileIy, options = {}) {
      if (!level) return null;
      const key = `${level.bin_size}:${tileIx}:${tileIy}`;
      if (tileCache.has(key)) {
        const cached = tileCache.get(key);
        tileCache.delete(key);
        tileCache.set(key, cached);
        return readCacheValue(cached);
      }

      const tileManifest = level.tilesByKey?.get?.(`${tileIx},${tileIy}`) || null;
      if (!tileManifest) {
        touchCache(key, EMPTY_TILE);
        return null;
      }

      if (tilePending.has(key)) return null;
      if (options.fetch === false) return null;
      if (!window.GridWildAssets?.coarsePyramidTileUrl) return null;

      requestedTiles++;
      const job = window.GridWildAssets.coarsePyramidTileUrl(tileManifest.file)
        .then((url) => {
          if (!url) throw new Error(`No URL for coarse pyramid tile ${tileManifest.file}`);
          return fetch(url);
        })
        .then((resp) => {
          if (!resp.ok) {
            if (resp.status === 404) {
              touchCache(key, EMPTY_TILE);
              return null;
            }
            throw new Error(`HTTP ${resp.status} for ${tileManifest.file}`);
          }
          return resp.json();
        })
        .then((tile) => {
          if (tile?.cells) {
            loadedTiles++;
            touchCache(key, tile);
          }
          return tile;
        })
        .catch((err) => {
          failedTiles++;
          console.warn("GridWild coarse pyramid tile unavailable.", err);
          touchCache(key, EMPTY_TILE);
          return null;
        })
        .finally(() => {
          tilePending.delete(key);
          if (typeof scheduleGridHeatCanvasRender === "function" && isCoarseHeatEnabled()) {
            scheduleGridHeatCanvasRender({ force: true });
          }
        });

      tilePending.set(key, job);
      return null;
    }

    function invalidate() {
      tileCache.clear();
      tilePending.clear();
      requestedTiles = 0;
      loadedTiles = 0;
      failedTiles = 0;
      lastRender = null;
    }

    function recordRender(info) {
      lastRender = {
        ...(info || {}),
        at: Date.now()
      };
    }

    function stats() {
      return {
        manifestLoaded: Boolean(manifest),
        manifestPending: isManifestPending(),
        manifestFailed,
        levels: Array.from(levelsByBin.keys()).sort((a, b) => a - b),
        cachedTiles: tileCache.size,
        pendingTiles: tilePending.size,
        requestedTiles,
        loadedTiles,
        failedTiles,
        buildId: manifest?.build_id || null,
        lastRender
      };
    }

    return {
      ensureManifest,
      levelForBin,
      levels,
      isManifestPending,
      tileStatus,
      tileFor,
      invalidate,
      recordRender,
      stats
    };
  })();

window.getGridWildCoarsePyramidStats = function getGridWildCoarsePyramidStats() {
  return window.GridWildCoarsePyramid?.stats?.() || null;
};

window.GridWildPMTilesHeat =
  window.GridWildPMTilesHeat ||
  (function () {
    const EMPTY_TILE = Symbol("empty pmtiles tile");
    let importsPromise = null;
    let imports = null;
    let importsFailed = false;
    let sourcePromise = null;
    let sourceInfo = null;
    let sourceFailed = false;
    let sourceError = null;
    let shardInfo = undefined;
    let shardInfoPromise = null;
    let shardInfoFailed = false;
    let shardInfoError = null;
    const shardSources = new Map();
    const shardSourcePending = new Map();
    const shardSourceFailures = new Map();
    const tileCache = new Map();
    const tilePending = new Map();
    let requestedTiles = 0;
    let loadedTiles = 0;
    let emptyTiles = 0;
    let failedTiles = 0;
    let decodedFeatures = 0;
    let lastRender = null;

    function scheduleHeatRender() {
      if (typeof scheduleGridHeatCanvasRender === "function") {
        scheduleGridHeatCanvasRender({ force: true });
      }
    }

    function loadImports() {
      if (imports) return Promise.resolve(imports);
      if (importsFailed) return Promise.resolve(null);
      if (importsPromise) return importsPromise;

      importsPromise = Promise.all([
        import(PMTILES_HEAT_MODULE_URLS.pmtiles),
        import(PMTILES_HEAT_MODULE_URLS.vectorTile),
        import(PMTILES_HEAT_MODULE_URLS.pbf)
      ])
        .then(([pmtilesModule, vectorTileModule, pbfModule]) => {
          const PMTilesCtor = pmtilesModule.PMTiles || pmtilesModule.default?.PMTiles;
          const VectorTileCtor =
            vectorTileModule.VectorTile ||
            vectorTileModule.default?.VectorTile ||
            vectorTileModule.default;
          const PbfCtor = pbfModule.default || pbfModule.Pbf || pbfModule;

          if (!PMTilesCtor || !VectorTileCtor || !PbfCtor) {
            throw new Error("PMTiles heat decoder modules did not expose expected constructors.");
          }

          imports = { PMTilesCtor, VectorTileCtor, PbfCtor };
          return imports;
        })
        .catch((err) => {
          importsFailed = true;
          console.warn("GridWild PMTiles heat decoder unavailable.", err);
          return null;
        })
        .finally(() => {
          importsPromise = null;
        });

      return importsPromise;
    }

    function readHeaderZoom(header, keys, fallback) {
      for (const key of keys) {
        const value = Number(header?.[key]);
        if (Number.isFinite(value)) return Math.round(value);
      }
      return fallback;
    }

    function makeRangeSource(url) {
      async function cancelResponseBody(resp) {
        try {
          await resp.body?.cancel?.();
        } catch {
          // Best-effort guard against accidentally downloading a full PMTiles object.
        }
      }

      return {
        getKey() {
          return url;
        },

        async getBytes(offset, length, signal, expectedEtag) {
          const headers = new Headers();
          const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
          headers.set("Range", rangeHeader);

          const resp = await fetch(url, {
            signal,
            cache: "no-store",
            mode: "cors",
            headers
          });

          const contentLengthHeader = resp.headers.get("Content-Length");
          const contentRangeHeader = resp.headers.get("Content-Range");
          const contentLength = Number(contentLengthHeader);
          const etag = resp.headers.get("ETag") || undefined;

          if (resp.status >= 300) {
            await cancelResponseBody(resp);
            throw new Error(`PMTiles range request failed: HTTP ${resp.status}`);
          }

          if (expectedEtag && etag && etag !== expectedEtag) {
            throw new Error("PMTiles range request returned a different ETag.");
          }

          if (resp.status === 200 && (!Number.isFinite(contentLength) || contentLength > length)) {
            await cancelResponseBody(resp);
            throw new Error(
              `PMTiles range request returned full content: status=${resp.status}, range=${rangeHeader}, contentRange=${contentRangeHeader || "missing"}, contentLength=${contentLengthHeader || "missing"}, requested=${length}.`
            );
          }

          return {
            data: await resp.arrayBuffer(),
            etag,
            cacheControl: resp.headers.get("Cache-Control") || undefined,
            expires: resp.headers.get("Expires") || undefined
          };
        }
      };
    }

    async function openPMTilesSource(assetInfo, modules) {
      const source = new modules.PMTilesCtor(makeRangeSource(assetInfo.url));
      const header = await source.getHeader();
      return {
        ...assetInfo,
        source,
        header,
        minZoom: readHeaderZoom(header, ["minZoom", "min_zoom", "minzoom"], 0),
        maxZoom: readHeaderZoom(header, ["maxZoom", "max_zoom", "maxzoom"], 19),
        layer: assetInfo.layer || "gridwild_cells",
        modules
      };
    }

    function ensureShardInfo() {
      if (shardInfo !== undefined || shardInfoFailed) return shardInfo;
      if (shardInfoPromise) return undefined;
      if (!window.GridWildAssets?.pmtilesShardsInfo) {
        shardInfo = null;
        return shardInfo;
      }

      shardInfoPromise = window.GridWildAssets.pmtilesShardsInfo()
        .then((info) => {
          shardInfo = info?.shards?.length ? info : null;
          return shardInfo;
        })
        .catch((err) => {
          shardInfo = null;
          shardInfoFailed = true;
          shardInfoError = err?.message || String(err);
          console.warn("GridWild PMTiles shard manifest unavailable.", err);
          return null;
        })
        .finally(() => {
          shardInfoPromise = null;
          scheduleHeatRender();
        });

      return undefined;
    }

    function ensureShardSource(shard, modules) {
      const id = shard?.id || shard?.file || shard?.url;
      if (!id || !shard?.url) return null;
      if (shardSources.has(id)) return shardSources.get(id);
      if (shardSourceFailures.has(id)) return null;
      if (shardSourcePending.has(id)) return null;

      const assetInfo = {
        ...shard,
        id,
        file: shard.file || null,
        layer: shard.layer || shardInfo?.layer || "gridwild_cells",
        payload: shard.payload || shardInfo?.payload || null
      };

      const job = openPMTilesSource(assetInfo, modules)
        .then((info) => {
          shardSources.set(id, info);
          return info;
        })
        .catch((err) => {
          shardSourceFailures.set(id, err?.message || String(err));
          console.warn("GridWild PMTiles shard unavailable.", { shard: id, error: err });
          return null;
        })
        .finally(() => {
          shardSourcePending.delete(id);
          scheduleHeatRender();
        });

      shardSourcePending.set(id, job);
      return null;
    }

    function ensureSingleSource() {
      if (sourceInfo || sourceFailed) return sourceInfo;
      if (sourcePromise) return null;
      if (!window.GridWildAssets?.pmtilesInfo) {
        sourceFailed = true;
        sourceError = "GridWildAssets.pmtilesInfo is unavailable.";
        return null;
      }

      sourcePromise = (async () => {
        const [assetInfo, modules] = await Promise.all([
          window.GridWildAssets.pmtilesInfo(),
          loadImports()
        ]);
        if (!modules) {
          sourceFailed = true;
          sourceError = "PMTiles decoder modules unavailable.";
          return null;
        }
        if (!assetInfo?.url) {
          sourceFailed = true;
          sourceError = "PMTiles asset URL unavailable.";
          console.warn("GridWild PMTiles heat source unavailable.", {
            reason: sourceError,
            assetInfo
          });
          return null;
        }

        sourceInfo = await openPMTilesSource({ ...assetInfo, id: "single" }, modules);
        return sourceInfo;
      })()
        .catch((err) => {
          sourceFailed = true;
          sourceError = err?.message || String(err);
          console.warn("GridWild PMTiles heat source unavailable.", err);
          return null;
        })
        .finally(() => {
          sourcePromise = null;
          scheduleHeatRender();
        });

      return null;
    }

    function ensureSource() {
      const shards = ensureShardInfo();
      if (shards === undefined) return null;
      if (shards?.shards?.length) return null;
      return ensureSingleSource();
    }

    function warmShards() {
      ensureShardInfo();
    }

    function touchTileCache(key, value) {
      tileCache.set(key, value);
      while (tileCache.size > PMTILES_HEAT_TILE_CACHE_MAX) {
        const oldestKey = tileCache.keys().next().value;
        tileCache.delete(oldestKey);
      }
    }

    function readTileValue(value) {
      return value === EMPTY_TILE ? null : value;
    }

    function bytesForPbf(data) {
      if (!data) return null;
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (data.buffer instanceof ArrayBuffer) {
        return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || undefined);
      }
      return null;
    }

    function decodeTile(data, z, x, y, info = sourceInfo) {
      const bytes = bytesForPbf(data);
      if (!bytes?.byteLength) return null;

      const { VectorTileCtor, PbfCtor } = info.modules;
      const vectorTile = new VectorTileCtor(new PbfCtor(bytes));
      const layerName = vectorTile.layers?.[info.layer]
        ? info.layer
        : Object.keys(vectorTile.layers || {})[0];
      const layer = layerName ? vectorTile.layers[layerName] : null;
      if (!layer?.length) return null;

      const features = [];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        if (feature?.properties) features.push(feature.properties);
      }

      decodedFeatures += features.length;
      return { z, x, y, layerName, features };
    }

    function shardIntersectsView(shard) {
      const bounds = shard?.bounds || shard?.bbox;
      if (!bounds) return true;

      const west = Number(bounds.west ?? bounds.min_lng ?? bounds[0]);
      const south = Number(bounds.south ?? bounds.min_lat ?? bounds[1]);
      const east = Number(bounds.east ?? bounds.max_lng ?? bounds[2]);
      const north = Number(bounds.north ?? bounds.max_lat ?? bounds[3]);
      if (![west, south, east, north].every(Number.isFinite)) return true;

      const view = map.getBounds().pad(0.35);
      return !(
        east < view.getWest() ||
        west > view.getEast() ||
        north < view.getSouth() ||
        south > view.getNorth()
      );
    }

    function sourcesForView() {
      const modules = imports || null;
      if (!modules && !importsPromise) loadImports();

      const shards = ensureShardInfo();
      if (shards === undefined || (!modules && importsPromise)) {
        return {
          mode: "pending",
          sources: [],
          pending: 1,
          failed: 0,
          selectedShards: 0
        };
      }

      if (shards?.shards?.length) {
        const selected = shards.shards.filter(shardIntersectsView);
        const sources = [];
        let pending = modules ? 0 : selected.length;
        let failed = 0;

        if (modules) {
          for (const shard of selected) {
            const id = shard?.id || shard?.file || shard?.url;
            const source = ensureShardSource(shard, modules);
            if (source) {
              sources.push(source);
            } else if (id && shardSourceFailures.has(id)) {
              failed += 1;
            } else {
              pending += 1;
            }
          }
        }

        return {
          mode: "shards",
          sources,
          pending,
          failed,
          selectedShards: selected.length,
          shardCount: shards.shards.length
        };
      }

      const single = ensureSingleSource();
      return {
        mode: "single",
        sources: single ? [single] : [],
        pending: sourcePromise ? 1 : 0,
        failed: sourceFailed ? 1 : 0,
        selectedShards: 0,
        shardCount: 0
      };
    }

    function tileKey(info, z, x, y) {
      return `${info?.id || info?.file || "single"}:${z}/${x}/${y}`;
    }

    function tileStatus(sourceOrZ, zOrX, xOrY, yOrOptions) {
      const sourceArgIsInfo = sourceOrZ && typeof sourceOrZ === "object";
      const info = sourceArgIsInfo ? sourceOrZ : ensureSource();
      const z = sourceArgIsInfo ? zOrX : sourceOrZ;
      const x = sourceArgIsInfo ? xOrY : zOrX;
      const y = sourceArgIsInfo ? yOrOptions : xOrY;
      if (!info?.source) return "missing";

      const key = tileKey(info, z, x, y);
      if (tileCache.has(key)) {
        return tileCache.get(key) === EMPTY_TILE ? "empty" : "cached";
      }
      if (tilePending.has(key)) return "pending";
      return "missing";
    }

    function tileFor(sourceOrZ, zOrX, xOrY, yOrOptions, maybeOptions = {}) {
      const sourceArgIsInfo = sourceOrZ && typeof sourceOrZ === "object";
      const info = sourceArgIsInfo ? sourceOrZ : ensureSource();
      const z = sourceArgIsInfo ? zOrX : sourceOrZ;
      const x = sourceArgIsInfo ? xOrY : zOrX;
      const y = sourceArgIsInfo ? yOrOptions : xOrY;
      const options = sourceArgIsInfo ? maybeOptions : yOrOptions || {};
      if (!info?.source) return null;

      const key = tileKey(info, z, x, y);
      if (tileCache.has(key)) {
        const cached = tileCache.get(key);
        tileCache.delete(key);
        tileCache.set(key, cached);
        return readTileValue(cached);
      }

      if (tilePending.has(key)) return null;
      if (options.fetch === false) return null;

      requestedTiles++;
      const job = info.source
        .getZxy(z, x, y)
        .then((result) => {
          const tile = decodeTile(result?.data, z, x, y, info);
          if (!tile?.features?.length) {
            emptyTiles++;
            touchTileCache(key, EMPTY_TILE);
            return null;
          }

          loadedTiles++;
          touchTileCache(key, tile);
          return tile;
        })
        .catch((err) => {
          failedTiles++;
          console.warn("GridWild PMTiles heat tile unavailable.", err);
          touchTileCache(key, EMPTY_TILE);
          return null;
        })
        .finally(() => {
          tilePending.delete(key);
          scheduleHeatRender();
        });

      tilePending.set(key, job);
      return null;
    }

    function recordRender(info) {
      lastRender = {
        ...(info || {}),
        at: Date.now()
      };
    }

    function invalidate(options = {}) {
      tileCache.clear();
      tilePending.clear();
      clearFinePMTilesRuntimeMetrics();
      requestedTiles = 0;
      loadedTiles = 0;
      emptyTiles = 0;
      failedTiles = 0;
      decodedFeatures = 0;
      lastRender = null;

      if (options.reloadSource === true) {
        sourceInfo = null;
        sourcePromise = null;
        sourceFailed = false;
        sourceError = null;
        shardInfo = undefined;
        shardInfoPromise = null;
        shardInfoFailed = false;
        shardInfoError = null;
        shardSources.clear();
        shardSourcePending.clear();
        shardSourceFailures.clear();
      }
    }

    function stats() {
      if (shardInfo === undefined && !shardInfoPromise && !shardInfoFailed) {
        ensureShardInfo();
      }

      return {
        sourceLoaded: Boolean(sourceInfo) || shardSources.size > 0,
        sourcePending:
          Boolean(sourcePromise) || Boolean(shardInfoPromise) || shardSourcePending.size > 0,
        sourceFailed: sourceFailed || shardInfoFailed,
        sourceError,
        shardInfoLoaded: Boolean(shardInfo?.shards?.length),
        shardInfoPending: Boolean(shardInfoPromise),
        shardInfoFailed,
        shardInfoError,
        shardCount: shardInfo?.shards?.length || 0,
        loadedShards: shardSources.size,
        pendingShards: shardSourcePending.size,
        failedShards: shardSourceFailures.size,
        importsLoaded: Boolean(imports),
        importsPending: Boolean(importsPromise),
        importsFailed,
        url: sourceInfo?.url || null,
        file: sourceInfo?.file || null,
        layer: sourceInfo?.layer || null,
        payload: sourceInfo?.payload || null,
        minZoom: sourceInfo?.minZoom ?? null,
        maxZoom: sourceInfo?.maxZoom ?? null,
        cachedTiles: tileCache.size,
        pendingTiles: tilePending.size,
        requestedTiles,
        loadedTiles,
        emptyTiles,
        failedTiles,
        decodedFeatures,
        lastRender
      };
    }

    return {
      ensureSource,
      warmShards,
      sourcesForView,
      tileStatus,
      tileFor,
      recordRender,
      invalidate,
      stats
    };
  })();

window.getGridWildPMTilesHeatStats = function getGridWildPMTilesHeatStats() {
  return window.GridWildPMTilesHeat?.stats?.() || null;
};

window.GridWildCoarsePMTiles =
  window.GridWildCoarsePMTiles ||
  (function () {
    const EMPTY_TILE = Symbol("empty coarse pmtiles tile");
    let importsPromise = null;
    let imports = null;
    let importsFailed = false;
    let shardInfo = undefined;
    let shardInfoPromise = null;
    let shardInfoFailed = false;
    let shardInfoError = null;
    let levelsByBin = new Map();
    const shardSources = new Map();
    const shardSourcePending = new Map();
    const shardSourceFailures = new Map();
    const tileCache = new Map();
    const tilePending = new Map();
    let requestedTiles = 0;
    let loadedTiles = 0;
    let emptyTiles = 0;
    let failedTiles = 0;
    let decodedFeatures = 0;
    let lastRender = null;

    function scheduleHeatRender() {
      if (typeof scheduleGridHeatCanvasRender === "function" && isCoarseHeatEnabled()) {
        scheduleGridHeatCanvasRender({ force: true });
      }
    }

    function loadImports() {
      if (imports) return Promise.resolve(imports);
      if (importsFailed) return Promise.resolve(null);
      if (importsPromise) return importsPromise;

      importsPromise = Promise.all([
        import(PMTILES_HEAT_MODULE_URLS.pmtiles),
        import(PMTILES_HEAT_MODULE_URLS.vectorTile),
        import(PMTILES_HEAT_MODULE_URLS.pbf)
      ])
        .then(([pmtilesModule, vectorTileModule, pbfModule]) => {
          const PMTilesCtor = pmtilesModule.PMTiles || pmtilesModule.default?.PMTiles;
          const VectorTileCtor =
            vectorTileModule.VectorTile ||
            vectorTileModule.default?.VectorTile ||
            vectorTileModule.default;
          const PbfCtor = pbfModule.default || pbfModule.Pbf || pbfModule;

          if (!PMTilesCtor || !VectorTileCtor || !PbfCtor) {
            throw new Error("Coarse PMTiles decoder modules did not expose expected constructors.");
          }

          imports = { PMTilesCtor, VectorTileCtor, PbfCtor };
          return imports;
        })
        .catch((err) => {
          importsFailed = true;
          console.warn("GridWild coarse PMTiles decoder unavailable.", err);
          return null;
        })
        .finally(() => {
          importsPromise = null;
        });

      return importsPromise;
    }

    function readHeaderZoom(header, keys, fallback) {
      for (const key of keys) {
        const value = Number(header?.[key]);
        if (Number.isFinite(value)) return Math.round(value);
      }
      return fallback;
    }

    function makeRangeSource(url) {
      async function cancelResponseBody(resp) {
        try {
          await resp.body?.cancel?.();
        } catch {
          // Best effort; avoids accidentally streaming whole PMTiles files.
        }
      }

      return {
        getKey() {
          return url;
        },

        async getBytes(offset, length, signal, expectedEtag) {
          const headers = new Headers();
          const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
          headers.set("Range", rangeHeader);

          const resp = await fetch(url, {
            signal,
            cache: "no-store",
            mode: "cors",
            headers
          });

          const contentLengthHeader = resp.headers.get("Content-Length");
          const contentRangeHeader = resp.headers.get("Content-Range");
          const contentLength = Number(contentLengthHeader);
          const etag = resp.headers.get("ETag") || undefined;

          if (resp.status >= 300) {
            await cancelResponseBody(resp);
            throw new Error(`Coarse PMTiles range request failed: HTTP ${resp.status}`);
          }

          if (expectedEtag && etag && etag !== expectedEtag) {
            throw new Error("Coarse PMTiles range request returned a different ETag.");
          }

          if (resp.status === 200 && (!Number.isFinite(contentLength) || contentLength > length)) {
            await cancelResponseBody(resp);
            throw new Error(
              `Coarse PMTiles range request returned full content: status=${resp.status}, range=${rangeHeader}, contentRange=${contentRangeHeader || "missing"}, contentLength=${contentLengthHeader || "missing"}, requested=${length}.`
            );
          }

          return {
            data: await resp.arrayBuffer(),
            etag,
            cacheControl: resp.headers.get("Cache-Control") || undefined,
            expires: resp.headers.get("Expires") || undefined
          };
        }
      };
    }

    async function openSource(assetInfo, modules) {
      const source = new modules.PMTilesCtor(makeRangeSource(assetInfo.url));
      const header = await source.getHeader();
      return {
        ...assetInfo,
        source,
        header,
        minZoom: readHeaderZoom(header, ["minZoom", "min_zoom", "minzoom"], 0),
        maxZoom: readHeaderZoom(header, ["maxZoom", "max_zoom", "maxzoom"], 19),
        layer: assetInfo.layer || shardInfo?.layer || "gridwild_coarse_cells",
        modules
      };
    }

    function indexLevels(info) {
      const next = new Map();
      for (const value of info?.levels || []) {
        const binSize = Math.round(Number(value?.bin_size ?? value) || 0);
        if (!binSize) continue;
        next.set(
          binSize,
          typeof value === "object" ? { ...value, bin_size: binSize } : { bin_size: binSize }
        );
      }
      levelsByBin = next;
    }

    function ensureShardInfo() {
      if (shardInfo !== undefined || shardInfoFailed) return shardInfo;
      if (shardInfoPromise) return undefined;
      if (!window.GridWildAssets?.coarsePMTilesShardsInfo) {
        shardInfo = null;
        return shardInfo;
      }

      shardInfoPromise = window.GridWildAssets.coarsePMTilesShardsInfo()
        .then((info) => {
          shardInfo = info?.shards?.length ? info : null;
          if (shardInfo) indexLevels(shardInfo);
          return shardInfo;
        })
        .catch((err) => {
          shardInfo = null;
          shardInfoFailed = true;
          shardInfoError = err?.message || String(err);
          console.warn("GridWild coarse PMTiles shard manifest unavailable.", err);
          return null;
        })
        .finally(() => {
          shardInfoPromise = null;
          scheduleHeatRender();
        });

      return undefined;
    }

    function levelForBin(binSize) {
      ensureShardInfo();
      return levelsByBin.get(Math.round(Number(binSize) || 0)) || null;
    }

    function levels() {
      ensureShardInfo();
      return Array.from(levelsByBin.values()).sort(
        (a, b) => Number(a.bin_size) - Number(b.bin_size)
      );
    }

    function isManifestPending() {
      return Boolean(shardInfoPromise);
    }

    function shardIntersectsView(shard) {
      const bounds = shard?.bounds || shard?.bbox;
      if (!bounds) return true;

      const west = Number(bounds.west ?? bounds.min_lng ?? bounds[0]);
      const south = Number(bounds.south ?? bounds.min_lat ?? bounds[1]);
      const east = Number(bounds.east ?? bounds.max_lng ?? bounds[2]);
      const north = Number(bounds.north ?? bounds.max_lat ?? bounds[3]);
      if (![west, south, east, north].every(Number.isFinite)) return true;

      const view = map.getBounds().pad(0.35);
      return !(
        east < view.getWest() ||
        west > view.getEast() ||
        north < view.getSouth() ||
        south > view.getNorth()
      );
    }

    function ensureShardSource(shard, modules) {
      const id = shard?.id || shard?.file || shard?.url;
      if (!id || !shard?.url) return null;
      if (shardSources.has(id)) return shardSources.get(id);
      if (shardSourceFailures.has(id)) return null;
      if (shardSourcePending.has(id)) return null;

      const job = openSource(
        {
          ...shard,
          id,
          layer: shard.layer || shardInfo?.layer || "gridwild_coarse_cells",
          payload: shard.payload || shardInfo?.payload || null
        },
        modules
      )
        .then((source) => {
          shardSources.set(id, source);
          return source;
        })
        .catch((err) => {
          shardSourceFailures.set(id, err?.message || String(err));
          console.warn("GridWild coarse PMTiles shard unavailable.", { shard: id, error: err });
          return null;
        })
        .finally(() => {
          shardSourcePending.delete(id);
          scheduleHeatRender();
        });

      shardSourcePending.set(id, job);
      return null;
    }

    function sourcesForView() {
      const modules = imports || null;
      if (!modules && !importsPromise) loadImports();

      const info = ensureShardInfo();
      if (info === undefined || (!modules && importsPromise)) {
        return { mode: "pending", sources: [], pending: 1, failed: 0, selectedShards: 0 };
      }
      if (importsFailed) {
        return { mode: "unavailable", sources: [], pending: 0, failed: 1, selectedShards: 0 };
      }
      if (!info?.shards?.length) {
        return { mode: "missing", sources: [], pending: 0, failed: shardInfoFailed ? 1 : 0 };
      }

      const selected = info.shards.filter(shardIntersectsView);
      const sources = [];
      let pending = modules ? 0 : selected.length;
      let failed = 0;

      if (modules) {
        for (const shard of selected) {
          const id = shard?.id || shard?.file || shard?.url;
          const source = ensureShardSource(shard, modules);
          if (source) sources.push(source);
          else if (id && shardSourceFailures.has(id)) failed += 1;
          else pending += 1;
        }
      }

      return {
        mode: "shards",
        sources,
        pending,
        failed,
        selectedShards: selected.length,
        shardCount: info.shards.length
      };
    }

    function touchTileCache(key, value) {
      tileCache.set(key, value);
      while (tileCache.size > COARSE_PMTILES_TILE_CACHE_MAX) {
        const oldestKey = tileCache.keys().next().value;
        tileCache.delete(oldestKey);
      }
    }

    function readTileValue(value) {
      return value === EMPTY_TILE ? null : value;
    }

    function bytesForPbf(data) {
      if (!data) return null;
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (data.buffer instanceof ArrayBuffer) {
        return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || undefined);
      }
      return null;
    }

    function decodeTile(data, z, x, y, info) {
      const bytes = bytesForPbf(data);
      if (!bytes?.byteLength) return null;

      const { VectorTileCtor, PbfCtor } = info.modules;
      const vectorTile = new VectorTileCtor(new PbfCtor(bytes));
      const layerName = vectorTile.layers?.[info.layer]
        ? info.layer
        : Object.keys(vectorTile.layers || {})[0];
      const layer = layerName ? vectorTile.layers[layerName] : null;
      if (!layer?.length) return null;

      const features = [];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        if (feature?.properties) features.push(feature.properties);
      }

      decodedFeatures += features.length;
      return { z, x, y, layerName, features };
    }

    function tileKey(info, z, x, y) {
      return `${info?.id || info?.file || "coarse"}:${z}/${x}/${y}`;
    }

    function tileStatus(source, z, x, y) {
      if (!source?.source) return "missing";
      const key = tileKey(source, z, x, y);
      if (tileCache.has(key)) return tileCache.get(key) === EMPTY_TILE ? "empty" : "cached";
      if (tilePending.has(key)) return "pending";
      return "missing";
    }

    function tileFor(source, z, x, y, options = {}) {
      if (!source?.source) return null;
      const key = tileKey(source, z, x, y);
      if (tileCache.has(key)) {
        const cached = tileCache.get(key);
        tileCache.delete(key);
        tileCache.set(key, cached);
        return readTileValue(cached);
      }

      if (tilePending.has(key)) return null;
      if (options.fetch === false) return null;

      requestedTiles++;
      const job = source.source
        .getZxy(z, x, y)
        .then((result) => {
          const tile = decodeTile(result?.data, z, x, y, source);
          if (!tile?.features?.length) {
            emptyTiles++;
            touchTileCache(key, EMPTY_TILE);
            return null;
          }

          loadedTiles++;
          touchTileCache(key, tile);
          return tile;
        })
        .catch((err) => {
          failedTiles++;
          console.warn("GridWild coarse PMTiles tile unavailable.", err);
          touchTileCache(key, EMPTY_TILE);
          return null;
        })
        .finally(() => {
          tilePending.delete(key);
          scheduleHeatRender();
        });

      tilePending.set(key, job);
      return null;
    }

    function recordRender(info) {
      lastRender = { ...(info || {}), at: Date.now() };
    }

    function invalidate(options = {}) {
      tileCache.clear();
      tilePending.clear();
      requestedTiles = 0;
      loadedTiles = 0;
      emptyTiles = 0;
      failedTiles = 0;
      decodedFeatures = 0;
      lastRender = null;

      if (options.reloadSource === true) {
        shardInfo = undefined;
        shardInfoPromise = null;
        shardInfoFailed = false;
        shardInfoError = null;
        levelsByBin = new Map();
        shardSources.clear();
        shardSourcePending.clear();
        shardSourceFailures.clear();
      }
    }

    function stats() {
      if (shardInfo === undefined && !shardInfoPromise && !shardInfoFailed) ensureShardInfo();
      return {
        manifestLoaded: Boolean(shardInfo?.shards?.length),
        manifestPending: Boolean(shardInfoPromise),
        manifestFailed: shardInfoFailed,
        manifestError: shardInfoError,
        levels: Array.from(levelsByBin.keys()).sort((a, b) => a - b),
        cachedTiles: tileCache.size,
        pendingTiles: tilePending.size,
        requestedTiles,
        loadedTiles,
        emptyTiles,
        failedTiles,
        decodedFeatures,
        importsLoaded: Boolean(imports),
        importsPending: Boolean(importsPromise),
        importsFailed,
        loadedShards: shardSources.size,
        pendingShards: shardSourcePending.size,
        failedShards: shardSourceFailures.size,
        shardCount: shardInfo?.shards?.length || 0,
        buildId: shardInfo?.build_id || null,
        lastRender
      };
    }

    return {
      ensureManifest: ensureShardInfo,
      levelForBin,
      levels,
      isManifestPending,
      sourcesForView,
      tileStatus,
      tileFor,
      invalidate,
      recordRender,
      stats
    };
  })();

window.getGridWildCoarsePMTilesStats = function getGridWildCoarsePMTilesStats() {
  return window.GridWildCoarsePMTiles?.stats?.() || null;
};

window.setTimeout(() => window.GridWildPMTilesHeat?.warmShards?.(), 0);
window.setTimeout(() => window.GridWildCoarsePMTiles?.ensureManifest?.(), 0);

window.getGridWildHeatDataStats = function getGridWildHeatDataStats() {
  return {
    staticHeatLoaded: hasStaticHeatmapCounts(),
    staticHeatCells: hasStaticHeatmapCounts() ? window.__staticGridCounts.size : 0,
    staticHeatPending: Boolean(staticHeatmapCsvPromise),
    staticHeatDeferredForPMTiles: window.__gwStaticHeatDeferredForPMTiles === true,
    runtimeFineHeatCells: fineHeatRuntimeMetricCache().size,
    render: {
      attempts: gridHeatRenderAttempt,
      scheduled: Boolean(gridHeatRaf),
      throttled: Boolean(gridHeatThrottleTimer),
      last: gridHeatLastRenderState
    },
    pmtiles: window.GridWildPMTilesHeat?.stats?.() || null,
    coarsePMTiles: window.GridWildCoarsePMTiles?.stats?.() || null,
    coarse: window.GridWildCoarsePyramid?.stats?.() || null,
    metadataShards: {
      manifestLoaded: Boolean(window.__gwMetadataShardManifest),
      unavailable: window.__gwMetadataShardUnavailable === true,
      shardCount: window.__gwMetadataShardManifest?.shards?.length || 0,
      cachedShards: window.__gwMetadataShardCache?.size || 0,
      pendingShards: window.__gwMetadataShardPending?.size || 0
    }
  };
};

window.forceGridWildHeatRender = function forceGridWildHeatRender() {
  scheduleGridHeatCanvasRender({ force: true, reason: "manual-console" });
  return window.getGridWildHeatDataStats();
};

function gridWildDebugScaleDistanceCandidates() {
  if (window.GridWildUnits?.metricEnabled?.()) {
    return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  }

  return [
    10 / FEET_PER_METER,
    25 / FEET_PER_METER,
    50 / FEET_PER_METER,
    100 / FEET_PER_METER,
    200 / FEET_PER_METER,
    100 / 1.0936132983,
    200 / 1.0936132983,
    0.25 / 0.0006213711922,
    0.5 / 0.0006213711922,
    1 / 0.0006213711922
  ];
}

function chooseGridWildDebugScaleDistance(metersPerPixel) {
  const targetPx = 78;
  const candidates = gridWildDebugScaleDistanceCandidates()
    .map((meters) => ({ meters, px: meters / metersPerPixel }))
    .filter((entry) => entry.px >= 44 && entry.px <= 118);
  const usable = candidates.length
    ? candidates
    : gridWildDebugScaleDistanceCandidates().map((meters) => ({
        meters,
        px: meters / metersPerPixel
      }));

  return usable.sort((a, b) => Math.abs(a.px - targetPx) - Math.abs(b.px - targetPx))[0] || null;
}

function formatGridWildDebugDistance(meters) {
  if (window.GridWildUnits?.formatDistance) {
    return window.GridWildUnits.formatDistance(meters);
  }

  const feet = meters * FEET_PER_METER;
  if (feet < 528) return `${feet < 10 ? feet.toFixed(1) : Math.round(feet)} ft`;

  const yards = meters * 1.0936132983;
  if (yards < 1760) return `${Math.round(yards)} yd`;

  const miles = meters * 0.0006213711922;
  return `${miles < 10 ? miles.toFixed(2).replace(/\.?0+$/, "") : Math.round(miles)} mi`;
}

function formatGridWildDebugZoomMultiplier() {
  const multiplier = getHeatMapZoomMultiplier();
  if (!Number.isFinite(multiplier) || multiplier <= 0) return "x1";
  if (multiplier >= 10) return `x${multiplier.toFixed(0)}`;
  if (multiplier >= 1) return `x${multiplier.toFixed(2).replace(/\.?0+$/, "")}`;
  return `x${multiplier.toFixed(2)}`;
}

function getGridWildDebugScaleLabel() {
  const hudLabel = String(
    document.getElementById("gwMapScaleHatchLabel")?.textContent || ""
  ).trim();
  if (hudLabel) return hudLabel;

  const scale = chooseGridWildDebugScaleDistance(getHeatMapMetersPerPixel());
  const distance = scale ? formatGridWildDebugDistance(scale.meters) : "? ft";
  return `${distance} ${formatGridWildDebugZoomMultiplier()}`;
}

function gridWildHeatDebugSource(stats) {
  const render = stats?.render?.last || {};
  const coarsePMTiles = stats?.coarsePMTiles?.lastRender || null;
  const oldJsonCoarse = stats?.coarse?.lastRender || null;
  const pmtiles = stats?.pmtiles?.lastRender || null;
  const status = render.status || "unknown";

  if (status === "pmtiles" || status === "coarse-pmtiles-fallback") {
    return {
      source: "fine-pmtiles",
      detail: pmtiles
    };
  }

  if (String(status).startsWith("coarse")) {
    if (coarsePMTiles) {
      return {
        source: `coarse-pmtiles-x${coarsePMTiles.binSize || "?"}`,
        detail: coarsePMTiles
      };
    }
    if (oldJsonCoarse) {
      return {
        source: `coarse-json-x${oldJsonCoarse.binSize || "?"}`,
        detail: oldJsonCoarse
      };
    }
    return {
      source: "coarse-runtime",
      detail: render
    };
  }

  if (String(status).startsWith("static")) {
    return {
      source: "static-csv",
      detail: render
    };
  }

  if (String(status).startsWith("metadata-filter")) {
    return {
      source: "metadata-filter",
      detail: render.metadataFilterOutcome || render
    };
  }

  return {
    source: status,
    detail: render
  };
}

function gridWildHeatDebugFulfilled(render, sourceDetail) {
  if ((Number(render?.painted) || 0) > 0) return true;
  if ((Number(sourceDetail?.painted) || 0) > 0) return true;
  if ((Number(sourceDetail?.pendingTiles) || 0) > 0) return false;
  if ((Number(sourceDetail?.deferredTiles) || 0) > 0) return false;
  if ((Number(sourceDetail?.requestedMissingTiles) || 0) > 0) return false;
  return false;
}

function getGridWildZoomHeatDebug() {
  const stats = window.getGridWildHeatDataStats?.() || {};
  const coarseState = getCoarseHeatState();
  const render = stats.render?.last || null;
  const source = gridWildHeatDebugSource(stats);
  const detail = source.detail || {};
  const fulfilled = gridWildHeatDebugFulfilled(render, detail);

  return {
    scale: getGridWildDebugScaleLabel(),
    zoom: Number(map.getZoom?.()) || null,
    multiplier: formatGridWildDebugZoomMultiplier(),
    request: {
      heatOn: window.__gwFilters?.showHeat ?? true,
      metric: window.__gwState?.heatMetric || "count",
      lens: window.__gwState?.activeLens || "classic",
      coarse: {
        enabled: coarseState.enabled,
        autoEnabled: coarseState.autoEnabled,
        autoBinSize: coarseState.autoBinSize,
        effectiveBinSize: coarseState.effectiveBinSize,
        levels: stats.coarsePMTiles?.levels || []
      },
      finePMTiles: {
        enabled: render?.pmtilesHeatEnabled === true,
        gate: render?.pmtilesGate || null,
        sourceLoaded: stats.pmtiles?.sourceLoaded || false,
        sourcePending: stats.pmtiles?.sourcePending || false,
        shardCount: stats.pmtiles?.shardCount || 0,
        loadedShards: stats.pmtiles?.loadedShards || 0
      }
    },
    source: source.source,
    fulfilled,
    render,
    sourceDetail: detail,
    stats: {
      fine: {
        requestedTiles: stats.pmtiles?.requestedTiles || 0,
        loadedTiles: stats.pmtiles?.loadedTiles || 0,
        pendingTiles: stats.pmtiles?.pendingTiles || 0,
        cachedTiles: stats.pmtiles?.cachedTiles || 0,
        lastRender: stats.pmtiles?.lastRender || null
      },
      coarsePMTiles: {
        levels: stats.coarsePMTiles?.levels || [],
        requestedTiles: stats.coarsePMTiles?.requestedTiles || 0,
        loadedTiles: stats.coarsePMTiles?.loadedTiles || 0,
        pendingTiles: stats.coarsePMTiles?.pendingTiles || 0,
        cachedTiles: stats.coarsePMTiles?.cachedTiles || 0,
        lastRender: stats.coarsePMTiles?.lastRender || null
      }
    }
  };
}

window.getGridWildZoomHeatDebug = getGridWildZoomHeatDebug;
window.GridWildDebug = {
  ...(window.GridWildDebug || {}),
  heat: getGridWildZoomHeatDebug,
  heatData: window.getGridWildHeatDataStats,
  forceHeat: window.forceGridWildHeatRender,
  resetMetadata: window.resetGridWildMetadataShards
};

function logGridWildZoomHeatDebug() {
  if (window.__gwState?.zoomHeatDebugEnabled === false) return;

  const debug = getGridWildZoomHeatDebug();
  const painted = Number(debug.render?.painted) || Number(debug.sourceDetail?.painted) || 0;
  const pending =
    Number(debug.sourceDetail?.pendingTiles) ||
    Number(debug.stats?.fine?.pendingTiles) ||
    Number(debug.stats?.coarsePMTiles?.pendingTiles) ||
    0;
  const deferred = Number(debug.sourceDetail?.deferredTiles) || 0;

  console.info(
    `GridWild zoom heat: ${debug.scale} | source=${debug.source} | fulfilled=${debug.fulfilled} | painted=${painted} | pending=${pending} | deferred=${deferred}`,
    debug
  );
}

let gridWildZoomHeatDebugTimer = null;

function scheduleGridWildZoomHeatDebug() {
  window.clearTimeout(gridWildZoomHeatDebugTimer);
  gridWildZoomHeatDebugTimer = window.setTimeout(() => {
    window.requestAnimationFrame(logGridWildZoomHeatDebug);
  }, 120);
}

map.on("zoomend", scheduleGridWildZoomHeatDebug);

function median(values) {
  const nums = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!nums.length) return 0;

  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function heatLensNeedsRichMetrics(lens = window.__gwState?.activeLens || "classic") {
  return (
    lens === "dominantlife" ||
    lens === "seasonalpulse" ||
    lens === "stability" ||
    lens === "breadth" ||
    lens === "cultivated" ||
    lens === "wildbalance"
  );
}

function coarseHeatLensNeedsRichMetrics(lens = window.__gwState?.activeLens || "classic") {
  return (
    window.GridWildIconicOverlayFilter?.isActive?.() === true || heatLensNeedsRichMetrics(lens)
  );
}

function shouldRenderMetadataShardHeat(lens = window.__gwState?.activeLens || "classic") {
  return (
    window.GridWildIconicOverlayFilter?.isActive?.() === true || heatLensNeedsRichMetrics(lens)
  );
}

function isFineCellInBounds(ix, iy, bounds) {
  if (!bounds) return true;
  return ix >= bounds.minIx && ix < bounds.maxIx && iy >= bounds.minIy && iy < bounds.maxIy;
}

function getCoarseRichHydrationSignature() {
  const state = window.__gwState || {};
  const filters = window.__gwFilters || {};
  const taxa = Array.isArray(filters.iconicTaxa)
    ? filters.iconicTaxa.filter(Boolean).sort().join(",")
    : "";

  return [
    `metric:${state.heatMetric || "count"}`,
    `lens:${state.activeLens || "classic"}`,
    `me:${filters.onlyMe === true ? 1 : 0}`,
    `taxa:${taxa}`,
    `pyrite:${window.GridWildPyriteLake?.isEnabled?.() === true ? 1 : 0}`
  ].join("|");
}

function makeCoarseRichHydrationScope(binSize, startAnchorX, endAnchorX, startAnchorY, endAnchorY) {
  const bounds = {
    minIx: startAnchorX,
    maxIx: endAnchorX + binSize,
    minIy: startAnchorY,
    maxIy: endAnchorY + binSize
  };

  return {
    bounds,
    viewKey: [
      `bin:${binSize}`,
      `bounds:${bounds.minIx},${bounds.maxIx},${bounds.minIy},${bounds.maxIy}`,
      getCoarseRichHydrationSignature()
    ].join("|")
  };
}

function makeCoarseHeatSourceLookup(options = {}) {
  const counts = window.__staticGridCounts;
  const cache = new Map();
  const warmMissingRich = options.warmMissingRich === true;
  const warmBounds = options.warmBounds || null;
  const hydrationViewKey = options.hydrationViewKey || "";

  function maybeWarmRichMetrics(ix, iy, baseMetrics, richMetrics) {
    if (!warmMissingRich || richMetrics) return;
    if (!hasGridMetricSignal(baseMetrics)) return;
    if (!isFineCellInBounds(ix, iy, warmBounds)) return;

    requestCoarseRichMetricsForCell(ix, iy, { viewKey: hydrationViewKey });
  }

  function readEntry(ix, iy) {
    const key = `${ix},${iy}`;
    if (cache.has(key)) {
      const entry = cache.get(key);
      cache.delete(key);
      cache.set(key, entry);
      return entry;
    }

    const richMetrics = window.__richGridMetrics?.get(key) || null;
    const baseMetrics = richMetrics || (counts instanceof Map ? counts.get(key) : null) || null;

    const displayMetrics = getDisplayMetricsForCell(ix, iy, baseMetrics, {
      requestMissingRecord: false
    });
    const heatValue = getHeatValueForCell(displayMetrics);
    const source =
      displayMetrics && heatValue > 0 ? { ix, iy, key, metrics: displayMetrics, heatValue } : null;
    const entry = {
      key,
      baseMetrics,
      richMetrics,
      source,
      rawSignal: hasGridMetricSignal(baseMetrics) || Boolean(source)
    };

    cache.set(key, entry);
    while (cache.size > COARSE_HEAT_SOURCE_LOOKUP_CACHE_MAX) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    return entry;
  }

  function coarseHeatSourceForCell(ix, iy, lookupOptions = {}) {
    const entry = readEntry(ix, iy);
    if (lookupOptions.warm !== false) {
      maybeWarmRichMetrics(ix, iy, entry.baseMetrics, entry.richMetrics);
    }
    return entry.source;
  }

  coarseHeatSourceForCell.hasRawSignal = function hasRawSignal(ix, iy) {
    return readEntry(ix, iy).rawSignal === true;
  };

  coarseHeatSourceForCell.warmCell = function warmCell(ix, iy) {
    const entry = readEntry(ix, iy);
    maybeWarmRichMetrics(ix, iy, entry.baseMetrics, entry.richMetrics);
  };

  return coarseHeatSourceForCell;
}

function hasCoarseHeatSourceNeighbor(ix, iy, sourceLookup) {
  for (const [dx, dy] of HEAT_MORPH_OFFSETS) {
    if (typeof sourceLookup.hasRawSignal === "function") {
      if (sourceLookup.hasRawSignal(ix + dx, iy + dy)) return true;
    } else if (sourceLookup(ix + dx, iy + dy, { warm: false })) {
      return true;
    }
  }

  return false;
}

function getCoarseHeatCacheSignature() {
  const state = window.__gwState || {};
  const filters = window.__gwFilters || {};
  const dataVersions = getCoarseDataVersions();
  const taxa = Array.isArray(filters.iconicTaxa)
    ? filters.iconicTaxa.filter(Boolean).sort().join(",")
    : "";

  return [
    `metric:${state.heatMetric || "count"}`,
    `lens:${state.activeLens || "classic"}`,
    `me:${filters.onlyMe === true ? 1 : 0}`,
    `taxa:${taxa}`,
    `pyrite:${window.GridWildPyriteLake?.isEnabled?.() === true ? 1 : 0}`,
    `chunks:${dataVersions.superchunks}`,
    `rich:${dataVersions.rich}`
  ].join("|");
}

function getCachedCoarseMedianMetrics(anchorIx, anchorIy, binSize, sourceLookup, signature) {
  const cache = window.GridWildCoarseHeatCache;
  if (cache?.get) {
    return cache.get(anchorIx, anchorIy, binSize, signature, () =>
      getCoarseMedianMetrics(anchorIx, anchorIy, binSize, sourceLookup)
    );
  }

  return getCoarseMedianMetrics(anchorIx, anchorIy, binSize, sourceLookup);
}

function getCoarseHeatBinSpan(startAnchorX, endAnchorX, startAnchorY, endAnchorY, binSize) {
  if (
    !Number.isFinite(startAnchorX) ||
    !Number.isFinite(endAnchorX) ||
    !Number.isFinite(startAnchorY) ||
    !Number.isFinite(endAnchorY) ||
    !Number.isFinite(binSize) ||
    binSize <= 0
  ) {
    return { cols: 0, rows: 0, total: 0, safe: false };
  }

  const cols = Math.max(0, Math.floor((endAnchorX - startAnchorX) / binSize) + 1);
  const rows = Math.max(0, Math.floor((endAnchorY - startAnchorY) / binSize) + 1);
  const total = cols * rows;

  return {
    cols,
    rows,
    total,
    safe: total > 0 && total <= COARSE_HEAT_RENDER_BIN_BUDGET
  };
}

function warnCoarseHeatBudgetExceeded(reason, detail = {}) {
  const now = Date.now();
  if (now - (warnCoarseHeatBudgetExceeded.lastAt || 0) < 5000) return;
  warnCoarseHeatBudgetExceeded.lastAt = now;
  console.warn("GridWild coarse heat render skipped:", reason, detail);
}

function mergeCoarseLensMetricFields(target, metrics) {
  mergeMetricObjects(target.iconic_counts, metrics.iconic_counts);

  (metrics.month_totals || []).forEach((value, index) => {
    if (index >= 0 && index < target.month_totals.length) {
      target.month_totals[index] += Number(value) || 0;
    }
  });
}

function getCoarseMedianMetrics(anchorIx, anchorIy, binSize, sourceLookup) {
  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) && !window.GridWildPyriteLake?.hasData?.()) return null;

  const lookup = typeof sourceLookup === "function" ? sourceLookup : makeCoarseHeatSourceLookup();
  const values = {
    count: [],
    species: [],
    genera: [],
    observers: [],
    n_captive: [],
    median_last10_observed_ms: []
  };
  const lensFields = {
    iconic_counts: {},
    month_totals: Array(12).fill(0)
  };

  let nActiveSquares = 0;
  let latestLastObservedMs = 0;

  for (let ix = anchorIx; ix < anchorIx + binSize; ix++) {
    for (let iy = anchorIy; iy < anchorIy + binSize; iy++) {
      const source = lookup(ix, iy, { warm: false });
      const hasRawSignal =
        typeof lookup.hasRawSignal === "function" ? lookup.hasRawSignal(ix, iy) : Boolean(source);
      if (!hasRawSignal) continue;
      if (binSize > 1 && !hasCoarseHeatSourceNeighbor(ix, iy, lookup)) continue;
      if (typeof lookup.warmCell === "function") lookup.warmCell(ix, iy);
      if (!source) continue;

      const displayMetrics = source.metrics;

      const count = Number(displayMetrics.count) || 0;
      const species = Number(displayMetrics.species) || 0;
      const observers = Number(displayMetrics.observers) || 0;
      const nCaptive = Number(displayMetrics.n_captive) || 0;
      const genera = Number(displayMetrics.genera) || species;
      const lastObservedMs =
        Number(displayMetrics.last_observed_ms) || parseGridDateMs(displayMetrics.last_observed);
      const medianLast10Ms =
        Number(displayMetrics.median_last10_observed_ms) ||
        parseGridDateMs(displayMetrics.median_last10_observed);

      values.count.push(count);
      values.species.push(species);
      values.genera.push(genera);
      values.observers.push(observers);
      values.n_captive.push(nCaptive);
      if (medianLast10Ms) values.median_last10_observed_ms.push(medianLast10Ms);
      latestLastObservedMs = Math.max(latestLastObservedMs, lastObservedMs || 0);
      mergeCoarseLensMetricFields(lensFields, displayMetrics);

      if (count > 0) nActiveSquares++;
    }
  }

  if (!values.count.length) return null;

  const peak = Math.max(...lensFields.month_totals);
  const total = lensFields.month_totals.reduce((sum, value) => sum + value, 0);
  const dominant =
    Object.entries(lensFields.iconic_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

  return {
    count: median(values.count),
    species: median(values.species),
    genera: median(values.genera),
    observers: median(values.observers),
    n_captive: median(values.n_captive),
    iconic_counts: lensFields.iconic_counts,
    month_totals: lensFields.month_totals,
    dominant_iconic: dominant,
    iconic_n: Object.keys(lensFields.iconic_counts).length,
    peak_month: lensFields.month_totals.indexOf(peak) + 1,
    seasonal_strength: total ? peak / total : 0,
    month_entropy: metricEntropy(lensFields.month_totals),
    last_observed: gridDateIsoFromMs(latestLastObservedMs),
    median_last10_observed: gridDateIsoFromMs(median(values.median_last10_observed_ms)),
    last_observed_ms: latestLastObservedMs,
    median_last10_observed_ms: median(values.median_last10_observed_ms),
    nSquares: binSize * binSize,
    nActiveSquares,
    activity_score: Math.log1p(median(values.count)) * (1 + median(values.genera) * 0.05)
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

function gridMetersRectLayerBounds(x0, y0, x1, y1) {
  const nwPx = gridHeatPointForMeters(x0, y1);
  const sePx = gridHeatPointForMeters(x1, y0);

  return {
    x: Math.min(nwPx.x, sePx.x),
    y: Math.min(nwPx.y, sePx.y),
    w: Math.abs(sePx.x - nwPx.x),
    h: Math.abs(sePx.y - nwPx.y)
  };
}

function coarseHeatPaintRect(bounds, originBounds = null) {
  const originX = originBounds?.x ?? 0;
  const originY = originBounds?.y ?? 0;
  const x0 = Math.round(bounds.x - originX);
  const y0 = Math.round(bounds.y - originY);
  const x1 = Math.round(bounds.x + bounds.w - originX);
  const y1 = Math.round(bounds.y + bounds.h - originY);
  const overlap = COARSE_HEAT_BIN_PIXEL_OVERLAP;

  return {
    x: x0 - overlap,
    y: y0 - overlap,
    w: Math.max(1, x1 - x0) + overlap * 2,
    h: Math.max(1, y1 - y0) + overlap * 2
  };
}

function paintFineHeatMeterRect(x0, y0, x1, y1, fillOpacity, fillColor, strokeDocumented = false) {
  const t = gridHeatMeterTransform;
  let nwX;
  let nwY;
  let seX;
  let seY;

  if (t) {
    nwX = t.scale * (t.a * x0 + t.b) - t.originX;
    nwY = t.scale * (t.c * y1 + t.d) - t.originY;
    seX = t.scale * (t.a * x1 + t.b) - t.originX;
    seY = t.scale * (t.c * y0 + t.d) - t.originY;
  } else {
    const nwPx = gridHeatPointForMeters(x0, y1);
    const sePx = gridHeatPointForMeters(x1, y0);
    nwX = nwPx.x;
    nwY = nwPx.y;
    seX = sePx.x;
    seY = sePx.y;
  }

  const left = Math.min(nwX, seX);
  const top = Math.min(nwY, seY);
  const right = Math.max(nwX, seX);
  const bottom = Math.max(nwY, seY);
  const pxX = Math.round(left);
  const pxY = Math.round(top);
  const pxRight = Math.round(right);
  const pxBottom = Math.round(bottom);
  const pxW = Math.max(1, pxRight - pxX);
  const pxH = Math.max(1, pxBottom - pxY);

  gridHeatCtx.globalAlpha = fillOpacity;
  gridHeatCtx.fillStyle = fillColor || "rgba(90,160,90,1)";
  gridHeatCtx.fillRect(pxX, pxY, pxW, pxH);

  if (strokeDocumented) {
    gridHeatCtx.globalAlpha = 0.8;
    gridHeatCtx.strokeStyle = "rgba(240, 209, 138, 0.72)";
    gridHeatCtx.lineWidth = 1.2;
    gridHeatCtx.strokeRect(pxX, pxY, pxW, pxH);
  }
}

function getCoarseHeatTileFineCells(binSize) {
  return binSize * COARSE_HEAT_TILE_BINS;
}

function coarseHeatTileBounds(tileIx, tileIy, tileFineCells) {
  const minIx = tileIx * tileFineCells;
  const minIy = tileIy * tileFineCells;
  const maxIx = minIx + tileFineCells;
  const maxIy = minIy + tileFineCells;

  return {
    minIx,
    minIy,
    maxIx,
    maxIy,
    layerBounds: gridMetersRectLayerBounds(
      minIx * GRID_SIZE_M,
      minIy * GRID_SIZE_M,
      maxIx * GRID_SIZE_M,
      maxIy * GRID_SIZE_M
    )
  };
}

function getCoarseHeatFogRenderSignature() {
  const state = window.__gwState || {};
  if (state.showFog !== true || !window.GridWildFog) return "0";

  const stats = window.GridWildFog.getStats?.() || {};
  const avatar = getCurrentUserCellIndices?.() || null;
  const center = state.godsEyeEnabled ? getCenterFineCell?.() : null;
  const pulse = state.godsEyeBlastPulse || null;
  const minuteBucket = Math.floor(Date.now() / 60000);

  return [
    "1",
    `stored:${Number(stats.storedCells) || 0}`,
    `surveyed:${Number(stats.surveyed) || 0}`,
    `documented:${Number(stats.documented) || 0}`,
    `expired:${Number(stats.expired) || 0}`,
    `avatar:${avatar ? `${avatar.ix},${avatar.iy}` : "none"}`,
    `eye:${state.godsEyeEnabled ? 1 : 0}`,
    `center:${center ? `${center.ix},${center.iy}` : "none"}`,
    `pulse:${pulse?.startedAt || 0}`,
    `minute:${minuteBucket}`
  ].join(",");
}

function getCoarseHeatTileSignature(binSize, sourceSignature) {
  const state = window.__gwState || {};
  const binCacheVersion = window.GridWildCoarseHeatCache?.stats?.().dataVersion ?? 0;
  const zoom = Number(map?.getZoom?.());
  const zoomBucket = Number.isFinite(zoom)
    ? Math.round(zoom / COARSE_HEAT_TILE_ZOOM_BUCKET) * COARSE_HEAT_TILE_ZOOM_BUCKET
    : 0;

  return [
    `source:${sourceSignature}`,
    `sourceVersion:${binCacheVersion}`,
    `bin:${binSize}`,
    `zoomBucket:${zoomBucket.toFixed(2)}`,
    `lens:${state.activeLens || "classic"}`,
    `log:${state.logHeat === false ? 0 : 1}`,
    `contrast:${state.highContrastLensEnabled === true ? 1 : 0}`,
    `fog:${getCoarseHeatFogRenderSignature()}`
  ].join("|");
}

function getCoarseHeatTileKey(tileIx, tileIy, binSize, signature) {
  return `${signature}|tile:${binSize}:${tileIx}:${tileIy}`;
}

function isCoarseHeatTileCacheSafe(binSize) {
  const tileFineCells = getCoarseHeatTileFineCells(binSize);
  const metersPerPixel = getHeatMapMetersPerPixel();
  if (!(metersPerPixel > 0)) return false;

  const tileCssPx = (tileFineCells * GRID_SIZE_M) / metersPerPixel;
  return tileCssPx <= COARSE_HEAT_TILE_MAX_PX;
}

function coarseFogAdjustedOpacityForCell(key, baseOpacity, fogOn) {
  if (!fogOn || !window.GridWildFog) {
    return { visible: true, opacity: baseOpacity, documented: false };
  }

  const fogState = window.GridWildFog.getCellFogState(key);
  const transientRevealStrength =
    typeof window.getGridWildTransientRevealStrength === "function"
      ? window.getGridWildTransientRevealStrength(key)
      : window.isGridWildTransientVisibleCell?.(key)
        ? 1
        : 0;
  const transientVisible = transientRevealStrength > 0;

  if (!transientVisible && (fogState.state === "unknown" || fogState.state === "expired")) {
    return { visible: false, opacity: 0, documented: false };
  }

  let opacity = baseOpacity;

  if (transientVisible && fogState?.state !== "documented") {
    opacity = Math.max(opacity, 0.18 + transientRevealStrength * 0.24);
  }

  if (fogState?.state === "surveyed") {
    opacity = Math.max(0.08, opacity * fogState.reveal);
  }

  if (fogState?.state === "documented") {
    opacity = Math.min(0.92, opacity + 0.12);
  }

  return {
    visible: true,
    opacity,
    documented: fogState?.state === "documented"
  };
}

function paintCoarseHeatBin(ctx, ix, iy, binSize, baseStyle, originBounds = null) {
  const fogOn = window.__gwState?.showFog === true;
  const baseOpacity = Math.min(0.82, Number(baseStyle.fillOpacity || 0.25));
  const fillColor = baseStyle.fillColor || "rgba(90,160,90,1)";

  if (!fogOn || !window.GridWildFog) {
    const x0 = ix * GRID_SIZE_M;
    const y0 = iy * GRID_SIZE_M;
    const x1 = x0 + binSize * GRID_SIZE_M;
    const y1 = y0 + binSize * GRID_SIZE_M;
    const pxRect = coarseHeatPaintRect(gridMetersRectLayerBounds(x0, y0, x1, y1), originBounds);

    ctx.globalAlpha = baseOpacity;
    ctx.fillStyle = fillColor;
    ctx.fillRect(pxRect.x, pxRect.y, pxRect.w, pxRect.h);
    return 1;
  }

  let painted = 0;
  ctx.fillStyle = fillColor;

  for (let cx = ix; cx < ix + binSize; cx++) {
    for (let cy = iy; cy < iy + binSize; cy++) {
      const fog = coarseFogAdjustedOpacityForCell(`${cx},${cy}`, baseOpacity, true);
      if (!fog.visible || fog.opacity <= 0) continue;

      const x0 = cx * GRID_SIZE_M;
      const y0 = cy * GRID_SIZE_M;
      const pxRect = coarseHeatPaintRect(
        gridMetersRectLayerBounds(x0, y0, x0 + GRID_SIZE_M, y0 + GRID_SIZE_M),
        originBounds
      );

      ctx.globalAlpha = fog.opacity;
      ctx.fillRect(pxRect.x, pxRect.y, pxRect.w, pxRect.h);
      painted++;
    }
  }

  return painted;
}

function canUsePrecomputedCoarseHeat() {
  if (window.__gwState?.precomputedCoarseHeatEnabled === false) return false;
  if (!window.GridWildCoarsePyramid?.levelForBin) return false;
  if (window.GridWildMeOverlayFilter?.isActive?.()) return false;
  if (window.GridWildIconicOverlayFilter?.isActive?.()) return false;
  return true;
}

function canUseCoarsePMTilesHeat() {
  if (window.__gwState?.coarsePMTilesHeatEnabled === false) return false;
  if (!window.GridWildCoarsePMTiles?.levelForBin) return false;
  if (window.GridWildMeOverlayFilter?.isActive?.()) return false;
  if (window.GridWildIconicOverlayFilter?.isActive?.()) return false;
  return true;
}

function getPrecomputedCoarseView(binSize) {
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const binSizeM = binSize * GRID_SIZE_M;
  const startAnchorX = Math.floor(startX / binSizeM) * binSize;
  const endAnchorX = Math.floor((endX - GRID_SIZE_M) / binSizeM) * binSize;
  const startAnchorY = Math.floor(startY / binSizeM) * binSize;
  const endAnchorY = Math.floor((endY - GRID_SIZE_M) / binSizeM) * binSize;
  const span = getCoarseHeatBinSpan(startAnchorX, endAnchorX, startAnchorY, endAnchorY, binSize);
  return { startAnchorX, endAnchorX, startAnchorY, endAnchorY, span };
}

function precomputedCoarseTileRange(level, view) {
  const declaredTileFineCells = Math.round(Number(level?.tile_fine_cells) || 0);
  const tileFineCells =
    declaredTileFineCells > 0 ? declaredTileFineCells : getCoarseHeatTileFineCells(level.bin_size);
  const startTileIx = Math.floor(view.startAnchorX / tileFineCells);
  const endTileIx = Math.floor(view.endAnchorX / tileFineCells);
  const startTileIy = Math.floor(view.startAnchorY / tileFineCells);
  const endTileIy = Math.floor(view.endAnchorY / tileFineCells);
  const tileCols = Math.max(0, endTileIx - startTileIx + 1);
  const tileRows = Math.max(0, endTileIy - startTileIy + 1);
  return {
    tileFineCells,
    startTileIx,
    endTileIx,
    startTileIy,
    endTileIy,
    tileCols,
    tileRows,
    tileCount: tileCols * tileRows
  };
}

function precomputedCoarseCandidate(level) {
  const binSize = Math.round(Number(level?.bin_size) || 0);
  if (!binSize) return null;

  const view = getPrecomputedCoarseView(binSize);
  const range = precomputedCoarseTileRange(level, view);
  const tileSafe =
    Number.isFinite(range.tileCount) &&
    range.tileCount > 0 &&
    range.tileCount <= COARSE_HEAT_RENDER_TILE_BUDGET;

  return {
    level,
    binSize,
    view,
    range,
    safe: view.span.safe && tileSafe,
    reason: !view.span.safe ? "bin budget" : !tileSafe ? "tile budget" : "ok"
  };
}

function coarsePMTilesCandidate(level) {
  const binSize = Math.round(Number(level?.bin_size) || 0);
  if (!binSize) return null;

  const view = getPrecomputedCoarseView(binSize);
  return {
    level,
    binSize,
    view,
    safe: view.span.safe,
    reason: view.span.safe ? "ok" : "bin budget"
  };
}

function selectPrecomputedCoarseLevel(requestedBinSize) {
  const requestedLevel = window.GridWildCoarsePyramid.levelForBin(requestedBinSize);
  if (!requestedLevel && window.GridWildCoarsePyramid.isManifestPending?.()) {
    return { status: "pending", requestedBinSize };
  }

  const levels = (window.GridWildCoarsePyramid.levels?.() || []).filter(
    (level) => Math.round(Number(level?.bin_size) || 0) >= requestedBinSize
  );

  if (
    requestedLevel &&
    !levels.some((level) => Number(level.bin_size) === Number(requestedLevel.bin_size))
  ) {
    levels.unshift(requestedLevel);
  }

  if (!levels.length) {
    return { status: "missing", requestedBinSize };
  }

  let coarsestCandidate = null;
  for (const level of levels) {
    const candidate = precomputedCoarseCandidate(level);
    if (!candidate) continue;
    coarsestCandidate = candidate;
    if (candidate.safe) {
      return {
        status: "ready",
        requestedBinSize,
        ...candidate
      };
    }
  }

  if (!coarsestCandidate) {
    return { status: "missing", requestedBinSize };
  }

  return {
    status: "overBudget",
    requestedBinSize,
    ...coarsestCandidate
  };
}

function selectCoarsePMTilesLevel(requestedBinSize) {
  const requestedLevel = window.GridWildCoarsePMTiles.levelForBin(requestedBinSize);
  if (!requestedLevel && window.GridWildCoarsePMTiles.isManifestPending?.()) {
    return { status: "pending", requestedBinSize };
  }

  const levels = (window.GridWildCoarsePMTiles.levels?.() || []).filter(
    (level) => Math.round(Number(level?.bin_size) || 0) >= requestedBinSize
  );

  if (
    requestedLevel &&
    !levels.some((level) => Number(level.bin_size) === Number(requestedLevel.bin_size))
  ) {
    levels.unshift(requestedLevel);
  }

  if (!levels.length) {
    return { status: "missing", requestedBinSize };
  }

  let coarsestCandidate = null;
  for (const level of levels) {
    const candidate = coarsePMTilesCandidate(level);
    if (!candidate) continue;
    coarsestCandidate = candidate;
    if (candidate.safe) {
      return {
        status: "ready",
        requestedBinSize,
        ...candidate
      };
    }
  }

  if (!coarsestCandidate) {
    return { status: "missing", requestedBinSize };
  }

  return {
    status: "overBudget",
    requestedBinSize,
    ...coarsestCandidate
  };
}

function precomputedCoarseCellInView(cell, view) {
  const ix = Math.round(Number(cell?.ix));
  const iy = Math.round(Number(cell?.iy));
  return (
    Number.isFinite(ix) &&
    Number.isFinite(iy) &&
    ix >= view.startAnchorX &&
    ix <= view.endAnchorX &&
    iy >= view.startAnchorY &&
    iy <= view.endAnchorY
  );
}

function parseGridWildJsonProp(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function expandCoarsePMTilesTaxon(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  if (!("k" in row) && !("n" in row)) return row;
  return {
    ...row,
    served_taxon_key: row.served_taxon_key ?? row.k ?? "",
    served_rank: row.served_rank ?? row.r ?? "",
    served_display_name: row.served_display_name ?? row.n ?? "",
    playable_group_key: row.playable_group_key ?? row.g ?? "",
    playable_group_name: row.playable_group_name ?? row.gn ?? "",
    iconic_taxon_name: row.iconic_taxon_name ?? row.i ?? "",
    order_name: row.order_name ?? row.o ?? "",
    family_name: row.family_name ?? row.f ?? "",
    genus_name: row.genus_name ?? row.ge ?? "",
    policy_action: row.policy_action ?? row.a ?? "",
    playability_score: row.playability_score ?? row.p ?? null,
    count: row.count ?? row.c ?? 0,
    raw_taxa_count: row.raw_taxa_count ?? row.rc ?? 0,
    month_counts: row.month_counts ?? row.m ?? [],
    last_observed: row.last_observed ?? row.lo ?? "",
    median_last10_observed: row.median_last10_observed ?? row.ml ?? ""
  };
}

function expandCoarsePMTilesObserver(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  if (!("id" in row) && !("c" in row)) return row;
  return {
    ...row,
    observer_id: row.observer_id ?? row.id ?? "",
    count: row.count ?? row.c ?? 0,
    species: row.species ?? row.s ?? 0,
    contributing_square_count: row.contributing_square_count ?? row.q ?? 0
  };
}

function coarsePMTilesCellFromProperties(props, binSize) {
  const ix = Math.round(Number(props?.ix));
  const iy = Math.round(Number(props?.iy));
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;

  const propBinSize = Math.round(Number(props?.bin_size) || 0);
  if (propBinSize !== binSize) return null;

  const monthTotals = parseGridWildJsonProp(props.month_totals_json, []);
  const iconicCounts = parseGridWildJsonProp(props.iconic_counts_json, {});
  const topTaxa = parseGridWildJsonProp(props.top_taxa_json, []);
  const topObservers = parseGridWildJsonProp(props.top_observers_json, []);

  return {
    ix,
    iy,
    key: `${ix},${iy}`,
    bin_size: binSize,
    count: Number(props.count) || 0,
    total_count: Number(props.total_count) || Number(props.count) || 0,
    species: Number(props.species) || Number(props.genera) || Number(props.unique_served_taxa) || 0,
    genera: Number(props.genera) || Number(props.species) || Number(props.unique_served_taxa) || 0,
    observers: Number(props.observers) || 0,
    n_captive: Number(props.n_captive) || 0,
    nSquares: Number(props.nSquares) || Number(props.n_squares) || binSize ** 2,
    nActiveSquares: Number(props.nActiveSquares) || Number(props.occupied_fine_squares) || 0,
    occupied_fine_squares: Number(props.occupied_fine_squares) || Number(props.nActiveSquares) || 0,
    unique_served_taxa: Number(props.unique_served_taxa) || 0,
    served_taxon_records: Number(props.served_taxon_records) || 0,
    observer_square_sum: Number(props.observer_square_sum) || 0,
    unique_top_observers: Number(props.unique_top_observers) || 0,
    coverage_ratio: Number(props.coverage_ratio) || 0,
    last_observed: props.last_observed || null,
    median_last10_observed: props.median_last10_observed || null,
    last_observed_ms: Number(props.last_observed_ms) || parseGridDateMs(props.last_observed),
    median_last10_observed_ms:
      Number(props.median_last10_observed_ms) || parseGridDateMs(props.median_last10_observed),
    dominant_iconic: props.dominant_iconic || "Unknown",
    iconic_n: Number(props.iconic_n) || 0,
    peak_month: Number(props.peak_month) || 1,
    seasonal_strength: Number(props.seasonal_strength) || 0,
    month_entropy: Number(props.month_entropy) || 0,
    activity_score: Number(props.activity_score) || 0,
    month_totals: Array.isArray(monthTotals) ? monthTotals : [],
    iconic_counts: iconicCounts && typeof iconicCounts === "object" ? iconicCounts : {},
    served_rank_counts: parseGridWildJsonProp(props.served_rank_counts_json, {}),
    policy_action_counts: parseGridWildJsonProp(props.policy_action_counts_json, {}),
    playable_group_counts: parseGridWildJsonProp(props.playable_group_counts_json, {}),
    top_taxa: Array.isArray(topTaxa) ? topTaxa.map(expandCoarsePMTilesTaxon) : [],
    top_observers: Array.isArray(topObservers) ? topObservers.map(expandCoarsePMTilesObserver) : [],
    source: "coarse_pmtiles_pyramid"
  };
}

function precomputedCoarseMetrics(cell) {
  if (!cell) return null;
  const monthTotals = Array.isArray(cell.month_totals)
    ? cell.month_totals.map((value) => Number(value) || 0).slice(0, 12)
    : [];
  while (monthTotals.length < 12) monthTotals.push(0);
  const iconicCounts =
    cell.iconic_counts &&
    typeof cell.iconic_counts === "object" &&
    !Array.isArray(cell.iconic_counts)
      ? cell.iconic_counts
      : {};
  const count = Number(cell.count) || 0;
  const totalCount = Number(cell.total_count) || count;
  const activeSquares =
    Number(cell.nActiveSquares) ||
    Number(cell.occupied_fine_squares) ||
    Number(count > 0 || totalCount > 0);

  return {
    ...cell,
    count,
    total_count: totalCount,
    species: Number(cell.species) || Number(cell.genera) || Number(cell.unique_served_taxa) || 0,
    genera: Number(cell.genera) || Number(cell.species) || Number(cell.unique_served_taxa) || 0,
    observers: Number(cell.observers) || 0,
    n_captive: Number(cell.n_captive) || 0,
    nSquares: Number(cell.nSquares) || Number(cell.n_squares) || Number(cell.bin_size) ** 2 || 0,
    nActiveSquares: activeSquares,
    month_totals: monthTotals,
    iconic_counts: iconicCounts,
    dominant_iconic: cell.dominant_iconic || "Unknown",
    iconic_n: Number(cell.iconic_n) || Object.keys(iconicCounts).length,
    peak_month: Number(cell.peak_month) || 1,
    seasonal_strength: Number(cell.seasonal_strength) || 0,
    month_entropy: Number(cell.month_entropy) || 0,
    last_observed: cell.last_observed || null,
    median_last10_observed: cell.median_last10_observed || null,
    last_observed_ms: Number(cell.last_observed_ms) || parseGridDateMs(cell.last_observed),
    median_last10_observed_ms:
      Number(cell.median_last10_observed_ms) || parseGridDateMs(cell.median_last10_observed),
    source: cell.source || "precomputed_coarse_pyramid"
  };
}

function renderCoarsePMTilesHeatCanvas(options = {}) {
  if (!canUseCoarsePMTilesHeat()) return null;

  const allowFetches = options.allowCoarsePMTilesTileMisses !== false;
  const requestedNewTileBudget = Number.parseInt(options.coarsePMTilesNewTileBudget, 10);
  let newTileBudget = allowFetches
    ? Math.max(
        0,
        Number.isFinite(requestedNewTileBudget)
          ? requestedNewTileBudget
          : COARSE_PMTILES_NEW_TILE_BUDGET
      )
    : 0;
  const requestedBinSize = getEffectiveCoarseHeatBinSize();
  const selected = selectCoarsePMTilesLevel(requestedBinSize);

  if (selected.status === "pending") {
    window.GridWildCoarsePMTiles.recordRender?.({
      status: "pending",
      requestedBinSize
    });
    return 0;
  }
  if (selected.status === "missing") {
    window.GridWildCoarsePMTiles.recordRender?.({
      status: "missing",
      requestedBinSize
    });
    return null;
  }
  if (selected.status !== "ready") {
    window.GridWildCoarsePMTiles.recordRender?.({
      status: selected.status || "overBudget",
      requestedBinSize,
      binSize: selected.binSize || null,
      reason: selected.reason || "budget",
      span: selected.view?.span || null
    });
    warnCoarseHeatBudgetExceeded(`coarse PMTiles ${selected.reason || "budget"}`, {
      requestedBinSize,
      binSize: selected.binSize,
      span: selected.view?.span
    });
    return 0;
  }

  const { binSize, view } = selected;
  const sourceSet = window.GridWildCoarsePMTiles.sourcesForView?.();
  const sources = sourceSet?.sources || [];

  if (!sources.length) {
    window.GridWildCoarsePMTiles.recordRender?.({
      status:
        sourceSet?.mode === "missing" || sourceSet?.mode === "unavailable" || sourceSet?.failed
          ? "unavailable"
          : "pending",
      requestedBinSize,
      binSize,
      mode: sourceSet?.mode || null,
      pendingSources: sourceSet?.pending || 0,
      selectedShards: sourceSet?.selectedShards || 0
    });
    return sourceSet?.mode === "missing" || sourceSet?.mode === "unavailable" || sourceSet?.failed
      ? null
      : 0;
  }

  const sourceRanges = sources.map((source) => ({
    source,
    z: getPMTilesHeatZoom(source)
  }));
  for (const item of sourceRanges) {
    item.range = getPMTilesHeatTileRange(item.z);
  }
  const totalTileCount = sourceRanges.reduce((sum, item) => sum + (item.range.tileCount || 0), 0);

  if (!totalTileCount || totalTileCount > COARSE_PMTILES_TILE_BUDGET) {
    window.GridWildCoarsePMTiles.recordRender?.({
      status: "overBudget",
      reason: "tile budget",
      requestedBinSize,
      binSize,
      mode: sourceSet?.mode || null,
      sourceCount: sources.length,
      selectedShards: sourceSet?.selectedShards || 0,
      totalTileCount,
      ranges: sourceRanges.map(({ source, z, range }) => ({
        source: source.id || source.file || "coarse",
        z,
        range
      }))
    });
    return null;
  }

  const items = [];
  const seenCells = new Set();
  let pendingTiles = 0;
  let deferredTiles = 0;
  let emptyTiles = 0;
  let tileHits = 0;
  let featureCount = 0;
  let requestedMissingTiles = 0;

  for (const { source, z, range } of sourceRanges) {
    for (let x = range.startX; x <= range.endX; x++) {
      for (let y = range.startY; y <= range.endY; y++) {
        const status = window.GridWildCoarsePMTiles.tileStatus?.(source, z, x, y) || "missing";
        if (status === "empty") {
          emptyTiles += 1;
          continue;
        }

        const fetchTile = allowFetches && status === "missing" && newTileBudget > 0;
        const tile = window.GridWildCoarsePMTiles.tileFor(source, z, x, y, {
          fetch: fetchTile
        });
        if (!tile) {
          if (status === "pending" || fetchTile) {
            pendingTiles += 1;
          } else if (status === "missing") {
            deferredTiles += 1;
          }
          if (fetchTile) {
            newTileBudget -= 1;
            requestedMissingTiles += 1;
          }
          continue;
        }

        tileHits += 1;
        for (const props of tile.features || []) {
          featureCount += 1;
          if (featureCount > COARSE_PMTILES_FEATURE_BUDGET) {
            window.GridWildCoarsePMTiles.recordRender?.({
              status: "overBudget",
              reason: "feature budget",
              requestedBinSize,
              binSize,
              mode: sourceSet?.mode || null,
              sourceCount: sources.length,
              featureCount
            });
            return null;
          }

          const cell = coarsePMTilesCellFromProperties(props, binSize);
          if (!cell || !precomputedCoarseCellInView(cell, view) || seenCells.has(cell.key)) {
            continue;
          }
          seenCells.add(cell.key);

          const metrics = precomputedCoarseMetrics(cell);
          const heatValue = getHeatValueForCell(metrics);
          if (heatValue <= 0) continue;
          items.push({
            ix: cell.ix,
            iy: cell.iy,
            key: cell.key,
            metrics,
            heatValue
          });
        }
      }
    }
  }

  if (!items.length) {
    window.GridWildCoarsePMTiles.recordRender?.({
      status: pendingTiles || deferredTiles ? "pending" : "empty",
      requestedBinSize,
      binSize,
      mode: sourceSet?.mode || null,
      sourceCount: sources.length,
      selectedShards: sourceSet?.selectedShards || 0,
      totalTileCount,
      tileHits,
      pendingTiles,
      deferredTiles,
      emptyTiles,
      requestedMissingTiles
    });
    return 0;
  }

  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(items.map((item) => item.heatValue))
    : null;
  const heatMorphologyMask = isHeatMorphologyEnabled()
    ? buildThresholdedHeatMorphologyMask(items, heatZStats, { step: binSize })
    : null;
  let painted = 0;

  for (const item of items) {
    const { ix, iy, metrics, heatValue, key } = item;
    if (
      heatMorphologyMask
        ? !heatMorphologyMask.has(key)
        : !passesHeatZThreshold(heatValue, heatZStats)
    ) {
      continue;
    }

    const baseStyle = metricsToFill(metrics);
    if (!baseStyle) continue;
    painted += paintCoarseHeatBin(gridHeatCtx, ix, iy, binSize, baseStyle);
  }

  gridHeatCtx.globalAlpha = 1;
  window.GridWildCoarsePMTiles.recordRender?.({
    status: "painted",
    requestedBinSize,
    binSize,
    mode: sourceSet?.mode || null,
    sourceCount: sources.length,
    selectedShards: sourceSet?.selectedShards || 0,
    totalTileCount,
    painted,
    itemCount: items.length,
    tileHits,
    pendingTiles,
    deferredTiles,
    emptyTiles,
    requestedMissingTiles
  });
  return painted;
}

function renderPrecomputedCoarseHeatCanvas(options = {}) {
  if (!canUsePrecomputedCoarseHeat()) return null;

  const allowFetches = options.allowCoarseTileMisses !== false;
  const requestedNewTileBudget = Number.parseInt(options.coarseNewTileBudget, 10);
  let newTileBudget = allowFetches
    ? Math.max(
        0,
        Number.isFinite(requestedNewTileBudget)
          ? requestedNewTileBudget
          : COARSE_PYRAMID_NEW_TILE_BUDGET
      )
    : 0;
  const requestedBinSize = getEffectiveCoarseHeatBinSize();
  const selected = selectPrecomputedCoarseLevel(requestedBinSize);
  if (selected.status === "pending") {
    window.GridWildCoarsePyramid.recordRender?.({
      status: "pending",
      requestedBinSize
    });
    return 0;
  }
  if (selected.status === "missing") {
    window.GridWildCoarsePyramid.recordRender?.({
      status: "missing",
      requestedBinSize
    });
    return null;
  }
  if (selected.status !== "ready") {
    window.GridWildCoarsePyramid.recordRender?.({
      status: selected.status || "overBudget",
      requestedBinSize,
      binSize: selected.binSize || null,
      reason: selected.reason || "budget",
      span: selected.view?.span || null,
      range: selected.range || null
    });
    warnCoarseHeatBudgetExceeded(`precomputed ${selected.reason || "budget"}`, {
      requestedBinSize,
      binSize: selected.binSize,
      span: selected.view?.span,
      tileCols: selected.range?.tileCols,
      tileRows: selected.range?.tileRows,
      tileCount: selected.range?.tileCount
    });
    return 0;
  }

  const { level, binSize, view, range } = selected;

  const items = [];
  let pendingTiles = 0;
  let deferredTiles = 0;
  let emptyTiles = 0;
  let tileHits = 0;
  let requestedMissingTiles = 0;

  for (let tileIx = range.startTileIx; tileIx <= range.endTileIx; tileIx++) {
    for (let tileIy = range.startTileIy; tileIy <= range.endTileIy; tileIy++) {
      const status = window.GridWildCoarsePyramid.tileStatus?.(level, tileIx, tileIy) || "missing";
      if (status === "empty") {
        emptyTiles += 1;
        continue;
      }

      const fetchTile = allowFetches && status === "missing" && newTileBudget > 0;
      const tile = window.GridWildCoarsePyramid.tileFor(level, tileIx, tileIy, {
        fetch: fetchTile
      });
      if (!tile) {
        if (status === "pending" || fetchTile) {
          pendingTiles += 1;
        } else if (status === "missing") {
          deferredTiles += 1;
        }
        if (fetchTile) {
          newTileBudget -= 1;
          requestedMissingTiles += 1;
        }
        continue;
      }

      tileHits += 1;
      for (const cell of tile.cells || []) {
        if (!precomputedCoarseCellInView(cell, view)) continue;
        const metrics = precomputedCoarseMetrics(cell);
        const heatValue = getHeatValueForCell(metrics);
        if (heatValue <= 0) continue;
        items.push({
          ix: Math.round(Number(cell.ix)),
          iy: Math.round(Number(cell.iy)),
          key: `${cell.ix},${cell.iy}`,
          metrics,
          heatValue
        });
      }
    }
  }

  if (!items.length) {
    window.GridWildCoarsePyramid.recordRender?.({
      status: pendingTiles || deferredTiles ? "pending" : "empty",
      requestedBinSize,
      binSize,
      tileCount: range.tileCount,
      tileHits,
      pendingTiles,
      deferredTiles,
      emptyTiles,
      requestedMissingTiles
    });
    return 0;
  }

  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(items.map((item) => item.heatValue))
    : null;
  const heatMorphologyMask = isHeatMorphologyEnabled()
    ? buildThresholdedHeatMorphologyMask(items, heatZStats, { step: binSize })
    : null;
  let painted = 0;

  for (const item of items) {
    const { ix, iy, metrics, heatValue, key } = item;
    if (
      heatMorphologyMask
        ? !heatMorphologyMask.has(key)
        : !passesHeatZThreshold(heatValue, heatZStats)
    ) {
      continue;
    }

    const baseStyle = metricsToFill(metrics);
    if (!baseStyle) continue;
    painted += paintCoarseHeatBin(gridHeatCtx, ix, iy, binSize, baseStyle);
  }

  gridHeatCtx.globalAlpha = 1;
  window.GridWildCoarsePyramid.recordRender?.({
    status: "painted",
    requestedBinSize,
    binSize,
    painted,
    itemCount: items.length,
    tileCount: range.tileCount,
    tileHits,
    pendingTiles,
    deferredTiles,
    emptyTiles,
    requestedMissingTiles,
    tileCols: range.tileCols,
    tileRows: range.tileRows
  });
  return painted;
}

function renderCoarseHeatTile(tileIx, tileIy, binSize, sourceLookup, sourceSignature) {
  const tileFineCells = getCoarseHeatTileFineCells(binSize);
  const {
    minIx,
    minIy,
    maxIx,
    maxIy,
    layerBounds: tileBounds
  } = coarseHeatTileBounds(tileIx, tileIy, tileFineCells);
  const canvasW = Math.max(1, Math.round(tileBounds.w));
  const canvasH = Math.max(1, Math.round(tileBounds.h));

  if (canvasW > COARSE_HEAT_TILE_MAX_PX || canvasH > COARSE_HEAT_TILE_MAX_PX) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext("2d", { alpha: true });
  let painted = 0;

  for (let ix = minIx; ix < maxIx; ix += binSize) {
    for (let iy = minIy; iy < maxIy; iy += binSize) {
      const metrics = getCachedCoarseMedianMetrics(ix, iy, binSize, sourceLookup, sourceSignature);
      if (!metrics) continue;

      const heatValue = getHeatValueForCell(metrics);
      if (heatValue <= 0) continue;

      const baseStyle = metricsToFill(metrics);
      if (!baseStyle) continue;

      painted += paintCoarseHeatBin(ctx, ix, iy, binSize, baseStyle, tileBounds);
    }
  }

  ctx.globalAlpha = 1;
  return { canvas, painted };
}

function renderCoarseTiledHeatCanvas(options = {}) {
  const allowCacheMisses = options.allowCoarseTileMisses !== false;
  const binSize = getEffectiveCoarseHeatBinSize();
  if (!isCoarseHeatTileCacheSafe(binSize)) {
    if (!allowCacheMisses) return 0;
    return renderCoarseMedianHeatCanvasDirect();
  }

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const binSizeM = binSize * GRID_SIZE_M;
  const startAnchorX = Math.floor(startX / binSizeM) * binSize;
  const endAnchorX = Math.floor((endX - GRID_SIZE_M) / binSizeM) * binSize;
  const startAnchorY = Math.floor(startY / binSizeM) * binSize;
  const endAnchorY = Math.floor((endY - GRID_SIZE_M) / binSizeM) * binSize;
  const span = getCoarseHeatBinSpan(startAnchorX, endAnchorX, startAnchorY, endAnchorY, binSize);
  if (!span.safe) {
    warnCoarseHeatBudgetExceeded("tiled bin budget", { ...span, binSize });
    return 0;
  }
  if (
    window.GridWildCoarseHeatCoverageIndex?.hasCoverage?.(
      binSize,
      startAnchorX,
      endAnchorX,
      startAnchorY,
      endAnchorY
    ) === false
  ) {
    return 0;
  }
  const tileFineCells = getCoarseHeatTileFineCells(binSize);
  const startTileIx = Math.floor(startAnchorX / tileFineCells);
  const endTileIx = Math.floor(endAnchorX / tileFineCells);
  const startTileIy = Math.floor(startAnchorY / tileFineCells);
  const endTileIy = Math.floor(endAnchorY / tileFineCells);
  const tileCols = Math.max(0, endTileIx - startTileIx + 1);
  const tileRows = Math.max(0, endTileIy - startTileIy + 1);
  const tileCount = tileCols * tileRows;
  if (!Number.isFinite(tileCount) || tileCount <= 0 || tileCount > COARSE_HEAT_RENDER_TILE_BUDGET) {
    warnCoarseHeatBudgetExceeded("tile budget", { tileCols, tileRows, tileCount, binSize });
    return 0;
  }
  const hydrationScope = makeCoarseRichHydrationScope(
    binSize,
    startAnchorX,
    endAnchorX,
    startAnchorY,
    endAnchorY
  );
  const sourceLookup = makeCoarseHeatSourceLookup({
    warmMissingRich: coarseHeatLensNeedsRichMetrics(),
    warmBounds: hydrationScope.bounds,
    hydrationViewKey: hydrationScope.viewKey
  });
  const sourceSignature = getCoarseHeatCacheSignature();
  const tileSignature = getCoarseHeatTileSignature(binSize, sourceSignature);
  const tilesToDraw = [];
  let painted = 0;

  for (let tileIx = startTileIx; tileIx <= endTileIx; tileIx++) {
    for (let tileIy = startTileIy; tileIy <= endTileIy; tileIy++) {
      const key = getCoarseHeatTileKey(tileIx, tileIy, binSize, tileSignature);
      const tile = allowCacheMisses
        ? window.GridWildCoarseHeatTileCache.get(key, () =>
            renderCoarseHeatTile(tileIx, tileIy, binSize, sourceLookup, sourceSignature)
          )
        : window.GridWildCoarseHeatTileCache.peek?.(key);
      if (!allowCacheMisses && !tile) continue;
      if (tile == null) return renderCoarseMedianHeatCanvasDirect();
      if (!tile?.painted) continue;

      const tileBounds = coarseHeatTileBounds(tileIx, tileIy, tileFineCells).layerBounds;
      tilesToDraw.push({ tile, tileBounds });
      painted += tile.painted;
    }
  }

  for (const { tile, tileBounds } of tilesToDraw) {
    gridHeatCtx.globalAlpha = 1;
    gridHeatCtx.drawImage(tile.canvas, tileBounds.x, tileBounds.y, tileBounds.w, tileBounds.h);
  }

  gridHeatCtx.globalAlpha = 1;
  return painted;
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

  const fogOn = window.__gwState?.showFog ?? false;

  const counts = window.__staticGridCounts;
  if (!(counts instanceof Map) || counts.size === 0) return;

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();

  if (window.GridWildMeOverlayFilter?.isActive?.()) {
    const entries = window.GridWildMeOverlayFilter.entriesInMeterBounds(startX, endX, startY, endY);

    for (const { ix, iy, key, metrics: displayMetrics } of entries) {
      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;

      const baseStyle = metricsToFill(displayMetrics);
      if (!baseStyle) continue;

      const x = ix * GRID_SIZE_M;
      const y = iy * GRID_SIZE_M;
      const sw = map.options.crs.unproject(L.point(x, y));
      const ne = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));
      const fogState = fogOn && window.GridWildFog ? window.GridWildFog.getCellFogState(key) : null;
      const transientRevealStrength =
        typeof window.getGridWildTransientRevealStrength === "function"
          ? window.getGridWildTransientRevealStrength(key)
          : window.isGridWildTransientVisibleCell?.(key)
            ? 1
            : 0;
      const godsEyeTransientVisible = transientRevealStrength > 0;

      if (
        fogOn &&
        fogState &&
        !godsEyeTransientVisible &&
        (fogState.state === "unknown" || fogState.state === "expired")
      ) {
        continue;
      }

      L.rectangle([sw, ne], {
        ...HEAT_TILE_STYLE_BASE,
        ...baseStyle
      }).addTo(gridHeatLayer);
    }

    if (window.GridWildFogCanvas) {
      window.GridWildFogCanvas.scheduleRender();
    }
    return;
  }

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics = window.__richGridMetrics?.get(key) || counts.get(key);

      if (!metrics) continue;

      const displayMetrics = getDisplayMetricsForCell(ix, iy, metrics || {});

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

      const transientRevealStrength =
        typeof window.getGridWildTransientRevealStrength === "function"
          ? window.getGridWildTransientRevealStrength(key)
          : window.isGridWildTransientVisibleCell?.(key)
            ? 1
            : 0;
      const godsEyeTransientVisible = transientRevealStrength > 0;

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
          0.18 + transientRevealStrength * 0.24
        );
      }

      // Surveyed cells are visible but slightly misted/faded over time
      if (fogOn && fogState?.state === "surveyed") {
        style.fillOpacity = Math.max(0.08, Number(baseStyle.fillOpacity || 0.25) * fogState.reveal);
      }

      // Documented cells get a stronger permanent “known land” treatment
      if (fogOn && fogState?.state === "documented") {
        style.fillOpacity = Math.min(0.92, Number(baseStyle.fillOpacity || 0.35) + 0.12);
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

  const center = getVisualGridFineCell();

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

function gridHeatCanvasCoversCurrentViewport() {
  return window.GridWildCanvasPerf?.canvasCoversViewport?.(gridHeatCanvasLayout) === true;
}

function beginGridHeatMotion(evt) {
  const now = Date.now();
  const mapZoom = Number(map.getZoom?.()) || 0;
  const autoBinSize = getAutoCoarseHeatBinSize();

  gridHeatMotionState.active = true;
  gridHeatMotionState.type = evt?.type || "motion";
  gridHeatMotionState.startedAt = now;
  gridHeatMotionState.frozenAutoBinSize = autoBinSize;
  gridHeatMotionState.frozenEffectiveBinSize = autoBinSize || getCoarseHeatBinSize();
  gridHeatMotionState.frozenPMTilesHeatZoom = getPMTilesHeatZoom({ minZoom: 0, maxZoom: 19 });
  gridHeatMotionState.frozenPMTilesFineZ19 = shouldUsePMTilesFineZ19(mapZoom);

  if (gridHeatThrottleTimer) {
    clearTimeout(gridHeatThrottleTimer);
    gridHeatThrottleTimer = null;
  }

  gridHeatLastRenderState = {
    ...(gridHeatLastRenderState || {}),
    motionActive: true,
    motionType: gridHeatMotionState.type,
    motionStartedAt: now,
    frozenAutoBinSize: gridHeatMotionState.frozenAutoBinSize,
    frozenEffectiveBinSize: gridHeatMotionState.frozenEffectiveBinSize,
    frozenPMTilesHeatZoom: gridHeatMotionState.frozenPMTilesHeatZoom
  };
}

function endGridHeatMotion(evt) {
  if (!gridHeatMotionState.active) return;

  const now = Date.now();
  gridHeatMotionState.active = false;
  gridHeatMotionState.settledAt = now;

  const coveredPanEnd = evt?.type === "moveend" && gridHeatCanvasCoversCurrentViewport();
  gridHeatLastRenderState = {
    ...(gridHeatLastRenderState || {}),
    motionActive: false,
    motionSettledAt: now,
    motionEndType: evt?.type || null,
    panEndRenderHeld: coveredPanEnd || undefined
  };

  if (coveredPanEnd) {
    gridHeatMotionState.skipNextUntypedRender = true;
    return;
  }

  scheduleGridHeatCanvasRender({
    force: true,
    reason: `${evt?.type || "motion"}-settled`
  });
}

function isGridHeatInteractionEvent(evt) {
  return evt?.type === "move" || evt?.type === "zoom";
}

function isGridHeatSettledEvent(evt) {
  return (
    evt?.type === "moveend" ||
    evt?.type === "zoomend" ||
    evt?.type === "resize" ||
    evt?.type === "viewreset"
  );
}

function requestGridHeatCanvasFrame(options = {}) {
  const allowCoarseTileMisses = options.allowCoarseTileMisses !== false;
  const allowPMTilesTileMisses = options.allowPMTilesTileMisses !== false;

  if (gridHeatRaf) {
    if (allowCoarseTileMisses || !allowPMTilesTileMisses) {
      gridHeatPendingRenderOptions = {
        ...(gridHeatPendingRenderOptions || {}),
        ...options,
        allowCoarseTileMisses:
          Boolean(gridHeatPendingRenderOptions?.allowCoarseTileMisses) || allowCoarseTileMisses,
        allowPMTilesTileMisses:
          gridHeatPendingRenderOptions?.allowPMTilesTileMisses !== false && allowPMTilesTileMisses
      };
    }
    return;
  }

  gridHeatPendingRenderOptions = {
    allowCoarseTileMisses,
    allowPMTilesTileMisses,
    reason: options.reason || null
  };

  if (window.GridWildMapMotionQueue?.requestFrame) {
    gridHeatRaf = true;
    window.GridWildMapMotionQueue.requestFrame("grid-heat", () => renderGridHeatCanvas());
  } else {
    gridHeatRaf = requestAnimationFrame(() => renderGridHeatCanvas());
  }
}

function scheduleGridHeatCanvasRender(evt) {
  if (evt?.type === "move" || evt?.type === "zoom") {
    const previewType = evt.type;
    gridHeatLastRenderState = {
      ...(gridHeatLastRenderState || {}),
      skippedMotionPreview: previewType,
      skippedMotionPreviewAt: Date.now(),
      canvasCoveredViewport:
        window.GridWildCanvasPerf?.canvasCoversViewport?.(gridHeatCanvasLayout) === true
    };
    return;
  }

  if (evt?.type === "moveend" && gridHeatCanvasCoversCurrentViewport()) {
    gridHeatMotionState.skipNextUntypedRender = true;
    gridHeatLastRenderState = {
      ...(gridHeatLastRenderState || {}),
      skippedCoveredMoveEndRefresh: true,
      skippedCoveredMoveEndRefreshAt: Date.now()
    };
    return;
  }

  if (!evt && gridHeatMotionState.skipNextUntypedRender) {
    gridHeatMotionState.skipNextUntypedRender = false;
    gridHeatLastRenderState = {
      ...(gridHeatLastRenderState || {}),
      skippedCoveredMoveEndUpdateGridRefresh: true,
      skippedCoveredMoveEndUpdateGridRefreshAt: Date.now()
    };
    return;
  }

  const force = evt?.force === true || isGridHeatSettledEvent(evt);
  const throttle = isGridHeatInteractionEvent(evt) && !force;

  if (!throttle) {
    if (gridHeatThrottleTimer) {
      clearTimeout(gridHeatThrottleTimer);
      gridHeatThrottleTimer = null;
    }
    requestGridHeatCanvasFrame();
    return;
  }

  const now = performance.now();
  const elapsed = now - gridHeatLastRenderAt;
  if (elapsed >= GRID_HEAT_INTERACTION_RENDER_INTERVAL_MS) {
    requestGridHeatCanvasFrame();
    return;
  }

  if (gridHeatThrottleTimer) return;

  gridHeatThrottleTimer = setTimeout(() => {
    gridHeatThrottleTimer = null;
    requestGridHeatCanvasFrame();
  }, GRID_HEAT_INTERACTION_RENDER_INTERVAL_MS - elapsed);
}

function drawFineHeatItem(item, fogOn) {
  const { ix, iy, key, metrics: displayMetrics } = item;
  const baseStyle = metricsToFill(displayMetrics);
  if (!baseStyle) return false;

  let fogState = null;
  const transientRevealStrength =
    typeof window.getGridWildTransientRevealStrength === "function"
      ? window.getGridWildTransientRevealStrength(key)
      : window.isGridWildTransientVisibleCell?.(key)
        ? 1
        : 0;
  const godsEyeTransientVisible = transientRevealStrength > 0;

  if (fogOn && window.GridWildFog) {
    fogState = window.GridWildFog.getCellFogState(key);

    if (
      !godsEyeTransientVisible &&
      (fogState.state === "unknown" || fogState.state === "expired")
    ) {
      return false;
    }
  }

  let fillOpacity = Number(baseStyle.fillOpacity || 0.25);

  if (godsEyeTransientVisible && fogState?.state !== "documented") {
    fillOpacity = Math.max(fillOpacity, 0.18 + transientRevealStrength * 0.24);
  }

  if (fogOn && fogState?.state === "surveyed") {
    fillOpacity = Math.max(0.08, fillOpacity * fogState.reveal);
  }

  if (fogOn && fogState?.state === "documented") {
    fillOpacity = Math.min(0.92, fillOpacity + 0.12);
  }

  const x = Number.isFinite(item.x) ? item.x : ix * GRID_SIZE_M;
  const y = Number.isFinite(item.y) ? item.y : iy * GRID_SIZE_M;
  paintFineHeatMeterRect(
    x,
    y,
    x + GRID_SIZE_M,
    y + GRID_SIZE_M,
    fillOpacity,
    baseStyle.fillColor,
    fogOn && fogState?.state === "documented"
  );

  return true;
}

function visibleFineCellRange(startX, endX, startY, endY) {
  return {
    minIx: Math.floor(startX / GRID_SIZE_M),
    maxIx: Math.floor((endX - GRID_SIZE_M) / GRID_SIZE_M),
    minIy: Math.floor(startY / GRID_SIZE_M),
    maxIy: Math.floor((endY - GRID_SIZE_M) / GRID_SIZE_M)
  };
}

function metadataFilteredHeatSuperchunksForView(startX, endX, startY, endY) {
  const manifest = window.__gwMetadataShardManifest;
  const index = manifest?.__shardIndex;
  if (!index?.size) return [];

  const range = visibleFineCellRange(startX, endX, startY, endY);
  const superchunkSize = getGeneraSuperchunkSize();
  const startSx = Math.floor(range.minIx / superchunkSize);
  const endSx = Math.floor(range.maxIx / superchunkSize);
  const startSy = Math.floor(range.minIy / superchunkSize);
  const endSy = Math.floor(range.maxIy / superchunkSize);
  const center = getVisualGridFineCell();
  const centerSx = Math.floor(center.ix / superchunkSize);
  const centerSy = Math.floor(center.iy / superchunkSize);
  const shards = [];

  for (let sx = startSx; sx <= endSx; sx++) {
    for (let sy = startSy; sy <= endSy; sy++) {
      const key = `${sx}_${sy}`;
      if (!index.has(key)) continue;
      shards.push({
        key,
        sx,
        sy,
        ix: sx * superchunkSize,
        iy: sy * superchunkSize,
        distance: Math.abs(sx - centerSx) + Math.abs(sy - centerSy)
      });
    }
  }

  shards.sort((a, b) => a.distance - b.distance || a.sx - b.sx || a.sy - b.sy);
  return shards;
}

function getCachedGeneraChunkForSuperKey(superKey) {
  const chunk = window.__squareGeneraSuperchunkCache?.get?.(superKey);
  if (chunk?.squares) return chunk;

  const metadataChunk = window.__gwMetadataShardCache?.get?.(superKey);
  return metadataChunk?.squares ? metadataChunk : null;
}

function decodeGeneraSquareId(squareId) {
  const match = /^sq_([mp]\d+)_([mp]\d+)$/.exec(String(squareId || ""));
  if (!match) return null;

  const decode = (part) => {
    const value = Number(part.slice(1));
    if (!Number.isFinite(value)) return null;
    return part[0] === "m" ? -value : value;
  };
  const ix = decode(match[1]);
  const iy = decode(match[2]);
  return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy } : null;
}

function requestMetadataFilteredHeatChunk(shard) {
  if (!shard) return;
  if (window.__squareGeneraSuperchunkPending?.has?.(shard.key)) return;
  if (window.__gwMetadataShardPending?.has?.(shard.key)) return;

  loadGeneraSuperchunk(shard.ix, shard.iy)
    .then(() => scheduleGridHeatCanvasRender())
    .catch((err) => console.warn("Metadata filtered heat shard unavailable:", err));
}

function collectMetadataFilteredHeatItems(chunks, range) {
  const items = [];
  let consideredCells = 0;
  let limited = false;

  for (const chunk of chunks) {
    const squares = chunk?.squares || {};
    for (const [squareId, rec] of Object.entries(squares)) {
      const decoded = decodeGeneraSquareId(squareId);
      const ix = Math.floor(Number.isFinite(Number(rec?.ix)) ? Number(rec.ix) : decoded?.ix);
      const iy = Math.floor(Number.isFinite(Number(rec?.iy)) ? Number(rec.iy) : decoded?.iy);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
      if (ix < range.minIx || ix > range.maxIx || iy < range.minIy || iy > range.maxIy) continue;

      consideredCells++;
      if (consideredCells > METADATA_FILTER_HEAT_CELL_BUDGET) {
        limited = true;
        break;
      }

      const key = `${ix},${iy}`;
      const baseMetrics = rec.__metrics || buildRichMetricsForGeneraRecord(ix, iy, rec);
      const displayMetrics = getDisplayMetricsForCell(ix, iy, baseMetrics, {
        requestMissingRecord: false
      });
      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;

      items.push({
        ix,
        iy,
        key,
        x: ix * GRID_SIZE_M,
        y: iy * GRID_SIZE_M,
        metrics: displayMetrics,
        heatValue
      });
    }
    if (limited) break;
  }

  return { items, consideredCells, limited };
}

function buildMetadataFilteredCoarseMetrics(items, binSize) {
  const values = {
    count: [],
    species: [],
    genera: [],
    observers: [],
    n_captive: [],
    median_last10_observed_ms: []
  };
  const lensFields = {
    iconic_counts: {},
    month_totals: Array(12).fill(0)
  };
  let nActiveSquares = 0;
  let latestLastObservedMs = 0;

  for (const item of items || []) {
    const metrics = item?.metrics;
    if (!hasGridMetricSignal(metrics)) continue;

    const count = Number(metrics.count) || 0;
    const species = Number(metrics.species) || Number(metrics.genera) || 0;
    const genera = Number(metrics.genera) || species;
    const observers = Number(metrics.observers) || 0;
    const nCaptive = Number(metrics.n_captive) || 0;
    const lastObservedMs =
      Number(metrics.last_observed_ms) || parseGridDateMs(metrics.last_observed);
    const medianLast10Ms =
      Number(metrics.median_last10_observed_ms) || parseGridDateMs(metrics.median_last10_observed);

    values.count.push(count);
    values.species.push(species);
    values.genera.push(genera);
    values.observers.push(observers);
    values.n_captive.push(nCaptive);
    if (medianLast10Ms) values.median_last10_observed_ms.push(medianLast10Ms);
    latestLastObservedMs = Math.max(latestLastObservedMs, lastObservedMs || 0);
    mergeCoarseLensMetricFields(lensFields, metrics);
    if (count > 0) nActiveSquares++;
  }

  if (!values.count.length) return null;

  const peak = Math.max(...lensFields.month_totals);
  const total = lensFields.month_totals.reduce((sum, value) => sum + value, 0);
  const dominant =
    Object.entries(lensFields.iconic_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

  return {
    count: median(values.count),
    species: median(values.species),
    genera: median(values.genera),
    observers: median(values.observers),
    n_captive: median(values.n_captive),
    iconic_counts: lensFields.iconic_counts,
    month_totals: lensFields.month_totals,
    dominant_iconic: dominant,
    iconic_n: Object.keys(lensFields.iconic_counts).length,
    peak_month: lensFields.month_totals.indexOf(peak) + 1,
    seasonal_strength: total ? peak / total : 0,
    month_entropy: metricEntropy(lensFields.month_totals),
    last_observed: gridDateIsoFromMs(latestLastObservedMs),
    median_last10_observed: gridDateIsoFromMs(median(values.median_last10_observed_ms)),
    last_observed_ms: latestLastObservedMs,
    median_last10_observed_ms: median(values.median_last10_observed_ms),
    nSquares: binSize * binSize,
    nActiveSquares,
    activity_score: Math.log1p(median(values.count)) * (1 + median(values.genera) * 0.05),
    source: "metadata_filter_coarse"
  };
}

function collectMetadataFilteredCoarseHeatItems(items, binSize) {
  const normalizedBinSize = Math.max(1, Math.round(Number(binSize) || 1));
  const groups = new Map();

  for (const item of items || []) {
    const ix = Math.floor(Number(item?.ix));
    const iy = Math.floor(Number(item?.iy));
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;

    const anchorIx = Math.floor(ix / normalizedBinSize) * normalizedBinSize;
    const anchorIy = Math.floor(iy / normalizedBinSize) * normalizedBinSize;
    const key = `${anchorIx},${anchorIy}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        ix: anchorIx,
        iy: anchorIy,
        key,
        cells: []
      };
      groups.set(key, group);
    }
    group.cells.push(item);
  }

  const coarseItems = [];
  for (const group of groups.values()) {
    const metrics = buildMetadataFilteredCoarseMetrics(group.cells, normalizedBinSize);
    if (!metrics) continue;

    const heatValue = getHeatValueForCell(metrics);
    if (heatValue <= 0) continue;

    coarseItems.push({
      ix: group.ix,
      iy: group.iy,
      key: group.key,
      metrics,
      heatValue,
      fineItemCount: group.cells.length
    });
  }

  return coarseItems;
}

function renderMetadataFilteredHeatCanvas(startX, endX, startY, endY, fogOn) {
  if (shouldRenderMetadataShardHeat() !== true) return null;

  if (!window.__gwMetadataShardManifest && !window.__gwMetadataShardUnavailable) {
    ensureMetadataShardManifest()
      .then(() => scheduleGridHeatCanvasRender())
      .catch((err) => console.warn("Metadata filtered heat manifest unavailable:", err));
    return { status: "pending", painted: 0, pendingShards: 1, itemCount: 0 };
  }

  if (!window.__gwMetadataShardManifest?.__shardIndex) return null;

  const range = visibleFineCellRange(startX, endX, startY, endY);
  const shards = metadataFilteredHeatSuperchunksForView(startX, endX, startY, endY);
  if (!shards.length) return { status: "empty", painted: 0, pendingShards: 0, itemCount: 0 };

  const selectedShards = shards.slice(0, METADATA_FILTER_HEAT_SUPERCHUNK_BUDGET);
  const truncatedShards = shards.length > selectedShards.length;
  const chunks = [];
  let pendingShards = 0;

  for (const shard of selectedShards) {
    const chunk = getCachedGeneraChunkForSuperKey(shard.key);
    if (chunk) {
      chunks.push(chunk);
      continue;
    }

    pendingShards++;
    requestMetadataFilteredHeatChunk(shard);
  }

  const { items, consideredCells, limited } = collectMetadataFilteredHeatItems(chunks, range);
  const coarseMode = isCoarseHeatEnabled();
  const binSize = coarseMode ? getEffectiveCoarseHeatBinSize() : 1;
  const paintItems = coarseMode ? collectMetadataFilteredCoarseHeatItems(items, binSize) : items;
  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(paintItems.map((item) => item.heatValue))
    : null;
  const heatMorphologyMask = isHeatMorphologyEnabled()
    ? buildThresholdedHeatMorphologyMask(paintItems, heatZStats, { step: binSize })
    : null;
  let painted = 0;

  for (const item of paintItems) {
    if (
      heatMorphologyMask
        ? !heatMorphologyMask.has(item.key)
        : !passesHeatZThreshold(item.heatValue, heatZStats)
    ) {
      continue;
    }

    if (coarseMode) {
      const baseStyle = metricsToFill(item.metrics);
      if (!baseStyle) continue;
      painted += paintCoarseHeatBin(gridHeatCtx, item.ix, item.iy, binSize, baseStyle);
    } else if (drawFineHeatItem(item, fogOn)) {
      painted++;
    }
  }

  gridHeatCtx.globalAlpha = 1;
  return {
    status: painted ? "painted" : pendingShards ? "pending" : "empty",
    mode: coarseMode ? "coarse" : "fine",
    binSize,
    painted,
    pendingShards,
    selectedShards: selectedShards.length,
    visibleShards: shards.length,
    truncatedShards,
    itemCount: paintItems.length,
    fineItemCount: items.length,
    consideredCells,
    limited
  };
}

function canUsePMTilesHeat() {
  if (window.__gwState?.pmtilesHeatEnabled === false) return false;
  if (!window.GridWildPMTilesHeat?.tileFor) return false;
  if (window.GridWildMeOverlayFilter?.isActive?.()) return false;
  if (window.GridWildIconicOverlayFilter?.isActive?.()) return false;
  const activeLens = window.__gwState?.activeLens || "classic";
  if (heatLensNeedsRichMetrics(activeLens)) return false;
  if (window.GridWildOsmPriorsLayer?.isOsmPriorLens?.(activeLens)) return false;

  const metric = window.__gwState?.heatMetric || "count";
  return metric === "count" || metric === "species" || metric === "observers";
}

function getPMTilesHeatGateState() {
  const metric = window.__gwState?.heatMetric || "count";
  const activeLens = window.__gwState?.activeLens || "classic";
  const reasons = [];

  if (window.__gwState?.pmtilesHeatEnabled === false) reasons.push("pmtiles disabled");
  if (!window.GridWildPMTilesHeat?.tileFor) reasons.push("pmtiles renderer unavailable");
  if (window.GridWildMeOverlayFilter?.isActive?.()) reasons.push("me overlay active");
  if (window.GridWildIconicOverlayFilter?.isActive?.()) reasons.push("iconic overlay active");
  if (heatLensNeedsRichMetrics(activeLens)) reasons.push(`rich metric lens ${activeLens}`);
  if (window.GridWildOsmPriorsLayer?.isOsmPriorLens?.(activeLens)) {
    reasons.push(`OSM prior lens ${activeLens}`);
  }
  if (!(metric === "count" || metric === "species" || metric === "observers")) {
    reasons.push(`unsupported metric ${metric}`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    activeLens,
    metric,
    meOverlayActive: Boolean(window.GridWildMeOverlayFilter?.isActive?.()),
    iconicOverlayActive: Boolean(window.GridWildIconicOverlayFilter?.isActive?.()),
    pyriteEnabled: Boolean(window.GridWildPyriteLake?.isEnabled?.())
  };
}

function clampPMTilesTile(value, z) {
  const max = Math.pow(2, z) - 1;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function lngLatToPMTilesTile(lng, lat, z) {
  const n = Math.pow(2, z);
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
  const safeLng = Math.max(-180, Math.min(180, Number(lng) || 0));
  const latRad = (safeLat * Math.PI) / 180;
  const x = ((safeLng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    x: clampPMTilesTile(x, z),
    y: clampPMTilesTile(y, z)
  };
}

function clampPMTilesHeatZoom(heatZoom, info) {
  const minZoom = Number.isFinite(info?.minZoom) ? info.minZoom : 0;
  const maxZoom = Number.isFinite(info?.maxZoom) ? info.maxZoom : 19;
  return Math.max(minZoom, Math.min(maxZoom, heatZoom));
}

function computePMTilesFineZ19Use(rawMapZoom = Number(map.getZoom()) || 0) {
  const zoomMultiplier = Math.pow(2, Number(rawMapZoom) - 17);
  return zoomMultiplier >= PMTILES_HEAT_FINE_Z19_MIN_MULTIPLIER && rawMapZoom < 19;
}

function shouldUsePMTilesFineZ19(rawMapZoom = Number(map.getZoom()) || 0) {
  if (gridHeatMotionState.active && typeof gridHeatMotionState.frozenPMTilesFineZ19 === "boolean") {
    return gridHeatMotionState.frozenPMTilesFineZ19;
  }

  return computePMTilesFineZ19Use(rawMapZoom);
}

function computePMTilesHeatZoom(rawMapZoom = Number(map.getZoom()) || 0) {
  return shouldUsePMTilesFineZ19(rawMapZoom) ? 19 : Math.round(rawMapZoom);
}

function getPMTilesHeatZoom(info) {
  if (gridHeatMotionState.active && Number.isFinite(gridHeatMotionState.frozenPMTilesHeatZoom)) {
    return clampPMTilesHeatZoom(gridHeatMotionState.frozenPMTilesHeatZoom, info);
  }

  return clampPMTilesHeatZoom(computePMTilesHeatZoom(), info);
}

function isPMTilesFineZ19MidBand(z) {
  return Number(z) >= 19 && shouldUsePMTilesFineZ19();
}

function getPMTilesHeatTileRange(z) {
  const padRatio = PMTILES_HEAT_TILE_PAD_RATIO;
  const bounds = map.getBounds().pad(padRatio);
  const nw = lngLatToPMTilesTile(bounds.getWest(), bounds.getNorth(), z);
  const se = lngLatToPMTilesTile(bounds.getEast(), bounds.getSouth(), z);
  const startX = Math.min(nw.x, se.x);
  const endX = Math.max(nw.x, se.x);
  const startY = Math.min(nw.y, se.y);
  const endY = Math.max(nw.y, se.y);
  const cols = Math.max(0, endX - startX + 1);
  const rows = Math.max(0, endY - startY + 1);

  return {
    startX,
    endX,
    startY,
    endY,
    cols,
    rows,
    tileCount: cols * rows,
    padRatio
  };
}

function pmtilesHeatMetricsFromProperties(props) {
  const ix = Math.round(Number(props?.ix));
  const iy = Math.round(Number(props?.iy));
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;

  const count = Number(props.count) || 0;
  if (count <= 0) return null;

  const genera = Number(props.n_genera ?? props.genera ?? props.species) || 0;
  const observers = Number(props.n_observers ?? props.observers) || 0;
  const lastObserved = props.last_observed || null;
  const medianLast10Observed = props.median_last10_observed || null;

  return {
    ix,
    iy,
    key: `${ix},${iy}`,
    x: ix * GRID_SIZE_M,
    y: iy * GRID_SIZE_M,
    metrics: {
      count,
      total_count: count,
      species: genera,
      genera,
      observers,
      last_observed: lastObserved,
      median_last10_observed: medianLast10Observed,
      last_observed_ms: parseGridDateMs(lastObserved),
      median_last10_observed_ms: parseGridDateMs(medianLast10Observed),
      source: "pmtiles_fine_visual"
    }
  };
}

function drawPMTilesHeatItem(item, fogOn) {
  const baseStyle = metricsToFill(item.metrics);
  if (!baseStyle) return false;

  const baseOpacity = Number(baseStyle.fillOpacity || 0.25);
  const fog = coarseFogAdjustedOpacityForCell(item.key, baseOpacity, fogOn);
  if (!fog.visible || fog.opacity <= 0) return false;

  paintFineHeatMeterRect(
    item.x,
    item.y,
    item.x + GRID_SIZE_M,
    item.y + GRID_SIZE_M,
    fog.opacity,
    baseStyle.fillColor,
    fog.documented
  );
  return true;
}

function renderPMTilesHeatCanvas(options = {}) {
  if (!canUsePMTilesHeat()) return null;

  const sourceSet = window.GridWildPMTilesHeat.sourcesForView?.();
  const sources = sourceSet?.sources || [];
  if (!sources.length) {
    const stats = window.GridWildPMTilesHeat.stats?.() || {};
    window.GridWildPMTilesHeat.recordRender?.({
      status: stats.sourceFailed || stats.importsFailed ? "unavailable" : "pending",
      mode: sourceSet?.mode || null,
      pendingSources: sourceSet?.pending || 0,
      selectedShards: sourceSet?.selectedShards || 0
    });
    return stats.sourceFailed || stats.importsFailed ? null : 0;
  }

  const sourceRanges = sources.map((source) => ({
    source,
    z: getPMTilesHeatZoom(source)
  }));
  for (const item of sourceRanges) {
    item.range = getPMTilesHeatTileRange(item.z);
  }
  const fineZ19MidBand = sourceRanges.some((item) => isPMTilesFineZ19MidBand(item.z));
  const totalTileCount = sourceRanges.reduce((sum, item) => sum + (item.range.tileCount || 0), 0);
  const tileBudget = fineZ19MidBand ? PMTILES_HEAT_FINE_Z19_TILE_BUDGET : PMTILES_HEAT_TILE_BUDGET;
  if (!totalTileCount || totalTileCount > tileBudget) {
    window.GridWildPMTilesHeat.recordRender?.({
      status: "overBudget",
      reason: "tile budget",
      mode: sourceSet?.mode || null,
      sourceCount: sources.length,
      selectedShards: sourceSet?.selectedShards || 0,
      fineZ19MidBand,
      tileBudget,
      totalTileCount,
      ranges: sourceRanges.map(({ source, z, range }) => ({
        source: source.id || source.file || "single",
        z,
        range
      }))
    });
    return null;
  }

  const allowFetches = options.allowPMTilesTileMisses !== false;
  const startupElapsed = performance.now() - GRIDWILD_BOOT_STARTED_AT;
  const startupGraceActive = startupElapsed < PMTILES_HEAT_STARTUP_GRACE_MS;
  const startupHasHeatFallback =
    isCoarseHeatEnabled() || hasStaticHeatmapCounts() || window.GridWildPyriteLake?.isEnabled?.();
  const startupFetchDeferred = startupGraceActive && startupHasHeatFallback;
  if (startupFetchDeferred && !window.__gwPMTilesStartupResumeTimer) {
    window.__gwPMTilesStartupResumeTimer = window.setTimeout(
      () => {
        window.__gwPMTilesStartupResumeTimer = null;
        scheduleGridHeatCanvasRender({ force: true, reason: "pmtiles-startup-resume" });
      },
      Math.max(250, PMTILES_HEAT_STARTUP_GRACE_MS - startupElapsed + 50)
    );
  }
  const requestedNewTileBudget = Number.parseInt(options.pmtilesNewTileBudget, 10);
  const defaultNewTileBudget = fineZ19MidBand
    ? PMTILES_HEAT_FINE_Z19_NEW_TILE_BUDGET
    : PMTILES_HEAT_NEW_TILE_BUDGET;
  let newTileBudget = startupFetchDeferred
    ? 0
    : Math.max(
        0,
        Number.isFinite(requestedNewTileBudget) ? requestedNewTileBudget : defaultNewTileBudget
      );
  const items = [];
  const seenCells = new Set();
  let pendingTiles = 0;
  let deferredTiles = 0;
  let emptyTiles = 0;
  let tileHits = 0;
  let featureCount = 0;
  let requestedMissingTiles = 0;

  for (const { source, z, range } of sourceRanges) {
    for (let x = range.startX; x <= range.endX; x++) {
      for (let y = range.startY; y <= range.endY; y++) {
        const status = window.GridWildPMTilesHeat.tileStatus?.(source, z, x, y) || "missing";
        if (status === "empty") {
          emptyTiles += 1;
          continue;
        }

        const fetchTile = allowFetches && status === "missing" && newTileBudget > 0;
        const tile = window.GridWildPMTilesHeat.tileFor(source, z, x, y, {
          fetch: fetchTile
        });
        if (!tile) {
          if (status === "pending" || fetchTile) {
            pendingTiles += 1;
          } else if (status === "missing") {
            deferredTiles += 1;
          }
          if (fetchTile) {
            newTileBudget -= 1;
            requestedMissingTiles += 1;
          }
          continue;
        }

        tileHits += 1;
        for (const props of tile.features || []) {
          featureCount += 1;
          if (featureCount > PMTILES_HEAT_FEATURE_BUDGET) {
            window.GridWildPMTilesHeat.recordRender?.({
              status: "overBudget",
              reason: "feature budget",
              mode: sourceSet?.mode || null,
              sourceCount: sources.length,
              fineZ19MidBand,
              featureCount
            });
            return null;
          }

          const item = pmtilesHeatMetricsFromProperties(props);
          if (!item || seenCells.has(item.key)) continue;
          seenCells.add(item.key);
          recordFinePMTilesRuntimeMetrics(item);

          const heatValue = getHeatValueForCell(item.metrics);
          if (heatValue <= 0) continue;
          items.push({ ...item, heatValue });
        }
      }
    }
  }

  if (fineZ19MidBand && (pendingTiles || deferredTiles || requestedMissingTiles)) {
    window.GridWildPMTilesHeat.recordRender?.({
      status: "pending",
      reason: "fine z19 mid-band loading",
      mode: sourceSet?.mode || null,
      sourceCount: sources.length,
      selectedShards: sourceSet?.selectedShards || 0,
      fineZ19MidBand,
      tileBudget,
      totalTileCount,
      tileHits,
      pendingTiles,
      deferredTiles,
      emptyTiles,
      requestedMissingTiles,
      startupGraceActive,
      startupFetchDeferred,
      itemCount: items.length,
      partialDrawHeld: true
    });
    return 0;
  }

  if (!items.length) {
    window.GridWildPMTilesHeat.recordRender?.({
      status: pendingTiles || deferredTiles ? "pending" : "empty",
      mode: sourceSet?.mode || null,
      sourceCount: sources.length,
      selectedShards: sourceSet?.selectedShards || 0,
      fineZ19MidBand,
      tileBudget,
      totalTileCount,
      tileHits,
      pendingTiles,
      deferredTiles,
      emptyTiles,
      requestedMissingTiles,
      startupGraceActive,
      startupFetchDeferred
    });
    return 0;
  }

  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(items.map((item) => item.heatValue))
    : null;
  const heatMorphologyMask = isHeatMorphologyEnabled()
    ? buildThresholdedHeatMorphologyMask(items, heatZStats)
    : null;
  const fogOn = window.__gwState?.showFog ?? false;
  let painted = 0;

  for (const item of items) {
    if (
      heatMorphologyMask
        ? !heatMorphologyMask.has(item.key)
        : !passesHeatZThreshold(item.heatValue, heatZStats)
    ) {
      continue;
    }

    if (drawPMTilesHeatItem(item, fogOn)) painted++;
  }

  gridHeatCtx.globalAlpha = 1;
  window.GridWildPMTilesHeat.recordRender?.({
    status: "painted",
    mode: sourceSet?.mode || null,
    sourceCount: sources.length,
    selectedShards: sourceSet?.selectedShards || 0,
    fineZ19MidBand,
    tileBudget,
    totalTileCount,
    tileHits,
    pendingTiles,
    deferredTiles,
    emptyTiles,
    requestedMissingTiles,
    startupGraceActive,
    startupFetchDeferred,
    itemCount: items.length,
    painted
  });
  return painted;
}

function getLastCoarseHeatRenderOutcome() {
  const coarsePMTiles = window.GridWildCoarsePMTiles?.stats?.()?.lastRender || null;
  const coarseJson = window.GridWildCoarsePyramid?.stats?.()?.lastRender || null;
  const coarsePMTilesAt = Number(coarsePMTiles?.at) || 0;
  const coarseJsonAt = Number(coarseJson?.at) || 0;

  if (coarsePMTilesAt >= coarseJsonAt && coarsePMTiles) {
    return { source: "coarse-pmtiles", ...coarsePMTiles };
  }
  if (coarseJson) return { source: "coarse-json", ...coarseJson };
  return null;
}

function shouldPreferCoarsePyramidHeat() {
  const coarseState = getCoarseHeatState();
  const zoomMultiplier = getHeatMapZoomMultiplier();
  return (
    coarseState.autoEnabled === true &&
    (coarseState.effectiveBinSize >= 4 ||
      (Number.isFinite(zoomMultiplier) && zoomMultiplier <= 0.5))
  );
}

function shouldHoldFineHeatForCoarsePyramid(coarsePainted) {
  if (!shouldPreferCoarsePyramidHeat()) return false;
  if ((Number(coarsePainted) || 0) > 0) return false;

  const outcome = getLastCoarseHeatRenderOutcome();
  if (!outcome) return true;

  return ["pending", "empty", "overBudget", "missing", "unavailable"].includes(outcome.status);
}

function renderGridHeatCanvas() {
  const renderOptions = gridHeatPendingRenderOptions || {};
  gridHeatPendingRenderOptions = null;
  gridHeatRaf = null;
  gridHeatLastRenderAt = performance.now();
  gridHeatRenderAttempt += 1;

  ensureGridHeatCanvas();
  const staleFrame = captureGridHeatStaleFrame();
  resizeGridHeatCanvas();
  syncCoarseHeatControls();

  const heatOn = window.__gwFilters?.showHeat ?? true;
  const counts = window.__staticGridCounts;
  const pyriteEnabled = window.GridWildPyriteLake?.isEnabled?.() === true;
  const coarseHeatEnabled = isCoarseHeatEnabled();
  const pmtilesGate = getPMTilesHeatGateState();
  const pmtilesHeatEnabled = pmtilesGate.allowed;
  const staticCountsReady = counts instanceof Map;
  const hasStaticCounts = staticCountsReady && counts.size > 0;

  gridHeatLastRenderState = {
    status: "entered",
    attempt: gridHeatRenderAttempt,
    at: Date.now(),
    reason: renderOptions.reason || null,
    heatOn,
    canvasDisplay: gridHeatCanvas?.style?.display || "",
    mapZoom: Number(map.getZoom?.()) || null,
    coarseHeatEnabled,
    pmtilesHeatEnabled,
    pmtilesGate,
    pyriteEnabled,
    staticCountsReady,
    staticCountSize: hasStaticCounts ? counts.size : 0,
    staticHeatDeferredForPMTiles: window.__gwStaticHeatDeferredForPMTiles === true
  };

  if (!heatOn) {
    gridHeatCtx.clearRect(0, 0, gridHeatCanvasLayout.width, gridHeatCanvasLayout.height);
    gridHeatLastRenderState.status = "heat-off";
    return;
  }

  gridHeatCtx.clearRect(0, 0, gridHeatCanvasLayout.width, gridHeatCanvasLayout.height);

  const fogOn = window.__gwState?.showFog ?? false;
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const metadataFilterOutcome = renderMetadataFilteredHeatCanvas(startX, endX, startY, endY, fogOn);
  if (metadataFilterOutcome) {
    gridHeatLastRenderState.status = `metadata-filter-${metadataFilterOutcome.status}`;
    gridHeatLastRenderState.painted = metadataFilterOutcome.painted;
    gridHeatLastRenderState.metadataFilterOutcome = metadataFilterOutcome;
    if (!metadataFilterOutcome.painted && metadataFilterOutcome.pendingShards) {
      restoreGridHeatStaleFrame(staleFrame, gridHeatLastRenderState.status);
    }
    return;
  }

  if (!hasStaticCounts && !pyriteEnabled && !coarseHeatEnabled && !pmtilesHeatEnabled) {
    ensureStaticHeatmapCsvLoaded("heat fallback").catch((err) =>
      console.warn("GridWild static heat fallback unavailable.", err)
    );
    gridHeatLastRenderState.status = "no-render-source";
    restoreGridHeatStaleFrame(staleFrame, "no-render-source");
    return;
  }

  let coarsePainted = null;
  if (coarseHeatEnabled) {
    coarsePainted = renderCoarseMedianHeatCanvas(renderOptions);
    const coarseOutcome = getLastCoarseHeatRenderOutcome();
    gridHeatLastRenderState.status = "coarse";
    gridHeatLastRenderState.painted = coarsePainted;
    gridHeatLastRenderState.coarseOutcome = coarseOutcome;
    if (coarsePainted !== 0 || !pmtilesHeatEnabled) {
      if (
        (coarsePainted === 0 || coarsePainted === null) &&
        isGridHeatPendingOutcome(coarseOutcome)
      ) {
        gridHeatLastRenderState.status = `coarse-${coarseOutcome?.status || "pending"}`;
        restoreGridHeatStaleFrame(staleFrame, gridHeatLastRenderState.status);
      }
      return;
    }
    if (shouldHoldFineHeatForCoarsePyramid(coarsePainted)) {
      gridHeatLastRenderState.status = `coarse-${coarseOutcome?.status || "pending"}`;
      gridHeatLastRenderState.finePMTilesSkippedForCoarse = true;
      if (isGridHeatPendingOutcome(coarseOutcome)) {
        restoreGridHeatStaleFrame(staleFrame, gridHeatLastRenderState.status);
      }
      return;
    }
  }

  if (pmtilesHeatEnabled) {
    const pmtilesPainted = renderPMTilesHeatCanvas(renderOptions);
    const pmtilesOutcome = window.GridWildPMTilesHeat?.stats?.()?.lastRender || null;
    if (pmtilesPainted !== null) {
      gridHeatLastRenderState.status = coarsePainted === 0 ? "coarse-pmtiles-fallback" : "pmtiles";
      gridHeatLastRenderState.painted = pmtilesPainted;
      gridHeatLastRenderState.pmtilesOutcome = pmtilesOutcome;
      if (coarsePainted === 0) gridHeatLastRenderState.coarsePainted = coarsePainted;
      if (pmtilesPainted === 0 && isGridHeatPendingOutcome(pmtilesOutcome)) {
        gridHeatLastRenderState.status = `${gridHeatLastRenderState.status}-${pmtilesOutcome?.status || "pending"}`;
        restoreGridHeatStaleFrame(staleFrame, gridHeatLastRenderState.status);
      }
      return;
    }
    if (!hasStaticCounts && !pyriteEnabled) {
      gridHeatLastRenderState.status = "pmtiles-no-fallback";
      gridHeatLastRenderState.painted = pmtilesPainted;
      gridHeatLastRenderState.pmtilesOutcome = pmtilesOutcome;
      restoreGridHeatStaleFrame(staleFrame, "pmtiles-no-fallback");
      return;
    }
  }

  const meHeatActive = window.GridWildMeOverlayFilter?.isActive?.();
  const heatMorphologyActive = isHeatMorphologyEnabled();
  const meHeatEntries = meHeatActive
    ? window.GridWildMeOverlayFilter.entriesInMeterBounds(startX, endX, startY, endY)
    : null;
  const meHeatItems =
    meHeatActive && heatMorphologyActive ? collectMeHeatItems(meHeatEntries) : null;
  const regularHeatItems =
    !meHeatActive && heatMorphologyActive
      ? collectRegularHeatItems(counts, startX, endX, startY, endY)
      : null;
  const heatZStats = isHeatZThresholdEnabled()
    ? meHeatActive
      ? buildZStats(
          (meHeatItems || meHeatEntries)
            .map((entry) => getHeatValueForCell(entry.metrics))
            .filter((value) => value > 0)
        )
      : regularHeatItems
        ? buildZStats(regularHeatItems.map((item) => item.heatValue))
        : collectRegularHeatZStats(counts, startX, endX, startY, endY)
    : null;
  const heatMorphologyMask = heatMorphologyActive
    ? buildThresholdedHeatMorphologyMask(meHeatItems || regularHeatItems || [], heatZStats)
    : null;
  let staticPainted = 0;

  if (meHeatActive) {
    for (const item of meHeatItems || meHeatEntries) {
      const { key, metrics: displayMetrics } = item;
      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;
      if (
        heatMorphologyMask
          ? !heatMorphologyMask.has(key)
          : !passesHeatZThreshold(heatValue, heatZStats)
      )
        continue;

      if (drawFineHeatItem(item, fogOn)) staticPainted++;
    }

    gridHeatCtx.globalAlpha = 1;
    gridHeatLastRenderState.status = "static-me-overlay";
    gridHeatLastRenderState.painted = staticPainted;
    return;
  }

  if (regularHeatItems) {
    for (const item of regularHeatItems) {
      if (heatMorphologyMask && !heatMorphologyMask.has(item.key)) continue;
      if (drawFineHeatItem(item, fogOn)) staticPainted++;
    }

    gridHeatCtx.globalAlpha = 1;
    gridHeatLastRenderState.status = "static-morphology";
    gridHeatLastRenderState.painted = staticPainted;
    return;
  }

  for (let x = startX; x < endX; x += GRID_SIZE_M) {
    for (let y = startY; y < endY; y += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const iy = Math.floor(y / GRID_SIZE_M);
      const key = `${ix},${iy}`;

      const metrics = window.__richGridMetrics?.get(key) || counts.get(key) || null;

      const displayMetrics = getDisplayMetricsForCell(ix, iy, metrics);

      if (!displayMetrics) continue;

      const heatValue = getHeatValueForCell(displayMetrics);
      if (heatValue <= 0) continue;
      if (!passesHeatZThreshold(heatValue, heatZStats)) continue;

      const baseStyle = metricsToFill(displayMetrics);
      if (!baseStyle) continue;

      let fogState = null;

      const transientRevealStrength =
        typeof window.getGridWildTransientRevealStrength === "function"
          ? window.getGridWildTransientRevealStrength(key)
          : window.isGridWildTransientVisibleCell?.(key)
            ? 1
            : 0;
      const godsEyeTransientVisible = transientRevealStrength > 0;

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
        fillOpacity = Math.max(fillOpacity, 0.18 + transientRevealStrength * 0.24);
      }

      if (fogOn && fogState?.state === "surveyed") {
        fillOpacity = Math.max(0.08, fillOpacity * fogState.reveal);
      }

      if (fogOn && fogState?.state === "documented") {
        fillOpacity = Math.min(0.92, fillOpacity + 0.12);
      }

      paintFineHeatMeterRect(
        x,
        y,
        x + GRID_SIZE_M,
        y + GRID_SIZE_M,
        fillOpacity,
        baseStyle.fillColor,
        fogOn && fogState?.state === "documented"
      );
      staticPainted++;
    }
  }

  gridHeatCtx.globalAlpha = 1;
  gridHeatLastRenderState.status = "static";
  gridHeatLastRenderState.painted = staticPainted;
}

function renderCoarseMedianHeatCanvasDirect() {
  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const binSize = getEffectiveCoarseHeatBinSize();
  const binSizeM = binSize * GRID_SIZE_M;
  const startAnchorX = Math.floor(startX / binSizeM) * binSize;
  const endAnchorX = Math.floor((endX - GRID_SIZE_M) / binSizeM) * binSize;
  const startAnchorY = Math.floor(startY / binSizeM) * binSize;
  const endAnchorY = Math.floor((endY - GRID_SIZE_M) / binSizeM) * binSize;
  const span = getCoarseHeatBinSpan(startAnchorX, endAnchorX, startAnchorY, endAnchorY, binSize);
  if (!span.safe) {
    warnCoarseHeatBudgetExceeded("direct bin budget", { ...span, binSize });
    return 0;
  }
  if (
    window.GridWildCoarseHeatCoverageIndex?.hasCoverage?.(
      binSize,
      startAnchorX,
      endAnchorX,
      startAnchorY,
      endAnchorY
    ) === false
  ) {
    return 0;
  }
  let painted = 0;
  const items = [];
  const hydrationScope = makeCoarseRichHydrationScope(
    binSize,
    startAnchorX,
    endAnchorX,
    startAnchorY,
    endAnchorY
  );
  const sourceLookup = makeCoarseHeatSourceLookup({
    warmMissingRich: coarseHeatLensNeedsRichMetrics(),
    warmBounds: hydrationScope.bounds,
    hydrationViewKey: hydrationScope.viewKey
  });
  const cacheSignature = getCoarseHeatCacheSignature();

  for (let ix = startAnchorX; ix <= endAnchorX; ix += binSize) {
    for (let iy = startAnchorY; iy <= endAnchorY; iy += binSize) {
      const metrics = getCachedCoarseMedianMetrics(ix, iy, binSize, sourceLookup, cacheSignature);
      if (!metrics) continue;

      const heatValue = getHeatValueForCell(metrics);
      if (heatValue <= 0) continue;

      items.push({ ix, iy, key: `${ix},${iy}`, metrics, heatValue });
    }
  }

  const heatZStats = isHeatZThresholdEnabled()
    ? buildZStats(items.map((item) => item.heatValue))
    : null;
  const heatMorphologyMask = isHeatMorphologyEnabled()
    ? buildThresholdedHeatMorphologyMask(items, heatZStats, { step: binSize })
    : null;

  for (const item of items) {
    const { ix, iy, metrics, heatValue, key } = item;
    if (
      heatMorphologyMask
        ? !heatMorphologyMask.has(key)
        : !passesHeatZThreshold(heatValue, heatZStats)
    )
      continue;

    const baseStyle = metricsToFill(metrics);
    if (!baseStyle) continue;

    painted += paintCoarseHeatBin(gridHeatCtx, ix, iy, binSize, baseStyle);
  }

  gridHeatCtx.globalAlpha = 1;
  return painted;
}

function renderCoarseMedianHeatCanvas(options = {}) {
  const coarsePMTilesPainted = renderCoarsePMTilesHeatCanvas(options);
  if (coarsePMTilesPainted !== null) return coarsePMTilesPainted;

  const precomputedPainted = renderPrecomputedCoarseHeatCanvas(options);
  if (precomputedPainted !== null) return precomputedPainted;

  if (!hasStaticHeatmapCounts() && window.__gwStaticHeatDeferredForPMTiles === true) {
    return 0;
  }

  if (options.allowCoarseTileMisses === false) {
    if (isHeatZThresholdEnabled() || isHeatMorphologyEnabled()) return 0;
    return renderCoarseTiledHeatCanvas(options);
  }

  if (isHeatZThresholdEnabled() || isHeatMorphologyEnabled()) {
    return renderCoarseMedianHeatCanvasDirect();
  }

  return renderCoarseTiledHeatCanvas(options);
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

function vibrateGridWild(pattern) {
  if (window.__gwState?.hapticsEnabled === false) return false;
  if (!("vibrate" in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

function buzzOnNewSquare() {
  // Short, subtle tick for ordinary grid-cell movement.
  vibrateGridWild(18);
}

function buzzOnQuestTargetEntry() {
  // Stronger arrival pattern for crossing into an active quest target area.
  vibrateGridWild([70, 35, 95]);
}

window.handleUserPositionUpdate = async function (lat, lng, force = false) {
  const cellKey = latLngToDisplayCellKey(lat, lng);

  window.__gwState = window.__gwState || {};
  const state = window.__gwState;
  const now = Date.now();
  const previousCellKey = state.lastUserCellKey || null;
  const movedToNewCell = Boolean(previousCellKey && cellKey !== previousCellKey);

  const suspendUntil = state.suspendAutoCenterUntil ?? 0;

  const autoCenterAllowed =
    state.lockToLocation === true &&
    suspendUntil !== Number.POSITIVE_INFINITY &&
    now >= suspendUntil;

  const enteredNewCell = force || cellKey !== state.lastUserCellKey;
  state.lastUserCellKey = cellKey;

  if (movedToNewCell) {
    const questStatus = window.GridWildQuestLayer?.activeTargetStatus?.(lat, lng) || null;
    const questAreaKey =
      questStatus?.questId && questStatus?.targetKey
        ? `${questStatus.questId}:${questStatus.targetKey}`
        : "";
    const previousQuestAreaKey = state.lastHapticQuestTargetAreaKey || "";
    const enteredQuestTarget =
      questStatus?.inside === true && questAreaKey && questAreaKey !== previousQuestAreaKey;

    if (enteredQuestTarget) {
      buzzOnQuestTargetEntry();
    } else {
      buzzOnNewSquare();
    }

    state.lastHapticQuestTargetAreaKey = questStatus?.inside === true ? questAreaKey : "";
  }

  if (enteredNewCell && window.GridWildFog) {
    window.GridWildFog.markVisited(cellKey);
  }

  if (enteredNewCell && window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }

  if (autoCenterAllowed && now >= (state.lockViewAnimationUntil || 0)) {
    const targetZoom = state.lockZoom ?? 19;
    const currentZoom = map.getZoom();
    const userLatLng = [lat, lng];

    const center = map.getCenter();
    const centerDistM = center.distanceTo(userLatLng);

    // When lock is enabled, always follow.
    // If zoom has drifted, restore the lock zoom.
    if (Math.abs(currentZoom - targetZoom) > 0.05) {
      if (typeof window.animateLockedUserView === "function") {
        window.animateLockedUserView(userLatLng, targetZoom, { forceFly: true });
      } else {
        state.programmaticAutoCenterUntil = Date.now() + 900;
        map.setView(userLatLng, targetZoom, { animate: true });
      }
    } else if (force || centerDistM > 2) {
      if (typeof window.animateLockedUserView === "function") {
        window.animateLockedUserView(userLatLng, targetZoom, {
          animate: true,
          duration: 0.45
        });
      } else {
        state.programmaticAutoCenterUntil = Date.now() + 900;
        map.panTo(userLatLng, { animate: true });
      }
    }
  }

  // Update grid and related UI if we entered a new cell

  if (enteredNewCell) {
    updateStaticGridHeat();
    updateGridLines();
    refreshGridWildHudPanels();

    if (typeof window.maybeRefreshDynamicINat === "function") {
      window.maybeRefreshDynamicINat(false, cellKey);
    }
  } else if (state.lockToLocation === true) {
    updateGridLines();
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

let lastStickyZoomLevel = Number.isFinite(map.getZoom()) ? map.getZoom() : null;

function applyStickyZoom(options = {}) {
  return timeGridWildVerbose("applyStickyZoom", () => {
    const state = window.__gwState || {};
    if (!state.stickyZoomEnabled) return;

    const force = options === true || options?.force === true;
    const zoomedOut = options?.zoomedOut === true;
    const targetZoom = getStickyZoomTarget();
    const currentZoom = map.getZoom();
    const tol = state.stickyZoomTolerance ?? 0.35;

    if (!force && zoomedOut) return;
    if (!force && Math.abs(currentZoom - targetZoom) > tol) return;
    if (Math.abs(currentZoom - targetZoom) < 0.001) return;

    state.stickyZoomAnimating = true;
    map.setZoom(targetZoom, { animate: true });

    setTimeout(() => {
      state.stickyZoomAnimating = false;
    }, 250);
  });
}

function handleStickyZoomEnd(evt) {
  return timeGridWildVerbose("handleStickyZoomEnd", () => {
    const currentZoom = map.getZoom();
    const zoomedOut = Number.isFinite(lastStickyZoomLevel) && currentZoom < lastStickyZoomLevel;

    applyStickyZoom({ event: evt, zoomedOut });
    lastStickyZoomLevel = currentZoom;
  });
}

// add sticky zoom enable
map.on("zoomend", handleStickyZoomEnd);

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
  const padLeft = Math.max(18, baseW * 0.1);
  const padRight = Math.max(24, baseW * 0.16);
  const padTop = Math.max(18, baseH * 0.1);
  //const padBottom = Math.max(150, baseH * 0.88);   // <- bigger bottom allowance
  const padBottom = Math.max(10, baseH * 0.1); // <- bigger bottom allowance

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
