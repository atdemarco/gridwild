const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const CACHE_FILE = path.join(ROOT, "genus-reference-cache.json");
const BATCH_RE = /^genus-codex-batch-\d{3}\.json$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

function parseOrder(entry) {
  const fact = (entry.facts || []).find((item) => item.includes(" in the order ") || item.includes(" is placed in the order "));
  const match = fact && (fact.match(/ in the order ([A-Za-z0-9_-]+)/) || fact.match(/ order ([A-Za-z0-9_-]+) in this codex/));
  return match ? match[1] : "";
}

function parseCount(entry, phrase) {
  const fact = (entry.facts || []).find((item) => item.includes(phrase));
  const match = fact && fact.match(/includes ([\d,]+)|cover ([\d,]+)/);
  if (!match) return "";
  return match[1] || match[2] || "";
}

function parseSeason(entry) {
  return (entry.facts || []).find((item) => item.startsWith("Source observations peak")) || "";
}

function decodeHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return decodeHtml(text)
    .replace(/\s+\[[^\]]+\]/g, "")
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25 && sentence.length < 260)
    .filter((sentence) => !/^(it|they|these|this|most|many|some|its|their)\b/i.test(sentence))
    .filter((sentence) => !/this is a list|this page is about|not be confused with/i.test(sentence));
}

function cleanPublishedIn(value = "") {
  return decodeHtml(value)
    .replace(/:\s*null\.\s*/gi, ": ")
    .replace(/\bnull\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function kingdomHint(entry, order) {
  const plantOrders = new Set(["Apiales", "Asterales", "Asparagales", "Brassicales", "Caryophyllales", "Dipsacales", "Ericales", "Fabales", "Fagales", "Lamiales", "Malpighiales", "Malvales", "Myrtales", "Poales", "Ranunculales", "Rosales", "Sapindales", "Solanales"]);
  if (plantOrders.has(order)) return "Plantae";
  if (["Agaricales", "Boletales", "Cantharellales", "Polyporales", "Russulales"].includes(order)) return "Fungi";
  if (["Passeriformes", "Charadriiformes", "Accipitriformes", "Anseriformes", "Piciformes", "Strigiformes"].includes(order)) return "Animalia";
  return "";
}

async function fetchJson(url, attempt = 1) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "gridwild-codex-refresh/1.0"
      }
    });
  } catch (error) {
    if (attempt <= 6) {
      const waitMs = attempt * 10000;
      console.log(`Network hiccup; waiting ${Math.round(waitMs / 1000)}s before retry ${attempt}...`);
      await sleep(waitMs);
      return fetchJson(url, attempt + 1);
    }
    throw error;
  }
  if (response.status === 429 && attempt <= 6) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.max(retryAfter * 1000, 30000)
      : attempt * 30000;
    console.log(`Rate limited; waiting ${Math.round(waitMs / 1000)}s before retry ${attempt}...`);
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function getGbif(entry, order, cache) {
  const key = `${entry.genus}|${entry.family}|${order}`;
  cache.gbif ||= {};
  if (cache.gbif[key]) return cache.gbif[key];
  if (!order) {
    const fallbackKey = Object.keys(cache.gbif).find((item) => item.startsWith(`${entry.genus}|${entry.family}|`));
    if (fallbackKey) return cache.gbif[fallbackKey];
  }

  const params = new URLSearchParams({
    name: entry.genus,
    rank: "GENUS"
  });
  if (entry.family) params.set("family", entry.family);
  if (order) params.set("order", order);
  const kingdom = kingdomHint(entry, order);
  if (kingdom) params.set("kingdom", kingdom);

  const match = await fetchJson(`https://api.gbif.org/v1/species/match?${params}`);
  let usage = null;
  if (match.usageKey && match.rank === "GENUS" && match.canonicalName === entry.genus) {
    usage = await fetchJson(`https://api.gbif.org/v1/species/${match.usageKey}`);
  }

  const result = { match, usage };
  cache.gbif[key] = result;
  await sleep(250);
  return result;
}

async function getINat(entry, order, cache) {
  const key = `${entry.genus}|${entry.family}|${order}`;
  cache.inat ||= {};
  if (cache.inat[key]) return cache.inat[key];
  if (!order) {
    const fallbackKey = Object.keys(cache.inat).find((item) => item.startsWith(`${entry.genus}|${entry.family}|`));
    if (fallbackKey) return cache.inat[fallbackKey];
  }

  const params = new URLSearchParams({
    q: entry.genus,
    rank: "genus",
    per_page: "10"
  });
  const search = await fetchJson(`https://api.inaturalist.org/v1/taxa?${params}`);
  let candidate = null;
  for (const result of search.results || []) {
    if (result.name !== entry.genus || result.rank !== "genus") continue;
    const detail = await fetchJson(`https://api.inaturalist.org/v1/taxa/${result.id}`);
    const taxon = detail.results && detail.results[0];
    const ancestors = taxon?.ancestors || [];
    const familyMatch = !entry.family || ancestors.some((item) => item.rank === "family" && item.name === entry.family);
    const orderMatch = !order || ancestors.some((item) => item.rank === "order" && item.name === order);
    if (familyMatch || orderMatch) {
      candidate = taxon;
      break;
    }
    candidate ||= taxon;
    await sleep(250);
  }

  cache.inat[key] = candidate || {};
  await sleep(650);
  return cache.inat[key];
}

function groupNoun(entry, order, inat) {
  if (inat?.preferred_common_name) return inat.preferred_common_name.toLowerCase();
  const lowerFamily = (entry.family || "organisms").toLowerCase();
  if (order === "Lepidoptera") return "moths or butterflies";
  if (order === "Coleoptera") return "beetles";
  if (order === "Diptera") return "flies";
  if (order === "Hymenoptera") return "wasps, bees, ants, or sawflies";
  if (order === "Passeriformes") return "perching birds";
  if (order === "Squamata") return "lizards or snakes";
  if (order === "Agaricales") return "gilled mushrooms";
  return `${lowerFamily} organisms`;
}

function buildLore(entry, order, refs) {
  if (entry.genus === "Unknown") {
    return [
      "Unknown is a review placeholder for records that have not yet been resolved to a confident genus.",
      "Treat this entry as a field-notes bucket: habitat, date, photographs, and visible structures matter more than a genus description here.",
      "Future review should move these observations into real genus accounts once the organism can be identified more precisely."
    ];
  }

  const summarySentences = splitSentences(refs.inat?.wikipedia_summary || "");
  const noun = groupNoun(entry, order, refs.inat);
  const lore = [];

  lore.push(`${entry.genus} is a genus of ${noun} placed in the family ${entry.family || "its family"}${order ? ` and the order ${order}` : ""}.`);
  for (const sentence of summarySentences) {
    if (!lore.includes(sentence)) lore.push(sentence);
    if (lore.length === 3) return lore;
  }
  lore.push(`In the field, ${entry.genus} is best approached by combining its overall form with habitat, season, and behavior instead of relying on a single mark.`);
  lore.push(`Close photographs of shape, surface texture, flowers, wings, leaves, or other visible structures can help separate members of ${entry.genus} from similar genera.`);
  return [...new Set(lore)].slice(0, 3);
}

function addFact(facts, fact) {
  const clean = decodeHtml(fact || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 18 || facts.includes(clean)) return;
  facts.push(clean.endsWith(".") ? clean : `${clean}.`);
}

function buildFacts(entry, order, refs) {
  if (entry.genus === "Unknown") {
    const obsCount = parseCount(entry, "genus-level observation");
    const squareCount = parseCount(entry, "mapped square");
    const season = parseSeason(entry);
    const facts = [];
    addFact(facts, "Unknown is not a biological genus; it marks records needing taxonomic review");
    if (obsCount) addFact(facts, `The gridwild source dataset includes ${obsCount} unresolved genus-level observations`);
    if (squareCount) addFact(facts, `The unresolved source records cover ${squareCount} mapped squares`);
    if (season) addFact(facts, season.replace("Source observations", "Gridwild unresolved observations"));
    addFact(facts, "Use this entry to flag observations that need better photos, locality context, or expert review");
    addFact(facts, "A real genus account should replace this placeholder after the organism is identified");
    addFact(facts, "Useful review clues include body plan, substrate, host plant, behavior, date, and location");
    addFact(facts, "Records in this bucket should not be used for biological facts about a taxon");
    addFact(facts, "Keep this placeholder separate from verified genus accounts during field-guide review");
    return facts;
  }

  const facts = [];
  const gbif = refs.gbif?.usage || refs.gbif?.match || {};
  const inat = refs.inat || {};
  const obsCount = parseCount(entry, "genus-level observation");
  const squareCount = parseCount(entry, "mapped square");
  const season = parseSeason(entry);

  if (inat.preferred_common_name) {
    addFact(facts, `iNaturalist lists "${inat.preferred_common_name}" as a common name for ${entry.genus}`);
  }
  if (gbif.scientificName) {
    addFact(facts, `GBIF records the genus name as ${gbif.scientificName}`);
  }
  if (gbif.authorship) {
    addFact(facts, `The taxon authorship recorded by GBIF is ${gbif.authorship}`);
  }
  const publishedIn = cleanPublishedIn(gbif.publishedIn);
  if (publishedIn) {
    addFact(facts, `GBIF cites the publication source as ${publishedIn}`);
  }
  if (gbif.taxonomicStatus || gbif.status) {
    addFact(facts, `GBIF treats ${entry.genus} as ${String(gbif.taxonomicStatus || gbif.status).toLowerCase()} at genus rank`);
  }
  if (Number.isFinite(gbif.numDescendants)) {
    addFact(facts, `GBIF lists ${gbif.numDescendants.toLocaleString("en-US")} descendant taxa under ${entry.genus}`);
  }
  if (entry.family) addFact(facts, `${entry.genus} is placed in the family ${entry.family} in this codex`);
  if (order) addFact(facts, `${entry.genus} is placed in the order ${order} in this codex`);
  if (obsCount) addFact(facts, `The gridwild source dataset includes ${obsCount} genus-level observations`);
  if (squareCount) addFact(facts, `The gridwild source records cover ${squareCount} mapped squares`);
  if (season) addFact(facts, season.replace("Source observations", "Gridwild source observations"));
  if (Number.isFinite(inat.observations_count)) {
    addFact(facts, `iNaturalist has ${inat.observations_count.toLocaleString("en-US")} observations indexed for ${entry.genus}`);
  }
  if (Number.isFinite(inat.complete_species_count)) {
    addFact(facts, `iNaturalist marks ${inat.complete_species_count.toLocaleString("en-US")} species in its complete species count for ${entry.genus}`);
  }
  if (inat.wikipedia_url) {
    addFact(facts, `The iNaturalist taxon page links ${entry.genus} to ${inat.wikipedia_url.replace(/^http:/, "https:")}`);
  }

  for (const sentence of splitSentences(inat.wikipedia_summary || "")) {
    addFact(facts, sentence);
    if (facts.length >= 10) break;
  }

  addFact(facts, `Use multiple field clues for ${entry.genus}: form, habitat, season, and close structural details`);
  addFact(facts, `Species-level identification in ${entry.genus} may require expert keys, clear photographs, or local range context`);

  return facts.slice(0, 10);
}

async function main() {
  const files = fs.readdirSync(ROOT).filter((file) => BATCH_RE.test(file)).sort();
  const cache = loadCache();
  let processed = 0;

  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    const batch = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    for (const entry of Object.values(batch)) {
      const order = parseOrder(entry);
      if (entry.genus === "Unknown") {
        entry.lore = buildLore(entry, order, {});
        entry.facts = buildFacts(entry, order, {});
        processed += 1;
        continue;
      }
      const gbif = await getGbif(entry, order, cache);
      const inat = await getINat(entry, order, cache);
      entry.lore = buildLore(entry, order, { gbif, inat });
      entry.facts = buildFacts(entry, order, { gbif, inat });
      processed += 1;
      if (processed % 100 === 0) {
        saveCache(cache);
        console.log(`Processed ${processed} entries...`);
      }
    }
    fs.writeFileSync(fullPath, `${JSON.stringify(batch, null, 2)}\n`);
    saveCache(cache);
    console.log(`Updated ${file}`);
  }
  saveCache(cache);
  console.log(`Done. Revised ${processed} entries across ${files.length} batches.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
