// js/gw-structures-layer.js
// OSM building-footprint “roof” layer: above heat, below fog.

(function () {
  let canvas = null;
  let ctx = null;
  let raf = null;
  let fetchTimer = null;
  let lastFetchKey = null;
  let buildings = [];

  const STRUCTURE_Z = 450;
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FETCH_DEBOUNCE_MS = 900;
  const MIN_ZOOM = 17;

  function ensureCanvas() {
    if (canvas) return canvas;

    canvas = document.createElement("canvas");
    canvas.id = "gwStructuresCanvas";
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: String(STRUCTURE_Z)
    });

    map.getContainer().appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: true });

    map.on("move zoom resize viewreset zoomend moveend", scheduleRender);
    map.on("moveend zoomend", scheduleFetch);

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

  function getBboxString() {
    const b = map.getBounds();
    const s = b.getSouth();
    const w = b.getWest();
    const n = b.getNorth();
    const e = b.getEast();
    return `${s},${w},${n},${e}`;
  }

  function getFetchKey() {
    const c = map.getCenter();
    const z = map.getZoom();

    // Coarse key prevents refetching on tiny pans.
    return [
      z,
      c.lat.toFixed(4),
      c.lng.toFixed(4)
    ].join("|");
  }


  function buildOverpassQuery() {
  const bbox = getBboxString();
  const showBuildings = window.__gwState?.showOsmBuildings ?? true;

  const buildingQuery = showBuildings ? `
        way["building"](${bbox});
        relation["building"](${bbox});
  ` : "";

  return `
    [out:json][timeout:25];
    (
      ${buildingQuery}

      way["highway"~"path|footway|cycleway|bridleway|track"](${bbox});

      way["leisure"~"park|garden|nature_reserve"](${bbox});
      relation["leisure"~"park|garden|nature_reserve"](${bbox});

      way["natural"="wood"](${bbox});
      relation["natural"="wood"](${bbox});

      way["landuse"~"forest|grass|meadow|recreation_ground"](${bbox});
      relation["landuse"~"forest|grass|meadow|recreation_ground"](${bbox});

      way["natural"="water"](${bbox});
      relation["natural"="water"](${bbox});

      way["waterway"="riverbank"](${bbox});
      relation["waterway"="riverbank"](${bbox});
    );
    out geom;
  `;
}


  function buildOverpassQueryORIG() {
    const bbox = getBboxString();

    // Ways and relations tagged building=* inside current bbox.
    // out geom returns node geometry directly. Overpass supports bbox queries
    // and out geom for map display/export workflows. 
    // See Overpass examples / QL docs. 
    return `
      [out:json][timeout:20];
      (
        way["building"](${bbox});
        relation["building"](${bbox});
      );
      out geom;
    `;
  }

  function parseBuildings(data) {
    const out = [];

    for (const el of data?.elements || []) {
      if (!Array.isArray(el.geometry) || el.geometry.length < 3) continue;

      const pts = el.geometry
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map(p => L.latLng(p.lat, p.lon));

      if (pts.length < 3) continue;

      out.push({
        id: `${el.type}/${el.id}`,
        tags: el.tags || {},
        points: pts
      });
    }

    return out;
  }

  async function fetchBuildings() {
    if ((window.__gwState?.showStructures ?? true) === false) return;
    if (map.getZoom() < MIN_ZOOM) {
      buildings = [];
      scheduleRender();
      return;
    }

    const fetchKey = getFetchKey();
    if (fetchKey === lastFetchKey) return;
    lastFetchKey = fetchKey;

    try {
      const resp = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({ data: buildOverpassQuery() })
      });

      if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

      const data = await resp.json();
      buildings = parseBuildings(data);

      scheduleRender();
    } catch (err) {
      console.warn("GridWild structure layer: OSM building fetch failed:", err);
    }
  }

  function scheduleFetch() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchBuildings, FETCH_DEBOUNCE_MS);
  }

  function drawBuilding(poly) {
    if (!Array.isArray(poly.points) || poly.points.length < 3) return;

    ctx.beginPath();

    poly.points.forEach((ll, i) => {
      const p = map.latLngToContainerPoint(ll);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });

    ctx.closePath();

    //ctx.fillStyle = "rgba(92, 82, 68, 0.58)";
  //  ctx.strokeStyle = "rgba(255, 235, 190, 0.72)";
//    ctx.lineWidth = 1.4;

    ctx.fillStyle = "rgba(170, 160, 145, 0.36)";
    ctx.strokeStyle = "rgba(255, 248, 220, 0.88)";
    
    // ctx.fillStyle = "rgba(210,205,195,0.18)";
  //  ctx.fillStyle = "rgba(210,205,195,0.36)";
    ctx.strokeStyle = "rgba(255,250,235,0.82)";
    ctx.lineWidth = 1.2;

    ctx.fill();

    // how to make htis look nicer VVV
  //  ctx.shadowColor = "rgba(255,255,255,0.36)";
    //ctx.shadowBlur = 3;
//    ctx.shadowBlur = 0;

    ctx.stroke();
  }

  function render() {
    raf = null;

    ensureCanvas();
    resizeCanvas();

    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    if ((window.__gwState?.showStructures ?? true) === false) return;

    for (const b of buildings) {
      drawBuilding(b);
    }
  }

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(render);
  }

  window.GridWildStructuresLayer = {
    render,
    scheduleRender,
    fetchBuildings,
    scheduleFetch,
    setVisible(show) {
      window.__gwState = window.__gwState || {};
      window.__gwState.showStructures = !!show;
      canvas && (canvas.style.display = show ? "block" : "none");
      if (show) scheduleFetch();
      scheduleRender();
    },
    getBuildings() {
      return buildings.slice();
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    scheduleFetch();
    scheduleRender();
  });
})();