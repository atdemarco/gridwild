const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const {
  assertObservationQualifiesForQuest,
  normalizeQuestRecipe,
  questReward
} = require("../netlify/functions/_quest-authority");
const {
  assertOwnedObservation,
  verifyINatIdentification
} = require("../netlify/functions/_inat-authority");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function requireText(relativePath, expected, message) {
  if (!read(relativePath).includes(expected)) {
    failures.push(`${relativePath}: ${message}`);
  }
}

function rejectText(relativePath, rejected, message) {
  if (read(relativePath).includes(rejected)) {
    failures.push(`${relativePath}: ${message}`);
  }
}

requireText(
  "netlify/functions/complete-quest.js",
  'supabase.rpc("gridwild_complete_quest"',
  "quest completion must use the transactional reward RPC"
);
rejectText(
  "netlify/functions/complete-quest.js",
  '.from("players")',
  "quest completion must not update player balances directly"
);
requireText(
  "netlify/functions/purchase-store-item.js",
  'supabase.rpc("gridwild_purchase_store_item"',
  "store purchases must use the transactional purchase RPC"
);
requireText(
  "netlify/functions/set-player-equipment.js",
  'supabase.rpc("gridwild_set_owned_equipment"',
  "equipment changes must verify ownership in the database RPC"
);
rejectText(
  "netlify/functions/add-player-inventory-item.js",
  "SUPABASE_SERVICE_ROLE_KEY",
  "the old free inventory grant endpoint must remain disabled"
);
requireText(
  "netlify/functions/update-player.js",
  "Wild Points can only be changed by server-authoritative economy actions.",
  "profile updates must explicitly reject wildpoints"
);
requireText(
  "netlify/functions/create-quest.js",
  "issueQuest",
  "quest issuance must use the transactional issuance RPC"
);
rejectText(
  "netlify/functions/create-quest.js",
  '.from("quests")',
  "general quest creation must not insert quests outside the issuance RPC"
);
rejectText(
  "netlify/functions/create-sample-niche-quest.js",
  '.from("quests")',
  "sample-niche quest creation must not insert quests outside the issuance RPC"
);
requireText(
  "netlify/functions/accept-quest.js",
  "assertRewardQuestOwned",
  "players must not accept another explorer's reward-bearing quest"
);
requireText(
  "netlify/functions/claim-quest-evidence.js",
  "assertOwnedObservation",
  "observation evidence must be verified against the linked iNaturalist account"
);
requireText(
  "netlify/functions/claim-quest-evidence.js",
  'verification_status: "verified"',
  "verified observation evidence must be marked explicitly"
);
requireText(
  "netlify/functions/claim-identification.js",
  "verifyINatIdentification",
  "identification evidence must verify a submitted iNaturalist identification"
);
requireText(
  "netlify/functions/upsert-player-achievements.js",
  "getVerifiedAchievements",
  "achievement sync must return server-verified achievements"
);
rejectText(
  "netlify/functions/upsert-player-achievements.js",
  '.from("player_achievements")',
  "client-authored achievements must not be written to the trusted achievement path"
);
rejectText(
  "js/gw-api.js",
  "upsertPlayerAchievements(achievements",
  "the client must not send authored achievement state to the authority endpoint"
);
requireText(
  "js/gw-store.js",
  "if (!Array.isArray(dbRows)) return false;",
  "store achievement gates must fail closed until verified achievements load"
);
requireText(
  "js/gw-economy.js",
  "if (!Array.isArray(dbRows)) return false;",
  "economy achievement gates must fail closed until verified achievements load"
);
rejectText(
  "js/gw-api.js",
  "addWildpoints",
  "the client must not expose arbitrary Wild Point changes"
);
rejectText(
  "js/gw-api.js",
  "addPlayerInventoryItem",
  "the client must not expose free inventory grants"
);
rejectText(
  "js/gw-economy.js",
  "rewardObservationHandoff",
  "unverifiable local actions must not mint Wild Points"
);

for (const rpcName of [
  "gridwild_issue_quest",
  "gridwild_purchase_store_item",
  "gridwild_refresh_verified_achievements",
  "gridwild_set_owned_equipment",
  "gridwild_complete_quest"
]) {
  requireText(
    "netlify/schema/economy_quest_authority.sql",
    `function public.${rpcName}`,
    `missing ${rpcName} RPC`
  );
}

requireText(
  "netlify/schema/economy_quest_authority.sql",
  "gridwild_economy_ledger",
  "economy transactions must write an audit ledger"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "gridwild_rewarded_quest_evidence",
  "quest evidence must be consumed to prevent reward replay"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "qe.verification_status = 'verified'",
  "quest completion must count only server-verified evidence"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "gridwild_verified_achievements",
  "store gates must use server-verified achievements"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "Daily quest issuance limit reached.",
  "reward-bearing quest issuance must be rate-limited transactionally"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "Reward-bearing quest was not issued by the GridWild quest authority.",
  "quest completion must reject reward-bearing legacy or directly inserted quests"
);
requireText(
  "netlify/schema/economy_quest_authority.sql",
  "qe.source = 'inat_observation'",
  "observation quests must consume only verified iNaturalist observation evidence"
);

const catalogContext = { window: {} };
vm.runInNewContext(read("js/gw-store-catalog.js"), catalogContext);
const clientCatalog = catalogContext.window.GridWildStoreCatalog?.items || [];
const sqlCatalog = new Map();
const catalogRowPattern =
  /\('([^']+)',\s*'[^']*',\s*'([^']+)',\s*(\d+),\s*(null|'([^']+)')\)/g;
const economySql = read("netlify/schema/economy_quest_authority.sql");

for (const match of economySql.matchAll(catalogRowPattern)) {
  sqlCatalog.set(match[1], {
    slot: match[2],
    price: Number(match[3]),
    requiresAchievement: match[5] || null
  });
}

for (const item of clientCatalog) {
  const serverItem = sqlCatalog.get(item.id);
  if (
    !serverItem ||
    serverItem.slot !== item.slot ||
    serverItem.price !== Number(item.price) ||
    serverItem.requiresAchievement !== (item.requiresAchievement || null)
  ) {
    failures.push(`store catalog mismatch for ${item.id}`);
  }
}

if (sqlCatalog.size !== clientCatalog.length) {
  failures.push(
    `store catalog size mismatch: client=${clientCatalog.length}, server=${sqlCatalog.size}`
  );
}

const manipulatedRecipe = normalizeQuestRecipe({
  difficulty: 999,
  quantity: 999,
  objectiveType: "anything_the_caller_wants",
  targetLocation: "anywhere"
}, {
  source: "today",
  questType: "explore"
});
assert.equal(manipulatedRecipe.difficulty, 5);
assert.equal(manipulatedRecipe.quantity, 5);
assert.equal(manipulatedRecipe.objectiveType, "any_observation");
assert.equal(questReward(manipulatedRecipe, "manual"), 0);

const onboardingRecipe = normalizeQuestRecipe({
  difficulty: 5,
  quantity: 5,
  objectiveType: "identify_unknowns"
}, {
  source: "onboarding",
  questType: "identify"
});
assert.equal(onboardingRecipe.quantity, 1);
assert.equal(onboardingRecipe.objectiveType, "any_observation");

const verifiedObservation = {
  id: 123,
  observed_on: new Date().toISOString(),
  positional_accuracy: 8,
  photos: [{ id: 1 }],
  geojson: { coordinates: [-77.03, 38.91] },
  user: { id: 42 },
  taxon: {
    id: 500,
    name: "Testus example",
    iconic_taxon_name: "Plantae"
  },
  identifications: [{
    id: 900,
    current: true,
    user: { id: 42 },
    taxon: { id: 500, name: "Testus example" }
  }]
};
assert.doesNotThrow(() => assertOwnedObservation(verifiedObservation, { id: 42 }));
assert.throws(() => assertOwnedObservation(verifiedObservation, { id: 99 }));
assert.doesNotThrow(() => assertObservationQualifiesForQuest(verifiedObservation, {
  quest_type: "explore",
  recipe: {
    iconicTaxon: "Plantae",
    timeframe: "today",
    evidence: "photo_gps20",
    targetLocation: "anywhere"
  }
}));
assert.throws(() => assertObservationQualifiesForQuest({
  ...verifiedObservation,
  positional_accuracy: 500
}, {
  quest_type: "explore",
  recipe: {
    iconicTaxon: "Plantae",
    timeframe: "today",
    evidence: "photo_gps20",
    targetLocation: "anywhere"
  }
}));
assert.doesNotThrow(() => verifyINatIdentification(
  verifiedObservation,
  { id: 42 },
  900,
  500
));
assert.throws(() => verifyINatIdentification(
  verifiedObservation,
  { id: 99 },
  900,
  500
));

const verifiedEvidenceWriters = new Set([
  "claim-identification.js",
  "claim-quest-evidence.js"
]);
const functionsDir = path.join(root, "netlify", "functions");
for (const name of fs.readdirSync(functionsDir).filter(name => name.endsWith(".js"))) {
  const content = fs.readFileSync(path.join(functionsDir, name), "utf8");
  if (
    content.includes('verification_status: "verified"') &&
    !verifiedEvidenceWriters.has(name)
  ) {
    failures.push(`${name}: unauthorized server-verified evidence writer`);
  }
}

if (failures.length) {
  console.error("Economy authority audit failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Economy authority audit passed.");
