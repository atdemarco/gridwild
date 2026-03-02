async function fetchINatObservationsNearCenter() {
  const c = map.getCenter();
  const lat = c.lat;
  const lng = c.lng;
  console.log(`Beginning iNat query...`);

	const INAT_MAX_RESULTS = 200;
	// 0.05 km = 50 meters
	const INAT_RADIUS_KM = 0.05;

	const iNatLayer = L.layerGroup().addTo(map);

	// Optional: style knobs
	const INAT_POINT_RADIUS = 4;
	const INAT_POINT_OPACITY = 0.9;


	// How many obs to fetch (iNat caps per_page; 200 is typical max)
	const INAT_PER_PAGE = 200;



  // Build base URL (without page param yet)
  const baseUrl = new URL("https://api.inaturalist.org/v1/observations");
  baseUrl.searchParams.set("lat", lat.toString());
  baseUrl.searchParams.set("lng", lng.toString());
  baseUrl.searchParams.set("radius", INAT_RADIUS_KM.toString()); // km
  baseUrl.searchParams.set("per_page", INAT_PER_PAGE.toString());
  baseUrl.searchParams.set("order_by", "created_at");
  baseUrl.searchParams.set("order", "desc");
  baseUrl.searchParams.set("geo", "true");

  let allResults = [];
  let page = 1;

  // ─────────────────────────────────────────────────────────────
  // Paging loop
  // ─────────────────────────────────────────────────────────────
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
  iNatLayer.clearLayers();

  // Plot scatter
  for (const obs of allResults) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const oLng = coords[0];
    const oLat = coords[1];

    const marker = L.circleMarker([oLat, oLng], {
      radius: INAT_POINT_RADIUS,
      stroke: false,
      fill: true,
      fillOpacity: INAT_POINT_OPACITY
    });

    const taxon = obs?.taxon?.name ?? "Unknown taxon";
    const when = obs?.observed_on ?? obs?.time_observed_at ?? "Unknown date";
    marker.bindPopup(`<b>${taxon}</b><br/>${when}`);

    marker.addTo(iNatLayer);
  }

  // Update grid heat
  if (typeof window.updateGridHeatmap === "function") {
    window.updateGridHeatmap(allResults);
  } else {
    window.__inatLastResults = allResults;
  }
}