const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest, httpError } = require("./_gridwild-player-session");
const { requirePartyAccess } = require("./_party-access");
const {
  observationCoordinates,
  observationDate,
  observationLocalHour,
  taxonomyText
} = require("./_inat-authority");
const { targetCellKeyForCoordinates } = require("./_quest-authority");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const INAT_OBSERVATIONS_URL = "https://api.inaturalist.org/v1/observations";
const INAT_PER_PAGE = 100;
const INAT_MAX_LINKED_MEMBERS = 8;
const INAT_MAX_PAGES_PER_MEMBER = 2;
const INAT_MAX_REQUESTS_PER_SYNC = 10;
const INAT_REQUEST_DELAY_MS = 450;
const INAT_REQUEST_TIMEOUT_MS = 8000;
const PARTY_TIME_PAD_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function shiftedDay(ms, days) {
  return isoDay(ms + days * 24 * 60 * 60 * 1000);
}

function safeDateMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function partyTimeWindow(party = {}) {
  const startMs = safeDateMs(party.starts_at) || safeDateMs(party.created_at) || Date.now();
  const endedMs = safeDateMs(party.ended_at);
  const durationMs = Number(party.duration_minutes || 0) * 60 * 1000;
  const plannedEndMs = Number.isFinite(durationMs) && durationMs > 0 ? startMs + durationMs : null;
  const endMs = endedMs || Math.min(Date.now(), plannedEndMs || Date.now());

  return {
    startMs,
    endMs: Math.max(startMs, endMs)
  };
}

function observationHasOpenCoordinates(observation) {
  const geoprivacy = observation?.geoprivacy || "open";
  const taxonGeoprivacy = observation?.taxon_geoprivacy || "open";
  return observation?.obscured !== true && geoprivacy === "open" && taxonGeoprivacy === "open";
}

function exactObservedMs(observation) {
  const raw = observation?.time_observed_at || "";
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function observationInPartyWindow(observation, timeWindow) {
  const observedMs = exactObservedMs(observation);
  if (!Number.isFinite(observedMs)) return false;
  return (
    observedMs >= timeWindow.startMs - PARTY_TIME_PAD_MS &&
    observedMs <= timeWindow.endMs + PARTY_TIME_PAD_MS
  );
}

function observationDisplayTaxon(observation) {
  return (
    observation?.taxon?.preferred_common_name ||
    observation?.species_guess ||
    observation?.taxon?.name ||
    observation?.taxon?.iconic_taxon_name ||
    "iNaturalist observation"
  );
}

function verifiedObservationRow(playerId, link, observation, now) {
  const coordinates = observationCoordinates(observation);
  const observedAt = observationDate(observation);

  return {
    player_id: playerId,
    obs_id: String(observation.id),
    inat_user_id: Number(link.inat_user_id),
    observed_at: observedAt?.toISOString() || null,
    observed_local_hour: observationLocalHour(observation),
    iconic_taxon: observation?.taxon?.iconic_taxon_name || null,
    taxon_name: observation?.taxon?.name || null,
    common_name: observation?.taxon?.preferred_common_name || observation?.species_guess || null,
    taxonomy_text: taxonomyText(observation),
    quality_grade: observation?.quality_grade || null,
    latitude: coordinates?.lat ?? null,
    longitude: coordinates?.lng ?? null,
    positional_accuracy: Number.isFinite(Number(observation?.positional_accuracy))
      ? Number(observation.positional_accuracy)
      : null,
    photo_count: Array.isArray(observation?.photos) ? observation.photos.length : 0,
    verified_at: now,
    updated_at: now
  };
}

function partyEvidenceRow(partyId, playerId, observation) {
  const coordinates = observationCoordinates(observation);
  const cellKey = coordinates ? targetCellKeyForCoordinates(coordinates) : null;

  return {
    party_id: partyId,
    player_id: playerId,
    draft_id: `inat:${observation.id}`,
    taxon: observationDisplayTaxon(observation),
    iconic_taxon: observation?.taxon?.iconic_taxon_name || null,
    cell_key: cellKey || null,
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null,
    status: "counted"
  };
}

function inatSearchUrl(link, timeWindow, page) {
  const url = new URL(INAT_OBSERVATIONS_URL);
  url.searchParams.set("user_login", String(link.inat_login || "").trim());
  url.searchParams.set("d1", shiftedDay(timeWindow.startMs, -1));
  url.searchParams.set("d2", shiftedDay(timeWindow.endMs, 1));
  url.searchParams.set("order_by", "observed_on");
  url.searchParams.set("order", "desc");
  url.searchParams.set("geo", "true");
  url.searchParams.set("geoprivacy", "open");
  url.searchParams.set("taxon_geoprivacy", "open");
  url.searchParams.set("per_page", String(INAT_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url;
}

async function fetchINatPage(url) {
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), INAT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.error ||
        data?.errors?.[0]?.message ||
        `iNaturalist request failed with HTTP ${response.status}.`;
      throw httpError(response.status === 429 ? 429 : 502, message);
    }

    return data || {};
  } finally {
    clearTimeout(timer);
  }
}

async function loadPartySnapshot(partyId) {
  const [membersResult, eventsResult, evidenceResult] = await Promise.all([
    supabase
      .from("party_members")
      .select("*, players(id, display_name, archetype, icon, color, wildpoints)")
      .eq("party_id", partyId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("party_events")
      .select("*")
      .eq("party_id", partyId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("party_evidence")
      .select("*")
      .eq("party_id", partyId)
      .order("created_at", { ascending: false })
  ]);

  if (membersResult.error) throw membersResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (evidenceResult.error) throw evidenceResult.error;

  const evidence = evidenceResult.data || [];
  return {
    members: membersResult.data || [],
    events: eventsResult.data || [],
    evidence,
    progress: evidence.filter((row) => row.status !== "excluded").length
  };
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    await authorizePlayerRequest(supabase, event, { body });

    const { player_id, party_id } = body;
    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    const { party } = await requirePartyAccess(supabase, {
      partyId: party_id,
      playerId: player_id
    });
    const timeWindow = partyTimeWindow(party);

    if (
      timeWindow.endMs < timeWindow.startMs ||
      timeWindow.startMs > Date.now() + PARTY_TIME_PAD_MS
    ) {
      const snapshot = await loadPartySnapshot(party_id);
      return {
        statusCode: 200,
        body: JSON.stringify({
          party,
          ...snapshot,
          imported: 0,
          matched: 0,
          scanned: 0,
          duplicates: 0,
          linked_members: 0,
          unlinked_members: 0,
          skipped: { future_party: true },
          capped: false
        })
      };
    }

    const { data: members, error: membersError } = await supabase
      .from("party_members")
      .select("party_id, player_id, role")
      .eq("party_id", party_id)
      .order("joined_at", { ascending: true });

    if (membersError) throw membersError;

    const memberIds = [...new Set((members || []).map((row) => row.player_id).filter(Boolean))];
    let links = [];
    if (memberIds.length) {
      const { data, error } = await supabase
        .from("gridwild_player_inat_accounts")
        .select("player_id, inat_user_id, inat_login")
        .in("player_id", memberIds);

      if (error) throw error;
      links = data || [];
    }

    const linkByPlayerId = new Map(links.map((row) => [String(row.player_id), row]));
    const linkedMembers = (members || [])
      .map((member) => ({
        ...member,
        link: linkByPlayerId.get(String(member.player_id)) || null
      }))
      .filter((member) => member.link?.inat_login)
      .slice(0, INAT_MAX_LINKED_MEMBERS);

    const { data: existingEvidence, error: existingEvidenceError } = await supabase
      .from("party_evidence")
      .select("draft_id, status")
      .eq("party_id", party_id);

    if (existingEvidenceError) throw existingEvidenceError;

    const existingDraftIds = new Set(
      (existingEvidence || []).map((row) => String(row.draft_id || "")).filter(Boolean)
    );
    const seenDraftIds = new Set(existingDraftIds);

    const now = new Date().toISOString();
    const evidenceRows = [];
    const verifiedRows = [];
    const skipped = {
      hidden_coordinates: 0,
      outside_window: 0,
      missing_exact_time: 0,
      missing_coordinates: 0
    };
    let scanned = 0;
    let matched = 0;
    let duplicates = 0;
    let requests = 0;
    let capped = links.length > linkedMembers.length;

    outer: for (const member of linkedMembers) {
      for (let page = 1; page <= INAT_MAX_PAGES_PER_MEMBER; page++) {
        if (requests >= INAT_MAX_REQUESTS_PER_SYNC) {
          capped = true;
          break outer;
        }

        if (requests > 0) await sleep(INAT_REQUEST_DELAY_MS);
        requests++;

        const data = await fetchINatPage(inatSearchUrl(member.link, timeWindow, page));
        const results = Array.isArray(data?.results) ? data.results : [];
        scanned += results.length;

        for (const observation of results) {
          if (!observation?.id) continue;

          const coordinates = observationCoordinates(observation);
          if (!coordinates) {
            skipped.missing_coordinates++;
            continue;
          }

          if (!observationHasOpenCoordinates(observation)) {
            skipped.hidden_coordinates++;
            continue;
          }

          if (!exactObservedMs(observation)) {
            skipped.missing_exact_time++;
            continue;
          }

          if (!observationInPartyWindow(observation, timeWindow)) {
            skipped.outside_window++;
            continue;
          }

          matched++;

          const draftId = `inat:${observation.id}`;
          if (seenDraftIds.has(draftId)) {
            duplicates++;
            continue;
          }

          seenDraftIds.add(draftId);
          verifiedRows.push(
            verifiedObservationRow(member.player_id, member.link, observation, now)
          );
          evidenceRows.push(partyEvidenceRow(party_id, member.player_id, observation));
        }

        const totalResults = Number(data?.total_results);
        if (
          results.length < INAT_PER_PAGE ||
          (Number.isFinite(totalResults) && page * INAT_PER_PAGE >= totalResults)
        ) {
          break;
        }
      }
    }

    const warnings = [];
    if (verifiedRows.length) {
      const { error } = await supabase.from("gridwild_verified_observations").upsert(verifiedRows, {
        onConflict: "player_id,obs_id"
      });
      if (error) warnings.push(`Could not cache verified observations: ${error.message}`);
    }

    let importedRows = [];
    if (evidenceRows.length) {
      const { data, error } = await supabase
        .from("party_evidence")
        .upsert(evidenceRows, {
          onConflict: "party_id,draft_id",
          ignoreDuplicates: true
        })
        .select("*");

      if (error) throw error;
      importedRows = data || [];
    }

    if (importedRows.length) {
      const { error } = await supabase.from("party_events").insert({
        party_id,
        player_id,
        event_type: "inat_sync",
        payload: {
          imported: importedRows.length,
          matched,
          scanned,
          linked_members: linkedMembers.length,
          capped
        }
      });

      if (error) warnings.push(`Could not record party sync activity: ${error.message}`);
    }

    const snapshot = await loadPartySnapshot(party_id);
    return {
      statusCode: 200,
      body: JSON.stringify({
        party,
        ...snapshot,
        imported: importedRows.length,
        matched,
        scanned,
        duplicates,
        linked_members: linkedMembers.length,
        unlinked_members: Math.max(0, memberIds.length - links.length),
        skipped,
        capped,
        warnings
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
