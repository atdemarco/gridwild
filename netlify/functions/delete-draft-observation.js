const { createClient } = require("@supabase/supabase-js");
const { requireAccountSession } = require("./_gridwild-account-session");
const { TABLE, isMissingOptionalTable } = require("./_draft-observation-mirror");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const draftId = String(body.draft_id || body.client_draft_id || "").trim();

    if (!draftId) throw new Error("draft_id is required.");

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("player_id", playerId)
      .eq("client_draft_id", draftId);

    if (error) {
      if (isMissingOptionalTable(error)) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: true, unavailable: true })
        };
      }
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
