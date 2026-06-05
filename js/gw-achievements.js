// -----------------------------------------------------------------------------
// GridWild Achievements / Accomplishments
// Permanent account-wide milestone layer, separate from quests.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_user_achievements_v1";
  const PROFILE_KEY = "gw_achievement_profile_v1";

  const RANKS = ["Novice", "Apprentice", "Adept", "Master", "Grandmaster", "Legend"];
  let pendingBootstrapSync = false;

  const TAXON_LINES = window.GridWildTaxonomy?.taxonLines || [];

  const DEFINITIONS = buildDefinitions();

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function nowISO() {
    return new Date().toISOString();
  }

function loadStore() {
  const dbRows = window.__gwState?.playerAchievements;
  let out = {};

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    out = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    out = {};
  }

  if (Array.isArray(dbRows)) {
    dbRows.forEach(row => {
      out[row.achievement_id] = {
        unlocked: !!row.unlocked,
        progress: Number(row.progress || 0),
        target: Number(row.target || 1),
        achieved_at: row.achieved_at || null,
        achieved_where: row.achieved_where || null,
        source: row.source || "db"
      };
    });
  }

  return out;
}

function saveStore(store) {
  const safeStore = store || {};

  // Keep local fallback mirror for now.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeStore));

  if (!window.GridWildAPI?.getPlayerId?.()) {
    if (!pendingBootstrapSync) {
      pendingBootstrapSync = true;
      window.addEventListener("gwBootstrapReady", () => {
        pendingBootstrapSync = false;
        saveStore(safeStore);
      }, { once: true });
    }
    window.dispatchEvent(new CustomEvent("gwAchievementsChanged"));
    refreshAchievementSummary();
    return;
  }

  window.GridWildAPI?.upsertPlayerAchievements?.()
    .then(result => {
      window.__gwState = window.__gwState || {};
      window.__gwState.playerAchievements = result.achievements || [];
      window.dispatchEvent(new CustomEvent("gwAchievementsChanged"));
      refreshAchievementSummary();
    })
    .catch(err => {
      console.warn("Could not sync achievements:", err);
      window.dispatchEvent(new CustomEvent("gwAchievementsChanged"));
      refreshAchievementSummary();
    });
}

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile || {}));
  }

  function buildDefinitions() {
    const defs = [];

    function add(d) {
      defs.push({
        id: d.id,
        name: d.name,
        category: d.category,
        family: d.family || d.category,
        rule_type: d.rule_type,
        threshold: d.threshold,
        tier: d.tier || "Novice",
        icon: d.icon || "🏅",
        hidden: !!d.hidden,
        reward: d.reward || { xp: 10 },
        retroactive_allowed: d.retroactive_allowed !== false,
        description: d.description || "",
        flavor: d.flavor || ""
      });
    }

    const countTiers = [
      ["Novice", 1],
      ["Apprentice", 5],
      ["Adept", 10],
      ["Master", 25],
      ["Grandmaster", 50],
      ["Legend", 100]
    ];

    for (const [tier, n] of countTiers) {
      add({
        id: `obs_total_${n}`,
        name: `${tier} Observer`,
        category: "Diversity",
        family: "Total observations",
        rule_type: "total_observations",
        threshold: n,
        tier,
        icon: "📷",
        reward: { xp: n * 2, title: tier === "Legend" ? "Life Mapper" : null },
        description: `Record ${n} total observations.`
      });

      add({
        id: `species_total_${n}`,
        name: `${tier} Species Scout`,
        category: "Diversity",
        family: "Species",
        rule_type: "unique_species",
        threshold: n,
        tier,
        icon: "🧬",
        reward: { xp: n * 3 },
        description: `Observe ${n} unique species.`
      });

      add({
        id: `genera_total_${n}`,
        name: `${tier} Genus Collector`,
        category: "Diversity",
        family: "Genera",
        rule_type: "unique_genera",
        threshold: n,
        tier,
        icon: "📚",
        reward: { xp: n * 3 },
        description: `Observe ${n} unique genera.`
      });

      add({
        id: `grid_cells_${n}`,
        name: `${tier} Gridwalker`,
        category: "Space",
        family: "Grid squares",
        rule_type: "unique_cells",
        threshold: n,
        tier,
        icon: "🗺️",
        reward: { xp: n * 2 },
        description: `Make observations in ${n} unique grid squares.`
      });
    }

    for (const line of TAXON_LINES) {
      for (const [tier, n] of countTiers) {
        add({
          id: `${line.key}_obs_${n}`,
          name: `${line.label} ${tier}`,
          category: "Specificity / Mastery",
          family: line.label,
          rule_type: "taxon_line_count",
          threshold: n,
          tier,
          icon: line.icon,
          reward: { xp: n * 3, title: tier === "Master" ? `${line.label} Master` : null },
          description: `Record ${n} ${line.label.toLowerCase()} observations.`,
          flavor: `A lifetime path for becoming known as a ${line.label.toLowerCase()} specialist.`,
          matcher: line.terms
        });

        add({
          id: `${line.key}_genera_${n}`,
          name: `${line.label} Genera ${tier}`,
          category: "Specificity / Mastery",
          family: `${line.label} genera`,
          rule_type: "taxon_line_genera",
          threshold: n,
          tier,
          icon: line.icon,
          reward: { xp: n * 4 },
          description: `Record ${n} ${line.label.toLowerCase()} genera.`,
          matcher: line.terms
        });
      }
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    monthNames.forEach((m, idx) => {
      add({
        id: `month_${idx + 1}`,
        name: `${m} Naturalist`,
        category: "Time",
        family: "Calendar months",
        rule_type: "observed_in_month",
        threshold: idx + 1,
        tier: "Novice",
        icon: "📅",
        reward: { xp: 15 },
        description: `Make at least one observation in ${m}.`
      });
    });

    add({
      id: "all_12_months",
      name: "Calendar Creature",
      category: "Time",
      family: "Calendar months",
      rule_type: "all_months",
      threshold: 12,
      tier: "Master",
      icon: "🗓️",
      reward: { xp: 250, title: "Calendar Creature" },
      description: "Observe life in all 12 months."
    });

    [
      ["dawn_10", "Dawn Watcher", "dawn_count", 10, "🌅"],
      ["night_10", "Night Explorer", "night_count", 10, "🌙"],
      ["weekend_25", "Weekend Wanderer", "weekend_count", 25, "🥾"],
      ["research_grade_1", "First Research Grade", "research_grade_count", 1, "🔬"],
      ["research_grade_25", "Research Grade Regular", "research_grade_count", 25, "🔬"],
      ["unknown_helper_1", "First ID Given", "ids_given", 1, "🤝"],
      ["unknown_helper_25", "Unknowns Helper", "ids_given", 25, "🤝"],
      ["survey_join_1", "Joined the Expedition", "surveys_joined", 1, "🏕️"]
    ].forEach(([id, name, rule, n, icon]) => {
      add({
        id,
        name,
        category: rule.includes("survey") || rule.includes("ids") ? "Community" : "Behavior / Style",
        family: name,
        rule_type: rule,
        threshold: n,
        tier: n >= 25 ? "Adept" : "Novice",
        icon,
        reward: { xp: n * 10 },
        description: `Milestone: ${name}.`
      });
    });

    [
      ["secret_444", "The Witching Minute", "secret_444", 1, "🕯️", "Observe at 4:44 AM."],
      ["secret_three_in_minute", "Life Burst", "three_taxa_one_minute", 1, "⚡", "Record 3 taxa within 1 minute."],
      ["secret_storm", "Stormbringer", "storm_observation", 1, "⛈️", "Upload during stormy weather. Placeholder until weather integration."]
    ].forEach(([id, name, rule, n, icon, desc]) => {
      add({
        id,
        name,
        category: "Hidden",
        family: "Secrets",
        rule_type: rule,
        threshold: n,
        tier: "Secret",
        icon,
        hidden: true,
        reward: { xp: 100, title: name },
        description: desc
      });
    });

    // Pad to ~300 using themed generated micro-lines.
    const biomes = ["Park", "Campus", "Creek", "Alley", "Garden", "Forest Edge", "Sidewalk", "Wetland"];
    const behaviors = ["Returner", "Mapper", "Specialist", "Scout", "Sentinel", "Archivist"];
    for (const biome of biomes) {
      for (const behavior of behaviors) {
        for (const [tier, n] of [["Novice", 3], ["Apprentice", 7], ["Adept", 15]]) {
          add({
            id: `style_${biome}_${behavior}_${n}`.toLowerCase().replaceAll(" ", "_"),
            name: `${biome} ${behavior}`,
            category: "Behavior / Style",
            family: `${biome} style`,
            rule_type: "style_placeholder",
            threshold: n,
            tier,
            icon: "🎒",
            reward: { xp: n * 5 },
            description: `Placeholder achievement for ${biome.toLowerCase()} exploration style.`
          });
        }
      }
    }

    return defs.slice(0, 300);
  }

  function normalizeObsForStats(obs) {
    const sci = String(obs.scientific_name || obs.taxon || "").trim();
    const genus = String(obs.genus_name || sci.split(/\s+/)[0] || "").trim();
    const date = obs.observed_on ? new Date(obs.observed_on) : null;

    return {
      id: String(obs.id || ""),
      lat: Number(obs.lat),
      lng: Number(obs.lng),
      cellKey: Number.isFinite(Number(obs.lat)) && Number.isFinite(Number(obs.lng)) && window.getCellKeyForLatLng
        ? window.getCellKeyForLatLng(obs.lat, obs.lng)
        : "",
      scientific: sci,
      common: String(obs.common_name || obs.taxon || "").toLowerCase(),
      iconic: String(obs.iconic_taxon_name || "").toLowerCase(),
      genus,
      observedDate: date && !Number.isNaN(date.getTime()) ? date : null,
      qualityGrade: String(obs.quality_grade || "").toLowerCase()
    };
  }

  function computeStats(observations) {
    const rows = observations.map(normalizeObsForStats);

    const species = new Set();
    const genera = new Set();
    const cells = new Set();
    const months = new Set();

    let dawn = 0;
    let night = 0;
    let weekend = 0;
    let researchGrade = 0;

    const taxonLineCounts = {};
    const taxonLineGenera = {};

    for (const line of TAXON_LINES) {
      taxonLineCounts[line.key] = 0;
      taxonLineGenera[line.key] = new Set();
    }

    for (const r of rows) {
      if (r.scientific) species.add(r.scientific);
      if (r.genus) genera.add(r.genus);
      if (r.cellKey) cells.add(r.cellKey);

      if (r.observedDate) {
        months.add(r.observedDate.getMonth() + 1);
        const h = r.observedDate.getHours();
        if (h >= 4 && h < 7) dawn++;
        if (h >= 21 || h < 5) night++;
        const day = r.observedDate.getDay();
        if (day === 0 || day === 6) weekend++;
      }

      if (r.qualityGrade === "research") researchGrade++;

      for (const line of TAXON_LINES) {
        const hay = `${r.scientific} ${r.common} ${r.iconic}`.toLowerCase();
        const matchesLine = window.GridWildTaxonomy?.matchesTaxonLine
          ? window.GridWildTaxonomy.matchesTaxonLine(line, hay)
          : line.terms.some(t => hay.includes(t));
        if (matchesLine) {
          taxonLineCounts[line.key]++;
          if (r.genus) taxonLineGenera[line.key].add(r.genus);
        }
      }
    }

    return {
      total_observations: rows.length,
      unique_species: species.size,
      unique_genera: genera.size,
      unique_cells: cells.size,
      months,
      dawn_count: dawn,
      night_count: night,
      weekend_count: weekend,
      research_grade_count: researchGrade,
      ids_given: Number(loadProfile().ids_given || 0),
      surveys_joined: Number(loadProfile().surveys_joined || 0),
      taxonLineCounts,
      taxonLineGenera
    };
  }

  function progressFor(def, stats) {
    if (def.rule_type === "total_observations") return stats.total_observations;
    if (def.rule_type === "unique_species") return stats.unique_species;
    if (def.rule_type === "unique_genera") return stats.unique_genera;
    if (def.rule_type === "unique_cells") return stats.unique_cells;
    if (def.rule_type === "all_months") return stats.months.size;
    if (def.rule_type === "observed_in_month") return stats.months.has(def.threshold) ? 1 : 0;
    if (def.rule_type === "dawn_count") return stats.dawn_count;
    if (def.rule_type === "night_count") return stats.night_count;
    if (def.rule_type === "weekend_count") return stats.weekend_count;
    if (def.rule_type === "research_grade_count") return stats.research_grade_count;
    if (def.rule_type === "ids_given") return stats.ids_given;
    if (def.rule_type === "surveys_joined") return stats.surveys_joined;

    if (def.rule_type === "taxon_line_count") {
      const lineKey = def.id.split("_obs_")[0];
      return stats.taxonLineCounts[lineKey] || 0;
    }

    if (def.rule_type === "taxon_line_genera") {
      const lineKey = def.id.split("_genera_")[0];
      return stats.taxonLineGenera[lineKey]?.size || 0;
    }

    if (def.rule_type === "secret_444") {
      const obs = window.GridWildRecentINat?.getRecentObservations?.() || [];
      return obs.some(o => {
        const d = o.observed_on ? new Date(o.observed_on) : null;
        return d && d.getHours() === 4 && d.getMinutes() === 44;
      }) ? 1 : 0;
    }

    return 0;
  }

  function evaluate(observations, options = {}) {
    const store = loadStore();
    const stats = computeStats(observations || []);
    const newlyAwarded = [];

    for (const def of DEFINITIONS) {
      if (store[def.id]?.unlocked) continue;
      if (options.retroactive && def.retroactive_allowed === false) continue;

      const progress = progressFor(def, stats);
      const target = Number(def.threshold || 1);
      const unlocked = progress >= target;

      if (unlocked) {
        store[def.id] = {
          unlocked: true,
          achieved_at: nowISO(),
          achieved_where: inferWhere(observations),
          source: options.source || "achievement_engine",
          progress,
          target
        };
        newlyAwarded.push(def);
      } else {
        store[def.id] = {
          unlocked: false,
          progress,
          target
        };
      }
    }

    saveStore(store);

    if (newlyAwarded.length) {
      showAwardToast(newlyAwarded[0], newlyAwarded.length);
    }

    return { newlyAwarded, store, stats };
  }

  function inferWhere(observations) {
    const last = observations?.[0];
    if (!last) return null;

    return {
      lat: last.lat ?? null,
      lng: last.lng ?? null,
      cellKey: last.lat && last.lng && window.getCellKeyForLatLng
        ? window.getCellKeyForLatLng(last.lat, last.lng)
        : null
    };
  }

  function getAllObservationEvidence() {
    const recent = window.GridWildRecentINat?.getRecentObservations?.() || [];

    const drafts = (window.GridWildDraftObservations?.loadDrafts?.() || [])
      .filter(d => d.status !== "deleted")
      .map(d => ({
        id: d.id,
        lat: d.location?.lat,
        lng: d.location?.lng,
        observed_on: d.observedAt || d.createdAt,
        scientific_name: d.suggestedId?.taxonName || "",
        common_name: "",
        genus_name: "",
        iconic_taxon_name: d.suggestedId?.iconicTaxon || "Unknown"
      }));

    return [...recent, ...drafts];
  }

  function evaluateCurrent(options = {}) {
    return evaluate(getAllObservationEvidence(), options);
  }

  async function importHistoricalINat(username, options = {}) {
    username = (username || window.__gwUser?.username || "andrew2285").trim().replace(/^@+/, "");

    const perPage = 100;
    const maxPages = options.maxPages || 50;
    const accepted = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL("https://api.inaturalist.org/v1/observations");
      url.searchParams.set("user_login", username);
      url.searchParams.set("order_by", "observed_on");
      url.searchParams.set("order", "desc");
      url.searchParams.set("geo", "true");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      url.searchParams.set("geoprivacy", "open");
      url.searchParams.set("taxon_geoprivacy", "open");

      window.dispatchEvent(new CustomEvent("gwAchievementImportProgress", {
        detail: { page, accepted: accepted.length }
      }));

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`iNaturalist historical import failed: HTTP ${resp.status}`);

      const data = await resp.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) break;

      for (const obs of results) {
        const coords = obs?.geojson?.coordinates;
        const taxon = obs?.taxon || {};
        if (!Array.isArray(coords) || coords.length < 2) continue;
        if (obs?.obscured === true) continue;

        const sci = taxon.name || "";
        accepted.push({
          id: obs.id,
          lat: Number(coords[1]),
          lng: Number(coords[0]),
          accuracy: Number(obs.positional_accuracy || 0),
          observed_on: obs.observed_on || obs.time_observed_at || null,
          taxon: taxon.preferred_common_name || sci || "Unknown taxon",
          common_name: taxon.preferred_common_name || "",
          scientific_name: sci,
          genus_name: sci.match(/^([A-Z][a-zA-Z-]+)/)?.[1] || "",
          iconic_taxon_name: taxon.iconic_taxon_name || "Unknown",
          quality_grade: obs.quality_grade || "",
          uri: obs.uri || null
        });
      }

      if (results.length < perPage) break;
    }

    const result = evaluate(accepted, {
      retroactive: true,
      source: "inat_historical_import"
    });

    window.dispatchEvent(new CustomEvent("gwAchievementImportDone", {
      detail: { username, imported: accepted.length, newlyAwarded: result.newlyAwarded.length }
    }));

    return { observations: accepted, ...result };
  }

  function injectStyles() {
    if (document.getElementById("gwAchievementStyles")) return;

    const style = document.createElement("style");
    style.id = "gwAchievementStyles";
    style.textContent = `
      .gw-ach-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99997;
        background: rgba(13,20,15,0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }

      .gw-ach-card {
        width: min(980px, 96vw);
        max-height: 92vh;
        overflow: hidden;
        border-radius: 26px;
        background: linear-gradient(180deg, rgba(52,73,46,0.98), rgba(24,35,25,0.99));
        border: 2px solid rgba(240,207,132,0.72);
        box-shadow: 0 24px 80px rgba(0,0,0,0.58);
        color: #fff7df;
        display: grid;
        grid-template-rows: auto auto 1fr;
      }

      .gw-ach-head {
        padding: 16px;
        border-bottom: 1px solid rgba(240,207,132,0.20);
      }

      .gw-ach-title {
        font-size: 24px;
        font-weight: 950;
        color: #ffe7a3;
      }

      .gw-ach-sub {
        margin-top: 4px;
        font-size: 12px;
        color: rgba(255,247,223,0.70);
      }

      .gw-ach-actions {
        display: flex;
        gap: 8px;
        padding: 10px 16px;
        border-bottom: 1px solid rgba(240,207,132,0.16);
        flex-wrap: wrap;
      }

      .gw-ach-grid {
        padding: 14px;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
        gap: 10px;
      }

      .gw-ach-tile {
        min-height: 132px;
        border-radius: 18px;
        border: 1px solid rgba(240,207,132,0.22);
        background: rgba(255,255,255,0.08);
        padding: 10px;
        cursor: pointer;
        text-align: left;
        color: inherit;
      }

      .gw-ach-tile.locked {
        filter: grayscale(1);
        opacity: 0.46;
      }

      .gw-ach-icon {
        font-size: 28px;
        margin-bottom: 8px;
      }

      .gw-ach-name {
        font-size: 13px;
        font-weight: 950;
        line-height: 1.15;
      }

      .gw-ach-meta {
        margin-top: 5px;
        font-size: 10px;
        color: rgba(255,247,223,0.62);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 900;
      }

      .gw-ach-progress {
        margin-top: 8px;
        height: 7px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(0,0,0,0.22);
      }

      .gw-ach-progress > span {
        display: block;
        height: 100%;
        background: #ffe082;
      }

      .gw-ach-detail {
        position: fixed;
        inset: 0;
        z-index: 99998;
        background: rgba(0,0,0,0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .gw-ach-detail-card {
        width: min(430px, 94vw);
        border-radius: 24px;
        padding: 18px;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        border: 2px solid rgba(255,224,130,0.72);
        color: #efe6d3;
      }

      .gw-ach-toast {
        position: fixed;
        left: 14px;
        right: 14px;
        top: calc(max(12px, env(safe-area-inset-top)) + 48px);
        z-index: 99999;
        border-radius: 18px;
        padding: 12px;
        background: linear-gradient(180deg, #ffe082, #d7b774);
        color: #21301f;
        font-weight: 950;
        box-shadow: 0 16px 44px rgba(0,0,0,0.35);
        animation: gwAchPop 220ms ease-out;
      }

      @keyframes gwAchPop {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
  }

  function openCodex() {
    injectStyles();
    evaluateCurrent({ source: "codex_open" });

    document.querySelectorAll(".gw-ach-backdrop").forEach(el => el.remove());

    const store = loadStore();
    const unlockedCount = Object.values(store).filter(x => x?.unlocked).length;

    const root = document.createElement("div");
    root.className = "gw-ach-backdrop";
    root.innerHTML = `
      <div class="gw-ach-card">
        <div class="gw-ach-head">
          <div class="gw-ach-title">Achievement Codex</div>
          <div class="gw-ach-sub">
            ${unlockedCount} / ${DEFINITIONS.length} revealed · lifetime account-wide accomplishments
          </div>
        </div>

        <div class="gw-ach-actions">
          <button class="gw-mini-btn" id="gwAchEvalBtn">Recalculate</button>
          <button class="gw-mini-btn" id="gwAchImportBtn">Import iNaturalist History</button>
          <button class="gw-mini-btn" id="gwAchCloseBtn">Close</button>
        </div>

        <div class="gw-ach-grid">
          ${DEFINITIONS.map(def => renderTile(def, store[def.id])).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(root);

    root.addEventListener("click", evt => {
      if (evt.target === root) root.remove();
    });

    root.querySelector("#gwAchCloseBtn").onclick = () => root.remove();
    root.querySelector("#gwAchEvalBtn").onclick = () => {
      evaluateCurrent({ source: "manual_recalculate" });
      root.remove();
      openCodex();
    };

    root.querySelector("#gwAchImportBtn").onclick = async () => {
      const btn = root.querySelector("#gwAchImportBtn");
      btn.disabled = true;
      btn.textContent = "Importing...";
      try {
        await importHistoricalINat(window.__gwUser?.username || "andrew2285");
        root.remove();
        openCodex();
      } catch (err) {
        console.warn(err);
        alert(err.message);
        btn.disabled = false;
        btn.textContent = "Import iNaturalist History";
      }
    };

    root.querySelectorAll(".gw-ach-tile").forEach(tile => {
      tile.addEventListener("click", () => openDetail(tile.dataset.achievementId));
    });
  }

  function renderTile(def, state) {
    const unlocked = !!state?.unlocked;
    const progress = Number(state?.progress || 0);
    const target = Number(state?.target || def.threshold || 1);
    const pct = Math.max(0, Math.min(100, (progress / target) * 100));

    const visibleName = def.hidden && !unlocked ? "Hidden achievement" : def.name;
    const visibleIcon = def.hidden && !unlocked ? "❔" : def.icon;

    return `
      <button class="gw-ach-tile ${unlocked ? "unlocked" : "locked"}" data-achievement-id="${esc(def.id)}">
        <div class="gw-ach-icon">${esc(visibleIcon)}</div>
        <div class="gw-ach-name">${esc(visibleName)}</div>
        <div class="gw-ach-meta">${esc(unlocked ? "Unlocked" : def.tier)} · ${esc(def.category)}</div>
        <div class="gw-ach-progress"><span style="width:${pct}%"></span></div>
      </button>
    `;
  }

  function openDetail(id) {
    const def = DEFINITIONS.find(d => d.id === id);
    if (!def) return;

    const state = loadStore()[id] || {};
    const unlocked = !!state.unlocked;
    const hiddenLocked = def.hidden && !unlocked;

    const root = document.createElement("div");
    root.className = "gw-ach-detail";
    root.innerHTML = `
      <div class="gw-ach-detail-card">
        <div style="font-size:44px;">${esc(hiddenLocked ? "❔" : def.icon)}</div>
        <div style="font-size:22px;font-weight:950;color:#ffe082;margin-top:8px;">
          ${esc(hiddenLocked ? "Hidden achievement" : def.name)}
        </div>
        <div class="gw-muted" style="color:rgba(239,230,211,0.68);margin-top:4px;">
          ${esc(def.category)} · ${esc(def.tier)}
        </div>

        <div style="margin-top:14px;line-height:1.4;">
          ${esc(hiddenLocked ? "This accomplishment is secret until unlocked." : def.description)}
        </div>

        <div style="margin-top:14px;font-size:12px;line-height:1.45;color:rgba(239,230,211,0.72);">
          <b>Status:</b> ${unlocked ? "Unlocked" : "Locked"}<br>
          <b>Progress:</b> ${Number(state.progress || 0)} / ${Number(state.target || def.threshold || 1)}<br>
          ${unlocked ? `<b>Achieved:</b> ${esc(new Date(state.achieved_at).toLocaleString())}<br>` : ""}
          ${state.achieved_where?.cellKey ? `<b>Grid square:</b> ${esc(state.achieved_where.cellKey)}<br>` : ""}
          ${def.reward?.title ? `<b>Title:</b> ${esc(def.reward.title)}<br>` : ""}
          <b>XP:</b> ${Number(def.reward?.xp || 0)}
        </div>

        <button class="gw-mini-btn" style="width:100%;margin-top:16px;" id="gwAchDetailClose">Close</button>
      </div>
    `;

    document.body.appendChild(root);
    root.querySelector("#gwAchDetailClose").onclick = () => root.remove();
    root.addEventListener("click", evt => {
      if (evt.target === root) root.remove();
    });
  }

  function showAwardToast(def, extraCount = 1) {
    injectStyles();

    const old = document.querySelector(".gw-ach-toast");
    old?.remove();

    const toast = document.createElement("div");
    toast.className = "gw-ach-toast";
    toast.innerHTML = `
      🏅 Achievement unlocked: ${esc(def.name)}
      ${extraCount > 1 ? `<span style="opacity:.75;"> +${extraCount - 1} more</span>` : ""}
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function getUnlockedCount() {
  return Object.values(loadStore()).filter(x => x?.unlocked).length;
}

function refreshAchievementSummary() {
  const el = document.getElementById("gwAchievementSummaryText");
  if (!el) return;

  el.textContent =
    `${getUnlockedCount()} accomplishments unlocked. Lifetime milestones, separate from quests.`;
}

  function renderButtonHtml() {
    const store = loadStore();
    const unlockedCount = Object.values(store).filter(x => x?.unlocked).length;

    return `
      <div class="gw-card">
        <div class="gw-card-title">Achievements</div>
        <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
          <span id="gwAchievementSummaryText">
                ${unlockedCount} accomplishments unlocked. Lifetime milestones, separate from quests.
            </span>
        </div>
        <button class="gw-mini-btn" id="gwAchievementCodexBtn">Achievement Codex</button>
      </div>
    `;
  }

  function bindButtons(root = document) {
    root.querySelector("#gwAchievementCodexBtn")?.addEventListener("click", openCodex);
  }

  window.GridWildAchievements = {
    DEFINITIONS,
    renderButtonHtml,
    bindButtons,
    openCodex,
    evaluateCurrent,
    evaluate,
    importHistoricalINat,
    getStore: loadStore,
    refreshAchievementSummary
  };

  window.addEventListener("gwRecentINatUpdated", () => {
    evaluateCurrent({ source: "recent_inat_update" });
  });

  window.addEventListener("gwDraftObservationsChanged", () => {
    evaluateCurrent({ source: "draft_observation_update" });
  });

  window.addEventListener("gwBootstrapReady", () => {
    setTimeout(() => evaluateCurrent({ source: "startup" }), 0);
  }, { once: true });
})();
