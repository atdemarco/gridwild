// -----------------------------------------------------------------------------
// GridWild Survey Designer
// Fullscreen desktop-first survey creation / planning UI
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_surveys_v1";
  const PUCK_POS_KEY = "gw_survey_designer_puck_pos_v1";

  let designerRoot = null;
  let designerPuck = null;
  let designerMinimized = false;
  let suppressNextPuckClick = false;
  let puckResizeBound = false;
  let activeTool = "select";
  let selectedLayer = null;

  let draft = makeEmptySurvey();

  let layers = {
    boundary: null,
    paths: null,
    exclusions: null,
    denseZones: null,
    assets: null,
    locality: null,
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
    redrawSurveyDraft();
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

  function makeEmptySurvey() {
    return {
      id: `survey_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: "New Survey",
      description: "",
      timeRange: "permanent",
      targetTaxon: "Any",
      publicMode: "private",
      locality: null,
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

  function showDesignerToast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
      return;
    }

    let toast = document.getElementById("gwSurveyDesignerToast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "gwSurveyDesignerToast";
      Object.assign(toast.style, {
        position: "fixed",
        left: "50%",
        bottom: "118px",
        zIndex: "999999",
        transform: "translateX(-50%) translateY(10px)",
        padding: "10px 14px",
        borderRadius: "999px",
        color: "#efe6d3",
        background: "rgba(20,17,15,0.94)",
        border: "1px solid rgba(215,183,116,0.34)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
        fontSize: "13px",
        fontWeight: "800",
        pointerEvents: "none",
        opacity: "0",
        transition: "opacity 180ms ease, transform 180ms ease"
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(10px)";
    }, 1800);
  }

  function injectStyles() {
    if (document.getElementById("gwSurveyDesignerStyles")) return;

    const style = document.createElement("style");
    style.id = "gwSurveyDesignerStyles";
    style.textContent = `
        .gw-cd-field input[type="color"] {
          height: 42px;
          padding: 4px;
          cursor: pointer;
        }

        .gw-cd-field input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .gw-cd-field input[type="color"]::-webkit-color-swatch {
          border: 0;
          border-radius: 9px;
        }

        .gw-cd-field input[type="color"]::-moz-color-swatch {
          border: 0;
          border-radius: 9px;
        }

        .gw-cd-modal-backdrop {
          position: absolute;
          inset: 0;
          z-index: 99999;
          display: grid;
          place-items: center;
          background: rgba(0,0,0,0.35);
        }

        .gw-cd-asset-modal {
          width: min(420px, calc(100vw - 32px));
          border-radius: 22px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(47,40,33,0.98), rgba(23,19,16,0.99));
          border: 1px solid rgba(215,183,116,0.48);
          box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        }
          
        .gw-cd-btn:disabled {
        opacity: 0.42;
        cursor: not-allowed;
        }

       .gw-survey-designer {
        position: fixed;
        inset: 0;
        z-index: 99995;
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr) 320px;
        color: #efe6d3;
        background: rgba(12, 14, 12, 0.78);
        backdrop-filter: blur(4px);
      }

      .gw-survey-designer.is-minimized {
        display: none;
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

        #gwSurveyDesignerMap {
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

      .gw-cd-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .gw-cd-title {
        font-size: 22px;
        font-weight: 950;
        color: #f0d18a;
        margin-bottom: 5px;
      }

      .gw-cd-icon-btn {
        width: 34px;
        height: 34px;
        min-width: 34px;
        border: 1px solid rgba(215,183,116,0.32);
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,0.08);
        color: #f0d18a;
        font-size: 18px;
        font-weight: 950;
        line-height: 1;
        cursor: pointer;
      }

      .gw-cd-icon-btn:hover {
        background: rgba(255,224,130,0.16);
        border-color: rgba(240,209,138,0.58);
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

      .gw-cd-tool-span,
      .gw-cd-btn.wide {
        grid-column: 1 / -1;
        width: 100%;
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

      .gw-cd-local-section {
        margin-top: auto;
      }

      .gw-cd-local-readout {
        margin-bottom: 10px;
        border-radius: 12px;
        padding: 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(215,183,116,0.16);
        font-size: 12px;
        line-height: 1.35;
      }

        #gwSurveyDesignerMap.gw-cd-tool-select { cursor: default; }
#gwSurveyDesignerMap.gw-cd-tool-boundary { cursor: crosshair; }
#gwSurveyDesignerMap.gw-cd-tool-path { cursor: cell; }
#gwSurveyDesignerMap.gw-cd-tool-exclusion { cursor: not-allowed; }
#gwSurveyDesignerMap.gw-cd-tool-dense { cursor: copy; }
#gwSurveyDesignerMap.gw-cd-tool-asset { cursor: grab; }

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

.gw-cd-puck {
  position: fixed;
  z-index: 99994;
  width: 126px;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border-radius: 999px;
  color: #efe6d3;
  background: linear-gradient(180deg, rgba(39,35,30,0.96), rgba(17,16,14,0.98));
  border: 1px solid rgba(122,211,230,0.42);
  box-shadow: 0 18px 42px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.08);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
}

.gw-cd-puck[hidden] {
  display: none;
}

.gw-cd-puck.is-dragging {
  cursor: grabbing;
}

.gw-cd-puck-main,
.gw-cd-puck-close {
  appearance: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.gw-cd-puck-main {
  min-width: 0;
  flex: 1;
  height: 36px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px 0 4px;
  background: rgba(255,255,255,0.06);
}

.gw-cd-puck-main:hover {
  background: rgba(122,211,230,0.14);
}

.gw-cd-puck-mark {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #102421;
  background: #76e7bf;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0;
}

.gw-cd-puck-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(239,230,211,0.88);
  font-size: 11px;
  font-weight: 950;
}

.gw-cd-puck-close {
  width: 26px;
  height: 26px;
  min-width: 26px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(170,55,45,0.28);
  color: #ffd8d2;
  font-size: 17px;
  font-weight: 950;
  line-height: 1;
}

.gw-cd-puck-close:hover {
  background: rgba(210,72,58,0.42);
}

      @media (max-width: 900px) {
        .gw-survey-designer {
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

    if (!map.getPane("gwSurveyDesignerPane")) {
      map.createPane("gwSurveyDesignerPane");
      map.getPane("gwSurveyDesignerPane").style.zIndex = 790;
    }

    for (const key of Object.keys(layers)) {
      if (!layers[key]) {
        layers[key] = L.layerGroup([], { pane: "gwSurveyDesignerPane" }).addTo(map);
      }
    }
  }

  function clearLayers() {
    Object.values(layers).forEach((layer) => layer?.clearLayers?.());
    Object.values(designerMapLayers || {}).forEach((layer) => layer?.clearLayers?.());
    clearVertexHandles();
    selectedLayer = null;
  }

  function ensureGeometryStyles() {
    draft.geometries.styles = draft.geometries.styles || {};
    draft.geometries.styles.boundary = draft.geometries.styles.boundary || {};
    draft.geometries.styles.paths = draft.geometries.styles.paths || [];
    draft.geometries.styles.exclusions = draft.geometries.styles.exclusions || [];
    draft.geometries.styles.denseZones = draft.geometries.styles.denseZones || [];
  }

  function defaultGeometryStyle(kind) {
    const c = colorForKind(kind);
    return {
      fillColor: c,
      lineColor: c,
      lineWeight: kind === "path" ? 5 : kind === "boundary" ? 3 : 2,
      fillOpacity:
        kind === "path" ? 0 : kind === "boundary" ? 0.1 : kind === "exclusion" ? 0.2 : 0.22
    };
  }

  function getGeometryStyle(kind, index = 0) {
    ensureGeometryStyles();

    if (kind === "boundary") {
      return { ...defaultGeometryStyle(kind), ...draft.geometries.styles.boundary };
    }

    const key = kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

    return { ...defaultGeometryStyle(kind), ...(draft.geometries.styles[key][index] || {}) };
  }

  function setGeometryStyle(kind, index, style) {
    ensureGeometryStyles();

    if (kind === "boundary") {
      draft.geometries.styles.boundary = style;
      return;
    }

    const key = kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

    draft.geometries.styles[key][index] = style;
  }

  function getDraftPointsForEditable(kind, draftArray, index) {
    if (kind === "boundary") return draft.geometries.boundary;
    return draftArray?.[index];
  }

  function applyGeometryLatLngs(layer, kind, pts) {
    if (kind === "path") {
      layer.setLatLngs(draftPointsToLatLngs(pts));
    } else {
      layer.setLatLngs([draftPointsToLatLngs(pts)]);
    }
  }

  function colorForKind(kind) {
    return (
      {
        boundary: "#76e7bf",
        path: "#ffe082",
        exclusion: "#ff7a6b",
        dense: "#b68cff",
        asset: "#f0d18a",
        taxon: "#58bdf6"
      }[kind] || "#ffe082"
    );
  }

  function getDesignMap() {
    return designerMap || map;
  }

  function getDesignLayers() {
    return designerMapLayers || layers;
  }

  function latLngsToDraftPoints(latlngs) {
    return latlngs.map((ll) => ({
      lat: ll.lat ?? ll[0],
      lng: ll.lng ?? ll[1]
    }));
  }

  function draftPointsToLatLngs(points) {
    return (points || []).map((p) => [p.lat, p.lng]);
  }

  function clearVertexHandles() {
    vertexHandles.forEach((h) => h.remove());
    vertexHandles = [];
  }

  function selectEditableLayer(layer, kind, draftArray, index) {
    selectedLayer = { layer, kind, draftArray, index };

    clearVertexHandles();

    if (kind === "asset") return;

    const pts = getDraftPointsForEditable(kind, draftArray, index);
    if (!Array.isArray(pts)) return;

    pts.forEach((p, vertexIndex) => {
      const h = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: "#ffffff",
        fillColor: colorForKind(kind),
        fillOpacity: 1,
        weight: 2,
        interactive: true
      }).addTo(getDesignLayers().assets);

      h.on("mousedown", (evt) => {
        L.DomEvent.stop(evt);
        const dm = getDesignMap();
        dm.dragging.disable();

        function onMove(moveEvt) {
          const ll = moveEvt.latlng;
          pts[vertexIndex] = { lat: ll.lat, lng: ll.lng };
          h.setLatLng(ll);
          applyGeometryLatLngs(layer, kind, pts);
          refreshRightPanel();
        }

        function onUp() {
          dm.off("mousemove", onMove);
          dm.off("mouseup", onUp);
          dm.dragging.enable();
          refreshRightPanel();
        }

        dm.on("mousemove", onMove);
        dm.on("mouseup", onUp);
      });

      h.on("contextmenu", (evt) => {
        L.DomEvent.stop(evt);

        showSurveyContextMenu(evt.containerPoint, {
          labelDelete: "Delete vertex",
          onDelete: () => {
            const minPts = kind === "path" ? 2 : 3;
            if (pts.length <= minPts) {
              alert(`A ${kind} needs at least ${minPts} vertices.`);
              return;
            }

            pushUndoState();
            pts.splice(vertexIndex, 1);
            applyGeometryLatLngs(layer, kind, pts);
            selectEditableLayer(layer, kind, draftArray, index);
            refreshRightPanel();
          }
        });
      });

      vertexHandles.push(h);
    });
  }

  function bindEditableLayer(layer, kind, draftArray, index) {
    layer.on("click", (evt) => {
      L.DomEvent.stop(evt);
    });

    layer.on("dblclick", (evt) => {
      L.DomEvent.stop(evt);
      setTool("select");
      selectEditableLayer(layer, kind, draftArray, index);
    });

    layer.on("contextmenu", (evt) => {
      L.DomEvent.stop(evt);

      showSurveyContextMenu(evt.containerPoint, {
        onEdit: () => showGeometryEditModal(kind, index, layer, draftArray),
        onDelete: () => {
          pushUndoState();

          if (kind === "boundary") {
            draft.geometries.boundary = [];
            draft.geometries.styles.boundary = {};
            draft.geometries.labels.boundary = "";
          } else if (Array.isArray(draftArray)) {
            draftArray.splice(index, 1);

            const styleKey =
              kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

            draft.geometries.styles?.[styleKey]?.splice?.(index, 1);
            draft.geometries.labels?.[styleKey]?.splice?.(index, 1);
          }

          selectedLayer = null;
          drawingPoints = [];
          redrawSurveyDraft();
          refreshRightPanel();
        }
      });
    });

    return layer;
  }

  function showAssetEditModal(asset, index) {
    document.getElementById("gwCdAssetModalBackdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "gwCdAssetModalBackdrop";
    backdrop.className = "gw-cd-modal-backdrop";

    backdrop.innerHTML = `
    <div class="gw-cd-asset-modal">
      <div class="gw-cd-title">Edit Asset / Station</div>

      <div class="gw-cd-field">
        <label>Asset name</label>
        <input id="gwAssetEditName" value="${esc(asset.name || "")}">
      </div>

      <div class="gw-cd-field">
        <label>Asset type</label>
        <select id="gwAssetEditType">
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
        <textarea id="gwAssetEditInstructions">${esc(asset.instructions || "")}</textarea>
      </div>

      <div class="gw-cd-field">
        <label>Color</label>
        <input id="gwAssetEditColor" type="color" value="${esc(asset.color || "#f0d18a")}">
      </div>

      <div class="gw-cd-field">
        <label>Icon</label>
        <select id="gwAssetEditIcon">
          <option value="💡">💡 Light</option>
          <option value="📷">📷 Camera</option>
          <option value="🥾">🥾 Access point</option>
          <option value="🐦">🐦 Watchpoint</option>
          <option value="🌿">🌿 Plant station</option>
          <option value="🪲">🪲 Insect station</option>
          <option value="📍">📍 Marker</option>
        </select>
      </div>

      <div class="gw-cd-top-actions">
        <button class="gw-cd-btn" id="gwAssetEditCancel" type="button">Cancel</button>
        <button class="gw-cd-btn primary" id="gwAssetEditSave" type="button">Save</button>
      </div>
    </div>
  `;

    document.getElementById("gwSurveyDesignerMap").appendChild(backdrop);

    L.DomEvent.disableClickPropagation(backdrop);
    L.DomEvent.disableScrollPropagation(backdrop);

    backdrop.querySelector("#gwAssetEditType").value = asset.type || "light_trap";
    backdrop.querySelector("#gwAssetEditIcon").value = asset.icon || "📍";

    backdrop.querySelector("#gwAssetEditCancel").onclick = (evt) => {
      L.DomEvent.stop(evt);
      backdrop.remove();
    };

    backdrop.querySelector("#gwAssetEditSave").onclick = (evt) => {
      L.DomEvent.stop(evt);
      evt.preventDefault();

      pushUndoState();

      asset.name = backdrop.querySelector("#gwAssetEditName").value || "Survey asset";
      asset.type = backdrop.querySelector("#gwAssetEditType").value || "other";
      asset.instructions = backdrop.querySelector("#gwAssetEditInstructions").value || "";
      asset.color = backdrop.querySelector("#gwAssetEditColor").value || "#f0d18a";
      asset.icon = backdrop.querySelector("#gwAssetEditIcon").value || "📍";

      backdrop.remove();
      redrawSurveyDraft();
      refreshRightPanel();
    };
  }

  function showGeometryEditModal(kind, index, layer, draftArray) {
    document.getElementById("gwCdAssetModalBackdrop")?.remove();

    const style = getGeometryStyle(kind, index);
    const title =
      kind === "boundary"
        ? "Edit Boundary"
        : kind === "path"
          ? "Edit Path"
          : kind === "exclusion"
            ? "Edit Exclusion Zone"
            : "Edit Dense Zone";

    const backdrop = document.createElement("div");
    backdrop.id = "gwCdAssetModalBackdrop";
    backdrop.className = "gw-cd-modal-backdrop";

    backdrop.innerHTML = `
    <div class="gw-cd-asset-modal">
      <div class="gw-cd-title">${esc(title)}</div>

      <div class="gw-cd-field">
        <label>Label / title</label>
        <input id="gwGeomLabel" value="${esc(getGeometryLabel(kind, index))}">
      </div>

      <div class="gw-cd-field">
        <label>Fill color</label>
        <input id="gwGeomFillColor" type="color" value="${esc(style.fillColor || colorForKind(kind))}">
      </div>

      <div class="gw-cd-field">
        <label>Line color</label>
        <input id="gwGeomLineColor" type="color" value="${esc(style.lineColor || colorForKind(kind))}">
      </div>

      <div class="gw-cd-field">
        <label>Line thickness</label>
        <input id="gwGeomLineWeight" type="number" min="1" max="20" step="1" value="${Number(style.lineWeight || 2)}">
      </div>

      <div class="gw-cd-field">
        <label>Fill opacity</label>
        <input id="gwGeomFillOpacity" type="number" min="0" max="1" step="0.05" value="${Number(style.fillOpacity ?? 0.15)}">
      </div>

      <div class="gw-cd-top-actions">
        <button class="gw-cd-btn" id="gwGeomEditCancel" type="button">Cancel</button>
        <button class="gw-cd-btn primary" id="gwGeomEditSave" type="button">Save</button>
      </div>
    </div>
  `;

    document.getElementById("gwSurveyDesignerMap").appendChild(backdrop);

    L.DomEvent.disableClickPropagation(backdrop);
    L.DomEvent.disableScrollPropagation(backdrop);

    backdrop.querySelector("#gwGeomEditCancel").onclick = (evt) => {
      L.DomEvent.stop(evt);
      backdrop.remove();
    };

    backdrop.querySelector("#gwGeomEditSave").onclick = (evt) => {
      L.DomEvent.stop(evt);
      evt.preventDefault();

      pushUndoState();

      const nextStyle = {
        fillColor: backdrop.querySelector("#gwGeomFillColor").value || colorForKind(kind),
        lineColor: backdrop.querySelector("#gwGeomLineColor").value || colorForKind(kind),
        lineWeight: Number(backdrop.querySelector("#gwGeomLineWeight").value) || 2,
        fillOpacity: Number(backdrop.querySelector("#gwGeomFillOpacity").value)
      };

      if (!Number.isFinite(nextStyle.fillOpacity)) nextStyle.fillOpacity = 0.15;
      nextStyle.fillOpacity = Math.max(0, Math.min(1, nextStyle.fillOpacity));

      setGeometryLabel(
        kind,
        index,
        backdrop.querySelector("#gwGeomLabel").value || getGeometryLabel(kind, index)
      );

      setGeometryStyle(kind, index, nextStyle);

      backdrop.remove();
      redrawSurveyDraft();
      refreshRightPanel();
    };
  }

  function showSurveyContextMenu(containerPoint, opts = {}) {
    hideSurveyContextMenu();

    contextMenuEl = document.createElement("div");
    contextMenuEl.className = "gw-cd-context-menu";
    contextMenuEl.style.left = `${containerPoint.x}px`;
    contextMenuEl.style.top = `${containerPoint.y}px`;

    contextMenuEl.innerHTML = `
    ${opts.onEdit ? `<button type="button" data-action="edit">Edit...</button>` : ""}
    <button type="button" data-action="delete">${esc(opts.labelDelete || "Delete object")}</button>
  `;

    L.DomEvent.disableClickPropagation(contextMenuEl);
    L.DomEvent.disableScrollPropagation(contextMenuEl);

    document.getElementById("gwSurveyDesignerMap").appendChild(contextMenuEl);

    contextMenuEl.querySelector('[data-action="edit"]')?.addEventListener("click", (evt) => {
      L.DomEvent.stop(evt);
      evt.preventDefault();
      hideSurveyContextMenu();
      opts.onEdit?.();
    });

    contextMenuEl.querySelector('[data-action="delete"]')?.addEventListener("click", (evt) => {
      L.DomEvent.stop(evt);
      evt.preventDefault();
      opts.onDelete?.();
      hideSurveyContextMenu();
    });

    setTimeout(() => {
      document.addEventListener("click", hideSurveyContextMenu, { once: true });
    }, 0);
  }

  function hideSurveyContextMenu() {
    contextMenuEl?.remove();
    contextMenuEl = null;
  }

  function addCurrentViewBoundary() {
    const dm = getDesignMap();
    const dl = getDesignLayers();

    const b = dm.getBounds();
    const coords = [b.getNorthWest(), b.getNorthEast(), b.getSouthEast(), b.getSouthWest()];

    ensureGeometryStyles();
    draft.geometries.boundary = latLngsToDraftPoints(coords);

    dl.boundary.clearLayers();

    const layer = L.polygon(coords, {
      color: colorForKind("boundary"),
      weight: 3,
      fillColor: colorForKind("boundary"),
      fillOpacity: 0.1,
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
    redrawSurveyDraft();
    refreshRightPanel();
  }

  function normalizePickedLocation(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      label: String(location?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`),
      source: String(location?.source || "location-picker"),
      selectedAt: new Date().toISOString()
    };
  }

  function formatLocalityReadout() {
    const loc = normalizePickedLocation(draft.locality);
    if (!loc) return "No designer locality selected.";

    const coords = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
    if (!loc.label || loc.label === coords) return esc(coords);
    return `${esc(loc.label)}<br><span class="gw-cd-muted">${esc(coords)}</span>`;
  }

  function applyDesignerLocality(location) {
    const loc = normalizePickedLocation(location);

    if (!loc) {
      alert("Could not use that location.");
      return;
    }

    pushUndoState();
    draft.locality = loc;

    if (designerMap) {
      designerMap.setView([loc.lat, loc.lng], Math.max(designerMap.getZoom(), 18), {
        animate: true
      });
    }

    redrawSurveyDraft();
    refreshRightPanel();
  }

  function openDesignerLocationPicker() {
    if (!window.GridWildLocationPicker?.open) {
      alert("Location Picker is not loaded.");
      return;
    }

    const center = designerMap?.getCenter?.() || window.map?.getCenter?.();
    const location =
      normalizePickedLocation(draft.locality) ||
      (center
        ? {
            lat: center.lat,
            lng: center.lng,
            label: `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`,
            source: "designer-map-center"
          }
        : null);

    window.GridWildLocationPicker.open({
      location,
      selectButtonLabel: "Use in Designer",
      onSelect: applyDesignerLocality
    });
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
      [c.lat + 0.00025, c.lng + 0.0001],
      [c.lat - 0.00002, c.lng + 0.00018],
      [c.lat - 0.00016, c.lng - 0.00012]
    ];

    draft.geometries.exclusions.push(pts.map(([lat, lng]) => ({ lat, lng })));

    redrawSurveyDraft();
    refreshRightPanel();
  }

  function addDemoDenseZone() {
    ensureLayers();

    const c = getDesignMap().getCenter();
    const pts = [
      [c.lat - 0.0002, c.lng - 0.00025],
      [c.lat - 0.00003, c.lng - 0.00003],
      [c.lat - 0.00025, c.lng + 0.0002],
      [c.lat - 0.00045, c.lng + 0.0]
    ];

    draft.geometries.denseZones.push(pts.map(([lat, lng]) => ({ lat, lng })));

    redrawSurveyDraft();
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
      })
        .bindPopup(`${esc(taxon)} known-observation placeholder`)
        .addTo(getDesignLayers().taxonHeat);
    }

    refreshRightPanel();
  }

  function ensureGeometryLabels() {
    draft.geometries.labels = draft.geometries.labels || {};
    draft.geometries.labels.boundary = draft.geometries.labels.boundary || "";
    draft.geometries.labels.paths = draft.geometries.labels.paths || [];
    draft.geometries.labels.exclusions = draft.geometries.labels.exclusions || [];
    draft.geometries.labels.denseZones = draft.geometries.labels.denseZones || [];
  }

  function getGeometryLabel(kind, index = 0) {
    ensureGeometryLabels();

    if (kind === "boundary") return draft.geometries.labels.boundary || "Survey boundary";

    const key = kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

    return (
      draft.geometries.labels[key][index] ||
      (kind === "path" ? "Main path" : kind === "exclusion" ? "Exclusion zone" : "Dense zone")
    );
  }

  function setGeometryLabel(kind, index, label) {
    ensureGeometryLabels();

    if (kind === "boundary") {
      draft.geometries.labels.boundary = label;
      return;
    }

    const key = kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

    draft.geometries.labels[key][index] = label;
  }

  function syncDraftFromForm() {
    draft.name = document.getElementById("gwCdName")?.value || "New Survey";
    draft.description = document.getElementById("gwCdDescription")?.value || "";
    draft.timeRange = document.getElementById("gwCdTimeRange")?.value || "permanent";
    draft.targetTaxon = document.getElementById("gwCdTargetTaxon")?.value || "Any";
    draft.publicMode = document.getElementById("gwCdPublicMode")?.value || "private";
    draft.updatedAt = new Date().toISOString();
  }

  function loadSurveys() {
    const dbRows = window.__gwState?.surveys;

    if (Array.isArray(dbRows)) {
      return dbRows
        .map((row) => {
          const survey = row.survey_json || row;
          if (!survey) return null;

          return {
            ...survey,
            owner_player_id: row.owner_player_id || survey.owner_player_id || null,
            public_mode: row.public_mode || survey.public_mode || survey.publicMode || "private",
            updated_at: row.updated_at || survey.updated_at || survey.updatedAt || null,
            _dbRow: row
          };
        })
        .filter(Boolean);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSurveys(surveys) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(surveys || []));
    window.GridWildSurveyLayer?.render?.();
  }

  async function saveDraft() {
    syncDraftFromForm();

    try {
      const result = await window.GridWildAPI.saveSurvey(draft);

      window.__gwState = window.__gwState || {};
      window.__gwState.surveys = [
        result.survey,
        ...(window.__gwState.surveys || []).filter((s) => s.id !== result.survey.id)
      ];

      window.GridWildSurveyLayer?.render?.();

      showDesignerToast("Survey saved to GridWild");
      refreshRightPanel();
    } catch (err) {
      console.warn("Could not save survey online:", err);

      const surveys = loadSurveys();
      const idx = surveys.findIndex((c) => c.id === draft.id);

      if (idx >= 0) surveys[idx] = draft;
      else surveys.unshift(draft);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(surveys || []));
      showDesignerToast("Survey saved locally");
      refreshRightPanel();
    }
  }
  function exportDraftJson() {
    syncDraftFromForm();

    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_survey.json`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function handleImportGeoFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");

      if (
        file.name.toLowerCase().endsWith(".json") ||
        file.name.toLowerCase().endsWith(".geojson")
      ) {
        try {
          const gj = JSON.parse(text);
          addGeoJsonToMap(gj);
        } catch (err) {
          alert(`Could not parse GeoJSON: ${err.message}`);
        }
        return;
      }

      alert(
        "KML placeholder: file was read, but KML parsing is not enabled yet. Add togeojson or parse with DOMParser next."
      );
    };

    reader.readAsText(file);
  }

  function addGeoJsonToMap(gj) {
    ensureLayers();

    const layer = L.geoJSON(gj, {
      pane: "gwSurveyDesignerPane",
      style: {
        color: colorForKind("boundary"),
        weight: 3,
        fillOpacity: 0.1
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
    redrawSurveyDraft();

    if (drawingPoints.length < 2) return;

    const dl = getDesignLayers();
    const pts = drawingPoints.map((ll) => [ll.lat, ll.lng]);

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
        activeTool === "boundary"
          ? dl.boundary
          : activeTool === "exclusion"
            ? dl.exclusions
            : dl.denseZones;

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

    const finishedTool = activeTool;
    const pts = latLngsToDraftPoints(drawingPoints);

    if (finishedTool === "path" && pts.length < 2) return;
    if (["boundary", "exclusion", "dense"].includes(finishedTool) && pts.length < 3) return;

    pushUndoState();

    let editKind = finishedTool;
    let editArray = null;
    let editIndex = 0;

    if (finishedTool === "path") {
      draft.geometries.paths.push(pts);
      editArray = draft.geometries.paths;
      editIndex = draft.geometries.paths.length - 1;
    }

    if (finishedTool === "boundary") {
      draft.geometries.boundary = pts;
      editArray = draft.geometries.boundary;
      editIndex = 0;
    }

    if (finishedTool === "exclusion") {
      draft.geometries.exclusions.push(pts);
      editArray = draft.geometries.exclusions;
      editIndex = draft.geometries.exclusions.length - 1;
    }

    if (finishedTool === "dense") {
      draft.geometries.denseZones.push(pts);
      editArray = draft.geometries.denseZones;
      editIndex = draft.geometries.denseZones.length - 1;
    }

    drawingPoints = [];
    redrawSurveyDraft();
    refreshRightPanel();
    setTool("select");

    setTimeout(() => {
      const dl = getDesignLayers();

      const group =
        editKind === "boundary"
          ? dl.boundary
          : editKind === "path"
            ? dl.paths
            : editKind === "exclusion"
              ? dl.exclusions
              : editKind === "dense"
                ? dl.denseZones
                : null;

      const layer = group?.getLayers?.()[editIndex];

      if (layer) {
        selectEditableLayer(layer, editKind, editArray, editIndex);
      }
    }, 0);
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
    redrawSurveyDraft();
    refreshRightPanel();
  }

  function setTool(tool) {
    activeTool = tool;
    drawingPoints = [];
    hideSurveyContextMenu();

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

    document.querySelectorAll(".gw-cd-tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });

    const host = document.getElementById("gwSurveyDesignerMap");
    if (host) {
      host.classList.remove(
        "gw-cd-tool-select",
        "gw-cd-tool-boundary",
        "gw-cd-tool-path",
        "gw-cd-tool-exclusion",
        "gw-cd-tool-dense",
        "gw-cd-tool-asset"
      );

      host.classList.add(`gw-cd-tool-${tool}`);
    }

    const note = document.getElementById("gwCdMapNote");
    if (note) {
      const help = {
        select:
          "Click objects to select them. Drag assets or vertex handles. Right-click objects to delete.",
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
      <div class="gw-cd-title">Survey Status</div>
      <div class="gw-cd-sub">
        Draft survey specification and planning layers.
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
        <div class="gw-cd-section-title">Saved surveys</div>
        <div class="gw-cd-muted">${loadSurveys().length} survey(s) available.</div>
      </div>

      <div class="gw-cd-section gw-cd-local-section">
        <div class="gw-cd-section-title">Local Picker</div>
        <div class="gw-cd-local-readout">${formatLocalityReadout()}</div>
        <button class="gw-cd-btn primary wide" id="gwCdPickLocal" type="button">Pick Location for Designer</button>
      </div>
    `;
  }

  function redrawSurveyDraft() {
    const dl = getDesignLayers();
    Object.values(dl).forEach((layer) => layer?.clearLayers?.());
    clearVertexHandles();

    ensureGeometryStyles();
    ensureGeometryLabels();

    const locality = normalizePickedLocation(draft.locality);
    if (locality && dl.locality) {
      L.circleMarker([locality.lat, locality.lng], {
        radius: 8,
        color: "#f0d18a",
        weight: 2,
        fillColor: "#76e7bf",
        fillOpacity: 0.72,
        interactive: false
      })
        .bindTooltip(locality.label || "Designer locality", {
          permanent: false,
          direction: "top"
        })
        .addTo(dl.locality);
    }

    if (draft.geometries.boundary?.length) {
      const s = getGeometryStyle("boundary", 0);

      const layer = L.polygon(draftPointsToLatLngs(draft.geometries.boundary), {
        color: s.lineColor,
        weight: s.lineWeight,
        fillColor: s.fillColor,
        fillOpacity: s.fillOpacity,
        interactive: true
      }).addTo(dl.boundary);

      bindEditableLayer(layer, "boundary", draft.geometries.boundary, 0);
    }

    (draft.geometries.paths || []).forEach((path, index) => {
      const s = getGeometryStyle("path", index);

      const layer = L.polyline(draftPointsToLatLngs(path), {
        color: s.lineColor,
        weight: s.lineWeight,
        opacity: 0.95,
        dashArray: "8 7",
        interactive: true
      }).addTo(dl.paths);

      bindEditableLayer(layer, "path", draft.geometries.paths, index);
    });

    (draft.geometries.exclusions || []).forEach((poly, index) => {
      const s = getGeometryStyle("exclusion", index);

      const layer = L.polygon(draftPointsToLatLngs(poly), {
        color: s.lineColor,
        weight: s.lineWeight,
        fillColor: s.fillColor,
        fillOpacity: s.fillOpacity,
        interactive: true
      }).addTo(dl.exclusions);

      bindEditableLayer(layer, "exclusion", draft.geometries.exclusions, index);
    });

    (draft.geometries.denseZones || []).forEach((poly, index) => {
      const s = getGeometryStyle("dense", index);

      const layer = L.polygon(draftPointsToLatLngs(poly), {
        color: s.lineColor,
        weight: s.lineWeight,
        fillColor: s.fillColor,
        fillOpacity: s.fillOpacity,
        interactive: true
      }).addTo(dl.denseZones);

      bindEditableLayer(layer, "dense", draft.geometries.denseZones, index);
    });

    (draft.geometries.assets || []).forEach((asset, index) => {
      const assetColor = asset.color || colorForKind("asset");
      const assetIcon = asset.icon || "📍";

      const marker = L.circleMarker([asset.lat, asset.lng], {
        radius: 9,
        color: assetColor,
        fillColor: assetColor,
        fillOpacity: 0.88,
        weight: 2,
        interactive: true
      })
        .bindPopup(
          `
        <b>${esc(assetIcon)} ${esc(asset.name || "Survey asset")}</b><br>
        ${esc(asset.type || "")}<br>
        <span>${esc(asset.instructions || "")}</span>
      `
        )
        .addTo(dl.assets);

      marker.on("click", (evt) => {
        L.DomEvent.stop(evt);
        selectedLayer = {
          layer: marker,
          kind: "asset",
          draftArray: draft.geometries.assets,
          index
        };
      });

      marker.on("contextmenu", (evt) => {
        L.DomEvent.stop(evt);

        showSurveyContextMenu(evt.containerPoint, {
          onEdit: () => showAssetEditModal(asset, index),
          onDelete: () => {
            pushUndoState();
            draft.geometries.assets.splice(index, 1);
            redrawSurveyDraft();
            refreshRightPanel();
          }
        });
      });

      marker.on("mousedown", (evt) => {
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
    el.querySelector("#gwCdPickLocal")?.addEventListener("click", openDesignerLocationPicker);

    updateUndoRedoButtons();
  }

  function defaultPuckPosition() {
    const top = Math.max(92, Math.min(window.innerHeight - 76, 260));
    return { left: 18, top };
  }

  function loadPuckPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PUCK_POS_KEY) || "null");
      if (Number.isFinite(Number(parsed?.left)) && Number.isFinite(Number(parsed?.top))) {
        return {
          left: Number(parsed.left),
          top: Number(parsed.top)
        };
      }
    } catch {}

    return defaultPuckPosition();
  }

  function clampPuckPosition(pos) {
    const margin = 10;
    const width = designerPuck?.offsetWidth || 126;
    const height = designerPuck?.offsetHeight || 46;

    return {
      left: Math.max(
        margin,
        Math.min(window.innerWidth - width - margin, Number(pos?.left) || margin)
      ),
      top: Math.max(
        margin,
        Math.min(window.innerHeight - height - margin, Number(pos?.top) || margin)
      )
    };
  }

  function positionDesignerPuck(pos) {
    if (!designerPuck) return;

    const next = clampPuckPosition(pos || loadPuckPosition());
    designerPuck.style.left = `${next.left}px`;
    designerPuck.style.top = `${next.top}px`;
  }

  function savePuckPosition() {
    if (!designerPuck) return;

    try {
      localStorage.setItem(
        PUCK_POS_KEY,
        JSON.stringify({
          left: Number.parseFloat(designerPuck.style.left) || 18,
          top: Number.parseFloat(designerPuck.style.top) || 92
        })
      );
    } catch {}
  }

  function bindPuckResize() {
    if (puckResizeBound) return;
    puckResizeBound = true;

    window.addEventListener("resize", () => {
      if (!designerPuck || designerPuck.hidden) return;
      positionDesignerPuck({
        left: Number.parseFloat(designerPuck.style.left) || 18,
        top: Number.parseFloat(designerPuck.style.top) || 92
      });
      savePuckPosition();
    });
  }

  function removeDesignerPuck() {
    designerPuck?.remove();
    designerPuck = null;
    suppressNextPuckClick = false;
  }

  function ensureDesignerPuck() {
    if (designerPuck) return designerPuck;

    designerPuck = document.createElement("div");
    designerPuck.className = "gw-cd-puck";
    designerPuck.hidden = true;
    designerPuck.innerHTML = `
    <button class="gw-cd-puck-main" type="button" aria-label="Restore Survey Designer" title="Restore Survey Designer">
      <span class="gw-cd-puck-mark">SD</span>
      <span class="gw-cd-puck-text">Designer</span>
    </button>
    <button class="gw-cd-puck-close" type="button" aria-label="Close Survey Designer" title="Close Survey Designer">&times;</button>
  `;

    let drag = null;

    designerPuck.addEventListener("pointerdown", (evt) => {
      if (evt.pointerType === "mouse" && evt.button !== 0) return;
      if (evt.target.closest(".gw-cd-puck-close")) return;

      const startLeft = Number.parseFloat(designerPuck.style.left) || loadPuckPosition().left;
      const startTop = Number.parseFloat(designerPuck.style.top) || loadPuckPosition().top;

      drag = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        startLeft,
        startTop,
        moved: false
      };

      designerPuck.setPointerCapture?.(evt.pointerId);
    });

    designerPuck.addEventListener("pointermove", (evt) => {
      if (!drag || drag.pointerId !== evt.pointerId) return;

      const dx = evt.clientX - drag.startX;
      const dy = evt.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;

      evt.preventDefault();
      designerPuck.classList.add("is-dragging");
      positionDesignerPuck({
        left: drag.startLeft + dx,
        top: drag.startTop + dy
      });
    });

    designerPuck.addEventListener("pointerup", (evt) => {
      if (!drag || drag.pointerId !== evt.pointerId) return;

      suppressNextPuckClick = drag.moved;
      drag = null;
      designerPuck.classList.remove("is-dragging");
      designerPuck.releasePointerCapture?.(evt.pointerId);
      savePuckPosition();
    });

    designerPuck.addEventListener("pointercancel", (evt) => {
      if (drag?.pointerId === evt.pointerId) {
        drag = null;
        designerPuck.classList.remove("is-dragging");
      }
    });

    designerPuck.addEventListener("click", (evt) => {
      if (evt.target.closest(".gw-cd-puck-close")) return;

      if (suppressNextPuckClick) {
        suppressNextPuckClick = false;
        return;
      }

      restoreDesigner();
    });

    designerPuck.querySelector(".gw-cd-puck-close")?.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
    });

    document.body.appendChild(designerPuck);
    positionDesignerPuck(loadPuckPosition());
    bindPuckResize();

    return designerPuck;
  }

  function minimizeDesigner() {
    if (!designerRoot) return;

    syncDraftFromForm?.();
    hideSurveyContextMenu();
    designerMinimized = true;
    designerRoot.classList.add("is-minimized");

    const puck = ensureDesignerPuck();
    positionDesignerPuck(loadPuckPosition());
    puck.hidden = false;
  }

  function restoreDesigner() {
    if (!designerRoot) return;

    designerMinimized = false;
    designerRoot.classList.remove("is-minimized");

    if (designerPuck) {
      designerPuck.hidden = true;
    }

    setTimeout(() => {
      designerMap?.invalidateSize?.();
      redrawSurveyDraft();
      refreshRightPanel();
    }, 80);
  }

  function close() {
    designerMinimized = false;
    removeDesignerPuck();
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
    const host = document.getElementById("gwSurveyDesignerMap");
    if (!host || designerMap) return;

    const startCenter = window.map ? map.getCenter() : L.latLng(38.911325, -77.076678);
    const startZoom = window.map ? map.getZoom() : 18;

    designerMap = L.map(host, {
      zoomControl: true,
      attributionControl: false,
      doubleClickZoom: false
    });

    (
      window.createGridWildDefaultBaseLayer?.({ flavor: "light" }) ||
      window.createStreetBaseLayer?.() ||
      L.layerGroup()
    ).addTo(designerMap);

    designerMap.setView(startCenter, startZoom);

    designerMapLayers = {
      boundary: L.layerGroup().addTo(designerMap),
      paths: L.layerGroup().addTo(designerMap),
      exclusions: L.layerGroup().addTo(designerMap),
      denseZones: L.layerGroup().addTo(designerMap),
      assets: L.layerGroup().addTo(designerMap),
      locality: L.layerGroup().addTo(designerMap),
      taxonHeat: L.layerGroup().addTo(designerMap)
    };

    designerMap.on("click", handleDesignerMapClick);
    designerMap.on("dblclick", handleDesignerMapDoubleClick);
    designerMap.on("contextmenu", (evt) => {
      if (activeTool !== "select") {
        L.DomEvent.stop(evt);
        finishDrawing();
      }
    });

    setTimeout(() => designerMap.invalidateSize(), 80);
  }

  function normalizeSurveyForEdit(survey) {
    const fresh = makeEmptySurvey();
    const editable = cloneDraft(survey);

    delete editable._dbRow;
    delete editable.owner_player_id;
    delete editable.public_mode;
    delete editable.updated_at;

    return {
      ...fresh,
      ...editable,
      geometries: {
        boundary: [],
        paths: [],
        exclusions: [],
        denseZones: [],
        assets: [],
        ...cloneDraft(editable.geometries || {})
      }
    };
  }

  function openExisting(surveyId) {
    const surveys = loadSurveys();
    const existing = surveys.find((c) => c.id === surveyId);

    if (!existing) {
      alert("Could not find that saved survey.");
      return;
    }

    open(normalizeSurveyForEdit(existing));
  }

  async function deleteSurvey(surveyId) {
    const surveys = loadSurveys();
    const target = surveys.find((c) => c.id === surveyId);

    if (!target) return false;

    try {
      await window.GridWildAPI.deleteSurvey(surveyId);

      window.__gwState = window.__gwState || {};
      window.__gwState.surveys = (window.__gwState.surveys || []).filter(
        (row) => row.id !== surveyId
      );

      window.__gwState.playerSurveys = (window.__gwState.playerSurveys || []).filter(
        (row) => row.survey_id !== surveyId
      );

      window.GridWildSurveyLayer?.hide?.(surveyId);
      window.GridWildSurveyLayer?.render?.();

      return true;
    } catch (err) {
      console.warn("Could not delete survey online:", err);
      alert(`Could not delete survey: ${err.message}`);
      return false;
    }
  }

  function getCurrentDraftBounds() {
    const pts = [];

    const g = draft.geometries || {};

    if (Array.isArray(g.boundary) && g.boundary[0]?.lat != null) {
      g.boundary.forEach((p) => pts.push([p.lat, p.lng]));
    }

    (g.paths || []).forEach((path) => {
      (path || []).forEach((p) => pts.push([p.lat, p.lng]));
    });

    (g.exclusions || []).forEach((poly) => {
      (poly || []).forEach((p) => pts.push([p.lat, p.lng]));
    });

    (g.denseZones || []).forEach((poly) => {
      (poly || []).forEach((p) => pts.push([p.lat, p.lng]));
    });

    (g.assets || []).forEach((a) => {
      if (Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng))) {
        pts.push([Number(a.lat), Number(a.lng)]);
      }
    });

    return pts.length ? L.latLngBounds(pts) : null;
  }

  function open(existingDraft = null) {
    injectStyles();
    ensureLayers();

    if (designerRoot || designerMap) close();

    draft = existingDraft ? normalizeSurveyForEdit(existingDraft) : makeEmptySurvey();

    undoStack = [];
    redoStack = [];

    designerRoot = document.createElement("div");
    designerRoot.className = "gw-survey-designer";
    designerRoot.innerHTML = `
      <aside class="gw-cd-panel gw-cd-left">
        <div class="gw-cd-header">
          <div class="gw-cd-title">Survey Designer</div>
          <button class="gw-cd-icon-btn" id="gwCdMinimize" type="button" aria-label="Minimize Survey Designer" title="Minimize">&minus;</button>
        </div>
        <div class="gw-cd-sub">
          Fullscreen planning mode for survey boundaries, paths, exclusion zones,
          dense sampling zones, assets, and target taxa.
        </div>

        <div class="gw-cd-field">
          <label>Name</label>
          <input id="gwCdName" value="${esc(draft.name)}">
        </div>

        <div class="gw-cd-field">
          <label>Description</label>
          <textarea id="gwCdDescription" placeholder="What is this survey trying to sample?"></textarea>
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
            <button class="gw-cd-btn danger gw-cd-tool-span" id="gwCdClear">Clear Layers</button>
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
        <div id="gwSurveyDesignerMap"></div>

        <div class="gw-cd-map-note" id="gwCdMapNote">
            <b>Designer map mode</b><br>
            Use this embedded map to place survey boundaries, paths, dense zones, exclusions, and assets.
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

    refreshFormFromDraft();
    redrawSurveyDraft();
    refreshRightPanel();

    const bounds = getCurrentDraftBounds();
    if (bounds?.isValid?.()) {
      setTimeout(() => designerMap?.fitBounds(bounds.pad(0.2)), 120);
    }

    updateUndoRedoButtons();
  }

  function bind() {
    const onClick = (selector, handler) => {
      designerRoot.querySelector(selector)?.addEventListener("click", handler);
    };

    designerRoot.querySelectorAll(".gw-cd-tool-btn").forEach((btn) => {
      btn.onclick = () => setTool(btn.dataset.tool);
    });

    onClick("#gwCdUndo", undoDesignerAction);
    onClick("#gwCdRedo", redoDesignerAction);

    onClick("#gwCdUseView", () => {
      pushUndoState();
      addCurrentViewBoundary();
    });
    onClick("#gwCdAddPath", () => {
      pushUndoState();
      addDemoPath();
    });
    onClick("#gwCdAddExclusion", () => {
      pushUndoState();
      addDemoExclusion();
    });
    onClick("#gwCdAddDense", () => {
      pushUndoState();
      addDemoDenseZone();
    });
    onClick("#gwCdAddAsset", () => {
      pushUndoState();
      addMapCenterAsset();
    });
    onClick("#gwCdMinimize", minimizeDesigner);

    onClick("#gwCdClear", () => {
      pushUndoState();
      clearLayers();
      draft.geometries = {
        boundary: [],
        paths: [],
        exclusions: [],
        denseZones: [],
        assets: []
      };
      redrawSurveyDraft();
      refreshRightPanel();
      updateUndoRedoButtons();
    });

    designerRoot.querySelector("#gwCdClose").onclick = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
    };
    designerRoot.querySelector("#gwCdSave").onclick = saveDraft;
    designerRoot.querySelector("#gwCdExport").onclick = exportDraftJson;

    designerRoot.querySelector("#gwCdGeoFile").onchange = (evt) => {
      handleImportGeoFile(evt.target.files?.[0]);
      evt.target.value = "";
    };

    ["gwCdName", "gwCdDescription", "gwCdTimeRange", "gwCdTargetTaxon", "gwCdPublicMode"].forEach(
      (id) => {
        designerRoot.querySelector(`#${id}`)?.addEventListener("input", () => {
          syncDraftFromForm();
          refreshRightPanel();
        });
      }
    );
  }

  function showSurveyOnMap(surveyId) {
    const surveys = loadSurveys();
    const c = surveys.find((x) => x.id === surveyId);
    if (!c) return;

    ensureLayers();
    clearLayers();

    const g = c.geometries || {};

    if (Array.isArray(g.boundary)) {
      if (g.boundary.length && g.boundary[0]?.lat != null) {
        L.polygon(
          g.boundary.map((p) => [p.lat, p.lng]),
          {
            pane: "gwSurveyDesignerPane",
            color: colorForKind("boundary"),
            weight: 3,
            fillColor: colorForKind("boundary"),
            fillOpacity: 0.1
          }
        ).addTo(layers.boundary);
      }

      g.boundary.forEach((obj) => {
        if (obj?.geojson) {
          L.geoJSON(obj.geojson, {
            pane: "gwSurveyDesignerPane",
            style: {
              color: colorForKind("boundary"),
              weight: 3,
              fillOpacity: 0.1
            }
          }).addTo(layers.boundary);
        }
      });
    }

    (g.paths || []).forEach((path) => {
      L.polyline(
        path.map((p) => [p.lat, p.lng]),
        {
          pane: "gwSurveyDesignerPane",
          color: colorForKind("path"),
          weight: 5,
          opacity: 0.95,
          dashArray: "8 7"
        }
      ).addTo(layers.paths);
    });

    (g.exclusions || []).forEach((poly) => {
      L.polygon(
        poly.map((p) => [p.lat, p.lng]),
        {
          pane: "gwSurveyDesignerPane",
          color: colorForKind("exclusion"),
          weight: 2,
          fillColor: colorForKind("exclusion"),
          fillOpacity: 0.2
        }
      ).addTo(layers.exclusions);
    });

    (g.denseZones || []).forEach((poly) => {
      L.polygon(
        poly.map((p) => [p.lat, p.lng]),
        {
          pane: "gwSurveyDesignerPane",
          color: colorForKind("dense"),
          weight: 2,
          fillColor: colorForKind("dense"),
          fillOpacity: 0.22
        }
      ).addTo(layers.denseZones);
    });

    (g.assets || []).forEach((a) => {
      if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) return;

      L.circleMarker([a.lat, a.lng], {
        pane: "gwSurveyDesignerPane",
        radius: 9,
        color: colorForKind("asset"),
        fillColor: colorForKind("asset"),
        fillOpacity: 0.88,
        weight: 2
      })
        .bindPopup(
          `
      <b>${esc(a.name || "Survey asset")}</b><br>
      ${esc(a.type || "")}<br>
      <span>${esc(a.instructions || "")}</span>
    `
        )
        .addTo(layers.assets);
    });
  }

  window.GridWildSurveyDesigner = {
    open,
    openExisting,
    close,
    minimize: minimizeDesigner,
    restore: restoreDesigner,
    isMinimized: () => designerMinimized === true,
    loadSurveys,
    saveSurveys,
    deleteSurvey,
    showSurveyOnMap
  };
})();
