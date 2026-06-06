// -----------------------------------------------------------------------------
// GridWild Survey Layer
// Join/leave/show/hide saved surveys on main HUD map
// -----------------------------------------------------------------------------

(function () {
  const STATE_KEY = "gw_survey_user_state_v1";
  const PANE = "gwSurveyHudPane";

  let layer = null;
  let lastSurveyInfoOpen = { id: null, at: 0 };

  function loadState() {
    const rows = window.__gwState?.playerSurveys;

    if (Array.isArray(rows)) {
      const out = {};

      rows.forEach((row) => {
        out[row.survey_id] = {
          joined: !!row.joined,
          visible: !!row.visible
        };
      });

      return out;
    }

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

  function joinedSurveyIds() {
    const state = loadState();
    return Object.keys(state).filter((id) => state[id]?.joined);
  }

  function setSurveyState(id, patch) {
    const state = loadState();

    state[id] = {
      ...(state[id] || {}),
      ...patch
    };

    if (!state[id].joined) {
      state[id].visible = false;
    }

    // Immediate local/runtime update.
    window.__gwState = window.__gwState || {};
    window.__gwState.playerSurveys = [
      ...(window.__gwState.playerSurveys || []).filter((x) => x.survey_id !== id),
      {
        survey_id: id,
        joined: !!state[id].joined,
        visible: !!state[id].visible
      }
    ];

    saveState(state);
    render();

    // DB sync.
    window.GridWildAPI?.setPlayerSurveyState?.(id, {
      joined: !!state[id].joined,
      visible: !!state[id].visible
    })
      .then((result) => {
        window.__gwState = window.__gwState || {};
        window.__gwState.playerSurveys = [
          ...(window.__gwState.playerSurveys || []).filter((x) => x.survey_id !== id),
          result.player_survey
        ];

        window.dispatchEvent(new CustomEvent("gwSurveyStateChanged"));
      })
      .catch((err) => {
        console.warn("Could not sync survey state:", err);
      });
  }

  function isJoined(id) {
    return !!getSurveyState(id).joined;
  }

  function isVisible(id) {
    const s = getSurveyState(id);
    return !!s.joined && !!s.visible;
  }

  function join(id) {
    setSurveyState(id, { joined: true, visible: true });
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

  function persistSurveyViewPreference(enabled) {
    try {
      const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
      uiState.showSurveyView = enabled === true;
      localStorage.setItem("gw_ui_state", JSON.stringify(uiState));
    } catch {}
  }

  function isSurveyViewEnabled() {
    const checkbox = document.getElementById("toggleSurveyView");
    if (checkbox) return checkbox.checked === true;
    return window.__gwState?.showSurveyView !== false;
  }

  function setSurveyViewEnabled(enabled) {
    const next = enabled === true;

    window.__gwState = window.__gwState || {};
    window.__gwState.showSurveyView = next;

    const checkbox = document.getElementById("toggleSurveyView");
    if (checkbox) checkbox.checked = next;

    persistSurveyViewPreference(next);

    if (next) {
      joinedSurveyIds().forEach((id) => {
        const state = getSurveyState(id);
        if (state.joined && !state.visible) {
          setSurveyState(id, { visible: true });
        }
      });
    }

    render();

    window.dispatchEvent(
      new CustomEvent("gridwild:surveyviewchange", {
        detail: { showSurveyView: next }
      })
    );
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
    return (
      {
        boundary: "#76e7bf",
        path: "#ffe082",
        exclusion: "#ff7a6b",
        dense: "#b68cff",
        asset: "#f0d18a"
      }[kind] || "#ffe082"
    );
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

  function getSurveyGeometryStyle(survey, kind, index = 0) {
    const styles = survey?.geometries?.styles || {};

    if (kind === "boundary") {
      return { ...defaultGeometryStyle(kind), ...(styles.boundary || {}) };
    }

    const key = kind === "path" ? "paths" : kind === "exclusion" ? "exclusions" : "denseZones";

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

  function stopSurveyHudEvent(evt) {
    if (evt?.originalEvent && window.L?.DomEvent?.stop) {
      L.DomEvent.stop(evt.originalEvent);
    }

    if (typeof evt?.preventDefault === "function") evt.preventDefault();
    if (typeof evt?.stopPropagation === "function") evt.stopPropagation();
  }

  function openSurveyHudInfo(survey, evt) {
    stopSurveyHudEvent(evt);

    const now = Date.now();
    if (lastSurveyInfoOpen.id === survey?.id && now - lastSurveyInfoOpen.at < 450) {
      return;
    }
    lastSurveyInfoOpen = { id: survey?.id || null, at: now };

    if (window.GridWildQuests?.openSurveyInfo) {
      window.GridWildQuests.openSurveyInfo(survey.id);
      return;
    }

    const latlng = evt?.latlng || map.getCenter();
    L.popup({ autoPan: true })
      .setLatLng(latlng)
      .setContent(
        `
        <b>${esc(survey.name || "Untitled Survey")}</b><br>
        <span>${esc(survey.description || "No description yet.")}</span>
      `
      )
      .openOn(map);
  }

  function bindSurveyHudInfo(target, survey) {
    if (!target?.on || !survey?.id) return target;

    target.on("click", (evt) => openSurveyHudInfo(survey, evt));
    target.on("dblclick", (evt) => openSurveyHudInfo(survey, evt));
    return target;
  }

  function addPolygon(points, kind, style, survey) {
    if (!Array.isArray(points) || !points.length) return;

    return bindSurveyHudInfo(
      L.polygon(
        points.map((p) => [p.lat, p.lng]),
        {
          pane: PANE,
          color: style.lineColor,
          weight: style.lineWeight,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          interactive: true,
          bubblingMouseEvents: false
        }
      ).addTo(layer),
      survey
    );
  }

  function renderSurvey(c) {
    const g = c.geometries || {};

    if (Array.isArray(g.boundary)) {
      if (g.boundary.length && g.boundary[0]?.lat != null) {
        addPolygon(g.boundary, "boundary", getSurveyGeometryStyle(c, "boundary", 0), c);
      }

      g.boundary.forEach((obj) => {
        if (obj?.geojson) {
          bindSurveyHudInfo(
            L.geoJSON(obj.geojson, {
              pane: PANE,
              interactive: true,
              bubblingMouseEvents: false,
              onEachFeature: (_feature, featureLayer) => {
                bindSurveyHudInfo(featureLayer, c);
              },
              style: {
                color: colorForKind("boundary"),
                weight: 3,
                fillOpacity: 0.08
              }
            }).addTo(layer),
            c
          );
        }
      });
    }

    (g.paths || []).forEach((path, index) => {
      if (!Array.isArray(path) || !path.length) return;

      const s = getSurveyGeometryStyle(c, "path", index);

      bindSurveyHudInfo(
        L.polyline(
          path.map((p) => [p.lat, p.lng]),
          {
            pane: PANE,
            color: s.lineColor,
            weight: s.lineWeight,
            opacity: 0.95,
            dashArray: "8 7",
            interactive: true,
            bubblingMouseEvents: false
          }
        ).addTo(layer),
        c
      );
    });

    (g.exclusions || []).forEach((poly, index) => {
      addPolygon(poly, "exclusion", getSurveyGeometryStyle(c, "exclusion", index), c);
    });

    (g.denseZones || []).forEach((poly, index) => {
      addPolygon(poly, "dense", getSurveyGeometryStyle(c, "dense", index), c);
    });

    (g.assets || []).forEach((a) => {
      if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) return;

      const latlng = L.latLng(Number(a.lat), Number(a.lng));

      const marker = L.marker(latlng, {
        pane: PANE,
        interactive: true,
        bubblingMouseEvents: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="gw-survey-asset-dot" style="--gw-asset-color:${esc(a.color || colorForKind("asset"))};">${esc(a.icon || "📍")}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      });

      marker.on("click", (evt) => {
        stopSurveyHudEvent(evt);
        flashLabel(latlng, a.name || a.type || "Survey asset");
        openSurveyHudInfo(c, evt);
      });
      marker.on("dblclick", (evt) => openSurveyHudInfo(c, evt));

      marker.addTo(layer);
    });
  }

  function render() {
    const l = ensureLayer();
    if (!l) return;

    l.clearLayers();

    if (!isSurveyViewEnabled()) return;

    const surveys = window.GridWildSurveyDesigner?.loadSurveys?.() || [];
    surveys.forEach((c) => {
      if (isVisible(c.id)) renderSurvey(c);
    });
  }

  window.GridWildSurveyLayer = {
    loadState,
    getSurveyState,
    setSurveyState,
    isJoined,
    isVisible,
    join,
    leave,
    show,
    hide,
    isSurveyViewEnabled,
    setSurveyViewEnabled,
    render
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(render, 100);
  });

  window.addEventListener("gwSurveyStateChanged", render);
})();
