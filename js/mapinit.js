    // Map init
  window.map = L.map("map", {
     zoomControl: true,
     attributionControl: true
  });
  const map = window.map; // local alias

    // Global GridWild state // yikes -- 3/8/26 
window.__gwState = {
  lockToLocation: true,
  showPoints: false, // off by default...
  showHeat: true,
  showFog: true,
  showShimmer: false,
  dynamicINatEnabled: false,   // OFF by default
  dynamicOSMEnabled: false,    // OFF by default
  logHeat: true,
  heatMetric: "count",   // "count" | "species" | "observers"

  lastUserCellKey: null,
  lastLoadedChunkKey: null,
  lastDynamicFetchCellKey: null,

  staticChunkSizeM: 1024,       // adjust later
  dynamicFetchCellRadius: 1,    // optional concept if you want neighborhood logic

  // New grid / zoom behavior
  centerMacroRadiusCells: 1,      // radius 1 => 3x3 center block
  stickyZoomEnabled: false,
  stickyZoomTolerance: 0.2,      // snap if released near target
  outsideViewZoomOffset: -1.25,   // optional "bigger view" when not stuck
  stickyZoomAnimating: false,
  godsEyeEnabled: false,
  lastGodsEyeCenterKey: null,

  showOsmFeatures: true,
  showOsmTrails: true,
  showOsmParks: true,
  showOsmBuildings: true,
  showOsmWater: true,
};

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO'
  }
  ).addTo(map);


    // Default view (in case location fails)
    //map.setView([38.9072, -77.0369], 17); // DC fallback
    map.setView([38.911325, -77.076678], 19); // GEORGETOWN POLLINATOR GARDEN HOME!

    const hud = document.getElementById("status");

    // User location marker + accuracy circle
    let userMarker = null;
    let accuracyCircle = null;