// js/gw-osm-features-layer.js
// OSM contextual features split into two canvas layers:
//
// 405: habitat polygons / water / trails     below HeatMap
// 450: buildings / roofs          above HeatMap, below Fog
//
// Intended stack:
// Base map
// OSM habitat polygons / water / trails
// HeatMap
// OSM buildings
// Fog canvas
// Grid outlines / HUD / popups

(function () {
  let contextCanvas = null;
  let contextCtx = null;

  let buildingCanvas = null;
  let buildingCtx = null;

  let contextTopLeft = L.point(0, 0);
  let buildingTopLeft = L.point(0, 0);
  let contextLayout = null;
  let buildingLayout = null;

  let raf = null;
  let fetchTimer = null;
  let lastFetchKey = null;
  let fetchInFlight = false;
  let lastFetchStartedAt = 0;
  let overpassDisabledUntil = 0;
  let cachedFeatureBounds = null;

  let features = {
    trails: [],
    parks: [],
    buildings: [],
    water: [],
    roads: [],
    places: []
  };
  let featuresVersion = 0;
  let lastFetchToastAt = 0;

  const OSM_CONTEXT_Z = 405;
  const OSM_BUILDING_Z = 450;

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const FETCH_DEBOUNCE_MS = 900;
  const FETCH_MIN_INTERVAL_MS = 9000;
  const OVERPASS_RATE_LIMIT_COOLDOWN_MS = 120000;
  const OVERPASS_ERROR_COOLDOWN_MS = 30000;
  const MIN_ZOOM = 15;
  const QUERY_BOUNDS_PAD_RATIO = 0.35;

  let listenersBound = false;

  function ensurePane(name, zIndex) {
    if (!map.getPane(name)) {
      map.createPane(name);
      map.getPane(name).style.zIndex = String(zIndex);
      map.getPane(name).style.pointerEvents = "none";
    }
    return map.getPane(name);
  }

  function makeCanvas(id, paneName, zIndex) {
    const c = document.createElement("canvas");
    c.id = id;

    Object.assign(c.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: ""
    });

    ensurePane(paneName, zIndex).appendChild(c);
    return c;
  }

  function ensureCanvas() {
    if (!contextCanvas) {
      contextCanvas = makeCanvas("gwOsmContextCanvas", "gwOsmContextPane", OSM_CONTEXT_Z);
      contextCtx = contextCanvas.getContext("2d", { alpha: true });
    }

    if (!buildingCanvas) {
      buildingCanvas = makeCanvas("gwOsmBuildingCanvas", "gwOsmBuildingPane", OSM_BUILDING_Z);
      buildingCtx = buildingCanvas.getContext("2d", { alpha: true });
    }

    if (!listenersBound) {
      listenersBound = true;
      if (window.GridWildMapMotionQueue?.subscribe) {
        window.GridWildMapMotionQueue.subscribe("osm-features-motion", scheduleRender);
      } else {
        map.on("move zoom resize viewreset zoomend moveend", scheduleRender);
      }
      map.on("moveend zoomend", scheduleFetch);
    }
  }

  function pointForCanvas(latlng, topLeft) {
    return map.latLngToLayerPoint(latlng).subtract(topLeft);
  }

  function resizeCanvas() {
    ensureCanvas();
    contextLayout = window.GridWildCanvasPerf.layoutPaddedCanvas(
      contextCanvas,
      contextCtx,
      "osm-features"
    );
    buildingLayout = window.GridWildCanvasPerf.layoutPaddedCanvas(
      buildingCanvas,
      buildingCtx,
      "osm-features"
    );
    contextTopLeft = contextLayout.topLeft;
    buildingTopLeft = buildingLayout.topLeft;
  }

  function getBufferedQueryBounds() {
    return map.getBounds().pad(QUERY_BOUNDS_PAD_RATIO);
  }

  function boundsToBboxString(b) {
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  function boundsToFetchKey(b) {
    return [
      b.getSouth().toFixed(4),
      b.getWest().toFixed(4),
      b.getNorth().toFixed(4),
      b.getEast().toFixed(4)
    ].join(",");
  }

  function boundsContain(outer, inner) {
    if (!outer || !inner) return false;
    return (
      outer.getSouth() <= inner.getSouth() &&
      outer.getWest() <= inner.getWest() &&
      outer.getNorth() >= inner.getNorth() &&
      outer.getEast() >= inner.getEast()
    );
  }

  function hasCachedCoverage() {
    return boundsContain(cachedFeatureBounds, map.getBounds());
  }

  function buildOverpassQuery(queryBounds = getBufferedQueryBounds()) {
    const bbox = boundsToBboxString(queryBounds);

    return `
      [out:json][timeout:25];
      (
        way["building"](${bbox});
        relation["building"](${bbox});

        way["highway"~"path|footway|cycleway|bridleway|track"](${bbox});
        way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street|road"](${bbox});

        way["leisure"~"park|garden|nature_reserve"](${bbox});
        relation["leisure"~"park|garden|nature_reserve"](${bbox});
        node["leisure"~"park|garden|nature_reserve"]["name"](${bbox});

        way["boundary"~"protected_area|national_park"](${bbox});
        relation["boundary"~"protected_area|national_park"](${bbox});
        node["boundary"~"protected_area|national_park"]["name"](${bbox});

        way["natural"~"wood|wetland|scrub|heath|grassland"](${bbox});
        relation["natural"~"wood|wetland|scrub|heath|grassland"](${bbox});
        node["natural"~"wood|wetland|scrub|heath|grassland"]["name"](${bbox});

        way["landuse"~"forest|grass|meadow|recreation_ground|allotments|orchard|cemetery"](${bbox});
        relation["landuse"~"forest|grass|meadow|recreation_ground|allotments|orchard|cemetery"](${bbox});
        node["landuse"~"forest|grass|meadow|recreation_ground|allotments|orchard|cemetery"]["name"](${bbox});

        way["amenity"="grave_yard"](${bbox});
        relation["amenity"="grave_yard"](${bbox});
        node["amenity"="grave_yard"]["name"](${bbox});

        way["historic"="cemetery"](${bbox});
        relation["historic"="cemetery"](${bbox});
        node["historic"="cemetery"]["name"](${bbox});

        way["natural"="water"](${bbox});
        relation["natural"="water"](${bbox});

        way["waterway"="riverbank"](${bbox});
        relation["waterway"="riverbank"](${bbox});

        way["waterway"~"stream|river|canal|ditch|drain"](${bbox});

        node["place"]["name"](${bbox});
        way["place"]["name"](${bbox});
        relation["place"]["name"](${bbox});
      );
      out geom;
    `;
  }

  function geometryToLatLngs(el) {
    if (el.type === "node" && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      return [L.latLng(el.lat, el.lon)];
    }

    if (!Array.isArray(el.geometry)) return [];

    return el.geometry
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => L.latLng(p.lat, p.lon));
  }

  function isClosedGeometry(points) {
    if (!points || points.length < 4) return false;

    const a = points[0];
    const b = points[points.length - 1];

    return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
  }

  function classifyFeature(el) {
    const tags = el.tags || {};

    if (tags.place && tags.name) return "places";
    if (
      el.type === "node" &&
      tags.name &&
      (tags.leisure === "park" ||
        tags.leisure === "garden" ||
        tags.leisure === "nature_reserve" ||
        tags.boundary === "protected_area" ||
        tags.boundary === "national_park" ||
        tags.natural === "wood" ||
        tags.natural === "wetland" ||
        tags.natural === "scrub" ||
        tags.natural === "heath" ||
        tags.natural === "grassland" ||
        tags.landuse === "forest" ||
        tags.landuse === "grass" ||
        tags.landuse === "meadow" ||
        tags.landuse === "recreation_ground" ||
        tags.landuse === "allotments" ||
        tags.landuse === "orchard" ||
        tags.landuse === "cemetery" ||
        tags.amenity === "grave_yard" ||
        tags.historic === "cemetery")
    ) {
      return "places";
    }

    if (tags.building) return "buildings";

    if (
      tags.natural === "water" ||
      tags.waterway === "riverbank" ||
      tags.waterway === "stream" ||
      tags.waterway === "river" ||
      tags.waterway === "canal" ||
      tags.waterway === "ditch" ||
      tags.waterway === "drain"
    ) {
      return "water";
    }

    if (
      tags.leisure === "park" ||
      tags.leisure === "garden" ||
      tags.leisure === "nature_reserve" ||
      tags.boundary === "protected_area" ||
      tags.boundary === "national_park" ||
      tags.natural === "wood" ||
      tags.natural === "wetland" ||
      tags.natural === "scrub" ||
      tags.natural === "heath" ||
      tags.natural === "grassland" ||
      tags.landuse === "forest" ||
      tags.landuse === "grass" ||
      tags.landuse === "meadow" ||
      tags.landuse === "recreation_ground" ||
      tags.landuse === "allotments" ||
      tags.landuse === "orchard" ||
      tags.landuse === "cemetery" ||
      tags.amenity === "grave_yard" ||
      tags.historic === "cemetery"
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

    if (
      tags.highway === "motorway" ||
      tags.highway === "trunk" ||
      tags.highway === "primary" ||
      tags.highway === "secondary" ||
      tags.highway === "tertiary" ||
      tags.highway === "residential" ||
      tags.highway === "service" ||
      tags.highway === "unclassified" ||
      tags.highway === "living_street" ||
      tags.highway === "road"
    ) {
      return "roads";
    }

    return null;
  }

  function parseFeatures(data) {
    const next = {
      trails: [],
      parks: [],
      buildings: [],
      water: [],
      roads: [],
      places: []
    };

    for (const el of data?.elements || []) {
      const kind = classifyFeature(el);
      if (!kind) continue;

      const points = geometryToLatLngs(el);
      if (kind === "places") {
        if (points.length < 1) continue;
      } else if (points.length < 2) {
        continue;
      }

      next[kind].push({
        id: `${el.type}/${el.id}`,
        tags: el.tags || {},
        points,
        closed: isClosedGeometry(points)
      });
    }

    return next;
  }

  function emptyFeatures() {
    return {
      trails: [],
      parks: [],
      buildings: [],
      water: [],
      roads: [],
      places: []
    };
  }

  function publishFeaturesUpdated() {
    featuresVersion++;
    window.dispatchEvent(
      new CustomEvent("gwOsmFeaturesUpdated", {
        detail: {
          version: featuresVersion,
          counts: {
            trails: features.trails.length,
            parks: features.parks.length,
            buildings: features.buildings.length,
            water: features.water.length,
            roads: features.roads.length,
            places: features.places.length
          }
        }
      })
    );
  }

  function showFetchToast() {
    const now = Date.now();
    if (now - lastFetchToastAt < 12000) return;
    lastFetchToastAt = now;

    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast("Obtaining OSM data...");
    }
  }

  function showFetchStatusToast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    }
  }

  async function fetchFeatures() {
    if ((window.__gwState?.showOsmFeatures ?? true) === false) return;
    if (fetchInFlight) return;

    const now = Date.now();
    if (now < overpassDisabledUntil) return;

    if (hasCachedCoverage()) {
      scheduleRender();
      return;
    }

    const sinceLastFetch = now - lastFetchStartedAt;
    if (lastFetchStartedAt && sinceLastFetch < FETCH_MIN_INTERVAL_MS) {
      scheduleFetch(FETCH_MIN_INTERVAL_MS - sinceLastFetch);
      return;
    }

    if (map.getZoom() < MIN_ZOOM) {
      scheduleRender();
      return;
    }

    const queryBounds = getBufferedQueryBounds();
    const key = boundsToFetchKey(queryBounds);
    if (key === lastFetchKey) return;

    fetchInFlight = true;
    lastFetchStartedAt = now;
    showFetchToast();

    try {
      const resp = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          data: buildOverpassQuery(queryBounds)
        })
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          overpassDisabledUntil = Date.now() + OVERPASS_RATE_LIMIT_COOLDOWN_MS;
          showFetchStatusToast("OSM data rate-limited; keeping current OSM cache");
        } else {
          overpassDisabledUntil = Date.now() + OVERPASS_ERROR_COOLDOWN_MS;
        }
        throw new Error(`Overpass HTTP ${resp.status}`);
      }

      const data = await resp.json();
      features = parseFeatures(data);
      lastFetchKey = key;
      cachedFeatureBounds = queryBounds;

      publishFeaturesUpdated();
      scheduleRender();
    } catch (err) {
      console.warn("GridWild OSM feature fetch failed:", err);
    } finally {
      fetchInFlight = false;
    }
  }

  function scheduleFetch(delayMs = FETCH_DEBOUNCE_MS) {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchFeatures, Math.max(0, Number(delayMs) || 0));
  }

  function beginPath(ctxLocal, points, topLeft) {
    ctxLocal.beginPath();

    points.forEach((ll, i) => {
      const p = pointForCanvas(ll, topLeft);

      if (i === 0) ctxLocal.moveTo(p.x, p.y);
      else ctxLocal.lineTo(p.x, p.y);
    });
  }

  function drawPolygon(ctxLocal, feature, style) {
    if (!feature.points || feature.points.length < 3) return;

    beginPath(
      ctxLocal,
      feature.points,
      ctxLocal === buildingCtx ? buildingTopLeft : contextTopLeft
    );
    ctxLocal.closePath();

    ctxLocal.fillStyle = style.fill;
    ctxLocal.strokeStyle = style.stroke;
    ctxLocal.lineWidth = style.lineWidth;

    ctxLocal.fill();
    ctxLocal.stroke();
  }

  function drawLine(ctxLocal, feature, style) {
    if (!feature.points || feature.points.length < 2) return;

    beginPath(
      ctxLocal,
      feature.points,
      ctxLocal === buildingCtx ? buildingTopLeft : contextTopLeft
    );

    ctxLocal.strokeStyle = style.stroke;
    ctxLocal.lineWidth = style.lineWidth;
    ctxLocal.lineCap = "round";
    ctxLocal.lineJoin = "round";

    ctxLocal.stroke();
  }

  function clearCanvases() {
    if (contextCtx && contextLayout) {
      contextCtx.clearRect(0, 0, contextLayout.width, contextLayout.height);
    }

    if (buildingCtx && buildingLayout) {
      buildingCtx.clearRect(0, 0, buildingLayout.width, buildingLayout.height);
    }
  }

  function renderContextLayer() {
    const showParks = window.__gwState?.showOsmParks ?? true;
    const showWater = window.__gwState?.showOsmWater ?? true;
    const showTrails = window.__gwState?.showOsmTrails ?? true;

    // Habitat polygons: parks, woods, wetlands, gardens, orchards, cemeteries, etc.
    if (showParks) {
      for (const f of features.parks) {
        drawPolygon(contextCtx, f, {
          //          fill: "rgba(72, 132, 82, 0.28)",
          //         stroke: "rgba(42, 94, 52, 0.45)",
          //       lineWidth: 1.2

          // Don't want to compete with heatmap...
          fill: "rgba(78, 92, 74, 0.22)", // muted olive-gray
          stroke: "rgba(52, 62, 48, 0.34)", // darker subtle outline
          lineWidth: 1.0
        });
      }
    }

    // Water
    if (showWater) {
      for (const f of features.water) {
        const style = {
          //  fill: "rgba(60, 140, 190, 0.34)",
          //    stroke: "rgba(45, 105, 155, 0.58)",
          //      lineWidth: 1.2

          fill: "rgba(72, 108, 138, 0.26)", // cooler muted blue
          stroke: "rgba(52, 78, 102, 0.42)",
          lineWidth: 1.1
        };

        if (f.closed) drawPolygon(contextCtx, f, style);
        else
          drawLine(contextCtx, f, {
            stroke: "rgba(52, 94, 132, 0.52)",
            lineWidth: 1.4
          });
      }
    }

    if (window.__gwState?.showOsmRoads ?? true) {
      for (const f of features.roads) {
        drawLine(contextCtx, f, {
          stroke: "rgba(82, 74, 68, 0.34)",
          lineWidth: 2.0
        });
      }
    }

    // Trails / paths
    if (showTrails) {
      for (const f of features.trails) {
        drawLine(contextCtx, f, {
          //stroke: "rgba(255, 248, 214, 0.88)",
          // lineWidth: 2.8
          stroke: "rgba(170, 154, 122, 0.58)", // warm dust base
          lineWidth: 2.4
        });

        drawLine(contextCtx, f, {
          //stroke: "rgba(108, 78, 36, 0.82)",
          //lineWidth: 1.2
          stroke: "rgba(110, 92, 66, 0.46)", // subtle center line
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
    if (map.getZoom() < MIN_ZOOM) return;

    renderContextLayer();
    renderBuildingLayer();
  }

  function scheduleRender(evt) {
    if (evt?.type === "move" && window.GridWildCanvasPerf?.canvasCoversViewport?.(contextLayout)) {
      return;
    }

    if (raf) return;
    if (window.GridWildMapMotionQueue?.requestFrame) {
      raf = true;
      window.GridWildMapMotionQueue.requestFrame("osm-features", render);
    } else {
      raf = requestAnimationFrame(render);
    }
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
        if (contextCanvas) contextCanvas.style.display = "none";
        if (buildingCanvas) buildingCanvas.style.display = "none";

        scheduleRender();
        return;
      }

      if (contextCanvas) contextCanvas.style.display = "block";
      if (buildingCanvas) buildingCanvas.style.display = "block";

      scheduleFetch();
      scheduleRender();
    },

    setFeatureVisible(kind, show) {
      window.__gwState = window.__gwState || {};

      const keyMap = {
        trails: "showOsmTrails",
        parks: "showOsmParks",
        buildings: "showOsmBuildings",
        water: "showOsmWater",
        roads: "showOsmRoads"
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
        water: features.water.slice(),
        roads: features.roads.slice(),
        places: features.places.slice()
      };
    },

    getVersion() {
      return featuresVersion;
    },

    getCacheStatus() {
      const bounds = cachedFeatureBounds;
      return {
        hasCoverage: hasCachedCoverage(),
        fetchInFlight,
        overpassCooldownMs: Math.max(0, overpassDisabledUntil - Date.now()),
        bounds: bounds
          ? {
              south: bounds.getSouth(),
              west: bounds.getWest(),
              north: bounds.getNorth(),
              east: bounds.getEast()
            }
          : null,
        counts: {
          trails: features.trails.length,
          parks: features.parks.length,
          buildings: features.buildings.length,
          water: features.water.length,
          roads: features.roads.length,
          places: features.places.length
        }
      };
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    scheduleFetch();
    scheduleRender();
  });
})();
