	// ─────────────────────────────────────────────────────────────
	// Fog-of-war overlay (pixel-based clear window, viewport-centered)
	// Clear window stays a fixed fraction of the screen on pan/zoom/resize
	// ─────────────────────────────────────────────────────────────

	// Put fog above tiles but below markers/popups
	map.createPane("fogPane");
	map.getPane("fogPane").style.zIndex = 450;
	map.getPane("fogPane").style.pointerEvents = "none";

	// World-sized outer ring (big rectangle covering the world)
	const FOG_WORLD_RING = [ [ 85, -180], [ 85,  180], [-85,  180], [-85, -180]];

	// Clear window as a fraction of the current map container (0..1)
	const FOG_CLEAR_FRACTION_W = 0.60;  // 60% of map width is clear
	const FOG_CLEAR_FRACTION_H = 0.60;  // 60% of map height is clear

	let fogLayer = null;

	function ringFromLatLngBounds(bounds) {
	  const sw = bounds.getSouthWest();
	  const ne = bounds.getNorthEast();
	  const nw = L.latLng(ne.lat, sw.lng);
	  const se = L.latLng(sw.lat, ne.lng);

	  // Ring order: NW -> NE -> SE -> SW
	  return [ [nw.lat, nw.lng], [ne.lat, ne.lng],[se.lat, se.lng],[sw.lat, sw.lng] ]
	}

	function updateFog() {
	  const size = map.getSize();
	  const cx = size.x / 2;
	  const cy = size.y / 2;

	  const halfW = (size.x * FOG_CLEAR_FRACTION_W) / 2;
	  const halfH = (size.y * FOG_CLEAR_FRACTION_H) / 2;

	  // Pixel-space clear rect in container coordinates
	  const pNW = L.point(cx - halfW, cy - halfH);
	  const pSE = L.point(cx + halfW, cy + halfH);

	  // Convert to lat/lng bounds (viewport-centered, fixed screen fraction)
	  const llNW = map.containerPointToLatLng(pNW);
	  const llSE = map.containerPointToLatLng(pSE);

	  const clearBounds = L.latLngBounds(llNW, llSE);
	  if (!clearBounds.isValid()) return;

	  const clearRing = ringFromLatLngBounds(clearBounds);

	  // Polygon with a hole: [outerRing, innerRing]
	  const latlngs = [FOG_WORLD_RING, clearRing];

	  if (!fogLayer) {
		fogLayer = L.polygon(latlngs, {
		  pane: "fogPane",
		  stroke: false,
		  fill: true,
		  fillColor: "#6b6f76",
		  fillOpacity: 0.55,
		  interactive: false
		}).addTo(map);
	  } else {
		fogLayer.setLatLngs(latlngs);
	  }
	}

	map.on("move zoom resize moveend zoomend", updateFog);
	updateFog();