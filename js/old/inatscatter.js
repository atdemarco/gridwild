	// ─────────────────────────────────────────────────────────────
	// On page load: query iNaturalist near map center and plot points
	// ─────────────────────────────────────────────────────────────
	
	const iNatLayer = L.layerGroup().addTo(map);

	// Optional: style knobs
	const INAT_POINT_RADIUS = 4;
	const INAT_POINT_OPACITY = 0.9;

	// 0.1km = 100 meters
	const INAT_RADIUS_KM = 0.05; // originally .05

	// How many obs to fetch (iNat caps per_page; 200 is typical max)
	const INAT_PER_PAGE = 200;

	async function fetchINatObservationsNearCenter() {
	  const c = map.getCenter();
	  const lat = c.lat;
	  const lng = c.lng;
	  console.log(`Beginning iNat query...`);


	  // Build iNaturalist API URL
	  const url = new URL("https://api.inaturalist.org/v1/observations");
	  url.searchParams.set("lat", lat.toString());
	  url.searchParams.set("lng", lng.toString());
	  url.searchParams.set("radius", INAT_RADIUS_KM.toString());     // km
	  url.searchParams.set("per_page", INAT_PER_PAGE.toString());
	  url.searchParams.set("order_by", "created_at");
	  url.searchParams.set("order", "desc");
	  url.searchParams.set("geo", "true"); // ensure georeferenced results

	  // If you want only "research grade", uncomment:
	  // url.searchParams.set("quality_grade", "research");

	  let data;
	  try {
		const resp = await fetch(url.toString(), { method: "GET" });
		if (!resp.ok) throw new Error(`iNat HTTP ${resp.status}`);
		data = await resp.json();
	  } catch (err) {
		console.error("iNat fetch failed:", err);
		return;
	  }

	  const results = Array.isArray(data?.results) ? data.results : [];
	  console.log(`iNat: ${results.length} observations within ${INAT_RADIUS_KM} km of center - lat= ${lat.toFixed(6)} long= ${lng.toFixed(6)}`);

	  // Clear prior points
	  iNatLayer.clearLayers();

	  // Plot as a scatter of circle markers
	  for (const obs of results) {
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

		// Optional popup
		const taxon = obs?.taxon?.name ?? "Unknown taxon";
		const when = obs?.observed_on ?? obs?.time_observed_at ?? "Unknown date";
		marker.bindPopup(`<b>${taxon}</b><br/>${when}`);

		marker.addTo(iNatLayer);
	  }
	}

	// Fire once when the page finishes loading
	window.addEventListener("DOMContentLoaded", () => {
	  // fetchINatObservationsNearCenter(); // version 1 this is the way we listened to fetch inat observations
	});
