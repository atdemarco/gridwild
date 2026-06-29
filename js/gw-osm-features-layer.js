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
  let fetchInFlightMeta = null;
  let fetchRequestedWhileInFlight = false;
  let detailCoverageTimer = null;
  let lastFetchStartedAt = 0;
  let lastFetchScheduleZoom = null;
  let zoomFetchSettleUntil = 0;
  let zoomGestureInProgress = false;
  let zoomRenderSettleUntil = 0;
  let zoomRenderTimer = null;
  let overpassDisabledUntil = 0;
  let cachedFeatureBounds = null;
  let cachedParksBounds = null;
  let cachedParksProfile = null;
  let basemapBuildingFetchTimer = null;
  let basemapBuildingFetchPromise = null;
  let basemapBuildingFetchMeta = null;
  let basemapBuildingSourceUrl = null;
  let basemapBuildingSource = null;
  let basemapBuildingImportsPromise = null;
  let basemapBuildingBounds = null;
  let basemapPmtilesFeatures = {
    trails: [],
    parks: [],
    buildings: [],
    water: [],
    roads: [],
    places: []
  };
  let basemapBuildingFeatures = [];
  let basemapBuildingLastFetchKey = null;

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

  const FETCH_DEBOUNCE_MS = 900;
  const ZOOM_FETCH_SETTLE_MS = 1600;
  const ZOOM_OUT_FETCH_SETTLE_MS = 2800;
  const ZOOM_RENDER_SETTLE_MS = 180;
  const FETCH_MIN_INTERVAL_MS = 9000;
  const OVERPASS_RATE_LIMIT_COOLDOWN_MS = 120000;
  const OVERPASS_ERROR_COOLDOWN_MS = 30000;
  const MIN_ZOOM = 15;
  const CLOSE_DETAIL_MIN_ZOOM = 18;
  const LEAN_QUERY_BOUNDS_PAD_RATIO = 0.5;
  const DETAIL_QUERY_BOUNDS_PAD_RATIO = 1.15;
  const PARKS_QUERY_BOUNDS_PAD_RATIO = 0.65;
  const LEAN_EDGE_REFETCH_PAD_RATIO = 0.16;
  const DETAIL_EDGE_REFETCH_PAD_RATIO = 0.24;
  const PARKS_EDGE_REFETCH_PAD_RATIO = 0.18;
  const LOCAL_CACHE_KEY = "gridwild.osmFeatures.cache.v4";
  const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const LOCAL_CACHE_MAX_ENTRIES = 12;
  const QUERY_PROFILE_LEAN = "lean";
  const QUERY_PROFILE_DETAIL = "detail";
  const QUERY_PROFILE_PARKS = "parks";
  const QUERY_PROFILE_PATCH_VIEW = "patch-view";
  const BASEMAP_BUILDING_MODULE_URLS = {
    pmtiles: "/vendor/pmtiles/pmtiles-3.2.1.esm.js",
    vectorTile: "/vendor/pmtiles/vector-tile-1.3.1.esm.js",
    pbf: "/vendor/pmtiles/pbf-3.3.0.esm.js"
  };
  const BASEMAP_BUILDING_TILE_Z = 15;
  const BASEMAP_BUILDING_MAX_TILES = 96;
  const BASEMAP_BUILDING_CACHE_MAX = 72;
  const basemapBuildingTileCache = new Map();

  let listenersBound = false;
  let cachedFeatureProfile = null;

  function timeOsmVerbose(label, fn, detail = null) {
    const timer = window.GridWildVerboseConsole;
    return timer?.time ? timer.time(label, fn, detail) : fn();
  }

  function overpassEndpoint() {
    return String(window.GridWildExternalServices?.getOsmEndpoint?.("overpass") || "").trim();
  }

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
      lastFetchScheduleZoom = Number(map?.getZoom?.());
      map.on("moveend zoomend", handleFetchMapEvent);
      map.on("zoomstart zoomend", handleOsmRenderZoomLifecycle);
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

  function getLeanQueryBounds() {
    return map.getBounds().pad(LEAN_QUERY_BOUNDS_PAD_RATIO);
  }

  function getDetailQueryBounds() {
    return map.getBounds().pad(DETAIL_QUERY_BOUNDS_PAD_RATIO);
  }

  function getParksQueryBoundsForCurrentView() {
    return map.getBounds().pad(PARKS_QUERY_BOUNDS_PAD_RATIO);
  }

  function getQueryBoundsForProfile(profile = currentQueryProfile()) {
    const queryProfile = normalizeQueryProfile(profile);
    if (queryProfile === QUERY_PROFILE_LEAN) return getLeanQueryBounds();
    if (queryProfile === QUERY_PROFILE_DETAIL) return getDetailQueryBounds();
    return map.getBounds();
  }

  function getCoverageBoundsForProfile(profile = currentQueryProfile()) {
    const queryProfile = normalizeQueryProfile(profile);
    const currentBounds = map.getBounds();
    if (queryProfile === QUERY_PROFILE_DETAIL) {
      return currentBounds.pad(DETAIL_EDGE_REFETCH_PAD_RATIO);
    }
    if (queryProfile === QUERY_PROFILE_LEAN) {
      return currentBounds.pad(LEAN_EDGE_REFETCH_PAD_RATIO);
    }
    if (isParksOnlyQueryProfile(queryProfile)) {
      return currentBounds.pad(PARKS_EDGE_REFETCH_PAD_RATIO);
    }
    return currentBounds;
  }

  function boundsToBboxString(b) {
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  function currentQueryProfile() {
    const zoom = Number(map?.getZoom?.());
    return zoom >= CLOSE_DETAIL_MIN_ZOOM ? QUERY_PROFILE_DETAIL : QUERY_PROFILE_LEAN;
  }

  function normalizeQueryProfile(profile) {
    if (profile === QUERY_PROFILE_PARKS) return QUERY_PROFILE_PARKS;
    if (profile === QUERY_PROFILE_PATCH_VIEW) return QUERY_PROFILE_PATCH_VIEW;
    return profile === QUERY_PROFILE_LEAN ? QUERY_PROFILE_LEAN : QUERY_PROFILE_DETAIL;
  }

  function isParksOnlyQueryProfile(profile) {
    const queryProfile = normalizeQueryProfile(profile);
    return queryProfile === QUERY_PROFILE_PARKS || queryProfile === QUERY_PROFILE_PATCH_VIEW;
  }

  function boundsToFetchKey(b, profile = currentQueryProfile()) {
    return [
      normalizeQueryProfile(profile),
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

  function profileCanSatisfyCoverage(requestedProfile, candidateProfile) {
    if (!candidateProfile) return false;
    const requested = normalizeQueryProfile(requestedProfile);
    const candidate = normalizeQueryProfile(candidateProfile);
    if (requested === candidate) return true;
    if (requested === QUERY_PROFILE_LEAN && candidate === QUERY_PROFILE_DETAIL) return true;
    if (requested === QUERY_PROFILE_PARKS && !isParksOnlyQueryProfile(candidate)) return true;
    if (requested === QUERY_PROFILE_PARKS && candidate === QUERY_PROFILE_PATCH_VIEW) return true;
    return false;
  }

  function inFlightCovers(bounds, profile) {
    return (
      fetchInFlightMeta &&
      profileCanSatisfyCoverage(profile, fetchInFlightMeta.profile) &&
      boundsContain(fetchInFlightMeta.bounds, bounds)
    );
  }

  function beginFetchInFlight(key, bounds, profile) {
    fetchInFlight = true;
    fetchInFlightMeta = {
      key,
      bounds,
      profile: normalizeQueryProfile(profile),
      startedAt: Date.now()
    };
  }

  function endFetchInFlight(key) {
    fetchInFlight = false;
    if (!key || fetchInFlightMeta?.key === key) fetchInFlightMeta = null;
  }

  function serializeBounds(bounds) {
    if (!bounds) return null;
    return {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast()
    };
  }

  function deserializeBounds(bounds) {
    if (
      !bounds ||
      !Number.isFinite(bounds.south) ||
      !Number.isFinite(bounds.west) ||
      !Number.isFinite(bounds.north) ||
      !Number.isFinite(bounds.east)
    ) {
      return null;
    }

    return L.latLngBounds(L.latLng(bounds.south, bounds.west), L.latLng(bounds.north, bounds.east));
  }

  function normalizeLatLngBounds(bounds) {
    if (!bounds) return null;
    if (
      typeof bounds.getSouth === "function" &&
      typeof bounds.getWest === "function" &&
      typeof bounds.getNorth === "function" &&
      typeof bounds.getEast === "function"
    ) {
      return bounds.isValid?.() === false ? null : bounds;
    }

    if (
      Number.isFinite(bounds.south) &&
      Number.isFinite(bounds.west) &&
      Number.isFinite(bounds.north) &&
      Number.isFinite(bounds.east)
    ) {
      return deserializeBounds(bounds);
    }

    try {
      const latLngBounds = L.latLngBounds(bounds);
      return latLngBounds?.isValid?.() === false ? null : latLngBounds;
    } catch {
      return null;
    }
  }

  function clampTileIndex(value, z) {
    const max = 2 ** z - 1;
    return Math.max(0, Math.min(max, Math.floor(value)));
  }

  function lonToTileX(lon, z) {
    return clampTileIndex(((Number(lon) + 180) / 360) * 2 ** z, z);
  }

  function latToTileY(lat, z) {
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
    const latRad = (clampedLat * Math.PI) / 180;
    return clampTileIndex(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
      z
    );
  }

  function tilePointToLatLng(tile, point, extent) {
    const scale = 2 ** tile.z;
    const x = (tile.x + point.x / extent) / scale;
    const y = (tile.y + point.y / extent) / scale;
    const lng = x * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    return L.latLng(lat, lng);
  }

  function tileBounds(tile) {
    const scale = 2 ** tile.z;
    const west = (tile.x / scale) * 360 - 180;
    const east = ((tile.x + 1) / scale) * 360 - 180;
    const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / scale))) * 180) / Math.PI;
    const south =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + 1)) / scale))) * 180) / Math.PI;
    return L.latLngBounds(L.latLng(south, west), L.latLng(north, east));
  }

  function boundsForTiles(tiles) {
    let out = null;
    for (const tile of tiles) {
      const bounds = tileBounds(tile);
      out = out ? out.extend(bounds) : bounds;
    }
    return out;
  }

  function basemapBuildingTilesForBounds(bounds, z = BASEMAP_BUILDING_TILE_Z) {
    const normalized = normalizeLatLngBounds(bounds);
    if (!normalized) return [];

    const xMin = lonToTileX(normalized.getWest(), z);
    const xMax = lonToTileX(normalized.getEast(), z);
    const yMin = latToTileY(normalized.getNorth(), z);
    const yMax = latToTileY(normalized.getSouth(), z);
    const tiles = [];

    for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
      for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
        tiles.push({ z, x, y });
      }
    }

    return tiles;
  }

  function basemapBuildingFetchKey(tiles) {
    return tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`).join("|");
  }

  function basemapBuildingCoverageReady(bounds) {
    return boundsContain(basemapBuildingBounds, normalizeLatLngBounds(bounds));
  }

  function basemapBuildingFetchCovers(bounds) {
    return boundsContain(basemapBuildingFetchMeta?.bounds, normalizeLatLngBounds(bounds));
  }

  function basemapBuildingOverlayAllowed() {
    if (window.GridWildOsmBasemap?.enabled?.() === false) return false;
    return Boolean(window.GridWildOsmBasemap?.url?.());
  }

  async function ensureBasemapBuildingImports() {
    if (basemapBuildingImportsPromise) return basemapBuildingImportsPromise;

    basemapBuildingImportsPromise = Promise.all([
      import(BASEMAP_BUILDING_MODULE_URLS.pmtiles),
      import(BASEMAP_BUILDING_MODULE_URLS.vectorTile),
      import(BASEMAP_BUILDING_MODULE_URLS.pbf)
    ]).then(([pmtilesModule, vectorTileModule, pbfModule]) => {
      const PMTilesCtor = pmtilesModule.PMTiles || pmtilesModule.default?.PMTiles;
      const VectorTileCtor = vectorTileModule.VectorTile || vectorTileModule.default?.VectorTile;
      const PbfCtor = pbfModule.default || pbfModule.Pbf || pbfModule;

      if (!PMTilesCtor || !VectorTileCtor || !PbfCtor) {
        throw new Error("Basemap building decoder modules did not expose expected constructors.");
      }

      return { PMTilesCtor, VectorTileCtor, PbfCtor };
    });

    return basemapBuildingImportsPromise;
  }

  async function getBasemapBuildingSource() {
    const url = String(window.GridWildOsmBasemap?.url?.() || "").trim();
    if (!url) return null;

    if (basemapBuildingSource && basemapBuildingSourceUrl === url) {
      return basemapBuildingSource;
    }

    const { PMTilesCtor } = await ensureBasemapBuildingImports();
    basemapBuildingSourceUrl = url;
    basemapBuildingSource = new PMTilesCtor(url);
    basemapBuildingTileCache.clear();
    basemapBuildingBounds = null;
    basemapPmtilesFeatures = emptyFeatures();
    basemapBuildingFeatures = [];
    basemapBuildingLastFetchKey = null;
    return basemapBuildingSource;
  }

  function rememberBasemapBuildingTile(key, featuresForTile) {
    basemapBuildingTileCache.set(key, featuresForTile);

    while (basemapBuildingTileCache.size > BASEMAP_BUILDING_CACHE_MAX) {
      const oldest = basemapBuildingTileCache.keys().next().value;
      basemapBuildingTileCache.delete(oldest);
    }
  }

  function basemapFeatureGeometry(tile, layer, feature) {
    const extent = Number(feature.extent || layer.extent || 4096);
    if (!Number.isFinite(extent) || extent <= 0) return [];

    return (feature.loadGeometry() || [])
      .map((part) => ({
        clippedToTile: basemapGeometryPartTouchesTileEdge(part, extent),
        points: (part || [])
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((point) => tilePointToLatLng(tile, point, extent))
      }))
      .filter((part) => part.points.length >= 1);
  }

  function basemapGeometryPartTouchesTileEdge(part, extent) {
    const tolerance = Math.max(2, extent * 0.002);

    return (part || []).some((point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        (x <= tolerance || y <= tolerance || x >= extent - tolerance || y >= extent - tolerance)
      );
    });
  }

  function addBasemapFeature(
    out,
    kind,
    tile,
    layerName,
    featureIndex,
    partIndex,
    tags,
    points,
    closed,
    options = {}
  ) {
    if (!out[kind]) return;
    if (kind === "places" ? points.length < 1 : points.length < 2) return;
    if (
      (kind === "buildings" || kind === "parks" || kind === "water") &&
      closed &&
      points.length < 3
    )
      return;

    out[kind].push({
      id: `basemap/${tile.z}/${tile.x}/${tile.y}/${layerName}/${featureIndex}/${partIndex}`,
      tags,
      points,
      closed: !!closed,
      clipped_to_tile: options.clippedToTile === true,
      source: "basemap_pmtiles"
    });
  }

  function roadKindFromBasemapProps(props = {}) {
    const kind = String(props.kind || "");
    const detail = String(props.kind_detail || "");
    const pathDetails = new Set(["path", "footway", "cycleway", "bridleway", "track", "steps"]);

    if (kind === "path" || pathDetails.has(detail)) return "trails";
    if (
      kind === "minor_road" ||
      kind === "major_road" ||
      kind === "highway" ||
      ["residential", "service", "unclassified", "living_street", "road"].includes(detail)
    ) {
      return "roads";
    }

    return null;
  }

  function highwayTagFromBasemapProps(props = {}, kind) {
    const detail = String(props.kind_detail || "");
    const rawKind = String(props.kind || "");
    if (detail) return detail;
    if (kind === "trails") return "path";
    if (rawKind === "highway") return "primary";
    if (rawKind === "major_road") return "secondary";
    if (rawKind === "minor_road") return "residential";
    return "road";
  }

  function basemapNameTagsFromProps(props = {}) {
    const out = {};
    [
      "name",
      "name:en",
      "official_name",
      "short_name",
      "loc_name",
      "alt_name",
      "gnis:feature_name",
      "old_name"
    ].forEach((key) => {
      const value = props[key];
      if (String(value || "").trim()) out[key] = value;
    });
    return out;
  }

  function landuseTagsFromBasemapKind(kind) {
    if (["park", "garden", "nature_reserve", "golf_course", "playground"].includes(kind)) {
      return { leisure: kind };
    }
    if (["protected_area", "national_park"].includes(kind)) return { boundary: kind };
    if (["wood", "wetland", "scrub", "heath", "grassland"].includes(kind)) return { natural: kind };
    if (kind === "forest") return { landuse: "forest" };
    if (kind === "grass") return { landuse: "grass" };
    if (["meadow", "recreation_ground", "allotments", "orchard", "cemetery"].includes(kind)) {
      return { landuse: kind };
    }
    if (kind === "cemetery") return { landuse: "cemetery" };
    return null;
  }

  function waterTagsFromBasemapKind(kind) {
    if (["river", "stream", "canal", "ditch", "drain"].includes(kind)) {
      return { waterway: kind };
    }
    return { natural: "water" };
  }

  function basemapTileFeatures(tile, tileData, decoders) {
    const out = emptyFeatures();
    if (!tileData?.data) return out;

    const vectorTile = new decoders.VectorTileCtor(new decoders.PbfCtor(tileData.data));

    const buildings = vectorTile.layers?.buildings;
    if (buildings?.length) {
      for (let featureIndex = 0; featureIndex < buildings.length; featureIndex++) {
        const feature = buildings.feature(featureIndex);
        const props = feature.properties || {};
        if (!["building", "building_part"].includes(String(props.kind || ""))) continue;

        basemapFeatureGeometry(tile, buildings, feature).forEach((part, partIndex) => {
          addBasemapFeature(
            out,
            "buildings",
            tile,
            "buildings",
            featureIndex,
            partIndex,
            {
              building: props.kind === "building_part" ? "part" : "yes",
              kind: props.kind || "building",
              height: props.height ?? null,
              min_height: props.min_height ?? null
            },
            part.points,
            true,
            { clippedToTile: part.clippedToTile }
          );
        });
      }
    }

    const roads = vectorTile.layers?.roads;
    if (roads?.length) {
      for (let featureIndex = 0; featureIndex < roads.length; featureIndex++) {
        const feature = roads.feature(featureIndex);
        const props = feature.properties || {};
        const kind = roadKindFromBasemapProps(props);
        if (!kind) continue;

        const highway = highwayTagFromBasemapProps(props, kind);
        basemapFeatureGeometry(tile, roads, feature).forEach((part, partIndex) => {
          addBasemapFeature(
            out,
            kind,
            tile,
            "roads",
            featureIndex,
            partIndex,
            {
              highway,
              kind: props.kind || null,
              kind_detail: props.kind_detail || null,
              access: props.access || null,
              service: props.service || null,
              ...basemapNameTagsFromProps(props)
            },
            part.points,
            false,
            { clippedToTile: part.clippedToTile }
          );
        });
      }
    }

    const water = vectorTile.layers?.water;
    if (water?.length) {
      for (let featureIndex = 0; featureIndex < water.length; featureIndex++) {
        const feature = water.feature(featureIndex);
        const props = feature.properties || {};
        const kind = String(props.kind || props.kind_detail || "");
        const closed = feature.type === 3;
        basemapFeatureGeometry(tile, water, feature).forEach((part, partIndex) => {
          addBasemapFeature(
            out,
            "water",
            tile,
            "water",
            featureIndex,
            partIndex,
            {
              ...waterTagsFromBasemapKind(kind),
              kind: kind || null,
              ...basemapNameTagsFromProps(props)
            },
            part.points,
            closed,
            { clippedToTile: part.clippedToTile }
          );
        });
      }
    }

    for (const layerName of ["landuse", "landcover"]) {
      const layer = vectorTile.layers?.[layerName];
      if (!layer?.length) continue;

      for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
        const feature = layer.feature(featureIndex);
        const props = feature.properties || {};
        const kind = String(props.kind || "");
        const tags = landuseTagsFromBasemapKind(kind);
        if (!tags) continue;

        basemapFeatureGeometry(tile, layer, feature).forEach((part, partIndex) => {
          addBasemapFeature(
            out,
            "parks",
            tile,
            layerName,
            featureIndex,
            partIndex,
            { ...tags, kind, ...basemapNameTagsFromProps(props) },
            part.points,
            true,
            { clippedToTile: part.clippedToTile }
          );
        });
      }
    }

    const places = vectorTile.layers?.places;
    if (places?.length) {
      for (let featureIndex = 0; featureIndex < places.length; featureIndex++) {
        const feature = places.feature(featureIndex);
        const props = feature.properties || {};
        const nameTags = basemapNameTagsFromProps(props);
        const name = nameTags.name || nameTags["name:en"] || null;
        if (!name) continue;

        basemapFeatureGeometry(tile, places, feature).forEach((part, partIndex) => {
          addBasemapFeature(
            out,
            "places",
            tile,
            "places",
            featureIndex,
            partIndex,
            {
              place: props.kind || "place",
              kind: props.kind || null,
              ...nameTags
            },
            part.points.slice(0, 1),
            false,
            { clippedToTile: part.clippedToTile }
          );
        });
      }
    }

    return out;
  }

  async function fetchBasemapBuildingTile(source, tile, decoders) {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    if (basemapBuildingTileCache.has(key)) return basemapBuildingTileCache.get(key);

    const tileData = await source.getZxy(tile.z, tile.x, tile.y);
    const featuresForTile = basemapTileFeatures(tile, tileData, decoders);
    rememberBasemapBuildingTile(key, featuresForTile);
    return featuresForTile;
  }

  function scheduleBasemapBuildingFetch(delayMs = FETCH_DEBOUNCE_MS) {
    if (!basemapBuildingOverlayAllowed()) return;
    if (map.getZoom() < MIN_ZOOM) return;

    clearTimeout(basemapBuildingFetchTimer);
    basemapBuildingFetchTimer = setTimeout(
      () => {
        basemapBuildingFetchTimer = null;
        fetchBasemapBuildingsForCurrentView().catch((err) => {
          console.warn("GridWild basemap building overlay unavailable:", err);
        });
      },
      Math.max(0, Number(delayMs) || 0)
    );
  }

  async function fetchBasemapFeaturesForBounds(bounds, options = {}) {
    if (!basemapBuildingOverlayAllowed()) return false;
    if (options.ignoreMinZoom !== true && map.getZoom() < MIN_ZOOM) return false;

    const queryProfile = normalizeQueryProfile(options.profile || currentQueryProfile());
    const queryBounds = normalizeLatLngBounds(bounds);
    const coverageBounds = normalizeLatLngBounds(options.coverageBounds || bounds);
    if (!queryBounds) return false;

    if (coverageBounds && basemapBuildingCoverageReady(coverageBounds)) {
      scheduleRender();
      return false;
    }

    const tiles = basemapBuildingTilesForBounds(queryBounds);
    if (!tiles.length || tiles.length > BASEMAP_BUILDING_MAX_TILES) return false;

    const fetchKey = basemapBuildingFetchKey(tiles);
    const fetchBounds = boundsForTiles(tiles);
    if (fetchKey === basemapBuildingLastFetchKey) return false;
    if (basemapBuildingFetchPromise) {
      if (basemapBuildingFetchCovers(queryBounds)) return basemapBuildingFetchPromise;
      return basemapBuildingFetchPromise.then(() => fetchBasemapFeaturesForBounds(bounds, options));
    }

    basemapBuildingFetchMeta = {
      key: fetchKey,
      bounds: fetchBounds,
      profile: queryProfile
    };
    basemapBuildingFetchPromise = (async () => {
      const source = await getBasemapBuildingSource();
      if (!source) return false;

      const decoders = await ensureBasemapBuildingImports();
      const tileFeatures = await Promise.all(
        tiles.map((tile) => fetchBasemapBuildingTile(source, tile, decoders))
      );
      basemapPmtilesFeatures = tileFeatures.reduce((acc, featureSet) => {
        for (const kind of Object.keys(acc)) {
          acc[kind] = acc[kind].concat(featureSet?.[kind] || []);
        }
        return acc;
      }, emptyFeatures());
      basemapBuildingFeatures = basemapPmtilesFeatures.buildings;
      basemapBuildingBounds = fetchBounds;
      basemapBuildingLastFetchKey = fetchKey;

      if (options.silent !== true) {
        logOsmFeatureCounts("basemap-pmtiles", basemapPmtilesFeatures, {
          profile: queryProfile,
          bounds: basemapBuildingBounds
        });
      }

      publishFeaturesUpdated();
      scheduleRender();
      return true;
    })().finally(() => {
      if (basemapBuildingFetchMeta?.key === fetchKey) basemapBuildingFetchMeta = null;
      basemapBuildingFetchPromise = null;
    });

    return basemapBuildingFetchPromise;
  }

  async function fetchBasemapBuildingsForCurrentView(options = {}) {
    const queryProfile = currentQueryProfile();
    return fetchBasemapFeaturesForBounds(getQueryBoundsForProfile(queryProfile), {
      ...options,
      coverageBounds: getCoverageBoundsForProfile(queryProfile),
      profile: queryProfile
    });
  }

  function hasCachedCoverage(profile = currentQueryProfile(), coverageBounds = null) {
    const requestedBounds = coverageBounds || getCoverageBoundsForProfile(profile);
    return (
      profileCanSatisfyCoverage(profile, cachedFeatureProfile) &&
      boundsContain(cachedFeatureBounds, requestedBounds)
    );
  }

  function hasActiveParksCoverage(bounds, profile = QUERY_PROFILE_PARKS) {
    return (
      (profileCanSatisfyCoverage(profile, cachedFeatureProfile) &&
        boundsContain(cachedFeatureBounds, bounds)) ||
      (profileCanSatisfyCoverage(profile, cachedParksProfile) &&
        boundsContain(cachedParksBounds, bounds))
    );
  }

  function hasParksCoverageForCurrentView() {
    const currentBounds = getCoverageBoundsForProfile(QUERY_PROFILE_PARKS);
    return hasActiveParksCoverage(currentBounds, QUERY_PROFILE_PARKS);
  }

  function featureCounts(featureSet = features) {
    return {
      trails: featureSet.trails.length,
      parks: featureSet.parks.length,
      buildings: featureSet.buildings.length,
      water: featureSet.water.length,
      roads: featureSet.roads.length,
      places: featureSet.places.length
    };
  }

  function formatCountSummary(counts) {
    return Object.entries(counts || {})
      .map(([kind, count]) => `${kind}=${Number(count) || 0}`)
      .join(", ");
  }

  function rawOsmElementCounts(data) {
    const counts = {
      nodes: 0,
      ways: 0,
      relations: 0
    };

    for (const element of data?.elements || []) {
      if (element.type === "node") counts.nodes++;
      else if (element.type === "way") counts.ways++;
      else if (element.type === "relation") counts.relations++;
    }

    return counts;
  }

  function featureElementType(feature) {
    const type = String(feature?.id || "").split("/")[0];
    return type || "unknown";
  }

  function featureSubtype(kind, feature) {
    const tags = feature?.tags || {};

    if (kind === "parks") {
      for (const tag of ["leisure", "boundary", "natural", "landuse", "amenity", "historic"]) {
        if (tags[tag]) return `${tag}=${tags[tag]}`;
      }
    }

    if (kind === "water") {
      if (tags.natural) return `natural=${tags.natural}`;
      if (tags.waterway) return `waterway=${tags.waterway}`;
    }

    if (kind === "trails" || kind === "roads") {
      if (tags.highway) return `highway=${tags.highway}`;
    }

    if (kind === "buildings") {
      return tags.building ? `building=${tags.building}` : "building=*";
    }

    if (kind === "places") {
      if (tags.place) return `place=${tags.place}`;
      if (tags.name) return "named habitat/place node";
    }

    return "other";
  }

  function featureSubtypeRows(featureSet = features) {
    const byKey = new Map();
    const categoryOrder = Object.keys(emptyFeatures());

    for (const category of categoryOrder) {
      for (const feature of featureSet?.[category] || []) {
        const subtype = featureSubtype(category, feature);
        const key = `${category}|${subtype}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            category,
            subtype,
            total: 0,
            nodes: 0,
            ways: 0,
            relations: 0
          });
        }

        const row = byKey.get(key);
        const elementType = featureElementType(feature);
        row.total += 1;
        if (elementType === "node") row.nodes += 1;
        else if (elementType === "way") row.ways += 1;
        else if (elementType === "relation") row.relations += 1;
      }
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const categoryDelta = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      return categoryDelta || b.total - a.total || a.subtype.localeCompare(b.subtype);
    });
  }

  function logOsmSubtypeBreakdown(source, featureSet = features, options = {}) {
    if (window.GridWildVerboseConsole?.enabled?.() !== true) return;
    if (!window.console?.info) return;

    const rows = featureSubtypeRows(featureSet);
    const profile = normalizeQueryProfile(
      options.profile || cachedFeatureProfile || currentQueryProfile()
    );

    if (!rows.length) {
      console.info(`GridWild verbose OSM subtype counts (${profile}/${source}): none`);
      return;
    }

    console.info(`GridWild verbose OSM subtype counts (${profile}/${source})`);
    if (window.console?.table) {
      console.table(rows);
    } else {
      console.info(rows);
    }
  }

  function logOsmFeatureCounts(source, featureSet = features, options = {}) {
    if (!window.console?.info) return;

    const categoryCounts = featureCounts(featureSet);
    const profile = normalizeQueryProfile(
      options.profile || cachedFeatureProfile || currentQueryProfile()
    );
    const rawCounts = options.rawCounts || null;
    const rawSummary = rawCounts ? `; raw ${formatCountSummary(rawCounts)}` : "";

    console.info(
      `GridWild OSM ${source} counts (${profile}): ${formatCountSummary(categoryCounts)}${rawSummary}`,
      {
        source,
        profile,
        categories: categoryCounts,
        rawElements: rawCounts,
        bounds: serializeBounds(options.bounds || cachedFeatureBounds)
      }
    );
    logOsmSubtypeBreakdown(source, featureSet, { ...options, profile });
  }

  function formatCategoryList(categories, options = {}) {
    if (!categories?.length) return "none";
    const prefix = options.prefix || "";
    return categories.map((category) => `${prefix}${category}`).join(", ");
  }

  function getQueryCategoryPlan(profile = currentQueryProfile()) {
    const queryProfile = normalizeQueryProfile(profile);
    const includeDetailCategories = queryProfile === QUERY_PROFILE_DETAIL;
    const detailCategories = ["buildings", "trails/ways", "roads", "place ways"];

    return {
      profile: queryProfile,
      includeBuildings: includeDetailCategories,
      includeTrails: includeDetailCategories,
      includeRoads: includeDetailCategories,
      includePlaceWays: includeDetailCategories,
      included: [
        ...(includeDetailCategories ? detailCategories : []),
        "parks",
        "water",
        "place nodes"
      ],
      excluded: includeDetailCategories ? [] : detailCategories
    };
  }

  function logOsmQueryIssued(profile = currentQueryProfile()) {
    if (!window.console?.info) return;

    const plan = getQueryCategoryPlan(profile);
    console.info(
      `GridWild OSM query issued (${plan.profile}): included ${formatCategoryList(
        plan.included
      )}; excluded ${formatCategoryList(plan.excluded, { prefix: "no " })}`
    );
  }

  function cloneFeatureSetForStorage(featureSet) {
    const next = emptyFeatures();

    for (const kind of Object.keys(next)) {
      next[kind] = (featureSet[kind] || []).map((feature) => ({
        id: feature.id,
        tags: feature.tags || {},
        closed: !!feature.closed,
        points: (feature.points || []).map((point) => ({
          lat: point.lat,
          lng: point.lng
        }))
      }));
    }

    return next;
  }

  function hydrateFeatureSet(raw) {
    const next = emptyFeatures();
    if (!raw || typeof raw !== "object") return next;

    for (const kind of Object.keys(next)) {
      next[kind] = (raw[kind] || [])
        .map((feature) => {
          const points = (feature.points || [])
            .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
            .map((point) => L.latLng(point.lat, point.lng));

          if (points.length < (kind === "places" ? 1 : 2)) return null;

          return {
            id: feature.id,
            tags: feature.tags || {},
            points,
            closed: !!feature.closed
          };
        })
        .filter(Boolean);
    }

    return next;
  }

  function mergeFeatureList(existing = [], incoming = []) {
    const byId = new Map();

    existing.forEach((feature) => {
      if (!feature?.id) return;
      byId.set(feature.id, feature);
    });
    incoming.forEach((feature) => {
      if (!feature?.id) return;
      byId.set(feature.id, feature);
    });

    return Array.from(byId.values());
  }

  function basemapFeatureUsableForHudPolygon(kind, feature) {
    if (feature?.source !== "basemap_pmtiles" || feature.clipped_to_tile !== true) return true;
    return !(kind === "parks" || (kind === "water" && feature.closed !== false));
  }

  function hudBasemapFeatures(kind, options = {}) {
    const rows = basemapPmtilesFeatures[kind] || [];
    if (options.includeClippedBasemapPolygons === true) return rows;
    return rows.filter((feature) => basemapFeatureUsableForHudPolygon(kind, feature));
  }

  function activeBuildingFeatures() {
    return mergeFeatureList(features.buildings || [], basemapBuildingFeatures || []);
  }

  function activeFeatureSet(options = {}) {
    return {
      trails: mergeFeatureList(features.trails || [], hudBasemapFeatures("trails", options)),
      parks: mergeFeatureList(features.parks || [], hudBasemapFeatures("parks", options)),
      buildings: activeBuildingFeatures(),
      water: mergeFeatureList(features.water || [], hudBasemapFeatures("water", options)),
      roads: mergeFeatureList(features.roads || [], hudBasemapFeatures("roads", options)),
      places: mergeFeatureList(features.places || [], hudBasemapFeatures("places", options))
    };
  }

  function mergeParksIntoActiveFeatures(parkFeatureSet) {
    features = {
      trails: features.trails || [],
      parks: mergeFeatureList(features.parks, parkFeatureSet?.parks),
      buildings: features.buildings || [],
      water: features.water || [],
      roads: features.roads || [],
      places: mergeFeatureList(features.places, parkFeatureSet?.places)
    };
  }

  function readLocalCacheEntries() {
    try {
      const raw = window.localStorage?.getItem(LOCAL_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];

      const now = Date.now();
      return parsed.filter(
        (entry) => entry && now - Number(entry.savedAt || 0) < LOCAL_CACHE_TTL_MS
      );
    } catch {
      return [];
    }
  }

  function writeLocalCacheEntries(entries) {
    const trimmed = entries
      .slice()
      .sort(
        (a, b) => Number(b.lastUsedAt || b.savedAt || 0) - Number(a.lastUsedAt || a.savedAt || 0)
      )
      .slice(0, LOCAL_CACHE_MAX_ENTRIES);
    let lastError = null;

    while (trimmed.length) {
      try {
        window.localStorage?.setItem(LOCAL_CACHE_KEY, JSON.stringify(trimmed));
        return;
      } catch (err) {
        lastError = err;
        trimmed.pop();
      }
    }

    try {
      window.localStorage?.removeItem(LOCAL_CACHE_KEY);
    } catch (err) {
      lastError = err;
    }

    if (lastError) {
      console.warn("GridWild OSM local cache write skipped:", lastError);
    }
  }

  function loadLocalCoverageForCurrentView(profile = currentQueryProfile(), coverageBounds = null) {
    const requestedProfile = normalizeQueryProfile(profile);
    const currentBounds = coverageBounds || getCoverageBoundsForProfile(requestedProfile);
    const entries = readLocalCacheEntries();
    const match = entries
      .map((entry, index) => ({
        entry,
        index,
        bounds: deserializeBounds(entry.bounds),
        queryProfile: normalizeQueryProfile(entry.queryProfile)
      }))
      .filter(
        (candidate) =>
          profileCanSatisfyCoverage(requestedProfile, candidate.queryProfile) &&
          boundsContain(candidate.bounds, currentBounds)
      )
      .sort((a, b) => Number(b.entry.savedAt || 0) - Number(a.entry.savedAt || 0))[0];

    if (!match) return false;

    features = hydrateFeatureSet(match.entry.features);
    cachedFeatureBounds = match.bounds;
    cachedFeatureProfile = match.queryProfile;
    cachedParksBounds = match.bounds;
    cachedParksProfile = match.queryProfile;
    lastFetchKey = match.entry.fetchKey || boundsToFetchKey(match.bounds, match.queryProfile);
    entries[match.index] = {
      ...match.entry,
      lastUsedAt: Date.now()
    };
    writeLocalCacheEntries(entries);
    logOsmFeatureCounts("cache", features, {
      profile: match.queryProfile,
      bounds: match.bounds,
      rawCounts: match.entry.rawCounts
    });
    publishFeaturesUpdated();
    scheduleRender();
    return true;
  }

  function loadLocalParksCoverageForBounds(currentBounds = map.getBounds(), options = {}) {
    if (!currentBounds?.isValid?.()) return false;
    const requestedProfile = options.profile ? normalizeQueryProfile(options.profile) : null;
    const entries = readLocalCacheEntries();
    const match = entries
      .map((entry, index) => ({
        entry,
        index,
        bounds: deserializeBounds(entry.bounds),
        queryProfile: normalizeQueryProfile(entry.queryProfile)
      }))
      .filter((candidate) => {
        if (!boundsContain(candidate.bounds, currentBounds)) return false;
        if (!requestedProfile) return true;
        return profileCanSatisfyCoverage(requestedProfile, candidate.queryProfile);
      })
      .sort((a, b) => {
        const aFullFeatureCache = isParksOnlyQueryProfile(a.queryProfile) ? 0 : 1;
        const bFullFeatureCache = isParksOnlyQueryProfile(b.queryProfile) ? 0 : 1;
        if (aFullFeatureCache !== bFullFeatureCache) {
          return bFullFeatureCache - aFullFeatureCache;
        }
        return Number(b.entry.savedAt || 0) - Number(a.entry.savedAt || 0);
      })[0];

    if (!match) return false;

    const hydrated = hydrateFeatureSet(match.entry.features);
    if (isParksOnlyQueryProfile(match.queryProfile)) {
      mergeParksIntoActiveFeatures(hydrated);
      cachedParksBounds = match.bounds;
      cachedParksProfile = match.queryProfile;
    } else {
      features = hydrated;
      cachedFeatureBounds = match.bounds;
      cachedFeatureProfile = match.queryProfile;
      cachedParksBounds = match.bounds;
      cachedParksProfile = match.queryProfile;
    }
    lastFetchKey = match.entry.fetchKey || boundsToFetchKey(match.bounds, match.queryProfile);
    entries[match.index] = {
      ...match.entry,
      lastUsedAt: Date.now()
    };
    writeLocalCacheEntries(entries);
    logOsmFeatureCounts("parks-cache", features, {
      profile: match.queryProfile,
      bounds: match.bounds,
      rawCounts: match.entry.rawCounts
    });
    publishFeaturesUpdated();
    scheduleRender();
    return true;
  }

  function loadLocalParksCoverageForCurrentView() {
    return loadLocalParksCoverageForBounds(map.getBounds());
  }

  function logParksQueryIssued() {
    if (!window.console?.info) return;
    console.info(
      "GridWild OSM query issued (parks): included parks; excluded no buildings, no trails/ways, no roads, no water, no generic places"
    );
  }

  function saveLocalCoverage(
    fetchKey,
    bounds,
    featureSet,
    profile = currentQueryProfile(),
    options = {}
  ) {
    const queryProfile = normalizeQueryProfile(profile);
    const entries = readLocalCacheEntries().filter((entry) => entry.fetchKey !== fetchKey);
    entries.push({
      fetchKey,
      queryProfile,
      bounds: serializeBounds(bounds),
      savedAt: Date.now(),
      lastUsedAt: Date.now(),
      counts: featureCounts(featureSet),
      rawCounts: options.rawCounts || null,
      features: cloneFeatureSetForStorage(featureSet)
    });
    writeLocalCacheEntries(entries);
  }

  function buildCloseDetailOverpassClauses(bbox) {
    // Close-detail clauses are only included at high zoom; their bbox is still envelope-buffered.
    return `
        way["building"](${bbox});
    `;
  }

  function buildTrailWayOverpassClauses(bbox) {
    return `
        way["highway"~"path|footway|cycleway|bridleway|track"](${bbox});
    `;
  }

  function buildRoadOverpassClauses(bbox) {
    return `
        way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street|road"](${bbox});
    `;
  }

  function buildParksOverpassClauses(bbox, options = {}) {
    const broadPatchViewClauses = options.broad
      ? `
        way["leisure"~"common|dog_park|playground|pitch|golf_course"](${bbox});
        node["leisure"~"common|dog_park|playground|pitch|golf_course"]["name"](${bbox});

        way["landuse"~"village_green|greenfield|brownfield|farmland|farmyard|plant_nursery|greenhouse_horticulture|vineyard"](${bbox});
        node["landuse"~"village_green|greenfield|brownfield|farmland|farmyard|plant_nursery|greenhouse_horticulture|vineyard"]["name"](${bbox});

        way["landcover"~"grass|trees|meadow|flowerbed|greenery"](${bbox});
        node["landcover"~"grass|trees|meadow|flowerbed|greenery"]["name"](${bbox});

        way["natural"~"shrubbery|tree_row"](${bbox});
        node["natural"~"shrubbery|tree_row"]["name"](${bbox});

        way["tourism"~"picnic_site|camp_site"](${bbox});
        node["tourism"~"picnic_site|camp_site"]["name"](${bbox});
      `
      : "";

    return `
        way["leisure"~"park|garden|nature_reserve"](${bbox});
        node["leisure"~"park|garden|nature_reserve"]["name"](${bbox});

        way["boundary"~"protected_area|national_park"](${bbox});
        node["boundary"~"protected_area|national_park"]["name"](${bbox});

        way["natural"~"wood|wetland|scrub|heath|grassland"](${bbox});
        node["natural"~"wood|wetland|scrub|heath|grassland"]["name"](${bbox});

        way["landuse"~"forest|grass|meadow|recreation_ground|allotments|orchard|cemetery"](${bbox});
        node["landuse"~"forest|grass|meadow|recreation_ground|allotments|orchard|cemetery"]["name"](${bbox});

        way["amenity"="grave_yard"](${bbox});
        node["amenity"="grave_yard"]["name"](${bbox});

        way["historic"="cemetery"](${bbox});
        node["historic"="cemetery"]["name"](${bbox});

        ${broadPatchViewClauses}
    `;
  }

  function buildParksOverpassQuery(queryBounds = map.getBounds(), options = {}) {
    const bbox = boundsToBboxString(queryBounds);

    return `
      [out:json][timeout:25];
      (
        ${buildParksOverpassClauses(bbox, options)}
      );
      out geom;
    `;
  }

  function buildOverpassQuery(queryBounds = null, profile = currentQueryProfile()) {
    const effectiveBounds = queryBounds || getQueryBoundsForProfile(profile);
    const bbox = boundsToBboxString(effectiveBounds);
    const queryCategories = getQueryCategoryPlan(profile);

    return `
      [out:json][timeout:25];
      (
        ${queryCategories.includeBuildings ? buildCloseDetailOverpassClauses(bbox) : ""}
        ${queryCategories.includeTrails ? buildTrailWayOverpassClauses(bbox) : ""}
        ${queryCategories.includeRoads ? buildRoadOverpassClauses(bbox) : ""}

        ${buildParksOverpassClauses(bbox)}

        way["natural"="water"](${bbox});

        way["waterway"="riverbank"](${bbox});

        way["waterway"~"stream|river|canal|ditch|drain"](${bbox});

        node["place"]["name"](${bbox});
        ${queryCategories.includePlaceWays ? `way["place"]["name"](${bbox});` : ""}
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

  function hasParkLikeTags(tags = {}) {
    return (
      tags.leisure === "park" ||
      tags.leisure === "garden" ||
      tags.leisure === "nature_reserve" ||
      tags.leisure === "common" ||
      tags.leisure === "dog_park" ||
      tags.leisure === "playground" ||
      tags.leisure === "pitch" ||
      tags.leisure === "golf_course" ||
      tags.boundary === "protected_area" ||
      tags.boundary === "national_park" ||
      tags.natural === "wood" ||
      tags.natural === "wetland" ||
      tags.natural === "scrub" ||
      tags.natural === "heath" ||
      tags.natural === "grassland" ||
      tags.natural === "shrubbery" ||
      tags.natural === "tree_row" ||
      tags.landuse === "forest" ||
      tags.landuse === "grass" ||
      tags.landuse === "meadow" ||
      tags.landuse === "recreation_ground" ||
      tags.landuse === "allotments" ||
      tags.landuse === "orchard" ||
      tags.landuse === "cemetery" ||
      tags.landuse === "village_green" ||
      tags.landuse === "greenfield" ||
      tags.landuse === "brownfield" ||
      tags.landuse === "farmland" ||
      tags.landuse === "farmyard" ||
      tags.landuse === "plant_nursery" ||
      tags.landuse === "greenhouse_horticulture" ||
      tags.landuse === "vineyard" ||
      tags.landcover === "grass" ||
      tags.landcover === "trees" ||
      tags.landcover === "meadow" ||
      tags.landcover === "flowerbed" ||
      tags.landcover === "greenery" ||
      tags.amenity === "grave_yard" ||
      tags.historic === "cemetery" ||
      tags.tourism === "picnic_site" ||
      tags.tourism === "camp_site"
    );
  }

  function classifyFeature(el) {
    const tags = el.tags || {};

    if (tags.place && tags.name) return "places";
    if (el.type === "node" && tags.name && hasParkLikeTags(tags)) return "places";

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

    if (hasParkLikeTags(tags)) return "parks";

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
          counts: featureCounts(features)
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

  async function fetchParksForBounds(queryBounds = map.getBounds(), options = {}) {
    if (!queryBounds?.isValid?.()) return false;

    const queryProfile = normalizeQueryProfile(
      options.profile || (options.broad ? QUERY_PROFILE_PATCH_VIEW : QUERY_PROFILE_PARKS)
    );

    if (hasActiveParksCoverage(queryBounds, queryProfile)) {
      scheduleRender();
      return false;
    }

    if (
      options.useCache !== false &&
      loadLocalParksCoverageForBounds(queryBounds, {
        profile: queryProfile === QUERY_PROFILE_PATCH_VIEW ? queryProfile : null
      })
    ) {
      return false;
    }

    const endpoint = overpassEndpoint();
    if (!endpoint) {
      scheduleBasemapBuildingFetch();
      scheduleRender();
      return false;
    }

    if (fetchInFlight) {
      if (inFlightCovers(queryBounds, queryProfile)) return false;
      fetchRequestedWhileInFlight = true;
      return false;
    }

    const now = Date.now();
    if (now < overpassDisabledUntil) return false;
    if (options.ignoreMinZoom !== true && map.getZoom() < MIN_ZOOM) {
      scheduleRender();
      return false;
    }

    const key = boundsToFetchKey(queryBounds, queryProfile);
    if (key === lastFetchKey) return false;

    lastFetchStartedAt = now;
    beginFetchInFlight(key, queryBounds, queryProfile);
    if (options.silent !== true) showFetchToast();

    try {
      logParksQueryIssued();
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          data: buildParksOverpassQuery(queryBounds, {
            broad: queryProfile === QUERY_PROFILE_PATCH_VIEW || options.broad === true
          })
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
      const rawCounts = rawOsmElementCounts(data);
      const parkFeatures = parseFeatures(data);
      mergeParksIntoActiveFeatures(parkFeatures);
      lastFetchKey = key;
      cachedParksBounds = queryBounds;
      cachedParksProfile = queryProfile;
      saveLocalCoverage(key, queryBounds, parkFeatures, queryProfile, { rawCounts });

      logOsmFeatureCounts("parks-fetch", parkFeatures, {
        profile: queryProfile,
        bounds: queryBounds,
        rawCounts
      });
      publishFeaturesUpdated();
      scheduleRender();
      return true;
    } catch (err) {
      console.warn("GridWild OSM parks fetch failed:", err);
      return false;
    } finally {
      endFetchInFlight(key);
      if (fetchRequestedWhileInFlight) {
        fetchRequestedWhileInFlight = false;
        scheduleFetch(fetchDelayForCurrentMotionState());
        scheduleBasemapBuildingFetch(fetchDelayForCurrentMotionState());
      }
    }
  }

  async function fetchParksForCurrentView() {
    if (hasParksCoverageForCurrentView()) {
      scheduleRender();
      return false;
    }

    return await fetchParksForBounds(getParksQueryBoundsForCurrentView(), {
      profile: QUERY_PROFILE_PARKS
    });
  }

  function detailCoverageDelay(options = {}) {
    const requested = Number(options.retryDelayMs);
    if (Number.isFinite(requested)) return Math.max(FETCH_DEBOUNCE_MS, requested);
    return fetchDelayForCurrentMotionState();
  }

  function scheduleDetailCoverage(bounds, options = {}, delayMs = FETCH_DEBOUNCE_MS) {
    const normalized = normalizeLatLngBounds(bounds);
    if (!normalized) return false;

    clearTimeout(detailCoverageTimer);
    detailCoverageTimer = setTimeout(
      () => {
        detailCoverageTimer = null;
        ensureDetailCoverage(normalized, { ...options, scheduled: true });
      },
      Math.max(0, Number(delayMs) || 0)
    );
    return true;
  }

  async function ensureDetailCoverage(bounds, options = {}) {
    if ((window.__gwState?.showOsmFeatures ?? true) === false && options.ignoreVisibility !== true)
      return false;

    const sourceBounds = normalizeLatLngBounds(bounds);
    if (!sourceBounds?.isValid?.()) return false;
    clearTimeout(detailCoverageTimer);
    detailCoverageTimer = null;

    const bufferRatio = Number.isFinite(Number(options.bufferRatio))
      ? Math.max(0, Math.min(DETAIL_QUERY_BOUNDS_PAD_RATIO, Number(options.bufferRatio)))
      : DETAIL_QUERY_BOUNDS_PAD_RATIO;
    const coverageRatio = Number.isFinite(Number(options.coverageBufferRatio))
      ? Math.max(0, Math.min(bufferRatio, Number(options.coverageBufferRatio)))
      : DETAIL_EDGE_REFETCH_PAD_RATIO;
    const queryProfile = QUERY_PROFILE_DETAIL;
    const queryBounds = bufferRatio > 0 ? sourceBounds.pad(bufferRatio) : sourceBounds;
    const coverageBounds = coverageRatio > 0 ? sourceBounds.pad(coverageRatio) : sourceBounds;

    if (hasCachedCoverage(queryProfile, coverageBounds)) {
      scheduleRender();
      return false;
    }

    if (loadLocalCoverageForCurrentView(queryProfile, coverageBounds)) {
      return false;
    }

    const endpoint = overpassEndpoint();
    if (!endpoint) {
      fetchBasemapBuildingsForCurrentView({ silent: true }).catch((err) => {
        console.warn("GridWild basemap building overlay unavailable:", err);
      });
      scheduleRender();
      return false;
    }

    if (fetchInFlight) {
      if (inFlightCovers(coverageBounds, queryProfile)) return false;
      scheduleDetailCoverage(sourceBounds, options, detailCoverageDelay(options));
      return false;
    }

    const now = Date.now();
    if (now < overpassDisabledUntil) return false;

    const minIntervalMs = Number.isFinite(Number(options.minIntervalMs))
      ? Math.max(0, Number(options.minIntervalMs))
      : FETCH_MIN_INTERVAL_MS;
    const sinceLastFetch = now - lastFetchStartedAt;
    if (lastFetchStartedAt && sinceLastFetch < minIntervalMs) {
      scheduleDetailCoverage(sourceBounds, options, minIntervalMs - sinceLastFetch);
      return false;
    }

    if (options.ignoreMinZoom !== true && map.getZoom() < MIN_ZOOM) {
      scheduleRender();
      return false;
    }

    const key = boundsToFetchKey(queryBounds, queryProfile);
    if (key === lastFetchKey) return false;

    lastFetchStartedAt = now;
    beginFetchInFlight(key, queryBounds, queryProfile);
    if (options.silent !== true) showFetchToast();

    try {
      logOsmQueryIssued(queryProfile);
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          data: buildOverpassQuery(queryBounds, queryProfile)
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
      const rawCounts = rawOsmElementCounts(data);
      features = parseFeatures(data);
      lastFetchKey = key;
      cachedFeatureBounds = queryBounds;
      cachedFeatureProfile = queryProfile;
      cachedParksBounds = queryBounds;
      cachedParksProfile = queryProfile;
      saveLocalCoverage(key, queryBounds, features, queryProfile, { rawCounts });

      logOsmFeatureCounts(options.reason ? `fetch/${options.reason}` : "fetch", features, {
        profile: queryProfile,
        bounds: queryBounds,
        rawCounts
      });
      publishFeaturesUpdated();
      scheduleRender();
      return true;
    } catch (err) {
      console.warn("GridWild OSM detail coverage fetch failed:", err);
      return false;
    } finally {
      endFetchInFlight(key);
      if (fetchRequestedWhileInFlight) {
        fetchRequestedWhileInFlight = false;
        scheduleFetch(fetchDelayForCurrentMotionState());
        scheduleBasemapBuildingFetch(fetchDelayForCurrentMotionState());
      }
    }
  }

  async function fetchFeatures() {
    if ((window.__gwState?.showOsmFeatures ?? true) === false) return;
    const queryProfile = currentQueryProfile();
    const coverageBounds = getCoverageBoundsForProfile(queryProfile);
    const queryBounds = getQueryBoundsForProfile(queryProfile);

    if (fetchInFlight) {
      if (inFlightCovers(coverageBounds, queryProfile)) return;
      fetchRequestedWhileInFlight = true;
      return;
    }

    const now = Date.now();
    if (now < overpassDisabledUntil) return;

    if (hasCachedCoverage(queryProfile, coverageBounds)) {
      scheduleRender();
      return;
    }

    if (loadLocalCoverageForCurrentView(queryProfile, coverageBounds)) {
      return;
    }

    const endpoint = overpassEndpoint();
    if (!endpoint) {
      fetchBasemapBuildingsForCurrentView({ silent: true }).catch((err) => {
        console.warn("GridWild basemap building overlay unavailable:", err);
      });
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

    const key = boundsToFetchKey(queryBounds, queryProfile);
    if (key === lastFetchKey) return;

    lastFetchStartedAt = now;
    beginFetchInFlight(key, queryBounds, queryProfile);
    showFetchToast();

    try {
      logOsmQueryIssued(queryProfile);
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          data: buildOverpassQuery(queryBounds, queryProfile)
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
      const rawCounts = rawOsmElementCounts(data);
      features = parseFeatures(data);
      lastFetchKey = key;
      cachedFeatureBounds = queryBounds;
      cachedFeatureProfile = queryProfile;
      cachedParksBounds = queryBounds;
      cachedParksProfile = queryProfile;
      saveLocalCoverage(key, queryBounds, features, queryProfile, { rawCounts });

      logOsmFeatureCounts("fetch", features, {
        profile: queryProfile,
        bounds: queryBounds,
        rawCounts
      });
      publishFeaturesUpdated();
      scheduleRender();
    } catch (err) {
      console.warn("GridWild OSM feature fetch failed:", err);
    } finally {
      endFetchInFlight(key);
      if (fetchRequestedWhileInFlight) {
        fetchRequestedWhileInFlight = false;
        scheduleFetch(fetchDelayForCurrentMotionState());
        scheduleBasemapBuildingFetch(fetchDelayForCurrentMotionState());
      }
    }
  }

  function fetchDelayForCurrentMotionState() {
    const remainingZoomSettleMs = Math.max(0, zoomFetchSettleUntil - Date.now());
    return Math.max(FETCH_DEBOUNCE_MS, remainingZoomSettleMs);
  }

  function handleFetchMapEvent(evt) {
    return timeOsmVerbose("handleFetchMapEvent", () => {
      const zoom = Number(map?.getZoom?.());

      // Wait through the final zoom frames before asking Overpass, especially on zoom-out.
      if (evt?.type === "zoomend" && Number.isFinite(zoom)) {
        const zoomedOut = Number.isFinite(lastFetchScheduleZoom) && zoom < lastFetchScheduleZoom;
        zoomFetchSettleUntil =
          Date.now() + (zoomedOut ? ZOOM_OUT_FETCH_SETTLE_MS : ZOOM_FETCH_SETTLE_MS);
        lastFetchScheduleZoom = zoom;
      } else if (!Number.isFinite(lastFetchScheduleZoom) && Number.isFinite(zoom)) {
        lastFetchScheduleZoom = zoom;
      }

      scheduleFetch(fetchDelayForCurrentMotionState());
      scheduleBasemapBuildingFetch(fetchDelayForCurrentMotionState());
    });
  }

  function scheduleFetch(delayMs = FETCH_DEBOUNCE_MS) {
    const requestedDelay = Number(delayMs);
    const delay = Number.isFinite(requestedDelay) ? requestedDelay : FETCH_DEBOUNCE_MS;

    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchFeatures, Math.max(0, delay));
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
    const active = activeFeatureSet();

    // Habitat polygons: parks, woods, wetlands, gardens, orchards, cemeteries, etc.
    if (showParks) {
      for (const f of active.parks) {
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
      for (const f of active.water) {
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
      for (const f of active.roads) {
        drawLine(contextCtx, f, {
          stroke: "rgba(82, 74, 68, 0.34)",
          lineWidth: 2.0
        });
      }
    }

    // Trails / paths
    if (showTrails) {
      for (const f of active.trails) {
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

    if (currentQueryProfile() !== QUERY_PROFILE_DETAIL) return;
    if (!showBuildings) return;

    if (!basemapBuildingCoverageReady(getCoverageBoundsForProfile(QUERY_PROFILE_DETAIL))) {
      scheduleBasemapBuildingFetch();
    }

    for (const f of activeBuildingFeatures()) {
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
    return timeOsmVerbose("GridWildOsmFeaturesLayer.render", () => {
      raf = null;

      if (zoomGestureInProgress) return;
      if (Date.now() < zoomRenderSettleUntil) {
        scheduleRenderAfterZoomSettle();
        return;
      }

      ensureCanvas();
      resizeCanvas();
      clearCanvases();

      if ((window.__gwState?.showOsmFeatures ?? true) === false) return;
      if (map.getZoom() < MIN_ZOOM) return;

      renderContextLayer();
      renderBuildingLayer();
    });
  }

  function requestOsmFeatureRenderFrame() {
    if (raf) return;
    if (window.GridWildMapMotionQueue?.requestFrame) {
      raf = true;
      window.GridWildMapMotionQueue.requestFrame("osm-features", render);
    } else {
      raf = requestAnimationFrame(render);
    }
  }

  function scheduleRenderAfterZoomSettle() {
    if (zoomGestureInProgress) return;

    const delay = Math.max(0, zoomRenderSettleUntil - Date.now());
    clearTimeout(zoomRenderTimer);
    zoomRenderTimer = setTimeout(() => {
      zoomRenderTimer = null;
      requestOsmFeatureRenderFrame();
    }, delay);
  }

  function handleOsmRenderZoomLifecycle(evt) {
    return timeOsmVerbose("handleOsmRenderZoomLifecycle", () => {
      if (evt?.type === "zoomstart") {
        zoomGestureInProgress = true;
        clearTimeout(zoomRenderTimer);
        zoomRenderTimer = null;
        return;
      }

      if (evt?.type === "zoomend") {
        zoomGestureInProgress = false;
        zoomRenderSettleUntil = Date.now() + ZOOM_RENDER_SETTLE_MS;
        scheduleRenderAfterZoomSettle();
      }
    });
  }

  function scheduleRender(evt) {
    if (evt?.type === "zoom") return;
    if (zoomGestureInProgress || Date.now() < zoomRenderSettleUntil) {
      scheduleRenderAfterZoomSettle();
      return;
    }

    if (evt?.type === "move" && window.GridWildCanvasPerf?.canvasCoversViewport?.(contextLayout)) {
      return;
    }

    requestOsmFeatureRenderFrame();
  }

  window.GridWildOsmFeaturesLayer = {
    render,
    scheduleRender,
    fetchFeatures,
    ensureDetailCoverage,
    fetchParksForBounds,
    fetchParksForCurrentView,
    fetchBasemapFeaturesForBounds,
    fetchBasemapFeaturesForCurrentView: fetchBasemapBuildingsForCurrentView,
    fetchBasemapBuildingsForCurrentView,
    scheduleFetch,

    setVisible(show) {
      window.__gwState = window.__gwState || {};
      window.__gwState.showOsmFeatures = !!show;
      window.__gwState.showOsmBuildings = !!show;

      clearTimeout(fetchTimer);
      clearTimeout(basemapBuildingFetchTimer);

      if (!show) {
        if (contextCanvas) contextCanvas.style.display = "none";
        if (buildingCanvas) buildingCanvas.style.display = "none";

        scheduleRender();
        return;
      }

      if (contextCanvas) contextCanvas.style.display = "block";
      if (buildingCanvas) buildingCanvas.style.display = "block";

      scheduleFetch();
      scheduleBasemapBuildingFetch();
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
      if (kind === "buildings" && show) scheduleBasemapBuildingFetch();
      scheduleRender();
    },

    getFeatures(options = {}) {
      const includeCloseDetail =
        options.includeDetail === true || currentQueryProfile() === QUERY_PROFILE_DETAIL;
      const active = activeFeatureSet({
        includeClippedBasemapPolygons: options.includeClippedBasemapPolygons === true
      });
      return {
        trails: active.trails,
        parks: active.parks,
        buildings: includeCloseDetail ? activeBuildingFeatures() : [],
        water: active.water,
        roads: active.roads,
        places: active.places
      };
    },

    getVersion() {
      return featuresVersion;
    },

    getCacheStatus() {
      const bounds = cachedFeatureBounds;
      const queryProfile = currentQueryProfile();
      const coverageBounds = getCoverageBoundsForProfile(queryProfile);
      return {
        hasCoverage: hasCachedCoverage(queryProfile, coverageBounds),
        queryProfile,
        cachedFeatureProfile,
        cachedParksProfile,
        cachedParksBounds: cachedParksBounds
          ? {
              south: cachedParksBounds.getSouth(),
              west: cachedParksBounds.getWest(),
              north: cachedParksBounds.getNorth(),
              east: cachedParksBounds.getEast()
            }
          : null,
        fetchInFlight,
        fetchInFlightProfile: fetchInFlightMeta?.profile || null,
        detailCoverageQueued: Boolean(detailCoverageTimer),
        fetchInFlightBounds: fetchInFlightMeta?.bounds
          ? {
              south: fetchInFlightMeta.bounds.getSouth(),
              west: fetchInFlightMeta.bounds.getWest(),
              north: fetchInFlightMeta.bounds.getNorth(),
              east: fetchInFlightMeta.bounds.getEast()
            }
          : null,
        overpassCooldownMs: Math.max(0, overpassDisabledUntil - Date.now()),
        basemapPmtiles: {
          counts: featureCounts(basemapPmtilesFeatures),
          count: basemapBuildingFeatures.length,
          fetchInFlight: Boolean(basemapBuildingFetchPromise),
          sourceUrl: basemapBuildingSourceUrl,
          tileCacheSize: basemapBuildingTileCache.size,
          coverageBounds: basemapBuildingBounds
            ? {
                south: basemapBuildingBounds.getSouth(),
                west: basemapBuildingBounds.getWest(),
                north: basemapBuildingBounds.getNorth(),
                east: basemapBuildingBounds.getEast()
              }
            : null
        },
        coverageBounds: coverageBounds
          ? {
              south: coverageBounds.getSouth(),
              west: coverageBounds.getWest(),
              north: coverageBounds.getNorth(),
              east: coverageBounds.getEast()
            }
          : null,
        bounds: bounds
          ? {
              south: bounds.getSouth(),
              west: bounds.getWest(),
              north: bounds.getNorth(),
              east: bounds.getEast()
            }
          : null,
        counts: featureCounts(activeFeatureSet()),
        localCacheEntries: readLocalCacheEntries().length
      };
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    scheduleFetch();
    scheduleBasemapBuildingFetch();
    scheduleRender();
  });
})();
