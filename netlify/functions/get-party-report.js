const { createClient } = require("@supabase/supabase-js");
const { applyPartyTiming } = require("./_party-duration");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

function parseTimeMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function formatPartySpan(ms) {
  const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function partyDurationLabel(party) {
  const startMs = parseTimeMs(party?.starts_at || party?.created_at);
  const endMs =
    parseTimeMs(party?.ended_at) ||
    (Number.isFinite(startMs) && Number(party?.duration_minutes) > 0
      ? startMs + Number(party.duration_minutes) * 60000
      : null);

  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    return formatPartySpan(Math.max(0, endMs - startMs));
  }

  const duration = Number(party?.duration_minutes);
  return Number.isFinite(duration) && duration > 0 ? `${duration} min` : "field session";
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

function routeDistanceMeters(points = []) {
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1], points[i]);
    if (Number.isFinite(d) && d < 500) total += d;
  }

  return Math.round(total);
}

function cleanTaxon(value) {
  const label = String(value || "").trim();
  if (!label) return "";
  if (/^(unknown|unknown taxon|unknown organism|unknown observation)$/i.test(label)) return "";
  return label;
}

function evidenceTaxon(row = {}) {
  const taxon = cleanTaxon(row.taxon);
  if (taxon && !/^observation$/i.test(taxon)) return taxon;

  const iconic = cleanTaxon(row.iconic_taxon);
  if (iconic) return `${iconic} observation`;

  return taxon ? "Party observation" : "Observation needing ID";
}

function evidenceRow(row = {}) {
  return {
    partyId: row.party_id || null,
    draftId: row.draft_id || null,
    taxon: evidenceTaxon(row),
    rawTaxon: row.taxon || null,
    iconicTaxon: row.iconic_taxon || null,
    cellKey: row.cell_key || null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: row.created_at || null,
    status: row.status || "counted"
  };
}

function routeRow(row = {}) {
  return {
    party_id: row.party_id || null,
    player_id: row.player_id || null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracy_meters: row.accuracy_meters ?? null,
    created_at: row.created_at || null
  };
}

function linkedQuestId(events = []) {
  const event = events.find((row) => row?.payload?.quest_id);
  return event?.payload?.quest_id || null;
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      throw httpError(405, "Method not allowed.");
    }

    const { party_id } = parseBody(event);
    if (!party_id) throw httpError(400, "party_id is required");

    let { data: party, error: partyError } = await supabase
      .from("parties")
      .select("*")
      .eq("id", party_id)
      .maybeSingle();

    if (partyError) throw partyError;
    if (!party) throw httpError(404, "Party report not found.");

    const timing = await applyPartyTiming(supabase, party, { playerId: party.created_by || null });
    party = timing.party;

    if (party.visibility !== "public") {
      throw httpError(403, "This party report is private.");
    }

    if (party.status !== "ended" && !party.ended_at) {
      throw httpError(409, "Party recap is available after the party ends.");
    }

    const [membersResult, eventsResult, evidenceResult, routeResult] = await Promise.all([
      supabase
        .from("party_members")
        .select("party_id, player_id, role, joined_at, players(id, display_name)")
        .eq("party_id", party.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("party_events")
        .select("party_id, player_id, event_type, payload, created_at")
        .eq("party_id", party.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("party_evidence")
        .select("*")
        .eq("party_id", party.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("party_route_points")
        .select("*")
        .eq("party_id", party.id)
        .order("created_at", { ascending: true })
        .limit(5000)
    ]);

    if (membersResult.error) throw membersResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (evidenceResult.error) throw evidenceResult.error;
    if (routeResult.error) throw routeResult.error;

    const members = membersResult.data || [];
    const events = eventsResult.data || [];
    const route = (routeResult.data || [])
      .map(routeRow)
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
    const counted = (evidenceResult.data || [])
      .filter((row) => row.status !== "excluded")
      .map(evidenceRow);
    const excluded = (evidenceResult.data || [])
      .filter((row) => row.status === "excluded")
      .map(evidenceRow);
    const leader =
      members.find((row) => row.role === "leader") ||
      members.find((row) => String(row.player_id || "") === String(party.created_by || ""));

    const report = {
      kind: "gridwild_party_report",
      version: 2,
      exportedAt: new Date().toISOString(),
      party: {
        id: party.id,
        title: party.name || "Field Party",
        host: leader?.players?.display_name || "GridWild explorer",
        goalLabel: "Open field party",
        linkedQuestTitle: "",
        linkedQuestId: linkedQuestId(events),
        locationLabel: party.location_label || "field site",
        startsAt: party.starts_at || party.created_at || null,
        endedAt: party.ended_at || null,
        durationLabel: partyDurationLabel(party),
        routeDistanceMeters: routeDistanceMeters(route),
        countedCount: counted.length,
        excludedCount: excluded.length,
        memberCount: members.length
      },
      route,
      evidence: counted,
      excludedEvidence: excluded,
      members: members.map((row) => ({
        role: row.role || "member",
        joinedAt: row.joined_at || null,
        displayName: row.players?.display_name || "Explorer"
      }))
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300"
      },
      body: JSON.stringify({ report })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: err.message || "Could not load party report." })
    };
  }
};
