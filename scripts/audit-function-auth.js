const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const functionsDir = path.join(root, "netlify", "functions");

const intentionalPublicServiceRoleFunctions = new Set([
  "get-bootstrap.js",
  "get-grid-assets-build.js",
  "get-party-report.js",
  "gridwild-account-login.js",
  "gridwild-account-signup.js"
]);

const failures = [];
const protectedFunctions = [];

for (const name of fs.readdirSync(functionsDir).filter((name) => name.endsWith(".js"))) {
  const content = fs.readFileSync(path.join(functionsDir, name), "utf8");
  if (!content.includes("exports.handler")) continue;
  if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) continue;

  const isPublic = intentionalPublicServiceRoleFunctions.has(name);
  const hasPlayerAuth = content.includes("authorizePlayerRequest");
  const hasAccountAuth = content.includes("requireAccountSession");

  if (!isPublic && !hasPlayerAuth && !hasAccountAuth) {
    failures.push(`${name}: service-role function has no session authorization`);
  } else if (!isPublic) {
    const handler = content.slice(content.indexOf("exports.handler"));
    const authIndex = Math.min(
      ...[
        handler.indexOf("authorizePlayerRequest"),
        handler.indexOf("requireAccountSession")
      ].filter((index) => index >= 0)
    );
    const firstQueryIndex = handler.indexOf(".from(");

    if (firstQueryIndex >= 0 && authIndex > firstQueryIndex) {
      failures.push(`${name}: database query occurs before session authorization`);
    }

    protectedFunctions.push(name);
  }
}

const apiContent = fs.readFileSync(path.join(root, "js", "gw-api.js"), "utf8");
if (/body:\s*JSON\.stringify\(/.test(apiContent)) {
  failures.push("js/gw-api.js: API request body bypasses gridWildApiBody credentials");
}

if (!apiContent.includes("getPlayerSessionToken()")) {
  failures.push("js/gw-api.js: unified player-session token helper is missing");
}

if (failures.length) {
  console.error("Function authorization audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Function authorization audit passed: ${protectedFunctions.length} service-role endpoints protected; ` +
    `${intentionalPublicServiceRoleFunctions.size} intentionally public.`
);
