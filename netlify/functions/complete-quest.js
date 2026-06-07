const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requireStartedQuest } = require("./_quest-access");
const {
  targetSetProgressForEvidence,
  targetSetRequiresUniqueCellProgress
} = require("./_quest-authority");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");

    const { quest } = await requireStartedQuest(supabase, player_id, quest_id);

    if (targetSetRequiresUniqueCellProgress(quest)) {
      // Grid-fill target sets complete only after each marked cell has credited evidence.
      const { data: evidenceRows, error: evidenceError } = await supabase
        .from("quest_evidence")
        .select("status, payload")
        .eq("player_id", player_id)
        .eq("quest_id", quest_id)
        .in("status", ["claimed", "submitted", "verified", "counted"]);

      if (evidenceError) throw evidenceError;

      const progress = targetSetProgressForEvidence(quest, evidenceRows || []);
      if (progress.claimed < progress.target) {
        const remaining = Math.max(0, progress.target - progress.claimed);
        const label = remaining === 1 ? "target square" : "target squares";
        const err = new Error(`This quest needs ${remaining} more ${label}.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const { data, error } = await supabase.rpc("gridwild_complete_quest", {
      p_player_id: player_id,
      p_quest_id: quest_id
    });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
