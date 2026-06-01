// -----------------------------------------------------------------------------
// GridWild Fieldmark Book
// HUD entry point for a compact, nested view of identification characters.
// -----------------------------------------------------------------------------

(function () {
  const LANES = [
    ["plant", "Plants"],
    ["cryptogam", "Ferns, mosses, lichens"],
    ["fungus", "Fungi"],
    ["insect", "Insects"]
  ];

  let panel = null;
  let query = "";
  let selectedLane = LANES[0]?.[0] || "";
  let selectedCategory = "";
  let activeMarkId = "";

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyles() {
    if ($("gwFieldGuideBookStyles")) return;
    const style = document.createElement("style");
    style.id = "gwFieldGuideBookStyles";
    style.textContent = `
      .gw-hud-book-btn {
        padding: 0;
        letter-spacing: 0;
      }

      .gw-hud-book-btn svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-field-book-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99980;
        display: grid;
        place-items: center;
        padding: 14px;
        box-sizing: border-box;
        background: rgba(7, 10, 11, 0.62);
        color: #efe6d3;
      }

      .gw-field-book-backdrop[hidden] {
        display: none;
      }

      .gw-field-book-panel {
        position: relative;
        width: min(1180px, calc(100vw - 28px));
        height: min(760px, calc(100vh - 28px));
        min-height: 420px;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid rgba(215,183,116,0.34);
        border-radius: 8px;
        background: rgba(22, 19, 16, 0.965);
        box-shadow: 0 20px 60px rgba(0,0,0,0.42);
        overflow: hidden;
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
      }

      .gw-field-book-head {
        display: grid;
        grid-template-columns: minmax(130px, auto) minmax(180px, 360px) auto;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid rgba(215,183,116,0.18);
      }

      .gw-field-book-title {
        font-size: 15px;
        font-weight: 950;
        color: #f3d58f;
      }

      .gw-field-book-search {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border: 1px solid rgba(215,183,116,0.28);
        border-radius: 7px;
        background: rgba(255,255,255,0.07);
        color: #f7edd8;
        padding: 8px 9px;
        font: inherit;
        outline: none;
      }

      .gw-field-book-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .gw-field-book-btn {
        min-height: 32px;
        border: 1px solid rgba(215,183,116,0.3);
        border-radius: 7px;
        background: rgba(244, 209, 138, 0.12);
        color: #f7edd8;
        font-weight: 900;
        padding: 6px 10px;
      }

      .gw-field-book-scroll {
        min-height: 0;
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        overflow: hidden;
        background: rgba(255,255,255,0.025);
      }

      .gw-field-book-body {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .gw-field-book-filters {
        display: grid;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid rgba(215,183,116,0.14);
        box-sizing: border-box;
        background: rgba(30, 26, 22, 0.72);
      }

      .gw-field-book-fieldset {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }

      .gw-field-book-fieldset legend {
        margin-bottom: 5px;
        color: rgba(239,230,211,0.72);
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-field-book-radio-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 6px;
      }

      .gw-field-book-heading-grid {
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      }

      .gw-field-book-radio {
        min-width: 0;
        min-height: 38px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        padding: 7px 8px;
        border: 1px solid rgba(215,183,116,0.18);
        border-radius: 7px;
        background: rgba(239,230,211,0.055);
        color: rgba(247,237,216,0.88);
        cursor: pointer;
        box-sizing: border-box;
      }

      .gw-field-book-radio:has(input:checked) {
        border-color: rgba(243,213,143,0.68);
        background: rgba(244, 209, 138, 0.18);
        color: #fff3d8;
      }

      .gw-field-book-radio input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: #f3d58f;
      }

      .gw-field-book-radio strong {
        display: block;
        min-width: 0;
        font-size: 11px;
        line-height: 1.15;
        font-weight: 950;
        overflow-wrap: anywhere;
      }

      .gw-field-book-radio small {
        display: block;
        margin-top: 2px;
        color: rgba(239,230,211,0.58);
        font-size: 9.5px;
        font-weight: 800;
      }

      .gw-field-book-list {
        min-height: 0;
        overflow: auto;
      }

      .gw-field-book-list-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(215,183,116,0.14);
        background: rgba(22, 19, 16, 0.985);
        color: rgba(239,230,211,0.68);
        font-size: 10px;
        font-weight: 900;
      }

      .gw-field-book-list-head strong {
        min-width: 0;
        color: #f3d58f;
        font-size: 11px;
        font-weight: 950;
        overflow-wrap: anywhere;
      }

      .gw-field-book-table {
        width: 100%;
        min-width: 620px;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .gw-field-book-table th,
      .gw-field-book-table td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(215,183,116,0.12);
        text-align: left;
        vertical-align: top;
        box-sizing: border-box;
      }

      .gw-field-book-table th {
        color: rgba(239,230,211,0.62);
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
        background: rgba(255,255,255,0.025);
      }

      .gw-field-book-table th:first-child {
        width: 34%;
      }

      .gw-field-book-mark {
        display: inline-block;
        max-width: 100%;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: rgba(247,237,216,0.94);
        font-size: 12px;
        font-family: inherit;
        font-weight: 900;
        line-height: 1.25;
        text-align: left;
        overflow-wrap: anywhere;
        cursor: pointer;
      }

      .gw-field-book-mark:hover,
      .gw-field-book-mark:focus-visible {
        color: #f3d58f;
        text-decoration: underline;
        text-underline-offset: 3px;
        outline: none;
      }

      .gw-field-book-cue {
        color: rgba(239,230,211,0.72);
        font-size: 11px;
        font-weight: 750;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .gw-field-book-chiplist {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        align-content: flex-start;
      }

      .gw-field-book-chip {
        max-width: 100%;
        border: 1px solid rgba(215,183,116,0.22);
        border-radius: 999px;
        background: rgba(239,230,211,0.08);
        color: rgba(247,237,216,0.9);
        padding: 3px 7px;
        font-size: 10.5px;
        font-weight: 800;
        line-height: 1.15;
        white-space: normal;
      }

      .gw-field-book-empty {
        color: rgba(239,230,211,0.36);
        font-size: 11px;
        font-weight: 800;
        padding: 14px 10px;
      }

      .gw-field-book-guide-card {
        position: absolute;
        right: 14px;
        bottom: 14px;
        z-index: 5;
        width: min(420px, calc(100% - 28px));
        max-height: min(560px, calc(100% - 86px));
        overflow: auto;
        padding: 13px;
        border: 1px solid rgba(243,213,143,0.42);
        border-radius: 8px;
        background: rgba(28, 24, 19, 0.985);
        box-shadow: 0 20px 48px rgba(0,0,0,0.5);
        box-sizing: border-box;
      }

      .gw-field-book-guide-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
      }

      .gw-field-book-guide-kicker {
        margin-bottom: 3px;
        color: rgba(239,230,211,0.58);
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
        line-height: 1.25;
      }

      .gw-field-book-guide-title {
        color: #f3d58f;
        font-size: 17px;
        font-weight: 950;
        line-height: 1.12;
        overflow-wrap: anywhere;
      }

      .gw-field-book-guide-close {
        min-height: 28px;
        border: 1px solid rgba(215,183,116,0.25);
        border-radius: 7px;
        background: rgba(255,255,255,0.06);
        color: rgba(247,237,216,0.9);
        font-size: 11px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-field-book-guide-summary {
        margin: 10px 0;
        color: rgba(247,237,216,0.86);
        font-size: 12px;
        font-weight: 760;
        line-height: 1.38;
      }

      .gw-field-book-schematic {
        margin: 10px 0 8px;
        color: #f3d58f;
      }

      .gw-field-book-schematic svg {
        display: block;
        width: 100%;
        max-height: 188px;
        border: 1px solid rgba(215,183,116,0.16);
        border-radius: 8px;
        background: rgba(255,255,255,0.035);
      }

      .gw-field-book-guide-section {
        display: grid;
        gap: 3px;
        padding: 9px 0;
        border-top: 1px solid rgba(215,183,116,0.13);
      }

      .gw-field-book-guide-section strong {
        color: rgba(243,213,143,0.9);
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-field-book-guide-section p {
        margin: 0;
        color: rgba(239,230,211,0.76);
        font-size: 11.5px;
        font-weight: 720;
        line-height: 1.38;
      }

      .gw-field-book-guide-chiprow {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .gw-field-book-guide-chip {
        border: 1px solid rgba(215,183,116,0.2);
        border-radius: 999px;
        padding: 3px 7px;
        background: rgba(239,230,211,0.07);
        color: rgba(247,237,216,0.78);
        font-size: 10px;
        font-weight: 850;
      }

      .gw-field-book-guide-foot {
        margin-top: 3px;
        color: rgba(239,230,211,0.48);
        font-size: 10px;
        font-weight: 850;
      }

      @media (max-width: 720px) {
        .gw-field-book-head {
          grid-template-columns: 1fr auto;
        }

        .gw-field-book-title {
          font-size: 14px;
        }

        .gw-field-book-search {
          grid-column: 1 / -1;
          grid-row: 2;
        }

        .gw-field-book-panel {
          height: calc(100vh - 20px);
          width: calc(100vw - 20px);
        }

        .gw-field-book-radio-grid,
        .gw-field-book-heading-grid {
          grid-template-columns: 1fr;
        }

        .gw-field-book-list-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .gw-field-book-guide-card {
          right: 10px;
          left: 10px;
          bottom: 10px;
          width: auto;
          max-height: min(70vh, calc(100% - 84px));
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    if ($("gwFieldGuideBookBtn")) return;

    const host = document.querySelector(".gw-hud-toolband");
    if (!host) return;

    const btn = document.createElement("button");
    btn.id = "gwFieldGuideBookBtn";
    btn.type = "button";
    btn.className = "gw-pill gw-hud-round-btn gw-hud-book-btn";
    btn.title = "Fieldmark book";
    btn.setAttribute("aria-label", "Open fieldmark book");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 7v14"></path>
        <path d="M4.5 5.5c2.3 0 5 .5 7.5 2.1V21c-2.5-1.6-5.2-2.1-7.5-2.1a1.5 1.5 0 0 1-1.5-1.5V7a1.5 1.5 0 0 1 1.5-1.5Z"></path>
        <path d="M19.5 5.5c-2.3 0-5 .5-7.5 2.1V21c2.5-1.6 5.2-2.1 7.5-2.1A1.5 1.5 0 0 0 21 17.4V7a1.5 1.5 0 0 0-1.5-1.5Z"></path>
      </svg>
    `;
    btn.addEventListener("click", () => togglePanel());
    host.appendChild(btn);
  }

  function markSource() {
    const api = window.GridWildFieldMarks;
    const marks = api?.list?.() || [];
    const categories = api?.categories?.() || [];
    return { marks, categories };
  }

  function matchesQuery(mark) {
    const clean = query.trim().toLowerCase();
    if (!clean) return true;
    const hay = [
      mark.label,
      mark.categoryLabel,
      mark.lane,
      mark.explanation,
      ...(mark.aliases || [])
    ].join(" ").toLowerCase();
    return clean.split(/\s+/).every(word => hay.includes(word));
  }

  function laneLabel(lane) {
    return LANES.find(([key]) => key === lane)?.[1] || lane || "Field marks";
  }

  function syncSelections(categories) {
    if (!LANES.some(([lane]) => lane === selectedLane)) {
      selectedLane = LANES[0]?.[0] || "";
    }

    const available = categories.filter(category => category.lane === selectedLane);
    if (!available.some(category => category.key === selectedCategory)) {
      selectedCategory = available[0]?.key || "";
    }
    return available;
  }

  function renderRadioGrid({ name, value, options, className = "" }) {
    return `
      <div class="gw-field-book-radio-grid ${className}">
        ${options.map(option => `
          <label class="gw-field-book-radio">
            <input type="radio" name="${esc(name)}" value="${esc(option.value)}" ${option.value === value ? "checked" : ""} />
            <span>
              <strong>${esc(option.label)}</strong>
              <small>${esc(option.meta)}</small>
            </span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderFieldRows(marks) {
    if (!marks.length) {
      return `
        <tr>
          <td colspan="2" class="gw-field-book-empty">No field marks match.</td>
        </tr>
      `;
    }

    return marks.map(mark => `
      <tr>
        <td>
          <button class="gw-field-book-mark" type="button" data-gw-fieldmark-id="${esc(mark.id)}">
            ${esc(mark.label)}
          </button>
        </td>
        <td><div class="gw-field-book-cue">${esc(mark.prompt || mark.explanation || "")}</div></td>
      </tr>
    `).join("");
  }

  function fallbackInfoSheet(mark) {
    return {
      title: mark.label,
      eyebrow: `${laneLabel(mark.lane)} / ${mark.categoryLabel || "Field marks"}`,
      summary: mark.explanation || `${mark.label} is a visible field mark.`,
      why: "This clue gets stronger when it agrees with several other field marks from the same organism.",
      lookFor: mark.prompt || "Look for this mark directly on the organism.",
      compare: "Compare it with nearby field marks before making an identification.",
      caution: "Use this as one clue, not as a final identification by itself.",
      sayIt: `Say: "I see ${String(mark.label || "").toLowerCase()}."`,
      schematic: "",
      codexStatus: "Codex link pending",
      directions: []
    };
  }

  function renderInfoSection(title, body) {
    if (!body) return "";
    return `
      <div class="gw-field-book-guide-section">
        <strong>${esc(title)}</strong>
        <p>${esc(body)}</p>
      </div>
    `;
  }

  function renderGuideCard() {
    if (!activeMarkId) return "";
    const api = window.GridWildFieldMarks;
    const mark = api?.get?.(activeMarkId);
    if (!mark) return "";

    const sheet = api?.infoSheet?.(activeMarkId) || mark.infoSheet || fallbackInfoSheet(mark);
    const directions = Array.isArray(sheet.directions) ? sheet.directions.filter(Boolean) : [];

    return `
      <aside class="gw-field-book-guide-card" role="region" aria-label="${esc(sheet.title || mark.label)} guide">
        <div class="gw-field-book-guide-top">
          <div>
            <div class="gw-field-book-guide-kicker">${esc(sheet.eyebrow || mark.categoryLabel || "")}</div>
            <div class="gw-field-book-guide-title">${esc(sheet.title || mark.label)}</div>
          </div>
          <button class="gw-field-book-guide-close" type="button" data-gw-field-card-close>Close</button>
        </div>
        ${sheet.schematic ? `<div class="gw-field-book-schematic">${sheet.schematic}</div>` : ""}
        <div class="gw-field-book-guide-summary">${esc(sheet.summary || mark.explanation || "")}</div>
        ${renderInfoSection("Why It Matters", sheet.why)}
        ${renderInfoSection("Look For", sheet.lookFor)}
        ${renderInfoSection("Compare", sheet.compare)}
        ${renderInfoSection("Use It", sheet.sayIt)}
        ${renderInfoSection("Careful", sheet.caution)}
        ${directions.length ? `
          <div class="gw-field-book-guide-section">
            <strong>Points Toward</strong>
            <div class="gw-field-book-guide-chiprow">
              ${directions.map(label => `<span class="gw-field-book-guide-chip">${esc(label)}</span>`).join("")}
            </div>
          </div>
        ` : ""}
        <div class="gw-field-book-guide-foot">${esc(sheet.codexStatus || "Codex link pending")}</div>
      </aside>
    `;
  }

  function renderMatrix() {
    const root = $("gwFieldBookMatrix");
    if (!root) return;

    const { marks, categories } = markSource();
    const laneCategories = syncSelections(categories);
    const selectedHeading = laneCategories.find(category => category.key === selectedCategory);
    const filteredMarks = marks
      .filter(mark => mark.lane === selectedLane)
      .filter(mark => !selectedCategory || mark.category === selectedCategory)
      .filter(matchesQuery);

    const laneOptions = LANES.map(([lane, label]) => {
      const count = marks.filter(mark => mark.lane === lane).length;
      return {
        value: lane,
        label,
        meta: `${count} field marks`
      };
    });

    const categoryOptions = laneCategories.map(category => {
      const count = marks.filter(mark => mark.lane === selectedLane && mark.category === category.key).length;
      return {
        value: category.key,
        label: category.title,
        meta: `${count} marks`
      };
    });

    root.innerHTML = `
      <div class="gw-field-book-filters">
        <fieldset class="gw-field-book-fieldset">
          <legend>Taxon lane</legend>
          ${renderRadioGrid({ name: "gwFieldBookLane", value: selectedLane, options: laneOptions })}
        </fieldset>
        <fieldset class="gw-field-book-fieldset">
          <legend>Heading</legend>
          ${categoryOptions.length
            ? renderRadioGrid({
                name: "gwFieldBookCategory",
                value: selectedCategory,
                options: categoryOptions,
                className: "gw-field-book-heading-grid"
              })
            : `<div class="gw-field-book-empty">No headings available.</div>`}
        </fieldset>
      </div>
      <div class="gw-field-book-list">
        <div class="gw-field-book-list-head">
          <strong>${esc(selectedHeading?.title || laneLabel(selectedLane))}</strong>
          <span>${filteredMarks.length} matching marks</span>
        </div>
        <table class="gw-field-book-table">
          <thead>
            <tr>
              <th>Field mark</th>
              <th>Cue</th>
            </tr>
          </thead>
          <tbody>
            ${renderFieldRows(filteredMarks)}
          </tbody>
        </table>
      </div>
      ${renderGuideCard()}
    `;
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "gwFieldGuideBookPanel";
    panel.className = "gw-field-book-backdrop";
    panel.hidden = true;
    panel.innerHTML = `
      <section class="gw-field-book-panel" role="dialog" aria-modal="true" aria-labelledby="gwFieldBookTitle">
        <div class="gw-field-book-head">
          <div class="gw-field-book-title" id="gwFieldBookTitle">Fieldmark Book</div>
          <input class="gw-field-book-search" id="gwFieldBookSearch" type="search" placeholder="Search field marks" autocomplete="off" />
          <div class="gw-field-book-actions">
            <button class="gw-field-book-btn" id="gwFieldBookClose" type="button">Close</button>
          </div>
        </div>
        <div class="gw-field-book-scroll">
          <div class="gw-field-book-body" id="gwFieldBookMatrix"></div>
        </div>
      </section>
    `;
    document.body.appendChild(panel);

    $("gwFieldBookClose")?.addEventListener("click", () => togglePanel(false));
    $("gwFieldBookSearch")?.addEventListener("input", evt => {
      query = evt.target.value || "";
      activeMarkId = "";
      renderMatrix();
    });
    $("gwFieldBookMatrix")?.addEventListener("click", evt => {
      const closeBtn = evt.target?.closest?.("[data-gw-field-card-close]");
      if (closeBtn) {
        activeMarkId = "";
        renderMatrix();
        return;
      }

      const markBtn = evt.target?.closest?.("[data-gw-fieldmark-id]");
      if (!markBtn) return;
      activeMarkId = markBtn.dataset.gwFieldmarkId || "";
      renderMatrix();
    });
    $("gwFieldBookMatrix")?.addEventListener("change", evt => {
      const input = evt.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
      activeMarkId = "";
      if (input.name === "gwFieldBookLane") {
        selectedLane = input.value;
        selectedCategory = "";
        renderMatrix();
      } else if (input.name === "gwFieldBookCategory") {
        selectedCategory = input.value;
        renderMatrix();
      }
    });
    panel.addEventListener("click", evt => {
      if (evt.target === panel) togglePanel(false);
    });
    document.addEventListener("keydown", evt => {
      if (evt.key === "Escape" && !panel.hidden) togglePanel(false);
    });
    renderMatrix();
    return panel;
  }

  function togglePanel(show) {
    makePanel();
    const nextHidden = show == null ? !panel.hidden : show !== true;
    panel.hidden = nextHidden;
    const btn = $("gwFieldGuideBookBtn");
    btn?.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
    btn?.classList.toggle("is-on", !panel.hidden);
    if (!panel.hidden) {
      renderMatrix();
      $("gwFieldBookSearch")?.focus();
    }
  }

  function init() {
    injectStyles();
    ensureButton();
    setTimeout(ensureButton, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
