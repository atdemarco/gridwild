// -----------------------------------------------------------------------------
// GridWild Wildlab Classroom
// A modular learning/practice surface that composes Genus Codex and Identify.
// -----------------------------------------------------------------------------

(function () {
  const FEATURE_ALIASES = [
    { terms: ["leaf edge", "leaf margin", "toothed leaf", "saw tooth"], keys: ["serrated_margin", "lobed_leaf"] },
    { terms: ["halteres", "fly balancers", "balancing organs"], keys: ["halteres"] },
    { terms: ["opposite leaves", "opposite leaf"], keys: ["opposite_leaves"] },
    { terms: ["alternate leaves", "alternate leaf"], keys: ["alternate_leaves"] },
    { terms: ["compound leaf", "leaflets"], keys: ["compound_leaf"] },
    { terms: ["palmate leaf", "hand shaped leaf"], keys: ["palmate_leaf"] },
    { terms: ["gills", "mushroom gills"], keys: ["gills"] },
    { terms: ["pores", "mushroom pores"], keys: ["pores"] },
    { terms: ["wasp waist", "narrow waist"], keys: ["wasp_waist"] },
    { terms: ["elytra", "beetle wings", "hard forewings"], keys: ["elytra"] },
    { terms: ["fuzzy body", "hairy body"], keys: ["fuzzy_body"] }
  ];

  const state = {
    mode: "choice",
    records: [],
    recordsLoaded: false,
    loadingRecords: false,
    error: "",
    genusIndex: 0,
    slideIndex: 0,
    keyQuery: "",
    selectedFeatureKeys: new Set(),
    markQuery: "",
    markDispositions: {},
    quizIndex: 0,
    quizRevealed: false
  };

  let activeRoot = null;
  let identifyEmbed = null;
  let keyRoot = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyles() {
    if (document.getElementById("gwClassroomStyles")) return;
    const style = document.createElement("style");
    style.id = "gwClassroomStyles";
    style.textContent = `
      .gw-classroom-backdrop,
      .gw-classroom-key-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        background: rgba(7, 10, 11, 0.74);
        box-sizing: border-box;
        color: #efe6d3;
      }

      .gw-classroom-shell,
      .gw-classroom-key-window {
        width: min(1220px, 97vw);
        max-height: 93vh;
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid rgba(145, 210, 244, 0.36);
        background:
          radial-gradient(circle at 12% 0%, rgba(145,210,244,0.14), transparent 32%),
          linear-gradient(180deg, rgba(30,35,32,0.99), rgba(14,17,18,0.99));
        box-shadow: 0 24px 80px rgba(0,0,0,0.62);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .gw-classroom-key-window {
        width: min(940px, 96vw);
      }

      .gw-classroom-head,
      .gw-classroom-toolbar,
      .gw-classroom-key-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.09);
      }

      .gw-classroom-kicker {
        color: #91d2f4;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .gw-classroom-title {
        margin-top: 3px;
        color: #f0d18a;
        font-size: 22px;
        font-weight: 950;
        line-height: 1.08;
      }

      .gw-classroom-close,
      .gw-classroom-btn,
      .gw-classroom-tab,
      .gw-classroom-choice,
      .gw-classroom-chip,
      .gw-classroom-result-btn {
        border: 1px solid rgba(215,183,116,0.28);
        border-radius: 8px;
        color: #efe6d3;
        background: rgba(255,255,255,0.06);
        font-weight: 950;
        cursor: pointer;
      }

      .gw-classroom-close {
        width: 34px;
        height: 34px;
        color: #f0d18a;
        font-size: 17px;
      }

      .gw-classroom-body {
        min-height: 0;
        overflow: auto;
        padding: 14px;
      }

      .gw-classroom-choice-grid {
        min-height: min(520px, 70vh);
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        align-content: center;
      }

      .gw-classroom-choice {
        min-height: 180px;
        display: grid;
        align-content: center;
        gap: 8px;
        padding: 20px;
        text-align: left;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035));
      }

      .gw-classroom-choice b {
        color: #f0d18a;
        font-size: 28px;
        line-height: 1;
      }

      .gw-classroom-choice span,
      .gw-classroom-muted {
        color: rgba(239,230,211,0.66);
        font-size: 12px;
      }

      .gw-classroom-toolbar {
        padding: 0 0 12px;
        border-bottom: 0;
      }

      .gw-classroom-tabs,
      .gw-classroom-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .gw-classroom-tab,
      .gw-classroom-btn,
      .gw-classroom-result-btn {
        min-height: 36px;
        padding: 8px 11px;
        font-size: 12px;
      }

      .gw-classroom-tab.is-active,
      .gw-classroom-btn.primary,
      .gw-classroom-chip.is-selected {
        color: #10251d;
        background: #91d2f4;
        border-color: rgba(255,255,255,0.52);
      }

      .gw-classroom-learn-grid {
        min-height: 620px;
        display: grid;
        grid-template-columns: minmax(320px, 0.84fr) minmax(0, 1.42fr);
        gap: 12px;
      }

      .gw-classroom-panel {
        min-height: 0;
        border: 1px solid rgba(215,183,116,0.18);
        border-radius: 14px;
        background: rgba(0,0,0,0.16);
        overflow: hidden;
      }

      .gw-classroom-codex-panel {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
      }

      .gw-classroom-codex-card {
        min-height: 0;
        overflow: auto;
        padding: 10px;
      }

      .gw-classroom-codex-card .gw-codex-card-embedded {
        width: 100%;
        max-height: none;
        min-height: 100%;
        border-radius: 12px;
        box-shadow: none;
      }

      .gw-classroom-loop-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid rgba(255,255,255,0.08);
      }

      .gw-classroom-identify-panel {
        height: min(680px, 74vh);
        min-height: 560px;
        padding: 12px;
        overflow: hidden;
      }

      .gw-classroom-identify-panel .gw-identify-embed-mount {
        height: 100%;
        min-height: 0;
      }

      .gw-classroom-practice-grid {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(330px, 0.48fr);
        align-items: start;
        gap: 12px;
      }

      .gw-classroom-side {
        max-height: min(680px, 74vh);
        padding: 14px;
        overflow: auto;
      }

      .gw-classroom-side-title {
        color: #f0d18a;
        font-size: 14px;
        font-weight: 950;
      }

      .gw-fieldmark-practice {
        display: grid;
        gap: 12px;
      }

      .gw-fieldmark-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-fieldmark-count {
        flex: 0 0 auto;
        min-width: 54px;
        border-radius: 8px;
        border: 1px solid rgba(145,210,244,0.22);
        background: rgba(145,210,244,0.08);
        padding: 6px 8px;
        color: #91d2f4;
        font-size: 11px;
        font-weight: 950;
        text-align: center;
      }

      .gw-fieldmark-quiz,
      .gw-fieldmark-suggestions,
      .gw-fieldmark-active,
      .gw-fieldmark-category {
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.045);
        padding: 10px;
      }

      .gw-fieldmark-mini-title {
        color: #f0d18a;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-fieldmark-term {
        margin-top: 6px;
        color: #efe6d3;
        font-size: 16px;
        font-weight: 950;
        line-height: 1.12;
      }

      .gw-fieldmark-explain,
      .gw-fieldmark-prompt,
      .gw-fieldmark-chip,
      .gw-fieldmark-suggestion-desc {
        color: rgba(239,230,211,0.66);
        font-size: 11px;
        line-height: 1.3;
      }

      .gw-fieldmark-prompt {
        margin-top: 5px;
      }

      .gw-fieldmark-explain {
        margin-top: 7px;
        color: rgba(239,230,211,0.78);
      }

      .gw-fieldmark-controls,
      .gw-fieldmark-quiz-actions,
      .gw-fieldmark-active-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .gw-fieldmark-mark-btn {
        min-height: 28px;
        border-radius: 7px;
        border: 1px solid rgba(215,183,116,0.24);
        color: rgba(239,230,211,0.78);
        background: rgba(0,0,0,0.14);
        padding: 5px 7px;
        font-size: 10px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-fieldmark-mark-btn.is-seen {
        color: #10251d;
        background: #9ee6bd;
      }

      .gw-fieldmark-mark-btn.is-out {
        color: #ffe4df;
        background: rgba(190,70,60,0.34);
      }

      .gw-fieldmark-search {
        width: 100%;
        min-height: 36px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(145,210,244,0.30);
        color: #efe6d3;
        background: rgba(0,0,0,0.22);
        padding: 8px 10px;
        font: inherit;
        font-size: 12px;
        outline: none;
      }

      .gw-fieldmark-list {
        display: grid;
        gap: 8px;
      }

      .gw-fieldmark-category {
        padding: 8px;
      }

      .gw-fieldmark-category-title {
        color: #91d2f4;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .gw-fieldmark-card {
        margin-top: 7px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.13);
        padding: 8px;
      }

      .gw-fieldmark-card.is-seen {
        border-color: rgba(158,230,189,0.48);
        background: rgba(80,180,120,0.12);
      }

      .gw-fieldmark-card.is-out {
        border-color: rgba(255,140,125,0.38);
        background: rgba(150,45,40,0.16);
      }

      .gw-fieldmark-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .gw-fieldmark-card-label {
        min-width: 0;
        color: #efe6d3;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-fieldmark-badge {
        flex: 0 0 auto;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        padding: 2px 6px;
        color: rgba(239,230,211,0.62);
        font-size: 9px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-fieldmark-suggestion {
        display: grid;
        gap: 3px;
        padding: 7px 0;
        border-top: 1px solid rgba(255,255,255,0.08);
      }

      .gw-fieldmark-suggestion:first-of-type {
        border-top: 0;
      }

      .gw-fieldmark-suggestion-name {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: #efe6d3;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-classroom-key-body {
        min-height: 0;
        overflow: auto;
        padding: 14px;
      }

      .gw-classroom-key-input {
        width: 100%;
        min-height: 42px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(145,210,244,0.30);
        color: #efe6d3;
        background: rgba(0,0,0,0.22);
        padding: 9px 11px;
        font: inherit;
        font-size: 13px;
        outline: none;
      }

      .gw-classroom-chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin: 12px 0;
      }

      .gw-classroom-chip {
        min-height: 30px;
        padding: 6px 9px;
        font-size: 11px;
      }

      .gw-classroom-results {
        display: grid;
        gap: 8px;
      }

      .gw-classroom-result {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.045);
        padding: 10px;
      }

      .gw-classroom-result-name {
        color: #f0d18a;
        font-weight: 950;
      }

      .gw-classroom-result-meta {
        margin-top: 2px;
        color: rgba(239,230,211,0.62);
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-classroom-result-actions {
        display: flex;
        gap: 6px;
      }

      @media (max-width: 820px) {
        .gw-classroom-choice-grid,
        .gw-classroom-learn-grid,
        .gw-classroom-practice-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .gw-classroom-learn-grid,
        .gw-classroom-practice-grid {
          min-height: 0;
        }

        .gw-classroom-identify-panel {
          height: auto;
          min-height: 560px;
        }

        .gw-classroom-side {
          max-height: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function close() {
    identifyEmbed?.destroy?.();
    identifyEmbed = null;
    activeRoot?.remove();
    activeRoot = null;
    closeKeyWindow();
  }

  async function ensureRecords() {
    if (state.recordsLoaded || state.loadingRecords) return state.records;
    state.loadingRecords = true;
    state.error = "";
    render();

    try {
      await window.GridWildGenusCodex?.load?.();
      state.records = window.GridWildGenusCodex?.listRecords?.() || [];
      state.recordsLoaded = true;
      if (!state.records.length) {
        state.error = "No codex records loaded.";
      }
    } catch (err) {
      console.warn("Wildlab Classroom could not load genus codex records:", err);
      state.records = [];
      state.error = err.message || "Could not load codex records.";
    } finally {
      state.loadingRecords = false;
      render();
      renderKeyWindow();
    }

    return state.records;
  }

  function open(options = {}) {
    injectStyles();
    window.GridWildGenusCodex?.ensureStyles?.();

    close();
    state.mode = options.mode || "choice";

    activeRoot = document.createElement("div");
    activeRoot.className = "gw-classroom-backdrop";
    document.body.appendChild(activeRoot);
    activeRoot.addEventListener("click", evt => {
      if (evt.target === activeRoot) close();
    });

    render();
    ensureRecords();
  }

  function currentRecord() {
    if (!state.records.length) return null;
    const safeIndex = ((state.genusIndex % state.records.length) + state.records.length) % state.records.length;
    return state.records[safeIndex] || null;
  }

  function setMode(mode) {
    state.mode = mode;
    render();
  }

  function shiftGenus(delta) {
    if (!state.records.length) return;
    state.genusIndex = (state.genusIndex + delta + state.records.length) % state.records.length;
    state.slideIndex = 0;
    render();
  }

  function shiftSlide(delta) {
    const rec = currentRecord();
    const slideCount = Math.max(1, rec?.lore?.length || 1);
    state.slideIndex = (state.slideIndex + delta + slideCount) % slideCount;
    render();
  }

  function renderShell(bodyHtml) {
    return `
      <div class="gw-classroom-shell">
        <div class="gw-classroom-head">
          <div>
            <div class="gw-classroom-kicker">Wildlab Classroom</div>
            <div class="gw-classroom-title">Classroom</div>
          </div>
          <button class="gw-classroom-close" type="button" data-gw-classroom-close aria-label="Close Classroom">x</button>
        </div>
        <div class="gw-classroom-body">
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  function renderChoice() {
    return renderShell(`
      <div class="gw-classroom-choice-grid">
        <button class="gw-classroom-choice" type="button" data-gw-classroom-mode="learn">
          <b>Learn</b>
          <span>Codex loop, Identify lab, and feature key.</span>
        </button>
        <button class="gw-classroom-choice" type="button" data-gw-classroom-mode="practice">
          <b>Practice</b>
          <span>Identify deck with Key support.</span>
        </button>
      </div>
    `);
  }

  function renderToolbar() {
    return `
      <div class="gw-classroom-toolbar">
        <div class="gw-classroom-tabs">
          <button class="gw-classroom-tab ${state.mode === "learn" ? "is-active" : ""}" type="button" data-gw-classroom-mode="learn">Learn</button>
          <button class="gw-classroom-tab ${state.mode === "practice" ? "is-active" : ""}" type="button" data-gw-classroom-mode="practice">Practice</button>
        </div>
        <div class="gw-classroom-actions">
          <button class="gw-classroom-btn" type="button" data-gw-classroom-key>Key</button>
          <button class="gw-classroom-btn" type="button" data-gw-classroom-mode="choice">Start</button>
        </div>
      </div>
    `;
  }

  function renderCodexLoop() {
    const rec = currentRecord();
    const cardHtml = state.loadingRecords
      ? `<div class="gw-classroom-muted" style="padding:14px;">Loading codex...</div>`
      : state.error
        ? `<div class="gw-classroom-muted" style="padding:14px;">${esc(state.error)}</div>`
        : window.GridWildGenusCodex?.renderRecordCardHtml?.(rec, { slideIndex: state.slideIndex }) || "";

    return `
      <section class="gw-classroom-panel gw-classroom-codex-panel">
        <div class="gw-classroom-codex-card">
          ${cardHtml}
        </div>
        <div class="gw-classroom-loop-controls">
          <button class="gw-classroom-btn" type="button" data-gw-classroom-prev>Prev</button>
          <button class="gw-classroom-btn" type="button" data-gw-classroom-slide>Note</button>
          <button class="gw-classroom-btn" type="button" data-gw-classroom-next>Next</button>
          <button class="gw-classroom-btn primary" type="button" data-gw-classroom-open-codex ${rec ? "" : "disabled"}>Codex</button>
        </div>
      </section>
    `;
  }

  function renderLearn() {
    return renderShell(`
      ${renderToolbar()}
      <div class="gw-classroom-learn-grid">
        ${renderCodexLoop()}
        <section class="gw-classroom-panel gw-classroom-identify-panel">
          <div id="gwClassroomIdentifyMount"></div>
        </section>
      </div>
    `);
  }

  function fieldMarks() {
    return window.GridWildFieldMarks?.list?.() || [];
  }

  function filteredFieldMarks() {
    return window.GridWildFieldMarks?.search?.(state.markQuery) || fieldMarks();
  }

  function markDisposition(id) {
    return state.markDispositions[id] || "unsure";
  }

  function activeMarkRows() {
    return Object.entries(state.markDispositions)
      .map(([id, disposition]) => ({ mark: window.GridWildFieldMarks?.get?.(id), disposition }))
      .filter(row => row.mark && row.disposition !== "unsure");
  }

  function setMarkDisposition(id, disposition) {
    if (!id) return;
    if (!disposition || disposition === "unsure") delete state.markDispositions[id];
    else state.markDispositions[id] = disposition;
    refreshPracticeKeyPanel();
  }

  function currentQuizMark() {
    const marks = fieldMarks();
    if (!marks.length) return null;
    const idx = ((state.quizIndex % marks.length) + marks.length) % marks.length;
    return marks[idx] || marks[0];
  }

  function moveQuiz(delta = 1) {
    state.quizIndex = window.GridWildFieldMarks?.nextQuizIndex?.(state.quizIndex, delta) || 0;
    state.quizRevealed = false;
    refreshPracticeKeyPanel();
  }

  function renderPracticeKeyPanel() {
    const allMarks = fieldMarks();
    return `
      <aside class="gw-classroom-panel gw-classroom-side" id="gwClassroomPracticeKeyPanel">
        <div class="gw-fieldmark-practice">
          <div class="gw-fieldmark-heading">
            <div>
              <div class="gw-classroom-side-title">Field Marks</div>
              <div class="gw-classroom-muted">Tap what you see, rule out what you do not, and let the marks steer practice.</div>
            </div>
            <div class="gw-fieldmark-count">${allMarks.length}</div>
          </div>

          <div data-gw-field-quiz>
            ${renderQuizletCard()}
          </div>

          <div data-gw-field-summary>
            ${renderMarkSummary()}
          </div>

          <input
            class="gw-fieldmark-search"
            type="text"
            value="${esc(state.markQuery)}"
            placeholder="Search field marks"
            data-gw-field-search
          >

          <div class="gw-fieldmark-list" data-gw-field-list>
            ${renderMarkList()}
          </div>
        </div>
      </aside>
    `;
  }

  function renderQuizletCard() {
    const mark = currentQuizMark();
    if (!mark) {
      return `
        <div class="gw-fieldmark-quiz">
          <div class="gw-fieldmark-mini-title">Quizlet</div>
          <div class="gw-classroom-muted">Field marks are loading.</div>
        </div>
      `;
    }

    const disposition = markDisposition(mark.id);
    return `
      <div class="gw-fieldmark-quiz">
        <div class="gw-fieldmark-mini-title">Quizlet</div>
        <div class="gw-fieldmark-term">${esc(mark.label)}</div>
        <div class="gw-fieldmark-prompt">${esc(mark.prompt)}</div>
        ${state.quizRevealed ? `<div class="gw-fieldmark-explain">${esc(mark.explanation)}</div>` : ""}
        <div class="gw-fieldmark-quiz-actions">
          ${renderDispositionButton(mark.id, "seen", disposition)}
          ${renderDispositionButton(mark.id, "out", disposition)}
          ${renderDispositionButton(mark.id, "unsure", disposition)}
          <button class="gw-fieldmark-mark-btn" type="button" data-gw-field-reveal>
            ${state.quizRevealed ? "Hide" : "Explain"}
          </button>
          <button class="gw-fieldmark-mark-btn" type="button" data-gw-field-next>Next</button>
        </div>
      </div>
    `;
  }

  function renderMarkSummary() {
    const active = activeMarkRows();
    const suggestions = window.GridWildFieldMarks?.suggestionsFor?.(state.markDispositions) || [];

    return `
      <div class="gw-fieldmark-active">
        <div class="gw-fieldmark-mini-title">Current evidence</div>
        ${
          active.length
            ? `<div class="gw-fieldmark-active-row">
                ${active.map(row => `
                  <button
                    class="gw-fieldmark-mark-btn ${row.disposition === "seen" ? "is-seen" : "is-out"}"
                    type="button"
                    data-gw-field-mark="${esc(row.mark.id)}"
                    data-gw-field-disposition="unsure"
                  >
                    ${row.disposition === "seen" ? "Seen" : "Out"}: ${esc(row.mark.label)}
                  </button>
                `).join("")}
              </div>`
            : `<div class="gw-classroom-muted" style="margin-top:6px;">No field marks selected yet.</div>`
        }
      </div>

      <div class="gw-fieldmark-suggestions">
        <div class="gw-fieldmark-mini-title">Possible directions</div>
        ${
          suggestions.length
            ? suggestions.slice(0, 5).map(row => `
                <div class="gw-fieldmark-suggestion">
                  <div class="gw-fieldmark-suggestion-name">
                    <span>${esc(row.label)}</span>
                    <span>${row.score > 0 ? "+" : ""}${row.score.toFixed(1)}</span>
                  </div>
                  <div class="gw-fieldmark-suggestion-desc">${esc(row.desc)}</div>
                </div>
              `).join("")
            : `<div class="gw-classroom-muted" style="margin-top:6px;">Select marks to get broad suggestions.</div>`
        }
      </div>
    `;
  }

  function renderMarkList() {
    const marks = filteredFieldMarks();
    if (!marks.length) {
      return `<div class="gw-classroom-muted">No field marks matched.</div>`;
    }

    const groups = window.GridWildFieldMarks?.grouped?.(marks) || [];
    return groups.map(group => `
      <div class="gw-fieldmark-category">
        <div class="gw-fieldmark-category-title">${esc(group.title)}</div>
        ${group.marks.map(renderMarkCard).join("")}
      </div>
    `).join("");
  }

  function renderMarkCard(mark) {
    const disposition = markDisposition(mark.id);
    const stateClass = disposition === "seen" ? "is-seen" : disposition === "out" ? "is-out" : "";
    return `
      <div class="gw-fieldmark-card ${stateClass}">
        <div class="gw-fieldmark-card-head">
          <div>
            <div class="gw-fieldmark-card-label">${esc(mark.label)}</div>
            <div class="gw-fieldmark-prompt">${esc(mark.prompt)}</div>
          </div>
          <div class="gw-fieldmark-badge">${esc(disposition === "out" ? "ruled out" : disposition)}</div>
        </div>
        <div class="gw-fieldmark-controls">
          ${renderDispositionButton(mark.id, "seen", disposition)}
          ${renderDispositionButton(mark.id, "out", disposition)}
          ${renderDispositionButton(mark.id, "unsure", disposition)}
        </div>
      </div>
    `;
  }

  function renderDispositionButton(id, value, disposition) {
    const label = value === "seen" ? "Seen" : value === "out" ? "Rule out" : "Unsure";
    const cls = value === "seen" && disposition === "seen"
      ? "is-seen"
      : value === "out" && disposition === "out"
        ? "is-out"
        : "";

    return `
      <button
        class="gw-fieldmark-mark-btn ${cls}"
        type="button"
        data-gw-field-mark="${esc(id)}"
        data-gw-field-disposition="${esc(value)}"
      >
        ${esc(label)}
      </button>
    `;
  }

  function renderPractice() {
    return renderShell(`
      ${renderToolbar()}
      <div class="gw-classroom-practice-grid">
        <section class="gw-classroom-panel gw-classroom-identify-panel">
          <div id="gwClassroomIdentifyMount"></div>
        </section>
        ${renderPracticeKeyPanel()}
      </div>
    `);
  }

  function render() {
    if (!activeRoot) return;
    identifyEmbed?.destroy?.();
    identifyEmbed = null;

    if (state.mode === "learn") {
      activeRoot.innerHTML = renderLearn();
    } else if (state.mode === "practice") {
      activeRoot.innerHTML = renderPractice();
    } else {
      activeRoot.innerHTML = renderChoice();
    }

    bind(activeRoot);

    if (state.mode === "learn" || state.mode === "practice") {
      const mount = activeRoot.querySelector("#gwClassroomIdentifyMount");
      identifyEmbed = window.GridWildIdentify?.mountEmbeddedPane?.(mount, { fetch: true }) || null;
    }
  }

  function bind(root) {
    root.querySelector("[data-gw-classroom-close]")?.addEventListener("click", close);

    root.querySelectorAll("[data-gw-classroom-mode]").forEach(btn => {
      btn.addEventListener("click", evt => {
        evt.preventDefault();
        setMode(btn.dataset.gwClassroomMode || "choice");
      });
    });

    root.querySelector("[data-gw-classroom-prev]")?.addEventListener("click", () => shiftGenus(-1));
    root.querySelector("[data-gw-classroom-next]")?.addEventListener("click", () => shiftGenus(1));
    root.querySelector("[data-gw-classroom-slide]")?.addEventListener("click", () => shiftSlide(1));
    root.querySelector("[data-gw-classroom-key]")?.addEventListener("click", openKeyWindow);
    root.querySelector("[data-gw-classroom-open-codex]")?.addEventListener("click", () => {
      const rec = currentRecord();
      if (rec?.genus) window.GridWildGenusCodex?.open?.(rec.genus);
    });

    bindPracticeKey(root);
  }

  function refreshPracticeKeyPanel() {
    const root = activeRoot;
    if (!root?.isConnected) return;

    const summary = root.querySelector("[data-gw-field-summary]");
    if (summary) summary.innerHTML = renderMarkSummary();

    const list = root.querySelector("[data-gw-field-list]");
    if (list) list.innerHTML = renderMarkList();

    const quiz = root.querySelector("[data-gw-field-quiz]");
    if (quiz) quiz.innerHTML = renderQuizletCard();

    bindPracticeKey(root);
  }

  function bindPracticeKey(root) {
    if (!root) return;

    const search = root.querySelector("[data-gw-field-search]");
    if (search && !search.__gwFieldMarkBound) {
      search.__gwFieldMarkBound = true;
      search.addEventListener("input", evt => {
        state.markQuery = evt.target.value || "";
        refreshPracticeKeyPanel();
        const nextSearch = activeRoot?.querySelector("[data-gw-field-search]");
        if (nextSearch) {
          nextSearch.focus();
          const end = nextSearch.value.length;
          nextSearch.setSelectionRange?.(end, end);
        }
      });
    }

    root.querySelectorAll("[data-gw-field-mark]").forEach(btn => {
      if (btn.__gwFieldMarkBound) return;
      btn.__gwFieldMarkBound = true;
      btn.addEventListener("click", evt => {
        evt.preventDefault();
        evt.stopPropagation();
        setMarkDisposition(btn.dataset.gwFieldMark, btn.dataset.gwFieldDisposition || "unsure");
      });
    });

    root.querySelectorAll("[data-gw-field-next]").forEach(btn => {
      if (btn.__gwFieldMarkBound) return;
      btn.__gwFieldMarkBound = true;
      btn.addEventListener("click", evt => {
        evt.preventDefault();
        evt.stopPropagation();
        moveQuiz(1);
      });
    });

    root.querySelectorAll("[data-gw-field-reveal]").forEach(btn => {
      if (btn.__gwFieldMarkBound) return;
      btn.__gwFieldMarkBound = true;
      btn.addEventListener("click", evt => {
        evt.preventDefault();
        evt.stopPropagation();
        state.quizRevealed = !state.quizRevealed;
        refreshPracticeKeyPanel();
      });
    });
  }

  function featureOptions() {
    const marks = window.GridWildFieldMarks?.list?.() || Object.entries(window.GridWildGenusCodex?.fieldMarks || {})
      .map(([key, value]) => ({ id: key, label: value.label || key, explanation: value.desc || "" }));
    return marks
      .map(mark => ({ key: mark.id, label: mark.label || mark.id, desc: mark.explanation || mark.desc || "" }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function normalizeFeatureText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function featureGroupsFromQuery(query) {
    const clean = normalizeFeatureText(query);
    if (!clean) return [];
    return FEATURE_ALIASES
      .filter(alias => alias.terms.some(term => clean.includes(normalizeFeatureText(term))))
      .map(alias => alias.keys);
  }

  function textTokens(query) {
    const groups = featureGroupsFromQuery(query);
    if (groups.length) return [];
    return normalizeFeatureText(query)
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  function recordSearchText(rec) {
    const marks = window.GridWildGenusCodex?.fieldMarks || {};
    const markText = (rec?.fieldMarks || [])
      .map(key => `${marks[key]?.label || ""} ${marks[key]?.desc || ""}`)
      .join(" ");
    return normalizeFeatureText([
      rec?.genus,
      rec?.common,
      rec?.family,
      rec?.badge,
      markText,
      ...(rec?.lore || []),
      ...(rec?.facts || [])
    ].join(" "));
  }

  function recordMatchesFeature(rec, key) {
    if ((rec?.fieldMarks || []).includes(key)) return true;
    const mark = window.GridWildFieldMarks?.get?.(key) || window.GridWildGenusCodex?.fieldMarks?.[key];
    if (!mark) return false;
    const hay = recordSearchText(rec);
    return normalizeFeatureText(`${mark.label} ${mark.explanation || mark.desc || ""}`)
      .split(/\s+/)
      .filter(token => token.length > 3)
      .some(token => hay.includes(token));
  }

  function filterRecords() {
    const records = state.records || [];
    const selectedGroups = [...state.selectedFeatureKeys].map(key => [key]);
    const queryGroups = featureGroupsFromQuery(state.keyQuery);
    const groups = [...selectedGroups, ...queryGroups];
    const tokens = textTokens(state.keyQuery);

    const scored = records
      .map(rec => {
        const hay = recordSearchText(rec);
        let score = 0;

        const groupOk = groups.every(group => {
          const hit = group.some(key => recordMatchesFeature(rec, key));
          if (hit) score += 8;
          return hit;
        });

        if (!groupOk) return null;

        const tokenOk = tokens.every(token => {
          const hit = hay.includes(token);
          if (hit) score += 3;
          return hit;
        });

        if (!tokenOk) return null;
        score += (rec.fieldMarks || []).length;
        return { rec, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(a.rec.genus).localeCompare(String(b.rec.genus)));

    if (!groups.length && !tokens.length) {
      return records
        .filter(rec => (rec.fieldMarks || []).length)
        .slice(0, 18);
    }

    return scored.map(row => row.rec).slice(0, 24);
  }

  function openKeyWindow() {
    injectStyles();
    window.GridWildGenusCodex?.ensureStyles?.();
    keyRoot?.remove();

    keyRoot = document.createElement("div");
    keyRoot.className = "gw-classroom-key-backdrop";
    document.body.appendChild(keyRoot);
    keyRoot.addEventListener("click", evt => {
      if (evt.target === keyRoot) closeKeyWindow();
    });

    renderKeyWindow();
    ensureRecords();
  }

  function closeKeyWindow() {
    keyRoot?.remove();
    keyRoot = null;
  }

  function renderKeyWindow() {
    if (!keyRoot) return;
    const options = featureOptions();
    keyRoot.innerHTML = `
      <div class="gw-classroom-key-window">
        <div class="gw-classroom-key-head">
          <div>
            <div class="gw-classroom-kicker">Wildlab Key</div>
            <div class="gw-classroom-title">Key</div>
          </div>
          <button class="gw-classroom-close" type="button" data-gw-classroom-key-close aria-label="Close Key">x</button>
        </div>
        <div class="gw-classroom-key-body">
          <input
            class="gw-classroom-key-input"
            type="text"
            value="${esc(state.keyQuery)}"
            data-gw-classroom-key-input
            placeholder="leaf edge, halteres, gills"
          >
          <div class="gw-classroom-chip-grid">
            ${options.map(option => `
              <button
                class="gw-classroom-chip ${state.selectedFeatureKeys.has(option.key) ? "is-selected" : ""}"
                type="button"
                data-gw-classroom-feature="${esc(option.key)}"
                title="${esc(option.desc)}"
              >
                ${esc(option.label)}
              </button>
            `).join("")}
          </div>
          <div class="gw-classroom-results" data-gw-classroom-results>
            ${renderKeyResults()}
          </div>
        </div>
      </div>
    `;
    bindKeyWindow(keyRoot);
  }

  function renderKeyResults() {
    if (state.loadingRecords) {
      return `<div class="gw-classroom-muted">Loading codex...</div>`;
    }
    if (state.error) {
      return `<div class="gw-classroom-muted">${esc(state.error)}</div>`;
    }

    const results = filterRecords();
    if (!results.length) {
      return `<div class="gw-classroom-muted">No possibles matched.</div>`;
    }

    return results.map(rec => {
      const marks = (rec.fieldMarks || [])
        .map(key => window.GridWildGenusCodex?.fieldMarks?.[key]?.label || key)
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");

      return `
        <div class="gw-classroom-result">
          <div>
            <div class="gw-classroom-result-name">${esc(rec.genus)}</div>
            <div class="gw-classroom-result-meta">${esc(rec.family || "family unknown")}${marks ? ` - ${esc(marks)}` : ""}</div>
          </div>
          <div class="gw-classroom-result-actions">
            <button class="gw-classroom-result-btn" type="button" data-gw-classroom-study="${esc(rec.genus)}">Study</button>
            <button class="gw-classroom-result-btn" type="button" data-gw-classroom-codex="${esc(rec.genus)}">Codex</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function refreshKeyResults(root) {
    const results = root.querySelector("[data-gw-classroom-results]");
    if (results) results.innerHTML = renderKeyResults();
  }

  function bindKeyWindow(root) {
    root.querySelector("[data-gw-classroom-key-close]")?.addEventListener("click", closeKeyWindow);
    root.querySelector("[data-gw-classroom-key-input]")?.addEventListener("input", evt => {
      state.keyQuery = evt.target.value || "";
      refreshKeyResults(root);
    });

    root.querySelectorAll("[data-gw-classroom-feature]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.gwClassroomFeature;
        if (state.selectedFeatureKeys.has(key)) state.selectedFeatureKeys.delete(key);
        else state.selectedFeatureKeys.add(key);
        renderKeyWindow();
      });
    });

    root.querySelectorAll("[data-gw-classroom-codex]").forEach(btn => {
      btn.addEventListener("click", () => {
        window.GridWildGenusCodex?.open?.(btn.dataset.gwClassroomCodex);
      });
    });

    root.querySelectorAll("[data-gw-classroom-study]").forEach(btn => {
      btn.addEventListener("click", () => {
        const genus = btn.dataset.gwClassroomStudy || "";
        const idx = state.records.findIndex(rec => rec.genus === genus);
        if (idx >= 0) {
          state.genusIndex = idx;
          state.slideIndex = 0;
          state.mode = "learn";
          closeKeyWindow();
          if (!activeRoot) open({ mode: "learn" });
          else render();
        }
      });
    });
  }

  document.addEventListener("click", evt => {
    const btn = evt.target.closest("[data-gw-classroom-open]");
    if (!btn) return;
    evt.preventDefault();
    evt.stopPropagation();
    open();
  });

  document.addEventListener("keydown", evt => {
    if (evt.key !== "Escape") return;
    if (keyRoot?.isConnected) {
      closeKeyWindow();
      return;
    }
    if (activeRoot?.isConnected) close();
  });

  window.GridWildClassroom = {
    open,
    close,
    openKeyWindow,
    filterRecords,
    getState: () => ({
      mode: state.mode,
      recordsLoaded: state.recordsLoaded,
      records: state.records.length,
      genusIndex: state.genusIndex,
      keyQuery: state.keyQuery,
      selectedFeatureKeys: [...state.selectedFeatureKeys]
    })
  };
})();
