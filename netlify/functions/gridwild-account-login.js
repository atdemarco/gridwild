const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { storeAccountSession } = require("./_gridwild-account-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ACCOUNT_TABLE = "gridwild_accounts";
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function hashPassword(password, salt, iterations) {
  return crypto
    .pbkdf2Sync(String(password || ""), salt, Number(iterations || 210000), KEY_LENGTH, DIGEST)
    .toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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

function responseStatusForError(err) {
  const status = Number(err?.statusCode || err?.status);
  return Number.isFinite(status) && status >= 400 && status < 600 ? status : 500;
}

function retryAfterForError(err) {
  return (
    err?.retryAfter ||
    err?.retry_after ||
    err?.headers?.["retry-after"] ||
    err?.headers?.["Retry-After"] ||
    ""
  );
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");

    const accountResult = await supabase
      .from(ACCOUNT_TABLE)
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (accountResult.error) throw accountResult.error;

    const account = accountResult.data;
    const passwordHash = hashPassword(
      password,
      account?.password_salt || "",
      account?.password_iterations
    );

    if (!account || !timingSafeEqualHex(passwordHash, account.password_hash)) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Username or password is incorrect." })
      };
    }

    const playerResult = await supabase
      .from("players")
      .select("*")
      .eq("id", account.player_id)
      .single();

    if (playerResult.error) throw playerResult.error;

    const session = sessionForAccount();

    const updateResult = await supabase
      .from(ACCOUNT_TABLE)
      .update({
        session_token_hash: session.tokenHash,
        session_expires_at: session.expiresAt,
        last_login_at: new Date().toISOString()
      })
      .eq("id", account.id)
      .select("id, username, player_id, created_at, last_login_at")
      .single();

    if (updateResult.error) throw updateResult.error;
    await storeAccountSession(supabase, {
      accountId: account.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        account: updateResult.data,
        player: playerResult.data,
        session: {
          token: session.token,
          expires_at: session.expiresAt
        }
      })
    };
  } catch (err) {
    const retryAfter = retryAfterForError(err);
    const headers = retryAfter ? { "Retry-After": String(retryAfter) } : {};
    return {
      statusCode: responseStatusForError(err),
      headers,
      body: JSON.stringify({
        error: accountTableHint(err) || "Login is temporarily unavailable.",
        code: err?.code || ""
      })
    };
  }
};
