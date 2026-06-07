const crypto = require("crypto");

const ACCOUNT_TABLE = "gridwild_accounts";
const ACCOUNT_SESSION_TABLE = "gridwild_account_sessions";

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

function isAccountSessionTableMissing(err) {
  const message = String(err?.message || "");
  return message.includes(ACCOUNT_SESSION_TABLE) || message.includes("schema cache");
}

function isDuplicateSession(err) {
  return err?.code === "23505" || /duplicate key/i.test(String(err?.message || ""));
}

function legacyAccountSessionStatus(account, tokenHash) {
  if (!account?.session_token_hash) return "missing";
  if (!timingSafeEqualHex(tokenHash, account.session_token_hash)) return "invalid";

  const expiresAt = Date.parse(account.session_expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return "expired";

  return "valid";
}

async function validateAccountSession(supabase, options = {}) {
  const account = options.account || null;
  const token = options.token || options.sessionToken || options.session_token || null;

  if (!account || !token) {
    throw httpError(401, "GridWild account session is required.");
  }

  const tokenHash = hashToken(token);
  const legacyStatus = legacyAccountSessionStatus(account, tokenHash);

  const sessionResult = await supabase
    .from(ACCOUNT_SESSION_TABLE)
    .select("id, expires_at")
    .eq("account_id", account.id)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessionResult.error) {
    if (isAccountSessionTableMissing(sessionResult.error)) {
      if (legacyStatus === "valid") return account;
      if (legacyStatus === "missing") {
        throw httpError(401, "GridWild account session is not active.");
      }
      if (legacyStatus === "expired") {
        throw httpError(401, "GridWild account session expired.");
      }
      throw httpError(401, "GridWild account session is invalid.");
    }
    throw sessionResult.error;
  }

  if (sessionResult.data) {
    const expiresAt = Date.parse(sessionResult.data.expires_at || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw httpError(401, "GridWild account session expired.");
    }

    supabase
      .from(ACCOUNT_SESSION_TABLE)
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", sessionResult.data.id)
      .then(() => null);

    return account;
  }

  if (legacyStatus === "valid") {
    await storeAccountSession(supabase, {
      accountId: account.id,
      tokenHash,
      expiresAt: account.session_expires_at
    });
    return account;
  }
  if (legacyStatus === "missing") {
    throw httpError(401, "GridWild account session is not active.");
  }
  if (legacyStatus === "expired") {
    throw httpError(401, "GridWild account session expired.");
  }

  throw httpError(401, "GridWild account session is invalid.");
}

async function storeAccountSession(supabase, options = {}) {
  const accountId = options.accountId || options.account_id || null;
  const tokenHash = options.tokenHash || options.token_hash || null;
  const expiresAt = options.expiresAt || options.expires_at || null;

  if (!accountId || !tokenHash || !expiresAt) {
    throw new Error("accountId, tokenHash, and expiresAt are required.");
  }

  const result = await supabase.from(ACCOUNT_SESSION_TABLE).insert({
    account_id: accountId,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  if (result.error) {
    if (isAccountSessionTableMissing(result.error)) return { stored: false };
    if (isDuplicateSession(result.error)) return { stored: false };
    throw result.error;
  }

  return { stored: true };
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
  return validateAccountSession(supabase, { account, token });
}

function accountTableHint(err) {
  const message = err?.message || "";
  if (message.includes(ACCOUNT_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/gridwild_accounts.sql in Supabase first.`;
  }
  if (message.includes(ACCOUNT_SESSION_TABLE)) {
    return `${message}. Run netlify/schema/gridwild_accounts.sql in Supabase first.`;
  }
  return message;
}

module.exports = {
  ACCOUNT_SESSION_TABLE,
  accountTableHint,
  hashToken,
  storeAccountSession,
  validateAccountSession,
  requireAccountSession
};
