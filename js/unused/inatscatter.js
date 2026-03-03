// ─────────────────────────────────────────────────────────────
// Building-aware iNat plotting helpers
// ─────────────────────────────────────────────────────────────

function __pointInPolygon_layer(ptLatLng, polyLatLngs) {
  // Ray casting in layer-pixel space (stable for small areas)
  const pt = map.latLngToLayerPoint(ptLatLng);
  const vs = polyLatLngs.map((ll) => map.latLngToLayerPoint(ll));

  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;

    const intersect =
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

function __closestPointOnSegment(p, a, b) {
  // p,a,b are L.Point in layer pixels
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
  return L.point(a.x + t * abx, a.y + t * aby);
}

function __nudgePointOutsidePolygon(ptLatLng, polyLatLngs, pushPx = 6) {
  const p = map.latLngToLayerPoint(ptLatLng);
  const vs = polyLatLngs.map((ll) => map.latLngToLayerPoint(ll));
  if (vs.length < 3) return ptLatLng;

  let bestQ = null;
  let bestD2 = Infinity;

  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    const b = vs[(i + 1) % vs.length];
    const q = __closestPointOnSegment(p, a, b);
    const dx = p.x - q.x, dy = p.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestQ = q;
    }
  }

  if (!bestQ) return ptLatLng;

  // Push away from boundary along outward vector
  let vx = p.x - bestQ.x;
  let vy = p.y - bestQ.y;

  const mag = Math.hypot(vx, vy);
  if (mag < 1e-6) {
    vx = 1;
    vy = 0;
  } else {
    vx /= mag;
    vy /= mag;
  }

  const p2 = L.point(bestQ.x + vx * pushPx, bestQ.y + vy * pushPx);
  return map.layerPointToLatLng(p2);
}

function __adjustIfInsideAnyBuilding(latlng) {
  const polys = Array.isArray(window.__osmBuildingPolys) ? window.__osmBuildingPolys : [];
  if (!polys.length) return { latlng, moved: false };

  for (const b of polys) {
    if (!b?.bounds?.contains || !b.bounds.contains(latlng)) continue;
    if (__pointInPolygon_layer(latlng, b.latlngs)) {
      const movedLL = __nudgePointOutsidePolygon(latlng, b.latlngs, 7);
      return { latlng: movedLL, moved: true };
    }
  }
  return { latlng, moved: false };
}


async function fetchINatObservationsNearCenter() {
	
	  
  const c = map.getCenter();
  const lat = c.lat;
  const lng = c.lng;
  console.log(`Beginning iNat query...`);

	// iNat request cancellation + "latest request wins"
	let inatAbortController = null;
	let inatRequestSeq = 0; // increments each time we start a new fetch

	const INAT_MAX_RESULTS = 200;
	const INAT_RADIUS_KM = 0.05; // 0.05 km = 50 meters
	const iNatLayer = L.layerGroup().addTo(map);

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

  // Ensure we have up-to-date building footprints (used to keep dots off buildings)
  if (typeof window.ensureOSMBuildings === "function") {
    await window.ensureOSMBuildings();
  }

  // Plot scatter
  for (const obs of allResults) {
    const coords = obs?.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const oLng = coords[0];
    const oLat = coords[1];

    const adj = __adjustIfInsideAnyBuilding(L.latLng(oLat, oLng));
    const marker = L.circleMarker(adj.latlng, {
      radius: INAT_POINT_RADIUS,
      stroke: false,
      fill: true,
      fillOpacity: INAT_POINT_OPACITY
    });

    const taxon = obs?.taxon?.name ?? "Unknown taxon";
    const when = obs?.observed_on ?? obs?.time_observed_at ?? "Unknown date";
    const movedNote = adj.moved ? `<br/><i>Moved off building footprint</i>` : "";
    marker.bindPopup(`<b>${taxon}</b><br/>${when}${movedNote}`);

    marker.addTo(iNatLayer);
  }

  // Update grid heat
  if (typeof window.updateGridHeatmap === "function") {
    window.updateGridHeatmap(allResults);
  } else {
    window.__inatLastResults = allResults;
  }
}