// OSM Vector Overlay (roads + buildings) via Overpass API
// Renders outlines only, in a dedicated pane above the grid.

// Pane above your grid panes (gridHeat=415, gridLines=420)
map.createPane("osmVectorPane");
map.getPane("osmVectorPane").style.zIndex = 430;
// If you don't want the vectors to intercept clicks:
map.getPane("osmVectorPane").style.pointerEvents = "none";

// Single persistent GeoJSON layer (IMPORTANT: reuse, don't recreate)
const osmVectorLayer = L.geoJSON(null, {
  pane: "osmVectorPane",
  interactive: false,
  style: (feature) => {
    const tags = feature?.properties?.tags || {};

    // Roads
    if (tags.highway) {
      return {
        weight: 2,
        opacity: 0.65
        // color left default by Leaflet; uncomment to force:
        // color: "#111"
      };
    }

    // Buildings / structures (outline only)
    if (tags.building) {
      return {
        weight: 1,
        opacity: 0.55,
        fill: false
        // color: "#111"
      };
    }

    return { weight: 1, opacity: 0.4 };
  }
}).addTo(map);

// Abort in-flight Overpass call on pan/zoom
let osmAbortController = null;

// Small debounce so you don’t hammer Overpass while moving
let __osmTimer = null;

// Public function you can call from anywhere
window.scheduleOSMVectorOverlayUpdate = function () {
  if (__osmTimer) clearTimeout(__osmTimer);
  __osmTimer = setTimeout(fetchOSMVectorOverlayInView, 250);
};

async function fetchOSMVectorOverlayInView() {
  // Cancel prior request if still running
  if (osmAbortController) osmAbortController.abort();
  osmAbortController = new AbortController();

  const b = map.getBounds();
  const south = b.getSouth();
  const west  = b.getWest();
  const north = b.getNorth();
  const east  = b.getEast();

  // Overpass QL: roads + buildings in current viewport bbox
  // NOTE: bbox order is (south,west,north,east)
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](${south},${west},${north},${east});
      way["building"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
      signal: osmAbortController.signal
    });
    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

    const osmJson = await resp.json();

    // Convert OSM JSON -> GeoJSON (via osmtogeojson)
    const geojson = osmtogeojson(osmJson);

    // Replace overlay contents
    osmVectorLayer.clearLayers();
    osmVectorLayer.addData(geojson);

    // Optional debug
    console.log(
      `OSM overlay: rendered ${geojson?.features?.length || 0} features (roads+buildings)`
    );
  } catch (err) {
    // Abort is expected during panning
    if (err?.name === "AbortError") return;
    console.warn("OSM overlay fetch failed:", err);
  }
}

// Auto-update on map interactions
map.on("moveend zoomend", window.scheduleOSMVectorOverlayUpdate);