// Faster Canvas fog renderer synced to Leaflet container coordinates.
// Draws fog in the exact same EPSG:3857 grid as the heatmap rectangles.

(function () {
  let canvas = null;
  let ctx = null;
  let raf = null;

  //const FOG_UNKNOWN_OPACITY = 0.34;
  //  const FOG_COLOR_RGB = "38,46,42";

  //rgba(18, 24, 28, 0.62) - better fog color?
  const FOG_UNKNOWN_OPACITY = 0.62;
  const FOG_COLOR_RGB = "18,24,28";

  const FOG_ROW_COMBINE_CELLS_DEFAULT = 4; // try 1, 2, 3, 4

  // begin fog smoothing
  const FOG_EDGE_BLEND_RADIUS_CELLS = 2; 

  function cellKey(ix, iy) {
    return `${ix},${iy}`;
  }

  function isRevealedFogState(state) {
    return state === "documented" || state === "surveyed";
  }

  function getRevealStrengthForCell(ix, iy, now) {
    const key = cellKey(ix, iy);

    if (window.isGodsEyeTransientVisibleCell?.(key)) return 1;

    const s = window.GridWildFog?.getCellFogState?.(key, now);
    if (!s) return 0;

    if (s.state === "documented") return 1;
    if (s.state === "surveyed") return Math.max(0, Math.min(1, s.reveal ?? 0.65));

    return 0;
  }

  function getNearbyRevealStrength(ix, iy, now) {
    let best = 0;

    for (let dx = -FOG_EDGE_BLEND_RADIUS_CELLS; dx <= FOG_EDGE_BLEND_RADIUS_CELLS; dx++) {
      for (let dy = -FOG_EDGE_BLEND_RADIUS_CELLS; dy <= FOG_EDGE_BLEND_RADIUS_CELLS; dy++) {
        if (dx === 0 && dy === 0) continue;

        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist > FOG_EDGE_BLEND_RADIUS_CELLS) continue;

        const neighborReveal = getRevealStrengthForCell(ix + dx, iy + dy, now);
        if (neighborReveal <= 0) continue;

        // Adjacent cells get stronger thinning; 2 cells away get weaker thinning.
        const distanceWeight =
          dist === 1 ? 0.55 :
          dist === 2 ? 0.28 :
          0;

        best = Math.max(best, neighborReveal * distanceWeight);
      }
    }

    return best;
  }

  function applyFogEdgeSoftening(opacity, ix, iy, now) {
    const nearbyReveal = getNearbyRevealStrength(ix, iy, now);
    if (nearbyReveal <= 0) return opacity;

    // Reduce opacity near revealed territory, but do not make unknown fog fully clear.
    const minEdgeOpacity = 0.10;
    const softened = opacity * (1 - nearbyReveal);

    return Math.max(minEdgeOpacity, softened);
  }

// end fog smoothing 


  function ensureCanvas() {
    if (canvas) return canvas;

    canvas = document.createElement("canvas");
    canvas.id = "gwFogCanvas";

    canvas.style.position = "absolute";
    canvas.style.left = "0px";
    canvas.style.top = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "500";

    if (!map.getPane("gwFogPane")) {
      map.createPane("gwFogPane");
      map.getPane("gwFogPane").style.zIndex = 500;
      map.getPane("gwFogPane").style.pointerEvents = "none";
    }

    const mapEl = map.getContainer();
    mapEl.appendChild(canvas);

    ctx = canvas.getContext("2d", { alpha: true });

    // map.on("resize viewreset zoomend moveend", scheduleRender);
    map.on("move zoom resize viewreset zoomend moveend", scheduleRender);

    return canvas;
  }

  function resizeCanvas() {
    ensureCanvas();

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


function quantizeOpacity(opacity) {
  // 0.02 buckets: visually smooth, but allows merging.
  return Math.round(opacity / 0.02) * 0.02;
}

function opacityKey(opacity) {
   return Math.round(quantizeOpacity(opacity) * 1000);
}

function getCellFogOpacity(ix, iy, now, smoothingOn) {
  const key = `${ix},${iy}`;

  if (window.isGodsEyeTransientVisibleCell?.(key)) return null;

  const fogState = window.GridWildFog.getCellFogState(key, now);
  if (fogState.state === "documented") return null;

  let opacity = FOG_UNKNOWN_OPACITY;

  if (fogState.state === "surveyed") {
    opacity = fogState.fogOpacity;
    if (opacity <= 0.02) return null;
  }

  if (
    smoothingOn &&
    (fogState.state === "unknown" || fogState.state === "expired")
  ) {
    opacity = applyFogEdgeSoftening(opacity, ix, iy, now);
  }

  return quantizeOpacity(opacity);
}


function render() {
  raf = null;

  ensureCanvas();
  resizeCanvas();

  const size = map.getSize();
  ctx.clearRect(0, 0, size.x, size.y);

  const fogOn = window.__gwState?.showFog ?? true;

  if (
    !fogOn ||
    !window.GridWildFog ||
    typeof getPaddedBoundsMeters !== "function" ||
    typeof GRID_SIZE_M === "undefined"
  ) {
    return;
  }

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const now = Date.now();

  const smoothingOn =
    (window.__gwState?.fogSmoothingEnabled ?? true) &&
    !map._animatingZoom &&
    !map._panAnim?._inProgress;

  const rowCombineCells = Math.max(
    1,
    Math.floor(
      window.__gwState?.fogRowCombineCells ??
      FOG_ROW_COMBINE_CELLS_DEFAULT
    )
  );

  function drawFogRect(x0, y0, x1, y1, opacity) {
    const llA = map.options.crs.unproject(L.point(x0, y0));
    const llB = map.options.crs.unproject(L.point(x1, y1));

    const pA = map.latLngToContainerPoint(llA);
    const pB = map.latLngToContainerPoint(llB);

    const left = Math.min(pA.x, pB.x);
    const top = Math.min(pA.y, pB.y);
    const right = Math.max(pA.x, pB.x);
    const bottom = Math.max(pA.y, pB.y);

    const bleedX = 0.03;//25;
    const bleedY = 0.03;//25;

    ctx.fillStyle = `rgba(${FOG_COLOR_RGB},${opacity})`;
    ctx.fillRect(
      left - bleedX,
      top - bleedY,
      Math.max(1, right - left + bleedX * 2),
      Math.max(1, bottom - top + bleedY * 2)
    );
  }

  function flushRun(run) {
    if (!run) return;
    drawFogRect(run.x0, run.y0, run.x1, run.y1, run.opacity);
  }

  for (let yBlock = startY; yBlock < endY; yBlock += GRID_SIZE_M * rowCombineCells) {
    const yBlockEnd = Math.min(endY, yBlock + GRID_SIZE_M * rowCombineCells);

    let run = null;

    for (let x = startX; x < endX; x += GRID_SIZE_M) {
      let blockKey = null;
      let blockOpacity = null;
      let wholeBlockFogged = true;

      for (let y = yBlock; y < yBlockEnd; y += GRID_SIZE_M) {
        const ix = Math.floor(x / GRID_SIZE_M);
        const iy = Math.floor(y / GRID_SIZE_M);

        const opacity = getCellFogOpacity(ix, iy, now, smoothingOn);
        const key = opacity === null ? null : opacityKey(opacity);

        if (key === null) {
          wholeBlockFogged = false;
          break;
        }

        if (blockKey === null) {
          blockKey = key;
          blockOpacity = opacity;
        } else if (blockKey !== key) {
          wholeBlockFogged = false;
          break;
        }
      }

      if (wholeBlockFogged && blockKey !== null) {
        if (run && run.key === blockKey && run.x1 === x) {
          run.x1 = x + GRID_SIZE_M;
        } else {
          flushRun(run);
          run = {
            key: blockKey,
            opacity: blockOpacity,
            x0: x,
            x1: x + GRID_SIZE_M,
            y0: yBlock,
            y1: yBlockEnd
          };
        }
      } else {
        flushRun(run);
        run = null;

        // Fallback: draw whatever individual cells in this column/block are fogged.
        for (let y = yBlock; y < yBlockEnd; y += GRID_SIZE_M) {
          const ix = Math.floor(x / GRID_SIZE_M);
          const iy = Math.floor(y / GRID_SIZE_M);

          const opacity = getCellFogOpacity(ix, iy, now, smoothingOn);
          if (opacity === null) continue;

          drawFogRect(
            x,
            y,
            x + GRID_SIZE_M,
            y + GRID_SIZE_M,
            opacity
          );
        }
      }
    }

    flushRun(run);
  }
}

function renderROW() {
  raf = null;

  ensureCanvas();
  resizeCanvas();

  const size = map.getSize();
  ctx.clearRect(0, 0, size.x, size.y);

  const fogOn = window.__gwState?.showFog ?? true;

  if (
    !fogOn ||
    !window.GridWildFog ||
    typeof getPaddedBoundsMeters !== "function" ||
    typeof GRID_SIZE_M === "undefined"
  ) {
    return;
  }

  const { startX, endX, startY, endY } = getPaddedBoundsMeters();
  const now = Date.now();

  const smoothingOn =
    (window.__gwState?.fogSmoothingEnabled ?? true) &&
    !map._animatingZoom &&
    !map._panAnim?._inProgress;

  for (let y = startY; y < endY; y += GRID_SIZE_M) {
    const iy = Math.floor(y / GRID_SIZE_M);

    let runStartX = null;
    let runEndX = null;
    let runOpacity = null;
    let runKey = null;

    function flushRun() {
      if (runStartX === null || runEndX === null || runOpacity === null) return;

      const llA = map.options.crs.unproject(L.point(runStartX, y));
      const llB = map.options.crs.unproject(L.point(runEndX, y + GRID_SIZE_M));

      const pA = map.latLngToContainerPoint(llA);
      const pB = map.latLngToContainerPoint(llB);

      const left = Math.min(pA.x, pB.x);
      const top = Math.min(pA.y, pB.y);
      const right = Math.max(pA.x, pB.x);
      const bottom = Math.max(pA.y, pB.y);

      const bleedX = 0.25;
      const bleedY = 0.02;

      ctx.fillStyle = `rgba(${FOG_COLOR_RGB},${runOpacity})`;
      ctx.fillRect(
        left - bleedX,
        top - bleedY,
        Math.max(1, right - left + bleedX * 2),
        Math.max(1, bottom - top + bleedY * 2)
      );
    }

    for (let x = startX; x < endX; x += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);
      const opacity = getCellFogOpacity(ix, iy, now, smoothingOn);
      const key = opacity === null ? null : opacityKey(opacity);

      if (key === null) {
        flushRun();
        runStartX = null;
        runEndX = null;
        runOpacity = null;
        runKey = null;
        continue;
      }

      if (runKey === key && runEndX === x) {
        runEndX = x + GRID_SIZE_M;
      } else {
        flushRun();
        runStartX = x;
        runEndX = x + GRID_SIZE_M;
        runOpacity = opacity;
        runKey = key;
      }
    }

    flushRun();
  }
}

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(render);
  }

  window.GridWildFogCanvas = {
    render,
    scheduleRender
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(scheduleRender, 100);
  });
})();