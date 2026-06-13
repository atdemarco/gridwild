const { createClient } = require("@supabase/supabase-js");
const { requireAccountSession } = require("./_gridwild-account-session");
const { TABLE, isMissingOptionalTable, rowToClientDraft } = require("./_draft-observation-mirror");

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

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("player_id", playerId)
      .order("client_updated_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(200);

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
