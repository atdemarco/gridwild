// -----------------------------------------------------------------------------
// GridWild Survey Layer
// Join/leave/show/hide saved surveys on main HUD map
// -----------------------------------------------------------------------------

(function () {
  const STATE_KEY = "gw_survey_user_state_v1";
  const PANE = "gwSurveyHudPane";

  let layer = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state || {}));
    window.dispatchEvent(new CustomEvent("gwSurveyStateChanged"));
  }

  function getSurveyState(id) {
    const state = loadState();
    return state[id] || { joined: false, visible: false };
  }

  function setSurveyState(id, patch) {
    const state = loadState();
    state[id] = { ...(state[id] || {}), ...patch };

    if (!state[id].joined) state[id].visible = false;

    saveState(state);
    render();
  }

  function isJoined(id) {
    return !!getSurveyState(id).joined;
  }

  function isVisible(id) {
    const s = getSurveyState(id);
    return !!s.joined && !!s.visible;
  }

  function join(id) {
    setSurveyState(id, { joined: true });
  }

  function leave(id) {
    setSurveyState(id, { joined: false, visible: false });
  }

  function show(id) {
    if (!isJoined(id)) return;
    setSurveyState(id, { visible: true });
  }

  function hide(id) {
    setSurveyState(id, { visible: false });
  }

  function ensureLayer() {
    if (!window.map || !window.L) return null;

    if (!map.getPane(PANE)) {
      map.createPane(PANE);
      map.getPane(PANE).style.zIndex = 760; // above heat/grid, below fog/designer
      map.getPane(PANE).style.pointerEvents = "auto";
    }

    if (!layer) {
      layer = L.layerGroup([], { pane: PANE }).addTo(map);
      injectStyles();
    }

    return layer;
  }

  function colorForKind(kind) {
    return {
      boundary: "#76e7bf",
      path: "#ffe082",
      exclusion: "#ff7a6b",
      dense: "#b68cff",
      asset: "#f0d18a"
    }[kind] || "#ffe082";
  }


  function defaultGeometryStyle(kind) {
  const c = colorForKind(kind);
  return {
    fillColor: c,
    lineColor: c,
    lineWeight: kind === "path" ? 5 : kind === "boundary" ? 3 : 2,
    fillOpacity: kind === "path" ? 0 : kind === "boundary" ? 0.10 : kind === "exclusion" ? 0.20 : 0.22
  };
}

function getSurveyGeometryStyle(survey, kind, index = 0) {
  const styles = survey?.geometries?.styles || {};

  if (kind === "boundary") {
    return { ...defaultGeometryStyle(kind), ...(styles.boundary || {}) };
  }

  const key =
    kind === "path" ? "paths" :
    kind === "exclusion" ? "exclusions" :
    "denseZones";

  return { ...defaultGeometryStyle(kind), ...((styles[key] || [])[index] || {}) };
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
    if (document.getElementById("gwSurveyHudLayerStyles")) return;

    const style = document.createElement("style");
    style.id = "gwSurveyHudLayerStyles";
    style.textContent = `
      .gw-survey-asset-dot {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 13px;
        background: var(--gw-asset-color, #f0d18a);
        border: 2px solid rgba(255,255,255,0.92);
        box-shadow: 0 0 16px color-mix(in srgb, var(--gw-asset-color, #f0d18a) 70%, transparent);
      }

      .gw-survey-float-label {
        position: absolute;
        z-index: 99999;
        pointer-events: none;
        transform: translate(-50%, -120%);
        padding: 7px 10px;
        border-radius: 999px;
        color: #efe6d3;
        background: rgba(20,17,15,0.94);
        border: 1px solid rgba(240,209,138,0.60);
        box-shadow: 0 10px 28px rgba(0,0,0,0.36);
        font-size: 12px;
        font-weight: 900;
        white-space: nowrap;
        opacity: 1;
        transition: opacity 650ms ease, transform 650ms ease;
      }

      .gw-survey-float-label.fade {
        opacity: 0;
        transform: translate(-50%, -150%);
      }
    `;

    document.head.appendChild(style);
  }

  function flashLabel(latlng, text) {
    const p = map.latLngToContainerPoint(latlng);
    const el = document.createElement("div");
    el.className = "gw-survey-float-label";
    el.textContent = text || "Survey asset";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;

    map.getContainer().appendChild(el);

    setTimeout(() => el.classList.add("fade"), 900);
    setTimeout(() => el.remove(), 1600);
  }

  function addPolygon(points, kind, style) {
    if (!Array.isArray(points) || !points.length) return;

    L.polygon(points.map(p => [p.lat, p.lng]), {
      pane: PANE,
      color: style.lineColor,
      weight: style.lineWeight,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      interactive: false
    }).addTo(layer);
  }

  function renderSurvey(c) {
    const g = c.geometries || {};

    if (Array.isArray(g.boundary)) {
      if (g.boundary.length && g.boundary[0]?.lat != null) {
        addPolygon(g.boundary, "boundary", getSurveyGeometryStyle(c, "boundary", 0));
      }

      g.boundary.forEach(obj => {
        if (obj?.geojson) {
          L.geoJSON(obj.geojson, {
            pane: PANE,
            interactive: false,
            style: {
              color: colorForKind("boundary"),
              weight: 3,
              fillOpacity: 0.08
            }
          }).addTo(layer);
        }
      });
    }

    (g.paths || []).forEach((path, index) => {
      if (!Array.isArray(path) || !path.length) return;

      const s = getSurveyGeometryStyle(c, "path", index);

      L.polyline(path.map(p => [p.lat, p.lng]), {
        pane: PANE,
        color: s.lineColor,
        weight: s.lineWeight,
        opacity: 0.95,
        dashArray: "8 7",
        interactive: false
      }).addTo(layer);
    });

    (g.exclusions || []).forEach((poly, index) => {
      addPolygon(poly, "exclusion", getSurveyGeometryStyle(c, "exclusion", index));
    });

    (g.denseZones || []).forEach((poly, index) => {
      addPolygon(poly, "dense", getSurveyGeometryStyle(c, "dense", index));
    });

    (g.assets || []).forEach(a => {
      if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) return;

      const latlng = L.latLng(Number(a.lat), Number(a.lng));

      const marker = L.marker(latlng, {
        pane: PANE,
        interactive: true,
        icon: L.divIcon({
          className: "",
          html: `<div class="gw-survey-asset-dot" style="--gw-asset-color:${esc(a.color || colorForKind("asset"))};">${esc(a.icon || "📍")}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      });

      marker.on("click", () => {
        flashLabel(latlng, a.name || a.type || "Survey asset");
      });

      marker.addTo(layer);
    });
  }

  function render() {
    const l = ensureLayer();
    if (!l) return;

    l.clearLayers();

    const surveys = window.GridWildSurveyDesigner?.loadSurveys?.() || [];
    surveys.forEach(c => {
      if (isVisible(c.id)) renderSurvey(c);
    });
  }

  window.GridWildSurveyLayer = {
    loadState,
    getSurveyState,
    isJoined,
    isVisible,
    join,
    leave,
    show,
    hide,
    render
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(render, 100);
  });

  window.addEventListener("gwSurveyStateChanged", render);
})();