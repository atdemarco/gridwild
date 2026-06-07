const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { storeAccountSession } = require("./_gridwild-account-session");
const { requirePlayerSession, revokeGuestSessions } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ACCOUNT_TABLE = "gridwild_accounts";
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(String(password || ""), salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionForAccount() {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt
  };
}

function accountTableHint(err) {
  const message = err?.message || "";
  if (message.includes(ACCOUNT_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/gridwild_accounts.sql in Supabase first.`;
  }
  return message;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const displayName = String(body.display_name || username || "New Explorer").trim();
    const existingPlayerId = body.existing_player_id || null;

    if (!/^[a-z0-9_][a-z0-9_-]{2,23}$/.test(username)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Choose a username 3-24 characters long using letters, numbers, underscores, or hyphens."
        })
      };
    }

    if (password.length < 8) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Use a password with at least 8 characters." })
      };
    }

    const existing = await supabase
      .from(ACCOUNT_TABLE)
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing.error) throw existing.error;

    if (existing.data) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "That username is already taken." })
      };
    }

    if (existingPlayerId) {
      await requirePlayerSession(supabase, {
        playerId: existingPlayerId,
        sessionToken: body.existing_player_session_token
      });

      const linked = await supabase
        .from(ACCOUNT_TABLE)
        .select("username")
        .eq("player_id", existingPlayerId)
        .maybeSingle();

      if (linked.error) throw linked.error;

      if (linked.data) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: "This explorer is already attached to a GridWild account."
          })
        };
      }
    }

    let player = null;

    if (existingPlayerId) {
      const playerResult = await supabase
        .from("players")
        .select("*")
        .eq("id", existingPlayerId)
        .maybeSingle();

      if (playerResult.error) throw playerResult.error;
      player = playerResult.data;
    }

    if (!player) {
      const playerResult = await supabase
        .from("players")
        .insert({ display_name: displayName || username })
        .select("*")
        .single();

      if (playerResult.error) throw playerResult.error;
      player = playerResult.data;
    } else if (displayName && displayName !== player.display_name) {
      const playerResult = await supabase
        .from("players")
        .update({ display_name: displayName })
        .eq("id", player.id)
        .select("*")
        .single();

      if (playerResult.error) throw playerResult.error;
      player = playerResult.data;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const session = sessionForAccount();

    const accountResult = await supabase
      .from(ACCOUNT_TABLE)
      .insert({
        username,
        player_id: player.id,
        password_hash: hashPassword(password, salt),
        password_salt: salt,
        password_iterations: ITERATIONS,
        session_token_hash: session.tokenHash,
        session_expires_at: session.expiresAt
      })
      .select("id, username, player_id, created_at")
      .single();

    if (accountResult.error) throw accountResult.error;
    await storeAccountSession(supabase, {
      accountId: accountResult.data.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    });
    await revokeGuestSessions(supabase, player.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        account: accountResult.data,
        player,
        session: {
          token: session.token,
          expires_at: session.expiresAt
        }
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: accountTableHint(err) })
    };
  }
};
