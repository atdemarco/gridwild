// -----------------------------------------------------------------------------
// GridWild Party System
// Local prototype: parties, joining, scheduled events, QR cover screen, map beacon
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_parties_v1";
  const ACTIVE_KEY = "gw_active_party_id_v1";
  const PANE = "gwPartyPane";
  const PARTY_EVIDENCE_KEY = "gw_party_evidence_links_v1";
  const PARTY_ROUTE_KEY = "gw_party_routes_v1";
  const PARTY_MEMBERS_KEY = "gw_party_members_v1";
  const PARTY_ACTIVITY_KEY = "gw_party_activity_v1";



  let partyLayer = null;

    const PARTY_TEMPLATES = [
    { key: "birds", emoji: "🐦", label: "Bird Walk", title: "Bird Walk", goalType: "birds", target: 20, durationMinutes: 90 },
    { key: "ants", emoji: "🐜", label: "Ant Hunt", title: "Ant Hunt", goalType: "ants", target: 10, durationMinutes: 60 },
    { key: "insects", emoji: "🦋", label: "Insect Sweep", title: "Insect Sweep", goalType: "insects", target: 25, durationMinutes: 60 },
    { key: "fungi", emoji: "🍄", label: "Fungus / Lichen", title: "Fungus Foray", goalType: "fungi", target: 12, durationMinutes: 90 },
    { key: "plants", emoji: "🌿", label: "Plant Survey", title: "Plant Survey", goalType: "plants", target: 20, durationMinutes: 60 },
    { key: "any", emoji: "🌎", label: "Bioblitz", title: "Mini Bioblitz", goalType: "any", target: 50, durationMinutes: 120 }
    ];

  const MOCK_PARTIES = [
    {
      id: "mock_ant_sweep",
      title: "Pollinator Garden Ant Sweep",
      host: "Mia",
      mode: "live",
      visibility: "public",
      goalType: "ants",
      goalLabel: "Find 10 ant observations",
      progress: 3,
      target: 10,
      memberCount: 4,
      distanceLabel: "0.2 mi",
      startsAt: new Date().toISOString(),
      locationLabel: "Georgetown Pollinator Garden",
      lat: 38.911325,
      lng: -77.076678
    },
    {
      id: "mock_bird_walk",
      title: "Lunch Bird Walk",
      host: "Theo",
      mode: "live",
      visibility: "public",
      goalType: "birds",
      goalLabel: "Detect 20 bird species",
      progress: 8,
      target: 20,
      memberCount: 6,
      distanceLabel: "0.6 mi",
      startsAt: new Date().toISOString(),
      locationLabel: "Canal trail",
      lat: 38.9104,
      lng: -77.0736
    },
    {
      id: "mock_moth_sheet",
      title: "Friday Night Moth Sheet",
      host: "Rina",
      mode: "upcoming",
      visibility: "public",
      goalType: "insects",
      goalLabel: "Document 25 nocturnal insects",
      progress: 0,
      target: 25,
      memberCount: 9,
      distanceLabel: "1.1 mi",
      startsAt: nextDateAt(5, 21, 0),
      locationLabel: "Rock Creek edge",
      lat: 38.9196,
      lng: -77.0451
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

  function makeId() {
    return `party_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function nextDateAt(dayOffset, hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + Number(dayOffset || 0));
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
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

    function loadParties() { return []; }


function saveParties() {}

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
  const mode = p.status === "ended"
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
    visibility: "public",
    goalType: "any",
    goalLabel: "Open field party",
    progress: Number(window.__gwState?.partyProgress || 0),
    target: Number(p.target || 10),
    memberCount: Number(window.__gwState?.partyMembers?.length || 1),
    distanceLabel: "online",
    startsAt: p.starts_at || p.created_at || new Date().toISOString(),
    durationMinutes: Number(p.duration_minutes || 60),
    locationMode,
    locationUserId: p.location_user_id || locationConfig.locationUserId || null,
    location: locationConfig.location || null,
    resolvedLocation: locationConfig.resolvedLocation || null,
    locationLabel: p.location_label || locationConfig.location?.label || partyLocationLabel({ ...p, locationMode }),
    lat: Number(mapLatLng?.lat || fallbackCenter?.lat || 38.911325),
    lng: Number(mapLatLng?.lng || fallbackCenter?.lng || -77.076678),
    createdAt: p.created_at || new Date().toISOString(),
    dbBacked: true
  };
}

function getAllParties() {
  const activeParty = normalizeDbPartyForLegacy(window.__gwState?.party);

  const nearbyParties = (window.__gwState?.nearbyParties || [])
    .map(normalizeDbPartyForLegacy)
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

  MOCK_PARTIES.forEach(addParty);

  return rows;
}

  function getParty(id) {
    return getAllParties().find(p => p.id === id) || null;
  }

  function getMyPartyIds() {
    try {
      const ids = JSON.parse(localStorage.getItem("gw_my_party_ids_v1") || "[]");
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  }

  function saveMyPartyIds(ids) {
    localStorage.setItem("gw_my_party_ids_v1", JSON.stringify(Array.from(new Set(ids))));
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
  return window.__gwState?.player?.display_name ||
    window.__gwUser?.username ||
    "You";
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

  const selected = form.location && typeof form.location === "object"
    ? {
      label: String(form.location.label || "Selected location"),
      lat: Number(form.location.lat),
      lng: Number(form.location.lng)
    }
    : null;

  return {
    locationMode: mode,
    locationUserId: mode === "user" ? (form.locationUserId || "self") : null,
    location: mode === "location" &&
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
  if (mode === "user") return p.locationLabel || p.location_label || `${getCurrentUserDisplayName()}'s location`;
  if (mode === "location") return p.locationLabel || p.location_label || p.location?.label || "Selected location";
  return p?.locationLabel || p?.location_label || "Anywhere";
}

function getPartyMapLatLng(p) {
  const mode = p?.locationMode || p?.location_mode || "anywhere";

  if (
    mode === "user" &&
    (
      (!p?.createdBy && !p?.created_by) ||
      String(p?.createdBy || p?.created_by) === String(window.GridWildAPI?.getPlayerId?.() || "")
    )
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
  try {
    const parsed = JSON.parse(localStorage.getItem(PARTY_MEMBERS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePartyMembers(store) {
  localStorage.setItem(PARTY_MEMBERS_KEY, JSON.stringify(store || {}));
}

function loadPartyActivity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PARTY_ACTIVITY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePartyActivity(store) {
  localStorage.setItem(PARTY_ACTIVITY_KEY, JSON.stringify(store || {}));
}

function addPartyActivity(partyId, type, text, meta = {}) {
  if (!partyId) return;

  // DB-backed parties use party_events from Supabase.
  if (!String(partyId).startsWith("mock_")) return;

  const store = loadPartyActivity();
  store[partyId] = store[partyId] || [];

  store[partyId].unshift({
    id: makeId(),
    type,
    text,
    actor: meta.actor || getCurrentUserName(),
    t: nowISO(),
    meta
  });

  store[partyId] = store[partyId].slice(0, 80);
  savePartyActivity(store);
}

function getPartyActivity(partyId) {
  const activeId = window.__gwState?.party?.id;

  if (partyId && activeId === partyId) {
    return (window.__gwState?.partyEvents || []).map(e => ({
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
  if (party?.dbBacked) return [];

  const store = loadPartyMembers();
  store[party.id] = store[party.id] || [];

  const existing = store[party.id];
  const names = new Set(existing.map(m => m.name));

  if (!names.has(party.host || "Host")) {
    existing.push({
      id: `host_${party.id}`,
      name: party.host || "Host",
      role: "host",
      joinedAt: party.createdAt || party.startsAt || nowISO(),
      isLocal: false
    });
  }

  if (isJoined(party.id) && !names.has(getCurrentUserName())) {
    existing.push({
      id: "you",
      name: getCurrentUserName(),
      role: "observer",
      joinedAt: nowISO(),
      isLocal: true
    });
  }

  // Local/demo flavor for mock parties only.
  if (String(party.id).startsWith("mock_")) {
    [
      { name: "Mia", role: "scout" },
      { name: "Theo", role: "identifier" },
      { name: "Rina", role: "observer" }
    ].forEach(m => {
      if (!existing.some(x => x.name === m.name)) {
        existing.push({
          id: `mock_${party.id}_${m.name}`,
          name: m.name,
          role: m.role,
          joinedAt: party.startsAt || nowISO(),
          isLocal: false
        });
      }
    });
  }

  store[party.id] = existing;
  savePartyMembers(store);
  return existing;
}

function getPartyMembers(partyId) {
  const activeId = window.__gwState?.party?.id;

  if (partyId && activeId === partyId) {
    return (window.__gwState?.partyMembers || []).map(m => ({
      id: m.id || m.player_id,
      name: m.players?.display_name || m.player_id?.slice(0, 8) || "Unknown",
      role: m.role || "member",
      joinedAt: m.joined_at,
      isLocal: false,
      dbBacked: true
    }));
  }

  // Keep mock parties working for now.
  const party = getParty(partyId);
  return String(partyId || "").startsWith("mock_") && party
    ? ensurePartyMembers(party)
    : [];
}

function memberRoleLabel(role) {
  return {
    host: "Host",
    scout: "Scout",
    identifier: "Identifier",
    observer: "Observer"
  }[role] || "Observer";
}

function renderPartyMembersHtml(partyId) {
  const members = getPartyMembers(partyId);

  if (!members.length) {
    return `<div class="gw-muted">No visible participants yet.</div>`;
  }

  return `
    <div class="gw-party-member-grid">
      ${members.map(m => `
        <div class="gw-party-member-pill">
          <span class="gw-party-member-avatar">${m.role === "host" ? "⭐" : "👤"}</span>
          <span>
            <span class="gw-party-member-name">${esc(m.name)}</span>
            <span class="gw-party-member-role">${esc(memberRoleLabel(m.role))}</span>
          </span>
        </div>
      `).join("")}
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
      ${rows.map(a => `
        <div class="gw-party-activity-row">
          <span class="gw-party-activity-icon">${activityIcon(a.type)}</span>
          <span>
            <span class="gw-party-activity-text">${esc(a.text)}</span>
            <span class="gw-party-activity-time">${esc(formatWhen(a.t))}</span>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function activityIcon(type) {
  return {
    joined: "👥",
    started: "🎉",
    counted: "✅",
    excluded: "🚫",
    reincluded: "↩️",
    ended: "🏁",
    goal: "🏆"
  }[type] || "•";
}

function loadPartyEvidence() { return {}; }
function savePartyEvidence() {}
function setPartyEvidenceStatus() { return false; }

function draftHasUsableEvidence(draft) {
  return !!draft?.id && Array.isArray(draft.photos) && draft.photos.length > 0;
}

function getDraftIconicTaxon(draft) {
  return String(
    draft?.suggestedId?.iconicTaxon ||
    draft?.suggestedId?.kingdom ||
    ""
  );
}

function loadPartyRoutes() {
  const activeId = window.__gwState?.party?.id;
  const route = window.__gwState?.partyRoute || [];

  if (!activeId || !route.length) return {};

  return {
    [activeId]: route.map(p => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyMeters: p.accuracy_meters,
      t: p.created_at
    }))
  };
}

function recordPartyPosition(lat, lng, accuracyMeters) {
  const partyId = getActivePartyId();
  if (!partyId) return;

  const acc = Number(accuracyMeters);
  if (Number.isFinite(acc) && acc > 60) return;

  // Avoid sending too many route points.
  window.__gwState = window.__gwState || {};
  const now = Date.now();
  const lastTime = Number(window.__gwState.lastPartyRoutePointAt || 0);

  if (now - lastTime < 8000) return;
  window.__gwState.lastPartyRoutePointAt = now;

  window.GridWildAPI?.addPartyRoutePoint?.(
    partyId,
    Number(lat),
    Number(lng),
    Number.isFinite(acc) ? acc : null
  ).catch(err => {
    console.warn("Could not sync party route point:", err);
  });

  scheduleActivePartyHudRender();
  refreshMapBeacon();
}

function getPartyEvidenceRows(partyId) {
  const activeId = window.__gwState?.party?.id;

  if (partyId && activeId === partyId) {
    return (window.__gwState?.partyEvidence || [])
      .filter(e => e.status === "counted")
      .map(e => ({
        partyId: e.party_id,
        draftId: e.draft_id,
        taxon: e.taxon || e.iconic_taxon || "Observation",
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
  const activeId = window.__gwState?.party?.id;

  if (partyId && activeId === partyId) {
    return (window.__gwState?.partyEvidence || [])
      .filter(e => e.status === "excluded")
      .map(e => ({
        partyId: e.party_id,
        draftId: e.draft_id,
        taxon: e.taxon || e.iconic_taxon || "Observation",
        cellKey: e.cell_key || null,
        lat: e.lat || null,
        lng: e.lng || null,
        countedAt: e.created_at,
        excludedAt: e.updated_at || e.created_at
      }))
      .sort((a, b) =>
        new Date(a.excludedAt || a.countedAt || 0) -
        new Date(b.excludedAt || b.countedAt || 0)
      );
  }

  return [];
}

async function excludePartyEvidence(partyId, draftId) {
  try {
    await window.GridWildAPI.updatePartyEvidenceStatus(
      partyId,
      draftId,
      "excluded"
    );

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
    await window.GridWildAPI.updatePartyEvidenceStatus(
      partyId,
      draftId,
      "counted"
    );

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
  const end = party?.endedAt || party?.completedAt
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
  const toRad = d => d * Math.PI / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function getRouteDistanceMeters(points) {
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1], points[i]);
    if (Number.isFinite(d) && d < 500) total += d;
  }

  return total;
}

function formatDistance(meters) {
  const m = Number(meters || 0);
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function endPartyLocalOnly(id) {
  if (getActivePartyId() === id) setActivePartyId("");

  toast("🏁 Party ended");
  addPartyActivity(id, "ended", `${getCurrentUserName()} ended the party`);
  rerenderPartySheet();
}

function endParty(id) {

  if (window.GridWildAPI?.endParty && !String(id).startsWith("mock_")) {
    window.GridWildAPI.endParty(id)
      .then(async () => {
        window.GridWildPartyLive?.setActivePartyId?.(null);
        await window.GridWildPartyLive?.loadParty?.();
        await window.GridWildPartyLive?.refreshPartySheet?.();

        endPartyLocalOnly(id);
        toast("🏁 Online party ended");
      })
      .catch(err => {
        console.error("DB end failed:", err);
        toast("Could not end online party");
      });

    return;
  }

  // fallback
  endPartyLocalOnly(id);
}

function shareParty(id) {
  const p = getParty(id);
  if (!p) return;

  const url = partyReportUrl(id);

  const text = [
    `GridWild Party Report: ${p.title}`,
    `Counted observations: ${countEvidenceForParty(id)}`,
    `Duration: ${getPartyDurationLabel(p)}`,
    `Open static report: ${url}`
  ].join("\n");

  if (navigator.share) {
    navigator.share({
      title: `GridWild Party Report: ${p.title}`,
      text,
      url
    }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(url);
    toast("🔗 Static report link copied");
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
  if (goal === "fungi") return iconic === "Fungi" || haystack.includes("lichen") || haystack.includes("fung");

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
    return Array.isArray(quests)
      ? quests.find(q => q.id === questId) || null
      : null;
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
    window.dispatchEvent(new CustomEvent("gwPartyAutoClaimedQuestEvidence", {
      detail: { party, quest, draft, result }
    }));
  }

  return result;
}

function attachDraftToActiveParty(draft) {
  const partyId = getActivePartyId();
  if (!partyId || !draftHasUsableEvidence(draft)) return false;

  const party = getParty(partyId);
  if (!party) return false;
  if (!partyGoalMatchesDraft(party, draft)) return false;

const alreadyCounted = (window.__gwState?.partyEvidence || [])
  .some(e =>
    e.party_id === partyId &&
    e.draft_id === draft.id &&
    e.status === "counted"
  );

if (alreadyCounted) return false;

const taxon =
  draft?.suggestedId?.taxonName ||
  draft?.suggestedId?.iconicTaxon ||
  "Draft observation";

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
  .catch(err => {
    console.warn("Could not sync party evidence:", err);
  });


    addPartyActivity(
    partyId,
    "counted",
    `${getCurrentUserName()} counted ${taxon || "an observation"}`,
    { draftId: draft.id }
    );

    refreshMapBeacon();

    const questClaim = autoClaimDraftForLinkedQuest(party, draft);

    if (questClaim.ok) {
    toast(`🎉 Counted for party + quest`);
    } else {
    toast(`🎉 Counted for ${party.title}`);
    }

    window.dispatchEvent(new CustomEvent("gwPartyEvidenceCounted", {
    detail: { party, draft, questClaim }
    }));

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

function joinParty(id) {

  if (window.GridWildAPI?.joinParty && !String(id).startsWith("mock_")) {
    window.GridWildAPI.joinParty(id)
      .then(async () => {
        window.GridWildPartyLive?.setActivePartyId?.(id);

        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();

        setActivePartyId(id);
        addPartyActivity(id, "joined", `${getCurrentUserName()} joined the party`);

        toast("👥 Joined online party");
        rerenderPartySheet();
        openPartyCover(id);
      })
      .catch(err => {
        console.error("DB join failed:", err);
        toast("Could not join online party");
      });

    return;
  }

  // fallback
  joinPartyLocalOnly(id);
}


  function joinPartyLocalOnly(id) {   
    const ids = getMyPartyIds();
    if (!ids.includes(id)) ids.push(id);
    saveMyPartyIds(ids);
    setActivePartyId(id);
    ensurePartyMembers(getParty(id));
    addPartyActivity(id, "joined", `${getCurrentUserName()} joined the party`);

    toast("👥 Joined party");
    rerenderPartySheet();
    openPartyCover(id);
  }

  function leavePartyLocalOnly(id) {
  
  if (getActivePartyId() === id) setActivePartyId("");

  toast("Left party");
  rerenderPartySheet();
}

function leaveParty(id) {
  if (window.GridWildAPI?.leaveParty && !String(id).startsWith("mock_")) {
    window.GridWildAPI.leaveParty(id)
      .then(async () => {
        window.GridWildPartyLive?.setActivePartyId?.(null);

        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();

        leavePartyLocalOnly(id);
        toast("Left online party");

      })
      .catch(err => {
          console.error("DB leave failed:", err);
          toast("Could not leave online party");
      });

    return;
  }

  leavePartyLocalOnly(id);
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

  const target =
    Number(recipe.quantity || quest.targetCount || 5) ||
    5;

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

    if (window.GridWildPartyLive?.createDbPartyFromLegacyForm && !form.__localOnly) {
    window.GridWildPartyLive.createDbPartyFromLegacyForm(form)
        .then(dbParty => {
        toast("🎉 Online party started");
        rerenderPartySheet();

        // For now, do not open the old cover for DB parties unless they are mirrored locally.
        // Next patch will normalize DB party objects into old cover format.
        })
      .catch(err => {
        console.error("DB party create failed:", err);
        toast("Could not start online party");
        });

    return null;
    }

    const center = window.map?.getCenter?.();
    const mapLocation = locationResolution.resolvedLocation;

    const party = {
      id: makeId(),
      title: form.title || autoTitle(form.goalType),
      host: window.__gwUser?.username || "You",
      mode: form.mode || "live",
      visibility: form.visibility || "public",
      goalType: form.goalType || "any",
      goalLabel: goalLabel(form.goalType, form.target),
      progress: 0,
      target: Number(form.target || 10),
      memberCount: 1,
      distanceLabel: "here",
      startsAt: form.mode === "scheduled" && form.startsAt
        ? new Date(form.startsAt).toISOString()
        : nowISO(),
      durationMinutes: Number(form.durationMinutes || 60),
      locationMode: form.locationMode || "anywhere",
      locationUserId: form.locationUserId || null,
      location: form.location || null,
      resolvedLocation: form.resolvedLocation || null,
      locationLabel: form.locationLabel || "Anywhere",
      lat: Number(mapLocation?.lat || center?.lat || 38.911325),
      lng: Number(mapLocation?.lng || center?.lng || -77.076678),
      createdAt: nowISO(),
      linkedQuestId: form.linkedQuestId || null,
      linkedQuestTitle: form.linkedQuestTitle || "",
      linkedQuestRecipe: form.linkedQuestRecipe || null
    };

    const parties = loadParties();
    parties.unshift(party);
    saveParties(parties);

    const myIds = getMyPartyIds();
    myIds.push(party.id);
    saveMyPartyIds(myIds);

    ensurePartyMembers(party);
    addPartyActivity(party.id, "started", `${getCurrentUserName()} started the party`);

    setActivePartyId(party.id);
    toast("🎉 Party started");
    rerenderPartySheet();
    openPartyCover(party.id);

    return party;
  }

  function autoTitle(goalType) {
    return {
      ants: "Ant Hunt",
      birds: "Bird Walk",
      insects: "Insect Sweep",
      plants: "Plant Survey",
      fungi: "Fungus Foray",
      any: "Biodiversity Party"
    }[goalType] || "GridWild Party";
  }

  function goalLabel(goalType, target) {
    const n = Number(target || 10);

    return {
      ants: `Find ${n} ant observations`,
      birds: `Detect ${n} bird species`,
      insects: `Document ${n} insect observations`,
      plants: `Document ${n} plant observations`,
      fungi: `Find ${n} fungi / lichens`,
      any: `Make ${n} useful observations`
    }[goalType] || `Complete ${n} observations`;
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

function encodePartyReport(payload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodePartyReport(encoded) {
  const json = decodeURIComponent(escape(atob(encoded)));
  return JSON.parse(json);
}

function partyReportUrl(id) {
  const payload = makePartyReportPayload(id);
  if (!payload) return "";

  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?party_report=${encodeURIComponent(encodePartyReport(payload))}`;
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
    
    const evidenceCount = Math.max(
    Number(p.progress || 0),
    getSharedPartyProgress(p.id)
    );
    const pct = Math.max(0, Math.min(100, (evidenceCount / Math.max(1, Number(p.target || 1))) * 100));

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
    const live = all.filter(p =>
    p.mode === "live" &&
    p.status !== "ended" &&
    !p.endedAt
    );
    const upcoming = all.filter(p => p.mode === "upcoming" || p.mode === "scheduled");
    const activeId = getActivePartyId();
    const mine = all.filter(p => p.id === activeId || p.dbBacked);
    
    return `
      <div class="gw-card gw-party-hero-card">
        <div class="gw-card-title">Party</div>

        <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
          Start a live field session, schedule a bird walk, join nearby parties, or show a QR cover screen so others can join from their phones.
        </div>

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
    const activeId = getActivePartyId();

    const rows = all
    .filter(p => p.id === activeId || p.dbBacked)
    .filter(p => p.endedAt || p.completedAt || countEvidenceForParty(p.id) > 0)
    .sort((a, b) =>
      new Date(b.endedAt || b.completedAt || b.startsAt || b.createdAt || 0) -
      new Date(a.endedAt || a.completedAt || a.startsAt || a.createdAt || 0)
    );

    if (!rows.length) {
        return `<div class="gw-muted">No party history yet. Start a party and count observations to create a trip report.</div>`;
    }

  return rows.map(p => {
    const evidenceCount = countEvidenceForParty(p.id);
    const route = loadPartyRoutes()[p.id] || [];

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
  }).join("");
}


  function bindSheetControls(root = document) {
    injectStyles();

    root.querySelectorAll(".gw-party-tab").forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.partyTab;

        root.querySelectorAll(".gw-party-tab").forEach(x => x.classList.remove("is-active"));
        root.querySelectorAll(".gw-party-panel").forEach(x => x.classList.remove("is-active"));

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
    joinInput?.addEventListener("keydown", evt => {
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

    root.querySelectorAll(".gw-party-join-btn").forEach(btn => {
      btn.onclick = () => joinParty(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-leave-btn").forEach(btn => {
      btn.onclick = () => leaveParty(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-view-btn").forEach(btn => {
      btn.onclick = () => openPartyCover(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-recap-btn").forEach(btn => {
    btn.onclick = () => openPartyRecap(btn.dataset.partyId);
    });

    root.querySelectorAll(".gw-party-share-btn").forEach(btn => {
    btn.onclick = () => shareParty(btn.dataset.partyId);
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
            ${evidence.map(e => `
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
            `).join("")}
            </div>`
        : `<div class="gw-muted">No counted observations yet.</div>`
    }

    ${
        excludedEvidence.length
        ? `
            <div class="gw-party-stat-k" style="margin:14px 0 8px 0;">Excluded</div>
            <div class="gw-list">
            ${excludedEvidence.map(e => `
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
            `).join("")}
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
        <button class="gw-mini-btn" id="gwPartyShareRecapBtn">Share</button>
        ${getActivePartyId() === id
        ? `<button class="gw-mini-btn" id="gwPartyEndRecapBtn">End Party</button>`
        : ""
        }
      </div>
    </div>
  `;

  document.body.appendChild(root);
  
  
  root.querySelectorAll("[data-party-close]").forEach(btn => {
    btn.onclick = () => root.remove();
  });

  root.addEventListener("click", e => {
    if (e.target === root) root.remove();
  });

  root.querySelector("#gwPartyShareRecapBtn")?.addEventListener("click", () => {
    shareParty(id);
  });

  root.querySelector("#gwPartyEndRecapBtn")?.addEventListener("click", () => {
    endParty(id);
    root.remove();
  });

    root.querySelectorAll(".gw-party-evidence-exclude-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        excludePartyEvidence(btn.dataset.partyId, btn.dataset.draftId)
        .then(() => {
            root.remove();
            openPartyRecap(id);
        });
    });
    });

    root.querySelectorAll(".gw-party-evidence-reinclude-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        reincludePartyEvidence(btn.dataset.partyId, btn.dataset.draftId)
        .then(() => {
            root.remove();
            openPartyRecap(id);
        });
    });
    });

  setTimeout(() => drawPartyRecapMap(id), 50);
}

function drawPartyRecapMap(id) {
  const host = document.getElementById(`gwPartyRecapMap_${id}`);
  if (!host) return;

  const route = loadPartyRoutes()[id] || [];
  const evidence = getPartyEvidenceRows(id);

  if (!route.length && !evidence.length) return;

  host.innerHTML = "";

  const pts = [
    ...route.map(p => ({ lat: Number(p.lat), lng: Number(p.lng), kind: "route" })),
    ...evidence
      .filter(e => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)))
      .map(e => ({ lat: Number(e.lat), lng: Number(e.lng), kind: "obs" }))
  ].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (!pts.length) {
    host.innerHTML = `<div class="gw-muted">No mappable points recorded.</div>`;
    return;
  }

  const minLat = Math.min(...pts.map(p => p.lat));
  const maxLat = Math.max(...pts.map(p => p.lat));
  const minLng = Math.min(...pts.map(p => p.lng));
  const maxLng = Math.max(...pts.map(p => p.lng));

  const padLat = Math.max(0.00008, (maxLat - minLat) * 0.16);
  const padLng = Math.max(0.00008, (maxLng - minLng) * 0.16);

  const width = 520;
  const height = 260;

  const xOf = lng => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * width;
  const yOf = lat => height - (((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * height);

  const routePath = route
    .filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(Number(p.lng)).toFixed(1)} ${yOf(Number(p.lat)).toFixed(1)}`)
    .join(" ");

  const obsDots = evidence
    .filter(e => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)))
    .map(e => `
      <circle
        cx="${xOf(Number(e.lng)).toFixed(1)}"
        cy="${yOf(Number(e.lat)).toFixed(1)}"
        r="5"
        class="gw-party-recap-obs-dot"
      >
        <title>${esc(e.taxon || "Observation")}</title>
      </circle>
    `).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="gw-party-recap-svg" role="img" aria-label="Party route map">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" class="gw-party-recap-map-bg"></rect>

      ${routePath ? `<path d="${routePath}" class="gw-party-recap-route"></path>` : ""}

      ${route.length ? `
        <circle cx="${xOf(Number(route[0].lng)).toFixed(1)}" cy="${yOf(Number(route[0].lat)).toFixed(1)}" r="6" class="gw-party-recap-start"></circle>
        <circle cx="${xOf(Number(route[route.length - 1].lng)).toFixed(1)}" cy="${yOf(Number(route[route.length - 1].lat)).toFixed(1)}" r="6" class="gw-party-recap-end"></circle>
      ` : ""}

      ${obsDots}
    </svg>
  `;
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
          ${PARTY_TEMPLATES.map(t => `
            <option value="${esc(t.key)}">${esc(t.emoji)} ${esc(t.label)}</option>
          `).join("")}
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
      root.querySelectorAll(".gw-party-location-option").forEach(label => {
        const input = label.querySelector("input");
        const active = input?.value === modeName;
        label.classList.toggle("is-active", active);
        if (input) input.checked = active;
      });

      root.querySelectorAll(".gw-party-location-panel").forEach(panel => {
        panel.classList.toggle("is-active", panel.dataset.locationPanel === modeName);
      });
    }

    function setSelectedPartyLocation(location) {
      selectedPartyLocation = location;
      const titleEl = root.querySelector("#gwPartyLocationSummary");
      const coordEl = root.querySelector("#gwPartyLocationCoords");
      if (titleEl) titleEl.textContent = location?.label || "Selected location";
      if (coordEl) {
        coordEl.textContent = Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))
          ? `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
          : "Pick a saved location or choose a new coordinate.";
      }
    }

    root.querySelectorAll("input[name='gwPartyLocationMode']").forEach(input => {
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

    root.querySelector("#gwPartyTemplateInput")?.addEventListener("change", e => {
        const t = PARTY_TEMPLATES.find(x => x.key === e.target.value);
        if (!t) return;

        root.querySelector("#gwPartyTitleInput").value = t.title;
        root.querySelector("#gwPartyGoalInput").value = t.goalType;
        root.querySelector("#gwPartyTargetInput").value = t.target;
        root.querySelector("#gwPartyDurationInput").value = String(t.durationMinutes);
    });

    root.querySelectorAll("[data-party-close]").forEach(btn => {
      btn.onclick = () => root.remove();
    });

    root.addEventListener("click", e => {
      if (e.target === root) root.remove();
    });

    root.querySelector("#gwPartyCreateBtn").onclick = () => {
      const title = root.querySelector("#gwPartyTitleInput").value.trim();
      const goalType = root.querySelector("#gwPartyGoalInput").value;
      const target = root.querySelector("#gwPartyTargetInput").value;
      const visibility = root.querySelector("#gwPartyVisibilityInput").value;
      const durationMinutes = root.querySelector("#gwPartyDurationInput").value;
      const startsAt = root.querySelector("#gwPartyStartInput")?.value;
      const locationMode = root.querySelector("input[name='gwPartyLocationMode']:checked")?.value || "anywhere";

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
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDbPartyEvent(e) {
  const type = e.event_type || "party event";

  if (type === "party_created") return "Party created";
  if (type === "player_joined") return "Player joined";

  return type.replaceAll("_", " ");
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
    if (countEl) { countEl.textContent = `${members.length || 1} joined`; }

    if (membersEl) {
    membersEl.innerHTML = members.length
      ? `
        <div class="gw-party-member-grid">
          ${members.map(m => `
            <div class="gw-party-member-pill">
              <span class="gw-party-member-avatar">${m.role === "leader" ? "⭐" : "👤"}</span>
              <span>
                <span class="gw-party-member-name">
                ${esc(m.players?.display_name || m.player_id?.slice(0, 8) || "Unknown")}
                </span>
                <span class="gw-party-member-role">${esc(m.role || "member")}</span>
              </span>
            </div>
          `).join("")}
        </div>
      `
      : renderPartyMembersHtml(id);
  }

  if (activityEl) {
    activityEl.innerHTML = events.length
      ? `
        <div class="gw-party-activity-list">
          ${events.slice(0, 8).map(e => `
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
          `).join("")}
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

    const myDbMember = (window.__gwState?.partyMembers || [])
    .find(m => m.player_id === myPlayerId);

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

        <div class="gw-party-stat-v">
        <span id="gwPartyCoverProgress">
            ${Math.max(Number(p.progress || 0), countEvidenceForParty(p.id))}
        </span> / ${Number(p.target || 0)}
        </div>

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

    root.querySelectorAll("[data-party-close]").forEach(btn => {
      btn.onclick = () => {
        window.GridWildPartyLive?.stopCoverPolling?.();
        root.remove();
        };
    });

    root.addEventListener("click", e => {
      if (e.target === root) {
        window.GridWildPartyLive?.stopCoverPolling?.();
        root.remove();
        }
    });

    root.querySelector("#gwPartyJoinCoverBtn")?.addEventListener("click", () => {
    window.GridWildPartyLive?.stopCoverPolling?.();
    joinParty(id);
    root.remove();
    });

    root.querySelector("#gwPartyLeaveCoverBtn")?.addEventListener("click", () => {
    window.GridWildPartyLive?.stopCoverPolling?.();
    leaveParty(id);
    root.remove();
    });

    root.querySelector("#gwPartySetActiveBtn")?.addEventListener("click", () => {
    window.GridWildPartyLive?.stopCoverPolling?.();
    setActivePartyId(id);
    toast("🟢 Party active");
    root.remove();
    });

  }

  function handlePartyReportFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("party_report");

  if (!encoded || window.__gwHandledPartyReportUrl) return;
  window.__gwHandledPartyReportUrl = true;

  try {
    const report = decodePartyReport(encoded);
    openStaticPartyReport(report);
  } catch (err) {
    console.warn("Could not decode party report:", err);
    alert("Could not open this GridWild party report.");
  }
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
          <div class="gw-party-cover-kicker">Static GridWild Report</div>
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
                ${evidence.map(e => `
                  <div class="gw-rowline">
                    <span>${esc(e.taxon || "Observation")}</span>
                    <span class="gw-muted">${esc(e.cellKey || "no cell")}</span>
                  </div>
                `).join("")}
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

  root.querySelectorAll("[data-party-close]").forEach(btn => {
    btn.onclick = () => root.remove();
  });

  setTimeout(() => drawStaticPartyReportMap(report), 50);
}

function drawStaticPartyReportMap(report) {
  const host = document.getElementById("gwStaticPartyReportMap");
  if (!host) return;

  const route = report.route || [];
  const evidence = report.evidence || [];

  const pts = [
    ...route.map(p => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      kind: "route"
    })),
    ...evidence
      .filter(e => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)))
      .map(e => ({
        lat: Number(e.lat),
        lng: Number(e.lng),
        kind: "obs",
        taxon: e.taxon || "Observation"
      }))
  ].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (!pts.length) {
    host.innerHTML = `<div class="gw-muted">No mappable points included.</div>`;
    return;
  }

  const minLat = Math.min(...pts.map(p => p.lat));
  const maxLat = Math.max(...pts.map(p => p.lat));
  const minLng = Math.min(...pts.map(p => p.lng));
  const maxLng = Math.max(...pts.map(p => p.lng));

  const padLat = Math.max(0.00008, (maxLat - minLat) * 0.16);
  const padLng = Math.max(0.00008, (maxLng - minLng) * 0.16);

  const width = 520;
  const height = 260;

  const xOf = lng =>
    ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * width;

  const yOf = lat =>
    height - (((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * height);

  const routePath = route
    .filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
    .map((p, i) =>
      `${i === 0 ? "M" : "L"} ${xOf(Number(p.lng)).toFixed(1)} ${yOf(Number(p.lat)).toFixed(1)}`
    )
    .join(" ");

  const obsDots = evidence
    .filter(e => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)))
    .map(e => `
      <circle
        cx="${xOf(Number(e.lng)).toFixed(1)}"
        cy="${yOf(Number(e.lat)).toFixed(1)}"
        r="5"
        class="gw-party-recap-obs-dot"
      >
        <title>${esc(e.taxon || "Observation")}</title>
      </circle>
    `).join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="gw-party-recap-svg" role="img" aria-label="Static party route map">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" class="gw-party-recap-map-bg"></rect>

      ${routePath ? `<path d="${routePath}" class="gw-party-recap-route"></path>` : ""}

      ${route.length ? `
        <circle cx="${xOf(Number(route[0].lng)).toFixed(1)}" cy="${yOf(Number(route[0].lat)).toFixed(1)}" r="6" class="gw-party-recap-start"></circle>
        <circle cx="${xOf(Number(route[route.length - 1].lng)).toFixed(1)}" cy="${yOf(Number(route[route.length - 1].lat)).toFixed(1)}" r="6" class="gw-party-recap-end"></circle>
      ` : ""}

      ${obsDots}
    </svg>
  `;
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
    }

    return partyLayer;
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

  marker.on("click", () => openPartyCover(p.id));
  marker.addTo(layer);
}

function addNearbyPublicPartyMarkers(layer) {
  getAllParties()
    .filter(isPublicPartyVisibleOnMap)
    .forEach(p => addPublicPartyMarker(layer, p));
}

  function refreshMapBeacon() {
  const layer = ensurePartyLayer();
  if (!layer) return;

  layer.clearLayers();

  const activeId = getActivePartyId();
 addNearbyPublicPartyMarkers(layer);
 const p = activeId ? getParty(activeId) : null;
  if (!p) return;

  const route = loadPartyRoutes()[p.id] || [];
  const routeLatLngs = route
    .filter(pt => Number.isFinite(Number(pt.lat)) && Number.isFinite(Number(pt.lng)))
    .map(pt => [Number(pt.lat), Number(pt.lng)]);

  // ---------------------------------------------------------------------------
  // Live route line
  // ---------------------------------------------------------------------------
  if (routeLatLngs.length >= 2) {
    L.polyline(routeLatLngs, {
      pane: PANE,
      color: "#f0d18a",
      weight: 5,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round",
      interactive: false
    }).addTo(layer);

    L.polyline(routeLatLngs, {
      pane: PANE,
      color: "#1a1209",
      weight: 9,
      opacity: 0.35,
      lineCap: "round",
      lineJoin: "round",
      interactive: false
    }).addTo(layer);
  }

  // ---------------------------------------------------------------------------
  // Start / latest route points
  // ---------------------------------------------------------------------------
  if (routeLatLngs.length) {
    L.circleMarker(routeLatLngs[0], {
      pane: PANE,
      radius: 6,
      color: "#14110f",
      weight: 2,
      fillColor: "#9ee6bd",
      fillOpacity: 0.95,
      interactive: false
    }).addTo(layer);

    L.circleMarker(routeLatLngs[routeLatLngs.length - 1], {
      pane: PANE,
      radius: 7,
      color: "#14110f",
      weight: 2,
      fillColor: "#ffe082",
      fillOpacity: 0.95,
      interactive: false
    }).addTo(layer);
  }

  // ---------------------------------------------------------------------------
  // Counted observation dots
  // ---------------------------------------------------------------------------
  const evidence = getPartyEvidenceRows(p.id);

  evidence.forEach(e => {
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

    dot.addTo(layer);
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

  if (!beaconLatLng) return;

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
  marker.addTo(layer);
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

function renderActivePartyHud() {
  injectStyles();

  const existing = document.getElementById("gwActivePartyHud");
  const party = getActiveParty();

  if (!party) {
    existing?.remove();
    return;
  }

  const route = loadPartyRoutes()[party.id] || [];
  const evidenceCount = Math.max(
  Number(party.progress || 0),
  getSharedPartyProgress(party.id)
    );
  const target = Math.max(1, Number(party.target || 1));
  const pct = Math.max(0, Math.min(100, evidenceCount / target * 100));

  let hud = existing;
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "gwActivePartyHud";
    hud.className = "gw-active-party-hud";
    document.body.appendChild(hud);
  }

  hud.innerHTML = `
    <button class="gw-active-party-main" id="gwActivePartyOpenBtn" type="button">
      <div class="gw-active-party-topline">
        <span class="gw-active-party-dot">🎉</span>
        <span class="gw-active-party-title">${esc(party.title || "Active Party")}</span>
      </div>

      <div class="gw-active-party-sub">
        ${evidenceCount}/${target} counted · ${getPartyDurationLabel(party)} · ${formatDistance(getRouteDistanceMeters(route))}
      </div>

      <div class="gw-active-party-bar">
        <div style="width:${pct}%"></div>
      </div>
    </button>

    <div class="gw-active-party-actions">
      <button class="gw-active-party-btn" id="gwActivePartyRecapBtn" type="button">Recap</button>
      <button class="gw-active-party-btn danger" id="gwActivePartyEndBtn" type="button">End</button>
    </div>
  `;

  hud.querySelector("#gwActivePartyOpenBtn")?.addEventListener("click", () => {
    openPartyCover(party.id);
  });

  hud.querySelector("#gwActivePartyRecapBtn")?.addEventListener("click", () => {
    openPartyRecap(party.id);
  });

  hud.querySelector("#gwActivePartyEndBtn")?.addEventListener("click", () => {
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
    margin-top: 12px;
    min-height: 240px;
    border-radius: 18px;
    border: 1px solid rgba(215,183,116,0.16);
    background:
        radial-gradient(circle at 20% 20%, rgba(240,209,138,0.10), transparent 35%),
        rgba(0,0,0,0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    }

    .gw-party-recap-svg {
    width: 100%;
    height: 260px;
    display: block;
    }

    .gw-party-recap-map-bg {
    fill: rgba(20,17,15,0.56);
    stroke: rgba(215,183,116,0.18);
    }

    .gw-party-recap-route {
    fill: none;
    stroke: rgba(240,209,138,0.92);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px rgba(240,209,138,0.22));
    }

    .gw-party-recap-start {
    fill: #9ee6bd;
    stroke: rgba(20,17,15,0.95);
    stroke-width: 2;
    }

    .gw-party-recap-end {
    fill: #ffe082;
    stroke: rgba(20,17,15,0.95);
    stroke-width: 2;
    }

    .gw-party-recap-obs-dot {
    fill: #f4e8cf;
    stroke: rgba(20,17,15,0.96);
    stroke-width: 2;
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

    .gw-active-party-sub {
    margin-top: 3px;
    font-size: 11px;
    color: rgba(239,230,211,0.68);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-radius: 14px;
  border: 1px solid rgba(215,183,116,0.14);
  background: rgba(255,255,255,0.045);
  text-align: left;
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

  window.addEventListener("load", () => {
    setTimeout(() => {
      refreshMapBeacon();
      handleJoinFromUrl();
      handlePartyReportFromUrl();
    }, 500);
  });

    window.addEventListener("gwPartiesChanged", scheduleActivePartyHudRender);
    window.addEventListener("gwPartyEvidenceChanged", scheduleActivePartyHudRender);
    window.addEventListener("gwActivePartyChanged", scheduleActivePartyHudRender);

    window.addEventListener("load", () => {
    setTimeout(scheduleActivePartyHudRender, 700);
    });


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
        s.status === "counted" ? "counted" :
        s.status === "will_count" ? "will-count" :
        "blocked";

    const icon =
        s.status === "counted" ? "✅" :
        s.status === "will_count" ? "🎉" :
        "⚠️";

    return `
        <div class="gw-obs-party-chip ${cls}">
        <div class="gw-obs-party-chip-title">${icon} ${esc(s.label)}</div>
        <div class="gw-obs-party-chip-sub">${esc(s.reason)}</div>
        </div>
    `;
    }
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

    // evidence for draft observations...
    getDraftPartyMatchStatus,
    renderDraftPartyChipHtml,

    // for updating evidence of party goal
    getExcludedPartyEvidenceRows,
    setPartyEvidenceStatus,
    excludePartyEvidence,
    reincludePartyEvidence,

    //  makes recap Share button generate clickable static report link
    partyReportUrl,
    makePartyReportPayload,
    encodePartyReport,
    decodePartyReport,
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
