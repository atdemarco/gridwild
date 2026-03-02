	// ─────────────────────────────────────────────────────────────
	// 100x100 ft grid overlay (backdrop for future heatmap)
	// Uses EPSG:3857 meters via map.project/unproject
	// ─────────────────────────────────────────────────────────────

	// Put grid above tiles but below markers (tune zIndex as you like)
	map.createPane("gridPane");
	map.getPane("gridPane").style.zIndex = 420;
	map.getPane("gridPane").style.pointerEvents = "none";

	// Grid layer container
	const gridLayer = L.layerGroup([], { pane: "gridPane" }).addTo(map);

	// 100 ft in meters
	const GRID_SIZE_M = 50 * 0.3048;

	// Optional: style
	const GRID_LINE_STYLE = {
	  pane: "gridPane",
	  interactive: false,
	  weight: 1,
	  opacity: 0.35
	  // color: "#000"   // uncomment if you want to force a color
	};

	// How far beyond the viewport to draw (avoids edge gaps)
	const GRID_PAD_PX = 200;

	// Snap helper
	function snapDown(x, step) {
	  return Math.floor(x / step) * step;
	}
	function snapUp(x, step) {
	  return Math.ceil(x / step) * step;
	}

	function updateGrid() {
	  gridLayer.clearLayers();

	  const z = map.getZoom();
	  // If you want to hide grid when zoomed out:
	  // if (z < 16) return;

	  // Expand bounds a bit so lines don't pop at edges
	  const b = map.getBounds();
	  const nw = map.project(b.getNorthWest(), z);
	  const se = map.project(b.getSouthEast(), z);

	  const paddedNW = L.point(nw.x - GRID_PAD_PX, nw.y - GRID_PAD_PX);
	  const paddedSE = L.point(se.x + GRID_PAD_PX, se.y + GRID_PAD_PX);

	  // Convert padded pixel points back to latlng, then to projected meters
	  const llNW = map.unproject(paddedNW, z);
	  const llSE = map.unproject(paddedSE, z);

	  const pNWm = map.options.crs.project(llNW); // meters in EPSG:3857-ish units
	  const pSEm = map.options.crs.project(llSE);

	  const minX = Math.min(pNWm.x, pSEm.x);
	  const maxX = Math.max(pNWm.x, pSEm.x);
	  const minY = Math.min(pNWm.y, pSEm.y);
	  const maxY = Math.max(pNWm.y, pSEm.y);

	  // Snap to grid
	  const startX = snapDown(minX, GRID_SIZE_M);
	  const endX   = snapUp(maxX, GRID_SIZE_M);
	  const startY = snapDown(minY, GRID_SIZE_M);
	  const endY   = snapUp(maxY, GRID_SIZE_M);

	  // Vertical grid lines (constant X)
	  for (let x = startX; x <= endX; x += GRID_SIZE_M) {
		const a = map.options.crs.unproject(L.point(x, startY));
		const b = map.options.crs.unproject(L.point(x, endY));
		L.polyline([a, b], GRID_LINE_STYLE).addTo(gridLayer);
	  }

	  // Horizontal grid lines (constant Y)
	  for (let y = startY; y <= endY; y += GRID_SIZE_M) {
		const a = map.options.crs.unproject(L.point(startX, y));
		const b = map.options.crs.unproject(L.point(endX, y));
		L.polyline([a, b], GRID_LINE_STYLE).addTo(gridLayer);
	  }
	}

	// Update on map changes
	map.on("moveend zoomend resize", updateGrid);
	updateGrid();