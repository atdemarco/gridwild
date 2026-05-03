// js/gw-osm-features-layer.js
// OSM contextual features split into two canvas layers:
//
// 405: parks / water / trails     below HeatMap
// 450: buildings / roofs          above HeatMap, below Fog
//
// Intended stack:
// Base map
// OSM parks / water / trails
// HeatMap
// OSM buildings
// Fog canvas
// Grid outlines / HUD / popups

(function () {
  let contextCanvas = null;
  let contextCtx = null;

  let buildingCanvas = null;
  let buildingCtx = null;

  let raf = null;
  let fetchTimer = null;
  let lastFetchKey = null;

  let features = {
    trails: [],
    parks: [],
    buildings: [],
    water: []
  };

  const OSM_CONTEXT_Z = 405;
  const OSM_BUILDING_Z = 450;

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FETCH_DEBOUNCE_MS = 900;
  const MIN_ZOOM = 16;

  let listenersBound = false;

  function makeCanvas(id, zIndex) {
    const c = document.createElement("canvas");
    c.id = id;

    Object.assign(c.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: String(zIndex)
    });

    map.getContainer().appendChild(c);
    return c;
  }

  function ensureCanvas() {
    if (!contextCanvas) {
      contextCanvas = makeCanvas("gwOsmContextCanvas", OSM_CONTEXT_Z);
      contextCtx = contextCanvas.getContext("2d", { alpha: true });
    }

    if (!buildingCanvas) {
      buildingCanvas = makeCanvas("gwOsmBuildingCanvas", OSM_BUILDING_Z);
      buildingCtx = buildingCanvas.getContext("2d", { alpha: true });
    }

    if (!listenersBound) {
      listenersBound = true;
      map.on("move zoom resize viewreset zoomend moveend", scheduleRender);
      map.on("moveend zoomend", scheduleFetch);
    }
  }

  function resizeOneCanvas(c, cctx) {
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;

    const wantW = Math.round(size.x * dpr);
    const wantH = Math.round(size.y * dpr);

    if (c.width !== wantW || c.height !== wantH) {
      c.width = wantW;
      c.height = wantH;
      c.style.width = `${size.x}px`;
      c.style.height = `${size.y}px`;
    }

    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resizeCanvas() {
    ensureCanvas();
    resizeOneCanvas(contextCanvas, contextCtx);
    resizeOneCanvas(buildingCanvas, buildingCtx);
  }

  function getBboxString() {
    const b = map.getBounds();
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  function getFetchKey() {
    const c = map.getCenter();

    return [
      map.getZoom(),
      c.lat.toFixed(4),
      c.lng.toFixed(4)
    ].join("|");
  }

  function buildOverpassQuery() {
    const bbox = getBboxString();

    return `
      [out:json][timeout:25];
      (
        way["building"](${bbox});
        relation["building"](${bbox});

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

  function geometryToLatLngs(el) {
    if (!Array.isArray(el.geometry)) return [];

    return el.geometry
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map(p => L.latLng(p.lat, p.lon));
  }

  function isClosedGeometry(points) {
    if (!points || points.length < 4) return false;

    const a = points[0];
    const b = points[points.length - 1];

    return Math.abs(a.lat - b.lat) < 1e-7 &&
           Math.abs(a.lng - b.lng) < 1e-7;
  }

  function classifyFeature(el) {
    const tags = el.tags || {};

    if (tags.building) return "buildings";

    if (
      tags.natural === "water" ||
      tags.waterway === "riverbank"
    ) {
      return "water";
    }

    if (
      tags.leisure === "park" ||
      tags.leisure === "garden" ||
      tags.leisure === "nature_reserve" ||
      tags.natural === "wood" ||
      tags.landuse === "forest" ||
      tags.landuse === "grass" ||
      tags.landuse === "meadow" ||
      tags.landuse === "recreation_ground"
    ) {
      return "parks";
    }

    if (
      tags.highway === "path" ||
      tags.highway === "footway" ||
      tags.highway === "cycleway" ||
      tags.highway === "bridleway" ||
      tags.highway === "track"
    ) {
      return "trails";
    }

    return null;
  }

  function parseFeatures(data) {
    const next = {
      trails: [],
      parks: [],
      buildings: [],
      water: []
    };

    for (const el of data?.elements || []) {
      const points = geometryToLatLngs(el);
      if (points.length < 2) continue;

      const kind = classifyFeature(el);
      if (!kind) continue;

      next[kind].push({
        id: `${el.type}/${el.id}`,
        tags: el.tags || {},
        points,
        closed: isClosedGeometry(points)
      });
    }

    return next;
  }

  async function fetchFeatures() {
    if ((window.__gwState?.showOsmFeatures ?? true) === false) return;

    if (map.getZoom() < MIN_ZOOM) {
      features = {
        trails: [],
        parks: [],
        buildings: [],
        water: []
      };

      scheduleRender();
      return;
    }

    const key = getFetchKey();
    if (key === lastFetchKey) return;

    lastFetchKey = key;

    try {
      const resp = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          data: buildOverpassQuery()
        })
      });

      if (!resp.ok) {
        throw new Error(`Overpass HTTP ${resp.status}`);
      }

      const data = await resp.json();
      features = parseFeatures(data);

      scheduleRender();
    } catch (err) {
      console.warn("GridWild OSM feature fetch failed:", err);
    }
  }

  function scheduleFetch() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchFeatures, FETCH_DEBOUNCE_MS);
  }

  function beginPath(ctxLocal, points) {
    ctxLocal.beginPath();

    points.forEach((ll, i) => {
      const p = map.latLngToContainerPoint(ll);

      if (i === 0) ctxLocal.moveTo(p.x, p.y);
      else ctxLocal.lineTo(p.x, p.y);
    });
  }

  function drawPolygon(ctxLocal, feature, style) {
    if (!feature.points || feature.points.length < 3) return;

    beginPath(ctxLocal, feature.points);
    ctxLocal.closePath();

    ctxLocal.fillStyle = style.fill;
    ctxLocal.strokeStyle = style.stroke;
    ctxLocal.lineWidth = style.lineWidth;

    ctxLocal.fill();
    ctxLocal.stroke();
  }

  function drawLine(ctxLocal, feature, style) {
    if (!feature.points || feature.points.length < 2) return;

    beginPath(ctxLocal, feature.points);

    ctxLocal.strokeStyle = style.stroke;
    ctxLocal.lineWidth = style.lineWidth;
    ctxLocal.lineCap = "round";
    ctxLocal.lineJoin = "round";

    ctxLocal.stroke();
  }

  function clearCanvases() {
    const size = map.getSize();

    if (contextCtx) {
      contextCtx.clearRect(0, 0, size.x, size.y);
    }

    if (buildingCtx) {
      buildingCtx.clearRect(0, 0, size.x, size.y);
    }
  }

  function renderContextLayer() {
    const showParks = window.__gwState?.showOsmParks ?? true;
    const showWater = window.__gwState?.showOsmWater ?? true;
    const showTrails = window.__gwState?.showOsmTrails ?? true;

    // Parks / woods
    if (showParks) {
      for (const f of features.parks) {
        drawPolygon(contextCtx, f, {
//          fill: "rgba(72, 132, 82, 0.28)",
 //         stroke: "rgba(42, 94, 52, 0.45)",
   //       lineWidth: 1.2

            // Don't want to compete with heatmap...
            fill: "rgba(78, 92, 74, 0.22)",      // muted olive-gray
            stroke: "rgba(52, 62, 48, 0.34)",   // darker subtle outline
            lineWidth: 1.0
        });
      }
    }

    // Water
    if (showWater) {
      for (const f of features.water) {
        drawPolygon(contextCtx, f, {
        //  fill: "rgba(60, 140, 190, 0.34)",
      //    stroke: "rgba(45, 105, 155, 0.58)",
    //      lineWidth: 1.2

          fill: "rgba(72, 108, 138, 0.26)",     // cooler muted blue
          stroke: "rgba(52, 78, 102, 0.42)",
          lineWidth: 1.1
        });
      }
    }

    // Trails / paths
    if (showTrails) {
      for (const f of features.trails) {
        drawLine(contextCtx, f, {
          //stroke: "rgba(255, 248, 214, 0.88)",
        // lineWidth: 2.8
          stroke: "rgba(170, 154, 122, 0.58)",   // warm dust base
          lineWidth: 2.4
        });

        drawLine(contextCtx, f, {
          //stroke: "rgba(108, 78, 36, 0.82)",
          //lineWidth: 1.2
          stroke: "rgba(110, 92, 66, 0.46)",     // subtle center line
        lineWidth: 1.0
        });
      }
    }
  }

  function renderBuildingLayer() {
    const showBuildings = window.__gwState?.showOsmBuildings ?? true;

    if (!showBuildings) return;

    for (const f of features.buildings) {
      drawPolygon(buildingCtx, f, {
    //    fill: "rgba(92, 82, 68, 0.58)",
  //      stroke: "rgba(255, 235, 190, 0.72)",
//        lineWidth: 1.4

      //  fill: "rgba(92, 82, 68, 0.56)",
        //stroke: "rgba(182, 168, 142, 0.42)",
        //lineWidth: 1.1

        // still pop...
        fill: "rgba(92,82,68,.56)",
        stroke: "rgba(40,40,40,.20)",
        lineWidth: 1.6
      });
    }
  }

  function render() {
    raf = null;

    ensureCanvas();
    resizeCanvas();
    clearCanvases();

    if ((window.__gwState?.showOsmFeatures ?? true) === false) return;

    renderContextLayer();
    renderBuildingLayer();
  }

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(render);
  }

  window.GridWildOsmFeaturesLayer = {
    render,
    scheduleRender,
    fetchFeatures,
    scheduleFetch,

    setVisible(show) {
        window.__gwState = window.__gwState || {};
        window.__gwState.showOsmFeatures = !!show;
        window.__gwState.showOsmBuildings = !!show;

        clearTimeout(fetchTimer);

        if (!show) {
            features = {
            trails: [],
            parks: [],
            buildings: [],
            water: []
            };

            lastFetchKey = null;

            if (contextCanvas) contextCanvas.style.display = "none";
            if (buildingCanvas) buildingCanvas.style.display = "none";

            scheduleRender();
            return;
        }

        if (contextCanvas) contextCanvas.style.display = "block";
        if (buildingCanvas) buildingCanvas.style.display = "block";

        lastFetchKey = null;
        scheduleFetch();
        scheduleRender();
    },

    setFeatureVisible(kind, show) {
      window.__gwState = window.__gwState || {};

      const keyMap = {
        trails: "showOsmTrails",
        parks: "showOsmParks",
        buildings: "showOsmBuildings",
        water: "showOsmWater"
      };

      const stateKey = keyMap[kind];
      if (!stateKey) return;

      window.__gwState[stateKey] = !!show;
      scheduleRender();
    },

    getFeatures() {
      return {
        trails: features.trails.slice(),
        parks: features.parks.slice(),
        buildings: features.buildings.slice(),
        water: features.water.slice()
      };
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    scheduleFetch();
    scheduleRender();
  });
})();