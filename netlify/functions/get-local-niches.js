const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { clampNumber, haversineMeters, normalizeNicheRow } = require("./_local-niche-utils");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radiusM = clampNumber(body.radius_m, 25, 5000, 750);
    const limit = Math.round(clampNumber(body.limit, 1, 100, 30));
    const playerId = body.player_id || null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("lat and lng are required");
    }

    const latDelta = radiusM / 111320;
    const lngDelta = radiusM / Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180));

    const { data: rows, error } = await supabase
      .from("local_niches")
      .select("*")
      .in("status", ["active", "stale", "needs_review", "promoted"])
      .gte("centroid_lat", lat - latDelta)
      .lte("centroid_lat", lat + latDelta)
      .gte("centroid_lng", lng - lngDelta)
      .lte("centroid_lng", lng + lngDelta)
      .order("questability_score", { ascending: false })
      .limit(Math.max(limit * 3, limit));

    if (error) throw error;

    const ids = (rows || []).map((row) => row.id);
    let commentCounts = new Map();
    let homeUserCounts = new Map();
    let playerHomeNicheId = null;
    let stewardTableAvailable = true;

    if (playerId) {
      const { data: homeRow, error: homeError } = await supabase
        .from("local_niche_stewards")
        .select("niche_id")
        .eq("user_id", playerId)
        .maybeSingle();

      if (homeError) {
        if (homeError.code === "42P01") {
          stewardTableAvailable = false;
        } else {
          throw homeError;
        }
      } else {
        playerHomeNicheId = homeRow?.niche_id || null;
      }
    }

    if (ids.length) {
      const { data: comments, error: commentError } = await supabase
        .from("local_niche_comments")
        .select("niche_id")
        .in("niche_id", ids);

      if (commentError) throw commentError;

      commentCounts = new Map();
      for (const comment of comments || []) {
        commentCounts.set(comment.niche_id, (commentCounts.get(comment.niche_id) || 0) + 1);
      }

      if (stewardTableAvailable) {
        const { data: stewards, error: stewardError } = await supabase
          .from("local_niche_stewards")
          .select("niche_id, user_id")
          .in("niche_id", ids);

        if (stewardError) {
          if (stewardError.code !== "42P01") throw stewardError;
        } else {
          for (const steward of stewards || []) {
            homeUserCounts.set(steward.niche_id, (homeUserCounts.get(steward.niche_id) || 0) + 1);
          }
        }
      }
    }

    const origin = { lat, lng };
    const niches = (rows || [])
      .map((row) => ({
        ...normalizeNicheRow(row, origin, commentCounts.get(row.id) || 0),
        home_user_count: homeUserCounts.get(row.id) || 0,
        is_home_niche: Boolean(playerHomeNicheId && row.id === playerHomeNicheId)
      }))
      .filter((row) => haversineMeters(lat, lng, row.centroid_lat, row.centroid_lng) <= radiusM)
      .sort((a, b) => {
        const aScore = Number(a.questability_score || 0) * 1000 - Number(a.distance_m || 0);
        const bScore = Number(b.questability_score || 0) * 1000 - Number(b.distance_m || 0);
        return bScore - aScore;
      })
      .slice(0, limit);

    return {
      statusCode: 200,
      body: JSON.stringify({ niches, home_niche_id: playerHomeNicheId })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
