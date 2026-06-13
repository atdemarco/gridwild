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
  const exemplarCache = new Map();
  const familyTaxonCache = new Map();
  let exemplarLoadSeq = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function shouldAvoidSearchAutofocus() {
    return (
      window.matchMedia?.("(pointer: coarse), (max-width: 760px)")?.matches ||
      window.innerWidth <= 760
    );
  }

  function focusInitialPanelTarget() {
    if (shouldAvoidSearchAutofocus()) {
      $("gwFieldBookClose")?.focus({ preventScroll: true });
      return;
    }

    $("gwFieldBookSearch")?.focus();
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

      .gw-field-book-thumb-plate {
        margin: 10px 0 8px;
        display: grid;
        gap: 6px;
      }

      .gw-field-book-thumb-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
      }

      .gw-field-book-thumb-cell {
        position: relative;
        min-width: 0;
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid rgba(215,183,116,0.16);
        border-radius: 5px;
        background: rgba(255,255,255,0.055);
      }

      .gw-field-book-thumb-cell img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .gw-field-book-thumb-cell.is-empty {
        background:
          linear-gradient(135deg, rgba(243,213,143,0.09), rgba(255,255,255,0.035)),
          rgba(255,255,255,0.035);
      }

      .gw-field-book-thumb-cell.is-loading::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(243,213,143,0.12), transparent);
        animation: gwFieldBookThumbLoad 1.2s linear infinite;
        transform: translateX(-100%);
      }

      .gw-field-book-thumb-note {
        color: rgba(239,230,211,0.52);
        font-size: 9.5px;
        font-weight: 850;
        line-height: 1.25;
      }

      @keyframes gwFieldBookThumbLoad {
        to {
          transform: translateX(100%);
        }
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

      @media (max-width: 860px), (pointer: coarse) {
        .gw-field-book-backdrop {
          align-items: stretch;
          justify-items: stretch;
          padding: max(6px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left));
        }

        .gw-field-book-head {
          grid-template-columns: 1fr auto;
          align-items: start;
          padding: 9px;
        }

        .gw-field-book-title {
          font-size: 14px;
          align-self: center;
        }

        .gw-field-book-search {
          grid-column: 1 / -1;
          grid-row: 2;
        }

        .gw-field-book-panel {
          width: 100%;
          max-width: 100%;
          height: calc(100vh - 12px);
          height: calc(100dvh - 12px);
          min-height: 0;
        }

        .gw-field-book-scroll {
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        .gw-field-book-body {
          display: block;
          min-height: 0;
        }

        .gw-field-book-filters {
          padding: 9px;
        }

        .gw-field-book-radio-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .gw-field-book-heading-grid {
          grid-template-columns: 1fr;
        }

        .gw-field-book-radio {
          min-height: 36px;
          padding: 7px;
        }

        .gw-field-book-list {
          overflow: visible;
        }

        .gw-field-book-list-head {
          align-items: flex-start;
          flex-direction: column;
          position: sticky;
          top: 0;
        }

        .gw-field-book-table {
          min-width: 0;
          table-layout: auto;
        }

        .gw-field-book-table,
        .gw-field-book-table tbody,
        .gw-field-book-table tr,
        .gw-field-book-table td {
          display: block;
          width: 100%;
          box-sizing: border-box;
        }

        .gw-field-book-table thead {
          display: none;
        }

        .gw-field-book-table tr {
          padding: 8px 9px;
          border-bottom: 1px solid rgba(215,183,116,0.12);
        }

        .gw-field-book-table td {
          padding: 0;
          border-bottom: 0;
        }

        .gw-field-book-table td + td {
          margin-top: 4px;
        }

        .gw-field-book-mark {
          min-height: 30px;
          display: inline-flex;
          align-items: center;
          font-size: 12.5px;
        }

        .gw-field-book-cue {
          font-size: 11px;
        }

        .gw-field-book-guide-card {
          position: fixed;
          inset: auto max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
          width: auto;
          max-height: min(78vh, calc(100vh - 24px));
          max-height: min(78dvh, calc(100dvh - 24px));
          padding: 12px;
          overscroll-behavior: contain;
        }

        .gw-field-book-schematic svg {
          max-height: 150px;
        }

        .gw-field-book-thumb-grid {
          gap: 3px;
        }
      }

      @media (max-width: 420px) {
        .gw-field-book-radio-grid {
          grid-template-columns: 1fr;
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
    ]
      .join(" ")
      .toLowerCase();
    return clean.split(/\s+/).every((word) => hay.includes(word));
  }

  function laneLabel(lane) {
    return LANES.find(([key]) => key === lane)?.[1] || lane || "Field marks";
  }

  function syncSelections(categories) {
    if (!LANES.some(([lane]) => lane === selectedLane)) {
      selectedLane = LANES[0]?.[0] || "";
    }

    const available = categories.filter((category) => category.lane === selectedLane);
    if (!available.some((category) => category.key === selectedCategory)) {
      selectedCategory = available[0]?.key || "";
    }
    return available;
  }

  function renderRadioGrid({ name, value, options, className = "" }) {
    return `
      <div class="gw-field-book-radio-grid ${className}">
        ${options
          .map(
            (option) => `
          <label class="gw-field-book-radio">
            <input type="radio" name="${esc(name)}" value="${esc(option.value)}" ${option.value === value ? "checked" : ""} />
            <span>
              <strong>${esc(option.label)}</strong>
              <small>${esc(option.meta)}</small>
            </span>
          </label>
        `
          )
          .join("")}
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

    return marks
      .map(
        (mark) => `
      <tr>
        <td>
          <button class="gw-field-book-mark" type="button" data-gw-fieldmark-id="${esc(mark.id)}">
            ${esc(mark.label)}
          </button>
        </td>
        <td><div class="gw-field-book-cue">${esc(mark.prompt || mark.explanation || "")}</div></td>
      </tr>
    `
      )
      .join("");
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

  function photoUrl(photo) {
    const raw = String(photo?.url || photo?.square_url || photo?.medium_url || "").trim();
    if (!raw) return "";
    return raw.replace(/\/(small|medium|large|original)\./, "/square.");
  }

  function hashString(value) {
    return String(value || "")
      .split("")
      .reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
      }, 0);
  }

  async function fetchJson(url) {
    const response = await fetch(String(url), { credentials: "omit" });
    if (!response.ok) throw new Error(`iNat request failed: ${response.status}`);
    return response.json();
  }

  function exemplarFamiliesForMark(mark, sheet) {
    const fromSheet = Array.isArray(sheet?.exemplarFamilies) ? sheet.exemplarFamilies : [];
    if (fromSheet.length) return fromSheet.filter(Boolean);

    const api = window.GridWildFieldMarks;
    const fromApi = api?.exemplarFamilies?.(mark?.id);
    return Array.isArray(fromApi) ? fromApi.filter(Boolean) : [];
  }

  function resolveFamilyTaxonId(familyName) {
    if (familyTaxonCache.has(familyName)) return familyTaxonCache.get(familyName);

    const promise = (async () => {
      try {
        const url = new URL("https://api.inaturalist.org/v1/taxa");
        url.searchParams.set("q", familyName);
        url.searchParams.set("rank", "family");
        url.searchParams.set("per_page", "5");
        const data = await fetchJson(url);
        const results = Array.isArray(data?.results) ? data.results : [];
        const exact = results.find(
          (taxon) => String(taxon?.name || "").toLowerCase() === familyName.toLowerCase()
        );
        const family = exact || results.find((taxon) => taxon?.rank === "family");
        return family?.id || null;
      } catch (error) {
        familyTaxonCache.delete(familyName);
        return null;
      }
    })();

    familyTaxonCache.set(familyName, promise);
    return promise;
  }

  async function fetchFamilyObservations(familyName, markId = "", familyIndex = 0, perFamily = 3) {
    const taxonId = await resolveFamilyTaxonId(familyName);
    if (!taxonId) return [];

    const preferredPage = (Math.abs(hashString(`${markId}:${familyName}:${familyIndex}`)) % 3) + 1;
    const loadPage = (page) => {
      const url = new URL("https://api.inaturalist.org/v1/observations");
      url.searchParams.set("taxon_id", String(taxonId));
      url.searchParams.set("photos", "true");
      url.searchParams.set("quality_grade", "research");
      url.searchParams.set("verifiable", "true");
      url.searchParams.set("order", "desc");
      url.searchParams.set("order_by", "created_at");
      url.searchParams.set("per_page", String(perFamily));
      if (page > 1) url.searchParams.set("page", String(page));
      return fetchJson(url);
    };

    let data = await loadPage(preferredPage);
    let observations = Array.isArray(data?.results) ? data.results : [];
    if (!observations.length && preferredPage !== 1) {
      data = await loadPage(1);
      observations = Array.isArray(data?.results) ? data.results : [];
    }
    return observations
      .map((observation) => {
        const photos = Array.isArray(observation?.photos) ? observation.photos : [];
        const photo = photos.find((item) => photoUrl(item));
        const url = photoUrl(photo);
        if (!url) return null;
        const taxon = observation?.taxon || {};
        const label = taxon.preferred_common_name || taxon.name || familyName;
        return {
          id: String(observation?.id || `${familyName}-${url}`),
          family: familyName,
          href:
            observation?.uri || `https://www.inaturalist.org/observations/${observation?.id || ""}`,
          label,
          url
        };
      })
      .filter(Boolean);
  }

  function loadExemplarsForMark(markId) {
    if (
      !markId ||
      exemplarCache.get(markId)?.status === "loading" ||
      exemplarCache.get(markId)?.status === "ready"
    )
      return;

    const api = window.GridWildFieldMarks;
    const mark = api?.get?.(markId);
    if (!mark || typeof fetch !== "function") return;

    const sheet = api?.infoSheet?.(markId) || mark.infoSheet || fallbackInfoSheet(mark);
    const families = exemplarFamiliesForMark(mark, sheet).slice(0, 8);
    if (!families.length) {
      exemplarCache.set(markId, { status: "ready", items: [], families });
      return;
    }

    const seq = ++exemplarLoadSeq;
    exemplarCache.set(markId, { status: "loading", items: [], families, seq });

    Promise.allSettled(
      families.map((family, index) => fetchFamilyObservations(family, markId, index, 3))
    )
      .then((results) => {
        const seen = new Set();
        const items = [];
        results.forEach((result) => {
          if (result.status !== "fulfilled") return;
          result.value.forEach((item) => {
            const key = item.id || item.url;
            if (seen.has(key)) return;
            seen.add(key);
            items.push(item);
          });
        });
        const status =
          items.length || results.every((result) => result.status === "fulfilled")
            ? "ready"
            : "error";
        exemplarCache.set(markId, { status, items: items.slice(0, 16), families, seq });
        if (activeMarkId === markId) renderMatrix();
      })
      .catch((error) => {
        exemplarCache.set(markId, { status: "error", items: [], families, error, seq });
        if (activeMarkId === markId) renderMatrix();
      });
  }

  function renderThumbCells(items = [], status = "ready") {
    const cells = Array.from({ length: 16 }, (_, index) => items[index] || null);
    return cells
      .map((item, index) => {
        if (!item) {
          const loadingClass = status === "loading" ? " is-loading" : "";
          return `<div class="gw-field-book-thumb-cell is-empty${loadingClass}" aria-hidden="true"></div>`;
        }
        const label = `${item.label || "iNat observation"} (${item.family || "family exemplar"})`;
        return `
        <a class="gw-field-book-thumb-cell" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer" title="${esc(label)}" aria-label="${esc(label)}">
          <img src="${esc(item.url)}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer" />
        </a>
      `;
      })
      .join("");
  }

  function renderExemplarFallback(sheet, note) {
    if (!sheet?.schematic) {
      return `
        <div class="gw-field-book-thumb-plate">
          <div class="gw-field-book-thumb-grid">${renderThumbCells([], "empty")}</div>
          <div class="gw-field-book-thumb-note">${esc(note)}</div>
        </div>
      `;
    }
    return `
      <div class="gw-field-book-thumb-plate">
        <div class="gw-field-book-schematic">${sheet.schematic}</div>
        <div class="gw-field-book-thumb-note">${esc(note)}</div>
      </div>
    `;
  }

  function renderExemplarPlate(mark, sheet) {
    const families = exemplarFamiliesForMark(mark, sheet);
    if (!families.length)
      return renderExemplarFallback(sheet, "No iNat exemplar families are mapped yet.");

    const cached = exemplarCache.get(mark.id);
    if (!cached || cached.status === "loading") {
      return `
        <div class="gw-field-book-thumb-plate" aria-label="iNaturalist exemplar thumbnails">
          <div class="gw-field-book-thumb-grid">${renderThumbCells([], "loading")}</div>
          <div class="gw-field-book-thumb-note">Loading iNat exemplars from ${esc(families.slice(0, 4).join(", "))}${families.length > 4 ? "..." : ""}</div>
        </div>
      `;
    }

    if (cached.status === "ready" && cached.items.length) {
      return `
        <div class="gw-field-book-thumb-plate" aria-label="iNaturalist exemplar thumbnails">
          <div class="gw-field-book-thumb-grid">${renderThumbCells(cached.items, "ready")}</div>
          <div class="gw-field-book-thumb-note">iNat exemplar observations from ${esc(cached.families.slice(0, 4).join(", "))}${cached.families.length > 4 ? "..." : ""}</div>
        </div>
      `;
    }

    if (cached.status === "ready") {
      return renderExemplarFallback(
        sheet,
        "iNat returned no photo exemplars for the mapped families."
      );
    }

    return renderExemplarFallback(
      sheet,
      "iNat thumbnails are unavailable right now; showing the schematic fallback."
    );
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
        ${renderExemplarPlate(mark, sheet)}
        <div class="gw-field-book-guide-summary">${esc(sheet.summary || mark.explanation || "")}</div>
        ${renderInfoSection("Why It Matters", sheet.why)}
        ${renderInfoSection("Look For", sheet.lookFor)}
        ${renderInfoSection("Compare", sheet.compare)}
        ${renderInfoSection("Use It", sheet.sayIt)}
        ${renderInfoSection("Careful", sheet.caution)}
        ${
          directions.length
            ? `
          <div class="gw-field-book-guide-section">
            <strong>Points Toward</strong>
            <div class="gw-field-book-guide-chiprow">
              ${directions.map((label) => `<span class="gw-field-book-guide-chip">${esc(label)}</span>`).join("")}
            </div>
          </div>
        `
            : ""
        }
        <div class="gw-field-book-guide-foot">${esc(sheet.codexStatus || "Codex link pending")}</div>
      </aside>
    `;
  }

  function renderMatrix() {
    const root = $("gwFieldBookMatrix");
    if (!root) return;

    const { marks, categories } = markSource();
    const laneCategories = syncSelections(categories);
    const selectedHeading = laneCategories.find((category) => category.key === selectedCategory);
    const filteredMarks = marks
      .filter((mark) => mark.lane === selectedLane)
      .filter((mark) => !selectedCategory || mark.category === selectedCategory)
      .filter(matchesQuery);

    const laneOptions = LANES.map(([lane, label]) => {
      const count = marks.filter((mark) => mark.lane === lane).length;
      return {
        value: lane,
        label,
        meta: `${count} field marks`
      };
    });

    const categoryOptions = laneCategories.map((category) => {
      const count = marks.filter(
        (mark) => mark.lane === selectedLane && mark.category === category.key
      ).length;
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
          ${
            categoryOptions.length
              ? renderRadioGrid({
                  name: "gwFieldBookCategory",
                  value: selectedCategory,
                  options: categoryOptions,
                  className: "gw-field-book-heading-grid"
                })
              : `<div class="gw-field-book-empty">No headings available.</div>`
          }
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
    $("gwFieldBookSearch")?.addEventListener("input", (evt) => {
      query = evt.target.value || "";
      activeMarkId = "";
      renderMatrix();
    });
    $("gwFieldBookMatrix")?.addEventListener("click", (evt) => {
      const closeBtn = evt.target?.closest?.("[data-gw-field-card-close]");
      if (closeBtn) {
        activeMarkId = "";
        renderMatrix();
        return;
      }

      const markBtn = evt.target?.closest?.("[data-gw-fieldmark-id]");
      if (!markBtn) return;
      activeMarkId = markBtn.dataset.gwFieldmarkId || "";
      loadExemplarsForMark(activeMarkId);
      renderMatrix();
    });
    $("gwFieldBookMatrix")?.addEventListener("change", (evt) => {
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
    panel.addEventListener("click", (evt) => {
      if (evt.target === panel) togglePanel(false);
    });
    document.addEventListener("keydown", (evt) => {
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
      loadExemplarsForMark(activeMarkId);
      renderMatrix();
      focusInitialPanelTarget();
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
