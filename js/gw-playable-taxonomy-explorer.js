// -----------------------------------------------------------------------------
// GridWild Playable Taxonomy Explorer
// Lightweight inspector for the curated playable endpoint backbone.
// -----------------------------------------------------------------------------

(function () {
  const GENERATED_TAXA_MANIFEST_URL =
    "assets/playable_taxonomy/generated_playable_taxa_manifest.json";
  const GENERATED_TAXA_CATALOG_URL = "assets/playable_taxonomy/generated_playable_taxa.json";
  const SCORED_TAXA_MANIFEST_URL = "assets/playable_taxonomy/scored_playable_taxa_manifest.json";
  const SCORED_TAXA_CATALOG_URL = "assets/playable_taxonomy/scored_playable_taxa.json";
  let selectedTaxonKey = "";
  let selectedGeneratedTaxonKey = "";
  let lowerTaxaActionFilter = "local";
  let lowerTaxaMinScore = "0";
  let lowerTaxaSort = "action-score";
  let generatedTaxaCatalog = null;
  let generatedTaxaCatalogPromise = null;
  let scoredTaxaCatalog = null;
  let scoredTaxaCatalogPromise = null;

  function api() {
    return window.GridWildPlayableTaxonomy || null;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function ensureStyles() {
    if (document.getElementById("gwPlayableTaxonomyExplorerStyles")) return;
    const style = document.createElement("style");
    style.id = "gwPlayableTaxonomyExplorerStyles";
    style.textContent = `
      .gw-taxonomy-explorer-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99996;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        background: rgba(9, 12, 10, 0.76);
      }

      .gw-taxonomy-explorer-modal {
        width: min(980px, 96vw);
        max-height: min(820px, 92vh);
        overflow: auto;
        border-radius: 24px;
        padding: 16px;
        box-sizing: border-box;
        color: #efe6d3;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(23,19,16,0.99));
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.56);
      }

      .gw-taxonomy-explorer-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        margin-bottom: 10px;
      }

      .gw-taxonomy-explorer-title {
        color: #f0d18a;
        font-size: 20px;
        font-weight: 950;
        line-height: 1.1;
      }

      .gw-taxonomy-explorer-source {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 24px;
        margin-top: 7px;
        padding: 4px 8px;
        box-sizing: border-box;
        border-radius: 999px;
        border: 1px solid rgba(215,183,116,0.26);
        color: #f0d18a;
        background: rgba(215,183,116,0.10);
        font-size: 10px;
        font-weight: 950;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-taxonomy-explorer-copy {
        color: rgba(239,230,211,0.68);
        font-size: 12px;
        line-height: 1.38;
        margin: 4px 0 12px;
        max-width: 820px;
      }

      .gw-taxonomy-load-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 7px;
        margin: 0 0 12px;
      }

      .gw-taxonomy-load-stat {
        min-width: 0;
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.15);
        background: rgba(255,255,255,0.05);
      }

      .gw-taxonomy-load-stat-value {
        display: block;
        color: #f4e8cf;
        font-size: 15px;
        font-weight: 950;
        line-height: 1.05;
        overflow-wrap: anywhere;
      }

      .gw-taxonomy-load-stat-label {
        display: block;
        margin-top: 4px;
        color: rgba(239,230,211,0.60);
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 0.06em;
        line-height: 1.15;
        text-transform: uppercase;
      }

      .gw-taxonomy-explorer-close {
        appearance: none;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.10);
        color: #efe6d3;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }

      .gw-taxonomy-explorer-controls {
        display: grid;
        grid-template-columns: minmax(170px, 1.2fr) minmax(128px, 0.7fr) minmax(146px, 0.8fr) minmax(160px, 0.9fr);
        gap: 8px;
        margin-bottom: 12px;
      }

      .gw-taxonomy-explorer-control {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .gw-taxonomy-explorer-label {
        color: #d7b774;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .gw-taxonomy-explorer-control input,
      .gw-taxonomy-explorer-control select {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.30);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        padding: 9px 10px;
        font: inherit;
        font-size: 12px;
        font-weight: 750;
      }

      .gw-taxonomy-explorer-body {
        display: grid;
        grid-template-columns: minmax(270px, 0.92fr) minmax(0, 1.08fr);
        gap: 12px;
        min-height: 420px;
      }

      .gw-taxonomy-explorer-list {
        display: grid;
        gap: 7px;
        align-content: start;
      }

      .gw-taxonomy-explorer-summary {
        color: rgba(239,230,211,0.62);
        font-size: 11px;
        line-height: 1.3;
        margin-bottom: 2px;
      }

      .gw-taxonomy-profile-row {
        appearance: none;
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.15);
        color: #efe6d3;
        background: rgba(255,255,255,0.055);
        text-align: left;
        cursor: pointer;
      }

      .gw-taxonomy-profile-row.is-selected {
        border-color: rgba(240,209,138,0.72);
        background:
          radial-gradient(circle at 0% 50%, rgba(255,224,130,0.16), transparent 44%),
          rgba(255,224,130,0.08);
        box-shadow: inset 0 0 0 1px rgba(255,224,130,0.18);
      }

      .gw-taxonomy-profile-name,
      .gw-taxonomy-profile-sub {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-taxonomy-profile-name {
        display: block;
        color: #f4e8cf;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.2;
      }

      .gw-taxonomy-profile-sub {
        display: block;
        margin-top: 3px;
        color: rgba(239,230,211,0.58);
        font-size: 11px;
        line-height: 1.2;
      }

      .gw-taxonomy-score-pill,
      .gw-taxonomy-rank-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        height: 26px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.32);
        color: #f0d18a;
        background: rgba(240,209,138,0.09);
        font-size: 11px;
        font-weight: 950;
        line-height: 1;
      }

      .gw-taxonomy-rank-pill {
        min-width: 0;
        height: 22px;
        color: rgba(239,230,211,0.78);
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.10);
      }

      .gw-taxonomy-detail {
        min-width: 0;
        border-radius: 16px;
        border: 1px solid rgba(215,183,116,0.16);
        background: rgba(0,0,0,0.14);
        padding: 12px;
        align-self: start;
      }

      .gw-taxonomy-detail-title {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        color: #f4e8cf;
        font-size: 18px;
        font-weight: 950;
        line-height: 1.14;
      }

      .gw-taxonomy-detail-sub {
        color: rgba(239,230,211,0.60);
        font-size: 11px;
        line-height: 1.35;
        margin-top: 4px;
      }

      .gw-taxonomy-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .gw-taxonomy-fact {
        min-width: 0;
        padding: 9px;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.12);
        background: rgba(255,255,255,0.045);
      }

      .gw-taxonomy-fact-label {
        color: rgba(239,230,211,0.58);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-bottom: 4px;
      }

      .gw-taxonomy-fact-value {
        color: #f4e8cf;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .gw-taxonomy-section {
        margin-top: 12px;
      }

      .gw-taxonomy-section-title {
        color: #d7b774;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .gw-taxonomy-body-copy {
        color: rgba(239,230,211,0.72);
        font-size: 12px;
        line-height: 1.42;
      }

      .gw-taxonomy-score-bars {
        display: grid;
        gap: 7px;
      }

      .gw-taxonomy-score-row {
        display: grid;
        grid-template-columns: minmax(92px, 0.46fr) minmax(0, 1fr) 36px;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: rgba(239,230,211,0.70);
      }

      .gw-taxonomy-score-track {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .gw-taxonomy-score-fill {
        display: block;
        width: var(--gw-score-width, 0%);
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(118,231,191,0.85), rgba(240,209,138,0.98));
      }

      .gw-taxonomy-notes {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .gw-taxonomy-empty {
        padding: 18px;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.12);
        color: rgba(239,230,211,0.64);
        background: rgba(255,255,255,0.045);
        font-size: 12px;
        line-height: 1.4;
      }

      .gw-taxonomy-hierarchy {
        display: grid;
        gap: 8px;
      }

      .gw-taxonomy-tree-node {
        min-width: 0;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.12);
        background: rgba(255,255,255,0.04);
      }

      .gw-taxonomy-tree-node[open] {
        background: rgba(255,255,255,0.055);
      }

      .gw-taxonomy-tree-node summary {
        min-width: 0;
        padding: 8px 9px;
        cursor: pointer;
        color: #f4e8cf;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.25;
      }

      .gw-taxonomy-tree-body {
        display: grid;
        gap: 6px;
        padding: 0 9px 9px 18px;
      }

      .gw-taxonomy-tree-line {
        color: rgba(239,230,211,0.64);
        font-size: 11px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .gw-taxonomy-tree-action {
        appearance: none;
        justify-self: start;
        min-height: 30px;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.32);
        color: #f0d18a;
        background: rgba(240,209,138,0.09);
        font: inherit;
        font-size: 11px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-taxonomy-tree-action:disabled {
        cursor: progress;
        opacity: 0.68;
      }

      .gw-taxonomy-tree-controls {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        margin: 8px 0;
      }

      .gw-taxonomy-tree-controls select {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-radius: 10px;
        border: 1px solid rgba(215,183,116,0.26);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        padding: 7px 8px;
        font: inherit;
        font-size: 11px;
      }

      .gw-taxonomy-generated-list {
        display: grid;
        gap: 5px;
      }

      .gw-taxonomy-generated-row {
        appearance: none;
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 7px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.10);
        color: rgba(239,230,211,0.82);
        background: rgba(0,0,0,0.12);
        text-align: left;
        font: inherit;
        font-size: 11px;
        cursor: pointer;
      }

      .gw-taxonomy-generated-row-meta {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        flex-wrap: wrap;
      }

      .gw-taxonomy-generated-row.is-selected {
        border-color: rgba(240,209,138,0.58);
        color: #f4e8cf;
        background: rgba(240,209,138,0.10);
      }

      .gw-taxonomy-generated-name,
      .gw-taxonomy-generated-sub {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-taxonomy-generated-name {
        font-weight: 900;
      }

      .gw-taxonomy-generated-sub {
        margin-top: 2px;
        color: rgba(239,230,211,0.54);
        font-size: 10px;
      }

      @media (max-width: 760px) {
        .gw-taxonomy-explorer-modal {
          width: 96vw;
          padding: 14px;
        }

        .gw-taxonomy-explorer-controls,
        .gw-taxonomy-load-stats,
        .gw-taxonomy-explorer-body,
        .gw-taxonomy-tree-controls,
        .gw-taxonomy-detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .gw-taxonomy-explorer-body {
          min-height: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function numberLabel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }

  function countLabel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  }

  function rankLabel(rank) {
    return api()?.displayRank?.(rank) || String(rank || "");
  }

  function modeLabel(mode) {
    return api()?.endpointModeLabel?.(mode) || String(mode || "");
  }

  function endpointLabel(profile, key) {
    const rank = profile?.[`${key}EndpointRank`];
    const alts = profile?.[`${key}EndpointAlternatives`] || [];
    return api()?.formatEndpointRanks?.(rank, alts) || rankLabel(rank);
  }

  function uniqueBeginnerRanks(profiles) {
    const seen = new Set(profiles.map((profile) => profile.beginnerEndpointRank));
    return (api()?.ranks || []).filter((rank) => seen.has(rank));
  }

  function uniqueModes(profiles) {
    const seen = new Set(profiles.map((profile) => profile.speciesMode));
    return (api()?.endpointModes || []).filter((mode) => seen.has(mode));
  }

  function profileSearchText(profile) {
    return [
      profile.taxonKey,
      profile.displayName,
      profile.broadParentGroup,
      profile.beginnerEndpointRank,
      profile.speciesMode,
      ...(profile.aliases || []),
      ...(profile.notesFlags || [])
    ]
      .join(" ")
      .toLowerCase();
  }

  function readState(root) {
    return {
      query: root.querySelector("#gwTaxonomyExplorerSearch")?.value.trim().toLowerCase() || "",
      rank: root.querySelector("#gwTaxonomyExplorerRank")?.value || "all",
      mode: root.querySelector("#gwTaxonomyExplorerMode")?.value || "all",
      sort: root.querySelector("#gwTaxonomyExplorerSort")?.value || "score-desc"
    };
  }

  function filterProfiles(profiles, state) {
    const rows = profiles.filter((profile) => {
      if (state.query && !profileSearchText(profile).includes(state.query)) return false;
      if (state.rank !== "all" && profile.beginnerEndpointRank !== state.rank) return false;
      if (state.mode !== "all" && profile.speciesMode !== state.mode) return false;
      return true;
    });

    rows.sort((a, b) => {
      if (state.sort === "score-asc") {
        return a.beginnerPlayabilityScore - b.beginnerPlayabilityScore;
      }
      if (state.sort === "name-asc") {
        return a.displayName.localeCompare(b.displayName);
      }
      if (state.sort === "rank-broad") {
        return api().compareRanks(a.beginnerEndpointRank, b.beginnerEndpointRank);
      }
      if (state.sort === "rank-specific") {
        return api().compareRanks(b.beginnerEndpointRank, a.beginnerEndpointRank);
      }
      return b.beginnerPlayabilityScore - a.beginnerPlayabilityScore;
    });

    return rows;
  }

  function renderControls(profiles) {
    const ranks = uniqueBeginnerRanks(profiles);
    const modes = uniqueModes(profiles);
    return `
      <div class="gw-taxonomy-explorer-controls">
        <label class="gw-taxonomy-explorer-control">
          <span class="gw-taxonomy-explorer-label">Search</span>
          <input id="gwTaxonomyExplorerSearch" type="search" placeholder="Birds, Diptera, fungi...">
        </label>

        <label class="gw-taxonomy-explorer-control">
          <span class="gw-taxonomy-explorer-label">Beginner Rank</span>
          <select id="gwTaxonomyExplorerRank">
            <option value="all">All ranks</option>
            ${ranks.map((rank) => `<option value="${esc(rank)}">${esc(rankLabel(rank))}</option>`).join("")}
          </select>
        </label>

        <label class="gw-taxonomy-explorer-control">
          <span class="gw-taxonomy-explorer-label">Species Mode</span>
          <select id="gwTaxonomyExplorerMode">
            <option value="all">All modes</option>
            ${modes.map((mode) => `<option value="${esc(mode)}">${esc(modeLabel(mode))}</option>`).join("")}
          </select>
        </label>

        <label class="gw-taxonomy-explorer-control">
          <span class="gw-taxonomy-explorer-label">Sort</span>
          <select id="gwTaxonomyExplorerSort">
            <option value="score-desc">Score high to low</option>
            <option value="score-asc">Score low to high</option>
            <option value="name-asc">Name A to Z</option>
            <option value="rank-broad">Rank broad first</option>
            <option value="rank-specific">Rank specific first</option>
          </select>
        </label>
      </div>
    `;
  }

  function sourceKindLabel(source) {
    if (!source?.source) return "seed";
    if (source.source === "artifact") return "artifact";
    if (source.source === "provided") return "provided";
    return source.source;
  }

  function renderSourceBadge(source) {
    const version = source?.playableTaxonomyVersion || "playable-taxonomy-seed";
    const kind = sourceKindLabel(source);
    const loadedAt = source?.loadedAt ? ` / loaded ${source.loadedAt}` : "";
    const title = `Taxonomy ${version} / ${kind}${source?.url ? ` / ${source.url}` : ""}${loadedAt}`;
    return `<div class="gw-taxonomy-explorer-source" title="${esc(title)}">Taxonomy: ${esc(version)} (${esc(kind)})</div>`;
  }

  function uniqueCount(values) {
    return new Set(
      values
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ).size;
  }

  function loadStats(profiles) {
    const anchors = profiles.flatMap((profile) => profile.gbif?.anchors || []);
    const hydratedProfiles = profiles.filter((profile) =>
      ["matched", "partial"].includes(profile.gbif?.hydrationStatus)
    );
    const acceptedTaxonKeys = uniqueCount(anchors.map((anchor) => anchor.acceptedTaxonKey));
    const aliasTerms = uniqueCount(profiles.flatMap((profile) => profile.aliases || []));

    return {
      playableGroups: profiles.length,
      hydratedProfiles: hydratedProfiles.length,
      gbifAnchors: anchors.length,
      acceptedTaxonKeys,
      aliasTerms
    };
  }

  function renderLoadStat(label, value, title) {
    return `
      <div class="gw-taxonomy-load-stat" title="${esc(title || `${label}: ${value}`)}">
        <span class="gw-taxonomy-load-stat-value">${esc(value)}</span>
        <span class="gw-taxonomy-load-stat-label">${esc(label)}</span>
      </div>
    `;
  }

  async function loadGeneratedTaxaManifest() {
    if (typeof window.fetch !== "function") return null;
    try {
      const resp = await window.fetch(GENERATED_TAXA_MANIFEST_URL, {
        headers: { accept: "application/json" }
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  }

  async function loadScoredTaxaManifest() {
    if (typeof window.fetch !== "function") return null;
    try {
      const resp = await window.fetch(SCORED_TAXA_MANIFEST_URL, {
        headers: { accept: "application/json" }
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  }

  async function loadGeneratedTaxaCatalog() {
    if (generatedTaxaCatalog) return generatedTaxaCatalog;
    if (generatedTaxaCatalogPromise) return generatedTaxaCatalogPromise;
    if (typeof window.fetch !== "function") return null;

    generatedTaxaCatalogPromise = window
      .fetch(GENERATED_TAXA_CATALOG_URL, { headers: { accept: "application/json" } })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((payload) => {
        generatedTaxaCatalog = payload;
        return generatedTaxaCatalog;
      })
      .catch((err) => {
        console.warn("Generated playable taxa catalog unavailable.", err);
        return null;
      })
      .finally(() => {
        generatedTaxaCatalogPromise = null;
      });

    return generatedTaxaCatalogPromise;
  }

  async function loadScoredTaxaCatalog() {
    if (scoredTaxaCatalog) return scoredTaxaCatalog;
    if (scoredTaxaCatalogPromise) return scoredTaxaCatalogPromise;
    if (typeof window.fetch !== "function") return null;

    scoredTaxaCatalogPromise = window
      .fetch(SCORED_TAXA_CATALOG_URL, { headers: { accept: "application/json" } })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((payload) => {
        scoredTaxaCatalog = payload;
        return scoredTaxaCatalog;
      })
      .catch((err) => {
        console.warn("Scored playable taxa catalog unavailable.", err);
        return null;
      })
      .finally(() => {
        scoredTaxaCatalogPromise = null;
      });

    return scoredTaxaCatalogPromise;
  }

  function generatedTaxaLabel(manifest) {
    const count = manifest?.summary?.taxon_count;
    return Number.isFinite(Number(count)) ? countLabel(count) : "Not built";
  }

  function scoredTaxaLabel(manifest) {
    const count = manifest?.summary?.taxon_count;
    return Number.isFinite(Number(count)) ? countLabel(count) : "Not built";
  }

  function generatedCommonNameLabel(manifest) {
    const count = manifest?.summary?.common_name_count;
    if (Number.isFinite(Number(count))) return countLabel(count);
    return manifest?.summary?.taxon_count ? "Rerun" : "Not built";
  }

  function scoredKeepLabel(manifest) {
    const keep = Number(manifest?.summary?.keep_count);
    const collapse = Number(manifest?.summary?.collapse_count);
    const developer = Number(manifest?.summary?.developer_only_count);
    if (![keep, collapse, developer].some(Number.isFinite)) return "Not built";
    return `${countLabel(keep || 0)} / ${countLabel(collapse || 0)} / ${countLabel(developer || 0)}`;
  }

  function renderLoadStats(profiles, generatedTaxaManifest, scoredTaxaManifest) {
    const stats = loadStats(profiles);
    return `
      <div class="gw-taxonomy-load-stats" aria-label="Loaded taxonomy stats">
        ${renderLoadStat("Playable groups", countLabel(stats.playableGroups), "Current playable endpoint profiles. GBIF hydration has not expanded this into generated child taxa yet.")}
        ${renderLoadStat("Generated taxa", generatedTaxaLabel(generatedTaxaManifest), "Expanded descendant playable taxa from generated_playable_taxa_manifest.json. Run npm.cmd run generate:playable-taxa to build this.")}
        ${renderLoadStat("Scored taxa", scoredTaxaLabel(scoredTaxaManifest), "Lower taxa scored with local occurrence evidence from scored_playable_taxa_manifest.json.")}
        ${renderLoadStat("Keep / Collapse / Dev", scoredKeepLabel(scoredTaxaManifest), "Draft Gold Lake local filter counts: beginner keep, collapse to broader rank, and developer-only.")}
        ${renderLoadStat("Common names", generatedCommonNameLabel(generatedTaxaManifest), "Generated taxa with a GBIF vernacular/common name. If this says Rerun, regenerate playable taxa with the updated generator.")}
        ${renderLoadStat("Hydrated", `${countLabel(stats.hydratedProfiles)}/${countLabel(stats.playableGroups)}`, "Playable groups with GBIF Backbone matches.")}
        ${renderLoadStat("GBIF anchors", countLabel(stats.gbifAnchors), "Canonical GBIF clade/family anchors joined to playable groups.")}
        ${renderLoadStat("GBIF keys", countLabel(stats.acceptedTaxonKeys), "Unique accepted GBIF taxon keys represented by the loaded artifact.")}
        ${renderLoadStat("Alias terms", countLabel(stats.aliasTerms), "Unique lookup/search aliases loaded from seed policy plus GBIF vernacular names and lineages.")}
      </div>
    `;
  }

  function generatedTaxaForProfile(profileKey) {
    if (!generatedTaxaCatalog?.taxa) return [];
    return generatedTaxaCatalog.taxa.filter((taxon) => taxon.playableGroupKey === profileKey);
  }

  function scoredTaxaForProfile(profileKey) {
    if (!scoredTaxaCatalog?.taxa) return [];
    return scoredTaxaCatalog.taxa.filter((taxon) => taxon.playableGroupKey === profileKey);
  }

  function lowerTaxaForProfile(profileKey) {
    const scored = scoredTaxaForProfile(profileKey);
    if (scored.length) return scored;
    return generatedTaxaForProfile(profileKey);
  }

  function generatedProfileStat(profile, generatedTaxaManifest) {
    return (generatedTaxaManifest?.profile_stats || []).find(
      (stat) => stat.playableGroupKey === profile.taxonKey
    );
  }

  function scoredProfileStat(profile, scoredTaxaManifest) {
    return (scoredTaxaManifest?.summary?.profile_stats || []).find(
      (stat) => stat.playableGroupKey === profile.taxonKey
    );
  }

  function lowerTaxaAction(taxon) {
    return taxon?.goldLakeAction?.mode || null;
  }

  function lowerTaxaScore(taxon) {
    const score = Number(taxon?.individualPlayabilityScore ?? taxon?.beginnerPlayabilityScore);
    return Number.isFinite(score) ? score : null;
  }

  function actionLabel(action) {
    if (action === "developer_only") return "developer";
    if (action === "keep") return "keep";
    if (action === "collapse") return "collapse";
    if (action === "drop") return "drop";
    return action || "candidate";
  }

  function actionSortValue(action) {
    if (action === "keep") return 0;
    if (action === "collapse") return 1;
    if (action === "developer_only") return 2;
    if (action === "drop") return 3;
    return 4;
  }

  function filterLowerTaxa(taxa) {
    const minScore = Math.max(0, Number(lowerTaxaMinScore) || 0);
    const rows = taxa.filter((taxon) => {
      const action = lowerTaxaAction(taxon);
      const score = lowerTaxaScore(taxon);
      if (score != null && score < minScore) return false;
      if (!action || lowerTaxaActionFilter === "all") return true;
      if (lowerTaxaActionFilter === "local") {
        return action === "keep" || action === "collapse" || action === "developer_only";
      }
      return action === lowerTaxaActionFilter;
    });

    rows.sort((a, b) => {
      const scoreA = lowerTaxaScore(a) ?? -1;
      const scoreB = lowerTaxaScore(b) ?? -1;
      if (lowerTaxaSort === "name") {
        return String(a.displayName || a.canonicalName || "").localeCompare(
          String(b.displayName || b.canonicalName || "")
        );
      }
      if (lowerTaxaSort === "score-asc") return scoreA - scoreB;
      if (lowerTaxaSort === "action-score") {
        return (
          actionSortValue(lowerTaxaAction(a)) - actionSortValue(lowerTaxaAction(b)) ||
          scoreB - scoreA
        );
      }
      return scoreB - scoreA;
    });

    return rows;
  }

  function lineageText(taxon) {
    return [
      taxon?.lineage?.kingdom,
      taxon?.lineage?.phylum,
      taxon?.lineage?.class,
      taxon?.lineage?.order,
      taxon?.lineage?.family,
      taxon?.lineage?.genus
    ]
      .filter(Boolean)
      .join(" / ");
  }

  function anchorLineageText(anchor) {
    return (anchor?.lineage || []).filter(Boolean).join(" / ");
  }

  function groupTaxaByLineage(taxa) {
    const groups = new Map();
    taxa.forEach((taxon) => {
      const primary =
        taxon?.lineage?.order ||
        taxon?.lineage?.class ||
        taxon?.lineage?.phylum ||
        taxon?.broadParentGroup ||
        "Unplaced";
      const secondary =
        taxon?.lineage?.family ||
        taxon?.lineage?.genus ||
        taxon?.anchor?.name ||
        taxon?.rank ||
        "Unplaced";
      const primaryKey = String(primary);
      const secondaryKey = String(secondary);
      if (!groups.has(primaryKey)) {
        groups.set(primaryKey, {
          label: primaryKey,
          count: 0,
          children: new Map()
        });
      }
      const group = groups.get(primaryKey);
      group.count += 1;
      if (!group.children.has(secondaryKey)) {
        group.children.set(secondaryKey, {
          label: secondaryKey,
          count: 0,
          taxa: []
        });
      }
      const child = group.children.get(secondaryKey);
      child.count += 1;
      child.taxa.push(taxon);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        children: Array.from(group.children.values()).sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);
  }

  function generatedTaxonDetail(taxa) {
    const selected =
      taxa.find((taxon) => taxon.playableTaxonKey === selectedGeneratedTaxonKey) || null;
    if (!selected) return "";
    const score = lowerTaxaScore(selected);
    const action = lowerTaxaAction(selected);
    const evidence = selected.occurrenceEvidence || null;
    const scoreComponents = selected.scoreComponents || null;

    return `
      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Selected Lower Taxon</div>
        <div class="gw-taxonomy-detail-grid">
          ${renderFact("Common name", selected.commonName || "Not available")}
          ${renderFact("Scientific name", selected.scientificDisplayName || selected.canonicalName || selected.scientificName)}
          ${renderFact("Rank", rankLabel(selected.rank))}
          ${renderFact("GBIF key", selected.acceptedTaxonKey || selected.taxonKey)}
          ${renderFact("Candidate", selected.candidateStatus)}
          ${renderFact("Playability", score ?? "Not scored")}
          ${renderFact("Local action", actionLabel(action))}
          ${renderFact("Occurrences", evidence?.occurrenceCount ?? "Not scored")}
          ${renderFact("Occupied cells", evidence?.occupiedCellCount ?? "Not scored")}
          ${renderFact("Observers", evidence?.observerCount ?? "Not scored")}
          ${renderFact("Score basis", selected.playabilityScoreBasis || "inherited_playable_group")}
        </div>
        <div class="gw-taxonomy-body-copy" style="margin-top:8px;">${esc(lineageText(selected))}</div>
        ${
          scoreComponents
            ? `<div class="gw-taxonomy-score-bars" style="margin-top:10px;">
                ${renderScoreRow("Identifiability", scoreComponents.identifiability)}
                ${renderScoreRow("Observability", scoreComponents.observability)}
                ${renderScoreRow("Local data", scoreComponents.localDataSupport)}
                ${renderScoreRow("Validation", scoreComponents.validationReliability)}
                ${renderScoreRow("Distinctiveness", scoreComponents.distinctiveness)}
              </div>`
            : ""
        }
      </div>
    `;
  }

  function renderGeneratedRows(taxa, maxRows = 12) {
    return taxa
      .slice(0, maxRows)
      .map((taxon) => {
        const key = taxon.playableTaxonKey;
        const selected = key === selectedGeneratedTaxonKey;
        const scientificName =
          taxon.scientificDisplayName || taxon.canonicalName || taxon.scientificName || "";
        const displayName = taxon.commonName || taxon.displayName || scientificName;
        const sub = taxon.commonName
          ? `${scientificName} / ${rankLabel(taxon.rank)} / ${lineageText(taxon) || "No lineage"}`
          : `${rankLabel(taxon.rank)} / ${lineageText(taxon) || "No lineage"}`;
        const action = lowerTaxaAction(taxon);
        const score = lowerTaxaScore(taxon);
        return `
          <button class="gw-taxonomy-generated-row ${selected ? "is-selected" : ""}" type="button" data-gw-taxonomy-generated-taxon="${esc(key)}">
            <span style="min-width:0;">
              <span class="gw-taxonomy-generated-name">${esc(displayName)}</span>
              <span class="gw-taxonomy-generated-sub">${esc(sub)}</span>
            </span>
            <span class="gw-taxonomy-generated-row-meta">
              ${score != null ? `<span class="gw-taxonomy-score-pill">${esc(numberLabel(score))}</span>` : ""}
              <span class="gw-taxonomy-rank-pill">${esc(actionLabel(action || taxon.candidateStatus))}</span>
            </span>
          </button>
        `;
      })
      .join("");
  }

  function renderLowerTaxaControls(isScored) {
    if (!isScored) return "";
    const option = (value, label) =>
      `<option value="${esc(value)}" ${lowerTaxaActionFilter === value ? "selected" : ""}>${esc(label)}</option>`;
    const scoreOption = (value, label) =>
      `<option value="${esc(value)}" ${lowerTaxaMinScore === String(value) ? "selected" : ""}>${esc(label)}</option>`;
    const sortOption = (value, label) =>
      `<option value="${esc(value)}" ${lowerTaxaSort === value ? "selected" : ""}>${esc(label)}</option>`;
    return `
      <div class="gw-taxonomy-tree-controls">
        <select id="gwTaxonomyLowerAction" aria-label="Lower taxon local action filter">
          ${option("local", "Local served")}
          ${option("keep", "Beginner keep")}
          ${option("collapse", "Collapse")}
          ${option("developer_only", "Developer")}
          ${option("drop", "Drop")}
          ${option("all", "All actions")}
        </select>
        <select id="gwTaxonomyLowerMinScore" aria-label="Lower taxon minimum score">
          ${scoreOption("0", "Score 0+")}
          ${scoreOption("40", "Score 40+")}
          ${scoreOption("58", "Score 58+")}
          ${scoreOption("70", "Score 70+")}
        </select>
        <select id="gwTaxonomyLowerSort" aria-label="Lower taxon sort">
          ${sortOption("action-score", "Action then score")}
          ${sortOption("score-desc", "Score high first")}
          ${sortOption("score-asc", "Score low first")}
          ${sortOption("name", "Name A to Z")}
        </select>
      </div>
    `;
  }

  function renderGeneratedTree(profile, generatedTaxaManifest, scoredTaxaManifest) {
    const allTaxa = lowerTaxaForProfile(profile.taxonKey);
    const taxa = filterLowerTaxa(allTaxa);
    const stat = generatedProfileStat(profile, generatedTaxaManifest);
    const scoredStat = scoredProfileStat(profile, scoredTaxaManifest);
    const hasScoredManifest = Number.isFinite(Number(scoredTaxaManifest?.summary?.taxon_count));
    const isScored = Boolean(scoredTaxaCatalog?.taxa);
    const expectedCount = scoredStat?.taxonCount || stat?.generatedTaxonCount || 0;
    const loadedCatalog = isScored || Boolean(generatedTaxaCatalog);

    if (!loadedCatalog) {
      if (!expectedCount) {
        return `
          <div class="gw-taxonomy-empty">
            No generated descendant taxa are available for this playable group.
          </div>
        `;
      }
      return `
        <button class="gw-taxonomy-tree-action" type="button" data-gw-taxonomy-load-${hasScoredManifest ? "scored" : "generated"}="1">
          Load ${esc(countLabel(expectedCount))} ${hasScoredManifest ? "scored" : "generated"} taxa
        </button>
        <div class="gw-taxonomy-tree-line">
          ${
            hasScoredManifest
              ? `${esc(countLabel(scoredStat?.keepCount || 0))} keep / ${esc(countLabel(scoredStat?.collapseCount || 0))} collapse / ${esc(countLabel(scoredStat?.developerOnlyCount || 0))} developer`
              : `${esc(countLabel(stat?.readyTaxonCount || expectedCount))} candidates`
          } at ${esc(rankLabel(stat?.endpointRank || profile.beginnerEndpointRank))}${stat?.needsLocalFilter ? " / needs local filter" : ""}
        </div>
      `;
    }

    if (!allTaxa.length) {
      return `
        <div class="gw-taxonomy-empty">
          Lower taxon catalog is loaded, but this playable group has no descendants.
        </div>
      `;
    }

    if (!taxa.length) {
      return `
        ${renderLowerTaxaControls(isScored)}
        <div class="gw-taxonomy-empty">
          No lower taxa match the current local filter.
        </div>
      `;
    }

    const groups = groupTaxaByLineage(taxa).slice(0, 8);
    return `
      <div class="gw-taxonomy-tree-line">
        ${esc(countLabel(taxa.length))} of ${esc(countLabel(allTaxa.length))} ${isScored ? "scored local" : "generated"} descendants at ${esc(rankLabel(stat?.endpointRank || profile.beginnerEndpointRank))}${stat?.needsLocalFilter ? " / needs local filter" : ""}
      </div>
      ${renderLowerTaxaControls(isScored)}
      ${generatedTaxonDetail(taxa)}
      <div class="gw-taxonomy-generated-list">
        ${groups
          .map(
            (group, groupIndex) => `
              <details class="gw-taxonomy-tree-node" ${groupIndex < 2 ? "open" : ""}>
                <summary>${esc(group.label)} / ${esc(countLabel(group.count))}</summary>
                <div class="gw-taxonomy-tree-body">
                  ${group.children
                    .slice(0, 6)
                    .map(
                      (child, childIndex) => `
                        <details class="gw-taxonomy-tree-node" ${childIndex === 0 ? "open" : ""}>
                          <summary>${esc(child.label)} / ${esc(countLabel(child.count))}</summary>
                          <div class="gw-taxonomy-tree-body">
                            ${renderGeneratedRows(child.taxa)}
                          </div>
                        </details>
                      `
                    )
                    .join("")}
                </div>
              </details>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderTaxonomyHierarchy(profile, generatedTaxaManifest, scoredTaxaManifest) {
    const anchors = profile.gbif?.anchors || [];
    return `
      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Hierarchy</div>
        <div class="gw-taxonomy-hierarchy">
          <details class="gw-taxonomy-tree-node" open>
            <summary>${esc(profile.displayName)} / ${esc(rankLabel(profile.beginnerEndpointRank))}</summary>
            <div class="gw-taxonomy-tree-body">
              <div class="gw-taxonomy-tree-line">
                ${esc(profile.broadParentGroup)} / ${esc(modeLabel(profile.speciesMode))} / ${esc(profile.gbif?.hydrationStatus || "seed")}
              </div>
              ${anchors
                .map(
                  (anchor) => `
                    <details class="gw-taxonomy-tree-node" open>
                      <summary>${esc(anchor.canonicalName || anchor.queryName)} / ${esc(rankLabel(anchor.rank || anchor.queryRank))}</summary>
                      <div class="gw-taxonomy-tree-body">
                        <div class="gw-taxonomy-tree-line">${esc(anchorLineageText(anchor) || "No GBIF lineage")}</div>
                        <div class="gw-taxonomy-tree-line">GBIF ${esc(anchor.acceptedTaxonKey || anchor.matchedTaxonKey || "unknown")} / ${esc(anchor.anchorKind || "anchor")}</div>
                      </div>
                    </details>
                  `
                )
                .join("")}
              <details class="gw-taxonomy-tree-node" open>
                <summary>${scoredTaxaManifest ? "Scored local descendants" : "Generated descendants"}</summary>
                <div class="gw-taxonomy-tree-body">
                  ${renderGeneratedTree(profile, generatedTaxaManifest, scoredTaxaManifest)}
                </div>
              </details>
            </div>
          </details>
        </div>
      </div>
    `;
  }

  function renderProfileRows(rows) {
    if (!rows.length) {
      return `<div class="gw-taxonomy-empty">No endpoint profiles match these filters.</div>`;
    }

    return rows
      .map((profile) => {
        const selected = profile.taxonKey === selectedTaxonKey;
        return `
          <button class="gw-taxonomy-profile-row ${selected ? "is-selected" : ""}" type="button" data-gw-taxonomy-profile="${esc(profile.taxonKey)}">
            <span style="min-width:0;">
              <span class="gw-taxonomy-profile-name">${esc(profile.displayName)}</span>
              <span class="gw-taxonomy-profile-sub">
                ${esc(profile.broadParentGroup)} / beginner ${esc(rankLabel(profile.beginnerEndpointRank))} / ${esc(modeLabel(profile.speciesMode))}
              </span>
            </span>
            <span class="gw-taxonomy-score-pill">${esc(numberLabel(profile.beginnerPlayabilityScore))}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderFact(label, value) {
    return `
      <div class="gw-taxonomy-fact">
        <div class="gw-taxonomy-fact-label">${esc(label)}</div>
        <div class="gw-taxonomy-fact-value">${esc(value)}</div>
      </div>
    `;
  }

  function renderScoreRow(label, value) {
    const score = Math.max(0, Math.min(100, Number(value) || 0));
    return `
      <div class="gw-taxonomy-score-row">
        <span>${esc(label)}</span>
        <span class="gw-taxonomy-score-track">
          <span class="gw-taxonomy-score-fill" style="--gw-score-width:${score}%;"></span>
        </span>
        <span>${esc(numberLabel(score))}</span>
      </div>
    `;
  }

  function renderStats(stats) {
    if (!stats) {
      return `
        <div class="gw-taxonomy-body-copy">
          iNaturalist-derived regional stats are not populated in this vertical slice.
        </div>
      `;
    }

    return `
      <div class="gw-taxonomy-detail-grid">
        ${renderFact("Observations", stats.observationCount ?? "Unknown")}
        ${renderFact("Local Observations", stats.localObservationCount ?? "Unknown")}
        ${renderFact("Research Grade", stats.researchGradeRatio ?? "Unknown")}
        ${renderFact("Observers", stats.observerCount ?? "Unknown")}
        ${renderFact("Identifiers", stats.identifierCount ?? "Unknown")}
        ${renderFact("Median Rank", stats.medianConsensusRank ? rankLabel(stats.medianConsensusRank) : "Unknown")}
        ${renderFact("Disagreement", stats.disagreementRate ?? "Unknown")}
        ${renderFact("Updated", stats.lastUpdated || "Unknown")}
      </div>
    `;
  }

  function renderDetail(profile, generatedTaxaManifest, scoredTaxaManifest) {
    if (!profile) {
      return `<div class="gw-taxonomy-empty">Select a taxon group to inspect its beginner endpoint profile.</div>`;
    }

    return `
      <div class="gw-taxonomy-detail-title">
        <span>${esc(profile.displayName)}</span>
        <span class="gw-taxonomy-score-pill">${esc(numberLabel(profile.beginnerPlayabilityScore))}</span>
      </div>
      <div class="gw-taxonomy-detail-sub">
        ${esc(profile.broadParentGroup)} / ${esc(profile.source)} / ${profile.iNaturalistTaxonId ? `iNat ${esc(profile.iNaturalistTaxonId)}` : "iNat taxon id not set"}
      </div>

      <div class="gw-taxonomy-detail-grid">
        ${renderFact("Beginner endpoint", endpointLabel(profile, "beginner"))}
        ${renderFact("Developer endpoint", endpointLabel(profile, "developer"))}
        ${renderFact("Expert endpoint", endpointLabel(profile, "expert"))}
        ${renderFact("Minimum confidence", rankLabel(profile.minimumConfidenceRank))}
        ${renderFact("Species mode", modeLabel(profile.speciesMode))}
        ${renderFact("Taxon key", profile.taxonKey)}
      </div>

      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Score Components</div>
        <div class="gw-taxonomy-score-bars">
          ${renderScoreRow("Identifiability", profile.metrics.identifiability)}
          ${renderScoreRow("Observability", profile.metrics.observability)}
          ${renderScoreRow("Local data", profile.metrics.localDataSupport)}
          ${renderScoreRow("Validation", profile.metrics.validationReliability)}
          ${renderScoreRow("Distinctiveness", profile.metrics.distinctiveness)}
        </div>
      </div>

      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Rationale</div>
        <div class="gw-taxonomy-body-copy">${esc(profile.rationale)}</div>
      </div>

      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Beginner Quest Language</div>
        <div class="gw-taxonomy-body-copy">${esc(api().getQuestLanguageForEndpoint(profile))}</div>
      </div>

      ${renderTaxonomyHierarchy(profile, generatedTaxaManifest, scoredTaxaManifest)}

      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">iNaturalist Stats Placeholder</div>
        ${renderStats(profile.iNaturalistStats)}
      </div>

      <div class="gw-taxonomy-section">
        <div class="gw-taxonomy-section-title">Notes / Flags</div>
        <div class="gw-taxonomy-notes">
          ${(profile.notesFlags || []).map((flag) => `<span class="gw-taxonomy-rank-pill">${esc(flag)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest) {
    const state = readState(root);
    const rows = filterProfiles(profiles, state);
    if (!rows.some((profile) => profile.taxonKey === selectedTaxonKey)) {
      selectedTaxonKey = rows[0]?.taxonKey || "";
      selectedGeneratedTaxonKey = "";
    }

    const list = root.querySelector("#gwTaxonomyExplorerList");
    const detail = root.querySelector("#gwTaxonomyExplorerDetail");
    const summary = root.querySelector("#gwTaxonomyExplorerSummary");
    const selected = rows.find((profile) => profile.taxonKey === selectedTaxonKey) || null;

    if (summary) {
      summary.textContent = `${rows.length} of ${profiles.length} endpoint profiles shown`;
    }
    if (list) {
      list.innerHTML = renderProfileRows(rows);
      list.querySelectorAll("[data-gw-taxonomy-profile]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedTaxonKey = button.dataset.gwTaxonomyProfile || "";
          selectedGeneratedTaxonKey = "";
          renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
        });
      });
    }
    if (detail) {
      detail.innerHTML = renderDetail(selected, generatedTaxaManifest, scoredTaxaManifest);
      detail
        .querySelector("[data-gw-taxonomy-load-generated]")
        ?.addEventListener("click", async (evt) => {
          const button = evt.currentTarget;
          button.disabled = true;
          button.textContent = "Loading generated taxa...";
          await loadGeneratedTaxaCatalog();
          renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
        });
      detail
        .querySelector("[data-gw-taxonomy-load-scored]")
        ?.addEventListener("click", async (evt) => {
          const button = evt.currentTarget;
          button.disabled = true;
          button.textContent = "Loading scored taxa...";
          await loadScoredTaxaCatalog();
          renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
        });
      detail.querySelector("#gwTaxonomyLowerAction")?.addEventListener("change", (evt) => {
        lowerTaxaActionFilter = evt.currentTarget.value || "local";
        selectedGeneratedTaxonKey = "";
        renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
      });
      detail.querySelector("#gwTaxonomyLowerMinScore")?.addEventListener("change", (evt) => {
        lowerTaxaMinScore = evt.currentTarget.value || "0";
        selectedGeneratedTaxonKey = "";
        renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
      });
      detail.querySelector("#gwTaxonomyLowerSort")?.addEventListener("change", (evt) => {
        lowerTaxaSort = evt.currentTarget.value || "action-score";
        renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
      });
      detail.querySelectorAll("[data-gw-taxonomy-generated-taxon]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedGeneratedTaxonKey = button.dataset.gwTaxonomyGeneratedTaxon || "";
          renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
        });
      });
    }
  }

  async function open() {
    const taxonomyApi = api();
    if (!taxonomyApi) {
      alert("Playable taxonomy profiles are not loaded yet.");
      return;
    }

    let profiles = taxonomyApi.getProfiles();
    if (typeof taxonomyApi.loadProfiles === "function") {
      try {
        profiles = await taxonomyApi.loadProfiles();
      } catch (err) {
        console.warn("Playable taxonomy hydration failed; using current profiles.", err);
        profiles = taxonomyApi.getProfiles();
      }
    }
    const profileSource =
      typeof taxonomyApi.getProfileSource === "function" ? taxonomyApi.getProfileSource() : null;
    const generatedTaxaManifest = await loadGeneratedTaxaManifest();
    const scoredTaxaManifest = await loadScoredTaxaManifest();

    ensureStyles();
    document.querySelectorAll(".gw-taxonomy-explorer-backdrop").forEach((el) => el.remove());

    selectedTaxonKey = selectedTaxonKey || profiles[0]?.taxonKey || "";

    const root = document.createElement("div");
    root.className = "gw-taxonomy-explorer-backdrop";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "gwTaxonomyExplorerTitle");

    root.innerHTML = `
      <div class="gw-taxonomy-explorer-modal">
        <div class="gw-taxonomy-explorer-head">
          <div>
            <div class="gw-taxonomy-explorer-title" id="gwTaxonomyExplorerTitle">
              Playable Taxonomy Explorer
            </div>
            ${renderSourceBadge(profileSource)}
            <div class="gw-taxonomy-explorer-copy">
              iNaturalist provides the observation substrate; GridWild translates that into a beginner-playable endpoint. Some groups are playable at species level, while others are better treated at genus, family, or broader ranks.
            </div>
          </div>
          <button class="gw-taxonomy-explorer-close" id="gwTaxonomyExplorerClose" type="button" aria-label="Close">x</button>
        </div>

        ${renderLoadStats(profiles, generatedTaxaManifest, scoredTaxaManifest)}

        ${renderControls(profiles)}

        <div class="gw-taxonomy-explorer-body">
          <div>
            <div class="gw-taxonomy-explorer-summary" id="gwTaxonomyExplorerSummary"></div>
            <div class="gw-taxonomy-explorer-list" id="gwTaxonomyExplorerList"></div>
          </div>
          <div class="gw-taxonomy-detail" id="gwTaxonomyExplorerDetail"></div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const close = () => root.remove();
    root.querySelector("#gwTaxonomyExplorerClose")?.addEventListener("click", close);
    root.addEventListener("click", (evt) => {
      if (evt.target === root) close();
    });
    root.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") close();
    });

    [
      "#gwTaxonomyExplorerSearch",
      "#gwTaxonomyExplorerRank",
      "#gwTaxonomyExplorerMode",
      "#gwTaxonomyExplorerSort"
    ].forEach((selector) => {
      const control = root.querySelector(selector);
      const eventName = control?.tagName === "INPUT" ? "input" : "change";
      control?.addEventListener(eventName, () =>
        renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest)
      );
    });

    renderResults(root, profiles, generatedTaxaManifest, scoredTaxaManifest);
    root.querySelector("#gwTaxonomyExplorerSearch")?.focus();
  }

  window.GridWildPlayableTaxonomyExplorer = {
    open
  };
})();
