// GridWild Field sheet
// Consolidates field-context overlays, niches, patches, and surveys.

(function () {
  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function ensureStyles() {
    if (document.getElementById("gwFieldStyles")) return;
    const style = document.createElement("style");
    style.id = "gwFieldStyles";
    style.textContent = `
      .gw-field-card {
        display: grid;
        gap: 10px;
      }

      .gw-field-master-row,
      .gw-field-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-field-master-copy,
      .gw-field-status-main {
        min-width: 0;
        display: grid;
        gap: 2px;
      }

      .gw-field-master-label,
      .gw-field-section-title {
        color: #f0d18a;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .gw-field-state-btn {
        min-width: 74px;
      }

      .gw-field-state-btn.is-on {
        background: #f0d18a;
        color: #1d241c;
      }

      .gw-field-status-name {
        color: #f4e8cf;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-field-status-sub {
        font-size: 11px;
      }

      .gw-field-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .gw-field-actions .gw-mini-btn,
      .gw-field-bottom-action {
        width: 100%;
      }

      .gw-field-list {
        display: grid;
        gap: 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(215,183,116,0.10);
      }

      .gw-field-list-empty {
        padding: 10px;
        font-size: 12px;
      }

      .gw-field-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
      }

      .gw-field-row-main {
        flex: 1 1 auto;
        min-width: 0;
        display: grid;
        gap: 3px;
      }

      .gw-field-row-title {
        color: #f4e8cf;
        font-weight: 900;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-field-row-sub {
        font-size: 11px;
        line-height: 1.25;
      }

      .gw-field-row-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        flex-wrap: wrap;
      }

      .gw-field-row-actions .gw-mini-btn {
        width: auto;
        min-width: 58px;
      }

      .gw-field-center-button {
        margin-top: 2px;
      }

      @media (max-width: 420px) {
        .gw-field-status-row {
          align-items: stretch;
          flex-direction: column;
        }

        .gw-field-actions {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function localNichesEnabled() {
    return window.GridWildLocalNiches?.isVisible?.() ??
      window.__gwState?.showLocalNiches !== false;
  }

  function surveyViewEnabled() {
    if (window.GridWildSurveyLayer?.isSurveyViewEnabled) {
      return window.GridWildSurveyLayer.isSurveyViewEnabled();
    }
    const checkbox = document.getElementById("toggleSurveyView");
    if (checkbox) return checkbox.checked === true;
    return window.__gwState?.showSurveyView !== false;
  }

  function patchViewEnabled() {
    if (window.GridWildPatches?.isVisible) return window.GridWildPatches.isVisible();
    const checkbox = document.getElementById("togglePatchView");
    if (checkbox) return checkbox.checked === true;
    return window.__gwState?.showPatchView !== false;
  }

  function fieldContextEnabled() {
    return localNichesEnabled() && surveyViewEnabled() && patchViewEnabled();
  }

  function fieldStateText() {
    return fieldContextEnabled() ? "ON" : "OFF";
  }

  function displayNicheTitle(niche) {
    return window.GridWildLocalNiches?.buildNicheDisplayTitle?.(niche) ||
      niche?.short_title ||
      niche?.title ||
      niche?.primary_place_label ||
      "Home niche";
  }

  function nicheSubtitle(niche) {
    if (!niche) return "none";
    const bits = [
      niche.theme || niche.niche_type || "local niche",
      niche.primary_place_label
    ].filter(Boolean);
    return bits.join(" / ") || "local niche";
  }

  function patchTitle(patch) {
    return patch?.name || patch?.title || "Home patch";
  }

  function patchSubtitle(patch) {
    if (!patch) return "none";
    return patch.source_label || patch.source || "patch";
  }

  function surveyRows() {
    return window.GridWildSurveyDesigner?.loadSurveys?.() || [];
  }

  function joinedSurveys() {
    return surveyRows().filter(survey => window.GridWildSurveyLayer?.isJoined?.(survey.id));
  }

  function currentSurvey() {
    const joined = joinedSurveys();
    return joined.find(survey => window.GridWildSurveyLayer?.isVisible?.(survey.id)) || joined[0] || null;
  }

  function surveySubtitle(survey) {
    if (!survey) return "none";
    const count = joinedSurveys().length;
    const visible = window.GridWildSurveyLayer?.isVisible?.(survey.id);
    return `${count} joined${visible ? " / visible" : ""}`;
  }

  function renderFieldSheetHtml() {
    ensureStyles();

    return `
      <div class="gw-card gw-field-card">
        <div class="gw-field-master-row">
          <span class="gw-field-master-copy">
            <span class="gw-field-master-label">Field</span>
            <span class="gw-muted">Niches, patches, and joined surveys.</span>
          </span>
          <button class="gw-mini-btn gw-field-state-btn ${fieldContextEnabled() ? "is-on" : ""}" id="gwFieldMasterToggle" type="button" aria-pressed="${fieldContextEnabled() ? "true" : "false"}">
            ${fieldStateText()}
          </button>
        </div>
      </div>

      <div class="gw-card gw-field-card">
        <div class="gw-field-section-title">Niches</div>
        ${renderFieldNicheList()}
        <div class="gw-field-actions">
          <button class="gw-mini-btn" id="gwFieldNearbyNichesBtn" type="button">Nearby niches...</button>
        </div>
      </div>

      <div class="gw-card gw-field-card">
        <div class="gw-field-section-title">Patches</div>
        ${renderFieldPatchList()}
        <div class="gw-field-actions">
          <button class="gw-mini-btn" id="gwFieldNearbyPatchesBtn" type="button">Nearby patches...</button>
          <button class="gw-mini-btn" id="gwFieldLoadPatchBtn" type="button">Load...</button>
        </div>
      </div>

      <div class="gw-card gw-field-card">
        <div class="gw-field-section-title">Surveys</div>
        ${renderFieldSurveyList()}
        <div class="gw-field-actions">
          <button class="gw-mini-btn" id="gwFieldListSurveysBtn" type="button">List Surveys...</button>
          <button class="gw-mini-btn" id="gwFieldSurveyBuilderBtn" type="button">Survey Builder</button>
        </div>
      </div>

      <button class="gw-mini-btn gw-field-bottom-action gw-field-center-button" id="gwFieldCenterSquareBtn" type="button">
        CENTER SQUARE
      </button>
    `;
  }

  function renderFieldNicheList() {
    const rows = savedNicheRows();
    if (!rows.length) {
      return `
        <div class="gw-field-list">
          <div class="gw-muted gw-field-list-empty">home niche / none</div>
        </div>
      `;
    }

    return `
      <div class="gw-field-list">
        ${rows.map(niche => {
          const key = niche.id || niche.source_key || niche.metrics?.source_key || "";
          const home = isHomeNiche(niche);
          const saved = window.GridWildLocalNiches?.isBookmarkedNiche?.(niche) === true;
          return `
            <div class="gw-rowline gw-field-row" data-gw-field-open-niche="${esc(key)}">
              <span class="gw-field-row-main">
                <span class="gw-field-row-title">${esc(displayNicheTitle(niche))}</span>
                <span class="gw-muted gw-field-row-sub">${esc(nicheSubtitle(niche))}</span>
              </span>
              <span class="gw-field-row-actions">
                ${home ? `<span class="gw-quest-pill">Home</span>` : ""}
                ${saved ? `<span class="gw-quest-pill">Saved</span>` : ""}
                <button class="gw-mini-btn" data-gw-field-open-niche="${esc(key)}" type="button">Open</button>
              </span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderFieldPatchList() {
    const rows = window.GridWildPatches?.getPatches?.() || [];
    if (!rows.length) {
      return `
        <div class="gw-field-list">
          <div class="gw-muted gw-field-list-empty">current patch / none</div>
        </div>
      `;
    }

    return `
      <div class="gw-field-list">
        ${rows.map(patch => `
          <div class="gw-rowline gw-field-row" data-gw-field-open-patch="${esc(patch.id)}">
            <span class="gw-field-row-main">
              <span class="gw-field-row-title">${esc(patchTitle(patch))}</span>
              <span class="gw-muted gw-field-row-sub">${esc(patchSubtitle(patch))}${Number.isFinite(Number(patch.distance_m)) ? ` / ${esc(window.GridWildPatches?.formatDistance?.(patch.distance_m) || `${Math.round(patch.distance_m)} m`)}` : ""}</span>
            </span>
            <span class="gw-field-row-actions">
              ${patch.is_home_patch ? `<span class="gw-quest-pill">Home</span>` : ""}
              <button class="gw-mini-btn" data-gw-field-open-patch="${esc(patch.id)}" type="button">Open</button>
            </span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderFieldSurveyList() {
    const rows = joinedSurveys();
    if (!rows.length) {
      return `
        <div class="gw-field-list">
          <div class="gw-muted gw-field-list-empty">current survey / none</div>
        </div>
      `;
    }

    return `
      <div class="gw-field-list">
        ${rows.map(survey => {
          const visible = window.GridWildSurveyLayer?.isVisible?.(survey.id);
          return `
            <div class="gw-rowline gw-field-row" data-gw-field-open-survey="${esc(survey.id)}">
              <span class="gw-field-row-main">
                <span class="gw-field-row-title">${esc(survey.name || "Untitled survey")}</span>
                <span class="gw-muted gw-field-row-sub">${esc(survey.description || surveySubtitle(survey))}</span>
              </span>
              <span class="gw-field-row-actions">
                <span class="gw-quest-pill">Joined</span>
                ${visible ? `<span class="gw-quest-pill">Visible</span>` : ""}
                <button class="gw-mini-btn" data-gw-field-open-survey="${esc(survey.id)}" type="button">Open</button>
              </span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function savedNicheRows() {
    const home = window.GridWildLocalNiches?.getHomeNiche?.() || window.__gwState?.homeNiche || null;
    const saved = window.GridWildLocalNiches?.getBookmarkedNiches?.() || [];
    const seen = new Set();
    return [home, ...saved]
      .filter(Boolean)
      .filter(niche => {
        const key = String(niche.id || niche.source_key || niche.metrics?.source_key || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        if (isHomeNiche(a) && !isHomeNiche(b)) return -1;
        if (!isHomeNiche(a) && isHomeNiche(b)) return 1;
        return String(displayNicheTitle(a)).localeCompare(String(displayNicheTitle(b)));
      });
  }

  async function setFieldContextVisible(show) {
    const desired = show === true;
    window.__gwState = window.__gwState || {};

    if (window.ensureGridWildLocalNichesLoaded) {
      await window.ensureGridWildLocalNichesLoaded().catch(err => {
        console.warn("Could not load local niches for Field toggle:", err);
      });
    }

    window.GridWildLocalNiches?.setVisible?.(desired);
    window.GridWildSurveyLayer?.setSurveyViewEnabled?.(desired);
    window.GridWildPatches?.setVisible?.(desired);

    const surveyCheckbox = document.getElementById("toggleSurveyView");
    if (surveyCheckbox) surveyCheckbox.checked = desired;

    const patchCheckbox = document.getElementById("togglePatchView");
    if (patchCheckbox) patchCheckbox.checked = desired;

    window.__gwState.showLocalNiches = desired;
    window.__gwState.showSurveyView = desired;
    window.__gwState.showPatchView = desired;

    if (typeof window.saveUIState === "function") window.saveUIState();
    window.GridWildHudTaxaFilter?.sync?.();
    renderIntoPage();
    window.dispatchEvent(new CustomEvent("gridwild:fieldcontextchange", {
      detail: { visible: desired }
    }));
  }

  async function openNicheSelector() {
    ensureSelectorStyles();

    if (window.ensureGridWildLocalNichesLoaded) {
      await window.ensureGridWildLocalNichesLoaded().catch(err => {
        console.warn("Could not load local niches:", err);
      });
    }

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-field-selector-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal gw-field-selector-modal">
        <div class="gw-quest-modal-title">Nearby Niches</div>
        <div class="gw-quest-modal-subtitle">Nearby and saved local niches.</div>
        <div id="gwFieldNicheSelectorRows">${renderNicheSelectorRows()}</div>
        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwFieldNicheCancel" type="button">Cancel</button>
          <button class="gw-quest-btn secondary" id="gwFieldNicheRefresh" type="button">Find Nearby</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const rerender = () => {
      const rows = root.querySelector("#gwFieldNicheSelectorRows");
      if (rows) rows.innerHTML = renderNicheSelectorRows();
    };

    root.onclick = async evt => {
      if (evt.target === root || evt.target.closest("#gwFieldNicheCancel")) {
        root.remove();
        return;
      }

      const refreshBtn = evt.target.closest("#gwFieldNicheRefresh");
      if (refreshBtn) {
        const rows = root.querySelector("#gwFieldNicheSelectorRows");
        if (rows) rows.innerHTML = `<div class="gw-muted">Finding nearby niches...</div>`;
        await window.GridWildLocalNiches?.refreshLocalNiches?.({ mode: "niches" });
        rerender();
        renderIntoPage();
        return;
      }

      const saveBtn = evt.target.closest("[data-gw-save-niche]");
      if (saveBtn) {
        await window.GridWildLocalNiches?.addBookmarkNiche?.(saveBtn.dataset.gwSaveNiche);
        rerender();
        renderIntoPage();
        return;
      }

      const homeBtn = evt.target.closest("[data-gw-home-niche]");
      if (homeBtn) {
        await window.GridWildLocalNiches?.setHomeNiche?.(homeBtn.dataset.gwHomeNiche);
        rerender();
        renderIntoPage();
        return;
      }

      const openBtn = evt.target.closest("[data-gw-open-niche]");
      if (openBtn) {
        root.remove();
        window.GridWildLocalNiches?.openNicheDetail?.(openBtn.dataset.gwOpenNiche);
      }
    };
  }

  function renderNicheSelectorRows() {
    const rows = nicheRows();
    if (!rows.length) return `<div class="gw-muted">No nearby or saved niches loaded yet.</div>`;

    return rows.map(niche => {
      const key = niche.id || niche.source_key || niche.metrics?.source_key || "";
      const home = isHomeNiche(niche);
      const saved = window.GridWildLocalNiches?.isBookmarkedNiche?.(niche) === true;
      return `
        <div class="gw-rowline gw-field-selector-row">
          <span class="gw-field-selector-main">
            <span>${esc(displayNicheTitle(niche))}</span>
            <span class="gw-muted">${esc(formatNicheDistance(niche.distance_m))} / ${esc(nicheSubtitle(niche))}</span>
          </span>
          <span class="gw-field-selector-actions">
            ${saved ? `<span class="gw-quest-pill">Saved</span>` : `<button class="gw-mini-btn" data-gw-save-niche="${esc(key)}" type="button">Save</button>`}
            ${home ? `<span class="gw-quest-pill">Home</span>` : `<button class="gw-mini-btn" data-gw-home-niche="${esc(key)}" type="button">Make Home</button>`}
            <button class="gw-mini-btn" data-gw-open-niche="${esc(key)}" type="button">Open</button>
          </span>
        </div>
      `;
    }).join("");
  }

  function nicheRows() {
    const seen = new Set();
    const rows = [
      ...(window.GridWildLocalNiches?.getHomeNiche?.() ? [window.GridWildLocalNiches.getHomeNiche()] : []),
      ...(window.GridWildLocalNiches?.getBookmarkedNiches?.() || []),
      ...(window.GridWildLocalNiches?.getNiches?.() || [])
    ];

    return rows
      .filter(Boolean)
      .filter(niche => {
        const key = String(niche.id || niche.source_key || niche.metrics?.source_key || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        if (isHomeNiche(a) && !isHomeNiche(b)) return -1;
        if (!isHomeNiche(a) && isHomeNiche(b)) return 1;
        return Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity);
      });
  }

  function isHomeNiche(niche) {
    const homeId = String(window.__gwState?.homeNicheId || window.GridWildLocalNiches?.getHomeNiche?.()?.id || "");
    const id = String(niche?.id || "");
    return Boolean(niche?.is_home_niche || (homeId && id && homeId === id));
  }

  function formatNicheDistance(meters) {
    const n = Number(meters);
    if (!Number.isFinite(n)) return "nearby";
    return window.GridWildPatches?.formatDistance?.(n) || `${Math.round(n)} m`;
  }

  function ensureSelectorStyles() {
    if (document.getElementById("gwFieldNicheSelectorStyles")) return;
    const style = document.createElement("style");
    style.id = "gwFieldNicheSelectorStyles";
    style.textContent = `
      .gw-field-selector-modal {
        max-width: min(680px, 96vw);
      }

      .gw-field-selector-row {
        gap: 10px;
        align-items: center;
      }

      .gw-field-selector-main {
        display: grid;
        min-width: 0;
        gap: 2px;
      }

      .gw-field-selector-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  async function openSurveyList() {
    if (window.ensureGridWildSurveyDataLoaded) {
      await window.ensureGridWildSurveyDataLoaded().catch(err => {
        console.warn("Could not load survey data:", err);
      });
    }
    window.GridWildQuests?.openSurveyExplorer?.();
  }

  function openSurveyBuilder() {
    window.GridWildQuests?.openNewSurveyConfigurator?.();
  }

  function openCurrentSurvey() {
    const survey = currentSurvey();
    if (!survey) return;
    window.GridWildQuests?.openSurveyInfo?.(survey.id);
  }

  function openCenterSquarePopup() {
    document.querySelectorAll(".gw-quest-modal-backdrop.gw-field-center-backdrop").forEach(el => el.remove());
    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-field-center-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">Center Square</div>
        <div class="gw-card" id="gwSummaryPane">
          <div class="gw-summary-title">Center square</div>
          <div class="gw-summary-body" id="gwSummaryBody">Loading...</div>
        </div>
        <div class="gw-card" id="gwTopObserversPane">
          <div class="gw-card-title">Top observers</div>
          <div id="gwTopObserversBody" class="gw-summary-body">Loading...</div>
        </div>
        <div class="gw-card" id="gwCladoPane">
          <div class="gw-clado-title">Taxonomic structure</div>
          <div class="gw-clado-subtitle">Center 3x3 square taxonomy: iconic taxon to order to family to genus</div>
          <div class="gw-clado-wrap" id="gwCladoWrap">
            <div id="gwCladoBody" class="gw-clado-empty">Waiting for taxonomy data...</div>
            <div class="gw-clado-hint">tap slice = drill down / tap center = back</div>
          </div>
        </div>
        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwFieldCenterClose" type="button">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    root.onclick = evt => {
      if (evt.target === root || evt.target.closest("#gwFieldCenterClose")) root.remove();
    };

    setTimeout(() => {
      if (typeof window.refreshGridWildMobileInfo === "function") {
        window.refreshGridWildMobileInfo();
      } else {
        window.updateHudCenterSummary?.();
        window.updateTopObserversPanel?.();
        window.updateHudCladogram?.();
      }
    }, 0);
  }

  function bind(root = document) {
    const target = root || document;
    if (target.dataset?.fieldSheetBound === "true") return;
    if (target.dataset) target.dataset.fieldSheetBound = "true";

    target.addEventListener("click", evt => {
      if (evt.target.closest("#gwFieldMasterToggle")) {
        setFieldContextVisible(!fieldContextEnabled());
        return;
      }

      const nicheRow = evt.target.closest("[data-gw-field-open-niche]");
      if (nicheRow && target.contains(nicheRow)) {
        window.GridWildLocalNiches?.openNicheDetail?.(nicheRow.dataset.gwFieldOpenNiche);
        return;
      }

      const patchRow = evt.target.closest("[data-gw-field-open-patch]");
      if (patchRow && target.contains(patchRow)) {
        window.GridWildPatches?.openPatchDetail?.(patchRow.dataset.gwFieldOpenPatch);
        return;
      }

      const surveyRow = evt.target.closest("[data-gw-field-open-survey]");
      if (surveyRow && target.contains(surveyRow)) {
        window.GridWildQuests?.openSurveyInfo?.(surveyRow.dataset.gwFieldOpenSurvey);
        return;
      }

      if (evt.target.closest("#gwFieldNearbyNichesBtn")) {
        openNicheSelector();
        return;
      }

      if (evt.target.closest("#gwFieldNearbyPatchesBtn")) {
        window.GridWildPatches?.openPatchSelector?.();
        return;
      }

      if (evt.target.closest("#gwFieldLoadPatchBtn")) {
        window.GridWildPatches?.openLoadPatchModal?.();
        return;
      }

      if (evt.target.closest("#gwFieldListSurveysBtn")) {
        openSurveyList();
        return;
      }

      if (evt.target.closest("#gwFieldSurveyBuilderBtn")) {
        openSurveyBuilder();
        return;
      }

      if (evt.target.closest("#gwFieldCenterSquareBtn")) {
        openCenterSquarePopup();
      }
    });
  }

  function renderIntoPage() {
    const body = document.getElementById("sheetInfoBody");
    if (!body) return;
    body.innerHTML = renderFieldSheetHtml();
    bind(body);
  }

  function scheduleRender() {
    if (document.getElementById("sheetInfo")?.classList?.contains("is-open")) {
      renderIntoPage();
    }
  }

  window.GridWildField = {
    bind,
    currentSurvey,
    fieldContextEnabled,
    openCenterSquarePopup,
    openNicheSelector,
    renderFieldSheetHtml,
    renderIntoPage,
    setFieldContextVisible
  };

  window.addEventListener("gridwild:localnicheschange", scheduleRender);
  window.addEventListener("gridwild:patchviewchange", scheduleRender);
  window.addEventListener("gridwild:surveyviewchange", scheduleRender);
  window.addEventListener("gwPatchesChanged", scheduleRender);
  window.addEventListener("gwSurveyStateChanged", scheduleRender);
  window.addEventListener("gwSurveyDataReady", scheduleRender);
  window.addEventListener("gwBootstrapDetailsReady", scheduleRender);
})();
