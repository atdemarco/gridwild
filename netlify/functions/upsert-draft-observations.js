const { createClient } = require("@supabase/supabase-js");
const { requireAccountSession } = require("./_gridwild-account-session");
const {
  MAX_DRAFTS_PER_SYNC,
  TABLE,
  cleanDraftMirror,
  isMissingOptionalTable,
  rowToClientDraft
} = require("./_draft-observation-mirror");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    const incoming = Array.isArray(body.drafts) ? body.drafts : [];
    const rows = incoming
      .slice(0, MAX_DRAFTS_PER_SYNC)
      .map((draft) => cleanDraftMirror(draft, playerId))
      .filter(Boolean);

    if (!rows.length) {
      return { statusCode: 200, body: JSON.stringify({ drafts: [] }) };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: "player_id,client_draft_id" })
      .select("*");

    if (error) {
      if (isMissingOptionalTable(error)) {
        return {
          statusCode: 200,
          body: JSON.stringify({ drafts: [], unavailable: true })
        };
      }
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ drafts: (data || []).map(rowToClientDraft) })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
