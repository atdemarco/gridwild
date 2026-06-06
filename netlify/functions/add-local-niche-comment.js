const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMMENT_TYPES = new Set([
  "habitat_note",
  "access_note",
  "seasonal_note",
  "taxon_tip",
  "correction",
  "safety_note",
  "general_comment"
]);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, niche_id } = body;
    const commentText = String(body.comment_text || "").trim();
    const commentType = COMMENT_TYPES.has(body.comment_type)
      ? body.comment_type
      : "general_comment";

    if (!player_id) throw new Error("player_id is required");
    if (!niche_id) throw new Error("niche_id is required");
    if (!commentText) throw new Error("comment_text is required");

    const { data, error } = await supabase
      .from("local_niche_comments")
      .insert({
        niche_id,
        user_id: player_id,
        comment_text: commentText.slice(0, 1200),
        comment_type: commentType
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("local_niches").update({ status: "active" }).eq("id", niche_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ comment: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
