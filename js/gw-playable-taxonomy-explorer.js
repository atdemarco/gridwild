// -----------------------------------------------------------------------------
// GridWild Playable Taxonomy Explorer
// Lightweight inspector for the curated playable endpoint backbone.
// -----------------------------------------------------------------------------

(function () {
  let selectedTaxonKey = "";

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

      .gw-taxonomy-explorer-copy {
        color: rgba(239,230,211,0.68);
        font-size: 12px;
        line-height: 1.38;
        margin: 4px 0 14px;
        max-width: 820px;
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

      @media (max-width: 760px) {
        .gw-taxonomy-explorer-modal {
          width: 96vw;
          padding: 14px;
        }

        .gw-taxonomy-explorer-controls,
        .gw-taxonomy-explorer-body,
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

  function renderDetail(profile) {
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

  function renderResults(root, profiles) {
    const state = readState(root);
    const rows = filterProfiles(profiles, state);
    if (!rows.some((profile) => profile.taxonKey === selectedTaxonKey)) {
      selectedTaxonKey = rows[0]?.taxonKey || "";
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
          renderResults(root, profiles);
        });
      });
    }
    if (detail) detail.innerHTML = renderDetail(selected);
  }

  function open() {
    const taxonomyApi = api();
    if (!taxonomyApi) {
      alert("Playable taxonomy profiles are not loaded yet.");
      return;
    }

    ensureStyles();
    document.querySelectorAll(".gw-taxonomy-explorer-backdrop").forEach((el) => el.remove());

    const profiles = taxonomyApi.getProfiles();
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
            <div class="gw-taxonomy-explorer-copy">
              iNaturalist provides the observation substrate; GridWild translates that into a beginner-playable endpoint. Some groups are playable at species level, while others are better treated at genus, family, or broader ranks.
            </div>
          </div>
          <button class="gw-taxonomy-explorer-close" id="gwTaxonomyExplorerClose" type="button" aria-label="Close">x</button>
        </div>

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
      control?.addEventListener(eventName, () => renderResults(root, profiles));
    });

    renderResults(root, profiles);
    root.querySelector("#gwTaxonomyExplorerSearch")?.focus();
  }

  window.GridWildPlayableTaxonomyExplorer = {
    open
  };
})();
