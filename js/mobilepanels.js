// js/mobilepanels.js
// Mobile bottom-sheet content + lightweight wiring for GridWild

window.__gwUser = window.__gwUser || {
  username: localStorage.getItem("gw_inat_username") || "andrew2285"
};


(function () {

    window.__gwUser = window.__gwUser || {
    username: localStorage.getItem("gw_inat_username") || "andrew2285",
    profile: null
  };
  
  function $(id) {
    return document.getElementById(id);
  }

  // --------------------------------------------------------------------------
  // Sheet body templates
  // --------------------------------------------------------------------------

    function renderMeContent() {
    return `
      <div class="gw-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div class="gw-card-title">Explorer Card</div>
          <button class="gw-mini-btn" id="gwUserSettingsBtn" title="Change iNaturalist username">
            ⚙ Account
          </button>
        </div>

        <div id="gwUserProfileBody">
          Loading explorer profile...
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Field Progress</div>
        <div id="gwUserProgressBody">
          Loading progression...
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Collection</div>
        <div id="gwUserExtraStats">
          Loading collection stats...
        </div>
      </div>
    `;
  }

function renderInfoContent() {
  return `
      <div class="gw-card" id="gwSummaryPane">
        <div class="gw-summary-title">Center square</div>
        <div class="gw-summary-body" id="gwSummaryBody">Loading…</div>
      </div>

      <div class="gw-card" id="gwTopObserversPane">
        <div class="gw-card-title">Top observers</div>
        <div id="gwTopObserversBody" class="gw-summary-body">Loading…</div>
      </div>

      <div class="gw-card" id="gwCladoPane">
        <div class="gw-clado-title">Taxonomic structure</div>
        <div class="gw-clado-subtitle">
          Center 3×3 square taxonomy: iconic taxon → order → family → genus
        </div>

        <div class="gw-clado-wrap" id="gwCladoWrap">
          <div id="gwCladoBody" class="gw-clado-empty">
            Waiting for taxonomy data…
          </div>

          <div class="gw-clado-hint">
            tap slice = drill down • tap center = back
          </div>
        </div>
      </div>
    `;
}

  function renderCommunityContent() {
    return `
      <div class="gw-card">
        <div class="gw-card-title">Guild Territory</div>
        <div class="gw-list">
          <div class="gw-rowline"><span>Territory holder</span><span class="gw-muted">@BirdNerdDC</span></div>
          <div class="gw-rowline"><span>Nearby specialist</span><span class="gw-muted">MossWizard</span></div>
          <div class="gw-rowline"><span>Guild goal</span><span class="gw-muted">200 spring spp</span></div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Nearby activity</div>
        <div class="gw-list">
          <div class="gw-rowline"><span>Warbler found 300m away</span><span class="gw-muted">today</span></div>
          <div class="gw-rowline"><span>New bee species nearby</span><span class="gw-muted">today</span></div>
          <div class="gw-rowline"><span>3 observers active here</span><span class="gw-muted">now</span></div>
        </div>
      </div>
    `;
  }

  function renderQuestContent() {
    return `
      <div class="gw-card">
        <div class="gw-card-title">Today’s quests</div>
        <div class="gw-list">
          <div class="gw-rowline"><span>Find a yellow flower</span><span class="gw-muted">+10 XP</span></div>
          <div class="gw-rowline"><span>Observe a fly species</span><span class="gw-muted">+15 XP</span></div>
          <div class="gw-rowline"><span>New taxon in this square</span><span class="gw-muted">+40 XP</span></div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Streak</div>
        <div class="gw-rowline"><span>Observe today</span><span class="gw-muted">9-day streak</span></div>
      </div>
    `;
  }

  function renderLegendContent() {
    return `
      <div class="gw-card">
        <div class="gw-legend-title">How to read the overlay</div>
        <div class="gw-legend-subtitle">
          Hue = observers • vividness = species • opacity = observations
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Observers</div>
          <div class="gw-huebar"></div>
          <div class="gw-legend-axislabels">
            <span>few</span>
            <span>mid</span>
            <span>many</span>
          </div>
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Species</div>
          <div class="gw-chiprow">
            <div class="gw-chip chip-dull"></div>
            <div class="gw-chip chip-mid"></div>
            <div class="gw-chip chip-vivid"></div>
          </div>
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Observations</div>
          <div class="gw-chiprow">
            <div class="gw-chip chip-faint"></div>
            <div class="gw-chip chip-medium"></div>
            <div class="gw-chip chip-opaque"></div>
          </div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Layer controls</div>
        <div class="gw-togglegrid">
          <label class="gw-toggleline">
            <input type="checkbox" id="togglePoints_clone" />
            <span>Show points</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleHeat_clone" checked />
            <span>Show heat</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleDynamicINat_clone" />
            <span>Live iNat</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleFog_clone" checked />
            <span>Fog of war</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleLockLocation_clone" checked />
            <span>Lock to current location</span>
          </label>
        </div>

        <div class="gw-card-title" style="margin-top:14px;">Heat metric</div>
        <div class="gw-togglegrid">
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="count" checked />
            <span>n observations</span>
          </label>
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="species" />
            <span>n species</span>
          </label>
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="observers" />
            <span>n observers</span>
          </label>
        </div>

        <div class="gw-card-title" style="margin-top:14px;">Iconic taxa</div>
        <div class="gw-checklist" id="taxaChecklistClone"></div>
      </div>
    `;
  }


  function safeNum(x) {
    return Number.isFinite(Number(x)) ? Number(x) : 0;
  }

  function formatNum(x) {
    return safeNum(x).toLocaleString();
  }

  function computeExplorerRank(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    const ids = safeNum(profile?.identifications_count);

    const score = obs + (spp * 8) + (ids * 0.35);

    if (score >= 120000) return "Mythic Surveyor";
    if (score >= 60000)  return "Master Naturalist";
    if (score >= 25000)  return "Senior Tracker";
    if (score >= 10000)  return "Field Ranger";
    if (score >= 4000)   return "Trail Scout";
    if (score >= 1200)   return "Apprentice Observer";
    return "New Wanderer";
  }

  function computeExplorerLevel(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    const ids = safeNum(profile?.identifications_count);

    const xp = obs + spp * 10 + Math.floor(ids * 0.25);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 40)));
    const xpIntoLevel = xp - 40 * Math.pow(level - 1, 2);
    const xpForNext = Math.max(100, 40 * (Math.pow(level, 2) - Math.pow(level - 1, 2)));
    const pct = Math.max(0, Math.min(100, (xpIntoLevel / xpForNext) * 100));

    return { xp, level, xpIntoLevel, xpForNext, pct };
  }

  function estimateRarityScore(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    if (obs <= 0) return 0;
    return (spp / obs) * 1000;
  }

  function estimateCoverageScore(profile) {
    const obs = safeNum(profile?.observations_count);
    const ids = safeNum(profile?.identifications_count);
    return Math.round(Math.sqrt(obs) + Math.sqrt(ids));
  }

  function getIconUrl(user) {
    return (
      user?.icon_url ||
      user?.user_icon_url ||
      "https://static.inaturalist.org/attachments/users/icons/defaults/thumb.png"
    );
  }

  async function fetchINatUserProfile(username) {
    const resp = await fetch(`https://api.inaturalist.org/v1/users/${encodeURIComponent(username)}`);
    if (!resp.ok) {
      throw new Error(`iNat user lookup failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const user = data?.results?.[0];
    if (!user) {
      throw new Error("iNat username not found");
    }

    return user;
  }

  async function fetchINatRecentObservations(username, perPage = 30) {
    const url = new URL("https://api.inaturalist.org/v1/observations");
    url.searchParams.set("user_login", username);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("order_by", "created_at");
    url.searchParams.set("order", "desc");

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      throw new Error(`iNat recent obs lookup failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return Array.isArray(data?.results) ? data.results : [];
  }

  function summarizeRecentObservations(obs) {
    const iconicCounts = new Map();
    const taxonNames = new Set();

    for (const row of obs) {
      const iconic = row?.taxon?.iconic_taxon_name || "Unknown";
      iconicCounts.set(iconic, (iconicCounts.get(iconic) || 0) + 1);

      const name = row?.taxon?.preferred_common_name || row?.taxon?.name;
      if (name) taxonNames.add(name);
    }

    const topIconic = Array.from(iconicCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      recentObs: obs.length,
      recentSpecies: taxonNames.size,
      dominantIconic: topIconic ? `${topIconic[0]} (${topIconic[1]})` : "—"
    };
  }

  function renderExplorerProfile(user) {
    const rank = computeExplorerRank(user);
    const lv = computeExplorerLevel(user);
    const rarity = estimateRarityScore(user);

    return `
      <div style="display:flex;gap:12px;align-items:center;">
        <img
          src="${getIconUrl(user)}"
          alt="${user.login}"
          style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.12);"
        />

        <div style="min-width:0;">
          <div style="font-size:18px;font-weight:900;line-height:1.1;">${user.login}</div>
          <div class="gw-muted" style="margin-top:2px;">${user.name || rank}</div>
          <div style="margin-top:6px;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:rgba(240,209,138,0.95);font-weight:800;">
            ${rank}
          </div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:6px;">
          <span class="gw-muted">Level ${lv.level}</span>
          <span class="gw-muted">${formatNum(lv.xpIntoLevel)} / ${formatNum(lv.xpForNext)} XP</span>
        </div>

        <div style="height:12px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.06);">
          <div style="
            width:${lv.pct.toFixed(1)}%;
            height:100%;
            background:linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
          "></div>
        </div>
      </div>

      <div class="gw-kpi-grid" style="margin-top:12px;">
        <div class="gw-kpi">
          <div class="gw-kpi-k">Observations</div>
          <div class="gw-kpi-v">${formatNum(user.observations_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Species</div>
          <div class="gw-kpi-v">${formatNum(user.species_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">IDs</div>
          <div class="gw-kpi-v">${formatNum(user.identifications_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Rarity score</div>
          <div class="gw-kpi-v">${rarity.toFixed(1)}</div>
        </div>
      </div>
    `;
  }

  function renderExplorerProgress(user, recentSummary) {
    const coverage = estimateCoverageScore(user);
    const journalPosts = safeNum(user?.journal_posts_count);
    const projects = safeNum(user?.projects_count);

    return `
      <div class="gw-list">

        <div class="gw-rowline">
          <span>Coverage score</span>
          <span class="gw-muted">${formatNum(coverage)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent observations scanned</span>
          <span class="gw-muted">${formatNum(recentSummary.recentObs)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent species detected</span>
          <span class="gw-muted">${formatNum(recentSummary.recentSpecies)}</span>
        </div>

        <div class="gw-rowline">
          <span>Dominant recent kingdom lane</span>
          <span class="gw-muted">${recentSummary.dominantIconic}</span>
        </div>

        <div class="gw-rowline">
          <span>Journal posts</span>
          <span class="gw-muted">${formatNum(journalPosts)}</span>
        </div>

        <div class="gw-rowline">
          <span>Projects</span>
          <span class="gw-muted">${formatNum(projects)}</span>
        </div>

      </div>
    `;
  }

  function renderExplorerCollection(user, recentSummary) {
    const obs = safeNum(user?.observations_count);
    const spp = safeNum(user?.species_count);
    const ids = safeNum(user?.identifications_count);

    const speciesPerObs = obs > 0 ? (spp / obs) : 0;
    const idsPerObs = obs > 0 ? (ids / obs) : 0;

    return `
      <div class="gw-list">

        <div class="gw-rowline">
          <span>Species per observation</span>
          <span class="gw-muted">${speciesPerObs.toFixed(3)}</span>
        </div>

        <div class="gw-rowline">
          <span>IDs per observation</span>
          <span class="gw-muted">${idsPerObs.toFixed(3)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent ecological lane</span>
          <span class="gw-muted">${recentSummary.dominantIconic}</span>
        </div>

        <div class="gw-rowline">
          <span>Active username</span>
          <span class="gw-muted">@${user.login}</span>
        </div>

      </div>
    `;
  }

  async function loadINatUserProfileIntoPanel() {
    const username = window.__gwUser?.username || "andrew2285";

    const profileEl = document.getElementById("gwUserProfileBody");
    const progressEl = document.getElementById("gwUserProgressBody");
    const extraEl = document.getElementById("gwUserExtraStats");

    if (profileEl) profileEl.innerHTML = "Loading explorer profile...";
    if (progressEl) progressEl.innerHTML = "Loading progression...";
    if (extraEl) extraEl.innerHTML = "Loading collection stats...";

    try {
      const [user, recentObs] = await Promise.all([
        fetchINatUserProfile(username),
        fetchINatRecentObservations(username, 30)
      ]);

      window.__gwUser.profile = user;

      const recentSummary = summarizeRecentObservations(recentObs);

      if (profileEl) profileEl.innerHTML = renderExplorerProfile(user);
      if (progressEl) progressEl.innerHTML = renderExplorerProgress(user, recentSummary);
      if (extraEl) extraEl.innerHTML = renderExplorerCollection(user, recentSummary);

    } catch (err) {
      console.warn("Failed to load iNat ME panel profile:", err);

      if (profileEl) {
        profileEl.innerHTML = `
          <div class="gw-muted" style="margin-bottom:10px;">
            Could not load iNaturalist profile for
            <b>@${username}</b>.
          </div>

          <button class="gw-mini-btn" id="gwRetryUserLoadBtn">
            Retry
          </button>
        `;
      }

      if (progressEl) progressEl.innerHTML = "—";
      if (extraEl) extraEl.innerHTML = "—";

      setTimeout(() => {
        const retryBtn = document.getElementById("gwRetryUserLoadBtn");
        if (retryBtn) {
          retryBtn.addEventListener("click", () => {
            loadINatUserProfileIntoPanel();
          });
        }
      }, 0);
    }
  }

  function bindUserSettingsButton() {
    const btn = document.getElementById("gwUserSettingsBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const current = window.__gwUser?.username || "";
      const next = prompt("Enter iNaturalist username", current);

      if (!next) return;

      const cleaned = next.trim().replace(/^@+/, "");
      if (!cleaned) return;

      window.__gwUser.username = cleaned;
      localStorage.setItem("gw_inat_username", cleaned);

      await loadINatUserProfileIntoPanel();
    });
  }


  async function loadINatUserProfile() {

  const username = window.__gwUser.username;

  try {

    const resp = await fetch(
      `https://api.inaturalist.org/v1/users/${username}`
    );

    const data = await resp.json();

    const user = data.results?.[0];
    if (!user) throw new Error("User not found");

    document.getElementById("gwUserProfileBody").innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">

        <img src="${user.icon_url}"
             style="width:56px;height:56px;border-radius:50%;object-fit:cover;">

        <div>
          <div style="font-weight:800;font-size:18px;">
            ${user.login}
          </div>

          <div class="gw-muted">
            ${user.name || ""}
          </div>
        </div>

      </div>

      <div class="gw-kpi-grid" style="margin-top:12px;">

        <div class="gw-kpi">
          <div class="gw-kpi-k">Observations</div>
          <div class="gw-kpi-v">${user.observations_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Species</div>
          <div class="gw-kpi-v">${user.species_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">IDs</div>
          <div class="gw-kpi-v">${user.identifications_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Posts</div>
          <div class="gw-kpi-v">${user.journal_posts_count.toLocaleString()}</div>
        </div>

      </div>
    `;

  } catch(err) {

    document.getElementById("gwUserProfileBody").innerHTML =
      "Could not load iNaturalist profile.";
  }
}

  window.refreshGridWildMePanel = function refreshGridWildMePanel() {
    bindUserSettingsButton();
    loadINatUserProfileIntoPanel();
  };

  // --------------------------------------------------------------------------
  // Clone-control mirroring
  // --------------------------------------------------------------------------

  function mirrorCheckbox(realId, cloneId) {
    const real = $(realId);
    const clone = $(cloneId);
    if (!real || !clone) return;

    clone.checked = real.checked;

    clone.addEventListener("change", () => {
      real.checked = clone.checked;
      real.dispatchEvent(new Event("change", { bubbles: true }));
    });

    real.addEventListener("change", () => {
      clone.checked = real.checked;
    });
  }

  function mirrorHeatMetricRadios() {
    const realRadios = Array.from(document.querySelectorAll('input[name="heatMetric"]'));
    const cloneRadios = Array.from(document.querySelectorAll('input[name="heatMetric_clone"]'));

    function syncCloneFromReal() {
      const checked = document.querySelector('input[name="heatMetric"]:checked')?.value || "count";
      cloneRadios.forEach(r => {
        r.checked = (r.value === checked);
      });
    }

    cloneRadios.forEach(clone => {
      clone.addEventListener("change", () => {
        if (!clone.checked) return;

        const real = document.querySelector(`input[name="heatMetric"][value="${clone.value}"]`);
        if (!real) return;

        real.checked = true;
        real.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    realRadios.forEach(real => {
      real.addEventListener("change", syncCloneFromReal);
    });

    syncCloneFromReal();
  }

  function buildTaxaCloneChecklist() {
    const hostReal = $("taxaChecklist");
    const hostClone = $("taxaChecklistClone");
    if (!hostReal || !hostClone) return;

    hostClone.innerHTML = "";

    hostReal.querySelectorAll('input[data-iconic]').forEach(realCb => {
      const iconic = realCb.getAttribute("data-iconic");
      const labelText =
        realCb.parentElement?.querySelector("span")?.textContent || iconic;

      const row = document.createElement("label");
      const clone = document.createElement("input");
      const span = document.createElement("span");

      clone.type = "checkbox";
      clone.checked = realCb.checked;
      clone.dataset.iconicClone = iconic;
      span.textContent = labelText;

      clone.addEventListener("change", () => {
        realCb.checked = clone.checked;
        realCb.dispatchEvent(new Event("change", { bubbles: true }));
      });

      realCb.addEventListener("change", () => {
        clone.checked = realCb.checked;
      });

      row.appendChild(clone);
      row.appendChild(span);
      hostClone.appendChild(row);
    });
  }

  function syncCloneControlsFromReal() {
    [
      ["togglePoints", "togglePoints_clone"],
      ["toggleHeat", "toggleHeat_clone"],
      ["toggleDynamicINat", "toggleDynamicINat_clone"],
      ["toggleFog", "toggleFog_clone"],
      ["toggleLockLocation", "toggleLockLocation_clone"]
    ].forEach(([realId, cloneId]) => {
      const real = $(realId);
      const clone = $(cloneId);
      if (real && clone) clone.checked = real.checked;
    });

    const checked = document.querySelector('input[name="heatMetric"]:checked')?.value || "count";
    document.querySelectorAll('input[name="heatMetric_clone"]').forEach(r => {
      r.checked = (r.value === checked);
    });
  }

  // --------------------------------------------------------------------------
  // Public boot
  // --------------------------------------------------------------------------

  window.initGridWildMobilePanels = function initGridWildMobilePanels() {
    const meBody = $("sheetMeBody");
    const infoBody = $("sheetInfoBody");
    const communityBody = $("sheetCommunityBody");
    const questBody = $("sheetQuestBody");
    const legendBody = $("sheetLegendBody");

    if (meBody) meBody.innerHTML = renderMeContent();
    if (infoBody) infoBody.innerHTML = renderInfoContent();
    if (communityBody) communityBody.innerHTML = renderCommunityContent();
    if (questBody) questBody.innerHTML = renderQuestContent();
    if (legendBody) legendBody.innerHTML = renderLegendContent();

    mirrorCheckbox("togglePoints", "togglePoints_clone");
    mirrorCheckbox("toggleHeat", "toggleHeat_clone");
    mirrorCheckbox("toggleDynamicINat", "toggleDynamicINat_clone");
    mirrorCheckbox("toggleFog", "toggleFog_clone");
    mirrorCheckbox("toggleLockLocation", "toggleLockLocation_clone");
    mirrorHeatMetricRadios();

    setTimeout(() => {
      bindUserSettingsButton();
      loadINatUserProfileIntoPanel();
      buildTaxaCloneChecklist();
      syncCloneControlsFromReal();
  
      if (typeof window.paintLegendFromHeatFunction === "function") {
        window.paintLegendFromHeatFunction();
      }

      if (typeof window.updateHudCenterSummary === "function") {
        window.updateHudCenterSummary();
      }

      if (typeof window.updateTopObserversPanel === "function") {
        window.updateTopObserversPanel();
      }

      if (typeof window.updateHudCladogram === "function") {
        window.updateHudCladogram();
      }

    }, 50);
  };

  window.refreshGridWildMobileInfo = function refreshGridWildMobileInfo() {
    if (typeof window.paintLegendFromHeatFunction === "function") {
      window.paintLegendFromHeatFunction();
    }

    if (typeof window.updateHudCenterSummary === "function") {
      window.updateHudCenterSummary();
    }

    if (typeof window.updateTopObserversPanel === "function") {
      window.updateTopObserversPanel();
    }

    if (typeof window.updateHudCladogram === "function") {
      window.updateHudCladogram();
    }


    buildTaxaCloneChecklist();
    syncCloneControlsFromReal();
  };
})();