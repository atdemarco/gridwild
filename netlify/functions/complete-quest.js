const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");

    // ------------------------------------------------------------------
    // Prevent double rewards
    // ------------------------------------------------------------------
    const { data: existingPQ, error: existingPQError } = await supabase
    .from("player_quests")
    .select("*")
    .eq("player_id", player_id)
    .eq("quest_id", quest_id)
    .maybeSingle();

    if (existingPQError) throw existingPQError;

    if (existingPQ?.rewarded_at) {
    return {
        statusCode: 200,
        body: JSON.stringify({
        already_rewarded: true,
        player_quest: existingPQ,
        reward: 0
        })
    };
    }


    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("id, reward_wildpoints, quest_type, niche_id, recipe")
      .eq("id", quest_id)
      .single();

    if (questError) throw questError;

    const reward = quest.reward_wildpoints || 0;

    const { data: playerQuest, error: pqError } = await supabase
      .from("player_quests")
      .upsert(
        {
          player_id,
          quest_id,
          status: "completed",
          completed_at: new Date().toISOString(),
          rewarded_at: new Date().toISOString()

        },
        { onConflict: "player_id,quest_id" }
      )
      .select("*")
      .single();

    if (pqError) throw pqError;

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("wildpoints")
      .eq("id", player_id)
      .single();

    if (playerError) throw playerError;

    const newWildpoints = (player.wildpoints || 0) + reward;

    const { data: updatedPlayer, error: updateError } = await supabase
      .from("players")
      .update({ wildpoints: newWildpoints })
      .eq("id", player_id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    if (quest.quest_type === "sample_niche" && quest.niche_id) {
      const targetCount = Number(quest.recipe?.requiredObservationCount || quest.recipe?.quantity || 0);

      const { data: niche } = await supabase
        .from("local_niches")
        .select("id, quest_completion_count, observations_generated_count, metrics")
        .eq("id", quest.niche_id)
        .maybeSingle();

      if (niche) {
        const metrics = niche.metrics && typeof niche.metrics === "object"
          ? niche.metrics
          : {};

        await supabase
          .from("local_niches")
          .update({
            quest_completion_count: Number(niche.quest_completion_count || 0) + 1,
            observations_generated_count: Number(niche.observations_generated_count || 0) + targetCount,
            last_validated_at: new Date().toISOString(),
            status: "active",
            metrics: {
              ...metrics,
              last_completion_quest_id: quest.id,
              last_completion_player_id: player_id,
              last_productive: true
            }
          })
          .eq("id", quest.niche_id);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        player_quest: playerQuest,
        player: updatedPlayer,
        reward
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
