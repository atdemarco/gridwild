// Faster Canvas fog renderer synced to Leaflet container coordinates.
// Draws fog in the exact same EPSG:3857 grid as the heatmap rectangles.

(function () {
  let canvas = null;
  let ctx = null;
  let raf = null;

  const FOG_UNKNOWN_OPACITY = 0.34;
  const FOG_COLOR_RGB = "38,46,42";

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
    canvas.style.zIndex = "416";

    const mapEl = map.getContainer();
    mapEl.appendChild(canvas);

    ctx = canvas.getContext("2d", { alpha: true });

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
    const fillUnknown = `rgba(${FOG_COLOR_RGB},${FOG_UNKNOWN_OPACITY})`;

    for (let x = startX; x < endX; x += GRID_SIZE_M) {
      const ix = Math.floor(x / GRID_SIZE_M);

      for (let y = startY; y < endY; y += GRID_SIZE_M) {
        const iy = Math.floor(y / GRID_SIZE_M);
        const key = `${ix},${iy}`;

        if (window.isGodsEyeTransientVisibleCell?.(key)) continue;

        const fogState = window.GridWildFog.getCellFogState(key, now);
        if (fogState.state === "documented") continue;

        let opacity = FOG_UNKNOWN_OPACITY;

        if (fogState.state === "surveyed") {
          opacity = fogState.fogOpacity;
          if (opacity <= 0.02) continue;
        }

        const llA = map.options.crs.unproject(L.point(x, y));
        const llB = map.options.crs.unproject(L.point(x + GRID_SIZE_M, y + GRID_SIZE_M));

        const pA = map.latLngToContainerPoint(llA);
        const pB = map.latLngToContainerPoint(llB);

        // Use floating-point container coords and deliberately overdraw each cell.
        // This prevents 1px raster seams between fog rows during pan/redraw.
        const left = Math.min(pA.x, pB.x);
        const top = Math.min(pA.y, pB.y);
        const right = Math.max(pA.x, pB.x);
        const bottom = Math.max(pA.y, pB.y);

        const bleed = 0.0; // 1.0 fixes gaps (?)

        const drawX = left - bleed;
        const drawY = top - bleed;
        const w = Math.max(1, right - left + bleed * 2);
        const h = Math.max(1, bottom - top + bleed * 2);

        ctx.fillStyle =
          opacity === FOG_UNKNOWN_OPACITY
            ? fillUnknown
            : `rgba(${FOG_COLOR_RGB},${opacity})`;

        ctx.fillRect(drawX, drawY, w, h);
      }
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