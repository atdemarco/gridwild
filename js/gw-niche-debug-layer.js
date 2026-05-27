// js/gw-niche-debug-layer.js
// Canvas HUD/audit renderer for niche graph passes.

(function () {
  let canvas = null;
  let ctx = null;
  let topLeft = L.point(0, 0);
  let raf = null;
  let visible = false;
  let mode = "regions-pass1";
  let pass = 1;
  let lastResult = null;
  let lastInspection = null;
  let listenersBound = false;

  const REGION_MODES = new Set(["regions-pass1", "regions-pass2", "regions-pass3", "region-boundaries", "region-evidence"]);
  const EDGE_INSPECT_MODES = new Set(["graph-strong-links", "graph-cut-links"]);

  function ensurePane() {
    if (!map.getPane("gwNicheDebugPane")) {
      map.createPane("gwNicheDebugPane");
      map.getPane("gwNicheDebugPane").style.zIndex = "455";
      map.getPane("gwNicheDebugPane").style.pointerEvents = "none";
    }
    return map.getPane("gwNicheDebugPane");
  }

  function ensureCanvas() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "gwNicheDebugCanvas";
      Object.assign(canvas.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: ""
      });
      ensurePane().appendChild(canvas);
      ctx = canvas.getContext("2d", { alpha: true });
      canvas.addEventListener("click", handleCanvasClick);
    }

    if (!listenersBound) {
      listenersBound = true;
      map.on("moveend zoomend resize viewreset", () => {
        if (!visible) return;
        if (window.GridWildNicheDebug?.rerunOnMove) {
          runCurrentView({ ...(lastResult?.options || {}), mode, pass });
        } else {
          scheduleRender();
        }
      });
    }
  }

  function resizeCanvas() {
    ensureCanvas();
    topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const wantW = Math.round(size.x * dpr);
    const wantH = Math.round(size.y * dpr);

    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layerPoint(latlng) {
    return map.latLngToLayerPoint(latlng).subtract(topLeft);
  }

  function clear() {
    if (!ctx) return;
    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
  }

  function cellRect(cell) {
    const [[south, west], [north, east]] = cell.bounds;
    const nw = layerPoint(L.latLng(north, west));
    const se = layerPoint(L.latLng(south, east));
    return {
      x: Math.floor(nw.x),
      y: Math.floor(nw.y),
      w: Math.max(1, Math.ceil(se.x - nw.x)),
      h: Math.max(1, Math.ceil(se.y - nw.y))
    };
  }

  function colorHash(text) {
    let hash = 2166136261;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  function regionColor(id, alpha = 0.38) {
    const hue = colorHash(id) % 360;
    return `hsla(${hue}, 68%, 52%, ${alpha})`;
  }

  function landuseColor(cell) {
    const cls = cell.osm?.landuseClass || "unclassified";
    const colors = {
      park: "rgba(74, 150, 83, 0.38)",
      wood: "rgba(32, 112, 76, 0.46)",
      grass: "rgba(155, 176, 74, 0.36)",
      water: "rgba(54, 135, 188, 0.44)",
      building: "rgba(106, 80, 62, 0.52)",
      unclassified: "rgba(210, 196, 145, 0.12)"
    };
    return colors[cls] || colors.unclassified;
  }

  function fillCell(cell, fill, stroke = null) {
    const rect = cellRect(cell);
    ctx.fillStyle = fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(1, rect.w - 1), Math.max(1, rect.h - 1));
    }
  }

  function drawCellsByMode(result) {
    for (const cell of result.cells) {
      if (mode === "osm-context") {
        fillCell(cell, landuseColor(cell));
      } else if (mode === "path-adjacent") {
        if (cell.osm?.isPathAdjacent) fillCell(cell, "rgba(236, 170, 66, 0.52)", "rgba(255,240,180,0.65)");
      } else if (mode === "path-side") {
        if (!cell.osm?.isPathAdjacent) continue;
        const fill = cell.osm.nearestPathSide === "left"
          ? "rgba(68, 151, 224, 0.48)"
          : cell.osm.nearestPathSide === "right"
            ? "rgba(232, 112, 72, 0.48)"
            : "rgba(226, 204, 92, 0.34)";
        fillCell(cell, fill);
      }
    }
  }

  function edgeCenter(edge, result) {
    const byId = edgeCenter._byId || (edgeCenter._byId = new Map());
    if (byId._result !== result) {
      byId.clear();
      byId._result = result;
      for (const cell of result.cells) byId.set(cell.id, cell);
    }
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b) return null;
    return {
      a: layerPoint(L.latLng(a.center.lat, a.center.lng)),
      b: layerPoint(L.latLng(b.center.lat, b.center.lng))
    };
  }

  function drawGraphEdges(result, cutOnly) {
    const passKey = window.GridWildNichePartition?.passWeightKey?.(pass) || "pass1Context";
    const threshold = window.GridWildNichePartition?.thresholdForPass?.(pass, result.options || {}) || 0.5;

    ctx.lineCap = "round";
    for (const edge of result.graph.edges) {
      const weight = Number(edge.passWeights?.[passKey] ?? edge.weight ?? 0);
      const isCut = weight < threshold;
      if (cutOnly !== isCut) continue;

      const points = edgeCenter(edge, result);
      if (!points) continue;

      ctx.globalAlpha = cutOnly ? 0.78 : 0.34 + Math.max(0, weight - threshold) * 0.8;
      ctx.strokeStyle = cutOnly ? "rgba(236, 68, 58, 0.86)" : "rgba(74, 220, 150, 0.62)";
      ctx.lineWidth = cutOnly ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(points.a.x, points.a.y);
      ctx.lineTo(points.b.x, points.b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function activeEdgeInfo(edge, result) {
    const passKey = window.GridWildNichePartition?.passWeightKey?.(pass) || "pass1Context";
    const threshold = window.GridWildNichePartition?.thresholdForPass?.(pass, result.options || {}) || 0.5;
    const weight = Number(edge.passWeights?.[passKey] ?? edge.weight ?? 0);
    return {
      passKey,
      threshold,
      weight,
      cut: weight < threshold
    };
  }

  function pointToSegmentDistance(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0) return Math.hypot(px - a.x, py - a.y);

    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    return Math.hypot(px - x, py - y);
  }

  function evidenceForEdge(edge, info) {
    const r = edge.reasons || {};
    const lines = [
      `Pass ${pass}: ${info.weight.toFixed(2)} vs cut ${info.threshold.toFixed(2)} (${info.cut ? "cut" : "strong"})`,
      `P1 ${Number(edge.passWeights?.pass1Context ?? 0).toFixed(2)} | P2 ${Number(edge.passWeights?.pass2Signal ?? 0).toFixed(2)} | P3 ${Number(edge.passWeights?.pass3BarrierGradient ?? 0).toFixed(2)}`
    ];

    if (r.sameLanduse != null) lines.push(`same land-use: ${r.sameLanduse ? "yes" : "no"}`);
    if (r.sameTrailSide) lines.push("same trail side");
    if (r.bothPathAdjacent) lines.push("both path-adjacent");
    if (r.bothWetEdge) lines.push("both wet-edge");
    if (Number.isFinite(r.signalSimilarity)) lines.push(`signal similarity: ${Number(r.signalSimilarity).toFixed(2)}`);
    if (Number(r.signalNeighborhoodSize) > 1) {
      lines.push(`signal pool: ${Number(r.signalNeighborhoodSize)}x${Number(r.signalNeighborhoodSize)}`);
    }
    if (Number.isFinite(r.signalSupport)) lines.push(`signal support: ${Number(r.signalSupport).toFixed(2)}`);
    if (Number(r.signalActiveCellsA) || Number(r.signalActiveCellsB)) {
      lines.push(`active cells: ${Number(r.signalActiveCellsA) || 0} / ${Number(r.signalActiveCellsB) || 0}`);
    }
    if ((r.roadBarrierPenalty || 0) > 0) lines.push(`road penalty: ${Number(r.roadBarrierPenalty).toFixed(2)}`);
    if ((r.waterBarrierPenalty || 0) > 0) lines.push(`water penalty: ${Number(r.waterBarrierPenalty).toFixed(2)}`);
    if ((r.insideBuildingPenalty || 0) > 0) lines.push(`building penalty: ${Number(r.insideBuildingPenalty).toFixed(2)}`);
    if ((r.gradientPenalty || 0) > 0) lines.push(`gradient penalty: ${Number(r.gradientPenalty).toFixed(2)}`);
    if ((r.abruptLandusePenalty || 0) > 0) lines.push(`land-use transition penalty: ${Number(r.abruptLandusePenalty).toFixed(2)}`);

    return lines;
  }

  function regionsForMode(result) {
    if (mode === "regions-pass1") return result.regionsPass1 || [];
    if (mode === "regions-pass2") return result.regionsPass2 || [];
    if (mode === "regions-pass3") return result.regionsPass3 || [];
    if (Number(pass) === 1) return result.regionsPass1 || [];
    if (Number(pass) === 2) return result.regionsPass2 || [];
    return result.regionsPass3 || [];
  }

  function drawRegions(result) {
    const regions = regionsForMode(result);
    for (const region of regions) {
      const fill = regionColor(region.id, mode === "region-boundaries" ? 0.10 : 0.36);
      for (const cell of region.cells) {
        fillCell(cell, fill);
      }
    }
  }

  function drawRegionBoundaries(result) {
    const regions = regionsForMode(result);
    for (const region of regions) {
      ctx.strokeStyle = regionColor(region.id, 0.92);
      ctx.lineWidth = 1.4;
      for (const cell of region.cells) {
        const rect = cellRect(cell);
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(1, rect.w - 1), Math.max(1, rect.h - 1));
      }
    }
  }

  function render() {
    raf = null;
    ensureCanvas();
    resizeCanvas();
    clear();

    if (!visible || !lastResult) {
      if (canvas) canvas.style.display = "none";
      return;
    }

    canvas.style.display = "block";
    canvas.style.pointerEvents = (mode === "region-evidence" || EDGE_INSPECT_MODES.has(mode)) ? "auto" : "none";

    if (mode === "osm-context" || mode === "path-adjacent" || mode === "path-side") {
      drawCellsByMode(lastResult);
    } else if (mode === "graph-strong-links") {
      drawGraphEdges(lastResult, false);
    } else if (mode === "graph-cut-links") {
      drawGraphEdges(lastResult, true);
    } else if (REGION_MODES.has(mode)) {
      drawRegions(lastResult);
      if (mode === "region-boundaries" || mode === "region-evidence") {
        drawRegionBoundaries(lastResult);
      }
    }

    ctx.globalAlpha = 1;
  }

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(render);
  }

  function setMode(nextMode) {
    mode = nextMode || mode;
    if (mode === "regions-pass1") pass = 1;
    if (mode === "regions-pass2") pass = 2;
    if (mode === "regions-pass3") pass = 3;
    scheduleRender();
    notify();
  }

  function setPass(nextPass) {
    pass = Math.max(1, Math.min(3, Math.round(Number(nextPass) || 1)));
    if (mode.startsWith("regions-pass")) mode = `regions-pass${pass}`;
    scheduleRender();
    notify();
  }

  function toggle(show) {
    visible = show == null ? !visible : show === true;
    ensureCanvas();
    scheduleRender();
    notify();
    return visible;
  }

  function runCurrentView(options = {}) {
    const opts = {
      ...(window.GridWildNicheEngine?.defaults || {}),
      ...(lastResult?.options || {}),
      ...options
    };
    if (options.mode) mode = options.mode;
    if (options.pass) pass = Number(options.pass) || pass;

    lastResult = window.GridWildNicheEngine.runNicheGraphPassesForCurrentView(opts);
    visible = true;
    scheduleRender();
    notify();
    return lastResult;
  }

  function nearestRegion(latlng) {
    if (!lastResult) return null;
    const regions = regionsForMode(lastResult);
    let best = null;
    let bestDist = Infinity;

    for (const region of regions) {
      const c = region.centroid;
      if (!c) continue;
      const d = Math.hypot(c.lat - latlng.lat, c.lng - latlng.lng);
      if (d < bestDist) {
        best = region;
        bestDist = d;
      }
    }
    return best;
  }

  function nearestDisplayedEdge(containerPoint) {
    if (!lastResult || !EDGE_INSPECT_MODES.has(mode)) return null;
    const wantsCut = mode === "graph-cut-links";
    let best = null;
    let bestDist = Infinity;

    for (const edge of lastResult.graph.edges) {
      const info = activeEdgeInfo(edge, lastResult);
      if (info.cut !== wantsCut) continue;

      const points = edgeCenter(edge, lastResult);
      if (!points) continue;

      const d = pointToSegmentDistance(containerPoint.x, containerPoint.y, points.a, points.b);
      if (d < bestDist) {
        bestDist = d;
        best = { edge, info, distancePx: d };
      }
    }

    return best && bestDist <= 18 ? best : null;
  }

  function handleCanvasClick(evt) {
    if (!visible || !lastResult || (mode !== "region-evidence" && !EDGE_INSPECT_MODES.has(mode))) return;
    const rect = canvas.getBoundingClientRect();
    const containerPoint = L.point(evt.clientX - rect.left, evt.clientY - rect.top);

    if (EDGE_INSPECT_MODES.has(mode)) {
      const hit = nearestDisplayedEdge(containerPoint);
      lastInspection = hit
        ? {
          type: "edge",
          id: hit.edge.id,
          a: hit.edge.a,
          b: hit.edge.b,
          weight: hit.info.weight,
          threshold: hit.info.threshold,
          cut: hit.info.cut,
          passWeights: hit.edge.passWeights,
          reasons: hit.edge.reasons,
          evidence: evidenceForEdge(hit.edge, hit.info)
        }
        : {
          type: "edge",
          id: "No edge selected",
          evidence: ["Click closer to a visible graph link."]
        };
      console.info?.("GridWild niche edge evidence", lastInspection);
      notify();
      return;
    }

    const layerPoint = containerPoint.add(topLeft);
    const latlng = map.layerPointToLatLng(layerPoint);
    const region = nearestRegion(latlng);

    lastInspection = region
      ? {
        type: "region",
        id: region.id,
        evidence: region.evidence,
        stats: region.stats
      }
      : null;

    console.info?.("GridWild niche evidence", lastInspection);
    notify();
  }

  function notify() {
    window.dispatchEvent(new CustomEvent("gwNicheDebugUpdated", {
      detail: {
        visible,
        mode,
        pass,
        result: lastResult,
        inspection: lastInspection
      }
    }));
  }

  window.GridWildNicheDebug = {
    runCurrentView,
    setMode,
    toggle,
    setPass,
    getLastResult: () => lastResult,
    getLastInspection: () => lastInspection,
    scheduleRender,
    rerunOnMove: false
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    toggle(false);
  });
})();
