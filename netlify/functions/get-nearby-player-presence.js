const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const { interactionTableHint } = require("./_player-interactions");

const PRESENCE_TABLE = "player_presence";
const ONLINE_TIMEOUT_MS = 2 * 60 * 1000;
const OFFLINE_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_RADIUS_M = 5000;
const MAX_RADIUS_M = 50000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function tableHint(err) {
  const message = accountTableHint(err);
  if (message.includes("player_blocks")) {
    return interactionTableHint({ message });
  }
  if (message.includes(PRESENCE_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/player_presence.sql in Supabase first.`;
  }
  return message;
}

function clampRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_M;
  return Math.max(100, Math.min(MAX_RADIUS_M, n));
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat)) throw new Error("lat is required");
    if (!Number.isFinite(lng)) throw new Error("lng is required");

    const radiusM = clampRadius(body.radius_m);
    const latDelta = radiusM / 111320;
    const lngDelta = radiusM / Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180));
    const nowMs = Date.now();
    const onlineSince = new Date(nowMs - ONLINE_TIMEOUT_MS).toISOString();
    const offlineSince = new Date(nowMs - OFFLINE_GRACE_MS).toISOString();

    const presenceResult = await supabase
      .from(PRESENCE_TABLE)
      .select("*")
      .eq("visibility", "visible")
      .neq("player_id", playerId)
      .gte("lat", lat - latDelta)
      .lte("lat", lat + latDelta)
      .gte("lng", lng - lngDelta)
      .lte("lng", lng + lngDelta)
      .or(`last_seen_at.gte.${onlineSince},last_logout_at.gte.${offlineSince}`)
      .limit(80);

    if (presenceResult.error) throw presenceResult.error;

    let rows = (presenceResult.data || [])
      .filter((row) => {
        const rowLat = Number(row.lat);
        const rowLng = Number(row.lng);
        if (!Number.isFinite(rowLat) || !Number.isFinite(rowLng)) return false;

        const lastSeenMs = Date.parse(row.last_seen_at || "");
        const lastLogoutMs = Date.parse(row.last_logout_at || "");
        const isOnline =
          row.status === "online" &&
          Number.isFinite(lastSeenMs) &&
          nowMs - lastSeenMs <= ONLINE_TIMEOUT_MS;
        const isOffline =
          row.status === "offline" &&
          Number.isFinite(lastLogoutMs) &&
          nowMs - lastLogoutMs <= OFFLINE_GRACE_MS;

        return (isOnline || isOffline) && haversineMeters(lat, lng, rowLat, rowLng) <= radiusM;
      })
      .slice(0, 50);

    const candidatePlayerIds = rows.map((row) => row.player_id);
    if (candidatePlayerIds.length) {
      const blockIds = [playerId, ...candidatePlayerIds].map((id) => String(id));
      const blocksResult = await supabase
        .from("player_blocks")
        .select("blocker_player_id, blocked_player_id")
        .in("blocker_player_id", blockIds)
        .in("blocked_player_id", blockIds);

      if (blocksResult.error) throw blocksResult.error;

      const blockedPresenceIds = new Set();
      (blocksResult.data || []).forEach((row) => {
        const blocker = String(row.blocker_player_id || "");
        const blocked = String(row.blocked_player_id || "");
        if (blocker === String(playerId)) blockedPresenceIds.add(blocked);
        if (blocked === String(playerId)) blockedPresenceIds.add(blocker);
      });

      rows = rows.filter((row) => !blockedPresenceIds.has(String(row.player_id)));
    }

    const playerIds = rows.map((row) => row.player_id);
    let playersById = new Map();
    let equipmentByPlayerId = new Map();
    let activePartyByPlayerId = new Map();

    if (playerIds.length) {
      const playersResult = await supabase
        .from("players")
        .select("id, display_name, archetype, icon, color, wildpoints")
        .in("id", playerIds);

      if (playersResult.error) throw playersResult.error;
      playersById = new Map((playersResult.data || []).map((player) => [player.id, player]));

      const equipmentResult = await supabase
        .from("player_equipment")
        .select("*")
        .in("player_id", playerIds);

      if (equipmentResult.error) throw equipmentResult.error;
      equipmentByPlayerId = new Map(
        (equipmentResult.data || []).map((row) => [row.player_id, row])
      );

      const stateResult = await supabase
        .from("player_state")
        .select("player_id, active_party_id")
        .in("player_id", playerIds);

      if (stateResult.error) throw stateResult.error;

      const stateRows = (stateResult.data || []).filter((row) => row.active_party_id);
      const partyIds = [...new Set(stateRows.map((row) => row.active_party_id).filter(Boolean))];

      if (partyIds.length) {
        const partiesResult = await supabase
          .from("parties")
          .select("id, name, visibility, status, created_by")
          .in("id", partyIds);

        if (partiesResult.error) throw partiesResult.error;

        const partiesById = new Map((partiesResult.data || []).map((party) => [party.id, party]));
        stateRows.forEach((row) => {
          const party = partiesById.get(row.active_party_id) || null;
          if (party && party.status !== "ended") {
            activePartyByPlayerId.set(row.player_id, party);
          }
        });
      }
    }

    const presences = rows.map((row) => {
      const player = playersById.get(row.player_id) || {};
      const equipment = equipmentByPlayerId.get(row.player_id) || null;

      return {
        player_id: row.player_id,
        lat: row.lat,
        lng: row.lng,
        accuracy_meters: row.accuracy_meters,
        heading: row.heading,
        visibility: row.visibility,
        status: row.status === "offline" ? "offline" : "online",
        last_seen_at: row.last_seen_at,
        last_logout_at: row.last_logout_at,
        player,
        equipment,
        active_party: activePartyByPlayerId.get(row.player_id) || null
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ presences })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
