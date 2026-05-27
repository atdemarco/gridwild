// -----------------------------------------------------------------------------
// GridWild Player Presence
// Publishes the current signed-in player's live HUD location and renders nearby
// visible players on the map.
// -----------------------------------------------------------------------------

(function () {
  const VISIBILITY_KEY = "gwPresenceVisibility";
  const PANE = "gw-player-presence-pane";
  const HEARTBEAT_INTERVAL_MS = 12000;
  const POLL_INTERVAL_MS = 15000;
  const MIN_POLL_INTERVAL_MS = 8000;
  const MAX_POLL_RADIUS_M = 50000;

  let publishVisibility = localStorage.getItem(VISIBILITY_KEY) || "hidden";
  let lastLocation = null;
  let lastHeartbeatAt = 0;
  let heartbeatInFlight = false;
  let lastPollAt = 0;
  let pollInFlight = false;
  let pollTimer = null;
  let presenceLayer = null;
  let mapEventsBound = false;
  let stylesInjected = false;

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isSignedIn() {
    return !!(
      window.GridWildAccount?.isSignedIn?.() &&
      window.GridWildAPI?.getPlayerId?.() &&
      window.GridWildAPI?.getSessionToken?.()
    );
  }

  function shouldPublish() {
    return isSignedIn() && publishVisibility === "visible";
  }

  function isPublishingVisible() {
    return publishVisibility === "visible";
  }

  function getLastKnownLocation() {
    const loc = lastLocation || window.__gwLastUserLocation || null;
    const lat = Number(loc?.lat ?? loc?.latitude);
    const lng = Number(loc?.lng ?? loc?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      accuracyMeters: Number(loc?.accuracyMeters ?? loc?.accuracy),
      updatedAt: loc?.updatedAt || new Date().toISOString()
    };
  }

  function normalizeLocationDetail(detail = {}) {
    const lat = Number(detail.latitude ?? detail.lat);
    const lng = Number(detail.longitude ?? detail.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      accuracyMeters: Number(detail.accuracy ?? detail.accuracyMeters),
      updatedAt: new Date().toISOString()
    };
  }

  function currentHeading() {
    const heading = Number(window.GridWildCompass?.getState?.()?.heading);
    return Number.isFinite(heading) ? heading : null;
  }

  function injectStyles() {
    if (stylesInjected || document.getElementById("gwPresenceStyles")) {
      stylesInjected = true;
      return;
    }

    const style = document.createElement("style");
    style.id = "gwPresenceStyles";
    style.textContent = `
      .gw-presence-marker {
        width: 58px;
        height: 58px;
        pointer-events: auto;
      }

      .gw-presence-marker-wrap {
        position: relative;
        width: 58px;
        height: 58px;
        display: grid;
        place-items: center;
        transform: translateY(-2px);
      }

      .gw-presence-marker .gw-avatar {
        width: 44px;
        height: 44px;
        filter: drop-shadow(0 4px 10px rgba(0,0,0,0.42));
      }

      .gw-presence-marker.is-offline {
        opacity: 0.42;
      }

      .gw-presence-marker.is-online .gw-presence-pulse {
        position: absolute;
        inset: 5px;
        border-radius: 999px;
        border: 2px solid rgba(158,230,189,0.72);
        animation: gwPresencePulse 1.8s ease-out infinite;
      }

      .gw-presence-label {
        position: absolute;
        left: 50%;
        bottom: -5px;
        max-width: 92px;
        transform: translateX(-50%);
        border-radius: 999px;
        padding: 3px 7px;
        background: rgba(20,17,15,0.88);
        color: #fff7df;
        border: 1px solid rgba(240,209,138,0.32);
        font-size: 10px;
        font-weight: 900;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-presence-toggle-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        margin-top: 8px;
      }

      .gw-presence-toggle-row input {
        width: 20px;
        height: 20px;
        accent-color: #9ee6bd;
      }

      .gw-presence-toggle-title {
        color: #f4e8cf;
        font-size: 13px;
        font-weight: 950;
      }

      .gw-presence-toggle-copy,
      .gw-presence-status {
        color: rgba(239,230,211,0.64);
        font-size: 12px;
        line-height: 1.35;
      }

      .gw-presence-status {
        margin-top: 8px;
      }

      @keyframes gwPresencePulse {
        from { opacity: 0.92; transform: scale(0.78); }
        to { opacity: 0; transform: scale(1.34); }
      }
    `;

    document.head.appendChild(style);
    stylesInjected = true;
  }

  function ensureLayer() {
    if (!window.map || !window.L) return null;

    if (!map.getPane(PANE)) {
      map.createPane(PANE);
      map.getPane(PANE).style.zIndex = 842;
      map.getPane(PANE).style.pointerEvents = "auto";
    }

    if (!presenceLayer) {
      presenceLayer = L.layerGroup([], { pane: PANE }).addTo(map);
    }

    return presenceLayer;
  }

  function equipmentItemsFromRow(row) {
    const catalog = window.GridWildStore?.getCatalog?.() || [];
    const out = {};

    ["title", "frame", "trail", "companion", "hat"].forEach((slot) => {
      const itemId = row?.[slot];
      out[slot] = itemId ? catalog.find((item) => item.id === itemId) || null : null;
    });

    return out;
  }

  function avatarStateForPresence(presence) {
    const player = presence?.player || {};

    return {
      character: {
        archetype: player.archetype || "naturalist",
        icon: player.icon || "",
        color: player.color || "fern"
      },
      equipped: equipmentItemsFromRow(presence?.equipment || {}),
      displayName: player.display_name || "Explorer",
      archetypeLabel: "Explorer",
      color: player.color || "fern",
      baseIcon: player.icon || ""
    };
  }

  function markerHtml(presence) {
    const name = presence?.player?.display_name || "Explorer";
    const status = presence?.status === "offline" ? "offline" : "online";
    const avatarHtml = window.GridWildAvatarRenderer?.renderHtml?.({
      state: avatarStateForPresence(presence)
    }) || `<div class="gw-avatar"><div class="gw-avatar-stage"></div></div>`;

    return `
      <div class="gw-presence-marker-wrap">
        ${status === "online" ? `<div class="gw-presence-pulse"></div>` : ""}
        ${avatarHtml}
        <div class="gw-presence-label">${esc(name)}</div>
      </div>
    `;
  }

  function tooltipText(presence) {
    const name = presence?.player?.display_name || "Explorer";
    const status = presence?.status === "offline" ? "signed off" : "online";
    return `${esc(name)}<br>${esc(status)}`;
  }

  function renderLayer(presences = []) {
    injectStyles();

    const layer = ensureLayer();
    if (!layer) return;

    layer.clearLayers();

    presences.forEach((presence) => {
      const lat = Number(presence?.lat);
      const lng = Number(presence?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const status = presence.status === "offline" ? "offline" : "online";
      const icon = L.divIcon({
        className: `gw-presence-marker is-${status}`,
        html: markerHtml(presence),
        iconSize: [58, 58],
        iconAnchor: [29, 50]
      });

      const marker = L.marker([lat, lng], {
        icon,
        pane: PANE,
        interactive: true
      });

      marker.bindTooltip(tooltipText(presence), {
        direction: "top",
        offset: [0, -14],
        opacity: 0.96
      });

      marker.addTo(layer);
    });
  }

  function clearLayer() {
    if (presenceLayer) presenceLayer.clearLayers();
  }

  function mapRadiusMeters() {
    if (!window.map?.getCenter || !window.map?.getBounds) return 5000;

    const center = map.getCenter();
    const bounds = map.getBounds();
    const edge = bounds.getNorthEast();
    const radius = center.distanceTo(edge) * 1.15;

    if (!Number.isFinite(radius)) return 5000;
    return Math.max(500, Math.min(MAX_POLL_RADIUS_M, Math.round(radius)));
  }

  async function sendHeartbeat(options = {}) {
    const force = !!options.force;
    if (!shouldPublish()) return null;

    const loc = getLastKnownLocation();
    if (!loc) {
      refreshSettingsStatus();
      return null;
    }

    const now = Date.now();
    if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return null;
    if (heartbeatInFlight && !force) return null;

    heartbeatInFlight = true;

    try {
      const result = await window.GridWildAPI.upsertPlayerPresence({
        visibility: "visible",
        status: "online",
        lat: loc.lat,
        lng: loc.lng,
        accuracy_meters: Number.isFinite(loc.accuracyMeters) ? loc.accuracyMeters : null,
        heading: currentHeading()
      });

      window.__gwState = window.__gwState || {};
      window.__gwState.playerPresence = result.presence || null;
      lastHeartbeatAt = Date.now();
      refreshSettingsStatus();
      return result.presence;
    } catch (err) {
      console.warn("Could not sync player presence:", err);
      refreshSettingsStatus("Could not sync HUD presence.");
      return null;
    } finally {
      heartbeatInFlight = false;
    }
  }

  async function markOffline(options = {}) {
    if (!isSignedIn()) return null;

    try {
      const result = await window.GridWildAPI.upsertPlayerPresence({
        visibility: publishVisibility === "visible" ? "visible" : "hidden",
        status: "offline"
      }, {
        keepalive: !!options.keepalive
      });

      window.__gwState = window.__gwState || {};
      window.__gwState.playerPresence = result.presence || null;
      refreshSettingsStatus();
      return result.presence;
    } catch (err) {
      console.warn("Could not mark player presence offline:", err);
      return null;
    }
  }

  async function pollNearby(options = {}) {
    if (!isSignedIn()) {
      clearLayer();
      return null;
    }

    if (!window.map?.getCenter) return null;

    const now = Date.now();
    if (!options.force && now - lastPollAt < MIN_POLL_INTERVAL_MS) return null;
    if (pollInFlight) return null;

    const center = map.getCenter();
    pollInFlight = true;

    try {
      const data = await window.GridWildAPI.getNearbyPlayerPresence(
        center.lat,
        center.lng,
        { radius_m: mapRadiusMeters() }
      );

      renderLayer(data.presences || []);
      lastPollAt = Date.now();
      return data.presences || [];
    } catch (err) {
      console.warn("Could not load nearby player presence:", err);
      return null;
    } finally {
      pollInFlight = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;

    pollTimer = setInterval(() => {
      pollNearby();
    }, POLL_INTERVAL_MS);

    pollNearby({ force: true });
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function bindMapEvents() {
    if (mapEventsBound || !window.map?.on) return;
    mapEventsBound = true;

    map.on("moveend zoomend", () => {
      pollNearby();
    });
  }

  function statusText(extra = "") {
    if (extra) return extra;
    if (!isSignedIn()) return "Sign in to share and see live HUD players.";
    if (publishVisibility !== "visible") return "You are hidden from other players' HUDs.";
    if (!getLastKnownLocation()) return "Visible once GridWild gets your location.";
    return "Visible on nearby signed-in players' HUDs.";
  }

  function refreshSettingsStatus(extra = "") {
    const toggle = document.getElementById("gwPresenceVisibilityToggle");
    if (toggle) toggle.checked = publishVisibility === "visible";

    const status = document.getElementById("gwPresenceStatusLine");
    if (status) status.textContent = statusText(extra);
  }

  async function setVisibility(visible) {
    publishVisibility = visible ? "visible" : "hidden";
    localStorage.setItem(VISIBILITY_KEY, publishVisibility);
    refreshSettingsStatus();

    if (!isSignedIn()) return;

    if (publishVisibility === "visible") {
      await sendHeartbeat({ force: true });
    } else {
      await markOffline();
    }

    pollNearby({ force: true });
  }

  function renderSettingsCardHtml() {
    injectStyles();

    return `
      <div class="gw-card" id="gwPresenceCard">
        <div class="gw-card-title">HUD Presence</div>
        <label class="gw-presence-toggle-row">
          <input
            id="gwPresenceVisibilityToggle"
            type="checkbox"
            ${publishVisibility === "visible" ? "checked" : ""}
          >
          <span>
            <div class="gw-presence-toggle-title">Show me on HUD</div>
            <div class="gw-presence-toggle-copy">
              Share your live avatar location with nearby signed-in players.
            </div>
          </span>
        </label>
        <div class="gw-presence-status" id="gwPresenceStatusLine">
          ${esc(statusText())}
        </div>
      </div>
    `;
  }

  function bindSettings(root = document) {
    const toggle = root.querySelector("#gwPresenceVisibilityToggle");
    if (!toggle || toggle.dataset.bound === "true") {
      refreshSettingsStatus();
      return;
    }

    toggle.dataset.bound = "true";
    toggle.addEventListener("change", () => {
      setVisibility(toggle.checked);
    });

    refreshSettingsStatus();
  }

  function handleBootstrap(event) {
    const presence = event?.detail?.playerPresence || window.__gwState?.playerPresence || null;
    const stored = localStorage.getItem(VISIBILITY_KEY);

    if (!stored && presence?.visibility) {
      publishVisibility = presence.visibility === "visible" ? "visible" : "hidden";
      localStorage.setItem(VISIBILITY_KEY, publishVisibility);
    }

    bindMapEvents();
    startPolling();
    sendHeartbeat({ force: true });
    refreshSettingsStatus();
  }

  window.addEventListener("gwBootstrapReady", handleBootstrap);

  window.addEventListener("gwAccountChanged", () => {
    if (!isSignedIn()) {
      stopPolling();
      clearLayer();
    } else {
      startPolling();
      sendHeartbeat({ force: true });
    }

    refreshSettingsStatus();
  });

  window.addEventListener("gwUserLocationUpdated", (event) => {
    const loc = normalizeLocationDetail(event.detail || {});
    if (loc) lastLocation = loc;
    sendHeartbeat();
  });

  window.addEventListener("pagehide", () => {
    if (publishVisibility === "visible") {
      markOffline({ keepalive: true });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendHeartbeat({ force: true });
      pollNearby({ force: true });
    }
  });

  window.GridWildPresence = {
    bindSettings,
    clearLayer,
    isPublishingVisible,
    markOffline,
    pollNearby,
    renderSettingsCardHtml,
    sendHeartbeat,
    setVisibility,
    startPolling,
    stopPolling
  };
})();
