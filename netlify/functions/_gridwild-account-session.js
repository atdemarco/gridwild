const crypto = require("crypto");

const ACCOUNT_TABLE = "gridwild_accounts";

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function requireAccountSession(supabase, options = {}) {
  const playerId = options.playerId || options.player_id || null;
  const token = options.sessionToken || options.session_token || null;

  if (!playerId || !token) {
    throw httpError(401, "GridWild account session is required.");
  }

  const { data: account, error } = await supabase
    .from(ACCOUNT_TABLE)
    .select("id, username, player_id, session_token_hash, session_expires_at")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw error;
  if (!account?.session_token_hash) {
    throw httpError(401, "GridWild account session is not active.");
  }

  const expiresAt = Date.parse(account.session_expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw httpError(401, "GridWild account session expired.");
  }

  if (!timingSafeEqualHex(hashToken(token), account.session_token_hash)) {
    throw httpError(401, "GridWild account session is invalid.");
  }

  return account;
}

function accountTableHint(err) {
  const message = err?.message || "";
  if (message.includes(ACCOUNT_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/gridwild_accounts.sql in Supabase first.`;
  }
  return message;
}

module.exports = {
  accountTableHint,
  requireAccountSession
};
