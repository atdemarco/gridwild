// -----------------------------------------------------------------------------
// GridWild Campaign Designer
// Fullscreen desktop-first campaign creation / planning UI
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_campaigns_v1";

  let designerRoot = null;
  let activeTool = "select";
  let selectedLayer = null;

  let draft = makeEmptyCampaign();

  let layers = {
    boundary: null,
    paths: null,
    exclusions: null,
    denseZones: null,
    assets: null,
    taxonHeat: null
  };

    
    let designerMap = null;
    let designerMapLayers = null;
    let drawingPoints = [];
    let vertexHandles = [];
    let contextMenuEl = null;


let undoStack = [];
let redoStack = [];

function cloneDraft(obj = draft) {
  return JSON.parse(JSON.stringify(obj));
}

function pushUndoState() {
  syncDraftFromForm?.();
  undoStack.push(cloneDraft(draft));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function restoreDraft(snapshot) {
  draft = cloneDraft(snapshot);
  drawingPoints = [];
  selectedLayer = null;
  redrawCampaignDraft();
  refreshFormFromDraft();
  refreshRightPanel();
  updateUndoRedoButtons();
}

function undoDesignerAction() {
  if (!undoStack.length) return;
  redoStack.push(cloneDraft(draft));
  restoreDraft(undoStack.pop());
}

function redoDesignerAction() {
  if (!redoStack.length) return;
  undoStack.push(cloneDraft(draft));
  restoreDraft(redoStack.pop());
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("gwCdUndo");
  const redoBtn = document.getElementById("gwCdRedo");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function refreshFormFromDraft() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setVal("gwCdName", draft.name);
  setVal("gwCdDescription", draft.description);
  setVal("gwCdTimeRange", draft.timeRange);
  setVal("gwCdTargetTaxon", draft.targetTaxon);
  setVal("gwCdPublicMode", draft.publicMode);
}

  function makeEmptyCampaign() {
    return {
      id: `campaign_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: "New Campaign",
      description: "",
      timeRange: "permanent",
      targetTaxon: "Any",
      publicMode: "private",
      geometries: {
        boundary: [],
        paths: [],
        exclusions: [],
        denseZones: [],
        assets: []
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function injectStyles() {
    if (document.getElementById("gwCampaignDesignerStyles")) return;

    const style = document.createElement("style");
    style.id = "gwCampaignDesignerStyles";
    style.textContent = `

        .gw-cd-btn:disabled {
        opacity: 0.42;
        cursor: not-allowed;
        }

       .gw-campaign-designer {
        position: fixed;
        inset: 0;
        z-index: 99995;
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr) 320px;
        color: #efe6d3;
        background: rgba(12, 14, 12, 0.78);
        backdrop-filter: blur(4px);
      }

      .gw-cd-panel {
        position: relative;
        z-index: 5;
        background: linear-gradient(180deg, rgba(47,40,33,0.98), rgba(23,19,16,0.99));
        border-color: rgba(215,183,116,0.42);
        box-shadow: 0 18px 60px rgba(0,0,0,0.42);
        overflow: auto;
      }

      .gw-cd-left {
        border-right: 1px solid rgba(215,183,116,0.36);
        padding: 16px;
      }

      .gw-cd-right {
        border-left: 1px solid rgba(215,183,116,0.36);
        padding: 16px;
      }

        .gw-cd-map {
        position: relative;
        z-index: 1;
        min-width: 0;
        background: #1c211d;
        pointer-events: auto;
        overflow: hidden;
        }

        #gwCampaignDesignerMap {
        position: absolute;
        inset: 0;
        z-index: 1;
        overflow: hidden;
        }

        .gw-cd-map-note {
        z-index: 2;
        }

      .gw-cd-map-note {
        position: absolute;
        left: 16px;
        top: 16px;
        z-index: 2;
        max-width: 520px;
        border-radius: 18px;
        padding: 12px 14px;
        background: rgba(20,17,15,0.88);
        border: 1px solid rgba(215,183,116,0.42);
        color: rgba(239,230,211,0.82);
        font-size: 12px;
        line-height: 1.35;
        pointer-events: none;
      }

      .gw-cd-title {
        font-size: 22px;
        font-weight: 950;
        color: #f0d18a;
        margin-bottom: 5px;
      }

      .gw-cd-sub {
        font-size: 12px;
        line-height: 1.35;
        color: rgba(239,230,211,0.66);
        margin-bottom: 14px;
      }

      .gw-cd-section {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(215,183,116,0.20);
      }

      .gw-cd-section-title {
        font-size: 11px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #d7b774;
        margin-bottom: 9px;
      }

      .gw-cd-field {
        display: grid;
        gap: 5px;
        margin-bottom: 10px;
      }

      .gw-cd-field label {
        font-size: 11px;
        font-weight: 900;
        color: rgba(240,209,138,0.86);
      }

      .gw-cd-field input,
      .gw-cd-field textarea,
      .gw-cd-field select {
        width: 100%;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.30);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        padding: 10px;
        font: inherit;
      }

      .gw-cd-field textarea {
        min-height: 76px;
        resize: vertical;
      }

      .gw-cd-tools {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .gw-cd-btn {
        border: 1px solid rgba(215,183,116,0.28);
        border-radius: 999px;
        padding: 10px 11px;
        background: rgba(255,255,255,0.08);
        color: #efe6d3;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-cd-btn.primary {
        background: #ffe082;
        color: #21301f;
        border-color: transparent;
      }

      .gw-cd-btn.danger {
        background: rgba(170,55,45,0.26);
        color: #ffd8d2;
      }

      .gw-cd-btn.active {
        outline: 2px solid rgba(255,224,130,0.85);
        background: rgba(255,224,130,0.18);
      }

      .gw-cd-top-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .gw-cd-list {
        display: grid;
        gap: 8px;
      }

      .gw-cd-list-row {
        border-radius: 14px;
        border: 1px solid rgba(215,183,116,0.18);
        background: rgba(255,255,255,0.06);
        padding: 10px;
        font-size: 12px;
      }

      .gw-cd-muted {
        color: rgba(239,230,211,0.58);
      }

      .gw-cd-stat {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(215,183,116,0.14);
        font-size: 12px;
      }

        #gwCampaignDesignerMap.gw-cd-tool-select { cursor: default; }
#gwCampaignDesignerMap.gw-cd-tool-boundary { cursor: crosshair; }
#gwCampaignDesignerMap.gw-cd-tool-path { cursor: cell; }
#gwCampaignDesignerMap.gw-cd-tool-exclusion { cursor: not-allowed; }
#gwCampaignDesignerMap.gw-cd-tool-dense { cursor: copy; }
#gwCampaignDesignerMap.gw-cd-tool-asset { cursor: grab; }

.gw-cd-context-menu {
  position: absolute;
  z-index: 9999;
  background: rgba(20,17,15,0.96);
  border: 1px solid rgba(215,183,116,0.55);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.42);
}

.gw-cd-context-menu button {
  border: 0;
  border-radius: 9px;
  padding: 8px 10px;
  background: rgba(170,55,45,0.35);
  color: #ffd8d2;
  font-weight: 900;
  cursor: pointer;
}

      @media (max-width: 900px) {
        .gw-campaign-designer {
          grid-template-columns: 1fr;
        }
        .gw-cd-map,
        .gw-cd-right {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureLayers() {
    if (!window.map || !window.L) return;

    if (!map.getPane("gwCampaignDesignerPane")) {
      map.createPane("gwCampaignDesignerPane");
      map.getPane("gwCampaignDesignerPane").style.zIndex = 790;
    }

    for (const key of Object.keys(layers)) {
      if (!layers[key]) {
        layers[key] = L.layerGroup([], { pane: "gwCampaignDesignerPane" }).addTo(map);
      }
    }
  }

function clearLayers() {
  Object.values(layers).forEach(layer => layer?.clearLayers?.());
  Object.values(designerMapLayers || {}).forEach(layer => layer?.clearLayers?.());
  clearVertexHandles();
  selectedLayer = null;
}

  function colorForKind(kind) {
    return {
      boundary: "#76e7bf",
      path: "#ffe082",
      exclusion: "#ff7a6b",
      dense: "#b68cff",
      asset: "#f0d18a",
      taxon: "#58bdf6"
    }[kind] || "#ffe082";
  }

  function getDesignMap() {
  return designerMap || map;
}

function getDesignLayers() {
  return designerMapLayers || layers;
}

function latLngsToDraftPoints(latlngs) {
  return latlngs.map(ll => ({
    lat: ll.lat ?? ll[0],
    lng: ll.lng ?? ll[1]
  }));
}

function draftPointsToLatLngs(points) {
  return (points || []).map(p => [p.lat, p.lng]);
}

function clearVertexHandles() {
  vertexHandles.forEach(h => h.remove());
  vertexHandles = [];
}

function selectEditableLayer(layer, kind, draftArray, index) {
  selectedLayer = { layer, kind, draftArray, index };

  clearVertexHandles();

  if (kind === "asset") return;

  const pts = draftArray[index];
  if (!Array.isArray(pts)) return;

  pts.forEach((p, vertexIndex) => {
    const h = L.circleMarker([p.lat, p.lng], {
      radius: 6,
      color: "#ffffff",
      fillColor: colorForKind(kind),
      fillOpacity: 1,
      weight: 2,
      interactive: true,
      draggable: true
    }).addTo(getDesignLayers().assets);

    // Leaflet CircleMarker is not natively draggable, so implement pointer drag.
    h.on("mousedown", evt => {
      L.DomEvent.stop(evt);
      const dm = getDesignMap();
      dm.dragging.disable();

      function onMove(moveEvt) {
        const ll = moveEvt.latlng;
        pts[vertexIndex] = { lat: ll.lat, lng: ll.lng };
        h.setLatLng(ll);

        if (kind === "path") {
          layer.setLatLngs(draftPointsToLatLngs(pts));
        } else {
          layer.setLatLngs([draftPointsToLatLngs(pts)]);
        }

        refreshRightPanel();
      }

      function onUp() {
        dm.off("mousemove", onMove);
        dm.off("mouseup", onUp);
        dm.dragging.enable();
      }

      dm.on("mousemove", onMove);
      dm.on("mouseup", onUp);
    });

    vertexHandles.push(h);
  });
}

function bindEditableLayer(layer, kind, draftArray, index) {
  layer.on("click", evt => {
    L.DomEvent.stop(evt);
    selectEditableLayer(layer, kind, draftArray, index);
  });

  layer.on("contextmenu", evt => {
    L.DomEvent.stop(evt);

    showCampaignContextMenu(evt.containerPoint, () => {
      pushUndoState();

      if (kind === "boundary") {
        draft.geometries.boundary = [];
      } else if (Array.isArray(draftArray)) {
        draftArray.splice(index, 1);
      }

      selectedLayer = null;
      drawingPoints = [];
      redrawCampaignDraft();
      refreshRightPanel();
    });
  });

  return layer;
}

function showCampaignContextMenu(containerPoint, onDelete) {
  hideCampaignContextMenu();

  contextMenuEl = document.createElement("div");
  contextMenuEl.className = "gw-cd-context-menu";
  contextMenuEl.style.left = `${containerPoint.x}px`;
  contextMenuEl.style.top = `${containerPoint.y}px`;
  contextMenuEl.innerHTML = `<button type="button">Delete object</button>`;

  document.getElementById("gwCampaignDesignerMap").appendChild(contextMenuEl);

  contextMenuEl.querySelector("button").onclick = () => {
    onDelete();
    hideCampaignContextMenu();
  };

  setTimeout(() => {
    document.addEventListener("click", hideCampaignContextMenu, { once: true });
  }, 0);
}

function hideCampaignContextMenu() {
  contextMenuEl?.remove();
  contextMenuEl = null;
}

function addCurrentViewBoundary() {
  const dm = getDesignMap();
  const dl = getDesignLayers();

  const b = dm.getBounds();
  const coords = [
    b.getNorthWest(),
    b.getNorthEast(),
    b.getSouthEast(),
    b.getSouthWest()
  ];

  draft.geometries.boundary = latLngsToDraftPoints(coords);

  dl.boundary.clearLayers();

  const layer = L.polygon(coords, {
    color: colorForKind("boundary"),
    weight: 3,
    fillColor: colorForKind("boundary"),
    fillOpacity: 0.10,
    interactive: true
  }).addTo(dl.boundary);

  bindEditableLayer(layer, "boundary", draft.geometries.boundary, 0);
  refreshRightPanel();
}

  function addMapCenterAsset() {
    ensureLayers();

    const c = designerMap ? designerMap.getCenter() : map.getCenter();
    const asset = {
      id: `asset_${Date.now()}`,
      name: document.getElementById("gwCdAssetName")?.value || "Moth light trap",
      type: document.getElementById("gwCdAssetType")?.value || "light_trap",
      instructions: document.getElementById("gwCdAssetInstructions")?.value || "",
      lat: c.lat,
      lng: c.lng
    };

    draft.geometries.assets.push(asset);

    const marker = L.circleMarker([asset.lat, asset.lng], {
    radius: 9,
    color: colorForKind("asset"),
    fillColor: colorForKind("asset"),
    fillOpacity: 0.88,
    weight: 2,
    interactive: true
    }).bindPopup(`
      <b>${esc(asset.name)}</b><br>
      ${esc(asset.type)}<br>
      <span>${esc(asset.instructions)}</span>
    `);

    marker.addTo(designerMapLayers?.assets || layers.assets);
    refreshRightPanel();
  }

function addDemoPath() {
  const dm = getDesignMap();
  const dl = getDesignLayers();

  const c = dm.getCenter();
  const pts = [
    [c.lat - 0.00055, c.lng - 0.00055],
    [c.lat - 0.00015, c.lng - 0.00018],
    [c.lat + 0.00025, c.lng + 0.00012],
    [c.lat + 0.00055, c.lng + 0.00045]
  ];

  const draftPath = pts.map(([lat, lng]) => ({ lat, lng }));
  draft.geometries.paths.push(draftPath);
  const index = draft.geometries.paths.length - 1;

  const layer = L.polyline(pts, {
    color: colorForKind("path"),
    weight: 5,
    opacity: 0.95,
    dashArray: "8 7",
    interactive: true
  }).addTo(dl.paths);

  bindEditableLayer(layer, "path", draft.geometries.paths, index);
  refreshRightPanel();
}

  function addDemoExclusion() {
    ensureLayers();

    const c = getDesignMap().getCenter();
    const pts = [
      [c.lat + 0.00015, c.lng - 0.00022],
      [c.lat + 0.00025, c.lng + 0.00010],
      [c.lat - 0.00002, c.lng + 0.00018],
      [c.lat - 0.00016, c.lng - 0.00012]
    ];

    draft.geometries.exclusions.push(pts.map(([lat, lng]) => ({ lat, lng })));

    L.polygon(pts, {
      color: colorForKind("exclusion"),
      weight: 2,
      fillColor: colorForKind("exclusion"),
      fillOpacity: 0.20
    }).addTo(getDesignLayers().exclusions);

    refreshRightPanel();
  }

  function addDemoDenseZone() {
    ensureLayers();

    const c = getDesignMap().getCenter();
    const pts = [
      [c.lat - 0.00020, c.lng - 0.00025],
      [c.lat - 0.00003, c.lng - 0.00003],
      [c.lat - 0.00025, c.lng + 0.00020],
      [c.lat - 0.00045, c.lng + 0.00000]
    ];

    draft.geometries.denseZones.push(pts.map(([lat, lng]) => ({ lat, lng })));

    L.polygon(pts, {
      color: colorForKind("dense"),
      weight: 2,
      fillColor: colorForKind("dense"),
      fillOpacity: 0.22
    }).addTo(getDesignLayers().denseZones);

    refreshRightPanel();
  }

  function fakeTaxonHeat() {
    ensureLayers();
    getDesignLayers().taxonHeat.clearLayers();

    const c = getDesignMap().getCenter();
    const taxon = document.getElementById("gwCdTargetTaxon")?.value || "Any";

    for (let i = 0; i < 18; i++) {
      const lat = c.lat + (Math.random() - 0.5) * 0.0022;
      const lng = c.lng + (Math.random() - 0.5) * 0.0022;
      const r = 18 + Math.random() * 36;

      L.circle([lat, lng], {
        radius: r,
        color: colorForKind("taxon"),
        weight: 1,
        fillColor: colorForKind("taxon"),
        fillOpacity: 0.12
      }).bindPopup(`${esc(taxon)} known-observation placeholder`).addTo(getDesignLayers().taxonHeat);
    }

    refreshRightPanel();
  }

  function syncDraftFromForm() {
    draft.name = document.getElementById("gwCdName")?.value || "New Campaign";
    draft.description = document.getElementById("gwCdDescription")?.value || "";
    draft.timeRange = document.getElementById("gwCdTimeRange")?.value || "permanent";
    draft.targetTaxon = document.getElementById("gwCdTargetTaxon")?.value || "Any";
    draft.publicMode = document.getElementById("gwCdPublicMode")?.value || "private";
    draft.updatedAt = new Date().toISOString();
  }

  function loadCampaigns() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCampaigns(campaigns) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns || []));
  }

  function saveDraft() {
    syncDraftFromForm();

    const campaigns = loadCampaigns();
    const idx = campaigns.findIndex(c => c.id === draft.id);

    if (idx >= 0) campaigns[idx] = draft;
    else campaigns.unshift(draft);

    saveCampaigns(campaigns);
    alert("Campaign saved locally.");
    refreshRightPanel();
  }

  function exportDraftJson() {
    syncDraftFromForm();

    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_campaign.json`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function handleImportGeoFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");

      if (file.name.toLowerCase().endsWith(".json") || file.name.toLowerCase().endsWith(".geojson")) {
        try {
          const gj = JSON.parse(text);
          addGeoJsonToMap(gj);
        } catch (err) {
          alert(`Could not parse GeoJSON: ${err.message}`);
        }
        return;
      }

      alert("KML placeholder: file was read, but KML parsing is not enabled yet. Add togeojson or parse with DOMParser next.");
    };

    reader.readAsText(file);
  }

  function addGeoJsonToMap(gj) {
    ensureLayers();

    const layer = L.geoJSON(gj, {
      pane: "gwCampaignDesignerPane",
      style: {
        color: colorForKind("boundary"),
        weight: 3,
        fillOpacity: 0.10
      }
    }).addTo(layers.boundary);

    const b = layer.getBounds?.();
    if (b?.isValid?.()) map.fitBounds(b.pad(0.2));

    draft.geometries.boundary.push({
      source: "geojson_import",
      geojson: gj
    });

    refreshRightPanel();
  }

  function handleDesignerMapClick(evt) {
  if (!designerMap) return;

  if (activeTool === "select") return;

  if (activeTool === "asset") {
    placeAssetAt(evt.latlng);
    return;
  }

  if (["path", "boundary", "exclusion", "dense"].includes(activeTool)) {
    drawingPoints.push(evt.latlng);
    drawPreviewPoint(evt.latlng);

    if (activeTool !== "path" && drawingPoints.length >= 3) {
      // Polygons can be completed by right-click or double-click.
      drawLivePreview();
    } else {
      drawLivePreview();
    }
  }
}

function handleDesignerMapDoubleClick(evt) {
  if (activeTool === "path") {
    L.DomEvent.stop(evt);
    drawingPoints.push(evt.latlng);
    finishDrawing();
  } else if (["boundary", "exclusion", "dense"].includes(activeTool)) {
    L.DomEvent.stop(evt);
    finishDrawing();
  }
}

function drawPreviewPoint(latlng) {
  L.circleMarker(latlng, {
    radius: 4,
    color: "#fff",
    fillColor: colorForKind(activeTool),
    fillOpacity: 1,
    weight: 1
  }).addTo(getDesignLayers().assets);
}

function drawLivePreview() {
  redrawCampaignDraft();

  if (drawingPoints.length < 2) return;

  const dl = getDesignLayers();
  const pts = drawingPoints.map(ll => [ll.lat, ll.lng]);

  if (activeTool === "path") {
    L.polyline(pts, {
      color: colorForKind("path"),
      weight: 4,
      opacity: 0.75,
      dashArray: "4 7",
      interactive: false
    }).addTo(dl.paths);
  } else if (drawingPoints.length >= 3) {
    const kind = activeTool === "dense" ? "dense" : activeTool;
    const targetLayer =
      activeTool === "boundary" ? dl.boundary :
      activeTool === "exclusion" ? dl.exclusions :
      dl.denseZones;

    L.polygon(pts, {
      color: colorForKind(kind),
      weight: 2,
      fillColor: colorForKind(kind),
      fillOpacity: 0.12,
      interactive: false
    }).addTo(targetLayer);
  }
}

function finishDrawing() {
  if (!drawingPoints.length) return;

  pushUndoState();
  

  const pts = latLngsToDraftPoints(drawingPoints);

  
  if (activeTool === "path" && pts.length >= 2) {
    draft.geometries.paths.push(pts);
  }

  if (activeTool === "boundary" && pts.length >= 3) {
    draft.geometries.boundary = pts;
  }

  if (activeTool === "exclusion" && pts.length >= 3) {
    draft.geometries.exclusions.push(pts);
  }

  if (activeTool === "dense" && pts.length >= 3) {
    draft.geometries.denseZones.push(pts);
  }

  drawingPoints = [];
  redrawCampaignDraft();
  refreshRightPanel();
}

function placeAssetAt(latlng) {
  const asset = {
    id: `asset_${Date.now()}`,
    name: document.getElementById("gwCdAssetName")?.value || "Moth light trap",
    type: document.getElementById("gwCdAssetType")?.value || "light_trap",
    instructions: document.getElementById("gwCdAssetInstructions")?.value || "",
    lat: latlng.lat,
    lng: latlng.lng
  };

  pushUndoState();
  draft.geometries.assets.push(asset);
  redrawCampaignDraft();
  refreshRightPanel();
}

    function setTool(tool) {
    activeTool = tool;
    drawingPoints = [];
    hideCampaignContextMenu();

    if (designerMap) {
        const drawingMode = tool !== "select";

        if (drawingMode) {
            designerMap.dragging.disable();
            designerMap.boxZoom.disable();
        } else {
            designerMap.dragging.enable();
            designerMap.boxZoom.enable();
        }
    }

    document.querySelectorAll(".gw-cd-tool-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tool === tool);
    });

    const host = document.getElementById("gwCampaignDesignerMap");
    if (host) {
        host.className = "";
        host.classList.add(`gw-cd-tool-${tool}`);
    }

    const note = document.getElementById("gwCdMapNote");
    if (note) {
        const help = {
        select: "Click objects to select them. Drag assets or vertex handles. Right-click objects to delete.",
        boundary: "Click to place 3+ boundary corners. Double-click or right-click to finish.",
        path: "Click to place path vertices. Double-click to finish.",
        exclusion: "Click 3+ points. Double-click or right-click to finish exclusion polygon.",
        dense: "Click 3+ points. Double-click or right-click to finish dense sampling zone.",
        asset: "Click the embedded map to place an asset. Drag placed assets to move them."
        }[tool];

        note.innerHTML = `<b>Active tool:</b> ${esc(tool)}<br>${esc(help)}`;
    }
    }

  function geometryCount(kind) {
    return draft.geometries?.[kind]?.length || 0;
  }

  function renderRightPanel() {
    return `
      <div class="gw-cd-title">Campaign Status</div>
      <div class="gw-cd-sub">
        Draft campaign specification and planning layers.
      </div>

      <div class="gw-cd-top-actions" style="margin-bottom:14px;">
      <button class="gw-cd-btn" id="gwCdUndo" type="button" disabled>↶ Undo</button>
      <button class="gw-cd-btn" id="gwCdRedo" type="button" disabled>↷ Redo</button>
      </div>

      <div class="gw-cd-section">
        <div class="gw-cd-section-title">Objects</div>
        <div class="gw-cd-stat"><span>Boundary objects</span><b>${draft.geometries.boundary?.length ? 1 : 0}</b></div>
        <div class="gw-cd-stat"><span>Sampling paths</span><b>${geometryCount("paths")}</b></div>
        <div class="gw-cd-stat"><span>Exclusion zones</span><b>${geometryCount("exclusions")}</b></div>
        <div class="gw-cd-stat"><span>Dense zones</span><b>${geometryCount("denseZones")}</b></div>
        <div class="gw-cd-stat"><span>Assets / stations</span><b>${geometryCount("assets")}</b></div>
      </div>

      <div class="gw-cd-section">
        <div class="gw-cd-section-title">Priority preview</div>
        <div class="gw-cd-list">
          <div class="gw-cd-list-row">Cells inside boundary: eligible</div>
          <div class="gw-cd-list-row">Cells touching paths: high priority</div>
          <div class="gw-cd-list-row">Cells inside exclusions: blocked</div>
          <div class="gw-cd-list-row">Cells inside dense zones: extra sampling</div>
          <div class="gw-cd-list-row">Cells near assets: station quests</div>
        </div>
      </div>

      <div class="gw-cd-section">
        <div class="gw-cd-section-title">Saved locally</div>
        <div class="gw-cd-muted">${loadCampaigns().length} campaign(s) in localStorage.</div>
      </div>
    `;
  }

function redrawCampaignDraft() {
  const dl = getDesignLayers();
  Object.values(dl).forEach(layer => layer?.clearLayers?.());
  clearVertexHandles();

  if (draft.geometries.boundary?.length) {
    const idxWrapper = { 0: draft.geometries.boundary };
    const layer = L.polygon(draftPointsToLatLngs(draft.geometries.boundary), {
      color: colorForKind("boundary"),
      weight: 3,
      fillColor: colorForKind("boundary"),
      fillOpacity: 0.10,
      interactive: true
    }).addTo(dl.boundary);

    bindEditableLayer(layer, "boundary", draft.geometries.boundary, 0);
  }

  (draft.geometries.paths || []).forEach((path, index) => {
    const layer = L.polyline(draftPointsToLatLngs(path), {
      color: colorForKind("path"),
      weight: 5,
      opacity: 0.95,
      dashArray: "8 7",
      interactive: true
    }).addTo(dl.paths);

    bindEditableLayer(layer, "path", draft.geometries.paths, index);
  });

  (draft.geometries.exclusions || []).forEach((poly, index) => {
    const layer = L.polygon(draftPointsToLatLngs(poly), {
      color: colorForKind("exclusion"),
      weight: 2,
      fillColor: colorForKind("exclusion"),
      fillOpacity: 0.20,
      interactive: true
    }).addTo(dl.exclusions);

    bindEditableLayer(layer, "exclusion", draft.geometries.exclusions, index);
  });

  (draft.geometries.denseZones || []).forEach((poly, index) => {
    const layer = L.polygon(draftPointsToLatLngs(poly), {
      color: colorForKind("dense"),
      weight: 2,
      fillColor: colorForKind("dense"),
      fillOpacity: 0.22,
      interactive: true
    }).addTo(dl.denseZones);

    bindEditableLayer(layer, "dense", draft.geometries.denseZones, index);
  });

  (draft.geometries.assets || []).forEach((asset, index) => {
    const marker = L.circleMarker([asset.lat, asset.lng], {
      radius: 9,
      color: colorForKind("asset"),
      fillColor: colorForKind("asset"),
      fillOpacity: 0.88,
      weight: 2,
      interactive: true
    }).bindPopup(`
      <b>${esc(asset.name || "Campaign asset")}</b><br>
      ${esc(asset.type || "")}<br>
      <span>${esc(asset.instructions || "")}</span>
    `).addTo(dl.assets);

    marker.on("click", evt => {
      L.DomEvent.stop(evt);
      selectedLayer = { layer: marker, kind: "asset", draftArray: draft.geometries.assets, index };
    });

    marker.on("contextmenu", evt => {
      L.DomEvent.stop(evt);
        showCampaignContextMenu(evt.containerPoint, () => {
        pushUndoState();
        draft.geometries.assets.splice(index, 1);
        redrawCampaignDraft();
        refreshRightPanel();
      });
    });

    marker.on("mousedown", evt => {
      L.DomEvent.stop(evt);
      designerMap.dragging.disable();

      function onMove(moveEvt) {
        marker.setLatLng(moveEvt.latlng);
        asset.lat = moveEvt.latlng.lat;
        asset.lng = moveEvt.latlng.lng;
      }

      function onUp() {
        designerMap.off("mousemove", onMove);
        designerMap.off("mouseup", onUp);
        designerMap.dragging.enable();
        refreshRightPanel();
      }

      designerMap.on("mousemove", onMove);
      designerMap.on("mouseup", onUp);
    });
  });
}

    function refreshRightPanel() {
    const el = document.getElementById("gwCdRight");
    if (!el) return;

    el.innerHTML = renderRightPanel();

    el.querySelector("#gwCdUndo")?.addEventListener("click", undoDesignerAction);
    el.querySelector("#gwCdRedo")?.addEventListener("click", redoDesignerAction);

    updateUndoRedoButtons();
    }

    function close() {
    clearLayers();

    if (designerMap) {
        designerMap.remove();
        designerMap = null;
        designerMapLayers = null;
    }

    designerRoot?.remove();
    designerRoot = null;
    }


  function initDesignerMap() {
  const host = document.getElementById("gwCampaignDesignerMap");
  if (!host || designerMap) return;

  const startCenter = window.map ? map.getCenter() : L.latLng(38.911325, -77.076678);
  const startZoom = window.map ? map.getZoom() : 18;

    designerMap = L.map(host, {
    zoomControl: true,
    attributionControl: false,
    doubleClickZoom: false
    });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20
  }).addTo(designerMap);

  designerMap.setView(startCenter, startZoom);

  designerMapLayers = {
    boundary: L.layerGroup().addTo(designerMap),
    paths: L.layerGroup().addTo(designerMap),
    exclusions: L.layerGroup().addTo(designerMap),
    denseZones: L.layerGroup().addTo(designerMap),
    assets: L.layerGroup().addTo(designerMap),
    taxonHeat: L.layerGroup().addTo(designerMap)
  };

    designerMap.on("click", handleDesignerMapClick);
    designerMap.on("dblclick", handleDesignerMapDoubleClick);
    designerMap.on("contextmenu", evt => {
    if (activeTool !== "select") {
        L.DomEvent.stop(evt);
        finishDrawing();
    }
    });

  setTimeout(() => designerMap.invalidateSize(), 80);
}

  function open() {
    injectStyles();
    ensureLayers();

    if (designerRoot) designerRoot.remove();

    draft = makeEmptyCampaign();

    undoStack = [];
    redoStack = [];

    designerRoot = document.createElement("div");
    designerRoot.className = "gw-campaign-designer";
    designerRoot.innerHTML = `
      <aside class="gw-cd-panel gw-cd-left">
        <div class="gw-cd-title">Campaign Designer</div>
        <div class="gw-cd-sub">
          Fullscreen planning mode for campaign boundaries, paths, exclusion zones,
          dense sampling zones, assets, and target taxa.
        </div>

        <div class="gw-cd-field">
          <label>Name</label>
          <input id="gwCdName" value="${esc(draft.name)}">
        </div>

        <div class="gw-cd-field">
          <label>Description</label>
          <textarea id="gwCdDescription" placeholder="What is this campaign trying to sample?"></textarea>
        </div>

        <div class="gw-cd-field">
          <label>Time range</label>
          <select id="gwCdTimeRange">
            <option value="permanent">Permanent / ongoing</option>
            <option value="today">Today</option>
            <option value="weekend">Weekend</option>
            <option value="season">Seasonal</option>
            <option value="custom">Custom later</option>
          </select>
        </div>

        <div class="gw-cd-field">
          <label>Target taxon</label>
          <select id="gwCdTargetTaxon">
            <option value="Any">Any life</option>
            <option value="Insecta">Insects</option>
            <option value="Lepidoptera">Moths / butterflies</option>
            <option value="Diptera">Flies</option>
            <option value="Plantae">Plants</option>
            <option value="Fungi">Fungi</option>
            <option value="Aves">Birds</option>
          </select>
        </div>

        <div class="gw-cd-field">
          <label>Visibility</label>
          <select id="gwCdPublicMode">
            <option value="private">Private draft</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </div>

        <div class="gw-cd-section">
          <div class="gw-cd-section-title">Spatial tools</div>
          <div class="gw-cd-tools">
            <button class="gw-cd-btn gw-cd-tool-btn active" data-tool="select">Select</button>
            <button class="gw-cd-btn gw-cd-tool-btn" data-tool="boundary">Boundary</button>
            <button class="gw-cd-btn gw-cd-tool-btn" data-tool="path">Path</button>
            <button class="gw-cd-btn gw-cd-tool-btn" data-tool="exclusion">Exclusion</button>
            <button class="gw-cd-btn gw-cd-tool-btn" data-tool="dense">Dense Zone</button>
            <button class="gw-cd-btn gw-cd-tool-btn" data-tool="asset">Asset</button>
          </div>
        </div>

        <div class="gw-cd-section">
          <div class="gw-cd-section-title">Fast placeholder actions</div>
          <div class="gw-cd-tools">
            <button class="gw-cd-btn" id="gwCdUseView">Use View as Boundary</button>
            <button class="gw-cd-btn" id="gwCdAddPath">Add Demo Path</button>
            <button class="gw-cd-btn" id="gwCdAddExclusion">Add Exclusion</button>
            <button class="gw-cd-btn" id="gwCdAddDense">Add Dense Zone</button>
            <button class="gw-cd-btn" id="gwCdTaxonHeat">Show Taxon Heat</button>
            <button class="gw-cd-btn danger" id="gwCdClear">Clear Layers</button>
          </div>
        </div>

        <div class="gw-cd-section">
          <div class="gw-cd-section-title">Import</div>
          <input id="gwCdGeoFile" type="file" accept=".geojson,.json,.kml,.kmz">
        </div>

        <div class="gw-cd-section">
          <div class="gw-cd-section-title">Asset / station</div>
          <div class="gw-cd-field">
            <label>Asset name</label>
            <input id="gwCdAssetName" value="Moth light trap">
          </div>
          <div class="gw-cd-field">
            <label>Asset type</label>
            <select id="gwCdAssetType">
              <option value="light_trap">Light trap</option>
              <option value="feeder">Feeder</option>
              <option value="watchpoint">Watchpoint</option>
              <option value="stream_access">Stream access</option>
              <option value="camera_trap">Camera trap</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="gw-cd-field">
            <label>Access / use instructions</label>
            <textarea id="gwCdAssetInstructions" placeholder="How does a visitor find and use this?"></textarea>
          </div>
          <button class="gw-cd-btn primary" id="gwCdAddAsset">Add Asset at Map Center</button>
        </div>

        <div class="gw-cd-top-actions">
          <button class="gw-cd-btn" id="gwCdClose">Close</button>
          <button class="gw-cd-btn" id="gwCdExport">Export JSON</button>
          <button class="gw-cd-btn primary" id="gwCdSave">Save</button>
        </div>
      </aside>

        <main class="gw-cd-map">
        <div id="gwCampaignDesignerMap"></div>

        <div class="gw-cd-map-note" id="gwCdMapNote">
            <b>Designer map mode</b><br>
            Use this embedded map to place campaign boundaries, paths, dense zones, exclusions, and assets.
        </div>
        </main>

      <aside class="gw-cd-panel gw-cd-right" id="gwCdRight">
        ${renderRightPanel()}
      </aside>
    `;

    document.body.appendChild(designerRoot);
    bind();
    setTool("select");

    initDesignerMap();
    updateUndoRedoButtons();
  }

  function bind() {
    designerRoot.querySelectorAll(".gw-cd-tool-btn").forEach(btn => {
      btn.onclick = () => setTool(btn.dataset.tool);
    });

    designerRoot.querySelector("#gwCdUndo").onclick = undoDesignerAction;
    designerRoot.querySelector("#gwCdRedo").onclick = redoDesignerAction;

    designerRoot.querySelector("#gwCdUseView").onclick = () => { pushUndoState(); addCurrentViewBoundary(); };
    designerRoot.querySelector("#gwCdAddPath").onclick = () => { pushUndoState(); addDemoPath(); };
    designerRoot.querySelector("#gwCdAddExclusion").onclick = () => { pushUndoState(); addDemoExclusion(); };
    designerRoot.querySelector("#gwCdAddDense").onclick = () => { pushUndoState(); addDemoDenseZone(); };
    designerRoot.querySelector("#gwCdAddAsset").onclick = () => { pushUndoState(); addMapCenterAsset(); };

    designerRoot.querySelector("#gwCdClear").onclick = () => {
        pushUndoState();
        clearLayers();
        draft.geometries = {
            boundary: [],
            paths: [],
            exclusions: [],
            denseZones: [],
            assets: []
        };
        refreshRightPanel();
        updateUndoRedoButtons();
    };

    designerRoot.querySelector("#gwCdClose").onclick = (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    close();
    };
    designerRoot.querySelector("#gwCdSave").onclick = saveDraft;
    designerRoot.querySelector("#gwCdExport").onclick = exportDraftJson;

    designerRoot.querySelector("#gwCdGeoFile").onchange = evt => {
      handleImportGeoFile(evt.target.files?.[0]);
      evt.target.value = "";
    };

    ["gwCdName", "gwCdDescription", "gwCdTimeRange", "gwCdTargetTaxon", "gwCdPublicMode"]
      .forEach(id => {
        designerRoot.querySelector(`#${id}`)?.addEventListener("input", () => {
          syncDraftFromForm();
          refreshRightPanel();
        });
      });
  }


  function showCampaignOnMap(campaignId) {
  const campaigns = loadCampaigns();
  const c = campaigns.find(x => x.id === campaignId);
  if (!c) return;

  ensureLayers();
  clearLayers();

  const g = c.geometries || {};

  if (Array.isArray(g.boundary)) {
    if (g.boundary.length && g.boundary[0]?.lat != null) {
      L.polygon(g.boundary.map(p => [p.lat, p.lng]), {
        pane: "gwCampaignDesignerPane",
        color: colorForKind("boundary"),
        weight: 3,
        fillColor: colorForKind("boundary"),
        fillOpacity: 0.10
      }).addTo(layers.boundary);
    }

    g.boundary.forEach(obj => {
      if (obj?.geojson) {
        L.geoJSON(obj.geojson, {
          pane: "gwCampaignDesignerPane",
          style: {
            color: colorForKind("boundary"),
            weight: 3,
            fillOpacity: 0.10
          }
        }).addTo(layers.boundary);
      }
    });
  }

  (g.paths || []).forEach(path => {
    L.polyline(path.map(p => [p.lat, p.lng]), {
      pane: "gwCampaignDesignerPane",
      color: colorForKind("path"),
      weight: 5,
      opacity: 0.95,
      dashArray: "8 7"
    }).addTo(layers.paths);
  });

  (g.exclusions || []).forEach(poly => {
    L.polygon(poly.map(p => [p.lat, p.lng]), {
      pane: "gwCampaignDesignerPane",
      color: colorForKind("exclusion"),
      weight: 2,
      fillColor: colorForKind("exclusion"),
      fillOpacity: 0.20
    }).addTo(layers.exclusions);
  });

  (g.denseZones || []).forEach(poly => {
    L.polygon(poly.map(p => [p.lat, p.lng]), {
      pane: "gwCampaignDesignerPane",
      color: colorForKind("dense"),
      weight: 2,
      fillColor: colorForKind("dense"),
      fillOpacity: 0.22
    }).addTo(layers.denseZones);
  });

  (g.assets || []).forEach(a => {
    if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) return;

    L.circleMarker([a.lat, a.lng], {
      pane: "gwCampaignDesignerPane",
      radius: 9,
      color: colorForKind("asset"),
      fillColor: colorForKind("asset"),
      fillOpacity: 0.88,
      weight: 2
    }).bindPopup(`
      <b>${esc(a.name || "Campaign asset")}</b><br>
      ${esc(a.type || "")}<br>
      <span>${esc(a.instructions || "")}</span>
    `).addTo(layers.assets);
  });
}

  window.GridWildCampaignDesigner = {
    open,
    close,
    loadCampaigns,
    saveCampaigns,
    showCampaignOnMap
  };
})();