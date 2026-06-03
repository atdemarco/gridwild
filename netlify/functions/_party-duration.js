function parseTimeMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function partyStartMs(party) {
  return parseTimeMs(party?.starts_at) ?? parseTimeMs(party?.created_at);
}

function partyEndMs(party) {
  const startMs = partyStartMs(party);
  const durationMinutes = Number(party?.duration_minutes);

  if (!Number.isFinite(startMs)) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  return startMs + durationMinutes * 60 * 1000;
}

function shouldAutoStartParty(party, nowMs = Date.now()) {
  if (!party || party.status !== "scheduled") return false;

  const startMs = partyStartMs(party);
  const endMs = partyEndMs(party);

  if (!Number.isFinite(startMs)) return false;
  if (Number.isFinite(endMs) && nowMs >= endMs) return false;

  return nowMs >= startMs;
}

function shouldAutoEndParty(party, nowMs = Date.now()) {
  if (!party || party.status === "ended") return false;

  const endMs = partyEndMs(party);
  if (!Number.isFinite(endMs)) return false;

  return nowMs >= endMs;
}

async function insertPartyEvent(supabase, event) {
  const { error } = await supabase.from("party_events").insert(event);

  if (error) {
    console.warn("Could not write party timing event:", error.message);
  }
}

async function applyPartyTiming(supabase, party, options = {}) {
  if (!party?.id || party.status === "ended") {
    return { party, changed: false, ended: party?.status === "ended", started: false };
  }

  const nowMs = Number(options.nowMs || Date.now());

  if (shouldAutoEndParty(party, nowMs)) {
    const endedAtMs = partyEndMs(party) || nowMs;
    const endedAt = new Date(endedAtMs).toISOString();

    const { data, error } = await supabase
      .from("parties")
      .update({
        status: "ended",
        ended_at: endedAt
      })
      .eq("id", party.id)
      .neq("status", "ended")
      .select("*")
      .maybeSingle();

    if (error) throw error;

    const endedParty = data || {
      ...party,
      status: "ended",
      ended_at: party.ended_at || endedAt
    };

    if (data) {
      await insertPartyEvent(supabase, {
        party_id: party.id,
        player_id: options.playerId || null,
        event_type: "party_auto_ended",
        payload: {
          duration_minutes: Number(party.duration_minutes || 0),
          ended_at: endedAt
        }
      });
    }

    return { party: endedParty, changed: Boolean(data), ended: true, started: false };
  }

  if (shouldAutoStartParty(party, nowMs)) {
    const { data, error } = await supabase
      .from("parties")
      .update({ status: "active" })
      .eq("id", party.id)
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      await insertPartyEvent(supabase, {
        party_id: party.id,
        player_id: options.playerId || null,
        event_type: "party_auto_started",
        payload: { starts_at: party.starts_at || null }
      });

      return { party: data, changed: true, ended: false, started: true };
    }
  }

  return { party, changed: false, ended: false, started: false };
}

async function applyPartyTimingToRows(supabase, parties, options = {}) {
  const rows = [];

  for (const party of parties || []) {
    const result = await applyPartyTiming(supabase, party, options);
    rows.push(result.party);
  }

  return rows;
}

module.exports = {
  applyPartyTiming,
  applyPartyTimingToRows,
  partyEndMs,
  shouldAutoEndParty
};
