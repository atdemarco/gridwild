// -----------------------------------------------------------------------------
// GridWild Party System
// Online-backed parties, QR cover screen, recaps, route/evidence display, map beacon
// -----------------------------------------------------------------------------

(function () {
  const PANE = "gwPartyPane";
  const PARTY_ROUTE_THROTTLE_MS = 8000;
  const PARTY_ROUTE_MAX_ACCURACY_M = 60;
  const PARTY_ROUTE_SAMPLE_GAP_MS = 90 * 1000;
  const PARTY_ROUTE_SAMPLE_GAP_MIN_METERS = 35;
  const PARTY_ROUTE_SAMPLE_GAP_SPEED_MPS = 4.5;
  const PARTY_ROUTE_SAMPLE_GAP_FORCE_METERS = 500;
  const PARTY_ROUTE_OUTLIER_MIN_DISTANCE_M = 24;
  const PARTY_ROUTE_OUTLIER_FAST_SPEED_MPS = 4.5;
  const PARTY_ROUTE_OUTLIER_SOFT_SPEED_MPS = 2.4;
  const PARTY_ROUTE_OUTLIER_SOFT_ACCURACY_M = 25;
  const PARTY_ROUTE_OUTLIER_CONFIRM_M = 30;
  const PARTY_ROUTE_OUTLIER_PENDING_TTL_MS = 90 * 1000;
  const PARTY_ROUTE_RESUME_UNCERTAIN_AFTER_MS = 10 * 1000;
  const PARTY_ROUTE_RESUME_UNCERTAIN_WINDOW_MS = 45 * 1000;
  const PARTY_ROUTE_UNCERTAIN_MIN_DISTANCE_M = 12;
  const PARTY_ROUTE_LOW_QUALITY_GAP_MS = 25 * 1000;
  const PARTY_ROUTE_LOW_QUALITY_GAP_ACCURACY_M = 35;
  const PARTY_HUD_COLLAPSED_KEY = "gw_party_hud_collapsed";
  const PARTY_ROUTE_OUTBOX_KEY = "gw_party_route_outbox_v1";
  const PARTY_ROUTE_OUTBOX_LIMIT = 1200;
  const PARTY_ROUTE_RETRY_MS = 15000;
  const PARTY_ROUTE_FLUSH_BATCH = 80;
  const PARTY_END_OUTBOX_KEY = "gw_party_end_outbox_v1";
  const PARTY_END_RETRY_MS = 20000;

  let partyLayer = null;
  let partyMapLayers = null;
  const partyLiveRouteState = {
    partyId: null,
    segments: [],
    gaps: [],
    startMarker: null,
    latestMarker: null,
    beaconMarker: null
  };
  let partyHudRaiseTab = null;
  let partyRaiseTabPositionBound = false;
  let partyRouteFlushTimer = null;
  let partyRouteFlushPromise = null;
  let partyEndFlushTimer = null;
  let partyEndFlushPromise = null;
  let partyRouteBackgroundedAt = document.hidden ? Date.now() : 0;
  let partyRouteResumeUncertainUntil = 0;
  let partyRouteResumeToken = 0;
  const partyRouteOutlierCandidates = new Map();
  const partyRouteResumeTokenByParty = new Map();

  const PARTY_TEMPLATES = [
    {
      key: "birds",
      emoji: "🐦",
      label: "Bird Walk",
      title: "Bird Walk",
      goalType: "birds",
      target: 20,
      durationMinutes: 90
    },
    {
      key: "ants",
      emoji: "🐜",
      label: "Ant Hunt",
      title: "Ant Hunt",
      goalType: "ants",
      target: 10,
      durationMinutes: 60
    },
    {
      key: "insects",
      emoji: "🦋",
      label: "Insect Sweep",
      title: "Insect Sweep",
      goalType: "insects",
      target: 25,
      durationMinutes: 60
    },
    {
      key: "fungi",
      emoji: "🍄",
      label: "Fungus / Lichen",
      title: "Fungus Foray",
      goalType: "fungi",
      target: 12,
      durationMinutes: 90
    },
    {
      key: "plants",
      emoji: "🌿",
      label: "Plant Survey",
      title: "Plant Survey",
      goalType: "plants",
      target: 20,
      durationMinutes: 60
    },
    {
      key: "any",
      emoji: "🌎",
      label: "Bioblitz",
      title: "Mini Bioblitz",
      goalType: "any",
      target: 50,
      durationMinutes: 120
    }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function isoOrNow(value) {
    const ms = Date.parse(value || "");
    return Number.isFinite(ms) ? new Date(ms).toISOString() : nowISO();
  }

  function readStoredArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeStoredArray(key, rows = []) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch (err) {
      console.warn("Could not save GridWild party local queue:", err);
    }
  }

  function shortRouteId() {
    return `${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "time TBD";

    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function loadParties() {
    return getAllParties();
  }

  function getActivePartyId() {
    return window.GridWildPartyLive?.getActivePartyId?.() || "";
  }

  function setActivePartyId(id) {
    window.GridWildPartyLive?.setActivePartyId?.(id || null);

    window.dispatchEvent(new CustomEvent("gwActivePartyChanged", { detail: { id: id || null } }));
    refreshMapBeacon();
    scheduleActivePartyHudRender();
  }

  function normalizeDbPartyForLegacy(p) {
    if (!p) return null;

    const locationConfig = p.location_config || {};
    const locationMode = p.location_mode || locationConfig.locationMode || "anywhere";
    const isActiveParty = p.id === window.__gwState?.party?.id;
    const activeMembers = window.__gwState?.partyMembers || [];
    const mode =
      p.status === "ended"
        ? "ended"
        : p.status === "scheduled" || (p.starts_at && new Date(p.starts_at) > new Date())
          ? "scheduled"
          : "live";
    const fallbackCenter = window.map?.getCenter?.();
    const mapLatLng = getPartyMapLatLng({
      ...p,
      locationMode,
      location: locationConfig.location
    });

    return {
      id: p.id,
      createdBy: p.created_by || null,
      title: p.name || "Field Party",
      host: "Online",
      mode,
      status: p.status || "active",
      visibility: p.visibility || "public",
      goalType: "any",
      goalLabel: "Open field party",
      progress: Number(p.progress ?? (isActiveParty ? window.__gwState?.partyProgress : 0) ?? 0),
      target: Number(p.target || 10),
      memberCount: Number(
        p.member_count || p.memberCount || (isActiveParty ? activeMembers.length : 1) || 1
      ),
      distanceLabel: "online",
      startsAt: p.starts_at || p.created_at || new Date().toISOString(),
      endedAt: p.ended_at || p.endedAt || null,
      completedAt: p.ended_at || p.completedAt || null,
      durationMinutes: Number(p.duration_minutes || 60),
      routeDistanceMeters: Number(p.route_distance_meters || p.routeDistanceMeters || 0),
      linkedQuestId: p.linked_quest_id || p.linkedQuestId || null,
      linkedQuestTitle: p.linked_quest_title || p.linkedQuestTitle || "",
      locationMode,
      locationUserId: p.location_user_id || locationConfig.locationUserId || null,
      location: locationConfig.location || null,
      resolvedLocation: locationConfig.resolvedLocation || null,
      locationLabel:
        p.location_label ||
        locationConfig.location?.label ||
        partyLocationLabel({ ...p, locationMode }),
      lat: Number(mapLatLng?.lat || fallbackCenter?.lat || 38.911325),
      lng: Number(mapLatLng?.lng || fallbackCenter?.lng || -77.076678),
      createdAt: p.created_at || new Date().toISOString(),
      dbBacked: true,
      pending: Boolean(p.pending || p._optimistic)
    };
  }

  function getAllParties() {
    const activeParty = normalizeDbPartyForLegacy(window.__gwState?.party);

    const nearbyParties = (window.__gwState?.nearbyParties || [])
      .map(normalizeDbPartyForLegacy)
      .filter(Boolean);

    const historyParties = (window.__gwState?.partyHistory || [])
      .map(normalizeDbPartyForLegacy)
      .filter(Boolean);

    const snapshotParties = Object.values(window.__gwState?.partySnapshotsById || {})
      .map((snapshot) => normalizeDbPartyForLegacy(snapshot?.party))
      .filter(Boolean);

    const seen = new Set();
    const rows = [];

    function addParty(p) {
      if (!p?.id) return;
      if (seen.has(p.id)) return;
      seen.add(p.id);
      rows.push(p);
    }

    addParty(activeParty);

    nearbyParties.forEach(addParty);
    historyParties.forEach(addParty);
    snapshotParties.forEach(addParty);

    return rows;
  }

  function getParty(id) {
    return getAllParties().find((p) => p.id === id) || null;
  }

  function rememberPartySnapshot(data = {}) {
    const party = data.party || null;
    if (!party?.id) return null;

    window.__gwState = window.__gwState || {};
    window.__gwState.partySnapshotsById = window.__gwState.partySnapshotsById || {};
    window.__gwState.partySnapshotsById[party.id] = {
      party: {
        ...party,
        progress: Number(data.progress || party.progress || 0),
        member_count: Number(data.members?.length || party.member_count || party.memberCount || 0)
      },
      members: data.members || [],
      events: data.events || [],
      evidence: data.evidence || [],
      progress: data.progress || 0,
      route: data.route || []
    };

    return window.__gwState.partySnapshotsById[party.id];
  }

  async function hydratePartySnapshot(id, options = {}) {
    if (!id) return false;

    const existing = window.__gwState?.partySnapshotsById?.[id];
    if (
      options.force !== true &&
      existing?.party &&
      Array.isArray(existing.evidence) &&
      Array.isArray(existing.route)
    ) {
      return true;
    }

    const data = await window.GridWildAPI?.getParty?.(id);
    if (!data?.party?.id) return false;

    let route = [];
    try {
      const routeData = await window.GridWildAPI?.getPartyRoute?.(data.party.id);
      route = routeData?.route || [];
    } catch (err) {
      console.warn("Could not load party history route:", err);
    }

    rememberPartySnapshot({ ...data, route });
    window.dispatchEvent(new CustomEvent("gwPartiesChanged"));
    return true;
  }

  function isJoined(id) {
    const activeId = window.GridWildPartyLive?.getActivePartyId?.();
    const dbPartyId = window.__gwState?.party?.id;

    if (id && (id === activeId || id === dbPartyId)) return true;

    return false;
  }

  function getCurrentUserName() {
    return window.__gwUser?.username || "You";
  }

  function getCurrentUserDisplayName() {
    return window.__gwState?.player?.display_name || window.__gwUser?.username || "You";
  }

  function getLatestUserLocation() {
    const loc = window.__gwLastUserLocation;
    const lat = Number(loc?.lat);
    const lng = Number(loc?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      accuracyMeters: Number(loc?.accuracyMeters),
      updatedAt: loc?.updatedAt || nowISO()
    };
  }

  function normalizePartyLocationInput(form = {}) {
    const mode = ["anywhere", "user", "location"].includes(form.locationMode)
      ? form.locationMode
      : "anywhere";

    const selected =
      form.location && typeof form.location === "object"
        ? {
            label: String(form.location.label || "Selected location"),
            lat: Number(form.location.lat),
            lng: Number(form.location.lng)
          }
        : null;

    return {
      locationMode: mode,
      locationUserId: mode === "user" ? form.locationUserId || "self" : null,
      location:
        mode === "location" &&
        selected &&
        Number.isFinite(selected.lat) &&
        Number.isFinite(selected.lng)
          ? selected
          : null
    };
  }

  function resolvePartyLocationForStart(form = {}) {
    const locationConfig = normalizePartyLocationInput(form);

    if (locationConfig.locationMode === "anywhere") {
      return {
        ok: true,
        ...locationConfig,
        resolvedLocation: null,
        locationLabel: "Anywhere"
      };
    }

    if (locationConfig.locationMode === "location") {
      if (!locationConfig.location) {
        return {
          ok: false,
          reason: "Choose a location for this party."
        };
      }

      return {
        ok: true,
        ...locationConfig,
        resolvedLocation: {
          label: locationConfig.location.label,
          lat: locationConfig.location.lat,
          lng: locationConfig.location.lng,
          source: "location"
        },
        locationLabel: locationConfig.location.label || "Selected location"
      };
    }

    const userLocation = getLatestUserLocation();
    if (!userLocation) {
      return {
        ok: false,
        reason: "Need your location to start this party."
      };
    }

    const label = `${getCurrentUserDisplayName()}'s location`;

    return {
      ok: true,
      ...locationConfig,
      resolvedLocation: {
        label,
        lat: userLocation.lat,
        lng: userLocation.lng,
        accuracyMeters: userLocation.accuracyMeters,
        source: "user",
        resolvedAt: nowISO()
      },
      locationLabel: label
    };
  }

  function partyLocationLabel(p) {
    const mode = p?.locationMode || p?.location_mode || "anywhere";
    if (mode === "user")
      return p.locationLabel || p.location_label || `${getCurrentUserDisplayName()}'s location`;
    if (mode === "location")
      return p.locationLabel || p.location_label || p.location?.label || "Selected location";
    return p?.locationLabel || p?.location_label || "Anywhere";
  }

  function getPartyMapLatLng(p) {
    const mode = p?.locationMode || p?.location_mode || "anywhere";

    if (
      mode === "user" &&
      ((!p?.createdBy && !p?.created_by) ||
        String(p?.createdBy || p?.created_by) === String(window.GridWildAPI?.getPlayerId?.() || ""))
    ) {
      const live = getLatestUserLocation();
      if (live) return { lat: live.lat, lng: live.lng };
    }

    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

    const selectedLat = Number(p?.location?.lat || p?.location_config?.location?.lat);
    const selectedLng = Number(p?.location?.lng || p?.location_config?.location?.lng);
    if (Number.isFinite(selectedLat) && Number.isFinite(selectedLng)) {
      return { lat: selectedLat, lng: selectedLng };
    }

    return null;
  }

  function loadPartyMembers() {
    const activeId = window.__gwState?.party?.id;
    return activeId ? { [activeId]: getPartyMembers(activeId) } : {};
  }

  function savePartyMembers() {
    return false;
  }

  function loadPartyActivity() {
    const activeId = window.__gwState?.party?.id;
    return activeId ? { [activeId]: getPartyActivity(activeId) } : {};
  }

  function savePartyActivity() {
    return false;
  }

  function addPartyActivity(partyId, type, text, meta = {}) {
    if (!partyId) return false;

    window.dispatchEvent(
      new CustomEvent("gwPartyActivityRequested", {
        detail: { partyId, type, text, meta }
      })
    );

    return false;
  }

  function getPartyActivity(partyId) {
    const activeId = window.__gwState?.party?.id;

    if (partyId && activeId === partyId) {
      return (window.__gwState?.partyEvents || []).map((e) => ({
        id: e.id,
        type: e.event_type,
        text: formatDbPartyEvent(e),
        actor: e.player_id,
        t: e.created_at,
        meta: e.payload || {}
      }));
    }

    return [];
  }

  function ensurePartyMembers(party) {
    if (!party?.id) return [];
    return getPartyMembers(party.id);
  }

  function getPartyMembers(partyId) {
    const activeId = window.__gwState?.party?.id;
    const rows =
      partyId && activeId === partyId
        ? window.__gwState?.partyMembers || []
        : window.__gwState?.partySnapshotsById?.[partyId]?.members || [];

    if (partyId) {
      return rows.map((m) => ({
        id: m.id || m.player_id,
        playerId: m.player_id || m.players?.id || null,
        player: m.players || null,
        name: m.players?.display_name || m.player_id?.slice(0, 8) || "Unknown",
        role: m.role || "member",
        joinedAt: m.joined_at,
        isLocal: false,
        dbBacked: true
      }));
    }

    return [];
  }

  function memberRoleLabel(role) {
    return (
      {
        leader: "Leader",
        owner: "Leader",
        creator: "Leader",
        member: "Member",
        host: "Host",
        scout: "Scout",
        identifier: "Identifier",
        observer: "Observer"
      }[role] || "Observer"
    );
  }

  function bindPartyMemberInspection(root) {
    root?.querySelectorAll?.(".gw-party-member-inspect[data-player-id]").forEach((btn) => {
      if (btn.dataset.playerInspectionBound === "true") return;
      btn.dataset.playerInspectionBound = "true";

      btn.addEventListener("click", () => {
        const playerId = btn.dataset.playerId;
        if (!playerId) return;

        const coverRoot = btn.closest("#gwPartyCoverRoot");
        const partyId = coverRoot?.dataset.partyId || "";
        const member = getPartyMembers(partyId).find(
          (row) => String(row.playerId) === String(playerId)
        );

        window.GridWildAvatarInspection?.openPlayer?.(playerId, {
          player: member?.player || {
            id: playerId,
            display_name: member?.name || "Explorer"
          }
        });
      });
    });
  }

  function renderPartyMembersHtml(partyId) {
    const members = getPartyMembers(partyId);

    if (!members.length) {
      return `<div class="gw-muted">No visible participants yet.</div>`;
    }

    return `
    <div class="gw-party-member-grid">
      ${members
        .map(
          (m) => `
        <button class="gw-party-member-pill gw-party-member-inspect" type="button" data-player-id="${esc(m.playerId || "")}">
          <span class="gw-party-member-avatar">${m.role === "host" ? "⭐" : "👤"}</span>
          <span>
            <span class="gw-party-member-name">${esc(m.name)}</span>
            <span class="gw-party-member-role">${esc(memberRoleLabel(m.role))}</span>
          </span>
        </button>
      `
        )
        .join("")}
    </div>
  `;
  }

  function renderPartyActivityHtml(partyId, limit = 8) {
    const rows = getPartyActivity(partyId).slice(0, limit);

    if (!rows.length) {
      return `<div class="gw-muted">No party activity yet.</div>`;
    }

    return `
    <div class="gw-party-activity-list">
      ${rows
        .map(
          (a) => `
        <div class="gw-party-activity-row">
          <span class="gw-party-activity-icon">${activityIcon(a.type)}</span>
          <span>
            <span class="gw-party-activity-text">${esc(a.text)}</span>
            <span class="gw-party-activity-time">${esc(formatWhen(a.t))}</span>
          </span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
  }

  function activityIcon(type) {
    return (
      {
        joined: "👥",
        started: "🎉",
        counted: "✅",
        excluded: "🚫",
        reincluded: "↩️",
        ended: "🏁",
        goal: "🏆"
      }[type] || "•"
    );
  }

  function loadPartyEvidence() {
    const loadedId = window.__gwState?.party?.id;

    return (window.__gwState?.partyEvidence || []).reduce((acc, e) => {
      if (!e.party_id || !e.draft_id) return acc;
      if (loadedId && String(e.party_id) !== String(loadedId)) return acc;

      acc[`${e.party_id}::${e.draft_id}`] = {
        partyId: e.party_id,
        draftId: e.draft_id,
        status: e.status || "counted",
        rawTaxon: e.taxon || null,
        iconicTaxon: e.iconic_taxon || null,
        taxon: partyEvidenceDisplayTaxon(e),
        cellKey: e.cell_key || null,
        lat: e.lat || null,
        lng: e.lng || null,
        countedAt: e.created_at,
        updatedAt: e.updated_at || e.created_at
      };

      return acc;
    }, {});
  }

  function cleanPartyEvidenceTaxonLabel(value) {
    const label = String(value || "").trim();
    if (!label) return "";
    if (/^(unknown|unknown taxon|unknown organism|unknown observation)$/i.test(label)) return "";
    return label;
  }

  function partyEvidenceDisplayTaxon(row = {}) {
    const taxon = cleanPartyEvidenceTaxonLabel(row.taxon);
    if (taxon && !/^observation$/i.test(taxon)) return taxon;

    const iconic = cleanPartyEvidenceTaxonLabel(row.iconic_taxon || row.iconicTaxon);
    if (iconic) return `${iconic} observation`;

    if (taxon) return "Party observation";
    return "Observation needing ID";
  }

  function savePartyEvidence() {
    return false;
  }

  function setPartyEvidenceStatus(partyId, draftId, status) {
    if (!partyId || !draftId) return false;
    if (!["counted", "excluded"].includes(status)) return false;
    if (!window.GridWildAPI?.updatePartyEvidenceStatus) return false;

    window.GridWildAPI.updatePartyEvidenceStatus(partyId, draftId, status)
      .then(async () => {
        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();
        refreshMapBeacon();
        scheduleActivePartyHudRender();
      })
      .catch((err) => {
        console.warn("Could not update party evidence status:", err);
      });

    return true;
  }

  function draftHasUsableEvidence(draft) {
    return !!draft?.id && Array.isArray(draft.photos) && draft.photos.length > 0;
  }

  function getDraftIconicTaxon(draft) {
    return String(draft?.suggestedId?.iconicTaxon || draft?.suggestedId?.kingdom || "");
  }

  function loadPartyRoutes() {
    const loadedId = window.__gwState?.party?.id;
    const routePartyId = window.__gwState?.partyRoutePartyId || null;
    const route = window.__gwState?.partyRoute || [];
    const partyId = routePartyId || loadedId;
    const rows = {};

    if (
      partyId &&
      route.length &&
      (!loadedId || !routePartyId || String(routePartyId) === String(loadedId))
    ) {
      rows[partyId] = mergeRouteRowsWithOutbox(route, partyId)
        .filter((p) => String(p?.party_id || routePartyId || "") === String(partyId))
        .map((p) => ({
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyMeters: p.accuracy_meters,
          t: p.created_at
        }));
    } else if (partyId && partyRouteOutboxRows(partyId).length) {
      rows[partyId] = mergeRouteRowsWithOutbox([], partyId).map((p) => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        accuracyMeters: p.accuracy_meters,
        t: p.created_at
      }));
    }

    for (const [id, snapshot] of Object.entries(window.__gwState?.partySnapshotsById || {})) {
      if (rows[id]) continue;
      const snapshotRoute = Array.isArray(snapshot?.route) ? snapshot.route : [];
      if (!snapshotRoute.length) continue;

      rows[id] = snapshotRoute
        .filter((p) => String(p?.party_id || id || "") === String(id))
        .map((p) => ({
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyMeters: p.accuracy_meters,
          t: p.created_at
        }));
    }

    return rows;
  }

  function getPartyRouteCellKey(lat, lng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return "";

    if (typeof window.getCellKeyForLatLng === "function") {
      try {
        return window.getCellKeyForLatLng(latNum, lngNum) || "";
      } catch (err) {
        console.warn("Could not calculate party route cell:", err);
      }
    }

    const cell = window.GridWildGrid?.latLngToCell?.([latNum, lngNum]);
    if (cell && Number.isFinite(Number(cell.ix)) && Number.isFinite(Number(cell.iy))) {
      return window.GridWildGrid?.cellKey?.(cell.ix, cell.iy) || `${cell.ix},${cell.iy}`;
    }

    return "";
  }

  function rememberPartyRouteCell(partyId, cellKey) {
    if (!partyId || !cellKey) return;

    window.__gwState = window.__gwState || {};
    window.__gwState.lastPartyRouteCellByParty = window.__gwState.lastPartyRouteCellByParty || {};
    window.__gwState.lastPartyRouteCellByParty[partyId] = cellKey;
    window.__gwState.lastPartyRouteCellKey = cellKey;
  }

  function getLastRecordedPartyRouteCell(partyId) {
    window.__gwState = window.__gwState || {};
    window.__gwState.lastPartyRouteCellByParty = window.__gwState.lastPartyRouteCellByParty || {};

    const remembered = window.__gwState.lastPartyRouteCellByParty[partyId];
    if (remembered) return remembered;

    const route = window.__gwState.partyRoute || [];
    for (let i = route.length - 1; i >= 0; i--) {
      const row = route[i];
      if (row?.party_id && row.party_id !== partyId) continue;
      const cellKey = row?.cell_key || getPartyRouteCellKey(row?.lat, row?.lng);
      if (cellKey) {
        rememberPartyRouteCell(partyId, cellKey);
        return cellKey;
      }
    }

    const queued = partyRouteOutboxRows(partyId);
    for (let i = queued.length - 1; i >= 0; i--) {
      const row = queued[i];
      const cellKey = row?.cell_key || getPartyRouteCellKey(row?.lat, row?.lng);
      if (cellKey) {
        rememberPartyRouteCell(partyId, cellKey);
        return cellKey;
      }
    }

    return "";
  }

  function appendOptimisticPartyRoutePoint(
    partyId,
    lat,
    lng,
    accuracyMeters,
    cellKey,
    createdAt,
    outboxId = null,
    routeMeta = {}
  ) {
    window.__gwState = window.__gwState || {};
    const route = Array.isArray(window.__gwState.partyRoute) ? window.__gwState.partyRoute : [];

    window.__gwState.partyRoute = route;
    window.__gwState.partyRoutePartyId = partyId;

    const optimisticId = `local_route_${partyId}_${Date.now()}`;
    route.push({
      id: optimisticId,
      party_id: partyId,
      player_id: window.GridWildAPI?.getPlayerId?.() || null,
      lat,
      lng,
      accuracy_meters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null,
      cell_key: cellKey || null,
      created_at: createdAt,
      uncertain_gap_after: routeMeta.uncertain_gap_after === true,
      uncertain_gap_reason: routeMeta.uncertain_gap_reason || null,
      uncertain_gap_distance_m: Number.isFinite(Number(routeMeta.uncertain_gap_distance_m))
        ? Number(routeMeta.uncertain_gap_distance_m)
        : null,
      _route_outbox_id: outboxId || null,
      _optimistic: true
    });

    if (route.length > 5000) {
      route.splice(0, route.length - 5000);
    }

    return optimisticId;
  }

  function replaceOptimisticPartyRoutePoint(optimisticId, point) {
    if (!optimisticId || !point || !Array.isArray(window.__gwState?.partyRoute)) return;

    const idx = window.__gwState.partyRoute.findIndex((row) => row?.id === optimisticId);
    if (idx >= 0) {
      window.__gwState.partyRoute[idx] = point;
    }
  }

  function routeAccuracyMeters(point) {
    const acc = Number(point?.accuracyMeters ?? point?.accuracy_meters);
    return Number.isFinite(acc) && acc >= 0 ? acc : PARTY_ROUTE_MAX_ACCURACY_M;
  }

  function latestAcceptedPartyRoutePoint(partyId) {
    const route = loadPartyRoutes()[partyId] || [];
    for (let i = route.length - 1; i >= 0; i--) {
      const point = route[i];
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      return {
        ...point,
        lat,
        lng,
        accuracyMeters: routeAccuracyMeters(point)
      };
    }
    return null;
  }

  function routeOutlierConfirmDistance(a, b) {
    return Math.max(
      PARTY_ROUTE_OUTLIER_CONFIRM_M,
      routeAccuracyMeters(a) + routeAccuracyMeters(b) + 10
    );
  }

  function logPartyRouteFilterDecision(decision = {}) {
    window.__gwState = window.__gwState || {};
    const rows = Array.isArray(window.__gwState.partyRouteFilterLog)
      ? window.__gwState.partyRouteFilterLog
      : [];
    rows.push({ at: new Date().toISOString(), ...decision });
    if (rows.length > 40) rows.splice(0, rows.length - 40);
    window.__gwState.partyRouteFilterLog = rows;
    if (window.__gwDebugPartyRouteFilter === true) {
      console.debug("GridWild party route filter", decision);
    }
  }

  function markPartyRouteBackgrounded() {
    if (!partyRouteBackgroundedAt) partyRouteBackgroundedAt = Date.now();
  }

  function markPartyRouteResumed(source = "resume") {
    const now = Date.now();
    const hiddenFor = partyRouteBackgroundedAt ? now - partyRouteBackgroundedAt : 0;
    partyRouteBackgroundedAt = 0;
    if (hiddenFor < PARTY_ROUTE_RESUME_UNCERTAIN_AFTER_MS) return;

    partyRouteResumeToken += 1;
    partyRouteResumeUncertainUntil = now + PARTY_ROUTE_RESUME_UNCERTAIN_WINDOW_MS;
    logPartyRouteFilterDecision({
      decision: "resume-window",
      source,
      hiddenMs: Math.round(hiddenFor),
      uncertainWindowMs: PARTY_ROUTE_RESUME_UNCERTAIN_WINDOW_MS
    });
  }

  function routePointUncertainGapAfter(point) {
    return Boolean(point?.uncertain_gap_after || point?.route_uncertain_gap_after);
  }

  function routePointUncertainGapReason(point) {
    return String(point?.uncertain_gap_reason || point?.route_uncertain_gap_reason || "");
  }

  function partyRouteTransitionUncertainty(partyId, candidate, options = {}) {
    const last = latestAcceptedPartyRoutePoint(partyId);
    if (!last) return null;

    const now = Number(options.now) || Date.now();
    const distance = haversineMeters(last, candidate);
    if (!Number.isFinite(distance) || distance < PARTY_ROUTE_UNCERTAIN_MIN_DISTANCE_M) {
      return null;
    }

    const explicitReason = String(options.reason || "");
    if (explicitReason) {
      return {
        uncertain_gap_after: true,
        uncertain_gap_reason: explicitReason,
        uncertain_gap_distance_m: Math.round(distance)
      };
    }

    if (
      partyRouteResumeToken &&
      now <= partyRouteResumeUncertainUntil &&
      partyRouteResumeTokenByParty.get(partyId) !== partyRouteResumeToken
    ) {
      partyRouteResumeTokenByParty.set(partyId, partyRouteResumeToken);
      return {
        uncertain_gap_after: true,
        uncertain_gap_reason: "resume",
        uncertain_gap_distance_m: Math.round(distance)
      };
    }

    const dtMs = routePointTimeMs(last) ? now - routePointTimeMs(last) : 0;
    const accuracy = routeAccuracyMeters(candidate);
    if (
      dtMs >= PARTY_ROUTE_LOW_QUALITY_GAP_MS &&
      distance >= PARTY_ROUTE_SAMPLE_GAP_MIN_METERS &&
      accuracy >= PARTY_ROUTE_LOW_QUALITY_GAP_ACCURACY_M
    ) {
      return {
        uncertain_gap_after: true,
        uncertain_gap_reason: "low_quality",
        uncertain_gap_distance_m: Math.round(distance)
      };
    }

    return null;
  }

  function assessPartyRouteCandidate(partyId, candidate, options = {}) {
    const last = latestAcceptedPartyRoutePoint(partyId);
    if (!last) {
      partyRouteOutlierCandidates.delete(partyId);
      return { accept: true, forceAccept: false };
    }

    const now = Number(options.now) || Date.now();
    const pending = partyRouteOutlierCandidates.get(partyId);
    if (pending && now - Number(pending.seenAt || 0) > PARTY_ROUTE_OUTLIER_PENDING_TTL_MS) {
      partyRouteOutlierCandidates.delete(partyId);
    } else if (pending) {
      const confirmDistance = haversineMeters(pending, candidate);
      if (
        Number.isFinite(confirmDistance) &&
        confirmDistance <= routeOutlierConfirmDistance(pending, candidate)
      ) {
        partyRouteOutlierCandidates.delete(partyId);
        logPartyRouteFilterDecision({
          partyId,
          decision: "confirmed",
          distanceMeters: Math.round(confirmDistance)
        });
        return {
          accept: true,
          forceAccept: true,
          uncertainGapReason: "confirmed_jump"
        };
      }
    }

    const distance = haversineMeters(last, candidate);
    const lastTime = routePointTimeMs(last);
    const dtMs = lastTime ? now - lastTime : PARTY_ROUTE_THROTTLE_MS;
    const dtSec = Math.max(1, dtMs / 1000);
    const speedMps = distance / dtSec;
    const candidateAcc = routeAccuracyMeters(candidate);
    const lastAcc = routeAccuracyMeters(last);
    const uncertaintyM = Math.max(18, candidateAcc + lastAcc + 8);

    if (
      !Number.isFinite(distance) ||
      distance < PARTY_ROUTE_OUTLIER_MIN_DISTANCE_M ||
      dtMs <= 0 ||
      dtMs > PARTY_ROUTE_SAMPLE_GAP_MS ||
      distance <= uncertaintyM * 0.75
    ) {
      partyRouteOutlierCandidates.delete(partyId);
      return { accept: true, forceAccept: false };
    }

    const hardJump = speedMps >= PARTY_ROUTE_OUTLIER_FAST_SPEED_MPS;
    const softJump =
      candidateAcc >= PARTY_ROUTE_OUTLIER_SOFT_ACCURACY_M &&
      speedMps >= PARTY_ROUTE_OUTLIER_SOFT_SPEED_MPS;
    const worsenedAccuracyJump =
      lastAcc <= PARTY_ROUTE_OUTLIER_SOFT_ACCURACY_M &&
      candidateAcc >= lastAcc * 1.8 &&
      distance >= PARTY_ROUTE_SAMPLE_GAP_MIN_METERS;

    if (!hardJump && !softJump && !worsenedAccuracyJump) {
      partyRouteOutlierCandidates.delete(partyId);
      return { accept: true, forceAccept: false };
    }

    partyRouteOutlierCandidates.set(partyId, {
      ...candidate,
      seenAt: now
    });
    logPartyRouteFilterDecision({
      partyId,
      decision: "held",
      distanceMeters: Math.round(distance),
      speedMps: Number(speedMps.toFixed(2)),
      accuracyMeters: Number.isFinite(candidateAcc) ? Math.round(candidateAcc) : null
    });
    return { accept: false, forceAccept: false };
  }

  function recordPartyPosition(lat, lng, accuracyMeters, options = {}) {
    const partyId = options.partyId || getActivePartyId();
    if (!partyId) return;

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

    const acc = Number(accuracyMeters);
    if (Number.isFinite(acc) && acc > PARTY_ROUTE_MAX_ACCURACY_M) return;

    window.__gwState = window.__gwState || {};
    window.__gwState.lastPartyRoutePointAtByParty =
      window.__gwState.lastPartyRoutePointAtByParty || {};

    const now = Date.now();
    const candidate = {
      lat: latNum,
      lng: lngNum,
      accuracyMeters: Number.isFinite(acc) ? acc : null,
      t: new Date(now).toISOString()
    };
    const routeDecision = assessPartyRouteCandidate(partyId, candidate, {
      now,
      force: options.force === true
    });
    if (!routeDecision.accept) return;

    const cellKey = getPartyRouteCellKey(latNum, lngNum);
    const lastCellKey = getLastRecordedPartyRouteCell(partyId);
    const enteredNewCell = Boolean(cellKey && cellKey !== lastCellKey);
    const lastTime = Number(window.__gwState.lastPartyRoutePointAtByParty[partyId] || 0);

    if (
      options.force !== true &&
      routeDecision.forceAccept !== true &&
      !enteredNewCell &&
      now - lastTime < PARTY_ROUTE_THROTTLE_MS
    ) {
      return;
    }

    const routeMeta =
      partyRouteTransitionUncertainty(partyId, candidate, {
        now,
        reason: routeDecision.uncertainGapReason
      }) || {};

    window.__gwState.lastPartyRoutePointAtByParty[partyId] = now;
    window.__gwState.lastPartyRoutePointAt = now;
    rememberPartyRouteCell(partyId, cellKey);

    const createdAt = new Date(now).toISOString();
    const queued = enqueuePartyRoutePoint({
      party_id: partyId,
      lat: latNum,
      lng: lngNum,
      accuracy_meters: Number.isFinite(acc) ? acc : null,
      cell_key: cellKey,
      created_at: createdAt,
      uncertain_gap_after: routeMeta.uncertain_gap_after === true,
      uncertain_gap_reason: routeMeta.uncertain_gap_reason || null,
      uncertain_gap_distance_m: routeMeta.uncertain_gap_distance_m || null
    });
    const optimisticId = appendOptimisticPartyRoutePoint(
      partyId,
      latNum,
      lngNum,
      Number.isFinite(acc) ? acc : null,
      cellKey,
      createdAt,
      queued?.id || null,
      routeMeta
    );
    if (queued?.id) {
      updatePartyRouteOutboxRow(queued.id, { optimistic_id: optimisticId });
    }

    scheduleActivePartyHudRender();
    refreshMapBeacon();
    schedulePartyRouteOutboxFlush(0);
  }

  function getPartyEvidenceRows(partyId) {
    const loadedId = window.__gwState?.party?.id;
    const sourceEvidence =
      partyId && String(loadedId || "") === String(partyId)
        ? window.__gwState?.partyEvidence || []
        : window.__gwState?.partySnapshotsById?.[partyId]?.evidence || [];

    if (partyId) {
      return sourceEvidence
        .filter((e) => String(e.party_id || "") === String(partyId) && e.status === "counted")
        .map((e) => ({
          partyId: e.party_id,
          draftId: e.draft_id,
          rawTaxon: e.taxon || null,
          iconicTaxon: e.iconic_taxon || null,
          taxon: partyEvidenceDisplayTaxon(e),
          cellKey: e.cell_key || null,
          lat: e.lat || null,
          lng: e.lng || null,
          countedAt: e.created_at
        }))
        .sort((a, b) => new Date(a.countedAt || 0) - new Date(b.countedAt || 0));
    }

    return [];
  }

  function getExcludedPartyEvidenceRows(partyId) {
    const loadedId = window.__gwState?.party?.id;
    const sourceEvidence =
      partyId && String(loadedId || "") === String(partyId)
        ? window.__gwState?.partyEvidence || []
        : window.__gwState?.partySnapshotsById?.[partyId]?.evidence || [];

    if (partyId) {
      return sourceEvidence
        .filter((e) => String(e.party_id || "") === String(partyId) && e.status === "excluded")
        .map((e) => ({
          partyId: e.party_id,
          draftId: e.draft_id,
          rawTaxon: e.taxon || null,
          iconicTaxon: e.iconic_taxon || null,
          taxon: partyEvidenceDisplayTaxon(e),
          cellKey: e.cell_key || null,
          lat: e.lat || null,
          lng: e.lng || null,
          countedAt: e.created_at,
          excludedAt: e.updated_at || e.created_at
        }))
        .sort(
          (a, b) =>
            new Date(a.excludedAt || a.countedAt || 0) - new Date(b.excludedAt || b.countedAt || 0)
        );
    }

    return [];
  }

  async function excludePartyEvidence(partyId, draftId) {
    try {
      await window.GridWildAPI.updatePartyEvidenceStatus(partyId, draftId, "excluded");

      await window.GridWildPartyLive?.loadParty?.();
      window.GridWildPartyLive?.refreshPartySheet?.();

      toast("Removed from party score");
      refreshMapBeacon();
      scheduleActivePartyHudRender();

      return true;
    } catch (err) {
      console.error("Could not exclude party evidence:", err);
      toast("Could not remove from party score");
      return false;
    }
  }

  async function reincludePartyEvidence(partyId, draftId) {
    try {
      await window.GridWildAPI.updatePartyEvidenceStatus(partyId, draftId, "counted");

      await window.GridWildPartyLive?.loadParty?.();
      window.GridWildPartyLive?.refreshPartySheet?.();

      toast("Re-included in party score");
      refreshMapBeacon();
      scheduleActivePartyHudRender();

      return true;
    } catch (err) {
      console.error("Could not re-include party evidence:", err);
      toast("Could not re-include in party score");
      return false;
    }
  }

  function getPartyDurationLabel(party) {
    const start = new Date(party?.startsAt || party?.createdAt || Date.now());
    const end =
      party?.endedAt || party?.completedAt
        ? new Date(party.endedAt || party.completedAt)
        : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";

    const mins = Math.max(1, Math.round((end - start) / 60000));
    if (mins < 60) return `${mins} min`;

    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} hr${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
  }

  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function routePointTimeMs(point) {
    const t = Date.parse(point?.t || point?.created_at || "");
    return Number.isFinite(t) ? t : 0;
  }

  function isPartyRouteSampleGap(a, b) {
    if (routePointUncertainGapAfter(b)) return true;

    const distance = haversineMeters(a, b);
    if (!Number.isFinite(distance) || distance <= 0) return false;
    if (distance >= PARTY_ROUTE_SAMPLE_GAP_FORCE_METERS) return true;

    const aTime = routePointTimeMs(a);
    const bTime = routePointTimeMs(b);
    if (!aTime || !bTime || bTime <= aTime) return false;

    const dt = bTime - aTime;
    const speedMps = distance / (dt / 1000);

    return (
      (dt >= PARTY_ROUTE_SAMPLE_GAP_MS && distance >= PARTY_ROUTE_SAMPLE_GAP_MIN_METERS) ||
      (dt >= PARTY_ROUTE_THROTTLE_MS * 3 &&
        distance >= PARTY_ROUTE_SAMPLE_GAP_MIN_METERS &&
        speedMps >= PARTY_ROUTE_SAMPLE_GAP_SPEED_MPS)
    );
  }

  function splitPartyRouteBySampleGaps(points = []) {
    const clean = (Array.isArray(points) ? points : [])
      .map((p) => ({
        ...p,
        lat: Number(p?.lat),
        lng: Number(p?.lng)
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    const segments = [];
    const gaps = [];
    let current = [];

    clean.forEach((point) => {
      const previous = current[current.length - 1];
      if (previous && isPartyRouteSampleGap(previous, point)) {
        if (current.length) segments.push(current);
        gaps.push({
          from: previous,
          to: point,
          latLngs: [
            [previous.lat, previous.lng],
            [point.lat, point.lng]
          ],
          reason: routePointUncertainGapReason(point),
          distanceMeters: haversineMeters(previous, point),
          durationMs: routePointTimeMs(point) - routePointTimeMs(previous)
        });
        current = [point];
        return;
      }

      current.push(point);
    });

    if (current.length) segments.push(current);

    return {
      points: clean,
      segments: segments.filter((segment) => segment.length >= 2),
      gaps
    };
  }

  function routeSegmentLatLngs(segment = []) {
    return segment.map((point) => [Number(point.lat), Number(point.lng)]);
  }

  function formatPartyRouteGap(gap = {}) {
    const durationMs = Number(gap.durationMs);
    const minutes = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 60000) : 0;
    const distance = formatDistance(gap.distanceMeters || 0);
    const reason = String(gap.reason || "");
    if (reason === "resume") return `Route uncertain after app resume: ${distance} connector`;
    if (reason === "low_quality") return `Low GPS confidence: ${distance} connector`;
    if (reason === "confirmed_jump") return `Route transition uncertain: ${distance} connector`;
    return minutes
      ? `Route samples missing: ${minutes} min gap, ${distance} connector`
      : `Route samples missing: ${distance} connector`;
  }

  function getRouteDistanceMeters(points) {
    if (!Array.isArray(points) || points.length < 2) {
      const fallback = Number(points?.routeDistanceMeters);
      return Number.isFinite(fallback) ? fallback : 0;
    }

    let total = 0;

    for (let i = 1; i < points.length; i++) {
      if (isPartyRouteSampleGap(points[i - 1], points[i])) continue;
      const d = haversineMeters(points[i - 1], points[i]);
      if (Number.isFinite(d) && d < 500) total += d;
    }

    return total;
  }

  function formatDistance(meters) {
    const value = Number(meters);
    const metric = window.GridWildUnits?.metricEnabled?.() === true;

    if (!Number.isFinite(value) || value <= 0) {
      return metric ? "0 m" : "0 ft";
    }

    if (metric) {
      if (value < 1) return `${value.toFixed(1)} m`;
      if (value < 1000) return `${Math.round(value)} m`;
      return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
    }

    const feet = value * 3.280839895;
    if (feet < 5280) return `${feet < 10 ? feet.toFixed(1) : Math.round(feet)} ft`;

    const miles = feet / 5280;
    return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }

  async function confirmEndParty(id) {
    const party = getParty(id);
    const title = party?.title || window.__gwState?.party?.title || "Active Party";

    if (typeof window.GridWildQuests?.openQuestConfirmDialog === "function") {
      return window.GridWildQuests.openQuestConfirmDialog({
        title: "End Party?",
        message: "This will stop the live party, save the route, and open the recap.",
        subject: title,
        confirmLabel: "End Party",
        cancelLabel: "Keep Party",
        danger: true
      });
    }

    return window.confirm(`End party "${title}"? This will stop the live party and open the recap.`);
  }

  async function endParty(id, options = {}) {
    if (!id) return false;

    if (!window.GridWildAPI?.endParty) {
      toast("Party service unavailable");
      return false;
    }

    if (partyIsEnding(id)) {
      toast("Party end is already queued");
      schedulePartyEndOutboxFlush(0);
      return true;
    }

    if (options.confirm !== false) {
      const ok = await confirmEndParty(id);
      if (!ok) return false;
    }

    setPartyEnding(id, true);
    recordLatestPartyRoutePoint(id);
    const pendingBefore = partyRouteSyncStatus(id).pending;
    if (pendingBefore) toast("Saving party route...");

    await flushPartyRouteOutbox({ partyId: id }).catch((err) => {
      console.warn("Could not flush party route before ending:", err);
    });

    try {
      await window.GridWildAPI.endParty(id);
      await finishEndedPartyLocally(id, "Online party ended", { openRecap: true });
    } catch (err) {
      console.error("DB end failed:", err);
      queuePartyEnd(id, err);
      setPartyEnding(id, false);
      window.GridWildPartyLive?.setActivePartyId?.(null);
      window.GridWildPartyLive?.refreshPartySheet?.();
      refreshMapBeacon();
      scheduleActivePartyHudRender();
      toast("Party end queued; will retry");
    }

    return true;
  }

  function shareCancelled(err) {
    return /abort|cancel/i.test(String(err?.name || err?.message || ""));
  }

  function partyShareText(p, id, shareUrl) {
    const route = loadPartyRoutes()[id] || [];
    const counted = countEvidenceForParty(id);
    const distance = formatDistance(getRouteDistanceMeters(route));

    return [
      `GridWild Party Report: ${p.title}`,
      `Counted observations: ${counted}`,
      `Duration: ${getPartyDurationLabel(p)}`,
      `Route: ${distance}`,
      shareUrl
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyPartyShareText(p, id, shareUrl) {
    const text = partyShareText(p, id, shareUrl);

    try {
      await navigator.clipboard?.writeText(text);
      toast("Party report link copied");
      return true;
    } catch (err) {
      console.warn("Could not copy party share link:", err);
      toast("Could not share party link");
      return false;
    }
  }

  async function shareParty(id) {
    const p = getParty(id);
    if (!p) return false;

    const url = partyReportUrl(id);
    const title = `GridWild Party Report: ${p.title}`;
    const text = [
      `Counted observations: ${countEvidenceForParty(id)}`,
      `Duration: ${getPartyDurationLabel(p)}`,
      `Route: ${formatDistance(getRouteDistanceMeters(loadPartyRoutes()[id] || []))}`
    ]
      .filter(Boolean)
      .join("\n");
    const shareData = { title, text, url };

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err) {
        if (shareCancelled(err)) return false;
        console.warn("Could not open party share sheet:", err);
      }
    }

    return copyPartyShareText(p, id, url);
  }

  function partyINatSyncToast(result = {}) {
    const imported = Number(result.imported || 0);
    if (imported > 0) {
      return `Synced ${imported} iNaturalist observation${imported === 1 ? "" : "s"}`;
    }

    const linked = Number(result.linked_members || 0);
    if (!linked) return "No linked iNaturalist accounts in this party";

    const matched = Number(result.matched || 0);
    if (matched > 0) return "Those party-time iNaturalist observations were already synced";

    return "No new party-time iNaturalist observations found";
  }

  async function syncPartyINatObservationsForRecap(id, root, closeRecap) {
    if (!id) return false;
    if (!window.GridWildAPI?.syncPartyINatObservations) {
      toast("iNaturalist party sync is unavailable");
      return false;
    }

    const button = root?.querySelector?.("#gwPartySyncRecapBtn");
    const oldText = button?.textContent || "Sync";
    if (button) {
      button.disabled = true;
      button.textContent = "Syncing...";
    }

    try {
      const result = await window.GridWildAPI.syncPartyINatObservations(id);
      const route = loadPartyRoutes()[id] || [];
      if (result?.party?.id) {
        rememberPartySnapshot({ ...result, route });
      }
      await hydratePartySnapshot(id, { force: true });

      window.GridWildPartyLive?.refreshPartySheet?.();
      refreshMapBeacon();
      scheduleActivePartyHudRender();
      toast(partyINatSyncToast(result));

      closeRecap?.();
      openPartyRecap(id);
      return true;
    } catch (err) {
      console.error("Could not sync party iNaturalist observations:", err);
      toast(
        err?.statusCode === 429 || /429|too many/i.test(String(err?.message || ""))
          ? "iNaturalist is rate limiting; try again later"
          : "Could not sync iNaturalist observations"
      );
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
      return false;
    }
  }

  function partyGoalMatchesDraft(party, draft) {
    const goal = String(party?.goalType || "any").toLowerCase();
    const iconic = getDraftIconicTaxon(draft);
    const taxonName = String(draft?.suggestedId?.taxonName || "").toLowerCase();
    const notes = String(draft?.notes || "").toLowerCase();
    const haystack = `${iconic} ${taxonName} ${notes}`.toLowerCase();

    if (goal === "any") return true;
    if (goal === "ants") return haystack.includes("ant") || haystack.includes("formicidae");
    if (goal === "birds") return iconic === "Aves";
    if (goal === "insects") return iconic === "Insecta" || haystack.includes("insect");
    if (goal === "plants") return iconic === "Plantae";
    if (goal === "fungi")
      return iconic === "Fungi" || haystack.includes("lichen") || haystack.includes("fung");

    return true;
  }

  function getSharedPartyProgress(partyId) {
    const activeDbPartyId = window.__gwState?.party?.id;
    const dbProgress = Number(window.__gwState?.partyProgress || 0);

    if (partyId && activeDbPartyId === partyId) {
      return dbProgress;
    }

    return countEvidenceForParty(partyId);
  }

  function countEvidenceForParty(partyId) {
    return getPartyEvidenceRows(partyId).length;
  }

  function getQuestById(questId) {
    try {
      const quests = JSON.parse(localStorage.getItem("gw_quests_v1") || "[]");
      return Array.isArray(quests) ? quests.find((q) => q.id === questId) || null : null;
    } catch {
      return null;
    }
  }

  function normalizeDraftForQuestEvidence(draft) {
    return {
      id: draft.id,
      source: "draft",
      taxon: draft?.suggestedId?.taxonName || "Draft observation",
      common_name: "",
      scientific_name: draft?.suggestedId?.taxonName || "",
      iconic_taxon_name: draft?.suggestedId?.iconicTaxon || "Unknown",
      observed_on: draft?.observedAt || draft?.createdAt || draft?.updatedAt,
      accuracy: draft?.location?.accuracyMeters,
      lat: draft?.location?.lat,
      lng: draft?.location?.lng,
      _draft: draft
    };
  }

  function autoClaimDraftForLinkedQuest(party, draft) {
    if (!party?.linkedQuestId) return { ok: false, reason: "No linked quest." };
    if (!window.GridWildQuestEvidence?.claimObservationForQuest) {
      return { ok: false, reason: "Quest evidence system not loaded." };
    }

    const quest = getQuestById(party.linkedQuestId);
    if (!quest) return { ok: false, reason: "Linked quest not found." };

    const obs = normalizeDraftForQuestEvidence(draft);
    const result = window.GridWildQuestEvidence.claimObservationForQuest(obs, quest);

    if (result.ok) {
      window.dispatchEvent(
        new CustomEvent("gwPartyAutoClaimedQuestEvidence", {
          detail: { party, quest, draft, result }
        })
      );
    }

    return result;
  }

  function attachDraftToActiveParty(draft) {
    const partyId = getActivePartyId();
    if (!partyId || !draftHasUsableEvidence(draft)) return false;

    const party = getParty(partyId);
    if (!party) return false;
    if (!partyGoalMatchesDraft(party, draft)) return false;

    const alreadyCounted = (window.__gwState?.partyEvidence || []).some(
      (e) => e.party_id === partyId && e.draft_id === draft.id && e.status === "counted"
    );

    if (alreadyCounted) return false;

    const taxon =
      draft?.suggestedId?.taxonName || draft?.suggestedId?.iconicTaxon || "Draft observation";

    window.GridWildAPI?.addPartyEvidence?.({
      party_id: partyId,
      draft_id: draft.id,
      taxon,
      iconic_taxon: draft?.suggestedId?.iconicTaxon || null,
      cell_key: draft?.location?.cellKey || null,
      lat: draft?.location?.lat || null,
      lng: draft?.location?.lng || null
    })
      .then(async () => {
        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();
        refreshMapBeacon();
        scheduleActivePartyHudRender();
      })
      .catch((err) => {
        console.warn("Could not sync party evidence:", err);
      });

    refreshMapBeacon();

    const questClaim = autoClaimDraftForLinkedQuest(party, draft);

    if (questClaim.ok) {
      toast(`🎉 Counted for party + quest`);
    } else {
      toast(`🎉 Counted for ${party.title}`);
    }

    window.dispatchEvent(
      new CustomEvent("gwPartyEvidenceCounted", {
        detail: { party, draft, questClaim }
      })
    );

    return true;
  }

  function scanDraftsForActiveParty() {
    const partyId = getActivePartyId();
    if (!partyId) return;

    const drafts = window.GridWildDraftObservations?.loadDrafts?.() || [];
    let changed = false;

    for (const d of drafts) {
      if (attachDraftToActiveParty(d)) changed = true;
    }

    if (changed) {
      rerenderPartySheet();
      refreshMapBeacon();
    }
  }

  function refreshStoredPartyProgress() {}

  function normalizeRouteOutboxRow(row = {}) {
    const partyId = String(row.party_id || row.partyId || "").trim();
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!partyId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const accuracy = Number(row.accuracy_meters ?? row.accuracyMeters);
    const uncertainDistance = Number(row.uncertain_gap_distance_m ?? row.uncertainGapDistanceM);
    return {
      id: String(row.id || `route_outbox_${partyId}_${shortRouteId()}`),
      party_id: partyId,
      lat,
      lng,
      accuracy_meters: Number.isFinite(accuracy) ? accuracy : null,
      cell_key: String(row.cell_key || row.cellKey || "").trim() || null,
      created_at: isoOrNow(row.created_at || row.createdAt),
      uncertain_gap_after: row.uncertain_gap_after === true || row.uncertainGapAfter === true,
      uncertain_gap_reason:
        String(row.uncertain_gap_reason || row.uncertainGapReason || "").trim() || null,
      uncertain_gap_distance_m: Number.isFinite(uncertainDistance) ? uncertainDistance : null,
      optimistic_id: row.optimistic_id || row.optimisticId || null,
      attempts: Math.max(0, Number(row.attempts) || 0),
      last_attempt_at: row.last_attempt_at || null,
      last_error: row.last_error || null
    };
  }

  function loadPartyRouteOutbox() {
    return readStoredArray(PARTY_ROUTE_OUTBOX_KEY).map(normalizeRouteOutboxRow).filter(Boolean);
  }

  function savePartyRouteOutbox(rows = []) {
    const normalized = (Array.isArray(rows) ? rows : [])
      .map(normalizeRouteOutboxRow)
      .filter(Boolean)
      .sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
    const trimmed =
      normalized.length > PARTY_ROUTE_OUTBOX_LIMIT
        ? normalized.slice(normalized.length - PARTY_ROUTE_OUTBOX_LIMIT)
        : normalized;
    writeStoredArray(PARTY_ROUTE_OUTBOX_KEY, trimmed);
    scheduleActivePartyHudRender();
    return trimmed;
  }

  function partyRouteOutboxRows(partyId = null) {
    const id = partyId ? String(partyId) : "";
    return loadPartyRouteOutbox().filter((row) => !id || String(row.party_id) === id);
  }

  function partyRouteSyncStatus(partyId = null) {
    const rows = partyRouteOutboxRows(partyId);
    const lastErrorRow = rows
      .filter((row) => row.last_error)
      .sort((a, b) => Date.parse(b.last_attempt_at || "") - Date.parse(a.last_attempt_at || ""))[0];
    return {
      pending: rows.length,
      syncing: partyRouteFlushPromise !== null,
      lastError: lastErrorRow?.last_error || null
    };
  }

  function partyRouteSyncLabel(partyId) {
    const status = partyRouteSyncStatus(partyId);
    if (status.syncing && status.pending) return `Saving route (${status.pending} queued)`;
    if (status.pending && status.lastError) return `Route retrying (${status.pending} queued)`;
    if (status.pending) return `Route queued (${status.pending})`;
    return "Route saved";
  }

  function enqueuePartyRoutePoint(row = {}) {
    const normalized = normalizeRouteOutboxRow(row);
    if (!normalized) return null;
    const rows = loadPartyRouteOutbox();
    rows.push(normalized);
    savePartyRouteOutbox(rows);
    return normalized;
  }

  function removePartyRouteOutboxRow(id) {
    if (!id) return;
    savePartyRouteOutbox(loadPartyRouteOutbox().filter((row) => row.id !== id));
  }

  function updatePartyRouteOutboxRow(id, patch = {}) {
    if (!id) return;
    savePartyRouteOutbox(
      loadPartyRouteOutbox().map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function mergeRouteRowsWithOutbox(route = [], partyId) {
    const rows = Array.isArray(route) ? route.slice() : [];
    const existingOutboxIds = new Set(
      rows.map((row) => row?._route_outbox_id || row?.outbox_id).filter(Boolean)
    );
    const existingKeys = new Set(
      rows
        .map((row) => {
          const lat = Number(row?.lat);
          const lng = Number(row?.lng);
          const t = row?.created_at || row?.t || "";
          return Number.isFinite(lat) && Number.isFinite(lng)
            ? `${lat.toFixed(7)}:${lng.toFixed(7)}:${t}`
            : "";
        })
        .filter(Boolean)
    );

    partyRouteOutboxRows(partyId).forEach((row) => {
      const key = `${row.lat.toFixed(7)}:${row.lng.toFixed(7)}:${row.created_at}`;
      if (existingOutboxIds.has(row.id) || existingKeys.has(key)) return;
      rows.push({
        id: row.optimistic_id || `queued_${row.id}`,
        party_id: row.party_id,
        player_id: window.GridWildAPI?.getPlayerId?.() || null,
        lat: row.lat,
        lng: row.lng,
        accuracy_meters: row.accuracy_meters,
        cell_key: row.cell_key,
        created_at: row.created_at,
        uncertain_gap_after: row.uncertain_gap_after === true,
        uncertain_gap_reason: row.uncertain_gap_reason || null,
        uncertain_gap_distance_m: row.uncertain_gap_distance_m || null,
        _optimistic: true,
        _route_outbox_id: row.id
      });
    });

    return rows.sort(
      (a, b) => Date.parse(a.created_at || a.t || "") - Date.parse(b.created_at || b.t || "")
    );
  }

  function replaceQueuedPartyRoutePoint(outboxRow, point) {
    if (!outboxRow || !point) return;
    window.__gwState = window.__gwState || {};
    const route = Array.isArray(window.__gwState.partyRoute) ? window.__gwState.partyRoute : [];
    window.__gwState.partyRoute = route;

    const idx = route.findIndex(
      (row) =>
        row?._route_outbox_id === outboxRow.id ||
        (outboxRow.optimistic_id && row?.id === outboxRow.optimistic_id)
    );
    const nextPoint = {
      ...point,
      cell_key: point.cell_key || outboxRow.cell_key || null,
      uncertain_gap_after: outboxRow.uncertain_gap_after === true,
      uncertain_gap_reason: outboxRow.uncertain_gap_reason || null,
      uncertain_gap_distance_m: outboxRow.uncertain_gap_distance_m || null,
      _optimistic: false
    };

    if (idx >= 0) {
      route[idx] = nextPoint;
    } else if (
      String(window.__gwState.partyRoutePartyId || "") === String(outboxRow.party_id) &&
      !route.some((row) => row?.id && point?.id && row.id === point.id)
    ) {
      route.push(nextPoint);
    }
  }

  async function flushPartyRouteOutbox(options = {}) {
    if (partyRouteFlushPromise) return partyRouteFlushPromise;

    partyRouteFlushPromise = (async () => {
      const partyId = options.partyId ? String(options.partyId) : "";
      if (!window.GridWildAPI?.addPartyRoutePoint) {
        return { synced: 0, failed: 0, pending: partyRouteOutboxRows(partyId).length };
      }

      let synced = 0;
      let failed = 0;
      const candidates = partyRouteOutboxRows(partyId).slice(0, PARTY_ROUTE_FLUSH_BATCH);

      for (const row of candidates) {
        if (!loadPartyRouteOutbox().some((candidate) => candidate.id === row.id)) continue;
        updatePartyRouteOutboxRow(row.id, {
          attempts: row.attempts + 1,
          last_attempt_at: nowISO()
        });

        try {
          const result = await window.GridWildAPI.addPartyRoutePoint(
            row.party_id,
            row.lat,
            row.lng,
            row.accuracy_meters,
            row.created_at
          );
          removePartyRouteOutboxRow(row.id);
          replaceQueuedPartyRoutePoint(row, result?.point);
          synced++;
        } catch (err) {
          failed++;
          updatePartyRouteOutboxRow(row.id, {
            attempts: row.attempts + 1,
            last_attempt_at: nowISO(),
            last_error: err?.message || String(err || "Route sync failed")
          });
          console.warn("Could not sync queued party route point:", err);
          break;
        }
      }

      if (synced) {
        refreshMapBeacon();
        scheduleActivePartyHudRender();
      }

      const pending = partyRouteOutboxRows(partyId).length;
      if (pending && !options.noRetry) schedulePartyRouteOutboxFlush(PARTY_ROUTE_RETRY_MS);
      return { synced, failed, pending };
    })().finally(() => {
      partyRouteFlushPromise = null;
      scheduleActivePartyHudRender();
    });

    return partyRouteFlushPromise;
  }

  function schedulePartyRouteOutboxFlush(delayMs = PARTY_ROUTE_RETRY_MS) {
    window.clearTimeout(partyRouteFlushTimer);
    partyRouteFlushTimer = window.setTimeout(
      () => {
        flushPartyRouteOutbox().catch((err) => {
          console.warn("Could not flush party route queue:", err);
        });
      },
      Math.max(0, Number(delayMs) || 0)
    );
  }

  function normalizePartyEndRow(row = {}) {
    const id = String(row.party_id || row.id || "").trim();
    if (!id) return null;
    return {
      party_id: id,
      queued_at: isoOrNow(row.queued_at || row.queuedAt),
      attempts: Math.max(0, Number(row.attempts) || 0),
      last_attempt_at: row.last_attempt_at || null,
      last_error: row.last_error || null
    };
  }

  function loadPartyEndOutbox() {
    return readStoredArray(PARTY_END_OUTBOX_KEY).map(normalizePartyEndRow).filter(Boolean);
  }

  function savePartyEndOutbox(rows = []) {
    const byId = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const normalized = normalizePartyEndRow(row);
      if (normalized) byId.set(normalized.party_id, normalized);
    });
    const saved = Array.from(byId.values());
    writeStoredArray(PARTY_END_OUTBOX_KEY, saved);
    scheduleActivePartyHudRender();
    return saved;
  }

  function queuePartyEnd(id, error = null) {
    if (!id) return;
    const rows = loadPartyEndOutbox();
    const existing = rows.find((row) => String(row.party_id) === String(id));
    if (existing) {
      existing.last_error = error?.message || error || existing.last_error || null;
    } else {
      rows.push({
        party_id: id,
        queued_at: nowISO(),
        attempts: 0,
        last_error: error?.message || error || null
      });
    }
    savePartyEndOutbox(rows);
    schedulePartyEndOutboxFlush(PARTY_END_RETRY_MS);
  }

  function removeQueuedPartyEnd(id) {
    if (!id) return;
    savePartyEndOutbox(loadPartyEndOutbox().filter((row) => String(row.party_id) !== String(id)));
  }

  function partyEndQueued(id) {
    return loadPartyEndOutbox().some((row) => String(row.party_id) === String(id));
  }

  function setPartyEnding(id, value) {
    if (!id) return;
    window.__gwState = window.__gwState || {};
    window.__gwState.partyEndingById = window.__gwState.partyEndingById || {};
    if (value) window.__gwState.partyEndingById[id] = true;
    else delete window.__gwState.partyEndingById[id];
    scheduleActivePartyHudRender();
  }

  function partyIsEnding(id) {
    return Boolean(window.__gwState?.partyEndingById?.[id] || partyEndQueued(id));
  }

  function recordLatestPartyRoutePoint(partyId) {
    const loc = window.__gwLastUserLocation;
    if (!loc || !partyId) return false;
    recordPartyPosition(loc.lat, loc.lng, loc.accuracyMeters, { partyId, force: true });
    return true;
  }

  async function finishEndedPartyLocally(id, message = "Online party ended", options = {}) {
    const activeParty = window.__gwState?.party;
    if (String(activeParty?.id || "") === String(id)) {
      rememberPartySnapshot({
        party: {
          ...activeParty,
          status: "ended",
          ended_at: activeParty.ended_at || activeParty.endedAt || nowISO()
        },
        members: window.__gwState?.partyMembers || [],
        events: window.__gwState?.partyEvents || [],
        evidence: window.__gwState?.partyEvidence || [],
        progress: window.__gwState?.partyProgress || 0,
        route: window.__gwState?.partyRoute || []
      });
    }

    removeQueuedPartyEnd(id);
    setPartyEnding(id, false);
    if (String(getActivePartyId() || "") === String(id)) {
      window.GridWildPartyLive?.setActivePartyId?.(null);
    }
    await window.GridWildPartyLive?.loadParty?.({ forceHistory: true });
    window.GridWildPartyLive?.refreshPartySheet?.();
    refreshMapBeacon();
    scheduleActivePartyHudRender();
    rerenderPartySheet();
    if (message) toast(message);
    if (options.openRecap === true) {
      await hydratePartySnapshot(id, { force: true }).catch((err) => {
        console.warn("Could not refresh ended party recap:", err);
        return false;
      });
      openPartyRecap(id);
    }
  }

  async function flushPartyEndOutbox(options = {}) {
    if (partyEndFlushPromise) return partyEndFlushPromise;

    partyEndFlushPromise = (async () => {
      if (!window.GridWildAPI?.endParty) return { ended: 0, failed: 0 };

      let ended = 0;
      let failed = 0;
      const rows = loadPartyEndOutbox();

      for (const row of rows) {
        if (options.partyId && String(row.party_id) !== String(options.partyId)) continue;
        setPartyEnding(row.party_id, true);
        await flushPartyRouteOutbox({ partyId: row.party_id }).catch(() => null);

        try {
          await window.GridWildAPI.endParty(row.party_id);
          await finishEndedPartyLocally(row.party_id, options.silent ? "" : "Queued party ended");
          ended++;
        } catch (err) {
          failed++;
          savePartyEndOutbox(
            loadPartyEndOutbox().map((pending) =>
              String(pending.party_id) === String(row.party_id)
                ? {
                    ...pending,
                    attempts: Number(pending.attempts || 0) + 1,
                    last_attempt_at: nowISO(),
                    last_error: err?.message || String(err || "Party end failed")
                  }
                : pending
            )
          );
          setPartyEnding(row.party_id, false);
          console.warn("Could not flush queued party end:", err);
          break;
        }
      }

      if (failed && !options.noRetry) schedulePartyEndOutboxFlush(PARTY_END_RETRY_MS);
      return { ended, failed };
    })().finally(() => {
      partyEndFlushPromise = null;
      scheduleActivePartyHudRender();
    });

    return partyEndFlushPromise;
  }

  function schedulePartyEndOutboxFlush(delayMs = PARTY_END_RETRY_MS) {
    window.clearTimeout(partyEndFlushTimer);
    partyEndFlushTimer = window.setTimeout(
      () => {
        flushPartyEndOutbox({ silent: true }).catch((err) => {
          console.warn("Could not flush party end queue:", err);
        });
      },
      Math.max(0, Number(delayMs) || 0)
    );
  }

  function joinParty(id) {
    if (!id) return;

    if (!window.GridWildAPI?.joinParty) {
      toast("Party service unavailable");
      return;
    }

    window.GridWildAPI.joinParty(id)
      .then(async () => {
        setActivePartyId(id);

        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();

        toast("Joined online party");
        rerenderPartySheet();
        openPartyCover(id);
      })
      .catch((err) => {
        console.error("DB join failed:", err);
        toast("Could not join online party");
      });

    return;
  }

  function leaveParty(id) {
    if (!id) return;

    if (!window.GridWildAPI?.leaveParty) {
      toast("Party service unavailable");
      return;
    }

    window.GridWildAPI.leaveParty(id)
      .then(async () => {
        if (getActivePartyId() === id) {
          window.GridWildPartyLive?.setActivePartyId?.(null);
        }

        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();
        refreshMapBeacon();
        scheduleActivePartyHudRender();
        toast("Left online party");
        rerenderPartySheet();
      })
      .catch((err) => {
        console.error("DB leave failed:", err);
        toast("Could not leave online party");
      });

    return;
  }

  function goalTypeFromQuestRecipe(recipe = {}) {
    const tax = String(recipe.iconicTaxon || "Any");

    if (tax === "Aves") return "birds";
    if (tax === "Insecta") return "insects";
    if (tax === "Plantae") return "plants";
    if (tax === "Fungi") return "fungi";

    return "any";
  }

  function createPartyFromQuest(quest) {
    if (!quest) return null;

    const recipe = quest.recipe || {};
    const goalType = goalTypeFromQuestRecipe(recipe);

    const target = Number(recipe.quantity || quest.targetCount || 5) || 5;

    const party = createParty({
      mode: "live",
      title: `Party: ${quest.title || "Quest Party"}`,
      goalType,
      target,
      visibility: "public",
      durationMinutes: 60,
      locationLabel: recipe.target?.placeName || recipe.target?.label || "Quest area",

      linkedQuestId: quest.id,
      linkedQuestTitle: quest.title || "",
      linkedQuestRecipe: recipe
    });

    return party;
  }

  function createParty(form) {
    const locationResolution = resolvePartyLocationForStart(form);
    if (!locationResolution.ok) {
      toast(locationResolution.reason || "Choose a party location.");
      return null;
    }

    form = {
      ...form,
      locationMode: locationResolution.locationMode,
      locationUserId: locationResolution.locationUserId,
      location: locationResolution.location,
      resolvedLocation: locationResolution.resolvedLocation,
      locationLabel: form.locationLabel || locationResolution.locationLabel
    };

    if (!window.GridWildPartyLive?.createDbPartyFromLegacyForm) {
      toast("Party service unavailable");
      return null;
    }

    window.GridWildPartyLive.createDbPartyFromLegacyForm(form)
      .then(() => {
        toast("Online party started");
        rerenderPartySheet();
      })
      .catch((err) => {
        console.error("DB party create failed:", err);
        toast("Could not start online party");
      });

    return null;
  }

  function makePartyReportPayload(id) {
    const p = getParty(id);
    if (!p) return null;

    const route = loadPartyRoutes()[id] || [];
    const counted = getPartyEvidenceRows(id);
    const excluded = getExcludedPartyEvidenceRows?.(id) || [];

    return {
      kind: "gridwild_party_report",
      version: 1,
      exportedAt: nowISO(),
      party: {
        id: p.id,
        title: p.title,
        host: p.host,
        goalLabel: p.goalLabel,
        linkedQuestTitle: p.linkedQuestTitle || "",
        locationLabel: p.locationLabel,
        startsAt: p.startsAt,
        endedAt: p.endedAt || p.completedAt || null,
        durationLabel: getPartyDurationLabel(p),
        routeDistanceMeters: Math.round(getRouteDistanceMeters(route)),
        countedCount: counted.length,
        excludedCount: excluded.length
      },
      route,
      evidence: counted,
      excludedEvidence: excluded
    };
  }

  function partyReportUrl(id) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?party_report=${encodeURIComponent(id)}`;
  }

  function partyUrl(id) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?party=${encodeURIComponent(id)}`;
  }

  function qrSrc(id) {
    const data = encodeURIComponent(partyUrl(id));
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${data}`;
  }

  function getPartyIdFromQrText(text = "") {
    const value = String(text || "").trim();
    if (!value) return "";

    try {
      const url = new URL(value, window.location.href);
      return url.searchParams.get("party") || url.searchParams.get("party_id") || "";
    } catch (err) {
      const match = value.match(/[?&]party(?:_id)?=([^&]+)/i);
      if (match) return decodeURIComponent(match[1]);
      return /^[A-Za-z0-9_-]{4,}$/.test(value) ? value : "";
    }
  }

  async function joinPartyFromQrFile(file) {
    if (!file) return;

    if (!("BarcodeDetector" in window) || !window.createImageBitmap) {
      toast("QR scanning is not supported on this device");
      return;
    }

    let bitmap = null;

    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      const rawValue = codes?.[0]?.rawValue || "";
      const partyId = getPartyIdFromQrText(rawValue);

      if (!partyId) {
        toast("No party QR code found");
        return;
      }

      joinParty(partyId);
    } catch (err) {
      console.error("Could not scan party QR:", err);
      toast("Could not scan QR code");
    } finally {
      bitmap?.close?.();
    }
  }

  function renderPartyRow(p) {
    const joined = isJoined(p.id);
    const active = getActivePartyId() === p.id;

    const evidenceCount = Math.max(Number(p.progress || 0), getSharedPartyProgress(p.id));
    const pct = Math.max(
      0,
      Math.min(100, (evidenceCount / Math.max(1, Number(p.target || 1))) * 100)
    );

    return `
      <div class="gw-party-row" data-party-id="${esc(p.id)}">
        <div class="gw-party-main">
          <div class="gw-party-title">
            ${active ? "🟢 " : ""}${esc(p.title)}
          </div>

          <div class="gw-party-meta">
            ${esc(partyLocationLabel(p))} · ${esc(p.distanceLabel || "nearby")} · ${Number(p.memberCount || 1)} joined
          </div>

          <div class="gw-party-goal">${esc(p.goalLabel || "Open field party")}</div>

          <div class="gw-party-progress">
            <div class="gw-party-progress-fill" style="width:${pct}%"></div>
          </div>

          <div class="gw-party-meta">
            ${evidenceCount} / ${Number(p.target || 0)} · ${p.mode === "upcoming" || p.mode === "scheduled" ? formatWhen(p.startsAt) : "Live now"}
          </div>
        </div>

        <div class="gw-party-actions">
          <button class="gw-mini-btn gw-party-view-btn" data-party-id="${esc(p.id)}">View</button>
          ${
            joined
              ? `<button class="gw-mini-btn gw-party-leave-btn" data-party-id="${esc(p.id)}">Leave</button>`
              : `<button class="gw-mini-btn gw-party-join-btn" data-party-id="${esc(p.id)}">Join</button>`
          }
        </div>
      </div>
    `;
  }

  function renderSheetHtml() {
    const all = getAllParties();
    const live = all.filter((p) => p.mode === "live" && p.status !== "ended" && !p.endedAt);
    const upcoming = all.filter((p) => p.mode === "upcoming" || p.mode === "scheduled");
    const activeId = getActivePartyId();
    const mine = all.filter((p) => p.id === activeId);

    return `
      <div class="gw-card gw-party-hero-card">
        <div class="gw-card-title">Party</div>

        <div class="gw-party-action-row">
          <button class="gw-mini-btn gw-party-start-main" id="gwStartPartyBtn">
            🎉 Start Party
          </button>

          <button class="gw-mini-btn" id="gwSchedulePartyBtn">
            📅 Schedule
          </button>

          <input
            id="gwJoinPartyInput"
            class="gw-party-join-input"
            placeholder="Enter Party ID"
            autocomplete="off"
          />
          <button class="gw-mini-btn" id="gwJoinPartyBtn">Join Party</button>
          <button class="gw-mini-btn gw-party-qr-scan-btn" id="gwPartyQrScanBtn" type="button" aria-label="Scan party QR code" title="Scan party QR code">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z" />
            </svg>
          </button>
          <input id="gwPartyQrInput" type="file" accept="image/*" capture="environment" hidden />
        </div>
      </div>

        <div class="gw-party-tabs">
        <button class="gw-party-tab is-active" data-party-tab="live">Live</button>
        <button class="gw-party-tab" data-party-tab="upcoming">Upcoming</button>
        <button class="gw-party-tab" data-party-tab="mine">Mine</button>
        <button class="gw-party-tab" data-party-tab="history">History</button>
        </div>

        <div class="gw-party-panel" data-party-panel="history">
            <div class="gw-card">
                <div class="gw-card-title">Party History</div>
                <div class="gw-party-list">
                ${renderPartyHistoryRows()}
                </div>
            </div>
        </div>

      <div class="gw-party-panel is-active" data-party-panel="live">
        <div class="gw-card">
          <div class="gw-card-title">Live nearby</div>
          <div class="gw-party-list">
            ${live.length ? live.map(renderPartyRow).join("") : `<div class="gw-muted">No live parties nearby.</div>`}
          </div>
        </div>
      </div>

      <div class="gw-party-panel" data-party-panel="upcoming">
        <div class="gw-card">
          <div class="gw-card-title">Scheduled events</div>
          <div class="gw-party-list">
            ${upcoming.length ? upcoming.map(renderPartyRow).join("") : `<div class="gw-muted">No upcoming parties yet.</div>`}
          </div>
        </div>
      </div>

      <div class="gw-party-panel" data-party-panel="mine">
        <div class="gw-card">
          <div class="gw-card-title">My parties</div>
          <div class="gw-party-list">
            ${mine.length ? mine.map(renderPartyRow).join("") : `<div class="gw-muted">Join or start a party to see it here.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderPartyHistoryRows() {
    const all = getAllParties();

    const rows = all
      .filter((p) => p.mode === "ended" || p.status === "ended" || p.endedAt || p.completedAt)
      .sort(
        (a, b) =>
          new Date(b.endedAt || b.completedAt || b.startsAt || b.createdAt || 0) -
          new Date(a.endedAt || a.completedAt || a.startsAt || a.createdAt || 0)
      );

    if (!rows.length) {
      return `<div class="gw-muted">No party history yet. Start a party and count observations to create a trip report.</div>`;
    }

    return rows
      .map((p) => {
        const evidenceCount = Math.max(Number(p.progress || 0), countEvidenceForParty(p.id));
        const route = loadPartyRoutes()[p.id] || [];
        route.routeDistanceMeters = Number(p.routeDistanceMeters || 0);

        return `
      <div class="gw-party-row">
        <div class="gw-party-main">
          <div class="gw-party-title">📜 ${esc(p.title)}</div>
          <div class="gw-party-meta">
            ${esc(formatWhen(p.startsAt || p.createdAt))} · ${getPartyDurationLabel(p)}
          </div>
          <div class="gw-party-goal">
            ${evidenceCount} counted · ${formatDistance(getRouteDistanceMeters(route))} route
          </div>
        </div>

        <div class="gw-party-actions">
          <button class="gw-mini-btn gw-party-recap-btn" data-party-id="${esc(p.id)}">Recap</button>
          <button class="gw-mini-btn gw-party-share-btn" data-party-id="${esc(p.id)}">Share</button>
        </div>
      </div>
    `;
      })
      .join("");
  }

  function bindSheetControls(root = document) {
    injectStyles();

    root.querySelectorAll(".gw-party-tab").forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.partyTab;

        root.querySelectorAll(".gw-party-tab").forEach((x) => x.classList.remove("is-active"));
        root.querySelectorAll(".gw-party-panel").forEach((x) => x.classList.remove("is-active"));

        btn.classList.add("is-active");
        root.querySelector(`[data-party-panel="${tab}"]`)?.classList.add("is-active");
      };
    });

    root.querySelector("#gwStartPartyBtn")?.addEventListener("click", () => {
      openPartyCreateModal("live");
    });

    root.querySelector("#gwSchedulePartyBtn")?.addEventListener("click", () => {
      openPartyCreateModal("scheduled");
    });

    const joinInput = root.querySelector("#gwJoinPartyInput");
    const joinBtn = root.querySelector("#gwJoinPartyBtn");
    const joinById = () => {
      const id = joinInput?.value?.trim();
      if (!id) return;
      joinParty(id);
    };

    joinBtn?.addEventListener("click", joinById);
    joinInput?.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") joinById();
    });

    const qrInput = root.querySelector("#gwPartyQrInput");
    root.querySelector("#gwPartyQrScanBtn")?.addEventListener("click", () => {
      if (!qrInput) return;
      qrInput.value = "";
      qrInput.click();
    });

    qrInput?.addEventListener("change", async () => {
      const file = qrInput.files?.[0];
      await joinPartyFromQrFile(file);
      qrInput.value = "";
    });

    root.querySelectorAll(".gw-party-join-btn").forEach((btn) => {
      btn.onclick = () => joinParty(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-leave-btn").forEach((btn) => {
      btn.onclick = () => leaveParty(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-view-btn").forEach((btn) => {
      btn.onclick = () => openPartyCover(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-recap-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.partyId;
        await hydratePartySnapshot(id);
        openPartyRecap(id);
      };
    });

    root.querySelectorAll(".gw-party-share-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.partyId;
        await hydratePartySnapshot(id);
        shareParty(id);
      };
    });
  }

  function openPartyRecap(id) {
    injectStyles();

    const p = getParty(id);
    if (!p) return;

    const evidence = getPartyEvidenceRows(id);
    const excludedEvidence = getExcludedPartyEvidenceRows(id);
    const route = loadPartyRoutes()[id] || [];
    const distance = getRouteDistanceMeters(route);

    const root = document.createElement("div");
    root.className = "gw-party-backdrop";

    root.innerHTML = `
    <div class="gw-party-cover gw-party-recap">
      <div class="gw-party-cover-art">
        <div class="gw-party-rune">📜</div>
        <div>
          <div class="gw-party-cover-kicker">Party Trip Report</div>
          <div class="gw-party-cover-title">${esc(p.title)}</div>
          <div class="gw-party-cover-sub">
            ${esc(formatWhen(p.startsAt || p.createdAt))} · ${getPartyDurationLabel(p)}
          </div>
        </div>
      </div>

      <div class="gw-party-cover-grid">
        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Counted finds</div>
          <div class="gw-party-stat-v">${evidence.length}</div>
        </div>

        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Route</div>
          <div class="gw-party-stat-v">${formatDistance(distance)}</div>
        </div>

        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Duration</div>
          <div class="gw-party-stat-v">${getPartyDurationLabel(p)}</div>
        </div>

        <div class="gw-party-stat">
        <div class="gw-party-stat-k">${p.linkedQuestTitle ? "Linked quest" : "Goal"}</div>
        <div class="gw-party-stat-v">
            ${esc(p.linkedQuestTitle || p.goalLabel || "Open field party")}
        </div>
        </div>
      </div>

      <div class="gw-party-recap-map" id="gwPartyRecapMap_${esc(id)}">
        ${route.length ? "" : `<div class="gw-muted">No route points recorded for this party yet.</div>`}
      </div>

    <div class="gw-party-qr-wrap">
    <div class="gw-party-stat-k" style="margin-bottom:8px;">Counted observations</div>
    ${
      evidence.length
        ? `<div class="gw-list">
            ${evidence
              .map(
                (e) => `
                <div class="gw-rowline gw-party-evidence-row">
                <span style="min-width:0;">
                    <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(e.taxon || "Observation")}
                    </span>
                    <span class="gw-muted" style="font-size:11px;">
                    ${esc(e.cellKey || "no cell")}
                    </span>
                </span>

                <button
                    class="gw-mini-btn gw-party-evidence-exclude-btn"
                    data-party-id="${esc(id)}"
                    data-draft-id="${esc(e.draftId)}"
                >
                    Exclude
                </button>
                </div>
            `
              )
              .join("")}
            </div>`
        : `<div class="gw-muted">No counted observations yet.</div>`
    }

    ${
      excludedEvidence.length
        ? `
            <div class="gw-party-stat-k" style="margin:14px 0 8px 0;">Excluded</div>
            <div class="gw-list">
            ${excludedEvidence
              .map(
                (e) => `
                <div class="gw-rowline gw-party-evidence-row excluded">
                <span style="min-width:0;">
                    <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(e.taxon || "Observation")}
                    </span>
                    <span class="gw-muted" style="font-size:11px;">
                    ${esc(e.cellKey || "no cell")}
                    </span>
                </span>

                <button
                    class="gw-mini-btn gw-party-evidence-reinclude-btn"
                    data-party-id="${esc(id)}"
                    data-draft-id="${esc(e.draftId)}"
                >
                    Re-include
                </button>
                </div>
            `
              )
              .join("")}
            </div>
        `
        : ""
    }
    </div>

    <div class="gw-party-qr-wrap">
    <div class="gw-party-stat-k" style="margin-bottom:8px;">Party activity</div>
    ${renderPartyActivityHtml(id, 12)}
    </div>

      <div class="gw-party-modal-actions">
        <button class="gw-mini-btn" data-party-close>Close</button>
        <button class="gw-mini-btn" id="gwPartySyncRecapBtn">Sync</button>
        <button class="gw-mini-btn" id="gwPartyWildlistRecapBtn">Wildlist</button>
        <button class="gw-mini-btn" id="gwPartyShareRecapBtn">Share</button>
        ${
          getActivePartyId() === id
            ? `<button class="gw-mini-btn" id="gwPartyEndRecapBtn">End Party</button>`
            : ""
        }
      </div>
    </div>
  `;

    document.body.appendChild(root);

    const closeRecap = () => {
      destroyPartyRecapMaps(root);
      root.remove();
    };

    root.querySelectorAll("[data-party-close]").forEach((btn) => {
      btn.onclick = closeRecap;
    });

    root.addEventListener("click", (e) => {
      if (e.target === root) closeRecap();
    });

    root.querySelector("#gwPartyShareRecapBtn")?.addEventListener("click", () => {
      shareParty(id);
    });

    root.querySelector("#gwPartySyncRecapBtn")?.addEventListener("click", () => {
      syncPartyINatObservationsForRecap(id, root, closeRecap);
    });

    root.querySelector("#gwPartyWildlistRecapBtn")?.addEventListener("click", async (evt) => {
      const btn = evt.currentTarget;
      if (!window.GridWildPlaylists?.createFromParty) {
        toast("Wildlists are unavailable");
        return;
      }

      const oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Building...";

      try {
        const playlist = await window.GridWildPlaylists.createFromParty(id, {
          force: false,
          open: true
        });
        if (playlist) toast("Party Wildlist created");
      } catch (err) {
        console.warn("Could not create Party Wildlist:", err);
        toast("Could not create Party Wildlist");
      } finally {
        if (root.isConnected) {
          btn.disabled = false;
          btn.textContent = oldText;
        }
      }
    });

    root.querySelector("#gwPartyEndRecapBtn")?.addEventListener("click", async () => {
      const ended = await endParty(id);
      if (ended) closeRecap();
    });

    root.querySelectorAll(".gw-party-evidence-exclude-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        excludePartyEvidence(btn.dataset.partyId, btn.dataset.draftId).then(() => {
          closeRecap();
          openPartyRecap(id);
        });
      });
    });

    root.querySelectorAll(".gw-party-evidence-reinclude-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        reincludePartyEvidence(btn.dataset.partyId, btn.dataset.draftId).then(() => {
          closeRecap();
          openPartyRecap(id);
        });
      });
    });

    setTimeout(() => drawPartyRecapMap(id), 50);
  }

  function createPartyRecapBaseLayer() {
    const choice = window.GridWildBaseMaps?.getBaseMap?.() || window.__gwState?.baseMap || "street";

    if (choice === "terrain" && typeof window.createTerrainBaseLayer === "function") {
      return window.createTerrainBaseLayer();
    }
    if (typeof window.createStreetBaseLayer === "function") {
      return window.createStreetBaseLayer();
    }

    return window.createGridWildBlankBaseLayer?.() || L.layerGroup();
  }

  function destroyPartyRecapMaps(root = document) {
    root?.querySelectorAll?.(".gw-party-recap-map").forEach((host) => {
      if (!host._gwPartyRecapMap) return;
      host._gwPartyRecapMap.remove();
      host._gwPartyRecapMap = null;
    });
  }

  function renderPartyRecapMap(host, route = [], evidence = [], label = "Party route map") {
    if (!host) return;

    if (host._gwPartyRecapMap) {
      host._gwPartyRecapMap.remove();
      host._gwPartyRecapMap = null;
    }

    const routeSplit = splitPartyRouteBySampleGaps(route);
    const routePoints = routeSplit.points.map((point) => [point.lat, point.lng]);
    const observations = evidence
      .filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
      .map((row) => ({
        latlng: [Number(row.lat), Number(row.lng)],
        label: row.taxon || "Observation"
      }));

    if (!window.L || (!routePoints.length && !observations.length)) {
      host.classList.add("is-empty");
      host.innerHTML = `<div class="gw-muted">No mappable points recorded.</div>`;
      return;
    }

    host.classList.remove("is-empty");
    host.innerHTML = "";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", label);

    const recapMap = L.map(host, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      touchZoom: false
    });
    host._gwPartyRecapMap = recapMap;

    createPartyRecapBaseLayer().addTo(recapMap);

    const features = L.featureGroup().addTo(recapMap);
    if (routePoints.length) {
      routeSplit.segments.forEach((segment) => {
        const latLngs = routeSegmentLatLngs(segment);

        L.polyline(latLngs, {
          color: "rgba(20,17,15,0.72)",
          weight: 8,
          opacity: 0.88,
          lineCap: "round",
          lineJoin: "round",
          interactive: false
        }).addTo(features);

        L.polyline(latLngs, {
          color: "#f0b85a",
          weight: 4,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
          interactive: false
        }).addTo(features);
      });

      routeSplit.gaps.forEach((gap) => {
        L.polyline(gap.latLngs, {
          color: "rgba(20,17,15,0.54)",
          weight: 7,
          opacity: 0.48,
          dashArray: "4 8",
          lineCap: "round",
          lineJoin: "round",
          interactive: false
        }).addTo(features);

        L.polyline(gap.latLngs, {
          color: "#f28e7d",
          weight: 3,
          opacity: 0.86,
          dashArray: "4 8",
          lineCap: "round",
          lineJoin: "round",
          interactive: true
        })
          .bindTooltip(formatPartyRouteGap(gap), { direction: "top", opacity: 0.94 })
          .addTo(features);
      });

      L.circleMarker(routePoints[0], {
        radius: 7,
        color: "#201711",
        weight: 2,
        fillColor: "#72d89b",
        fillOpacity: 1,
        interactive: false
      }).addTo(features);

      L.circleMarker(routePoints[routePoints.length - 1], {
        radius: 7,
        color: "#201711",
        weight: 2,
        fillColor: "#ffe082",
        fillOpacity: 1,
        interactive: false
      }).addTo(features);
    }

    observations.forEach((observation) => {
      L.circleMarker(observation.latlng, {
        radius: 6,
        color: "#201711",
        weight: 2,
        fillColor: "#f4e8cf",
        fillOpacity: 1
      })
        .bindTooltip(esc(observation.label), { direction: "top" })
        .addTo(features);
    });

    const bounds = features.getBounds();
    if (bounds.isValid()) {
      recapMap.fitBounds(bounds.pad(0.18), {
        animate: false,
        maxZoom: 18
      });
    }

    window.setTimeout(() => {
      if (!host.isConnected || host._gwPartyRecapMap !== recapMap) return;
      recapMap.invalidateSize({ animate: false });
      if (bounds.isValid()) {
        recapMap.fitBounds(bounds.pad(0.18), {
          animate: false,
          maxZoom: 18
        });
      }
    }, 120);
  }

  function drawPartyRecapMap(id) {
    renderPartyRecapMap(
      document.getElementById(`gwPartyRecapMap_${id}`),
      loadPartyRoutes()[id] || [],
      getPartyEvidenceRows(id),
      "Party trip report route map"
    );
  }

  function rerenderPartySheet() {
    const legacyBody = $("gwLegacyPartyUI");
    if (legacyBody) {
      legacyBody.innerHTML = renderSheetHtml();
      bindSheetControls(legacyBody);
      return;
    }

    const body = $("sheetCommunityBody");
    if (!body) return;

    body.innerHTML = renderSheetHtml();
    bindSheetControls(body);
  }

  function openPartyCreateModal(mode = "live") {
    injectStyles();

    const root = document.createElement("div");
    root.className = "gw-party-backdrop";

    const defaultStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    defaultStart.setMinutes(0, 0, 0);
    let selectedPartyLocation = null;

    root.innerHTML = `
      <div class="gw-party-modal">
        <div class="gw-party-modal-head">
          <div class="gw-party-modal-title">
            ${mode === "scheduled" ? "Schedule Party" : "Start Party"}
          </div>
          <button class="gw-party-x" data-party-close>×</button>
        </div>

        <label class="gw-party-label">Party name</label>
        <input class="gw-party-input" id="gwPartyTitleInput" placeholder="e.g., Rock Creek Ant Hunt">

        <label class="gw-party-label">Template</label>
        <select class="gw-party-input" id="gwPartyTemplateInput">
          <option value="">Choose a template</option>
          ${PARTY_TEMPLATES.map(
            (t) => `
            <option value="${esc(t.key)}">${esc(t.emoji)} ${esc(t.label)}</option>
          `
          ).join("")}
        </select>

        <div class="gw-party-setup-row">
          <div class="gw-party-field">
            <label class="gw-party-label" for="gwPartyGoalInput">Goal</label>
            <select class="gw-party-input" id="gwPartyGoalInput">
              <option value="ants">Ant hunt</option>
              <option value="birds">Bird walk</option>
              <option value="insects">Insect sweep</option>
              <option value="plants">Plant survey</option>
              <option value="fungi">Fungus / lichen foray</option>
              <option value="any">General bioblitz</option>
            </select>
          </div>

          <div class="gw-party-field">
            <label class="gw-party-label" for="gwPartyTargetInput">Target count</label>
            <input class="gw-party-input" id="gwPartyTargetInput" type="number" min="1" max="999" value="10">
          </div>

          <div class="gw-party-field">
            <label class="gw-party-label" for="gwPartyVisibilityInput">Visibility</label>
            <select class="gw-party-input" id="gwPartyVisibilityInput">
              <option value="public">Public nearby</option>
              <option value="private">Private / QR only</option>
            </select>
          </div>
        </div>

        <label class="gw-party-label">Location</label>
        <div class="gw-party-location-segment" role="radiogroup" aria-label="Party location">
          <label class="gw-party-location-option is-active">
            <input type="radio" name="gwPartyLocationMode" value="anywhere" checked>
            <span>Anywhere</span>
          </label>
          <label class="gw-party-location-option">
            <input type="radio" name="gwPartyLocationMode" value="user">
            <span>Me</span>
          </label>
          <label class="gw-party-location-option">
            <input type="radio" name="gwPartyLocationMode" value="location">
            <span>Location</span>
          </label>
        </div>

        <div class="gw-party-location-panel is-active" data-location-panel="anywhere">
          <div class="gw-party-location-panel-title">No pinned place</div>
          <div class="gw-party-location-panel-copy">
            The party is not tied to a map point.
          </div>
        </div>

        <div class="gw-party-location-panel" data-location-panel="user">
          <div class="gw-party-location-panel-title">${esc(getCurrentUserDisplayName())}</div>
          <div class="gw-party-location-panel-copy">
            Uses your latest GridWild location. If your location is unavailable, starting the party is blocked.
          </div>
        </div>

        <div class="gw-party-location-panel" data-location-panel="location">
          <div class="gw-party-location-panel-title" id="gwPartyLocationSummary">No location chosen</div>
          <div class="gw-party-location-panel-copy" id="gwPartyLocationCoords">
            Pick a saved location or choose a new coordinate.
          </div>
          <button class="gw-mini-btn gw-party-location-pick" id="gwPartyPickLocationBtn" type="button">
            Choose Location
          </button>
        </div>

        ${
          mode === "scheduled"
            ? `
              <label class="gw-party-label">Start time</label>
              <input class="gw-party-input" id="gwPartyStartInput" type="datetime-local" value="${toDatetimeLocal(defaultStart)}">
            `
            : ""
        }

        <label class="gw-party-label">Duration</label>
        <select class="gw-party-input" id="gwPartyDurationInput">
          <option value="30">30 minutes</option>
          <option value="60" selected>1 hour</option>
          <option value="120">2 hours</option>
          <option value="240">4 hours</option>
        </select>

        <div class="gw-party-modal-actions">
          <button class="gw-mini-btn" data-party-close>Cancel</button>
          <button class="gw-mini-btn gw-party-primary" id="gwPartyCreateBtn">
            ${mode === "scheduled" ? "Schedule" : "Start Now"}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    function setLocationMode(modeName) {
      root.querySelectorAll(".gw-party-location-option").forEach((label) => {
        const input = label.querySelector("input");
        const active = input?.value === modeName;
        label.classList.toggle("is-active", active);
        if (input) input.checked = active;
      });

      root.querySelectorAll(".gw-party-location-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.locationPanel === modeName);
      });
    }

    function setSelectedPartyLocation(location) {
      selectedPartyLocation = location;
      const titleEl = root.querySelector("#gwPartyLocationSummary");
      const coordEl = root.querySelector("#gwPartyLocationCoords");
      if (titleEl) titleEl.textContent = location?.label || "Selected location";
      if (coordEl) {
        coordEl.textContent =
          Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))
            ? `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
            : "Pick a saved location or choose a new coordinate.";
      }
    }

    root.querySelectorAll("input[name='gwPartyLocationMode']").forEach((input) => {
      input.addEventListener("change", () => setLocationMode(input.value));
    });

    root.querySelector("#gwPartyPickLocationBtn")?.addEventListener("click", () => {
      if (!window.GridWildLocationPicker?.open) {
        toast("Location picker is not available yet.");
        return;
      }

      window.GridWildLocationPicker.open({
        location: selectedPartyLocation,
        selectButtonLabel: "Use for party",
        onSelect(location) {
          setSelectedPartyLocation(location);
          setLocationMode("location");
        }
      });
    });

    root.querySelector("#gwPartyTemplateInput")?.addEventListener("change", (e) => {
      const t = PARTY_TEMPLATES.find((x) => x.key === e.target.value);
      if (!t) return;

      root.querySelector("#gwPartyTitleInput").value = t.title;
      root.querySelector("#gwPartyGoalInput").value = t.goalType;
      root.querySelector("#gwPartyTargetInput").value = t.target;
      root.querySelector("#gwPartyDurationInput").value = String(t.durationMinutes);
    });

    root.querySelectorAll("[data-party-close]").forEach((btn) => {
      btn.onclick = () => root.remove();
    });

    root.addEventListener("click", (e) => {
      if (e.target === root) root.remove();
    });

    root.querySelector("#gwPartyCreateBtn").onclick = () => {
      const title = root.querySelector("#gwPartyTitleInput").value.trim();
      const goalType = root.querySelector("#gwPartyGoalInput").value;
      const target = root.querySelector("#gwPartyTargetInput").value;
      const visibility = root.querySelector("#gwPartyVisibilityInput").value;
      const durationMinutes = root.querySelector("#gwPartyDurationInput").value;
      const startsAt = root.querySelector("#gwPartyStartInput")?.value;
      const locationMode =
        root.querySelector("input[name='gwPartyLocationMode']:checked")?.value || "anywhere";

      const form = {
        mode,
        title,
        goalType,
        target,
        visibility,
        durationMinutes,
        startsAt,
        locationMode,
        locationUserId: locationMode === "user" ? "self" : null,
        location: locationMode === "location" ? selectedPartyLocation : null
      };

      const locationCheck = resolvePartyLocationForStart(form);
      if (!locationCheck.ok) {
        toast(locationCheck.reason || "Choose a party location.");
        return;
      }

      const p = createParty(form);

      root.remove();

      if (p?.id) {
        openPartyCover(p.id);
      }
    };
  }

  function toDatetimeLocal(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDbPartyEvent(e) {
    const type = e.event_type || "party event";

    if (type === "party_created") return "Party created";
    if (type === "player_joined") return "Player joined";
    if (type === "player_left") return "Player left";
    if (type === "party_ended") return "Party ended";
    if (type === "evidence_counted") return "Observation counted";
    if (type === "inat_sync") {
      const imported = Number(e?.payload?.imported || 0);
      const linked = Number(e?.payload?.linked_members || 0);
      return imported
        ? `Synced ${imported} iNaturalist observation${imported === 1 ? "" : "s"} from ${linked || 1} linked member${linked === 1 ? "" : "s"}`
        : "Checked linked iNaturalist accounts";
    }

    return type.replaceAll("_", " ");
  }

  function clampPartyMeterPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function formatPartyClock(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    if (minutes) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
  }

  function formatPartySpan(ms) {
    const totalMinutes = Math.max(0, Math.floor(Number(ms || 0) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
    if (totalMinutes) return `${totalMinutes}m`;
    return "<1m";
  }

  function getPartyTimeMeter(party, nowMs = Date.now()) {
    const startMs = Date.parse(
      party?.startsAt || party?.starts_at || party?.createdAt || party?.created_at || ""
    );
    const durationMinutes = Number(party?.durationMinutes ?? party?.duration_minutes);
    const durationMs = durationMinutes * 60000;

    if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
      return {
        percent: 0,
        value: "No fixed end",
        note: "This party has no configured duration."
      };
    }

    const endedAtMs = Date.parse(party?.endedAt || party?.ended_at || party?.completedAt || "");
    const isEnded =
      party?.mode === "ended" || party?.status === "ended" || Number.isFinite(endedAtMs);
    const plannedEndMs = startMs + durationMs;

    if (isEnded) {
      const actualEndMs = Number.isFinite(endedAtMs) ? endedAtMs : plannedEndMs;
      return {
        percent: 100,
        value: "Complete",
        note: `Ended after ${formatPartySpan(Math.max(0, actualEndMs - startMs))}.`
      };
    }

    if (nowMs < startMs) {
      return {
        percent: 0,
        value: `Starts in ${formatPartyClock(startMs - nowMs)}`,
        note: `${formatPartySpan(durationMs)} planned duration.`
      };
    }

    const elapsedMs = Math.max(0, nowMs - startMs);
    const remainingMs = Math.max(0, plannedEndMs - nowMs);
    const percent = clampPartyMeterPercent((elapsedMs / durationMs) * 100);

    return {
      percent,
      value: remainingMs > 0 ? `${formatPartyClock(remainingMs)} remaining` : "Completing...",
      note: `${formatPartySpan(Math.min(elapsedMs, durationMs))} elapsed of ${formatPartySpan(durationMs)}.`
    };
  }

  function getPartyGoalMeter(party) {
    const progress = Math.max(Number(party?.progress || 0), getSharedPartyProgress(party?.id));
    const target = Math.max(0, Number(party?.target || 0));
    const percent = target > 0 ? clampPartyMeterPercent((progress / target) * 100) : 0;

    return {
      percent,
      value: target > 0 ? `${progress} / ${target}` : String(progress),
      note: target > 0 ? `${Math.round(percent)}% of observation goal.` : "Counted observations."
    };
  }

  function renderPartyCoverMetersHtml() {
    return `
      <div class="gw-party-meter-stack" id="gwPartyCoverMeters">
        <div class="gw-party-meter" data-party-meter="time">
          <div class="gw-party-meter-head">
            <span class="gw-party-meter-label">Time to completion</span>
            <strong class="gw-party-meter-value">Loading...</strong>
          </div>
          <div class="gw-party-meter-track" role="progressbar" aria-label="Party elapsed time" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="gw-party-meter-fill is-time"></div>
          </div>
          <div class="gw-party-meter-note"></div>
        </div>

        <div class="gw-party-meter" data-party-meter="goal">
          <div class="gw-party-meter-head">
            <span class="gw-party-meter-label">Goal progress</span>
            <strong class="gw-party-meter-value">Loading...</strong>
          </div>
          <div class="gw-party-meter-track" role="progressbar" aria-label="Party goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="gw-party-meter-fill is-goal"></div>
          </div>
          <div class="gw-party-meter-note"></div>
        </div>
      </div>
    `;
  }

  function updatePartyCoverMeter(root, key, meter) {
    const meterEl = root?.querySelector?.(`[data-party-meter="${key}"]`);
    if (!meterEl) return;

    const percent = clampPartyMeterPercent(meter.percent);
    const track = meterEl.querySelector(".gw-party-meter-track");
    const fill = meterEl.querySelector(".gw-party-meter-fill");
    const value = meterEl.querySelector(".gw-party-meter-value");
    const note = meterEl.querySelector(".gw-party-meter-note");

    if (track) {
      track.setAttribute("aria-valuenow", String(Math.round(percent)));
      track.setAttribute("aria-valuetext", meter.value);
    }
    if (fill) {
      fill.style.width = `${percent}%`;
      fill.classList.toggle("is-complete", percent >= 100);
    }
    if (value) value.textContent = meter.value;
    if (note) note.textContent = meter.note;
  }

  function refreshPartyCoverMeters(id) {
    const root = document.getElementById("gwPartyCoverRoot");
    if (!root || root.dataset.partyId !== id) return false;

    const party = getParty(id);
    if (!party) return false;

    updatePartyCoverMeter(root, "time", getPartyTimeMeter(party));
    updatePartyCoverMeter(root, "goal", getPartyGoalMeter(party));
    return true;
  }

  function stopPartyCoverMeterTimer() {
    window.clearInterval(window.__gwPartyCoverMeterTimer);
    window.__gwPartyCoverMeterTimer = null;
  }

  function startPartyCoverMeterTimer(id) {
    stopPartyCoverMeterTimer();
    refreshPartyCoverMeters(id);

    window.__gwPartyCoverMeterTimer = window.setInterval(() => {
      if (!refreshPartyCoverMeters(id)) stopPartyCoverMeterTimer();
    }, 1000);
  }

  function refreshOpenCover(id) {
    const root = document.getElementById("gwPartyCoverRoot");
    if (!root) return;
    if (root.dataset.partyId !== id) return;

    const progressEl = root.querySelector("#gwPartyCoverProgress");
    const membersEl = root.querySelector("#gwPartyCoverMembersLive");
    const activityEl = root.querySelector("#gwPartyCoverActivityLive");
    const countEl = root.querySelector("#gwPartyCoverMemberCount");

    const members = window.__gwState?.partyMembers || [];
    const events = window.__gwState?.partyEvents || [];
    if (countEl) {
      countEl.textContent = `${members.length || 1} joined`;
    }
    if (progressEl) {
      const party = getParty(id);
      progressEl.textContent = Math.max(Number(party?.progress || 0), getSharedPartyProgress(id));
    }
    refreshPartyCoverMeters(id);

    if (membersEl) {
      membersEl.innerHTML = renderPartyMembersHtml(id);
      bindPartyMemberInspection(membersEl);
    }

    if (activityEl) {
      activityEl.innerHTML = events.length
        ? `
        <div class="gw-party-activity-list">
          ${events
            .slice(0, 8)
            .map(
              (e) => `
            <div class="gw-party-activity-row">
              <span class="gw-party-activity-icon">
                ${e.event_type === "player_joined" ? "👥" : e.event_type === "party_created" ? "🎉" : "•"}
                </span>
              <span>
                <span class="gw-party-activity-text">
                ${esc(formatDbPartyEvent(e))}
                </span>
                <span class="gw-party-activity-time">${esc(formatWhen(e.created_at))}</span>
              </span>
            </div>
          `
            )
            .join("")}
        </div>
      `
        : renderPartyActivityHtml(id, 6);
    }
  }

  function openPartyCover(id) {
    injectStyles();

    const p = getParty(id);
    if (!p) {
      toast("Party not found");
      return;
    }

    const joined = isJoined(id);
    const active = getActivePartyId() === id;
    const url = partyUrl(id);

    const myPlayerId = window.GridWildAPI?.getPlayerId?.();

    const myDbMember = (window.__gwState?.partyMembers || []).find(
      (m) => m.player_id === myPlayerId
    );
    const isParticipant =
      joined ||
      getPartyMembers(id).some(
        (member) => String(member.playerId || "") === String(myPlayerId || "")
      );
    const chatCanSend = isParticipant && p.mode !== "ended" && p.status !== "ended";

    const canEndParty =
      p.created_by === myPlayerId ||
      myDbMember?.role === "leader" ||
      myDbMember?.role === "owner" ||
      myDbMember?.role === "creator";

    const root = document.createElement("div");
    root.className = "gw-party-backdrop";
    root.id = "gwPartyCoverRoot";
    root.dataset.partyId = id;

    root.innerHTML = `
      <div class="gw-party-cover">
        <div class="gw-party-cover-art">
          <div class="gw-party-rune">🎉</div>
          <div>
            <div class="gw-party-cover-kicker">${p.mode === "live" ? "Live Party" : "Scheduled Party"}</div>
            <div class="gw-party-cover-title">${esc(p.title)}</div>
            <div class="gw-party-cover-sub">
              Hosted by ${esc(p.host || "Unknown")} · ${esc(p.locationLabel || "Field site")}
                ${p.linkedQuestTitle ? `<br>Quest: ${esc(p.linkedQuestTitle)}` : ""}
            </div>
          </div>
        </div>

        <div class="gw-party-cover-grid">
          <div class="gw-party-stat">
            <div class="gw-party-stat-k">Goal</div>
            <div class="gw-party-stat-v">${esc(p.goalLabel)}</div>
          </div>

          <div class="gw-party-stat">
            <div class="gw-party-stat-k">Progress</div>
            <div class="gw-party-stat-v"><span id="gwPartyCoverProgress">
            ${Math.max(Number(p.progress || 0), getSharedPartyProgress(p.id))}
            </span> / ${Number(p.target || 0)}</div>
          </div>

        <div class="gw-party-stat">
        <div class="gw-party-stat-k">Members</div>
        <div class="gw-party-stat-v" id="gwPartyCoverMemberCount">
            ${Number(window.__gwState?.partyMembers?.length || p.memberCount || 1)} joined
        </div>
        </div>

          <div class="gw-party-stat">
            <div class="gw-party-stat-k">When</div>
            <div class="gw-party-stat-v">${p.mode === "live" ? "Now" : esc(formatWhen(p.startsAt))}</div>
          </div>
        </div>

        ${renderPartyCoverMetersHtml()}

        <div id="gwPartyCoverChat"></div>

        <div class="gw-party-qr-wrap">
          <img class="gw-party-qr" src="${qrSrc(id)}" alt="Party QR code">
          <div class="gw-muted" style="font-size:11px;line-height:1.35;margin-top:8px;">
            Scan to join this party. Fallback link:
            <div style="word-break:break-all;margin-top:4px;">${esc(url)}</div>
          </div>
        </div>

        <div class="gw-party-qr-wrap">
        <div class="gw-party-stat-k" style="margin-bottom:8px;">Participants</div>
        <div id="gwPartyCoverMembersLive">
            ${renderPartyMembersHtml(id)}
        </div>
        </div>

        <div class="gw-party-qr-wrap">
        <div class="gw-party-stat-k" style="margin-bottom:8px;">Activity</div>
        <div id="gwPartyCoverActivityLive">
        ${renderPartyActivityHtml(id, 6)}
        </div>
        </div>

        <div class="gw-party-modal-actions">
          <button class="gw-mini-btn" data-party-close>Close</button>
          ${
            joined
              ? `<button class="gw-mini-btn" id="gwPartySetActiveBtn">${active ? "Active" : "Set Active"}</button>
                 <button class="gw-mini-btn" id="gwPartyLeaveCoverBtn">Leave</button>`
              : `<button class="gw-mini-btn gw-party-primary" id="gwPartyJoinCoverBtn">Join Party</button>`
          }
        </div>
      </div>
    `;

    document.body.appendChild(root);
    window.GridWildPartyLive?.startCoverPolling?.(id);
    bindPartyMemberInspection(root);
    startPartyCoverMeterTimer(id);

    const chatMount = root.querySelector("#gwPartyCoverChat");
    const closeCover = () => {
      window.GridWildPartyLive?.stopCoverPolling?.();
      stopPartyCoverMeterTimer();
      window.GridWildChat?.destroy?.(chatMount);
      root.remove();
    };

    window.GridWildChat?.mount?.(chatMount, {
      roomType: "party",
      roomId: id,
      title: "Party chat",
      canRead: isParticipant,
      canSend: chatCanSend,
      disabledMessage: isParticipant
        ? "This party chat is read-only."
        : "Join this party to use chat.",
      onLocationOpen: closeCover,
      onAttachmentOpen: closeCover
    });

    root.querySelectorAll("[data-party-close]").forEach((btn) => {
      btn.onclick = closeCover;
    });

    root.addEventListener("click", (e) => {
      if (e.target === root) closeCover();
    });

    root.querySelector("#gwPartyJoinCoverBtn")?.addEventListener("click", () => {
      closeCover();
      joinParty(id);
    });

    root.querySelector("#gwPartyLeaveCoverBtn")?.addEventListener("click", () => {
      closeCover();
      leaveParty(id);
    });

    root.querySelector("#gwPartySetActiveBtn")?.addEventListener("click", () => {
      closeCover();
      setActivePartyId(id);
      toast("🟢 Party active");
    });
  }

  async function loadSharedPartyReport(id) {
    if (!id) throw new Error("party_report is required");
    if (typeof window.GridWildAPI?.getPartyReport !== "function") {
      throw new Error("Party report service is unavailable.");
    }

    const data = await window.GridWildAPI.getPartyReport(id);
    if (!data?.report?.party?.id) throw new Error("Party report not found.");
    return data.report;
  }

  function handlePartyReportFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("party_report");

    if (!reportId || window.__gwHandledPartyReportUrl) return;
    window.__gwHandledPartyReportUrl = true;

    loadSharedPartyReport(reportId)
      .then((report) => openStaticPartyReport(report))
      .catch((err) => {
        console.warn("Could not load party report:", err);
        alert(err?.message || "Could not open this GridWild party report.");
      });
  }

  function openStaticPartyReport(report) {
    injectStyles();

    const p = report.party || {};
    const evidence = report.evidence || [];

    const root = document.createElement("div");
    root.className = "gw-party-backdrop";

    root.innerHTML = `
    <div class="gw-party-cover gw-party-recap">
      <div class="gw-party-cover-art">
        <div class="gw-party-rune">📜</div>
        <div>
          <div class="gw-party-cover-kicker">Shared GridWild Report</div>
          <div class="gw-party-cover-title">${esc(p.title || "Party Report")}</div>
          <div class="gw-party-cover-sub">
            Hosted by ${esc(p.host || "Unknown")} · ${esc(p.locationLabel || "field site")}
          </div>
        </div>
      </div>

      <div class="gw-party-cover-grid">
        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Counted finds</div>
          <div class="gw-party-stat-v">${Number(p.countedCount || evidence.length)}</div>
        </div>

        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Route</div>
          <div class="gw-party-stat-v">${formatDistance(Number(p.routeDistanceMeters || 0))}</div>
        </div>

        <div class="gw-party-stat">
          <div class="gw-party-stat-k">Duration</div>
          <div class="gw-party-stat-v">${esc(p.durationLabel || "—")}</div>
        </div>

        <div class="gw-party-stat">
          <div class="gw-party-stat-k">${p.linkedQuestTitle ? "Quest" : "Goal"}</div>
          <div class="gw-party-stat-v">${esc(p.linkedQuestTitle || p.goalLabel || "Open field party")}</div>
        </div>
      </div>

      <div class="gw-party-recap-map" id="gwStaticPartyReportMap">
        ${(report.route || []).length ? "" : `<div class="gw-muted">No route points included.</div>`}
      </div>

      <div class="gw-party-qr-wrap">
        <div class="gw-party-stat-k" style="margin-bottom:8px;">Counted observations</div>
        ${
          evidence.length
            ? `<div class="gw-list">
                ${evidence
                  .map(
                    (e) => `
                  <div class="gw-rowline">
                    <span>${esc(e.taxon || "Observation")}</span>
                    <span class="gw-muted">${esc(e.cellKey || "no cell")}</span>
                  </div>
                `
                  )
                  .join("")}
              </div>`
            : `<div class="gw-muted">No counted observations included.</div>`
        }
      </div>

      <div class="gw-party-modal-actions">
        <button class="gw-mini-btn" data-party-close>Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(root);

    const closeReport = () => {
      destroyPartyRecapMaps(root);
      root.remove();
    };

    root.querySelectorAll("[data-party-close]").forEach((btn) => {
      btn.onclick = closeReport;
    });

    setTimeout(() => drawStaticPartyReportMap(report), 50);
  }

  function drawStaticPartyReportMap(report) {
    renderPartyRecapMap(
      document.getElementById("gwStaticPartyReportMap"),
      report.route || [],
      report.evidence || [],
      "Shared party trip report route map"
    );
  }

  function handleJoinFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("party");

    if (!id || window.__gwHandledPartyJoinUrl) return;
    window.__gwHandledPartyJoinUrl = true;

    setTimeout(() => {
      openPartyCover(id);
    }, 400);
  }

  function ensurePartyLayer() {
    if (!window.map || !window.L) return null;

    if (!map.getPane(PANE)) {
      map.createPane(PANE);
      map.getPane(PANE).style.zIndex = 835;
      map.getPane(PANE).style.pointerEvents = "auto";
    }

    if (!partyLayer) {
      partyLayer = L.layerGroup([], { pane: PANE }).addTo(map);
      partyMapLayers = null;
    }

    return partyLayer;
  }

  function ensurePartyMapLayers() {
    const root = ensurePartyLayer();
    if (!root || !window.L) return null;

    if (!partyMapLayers) {
      partyMapLayers = {
        public: L.layerGroup([], { pane: PANE }),
        route: L.layerGroup([], { pane: PANE }),
        evidence: L.layerGroup([], { pane: PANE }),
        beacon: L.layerGroup([], { pane: PANE })
      };

      root.addLayer(partyMapLayers.public);
      root.addLayer(partyMapLayers.route);
      root.addLayer(partyMapLayers.evidence);
      root.addLayer(partyMapLayers.beacon);
    }

    return partyMapLayers;
  }

  function clearPartyLiveRouteLayers() {
    const layers = ensurePartyMapLayers();
    layers?.route?.clearLayers?.();
    layers?.beacon?.clearLayers?.();
    partyLiveRouteState.partyId = null;
    partyLiveRouteState.segments = [];
    partyLiveRouteState.gaps = [];
    partyLiveRouteState.startMarker = null;
    partyLiveRouteState.latestMarker = null;
    partyLiveRouteState.beaconMarker = null;
  }

  function trimPartyRouteLayerList(layerGroup, rows, targetLength) {
    while (rows.length > targetLength) {
      const row = rows.pop();
      Object.values(row || {}).forEach((layer) => {
        if (layer?.removeFrom && layerGroup) layer.removeFrom(layerGroup);
      });
    }
  }

  function updatePartyRoutePair(layerGroup, rows, index, latLngs, options) {
    let row = rows[index];
    if (!row) {
      row = {
        shadow: L.polyline(latLngs, options.shadow).addTo(layerGroup),
        line: L.polyline(latLngs, options.line).addTo(layerGroup)
      };
      rows[index] = row;
      return row;
    }

    row.shadow.setLatLngs(latLngs);
    row.line.setLatLngs(latLngs);
    return row;
  }

  function updatePartyRouteEndpointMarker(layerGroup, key, latLng, options) {
    let marker = partyLiveRouteState[key];
    if (!latLng) {
      if (marker?.removeFrom) marker.removeFrom(layerGroup);
      partyLiveRouteState[key] = null;
      return;
    }

    if (!marker) {
      marker = L.circleMarker(latLng, options).addTo(layerGroup);
      partyLiveRouteState[key] = marker;
      return;
    }

    marker.setLatLng(latLng);
  }

  function updatePartyLiveRouteLayer(partyId, routeSplit, routeLatLngs) {
    const layers = ensurePartyMapLayers();
    const routeLayer = layers?.route;
    if (!routeLayer) return;

    if (partyLiveRouteState.partyId && partyLiveRouteState.partyId !== partyId) {
      clearPartyLiveRouteLayers();
    }
    partyLiveRouteState.partyId = partyId;

    const segmentOptions = {
      shadow: {
        pane: PANE,
        color: "#1a1209",
        weight: 9,
        opacity: 0.35,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      },
      line: {
        pane: PANE,
        color: "#f0d18a",
        weight: 5,
        opacity: 0.92,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }
    };
    const gapOptions = {
      shadow: {
        pane: PANE,
        color: "#1a1209",
        weight: 8,
        opacity: 0.28,
        dashArray: "4 8",
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      },
      line: {
        pane: PANE,
        color: "#f28e7d",
        weight: 3,
        opacity: 0.82,
        dashArray: "4 8",
        lineCap: "round",
        lineJoin: "round",
        interactive: true
      }
    };

    routeSplit.segments.forEach((segment, index) => {
      updatePartyRoutePair(
        routeLayer,
        partyLiveRouteState.segments,
        index,
        routeSegmentLatLngs(segment),
        segmentOptions
      );
    });
    trimPartyRouteLayerList(routeLayer, partyLiveRouteState.segments, routeSplit.segments.length);

    routeSplit.gaps.forEach((gap, index) => {
      const row = updatePartyRoutePair(
        routeLayer,
        partyLiveRouteState.gaps,
        index,
        gap.latLngs,
        gapOptions
      );
      const label = formatPartyRouteGap(gap);
      const tooltip = row.line.getTooltip?.();
      if (tooltip?.setContent) tooltip.setContent(label);
      else {
        row.line.bindTooltip(label, {
          direction: "top",
          offset: [0, -6],
          opacity: 0.94
        });
      }
    });
    trimPartyRouteLayerList(routeLayer, partyLiveRouteState.gaps, routeSplit.gaps.length);

    updatePartyRouteEndpointMarker(routeLayer, "startMarker", routeLatLngs[0] || null, {
      pane: PANE,
      radius: 6,
      color: "#14110f",
      weight: 2,
      fillColor: "#9ee6bd",
      fillOpacity: 0.95,
      interactive: false
    });

    updatePartyRouteEndpointMarker(
      routeLayer,
      "latestMarker",
      routeLatLngs[routeLatLngs.length - 1] || null,
      {
        pane: PANE,
        radius: 7,
        color: "#14110f",
        weight: 2,
        fillColor: "#ffe082",
        fillOpacity: 0.95,
        interactive: false
      }
    );
  }

  function isPublicPartyVisibleOnMap(p) {
    if (!p) return false;
    if (p.visibility !== "public") return false;
    if ((p.locationMode || p.location_mode || "anywhere") === "anywhere") return false;
    const mapLatLng = getPartyMapLatLng(p);
    if (!mapLatLng) return false;
    if (p.status === "ended") return false;

    return p.mode === "live" || p.mode === "upcoming" || p.mode === "scheduled";
  }

  function partyMapEmoji(p) {
    if (p.mode === "upcoming" || p.mode === "scheduled") return "📅";
    if (isJoined(p.id)) return "👥";
    return "•";
  }

  function addPublicPartyMarker(layer, p) {
    const activeId = getActivePartyId();
    if (!isPublicPartyVisibleOnMap(p)) return;
    if (p.id === activeId) return;

    const joined = isJoined(p.id);
    const upcoming = p.mode === "upcoming" || p.mode === "scheduled";

    const icon = L.divIcon({
      className: [
        "gw-party-public-marker",
        joined ? "is-joined" : "",
        upcoming ? "is-upcoming" : "is-live"
      ].join(" "),
      html: `
      <div class="gw-party-public-marker-core">
        ${partyMapEmoji(p)}
      </div>
    `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const mapLatLng = getPartyMapLatLng(p);
    if (!mapLatLng) return;

    const marker = L.marker([mapLatLng.lat, mapLatLng.lng], {
      icon,
      pane: PANE,
      interactive: true
    });

    marker.bindTooltip(
      `${esc(p.title || "Party")}<br>${upcoming ? esc(formatWhen(p.startsAt)) : "Live now"} · ${Number(p.memberCount || 1)} joined`,
      {
        direction: "top",
        offset: [0, -8],
        opacity: 0.96
      }
    );

    marker.on("click", () => {
      if (p.pending) return;
      openPartyCover(p.id);
    });
    marker.addTo(layer);
  }

  function addNearbyPublicPartyMarkers(layer) {
    getAllParties()
      .filter(isPublicPartyVisibleOnMap)
      .forEach((p) => addPublicPartyMarker(layer, p));
  }

  function refreshMapBeacon() {
    const layers = ensurePartyMapLayers();
    if (!layers) return;

    const activeId = getActivePartyId();
    layers.public.clearLayers();
    layers.evidence.clearLayers();
    addNearbyPublicPartyMarkers(layers.public);

    const p = activeId ? getParty(activeId) : null;
    if (!p) {
      clearPartyLiveRouteLayers();
      return;
    }

    const route = loadPartyRoutes()[p.id] || [];
    const routeSplit = splitPartyRouteBySampleGaps(route);
    const routeLatLngs = routeSplit.points.map((pt) => [pt.lat, pt.lng]);
    updatePartyLiveRouteLayer(p.id, routeSplit, routeLatLngs);

    // ---------------------------------------------------------------------------
    // Counted observation dots
    // ---------------------------------------------------------------------------
    const evidence = getPartyEvidenceRows(p.id);

    evidence.forEach((e) => {
      const lat = Number(e.lat);
      const lng = Number(e.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const dot = L.circleMarker([lat, lng], {
        pane: PANE,
        radius: 7,
        color: "#14110f",
        weight: 2,
        fillColor: "#f4e8cf",
        fillOpacity: 0.98,
        interactive: true
      });

      dot.bindTooltip(esc(e.taxon || "Party observation"), {
        direction: "top",
        offset: [0, -6],
        opacity: 0.95
      });

      dot.addTo(layers.evidence);
    });

    // ---------------------------------------------------------------------------
    // Main active-party beacon
    // Prefer latest GPS route point; fall back to party start/center.
    // ---------------------------------------------------------------------------
    let beaconLatLng = null;

    if (routeLatLngs.length) {
      beaconLatLng = routeLatLngs[routeLatLngs.length - 1];
    } else if ((p.locationMode || p.location_mode || "anywhere") !== "anywhere") {
      const mapLatLng = getPartyMapLatLng(p);
      if (mapLatLng) beaconLatLng = [mapLatLng.lat, mapLatLng.lng];
    }

    if (!beaconLatLng) {
      layers.beacon.clearLayers();
      partyLiveRouteState.beaconMarker = null;
      return;
    }

    if (partyLiveRouteState.beaconMarker) {
      partyLiveRouteState.beaconMarker.setLatLng(beaconLatLng);
      return;
    }

    const icon = L.divIcon({
      className: "gw-party-marker",
      html: `<div class="gw-party-marker-core">🎉</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    const marker = L.marker(beaconLatLng, {
      icon,
      pane: PANE,
      interactive: true
    });

    marker.on("click", () => openPartyCover(p.id));
    marker.addTo(layers.beacon);
    partyLiveRouteState.beaconMarker = marker;
  }

  function toast(message) {
    injectStyles();

    const old = document.querySelector(".gw-party-toast");
    if (old) old.remove();

    const el = document.createElement("div");
    el.className = "gw-party-toast";
    el.textContent = message;
    document.body.appendChild(el);

    requestAnimationFrame(() => el.classList.add("is-visible"));

    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 180);
    }, 1800);
  }

  function getActiveParty() {
    const id = getActivePartyId();
    return id ? getParty(id) : null;
  }

  function isPartyHudCollapsed() {
    return localStorage.getItem(PARTY_HUD_COLLAPSED_KEY) === "1";
  }

  function setPartyHudCollapsed(value) {
    localStorage.setItem(PARTY_HUD_COLLAPSED_KEY, value ? "1" : "0");
    renderActivePartyHud();
  }

  function partyRaiseChevronSvg() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6.5 15.5 5.5-5.5 5.5 5.5"></path>
      <path d="m7.5 10.5 4.5-4.5 4.5 4.5"></path>
    </svg>
  `;
  }

  function positionPartyHudRaiseTab() {
    if (!partyHudRaiseTab) return;
    const navBtn = document.getElementById("btnCommunity");
    const nav = document.querySelector(".gw-bottomnav");
    if (!navBtn || !nav) return;

    const btnRect = navBtn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    partyHudRaiseTab.style.setProperty(
      "--gw-raise-tab-left",
      `${btnRect.left + btnRect.width / 2}px`
    );
    partyHudRaiseTab.style.setProperty(
      "--gw-raise-tab-bottom",
      `${Math.max(0, window.innerHeight - navRect.top - 10)}px`
    );
  }

  function bindPartyRaiseTabPositioning() {
    if (partyRaiseTabPositionBound) return;
    partyRaiseTabPositionBound = true;
    window.addEventListener("resize", positionPartyHudRaiseTab);
    window.addEventListener("orientationchange", () => setTimeout(positionPartyHudRaiseTab, 150));
  }

  function renderPartyHudRaiseTab(show) {
    if (!show) {
      removePartyHudRaiseTab();
      return;
    }

    if (!partyHudRaiseTab) {
      partyHudRaiseTab = document.createElement("button");
      partyHudRaiseTab.className = "gw-hud-raise-tab gw-hud-raise-tab-party";
      partyHudRaiseTab.type = "button";
      partyHudRaiseTab.setAttribute("aria-label", "Expand party banner");
      partyHudRaiseTab.title = "Expand party banner";
      partyHudRaiseTab.innerHTML = partyRaiseChevronSvg();
      partyHudRaiseTab.addEventListener("click", () => setPartyHudCollapsed(false));
      document.body.appendChild(partyHudRaiseTab);
      bindPartyRaiseTabPositioning();
    }

    positionPartyHudRaiseTab();
  }

  function removePartyHudRaiseTab() {
    if (!partyHudRaiseTab) return;
    partyHudRaiseTab.remove();
    partyHudRaiseTab = null;
  }

  function partyCollapseIconSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="6" width="14" height="12" rx="2"></rect>
      <path d="M5 10h14"></path>
      <path d="M10 15h4"></path>
    </svg>`;
  }

  function renderActivePartyHud() {
    injectStyles();

    const existing = document.getElementById("gwActivePartyHud");
    const party = getActiveParty();

    if (!party) {
      existing?.remove();
      removePartyHudRaiseTab();
      return;
    }

    if (isPartyHudCollapsed()) {
      existing?.remove();
      renderPartyHudRaiseTab(true);
      return;
    }

    renderPartyHudRaiseTab(false);

    const route = loadPartyRoutes()[party.id] || [];
    const evidenceCount = Math.max(Number(party.progress || 0), getSharedPartyProgress(party.id));
    const target = Math.max(1, Number(party.target || 1));
    const pct = Math.max(0, Math.min(100, (evidenceCount / target) * 100));
    const pending = Boolean(party.pending || String(party.id || "").startsWith("pending_party_"));
    const ending = partyIsEnding(party.id);
    const syncStatus = partyRouteSyncStatus(party.id);
    const syncLabel = partyRouteSyncLabel(party.id);
    const partySubline = ending
      ? `Ending party; saving route...`
      : pending
        ? `Starting online party...`
        : `${evidenceCount}/${target} counted &middot; ${getPartyDurationLabel(party)} &middot; ${formatDistance(getRouteDistanceMeters(route))}`;

    let hud = existing;
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "gwActivePartyHud";
      hud.className = "gw-active-party-hud";
      document.body.appendChild(hud);
    }

    hud.classList.toggle("is-pending", pending);
    hud.classList.toggle("is-ending", ending);
    hud.classList.toggle("has-route-queue", syncStatus.pending > 0);
    hud.innerHTML = `
    <button class="gw-active-party-main" id="gwActivePartyOpenBtn" type="button" ${pending || ending ? "disabled" : ""}>
      <div class="gw-active-party-topline">
        <span class="gw-active-party-dot">🎉</span>
        <span class="gw-active-party-title">${esc(party.title || "Active Party")}</span>
        ${pending ? `<span class="gw-active-party-status">Starting</span>` : ""}
        ${ending ? `<span class="gw-active-party-status">Ending</span>` : ""}
      </div>

      <div class="gw-active-party-sub">
        ${partySubline}
      </div>

      <div class="gw-active-party-sync" aria-live="polite">
        ${esc(syncLabel)}
      </div>

      <div class="gw-active-party-bar">
        <div style="width:${pct}%"></div>
      </div>
    </button>

    <div class="gw-active-party-actions">
      <button class="gw-active-party-btn gw-active-party-icon-btn" id="gwActivePartyCollapseBtn" type="button" aria-label="Minimize party banner" title="Minimize party banner">${partyCollapseIconSvg()}</button>
      <button class="gw-active-party-btn danger" id="gwActivePartyEndBtn" type="button" ${pending || ending ? "disabled" : ""}>${ending ? "Ending" : "End"}</button>
    </div>
  `;

    hud.querySelector("#gwActivePartyOpenBtn")?.addEventListener("click", () => {
      if (pending || ending) return;
      openPartyCover(party.id);
    });

    hud.querySelector("#gwActivePartyCollapseBtn")?.addEventListener("click", () => {
      setPartyHudCollapsed(true);
    });

    hud.querySelector("#gwActivePartyEndBtn")?.addEventListener("click", () => {
      if (pending || ending) return;
      endParty(party.id);
    });
  }

  function scheduleActivePartyHudRender() {
    window.clearTimeout(window.__gwActivePartyHudTimer);
    window.__gwActivePartyHudTimer = window.setTimeout(renderActivePartyHud, 40);
  }

  function injectStyles() {
    if ($("gwPartyStyles")) return;

    const style = document.createElement("style");
    style.id = "gwPartyStyles";
    style.textContent = `
      #sheetCommunity .gw-sheet-card {
        height: min(78vh, 760px);
        height: min(78dvh, 760px);
        max-height: min(78vh, 760px);
        max-height: min(78dvh, 760px);
      }

      #sheetCommunity .gw-sheet-body {
        flex: 1 1 auto;
        min-height: 0;
      }

      .gw-party-start-main {
        border-color: rgba(240,209,138,0.65) !important;
        color: #fff2c8 !important;
        box-shadow: 0 0 18px rgba(215,183,116,0.20), inset 0 1px 0 rgba(255,255,255,0.06) !important;
      }

      .gw-party-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
        align-items: center;
      }

      .gw-party-join-input {
        flex: 1 1 150px;
        min-width: 0;
        height: 33px;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.22);
        background: rgba(20,17,15,0.48);
        color: #f4e8cf;
        font: inherit;
        font-size: 12px;
        outline: none;
      }

      .gw-party-join-input:focus {
        border-color: rgba(240,209,138,0.62);
        box-shadow: 0 0 0 2px rgba(240,209,138,0.12);
      }

      .gw-party-qr-scan-btn {
        width: 34px;
        height: 33px;
        padding: 0 !important;
        display: inline-grid;
        place-items: center;
      }

      .gw-party-qr-scan-btn svg {
        width: 17px;
        height: 17px;
        fill: currentColor;
      }

      .gw-party-tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin: 0 0 12px 0;
      }

      .gw-party-tab {
        appearance: none;
        border: 1px solid rgba(215,183,116,0.20);
        background: rgba(30,26,22,0.92);
        color: rgba(239,230,211,0.72);
        border-radius: 999px;
        padding: 8px 6px;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.45px;
      }

      .gw-party-tab.is-active {
        color: #f0d18a;
        border-color: rgba(240,209,138,0.55);
        background: rgba(92,73,43,0.85);
      }

      .gw-party-panel {
        display: none;
      }

      .gw-party-panel.is-active {
        display: block;
      }

      .gw-party-list {
        display: grid;
        gap: 10px;
      }

      .gw-party-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 10px;
        border-radius: 14px;
        background: rgba(20,17,15,0.35);
        border: 1px solid rgba(215,183,116,0.14);
      }

      .gw-party-title {
        font-size: 13px;
        font-weight: 950;
        color: #f4e8cf;
      }

      .gw-party-meta,
      .gw-party-goal {
        margin-top: 3px;
        font-size: 11px;
        line-height: 1.25;
        color: rgba(239,230,211,0.66);
      }

      .gw-party-goal {
        color: rgba(240,209,138,0.88);
        font-weight: 800;
      }

      .gw-party-actions {
        display: grid;
        gap: 6px;
        align-content: center;
      }

      .gw-party-actions .gw-mini-btn {
        padding: 7px 9px;
        font-size: 10px;
      }

      .gw-party-progress {
        height: 8px;
        border-radius: 999px;
        margin-top: 7px;
        overflow: hidden;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(215,183,116,0.10);
      }

      .gw-party-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
      }

      .gw-party-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99997;
        background: rgba(8,12,10,0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-party-modal,
      .gw-party-cover {
        width: min(540px, 96vw);
        max-height: 92vh;
        overflow: auto;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        color: #efe6d3;
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-party-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }

      .gw-party-modal-title {
        font-size: 18px;
        font-weight: 950;
        color: #f0d18a;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }

      .gw-party-x {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid rgba(215,183,116,0.25);
        background: rgba(0,0,0,0.18);
        color: #efe6d3;
        font-size: 20px;
        font-weight: 900;
      }

      .gw-party-label {
        display: block;
        margin: 10px 0 5px 0;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: rgba(240,209,138,0.88);
      }

      .gw-party-input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.22);
        background: rgba(255,255,255,0.06);
        color: #efe6d3;
        padding: 10px;
        font-size: 13px;
      }

      .gw-party-input option {
        color: #111;
      }

      .gw-party-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 14px;
        flex-wrap: wrap;
      }

      .gw-party-primary {
        border-color: rgba(240,209,138,0.70) !important;
        color: #fff2c8 !important;
      }

      .gw-party-cover-art {
        border-radius: 20px;
        padding: 16px;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        align-items: center;
        background:
          radial-gradient(circle at 20% 10%, rgba(240,209,138,0.16), transparent 40%),
          linear-gradient(180deg, rgba(80,63,36,0.85), rgba(32,26,21,0.92));
        border: 1px solid rgba(240,209,138,0.24);
      }

      .gw-party-rune {
        width: 58px;
        height: 58px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        font-size: 32px;
        background: rgba(0,0,0,0.22);
        border: 1px solid rgba(240,209,138,0.28);
      }

      .gw-party-cover-kicker {
        font-size: 10px;
        font-weight: 950;
        color: rgba(240,209,138,0.82);
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }

      .gw-party-cover-title {
        font-size: 22px;
        line-height: 1.1;
        font-weight: 950;
        color: #fff2c8;
        margin-top: 3px;
      }

      .gw-party-cover-sub {
        margin-top: 6px;
        font-size: 12px;
        color: rgba(239,230,211,0.70);
      }

      .gw-party-cover-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 12px;
      }

      .gw-party-stat {
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(215,183,116,0.14);
        background: rgba(255,255,255,0.045);
      }

      .gw-party-stat-k {
        font-size: 10px;
        color: rgba(239,230,211,0.58);
        text-transform: uppercase;
        font-weight: 900;
        letter-spacing: 0.5px;
      }

      .gw-party-stat-v {
        margin-top: 4px;
        font-size: 13px;
        color: #f4e8cf;
        font-weight: 850;
      }

      .gw-party-meter-stack {
        display: grid;
        gap: 12px;
        margin-top: 12px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(215,183,116,0.14);
        background: rgba(10,15,12,0.34);
      }

      .gw-party-meter {
        min-width: 0;
      }

      .gw-party-meter-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-party-meter-label {
        min-width: 0;
        color: rgba(239,230,211,0.68);
        font-size: 10px;
        line-height: 1.2;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .gw-party-meter-value {
        flex: 0 1 auto;
        min-width: 0;
        color: #fff2c8;
        font-size: 13px;
        line-height: 1.2;
        font-weight: 950;
        text-align: right;
      }

      .gw-party-meter-track {
        height: 11px;
        margin-top: 7px;
        overflow: hidden;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.30);
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.32);
      }

      .gw-party-meter-fill {
        width: 0;
        height: 100%;
        border-radius: inherit;
        transition: width 500ms linear;
      }

      .gw-party-meter-fill.is-time {
        background: linear-gradient(90deg, #d7b774, #ef9d47);
      }

      .gw-party-meter-fill.is-goal {
        background: linear-gradient(90deg, #4f9f64, #83d174);
      }

      .gw-party-meter-fill.is-complete {
        background: linear-gradient(90deg, #5ebd73, #b7e66f);
      }

      .gw-party-meter-note {
        margin-top: 5px;
        color: rgba(239,230,211,0.54);
        font-size: 10px;
        line-height: 1.25;
      }

      .gw-party-qr-wrap {
        text-align: center;
        margin-top: 14px;
        padding: 12px;
        border-radius: 18px;
        background: rgba(255,255,255,0.045);
        border: 1px solid rgba(215,183,116,0.12);
      }

      .gw-party-qr {
        width: min(260px, 70vw);
        height: min(260px, 70vw);
        border-radius: 14px;
        background: white;
        padding: 8px;
      }

      .gw-party-marker {
        background: transparent;
        border: 0;
      }

      .gw-party-marker-core {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(47,40,33,0.96);
        border: 2px solid rgba(240,209,138,0.88);
        box-shadow:
          0 0 0 8px rgba(240,209,138,0.12),
          0 0 24px rgba(240,209,138,0.42),
          0 8px 20px rgba(0,0,0,0.35);
        animation: gwPartyPulse 1.4s infinite ease-in-out;
      }

      @keyframes gwPartyPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.09); }
      }

      .gw-party-toast {
        position: fixed;
        left: 50%;
        bottom: calc(max(10px, env(safe-area-inset-bottom)) + 96px);
        z-index: 999999;
        transform: translate(-50%, 12px);
        opacity: 0;
        transition: opacity 160ms ease, transform 160ms ease;
        padding: 10px 14px;
        border-radius: 999px;
        color: #fff2c8;
        background: rgba(20,17,15,0.96);
        border: 1px solid rgba(240,209,138,0.55);
        box-shadow: 0 10px 28px rgba(0,0,0,0.40);
        font-size: 13px;
        font-weight: 900;
        pointer-events: none;
      }

      .gw-party-toast.is-visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }


      .gw-party-tabs {
     grid-template-columns: repeat(4, 1fr);
    }

    .gw-party-recap-map {
      position: relative;
      width: 100%;
      height: 260px;
      min-height: 240px;
      margin-top: 12px;
      overflow: hidden;
      border: 1px solid rgba(215,183,116,0.22);
      border-radius: 8px;
      background: #dfe5db;
    }

    .gw-party-recap-map.is-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.18);
    }

    .gw-party-recap-map .leaflet-control-attribution {
      max-width: calc(100% - 8px);
      background: rgba(255,255,255,0.82);
      font-size: 8px;
      line-height: 1.25;
      white-space: normal;
    }

    .gw-party-recap-map .leaflet-tooltip {
      border: 1px solid rgba(50,42,31,0.25);
      border-radius: 6px;
      background: rgba(255,255,255,0.94);
      color: #201711;
      font-size: 10px;
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(0,0,0,0.18);
    }

    .gw-active-party-hud {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(max(10px, env(safe-area-inset-bottom)) + 86px);
    z-index: 1510;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: stretch;
    pointer-events: auto;
    }

    .gw-active-party-main {
    text-align: left;
    border: 1px solid rgba(240,209,138,0.44);
    border-radius: 18px;
    padding: 10px 12px;
    background:
        radial-gradient(circle at 12% 0%, rgba(240,209,138,0.16), transparent 36%),
        linear-gradient(180deg, rgba(47,40,33,0.97), rgba(20,17,15,0.98));
    color: #efe6d3;
    box-shadow:
        0 12px 30px rgba(0,0,0,0.42),
        inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .gw-active-party-main:disabled {
    opacity: 1;
    cursor: wait;
    }

    .gw-active-party-topline {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    }

    .gw-active-party-dot {
    flex: 0 0 auto;
    }

    .gw-active-party-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #fff2c8;
    font-size: 13px;
    font-weight: 950;
    }

    .gw-active-party-status {
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 2px 6px;
    background: rgba(240,209,138,0.16);
    border: 1px solid rgba(240,209,138,0.34);
    color: #f0d18a;
    font-size: 9px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    }

    .gw-active-party-sub {
    margin-top: 3px;
    font-size: 11px;
    color: rgba(239,230,211,0.68);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    }

    .gw-active-party-sync {
    margin-top: 3px;
    font-size: 10px;
    font-weight: 850;
    color: rgba(158,230,189,0.74);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    }

    .gw-active-party-hud.has-route-queue .gw-active-party-sync {
    color: rgba(255,224,130,0.92);
    }

    .gw-active-party-bar {
    margin-top: 7px;
    height: 7px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(215,183,116,0.12);
    }

    .gw-active-party-bar > div {
    height: 100%;
    background: linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
    }

    .gw-active-party-hud.is-pending .gw-active-party-bar > div {
    width: 38% !important;
    animation: gwPartyPendingBar 1.1s ease-in-out infinite alternate;
    }

    @keyframes gwPartyPendingBar {
    from { transform: translateX(-24%); opacity: 0.62; }
    to { transform: translateX(190%); opacity: 1; }
    }

    .gw-active-party-actions {
    display: grid;
    gap: 6px;
    }

    .gw-active-party-btn {
    border: 1px solid rgba(215,183,116,0.30);
    border-radius: 14px;
    padding: 0 10px;
    min-width: 58px;
    background: linear-gradient(180deg, rgba(92,73,43,0.96), rgba(49,36,20,0.98));
    color: #efe6d3;
    font-size: 10px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.35px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.32);
    }

    .gw-active-party-icon-btn {
    display: grid;
    place-items: center;
    min-width: 44px;
    padding: 0;
    }

    .gw-active-party-icon-btn svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    }

    .gw-active-party-btn:disabled {
    opacity: 0.55;
    cursor: wait;
    }

    .gw-active-party-btn.danger {
    border-color: rgba(255,130,110,0.34);
    color: #ffd8d2;
    background: linear-gradient(180deg, rgba(110,54,42,0.96), rgba(54,26,21,0.98));
    }

    @media (min-width: 760px) {
    .gw-active-party-hud {
        left: 50%;
        right: auto;
        width: min(620px, calc(100vw - 32px));
        transform: translateX(-50%);
    }
    }

    .gw-party-evidence-row {
    align-items: center;
    gap: 10px;
    }

    .gw-party-evidence-row.excluded {
    opacity: 0.58;
    }

    .gw-party-evidence-exclude-btn,
    .gw-party-evidence-reinclude-btn {
    padding: 6px 8px !important;
    font-size: 9px !important;
    border-radius: 999px !important;
    white-space: nowrap;
    }

    .gw-party-evidence-exclude-btn {
    border-color: rgba(255,130,110,0.34) !important;
    color: #ffd8d2 !important;
    background: linear-gradient(180deg, rgba(110,54,42,0.96), rgba(54,26,21,0.98)) !important;
    }

    .gw-party-template-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
    }

    .gw-party-template-btn {
    border-radius: 14px;
    border: 1px solid rgba(215,183,116,0.24);
    background: rgba(255,255,255,0.055);
    color: #efe6d3;
    padding: 9px 8px;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 900;
    text-align: left;
    }

    .gw-party-template-btn.is-selected {
    border-color: rgba(240,209,138,0.72);
    background: rgba(240,209,138,0.14);
    color: #fff2c8;
    }

    .gw-party-setup-row {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(74px, 0.7fr) minmax(0, 1fr);
    gap: 8px;
    align-items: end;
    margin-top: 2px;
    }

    .gw-party-field {
    min-width: 0;
    }

    .gw-party-field .gw-party-label {
    margin-top: 10px;
    }

    .gw-party-location-segment {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    }

    .gw-party-location-option {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 38px;
    border-radius: 12px;
    border: 1px solid rgba(215,183,116,0.22);
    background: rgba(255,255,255,0.055);
    color: rgba(239,230,211,0.76);
    font-size: 11px;
    font-weight: 950;
    cursor: pointer;
    }

    .gw-party-location-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    }

    .gw-party-location-option.is-active {
    border-color: rgba(240,209,138,0.72);
    background: rgba(240,209,138,0.14);
    color: #fff2c8;
    }

    .gw-party-location-panel {
    display: none;
    margin-top: 8px;
    padding: 10px;
    border-radius: 14px;
    border: 1px solid rgba(215,183,116,0.16);
    background: rgba(255,255,255,0.045);
    }

    .gw-party-location-panel.is-active {
    display: block;
    }

    .gw-party-location-panel-title {
    color: #f4e8cf;
    font-size: 12px;
    font-weight: 950;
    overflow-wrap: anywhere;
    }

    .gw-party-location-panel-copy {
    margin-top: 3px;
    color: rgba(239,230,211,0.62);
    font-size: 11px;
    line-height: 1.35;
    }

    .gw-party-location-pick {
    margin-top: 8px;
    }

    .gw-party-public-marker {
  background: transparent;
  border: 0;
}

.gw-party-public-marker-core {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(30,26,22,0.88);
  border: 2px solid rgba(215,183,116,0.34);
  color: #f4e8cf;
  font-size: 16px;
  font-weight: 950;
  box-shadow:
    0 0 0 5px rgba(240,209,138,0.08),
    0 8px 18px rgba(0,0,0,0.34);
  opacity: 0.84;
}

.gw-party-public-marker.is-live .gw-party-public-marker-core {
  animation: gwPartyPublicPulse 1.8s infinite ease-in-out;
}

.gw-party-public-marker.is-joined .gw-party-public-marker-core {
  border-color: rgba(240,209,138,0.78);
  box-shadow:
    0 0 0 7px rgba(240,209,138,0.12),
    0 0 18px rgba(240,209,138,0.20),
    0 8px 18px rgba(0,0,0,0.34);
}

.gw-party-public-marker.is-upcoming .gw-party-public-marker-core {
  opacity: 0.76;
  border-style: dashed;
}

@keyframes gwPartyPublicPulse {
  0%, 100% { transform: scale(1); opacity: 0.80; }
  50% { transform: scale(1.08); opacity: 1; }
}

.gw-party-member-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.gw-party-member-pill {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-radius: 14px;
  border: 1px solid rgba(215,183,116,0.14);
  background: rgba(255,255,255,0.045);
  color: inherit;
  font: inherit;
  appearance: none;
  text-align: left;
  cursor: pointer;
}

.gw-party-member-inspect:hover,
.gw-party-member-inspect:focus-visible {
  border-color: rgba(240,209,138,0.42);
  background: rgba(240,209,138,0.09);
  outline: none;
}

.gw-party-member-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,0.20);
}

.gw-party-member-name {
  display: block;
  font-size: 12px;
  font-weight: 950;
  color: #f4e8cf;
}

.gw-party-member-role {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: rgba(239,230,211,0.58);
  text-transform: uppercase;
  letter-spacing: 0.45px;
  font-weight: 900;
}

.gw-party-activity-list {
  display: grid;
  gap: 8px;
}

.gw-party-activity-row {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 8px;
  align-items: start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(215,183,116,0.10);
}

.gw-party-activity-row:last-child {
  border-bottom: 0;
}

.gw-party-activity-icon {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,0.18);
  font-size: 12px;
}

.gw-party-activity-text {
  display: block;
  font-size: 12px;
  line-height: 1.25;
  color: #efe6d3;
  font-weight: 800;
}

.gw-party-activity-time {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: rgba(239,230,211,0.54);
}

@media (max-width: 600px) {
  .gw-party-meter-stack {
    gap: 14px;
    padding: 11px;
  }

  .gw-party-meter-head {
    align-items: flex-start;
  }

  .gw-party-meter-label {
    max-width: 44%;
  }

  .gw-party-meter-value {
    max-width: 56%;
    overflow-wrap: anywhere;
  }

  .gw-party-meter-track {
    height: 13px;
  }
}
    `;

    document.head.appendChild(style);
  }

  window.addEventListener("gwDraftObservationsChanged", () => {
    scanDraftsForActiveParty();
  });

  window.addEventListener("gwPartyEvidenceChanged", () => {
    refreshMapBeacon();
  });

  window.addEventListener("gwPartiesChanged", () => {
    refreshMapBeacon();
  });

  window.addEventListener("gwActivePartyChanged", () => {
    refreshMapBeacon();
  });

  window.addEventListener("gridwild:unitschange", () => {
    refreshMapBeacon();
    rerenderPartySheet();
    scheduleActivePartyHudRender();
  });

  window.addEventListener("gwPartiesChanged", scheduleActivePartyHudRender);
  window.addEventListener("gwPartyEvidenceChanged", scheduleActivePartyHudRender);
  window.addEventListener("gwActivePartyChanged", scheduleActivePartyHudRender);

  function initPartyAfterPageLoad() {
    setTimeout(() => {
      refreshMapBeacon();
      handleJoinFromUrl();
      handlePartyReportFromUrl();
      scheduleActivePartyHudRender();
    }, 500);
  }

  if (document.readyState === "complete") {
    initPartyAfterPageLoad();
  } else {
    window.addEventListener("load", initPartyAfterPageLoad, { once: true });
  }

  function getDraftPartyMatchStatus(draft) {
    const party = getActiveParty();

    if (!party) {
      return {
        hasActiveParty: false,
        status: "none",
        label: "No active party",
        reason: "Start or join a party to score this observation."
      };
    }

    const evidenceKey = `${party.id}::${draft?.id}`;
    const evidence = loadPartyEvidence();
    const alreadyCounted = evidence[evidenceKey]?.status === "counted";

    if (alreadyCounted) {
      return {
        hasActiveParty: true,
        party,
        status: "counted",
        label: `Counted for ${party.title}`,
        reason: "This draft has already been counted for the active party."
      };
    }

    if (!draftHasUsableEvidence(draft)) {
      return {
        hasActiveParty: true,
        party,
        status: "blocked",
        label: `Active party: ${party.title}`,
        reason: "Needs at least one photo before it can count."
      };
    }

    if (!partyGoalMatchesDraft(party, draft)) {
      return {
        hasActiveParty: true,
        party,
        status: "blocked",
        label: `Active party: ${party.title}`,
        reason: `Taxon does not match party goal: ${party.goalLabel || "party objective"}.`
      };
    }

    return {
      hasActiveParty: true,
      party,
      status: "will_count",
      label: `Will count for ${party.title}`,
      reason: party.linkedQuestTitle
        ? `Also linked to quest: ${party.linkedQuestTitle}.`
        : "This draft matches the active party objective."
    };
  }

  function renderDraftPartyChipHtml(draft) {
    const s = getDraftPartyMatchStatus(draft);

    if (!s.hasActiveParty) {
      return `
        <div class="gw-obs-party-chip muted">
            <div class="gw-obs-party-chip-title">🎉 No active party</div>
            <div class="gw-obs-party-chip-sub">${esc(s.reason)}</div>
        </div>
        `;
    }

    const cls =
      s.status === "counted" ? "counted" : s.status === "will_count" ? "will-count" : "blocked";

    const icon = s.status === "counted" ? "✅" : s.status === "will_count" ? "🎉" : "⚠️";

    return `
        <div class="gw-obs-party-chip ${cls}">
        <div class="gw-obs-party-chip-title">${icon} ${esc(s.label)}</div>
        <div class="gw-obs-party-chip-sub">${esc(s.reason)}</div>
    </div>
    `;
  }

  function retryPartyDurabilityQueues(delayMs = 500) {
    if (partyRouteOutboxRows().length) schedulePartyRouteOutboxFlush(delayMs);
    if (loadPartyEndOutbox().length) schedulePartyEndOutboxFlush(delayMs + 250);
  }

  window.addEventListener("online", () => retryPartyDurabilityQueues(250));
  window.addEventListener("focus", () => retryPartyDurabilityQueues(350));
  window.addEventListener("pagehide", () => markPartyRouteBackgrounded());
  window.addEventListener("pageshow", () => {
    markPartyRouteResumed("pageshow");
    retryPartyDurabilityQueues(350);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      markPartyRouteBackgrounded();
      return;
    }
    if (document.visibilityState === "visible") {
      markPartyRouteResumed("visibilitychange");
      retryPartyDurabilityQueues(350);
    }
  });
  window.setTimeout(() => retryPartyDurabilityQueues(1200), 0);

  window.GridWildParty = {
    renderSheetHtml,
    bindSheetControls,
    openPartyCreateModal,
    openPartyCover,
    joinParty,
    leaveParty,
    createParty,
    loadParties,
    getAllParties,
    getActivePartyId,
    setActivePartyId,
    refreshMapBeacon,
    handleJoinFromUrl,

    // Party scoring
    scanDraftsForActiveParty,
    attachDraftToActiveParty,
    countEvidenceForParty,
    loadPartyEvidence,

    // Party recaps
    openPartyRecap,
    shareParty,
    endParty,
    recordPartyPosition,
    loadPartyRoutes,
    flushPartyRouteOutbox,
    partyRouteSyncStatus,
    rememberPartySnapshot,
    hydratePartySnapshot,

    // Derive a party from a quest
    createPartyFromQuest,
    goalTypeFromQuestRecipe,

    // Auto-claiming evidence for quests from party
    autoClaimDraftForLinkedQuest,
    normalizeDraftForQuestEvidence,
    getQuestById,

    // Party HUD
    renderActivePartyHud,
    scheduleActivePartyHudRender,
    getActiveParty,
    isPartyHudCollapsed,
    setPartyHudCollapsed,

    // evidence for draft observations...
    getDraftPartyMatchStatus,
    renderDraftPartyChipHtml,

    // for updating evidence of party goal
    getExcludedPartyEvidenceRows,
    setPartyEvidenceStatus,
    excludePartyEvidence,
    reincludePartyEvidence,

    // Party recap sharing
    partyReportUrl,
    makePartyReportPayload,
    openStaticPartyReport,

    // show parties on main hud
    addNearbyPublicPartyMarkers,
    addPublicPartyMarker,
    isPublicPartyVisibleOnMap,

    // Party members and activity
    loadPartyMembers,
    savePartyMembers,
    getPartyMembers,
    ensurePartyMembers,
    loadPartyActivity,
    savePartyActivity,
    addPartyActivity,
    getPartyActivity,
    renderPartyMembersHtml,
    renderPartyActivityHtml,
    refreshOpenCover
  };
})();
