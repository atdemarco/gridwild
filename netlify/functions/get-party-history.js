const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { applyPartyTimingToRows } = require("./_party-duration");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

function routeDistanceMeters(points) {
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1], points[i]);
    if (Number.isFinite(d) && d < 500) total += d;
  }

  return Math.round(total);
}

function getQuestIdFromEvents(events) {
  const linked = (events || []).find((event) => event?.payload?.quest_id);
  return linked?.payload?.quest_id || null;
}

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, limit = 25 } = body;

    if (!player_id) throw new Error("player_id is required");

    const { data: myMemberships, error: memberError } = await supabase
      .from("party_members")
      .select("party_id, role, joined_at")
      .eq("player_id", player_id)
      .order("joined_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, Number(limit) || 25)));

    if (memberError) throw memberError;

    const partyIds = [...new Set((myMemberships || []).map((row) => row.party_id).filter(Boolean))];

    if (!partyIds.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ parties: [] })
      };
    }

    const { data: parties, error: partiesError } = await supabase
      .from("parties")
      .select("*")
      .in("id", partyIds);

    if (partiesError) throw partiesError;

    const timedParties = await applyPartyTimingToRows(supabase, parties || [], {
      playerId: player_id
    });
    const historyParties = timedParties
      .filter((p) => p?.status === "ended" || p?.ended_at)
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));

    if (!historyParties.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ parties: [] })
      };
    }

    const historyIds = historyParties.map((p) => p.id);

    const [evidenceResult, memberCountResult, routeResult, eventResult] = await Promise.all([
      supabase.from("party_evidence").select("party_id, status").in("party_id", historyIds),
      supabase.from("party_members").select("party_id").in("party_id", historyIds),
      supabase
        .from("party_route_points")
        .select("party_id, lat, lng, created_at")
        .in("party_id", historyIds)
        .order("created_at", { ascending: true })
        .limit(5000),
      supabase
        .from("party_events")
        .select("party_id, payload, created_at")
        .in("party_id", historyIds)
        .order("created_at", { ascending: true })
    ]);

    if (evidenceResult.error) throw evidenceResult.error;
    if (memberCountResult.error) throw memberCountResult.error;
    if (routeResult.error) throw routeResult.error;
    if (eventResult.error) throw eventResult.error;

    const statsByParty = new Map(
      historyIds.map((id) => [
        id,
        {
          progress: 0,
          excluded: 0,
          memberCount: 0,
          route: [],
          events: []
        }
      ])
    );

    for (const row of evidenceResult.data || []) {
      const stats = statsByParty.get(row.party_id);
      if (!stats) continue;
      if (row.status === "excluded") stats.excluded += 1;
      else stats.progress += 1;
    }

    for (const row of memberCountResult.data || []) {
      const stats = statsByParty.get(row.party_id);
      if (stats) stats.memberCount += 1;
    }

    for (const row of routeResult.data || []) {
      const stats = statsByParty.get(row.party_id);
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!stats || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stats.route.push({ lat, lng });
    }

    for (const row of eventResult.data || []) {
      const stats = statsByParty.get(row.party_id);
      if (stats) stats.events.push(row);
    }

    const membershipByParty = new Map((myMemberships || []).map((row) => [row.party_id, row]));

    const rows = historyParties
      .map((party) => {
        const stats = statsByParty.get(party.id) || {};
        const membership = membershipByParty.get(party.id) || {};

        return {
          ...party,
          member_count: Number(stats.memberCount || 0),
          progress: Number(stats.progress || 0),
          excluded_count: Number(stats.excluded || 0),
          route_distance_meters: routeDistanceMeters(stats.route || []),
          linked_quest_id: getQuestIdFromEvents(stats.events || []),
          my_role: membership.role || null,
          my_joined_at: membership.joined_at || null
        };
      })
      .sort(
        (a, b) =>
          new Date(b.ended_at || b.created_at || 0) - new Date(a.ended_at || a.created_at || 0)
      );

    return {
      statusCode: 200,
      body: JSON.stringify({ parties: rows })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
