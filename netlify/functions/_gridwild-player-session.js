const crypto = require("crypto");
const { validateAccountSession } = require("./_gridwild-account-session");

const ACCOUNT_TABLE = "gridwild_accounts";
const GUEST_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function guestSessionSecret() {
  const secret =
    process.env.GRIDWILD_PLAYER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("GRIDWILD_PLAYER_SESSION_SECRET is not configured.");
  }

  return secret;
}

function signGuestPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", guestSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function encodeGuestToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `gwg.${encodedPayload}.${signGuestPayload(encodedPayload)}`;
}

function verifyGuestToken(token, playerId) {
  const [prefix, encodedPayload, signature] = String(token || "").split(".");
  if (prefix !== "gwg" || !encodedPayload || !signature) {
    throw httpError(401, "GridWild player session is invalid.");
  }

  const expectedSignature = signGuestPayload(encodedPayload);
  if (!timingSafeEqualText(signature, expectedSignature)) {
    throw httpError(401, "GridWild player session is invalid.");
  }

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw httpError(401, "GridWild player session is invalid.");
  }

  if (payload?.type !== "guest" || String(payload?.player_id || "") !== String(playerId)) {
    throw httpError(401, "GridWild player session is invalid.");
  }

  const expiresAtMs = Number(payload.exp);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw httpError(401, "GridWild player session expired.");
  }

  return payload;
}

function parseRequestBody(event) {
  try {
    return JSON.parse(event?.body || "{}");
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

async function requirePlayerSession(supabase, options = {}) {
  const playerId = options.playerId || options.player_id || null;
  const token = options.sessionToken || options.session_token || null;

  if (!playerId || !token) {
    throw httpError(401, "GridWild player session is required.");
  }

  const accountResult = await supabase
    .from(ACCOUNT_TABLE)
    .select("id, username, player_id, session_token_hash, session_expires_at")
    .eq("player_id", playerId)
    .maybeSingle();

  if (accountResult.error) throw accountResult.error;

  if (accountResult.data) {
    await validateAccountSession(supabase, {
      account: accountResult.data,
      token
    });

    return {
      type: "account",
      playerId,
      account: accountResult.data
    };
  }

  const guestSession = verifyGuestToken(token, playerId);

  return {
    type: "guest",
    playerId,
    session: guestSession
  };
}

async function authorizePlayerRequest(supabase, event, options = {}) {
  if (event?.httpMethod && event.httpMethod !== "POST") {
    throw httpError(405, "Method not allowed.");
  }

  const body = options.body || parseRequestBody(event);
  return requirePlayerSession(supabase, {
    playerId: options.playerId || body.player_id,
    sessionToken: options.sessionToken || body.session_token
  });
}

async function createGuestSession(_supabase, playerId) {
  if (!playerId) throw httpError(400, "player_id is required");

  const now = Date.now();
  const expiresAtMs = now + GUEST_SESSION_TTL_MS;
  const token = encodeGuestToken({
    type: "guest",
    player_id: playerId,
    iat: now,
    exp: expiresAtMs,
    nonce: crypto.randomBytes(16).toString("base64url")
  });

  return {
    token,
    type: "guest",
    expires_at: new Date(expiresAtMs).toISOString()
  };
}

async function revokeGuestSessions(_supabase, _playerId) {
  // Once a player is linked to an account, requirePlayerSession sees the
  // account row first and no longer accepts that player's guest token.
}

module.exports = {
  authorizePlayerRequest,
  createGuestSession,
  httpError,
  parseRequestBody,
  requirePlayerSession,
  revokeGuestSessions
};
