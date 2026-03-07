async function fetchINatObservationsNearCenter() {
	
	const c = map.getCenter();
	const lat = c.lat;
	const lng = c.lng;
	console.log(`Beginning iNat query...`);

	const INAT_MAX_RESULTS = 200; // 1000;
	const INAT_RADIUS_KM = 0.03; // 0.05 km = 50 meters

 // ─────────────────────────────────────────────────────────────
// iNat points layer (global so UI can toggle it)
// ─────────────────────────────────────────────────────────────
window.iNatLayer = window.iNatLayer || L.layerGroup().addTo(map);

// Subtle category palette (unobtrusive)
const ICONIC_STYLE = {
  Insecta:          { fillColor: "#d08b1e", fillOpacity: 0.85 },
  Plantae:          { fillColor: "#2c8a4a", fillOpacity: 0.85 },
  Fungi:            { fillColor: "#7a4bb3", fillOpacity: 0.85 },
  Mammalia:         { fillColor: "#7a5a3a", fillOpacity: 0.85 },
  Aves:             { fillColor: "#1c8a8a", fillOpacity: 0.85 },
  Reptilia:         { fillColor: "#5b7a2a", fillOpacity: 0.85 },
  Amphibia:         { fillColor: "#2a7a66", fillOpacity: 0.85 },
  Actinopterygii:   { fillColor: "#2f6fb3", fillOpacity: 0.85 },
  Mollusca:         { fillColor: "#8a6d4a", fillOpacity: 0.85 },
  Arachnida:        { fillColor: "#6b5b5b", fillOpacity: 0.85 },
  Unknown:          { fillColor: "#666666", fillOpacity: 0.75 }
};

function styleForObs(obs) {
  const iconic = obs?.taxon?.iconic_taxon_name || "Unknown";
  const s = ICONIC_STYLE[iconic] || ICONIC_STYLE.Unknown;

  // Keep markers small + quiet
  return {
    radius: 4,
    stroke: false,
    fill: true,
    ...s
  };
}
  // ─────────────────────────────────────────────────────────────
// END iNat points layer (global so UI can toggle it)
// ─────────────────────────────────────────────────────────────

	// Optional: style knobs
	const INAT_POINT_RADIUS = 4;
	const INAT_POINT_OPACITY = 0.9;

	const INAT_PER_PAGE = 200; // How many obs to fetch (iNat caps per_page; 200 is typical max)


  // Build base URL (without page param yet)
  const baseUrl = new URL("https://api.inaturalist.org/v1/observations");
  baseUrl.searchParams.set("lat", lat.toString());
  baseUrl.searchParams.set("lng", lng.toString());
  baseUrl.searchParams.set("radius", INAT_RADIUS_KM.toString()); // km
  baseUrl.searchParams.set("per_page", INAT_PER_PAGE.toString());
  baseUrl.searchParams.set("order_by", "created_at");
  baseUrl.searchParams.set("order", "desc");
  baseUrl.searchParams.set("geo", "true");

  // ─────────────────────────────────────────────────────────────
  // Apply filters from sidebar (iconic_taxa)
  // ─────────────────────────────────────────────────────────────
  const iconicTaxa = window.__gwFilters?.iconicTaxa || [];
  if (Array.isArray(iconicTaxa) && iconicTaxa.length > 0) {
    // iNat accepts iconic_taxa; pass as comma-separated
    baseUrl.searchParams.set("iconic_taxa", iconicTaxa.join(","));
  }
  // ─────────────────────────────────────────────────────────────
  // END Apply filters from sidebar (iconic_taxa)
  // ─────────────────────────────────────────────────────────────



  let allResults = [];
  let page = 1;
  
  
  // Paging loop
  while (allResults.length < INAT_MAX_RESULTS) {

    const url = new URL(baseUrl.toString());
    url.searchParams.set("page", page.toString());

    let data;

    try {
      const resp = await fetch(url.toString(), { method: "GET" });
      if (!resp.ok) throw new Error(`iNat HTTP ${resp.status}`);
      data = await resp.json();
    } catch (err) {
      console.error(`iNat fetch failed on page ${page}:`, err);
      break;
    }

    const pageResults = Array.isArray(data?.results) ? data.results : [];

    if (pageResults.length === 0) break;

    // Respect max cap
    const remaining = INAT_MAX_RESULTS - allResults.length;
    allResults.push(...pageResults.slice(0, remaining));

    console.log(
      `Fetched page ${page} (${pageResults.length} results) — total so far: ${allResults.length}`
    );

    // Stop if this page wasn't full (no more pages available)
    if (pageResults.length < INAT_PER_PAGE) break;

    page += 1;

    // Hard safety break
    if (page > 50) break;
  }

  console.log(
    `iNat: ${allResults.length} observations (max ${INAT_MAX_RESULTS}) within ${INAT_RADIUS_KM} km of center - lat=${lat.toFixed(
      6
    )} lon=${lng.toFixed(6)}`
  );

  // Clear prior points 
  window.iNatLayer.clearLayers();
  
  // // Plot scatter
  // for (const obs of allResults) {
  //   const coords = obs?.geojson?.coordinates;
  //   if (!Array.isArray(coords) || coords.length < 2) continue;

  //   const oLng = coords[0];
  //   const oLat = coords[1];

  //   const marker = L.circleMarker([oLat, oLng], {
  //     radius: INAT_POINT_RADIUS,
  //     stroke: false,
  //     fill: true,
  //     fillOpacity: INAT_POINT_OPACITY
  //   });

  //   const taxon = obs?.taxon?.name ?? "Unknown taxon";
  //   const when = obs?.observed_on ?? obs?.time_observed_at ?? "Unknown date";
  //   marker.bindPopup(`<b>${taxon}</b><br/>${when}`);

  //   marker.addTo(iNatLayer);
  // }

    // NEW Plot scatter
  for (const obs of allResults) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const oLng = coords[0];
    const oLat = coords[1];

    const marker = L.circleMarker([oLat, oLng], styleForObs(obs));

    const taxon = obs?.taxon?.name ?? "Unknown taxon";
    const iconic = obs?.taxon?.iconic_taxon_name ?? "Unknown";
    const when = obs?.observed_on ?? obs?.time_observed_at ?? "Unknown date";
    marker.bindPopup(`<b>${taxon}</b><br/>${iconic}<br/>${when}`);

    marker.addTo(window.iNatLayer);
  }
  // END NEW PLOT SCATTER

  // Update grid heat
  if (typeof window.updateGridHeatmap === "function") {
    window.updateGridHeatmap(allResults);
  } else {
    window.__inatLastResults = allResults;
  }
}