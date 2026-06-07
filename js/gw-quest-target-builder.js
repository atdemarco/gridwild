// GridWild Quest Target Builder
// Local-only custom target recipes that turn heat/lens filters into target-set quests.

(function () {
  const STORAGE_KEY = "gw_custom_quest_targets_v1";
  const PREVIEW_PANE = "gwQuestTargetBuilderPane";
  const TARGET_CAP = 400;
  const SCAN_MAX_CELLS = 120000;
  const STALE_DAYS = 365;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const TAXA = [
    ["Any", "Any life"],
    ["Plantae", "Plants"],
    ["Aves", "Birds"],
    ["Insecta", "Insects"],
    ["Fungi", "Fungi"],
    ["Mammalia", "Mammals"],
    ["Reptilia", "Reptiles"],
    ["Amphibia", "Amphibians"],
    ["Actinopterygii", "Ray-finned fish"],
    ["Arachnida", "Arachnids"],
    ["Mollusca", "Mollusks"]
  ];

  const METRICS = [
    ["count", "Observations"],
    ["species", "Species"],
    ["genera", "Genera"],
    ["observers", "Observers"],
    ["activity_score", "Activity score"],
    ["age_days", "Age days"],
    ["lens", "Lens output"]
  ];

  const BUILTIN_TARGETS = [
    {
      id: "builtin_stale_year",
      builtin: true,
      name: "Observed, stale >1 year",
      spec: {
        metric: "count",
        lens: "classic",
        taxon: "Any",
        observedFilter: "stale365",
        cutoffEnabled: false,
        cutoffMode: "raw",
        comparator: "above",
        threshold: 1,
        completionMode: "all",
        radiusCells: 9
      }
    },
    {
      id: "builtin_unobserved",
      builtin: true,
      name: "Unobserved cells",
      spec: {
        metric: "count",
        lens: "classic",
        taxon: "Any",
        observedFilter: "unobserved",
        cutoffEnabled: false,
        cutoffMode: "raw",
        comparator: "above",
        threshold: 0,
        completionMode: "all",
        radiusCells: 9
      }
    },
    {
      id: "builtin_underexplored_z",
      builtin: true,
      name: "Frontier lens Z >= 0.5",
      spec: {
        metric: "lens",
        lens: "underexplored",
        taxon: "Any",
        observedFilter: "observed",
        cutoffEnabled: true,
        cutoffMode: "z",
        comparator: "above",
        threshold: 0.5,
        completionMode: "one",
        radiusCells: 9
      }
    }
  ];

  const state = {
    root: null,
    context: null,
    previewLayer: null,
    previewTimer: null,
    latestPreview: null,
    nameTouched: false
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toast(message) {
    if (!message) return;
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    } else {
      console.info(message);
    }
  }

  function storageKey() {
    try {
      const playerId = localStorage.getItem("gwPlayerId");
      return playerId ? `${STORAGE_KEY}:${playerId}` : STORAGE_KEY;
    } catch {
      return STORAGE_KEY;
    }
  }

  function loadSavedTargets() {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((row) => row?.id && row?.spec) : [];
    } catch {
      return [];
    }
  }

  function saveSavedTargets(rows) {
    localStorage.setItem(storageKey(), JSON.stringify(Array.isArray(rows) ? rows : []));
  }

  function allSavedTargets() {
    return [...BUILTIN_TARGETS, ...loadSavedTargets()];
  }

  function injectStyles() {
    if (document.getElementById("gwQuestTargetBuilderStyles")) return;

    const style = document.createElement("style");
    style.id = "gwQuestTargetBuilderStyles";
    style.textContent = `
      .gw-qtb-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100022;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(10,14,20,0.48);
        backdrop-filter: blur(10px);
      }

      .gw-qtb-window {
        width: min(980px, calc(100vw - 28px));
        max-height: min(760px, calc(100vh - 28px));
        display: grid;
        grid-template-rows: auto 1fr auto;
        border: 1px solid rgba(242,226,185,0.24);
        border-radius: 8px;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(25,35,38,0.98), rgba(15,22,26,0.98));
        color: #f8efd7;
        box-shadow: 0 22px 70px rgba(0,0,0,0.45);
      }

      .gw-qtb-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 12px;
        border-bottom: 1px solid rgba(242,226,185,0.16);
      }

      .gw-qtb-kicker {
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0;
        color: rgba(248,239,215,0.62);
      }

      .gw-qtb-title {
        font-size: 18px;
        font-weight: 900;
        line-height: 1.15;
      }

      .gw-qtb-close {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(248,239,215,0.2);
        border-radius: 8px;
        background: rgba(248,239,215,0.08);
        color: #f8efd7;
        cursor: pointer;
      }

      .gw-qtb-body {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(210px, 0.74fr) minmax(0, 1.55fr);
        gap: 0;
        overflow: hidden;
      }

      .gw-qtb-saved {
        min-height: 0;
        overflow: auto;
        padding: 14px;
        border-right: 1px solid rgba(242,226,185,0.14);
        background: rgba(0,0,0,0.12);
      }

      .gw-qtb-saved-title,
      .gw-qtb-section-title {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 900;
        color: rgba(248,239,215,0.72);
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .gw-qtb-saved-list {
        display: grid;
        gap: 8px;
      }

      .gw-qtb-saved-item {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 7px;
        align-items: center;
        padding: 9px;
        border: 1px solid rgba(248,239,215,0.12);
        border-radius: 8px;
        background: rgba(248,239,215,0.06);
      }

      .gw-qtb-saved-name {
        min-width: 0;
        display: block;
        font-size: 12px;
        font-weight: 850;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-qtb-saved-meta {
        display: block;
        margin-top: 2px;
        font-size: 10.5px;
        color: rgba(248,239,215,0.58);
      }

      .gw-qtb-saved-actions {
        display: flex;
        gap: 4px;
      }

      .gw-qtb-icon-btn {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(248,239,215,0.16);
        border-radius: 7px;
        background: rgba(248,239,215,0.08);
        color: #f8efd7;
        font-size: 11px;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-qtb-form {
        min-height: 0;
        overflow: auto;
        padding: 14px 16px 16px;
      }

      .gw-qtb-fieldset {
        display: grid;
        gap: 10px;
        margin-bottom: 16px;
      }

      .gw-qtb-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .gw-qtb-field {
        display: grid;
        gap: 5px;
      }

      .gw-qtb-field.is-wide {
        grid-column: 1 / -1;
      }

      .gw-qtb-field label {
        font-size: 10.5px;
        font-weight: 850;
        color: rgba(248,239,215,0.68);
      }

      .gw-qtb-field input,
      .gw-qtb-field select {
        width: 100%;
        min-height: 34px;
        border: 1px solid rgba(248,239,215,0.18);
        border-radius: 8px;
        background: rgba(4,8,10,0.36);
        color: #f8efd7;
        padding: 7px 9px;
        font: inherit;
        font-size: 12px;
      }

      .gw-qtb-field input[type="checkbox"] {
        width: auto;
        min-height: 0;
      }

      .gw-qtb-toggle-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 7px 9px;
        border: 1px solid rgba(248,239,215,0.18);
        border-radius: 8px;
        background: rgba(4,8,10,0.24);
        font-size: 12px;
      }

      .gw-qtb-preview {
        display: grid;
        gap: 8px;
        padding: 11px;
        border: 1px solid rgba(118,231,191,0.18);
        border-radius: 8px;
        background: rgba(118,231,191,0.06);
      }

      .gw-qtb-preview-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-qtb-preview-count {
        font-size: 22px;
        line-height: 1;
        font-weight: 950;
      }

      .gw-qtb-preview-status {
        font-size: 12px;
        color: rgba(248,239,215,0.72);
      }

      .gw-qtb-preview-status.is-blocked {
        color: #ffb0a8;
      }

      .gw-qtb-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid rgba(242,226,185,0.14);
        background: rgba(0,0,0,0.14);
      }

      .gw-qtb-btn {
        min-height: 34px;
        border: 1px solid rgba(248,239,215,0.18);
        border-radius: 8px;
        padding: 7px 12px;
        color: #f8efd7;
        background: rgba(248,239,215,0.09);
        font-size: 12px;
        font-weight: 850;
        cursor: pointer;
      }

      .gw-qtb-btn.primary {
        border-color: rgba(118,231,191,0.35);
        background: rgba(118,231,191,0.18);
      }

      .gw-qtb-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .gw-qtb-preview-glyph {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255,126,126,0.96);
        border-radius: 999px;
        box-shadow:
          0 0 0 4px rgba(255,126,126,0.14),
          0 0 16px rgba(255,126,126,0.7);
        position: relative;
      }

      .gw-qtb-preview-glyph::before,
      .gw-qtb-preview-glyph::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255,247,223,0.92);
      }

      .gw-qtb-preview-glyph::before {
        width: 2px;
        height: 14px;
      }

      .gw-qtb-preview-glyph::after {
        width: 14px;
        height: 2px;
      }

      @media (max-width: 760px) {
        .gw-qtb-backdrop {
          padding: 10px;
          align-items: end;
        }

        .gw-qtb-window {
          max-height: calc(100vh - 20px);
        }

        .gw-qtb-body {
          grid-template-columns: 1fr;
        }

        .gw-qtb-saved {
          max-height: 160px;
          border-right: 0;
          border-bottom: 1px solid rgba(242,226,185,0.14);
        }

        .gw-qtb-grid {
          grid-template-columns: 1fr;
        }

        .gw-qtb-actions {
          flex-wrap: wrap;
        }

        .gw-qtb-btn {
          flex: 1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePreviewLayer() {
    if (!window.map || !window.L) return null;
    if (!map.getPane(PREVIEW_PANE)) {
      map.createPane(PREVIEW_PANE);
      map.getPane(PREVIEW_PANE).style.zIndex = 758;
      map.getPane(PREVIEW_PANE).style.pointerEvents = "none";
    }
    if (!state.previewLayer) {
      state.previewLayer = L.layerGroup([], { pane: PREVIEW_PANE }).addTo(map);
    }
    return state.previewLayer;
  }

  function clearPreviewLayer() {
    state.previewLayer?.clearLayers?.();
  }

  function metricLabel(metric) {
    return METRICS.find((row) => row[0] === metric)?.[1] || "Signal";
  }

  function taxonLabel(taxon) {
    return TAXA.find((row) => row[0] === taxon)?.[1] || taxon || "Any life";
  }

  function lensLabel(lens) {
    return window.GWLegendCopy?.[lens]?.title || String(lens || "classic");
  }

  function lensOptionsHtml(selected = window.__gwState?.activeLens || "classic") {
    const recipes = window.GWLenses?.recipes || {};
    const keys = Object.keys(recipes).filter((key) => !key.startsWith("osm-"));
    const list = keys.length ? keys : ["classic", "underexplored", "richness", "revisit"];
    return list
      .map(
        (key) =>
          `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(lensLabel(key))}</option>`
      )
      .join("");
  }

  function savedTargetsHtml() {
    const rows = allSavedTargets();
    if (!rows.length) return `<div class="gw-qtb-preview-status">No saved targets yet.</div>`;

    return rows
      .map((row) => {
        const meta = row.builtin ? "Preset" : `${Number(row.lastCount || 0)} cells last preview`;
        return `
          <div class="gw-qtb-saved-item" data-gw-qtb-saved-id="${esc(row.id)}">
            <span>
              <span class="gw-qtb-saved-name">${esc(row.name || "Custom target")}</span>
              <span class="gw-qtb-saved-meta">${esc(meta)}</span>
            </span>
            <span class="gw-qtb-saved-actions">
              <button class="gw-qtb-icon-btn" type="button" title="Load" data-gw-qtb-load="${esc(row.id)}">L</button>
              <button class="gw-qtb-icon-btn" type="button" title="Start" data-gw-qtb-start="${esc(row.id)}">S</button>
              ${
                row.builtin
                  ? ""
                  : `<button class="gw-qtb-icon-btn" type="button" title="Delete" data-gw-qtb-delete="${esc(row.id)}">X</button>`
              }
            </span>
          </div>
        `;
      })
      .join("");
  }

  function sourceLabel(context = state.context) {
    if (context?.source === "patch") {
      return context.patch?.name || context.patch?.source_label || "Patch";
    }
    const lat = Number(context?.latlng?.lat);
    const lng = Number(context?.latlng?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return "selected cell";
  }

  function sourceModeLabel(context = state.context) {
    return context?.source === "patch" ? "Patch polygon" : "Selected cell";
  }

  function defaultSpec(context = state.context) {
    return {
      metric: "count",
      lens: window.__gwState?.activeLens || "classic",
      taxon: "Any",
      observedFilter: "stale365",
      cutoffEnabled: false,
      cutoffMode: "raw",
      comparator: "above",
      threshold: 1,
      completionMode: "all",
      radiusCells: context?.source === "patch" ? 0 : 9
    };
  }

  function autoName(spec, context = state.context) {
    const source = context?.source === "patch" ? "Patch" : "near cell";
    const taxon = spec.taxon && spec.taxon !== "Any" ? `${taxonLabel(spec.taxon)} ` : "";
    const observed =
      {
        all: "all cells",
        observed: "observed cells",
        unobserved: "unobserved cells",
        stale365: "stale observed cells"
      }[spec.observedFilter] || "target cells";
    const signal = spec.metric === "lens" ? lensLabel(spec.lens) : metricLabel(spec.metric);
    const cutoff = spec.cutoffEnabled
      ? ` ${spec.cutoffMode === "z" ? "Z" : signal} ${spec.comparator === "below" ? "<=" : ">="} ${Number(spec.threshold || 0).toFixed(spec.cutoffMode === "z" ? 1 : 0)}`
      : "";
    return `${taxon}${observed} by ${signal}${cutoff} in ${source}`;
  }

  function renderWindow(context) {
    const spec = defaultSpec(context);
    const sourceText = sourceLabel(context);
    return `
      <div class="gw-qtb-window" role="dialog" aria-modal="true" aria-label="Quest Target Builder">
        <div class="gw-qtb-head">
          <div>
            <div class="gw-qtb-kicker">${esc(sourceModeLabel(context))}</div>
            <div class="gw-qtb-title">Quest Target Builder</div>
          </div>
          <button class="gw-qtb-close" type="button" aria-label="Close target builder" title="Close">X</button>
        </div>

        <div class="gw-qtb-body">
          <aside class="gw-qtb-saved">
            <div class="gw-qtb-saved-title">Saved Targets</div>
            <div class="gw-qtb-saved-list" data-gw-qtb-saved-list>
              ${savedTargetsHtml()}
            </div>
          </aside>

          <form class="gw-qtb-form" data-gw-qtb-form>
            <div class="gw-qtb-fieldset">
              <div class="gw-qtb-field is-wide">
                <label for="gwQtbName">Name</label>
                <input id="gwQtbName" data-gw-qtb-name type="text" value="${esc(autoName(spec, context))}" autocomplete="off">
              </div>

              <div class="gw-qtb-grid">
                <div class="gw-qtb-field">
                  <label>Input</label>
                  <input type="text" value="${esc(sourceText)}" readonly>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbRadius">Range</label>
                  <select id="gwQtbRadius" data-gw-qtb-control="radiusCells" ${context?.source === "patch" ? "disabled" : ""}>
                    <option value="4">9x9 cells</option>
                    <option value="9" selected>19x19 cells</option>
                    <option value="14">29x29 cells</option>
                    <option value="20">41x41 cells</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="gw-qtb-fieldset">
              <div class="gw-qtb-section-title">Layer</div>
              <div class="gw-qtb-grid">
                <div class="gw-qtb-field">
                  <label for="gwQtbMetric">Data</label>
                  <select id="gwQtbMetric" data-gw-qtb-control="metric">
                    ${METRICS.map(
                      ([value, label]) =>
                        `<option value="${esc(value)}" ${value === spec.metric ? "selected" : ""}>${esc(label)}</option>`
                    ).join("")}
                  </select>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbLens">Lens</label>
                  <select id="gwQtbLens" data-gw-qtb-control="lens">
                    ${lensOptionsHtml(spec.lens)}
                  </select>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbTaxon">Taxon</label>
                  <select id="gwQtbTaxon" data-gw-qtb-control="taxon">
                    ${TAXA.map(
                      ([value, label]) =>
                        `<option value="${esc(value)}" ${value === spec.taxon ? "selected" : ""}>${esc(label)}</option>`
                    ).join("")}
                  </select>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbObserved">History</label>
                  <select id="gwQtbObserved" data-gw-qtb-control="observedFilter">
                    <option value="all">All cells</option>
                    <option value="observed">Observed historically</option>
                    <option value="unobserved">Never observed</option>
                    <option value="stale365" selected>Observed, stale >1 year</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="gw-qtb-fieldset">
              <div class="gw-qtb-section-title">Cutoff</div>
              <div class="gw-qtb-grid">
                <div class="gw-qtb-field">
                  <label>Enabled</label>
                  <label class="gw-qtb-toggle-row">
                    <input type="checkbox" data-gw-qtb-control="cutoffEnabled">
                    <span>Apply cutoff</span>
                  </label>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbCutoffMode">Mode</label>
                  <select id="gwQtbCutoffMode" data-gw-qtb-control="cutoffMode">
                    <option value="raw">Raw value</option>
                    <option value="z">Z score</option>
                  </select>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbComparator">Direction</label>
                  <select id="gwQtbComparator" data-gw-qtb-control="comparator">
                    <option value="above">>=</option>
                    <option value="below"><=</option>
                  </select>
                </div>
                <div class="gw-qtb-field">
                  <label for="gwQtbThreshold">Threshold</label>
                  <input id="gwQtbThreshold" data-gw-qtb-control="threshold" type="number" step="0.1" value="1">
                </div>
              </div>
            </div>

            <div class="gw-qtb-fieldset">
              <div class="gw-qtb-grid">
                <div class="gw-qtb-field">
                  <label for="gwQtbCompletion">Completion</label>
                  <select id="gwQtbCompletion" data-gw-qtb-control="completionMode">
                    <option value="all" selected>Fill every target cell</option>
                    <option value="one">One qualifying observation</option>
                  </select>
                </div>
                <div class="gw-qtb-preview" data-gw-qtb-preview>
                  <div class="gw-qtb-preview-main">
                    <span>
                      <span class="gw-qtb-preview-count" data-gw-qtb-count>0</span>
                      <span class="gw-qtb-preview-status">target cells</span>
                    </span>
                    <span class="gw-qtb-preview-status" data-gw-qtb-source>${esc(sourceModeLabel(context))}</span>
                  </div>
                  <div class="gw-qtb-preview-status" data-gw-qtb-status>Building preview...</div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div class="gw-qtb-actions">
          <button class="gw-qtb-btn" type="button" data-gw-qtb-cancel>Cancel</button>
          <button class="gw-qtb-btn" type="button" data-gw-qtb-save>Save</button>
          <button class="gw-qtb-btn primary" type="button" data-gw-qtb-save-start>Save & Start</button>
        </div>
      </div>
    `;
  }

  function formValue(name) {
    return state.root?.querySelector(`[data-gw-qtb-control="${name}"]`);
  }

  function readSpec() {
    const metric = String(formValue("metric")?.value || "count");
    return {
      metric,
      lens: String(formValue("lens")?.value || window.__gwState?.activeLens || "classic"),
      taxon: String(formValue("taxon")?.value || "Any"),
      observedFilter: String(formValue("observedFilter")?.value || "stale365"),
      cutoffEnabled: formValue("cutoffEnabled")?.checked === true,
      cutoffMode: String(formValue("cutoffMode")?.value || "raw"),
      comparator: String(formValue("comparator")?.value || "above"),
      threshold: Number(formValue("threshold")?.value || 0),
      completionMode: String(formValue("completionMode")?.value || "all"),
      radiusCells: Math.max(
        1,
        Math.min(20, Math.round(Number(formValue("radiusCells")?.value || 9)))
      )
    };
  }

  function applySpec(spec = {}) {
    const merged = { ...defaultSpec(), ...spec };
    Object.entries(merged).forEach(([key, value]) => {
      const el = formValue(key);
      if (!el) return;
      if (el.type === "checkbox") {
        el.checked = value === true;
      } else {
        el.value = String(value);
      }
    });
    syncLensControl();
    state.latestPreview = null;
    state.nameTouched = false;
    updateNameFromSpec();
    schedulePreview();
  }

  function syncLensControl() {
    const metric = formValue("metric")?.value || "count";
    const lens = formValue("lens");
    if (lens) lens.disabled = metric !== "lens";
  }

  function updateNameFromSpec(force = false) {
    const input = state.root?.querySelector("[data-gw-qtb-name]");
    if (!input || (state.nameTouched && !force)) return;
    input.value = autoName(readSpec());
  }

  function normalizeLatLng(latlng) {
    if (!latlng) return null;
    if (window.L?.latLng) return L.latLng(latlng);
    const lat = Number(latlng.lat);
    const lng = Number(latlng.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function normalizeContext(options = {}) {
    const source = options.source || options.mode || (options.patch ? "patch" : "hud");
    if (source === "patch") {
      return {
        source: "patch",
        patch: options.patch || null,
        latlng: normalizeLatLng(options.latlng) || normalizeLatLng(options.patch?.centroid)
      };
    }
    return {
      source: "hud",
      patch: null,
      latlng: normalizeLatLng(options.latlng) || window.map?.getCenter?.() || null
    };
  }

  function patchRings(patch) {
    const rings =
      Array.isArray(patch?.geometry?.rings) && patch.geometry.rings.length
        ? patch.geometry.rings
        : Array.isArray(patch?.boundary) && patch.boundary.length
          ? [patch.boundary]
          : Array.isArray(patch?.survey_geometry?.boundary)
            ? [patch.survey_geometry.boundary]
            : [];
    return rings
      .map((ring) =>
        (Array.isArray(ring) ? ring : [])
          .map((point) => ({ lat: Number(point?.lat), lng: Number(point?.lng) }))
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      )
      .filter((ring) => ring.length >= 3);
  }

  function pointInRing(point, ring = []) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      const crosses =
        pi.lat > point.lat !== pj.lat > point.lat &&
        point.lng < ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat || 1e-9) + pi.lng;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function pointInRings(point, rings = []) {
    return rings.some((ring) => pointInRing(point, ring));
  }

  function cellKey(ix, iy) {
    return window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`;
  }

  function cellCenter(ix, iy) {
    const bounds = window.GridWildGrid?.cellBounds?.(ix, iy);
    if (bounds?.sw && bounds?.ne) {
      return {
        lat: (Number(bounds.sw.lat) + Number(bounds.ne.lat)) / 2,
        lng: (Number(bounds.sw.lng) + Number(bounds.ne.lng)) / 2
      };
    }
    const gridSizeM = Number(window.GridWildGrid?.gridSizeM) || 20 * 0.3048;
    const center = map.options.crs.unproject(
      L.point((ix + 0.5) * gridSizeM, (iy + 0.5) * gridSizeM)
    );
    return { lat: center.lat, lng: center.lng };
  }

  function cellBounds(ix, iy) {
    const bounds = window.GridWildGrid?.cellBounds?.(ix, iy);
    if (bounds?.sw && bounds?.ne) return L.latLngBounds(bounds.sw, bounds.ne);
    const gridSizeM = Number(window.GridWildGrid?.gridSizeM) || 20 * 0.3048;
    const sw = map.options.crs.unproject(L.point(ix * gridSizeM, iy * gridSizeM));
    const ne = map.options.crs.unproject(L.point((ix + 1) * gridSizeM, (iy + 1) * gridSizeM));
    return L.latLngBounds(sw, ne);
  }

  function distanceM(a, b) {
    if (!a || !b || !window.L?.latLng) return Infinity;
    return L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
  }

  function sortOrigin() {
    return window.map?.getCenter?.() || state.context?.latlng || null;
  }

  function cellBoundsForRings(rings = []) {
    const grid = window.GridWildGrid;
    if (!grid?.latLngToCell) return null;
    const points = rings.flat();
    if (!points.length) return null;

    let minIx = Infinity;
    let maxIx = -Infinity;
    let minIy = Infinity;
    let maxIy = -Infinity;
    points.forEach((point) => {
      const cell = grid.latLngToCell([point.lat, point.lng]);
      const ix = Number(cell?.ix);
      const iy = Number(cell?.iy);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
      minIx = Math.min(minIx, ix);
      maxIx = Math.max(maxIx, ix);
      minIy = Math.min(minIy, iy);
      maxIy = Math.max(maxIy, iy);
    });
    if (![minIx, maxIx, minIy, maxIy].every(Number.isFinite)) return null;
    return { minIx, maxIx, minIy, maxIy };
  }

  function collectCandidateCells(spec) {
    if (!window.map || !window.L || !window.GridWildGrid?.latLngToCell) {
      return { cells: [], scanned: 0, blocked: "Grid is still loading." };
    }

    if (state.context?.source === "patch") {
      const rings = patchRings(state.context.patch);
      const bounds = cellBoundsForRings(rings);
      if (!rings.length || !bounds) {
        return { cells: [], scanned: 0, blocked: "This Patch needs a saved polygon boundary." };
      }

      const scanned = (bounds.maxIx - bounds.minIx + 1) * (bounds.maxIy - bounds.minIy + 1);
      if (scanned > SCAN_MAX_CELLS) {
        return {
          cells: [],
          scanned,
          blocked: "That Patch is too broad for a custom target scan. Tighten the range."
        };
      }

      const cells = [];
      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
          const center = cellCenter(ix, iy);
          if (!pointInRings(center, rings)) continue;
          cells.push({ ix, iy, key: cellKey(ix, iy), center });
        }
      }
      return { cells, scanned };
    }

    const centerCell = window.GridWildGrid.latLngToCell(state.context?.latlng || map.getCenter());
    const ix0 = Math.floor(Number(centerCell?.ix));
    const iy0 = Math.floor(Number(centerCell?.iy));
    if (!Number.isFinite(ix0) || !Number.isFinite(iy0)) {
      return { cells: [], scanned: 0, blocked: "Choose a map cell first." };
    }

    const radius = Math.max(1, Math.min(20, Number(spec.radiusCells) || 9));
    const cells = [];
    for (let iy = iy0 - radius; iy <= iy0 + radius; iy++) {
      for (let ix = ix0 - radius; ix <= ix0 + radius; ix++) {
        cells.push({ ix, iy, key: cellKey(ix, iy), center: cellCenter(ix, iy) });
      }
    }
    return { cells, scanned: cells.length };
  }

  function metricsForCell(ix, iy) {
    const key = cellKey(ix, iy);
    const baseMetrics =
      window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;
    if (typeof window.getDisplayMetricsForCell === "function") {
      return window.getDisplayMetricsForCell(ix, iy, baseMetrics || null) || baseMetrics || null;
    }
    return baseMetrics || null;
  }

  function countOf(metrics) {
    return Number(metrics?.count) || 0;
  }

  function passesHistoryFilter(metrics, filter) {
    const count = countOf(metrics);
    if (filter === "all") return true;
    if (filter === "unobserved") return count <= 0;
    if (filter === "observed") return count > 0;
    if (filter === "stale365") {
      const lastMs = Number(metrics?.last_observed_ms) || 0;
      return count > 0 && lastMs > 0 && Date.now() - lastMs >= STALE_DAYS * DAY_MS;
    }
    return true;
  }

  function passesTaxonFilter(metrics, taxon) {
    if (!taxon || taxon === "Any") return true;
    if (!metrics) return false;
    const iconicCount = Number(metrics.iconic_counts?.[taxon]) || 0;
    return iconicCount > 0 || String(metrics.dominant_iconic || "") === taxon;
  }

  function ageDays(metrics) {
    const ms = Number(metrics?.last_observed_ms) || 0;
    if (!ms) return 0;
    return Math.max(0, (Date.now() - ms) / DAY_MS);
  }

  function lensSignal(metrics, lens) {
    if (!metrics) return 0;
    const recipe = window.GWLenses?.recipes?.[lens] || window.GWLenses?.recipes?.classic;
    if (typeof recipe !== "function") return 0;
    try {
      const output = recipe(metrics);
      return Math.max(0, Number(output?.alpha) || 0);
    } catch {
      return 0;
    }
  }

  function signalValue(metrics, spec) {
    if (spec.metric === "lens") return lensSignal(metrics, spec.lens);
    if (spec.metric === "species") return Number(metrics?.species) || 0;
    if (spec.metric === "genera") return Number(metrics?.genera) || 0;
    if (spec.metric === "observers") return Number(metrics?.observers) || 0;
    if (spec.metric === "activity_score") {
      const genera = Number(metrics?.genera) || 0;
      return Number(metrics?.activity_score) || Math.log1p(countOf(metrics)) * (1 + genera * 0.05);
    }
    if (spec.metric === "age_days") return ageDays(metrics);
    return countOf(metrics);
  }

  function zStats(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return { mean: 0, sd: 0 };
    const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
    const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length;
    return { mean, sd: Math.sqrt(variance) };
  }

  function passesCutoff(row, spec) {
    if (!spec.cutoffEnabled) return true;
    const threshold = Number.isFinite(Number(spec.threshold)) ? Number(spec.threshold) : 0;
    const value = spec.cutoffMode === "z" ? row.z : row.value;
    if (spec.comparator === "below") return value <= threshold;
    return value >= threshold;
  }

  function buildPreview(spec = readSpec()) {
    const candidates = collectCandidateCells(spec);
    if (candidates.blocked) {
      return {
        cells: [],
        previewCells: [],
        totalMatches: 0,
        scanned: candidates.scanned || 0,
        blocked: candidates.blocked
      };
    }

    const rows = [];
    for (const cell of candidates.cells) {
      const metrics = metricsForCell(cell.ix, cell.iy);
      if (!passesHistoryFilter(metrics, spec.observedFilter)) continue;
      if (!passesTaxonFilter(metrics, spec.taxon)) continue;
      rows.push({
        ...cell,
        metrics,
        value: signalValue(metrics, spec)
      });
    }

    const stats = zStats(rows.map((row) => row.value));
    const origin = sortOrigin();
    const matches = rows
      .map((row) => ({
        ...row,
        z: stats.sd > 0 ? (row.value - stats.mean) / stats.sd : 0,
        distanceM: distanceM(origin, row.center)
      }))
      .filter((row) => passesCutoff(row, spec))
      .sort((a, b) => a.distanceM - b.distanceM || a.key.localeCompare(b.key));

    return {
      cells: matches.map((row) => ({ ix: row.ix, iy: row.iy, key: row.key })),
      previewCells: matches
        .slice(0, TARGET_CAP)
        .map((row) => ({ ix: row.ix, iy: row.iy, key: row.key, center: row.center })),
      totalMatches: matches.length,
      scanned: candidates.scanned,
      stats,
      tooMany: matches.length > TARGET_CAP
    };
  }

  function renderPreviewLayer(preview) {
    const layer = ensurePreviewLayer();
    if (!layer) return;
    layer.clearLayers();

    (preview?.previewCells || []).forEach((cell) => {
      const bounds = cellBounds(cell.ix, cell.iy);
      L.rectangle(bounds, {
        pane: PREVIEW_PANE,
        interactive: false,
        color: "rgba(255,126,126,0.92)",
        weight: 1.5,
        opacity: 0.88,
        fillColor: "rgba(255,73,73,1)",
        fillOpacity: 0.12,
        dashArray: "4 4"
      }).addTo(layer);
      L.marker(bounds.getCenter(), {
        pane: PREVIEW_PANE,
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="gw-qtb-preview-glyph"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(layer);
    });
  }

  function setPreviewStatus(preview) {
    const countEl = state.root?.querySelector("[data-gw-qtb-count]");
    const statusEl = state.root?.querySelector("[data-gw-qtb-status]");
    const saveBtn = state.root?.querySelector("[data-gw-qtb-save]");
    const startBtn = state.root?.querySelector("[data-gw-qtb-save-start]");
    if (!countEl || !statusEl) return;

    const count = preview?.totalMatches || 0;
    countEl.textContent = String(count);
    statusEl.classList.toggle("is-blocked", !!preview?.blocked || !!preview?.tooMany);

    if (preview?.blocked) {
      statusEl.textContent = preview.blocked;
    } else if (preview?.tooMany) {
      statusEl.textContent = `${count} cells match. Tighten the filter to ${TARGET_CAP} or fewer before saving or starting.`;
    } else if (!count) {
      statusEl.textContent = "No cells match this target.";
    } else {
      statusEl.textContent = `${count} target cell${count === 1 ? "" : "s"} from ${preview.scanned || count} scanned.`;
    }

    const blocked = !!preview?.blocked || !!preview?.tooMany || !count;
    if (saveBtn) saveBtn.disabled = blocked;
    if (startBtn) startBtn.disabled = blocked;
  }

  function updatePreview() {
    const spec = readSpec();
    syncLensControl();
    updateNameFromSpec();
    const preview = buildPreview(spec);
    state.latestPreview = preview;
    setPreviewStatus(preview);
    renderPreviewLayer(preview);
  }

  function refreshPreviewNow() {
    const preview = buildPreview(readSpec());
    state.latestPreview = preview;
    setPreviewStatus(preview);
    renderPreviewLayer(preview);
    return preview;
  }

  function schedulePreview() {
    if (state.previewTimer) window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(() => {
      state.previewTimer = null;
      updatePreview();
    }, 90);
  }

  function targetName() {
    const value = String(state.root?.querySelector("[data-gw-qtb-name]")?.value || "").trim();
    return value || autoName(readSpec());
  }

  function savedTargetFromCurrent() {
    const spec = readSpec();
    const preview = state.latestPreview || buildPreview(spec);
    return {
      id: `qtb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: targetName(),
      spec,
      sourceMode: state.context?.source || "hud",
      sourceLabel: sourceLabel(),
      lastCount: preview.totalMatches || 0,
      savedAt: new Date().toISOString()
    };
  }

  function refreshSavedList() {
    const list = state.root?.querySelector("[data-gw-qtb-saved-list]");
    if (list) list.innerHTML = savedTargetsHtml();
  }

  function saveCurrentTarget() {
    const preview = refreshPreviewNow();
    if (preview.blocked || preview.tooMany || !preview.totalMatches) {
      toast(
        preview.tooMany
          ? "Tighten the filter to 400 target cells or fewer."
          : "No target cells to save."
      );
      return null;
    }

    const row = savedTargetFromCurrent();
    const saved = loadSavedTargets().filter((item) => item.name !== row.name);
    saved.unshift(row);
    saveSavedTargets(saved.slice(0, 40));
    refreshSavedList();
    toast("Custom target saved.");
    return row;
  }

  function questRecipeForPreview(savedTarget = null, preview = null) {
    const spec = readSpec();
    preview = preview || refreshPreviewNow();
    if (preview.blocked || preview.tooMany || !preview.totalMatches) return null;

    const name = targetName();
    const fillAll = spec.completionMode !== "one";
    const label = state.context?.source === "patch" ? sourceLabel() : sourceLabel(state.context);
    return {
      range: "here",
      iconicTaxon: spec.taxon || "Any",
      objectiveType: "any_observation",
      difficulty: 2,
      timeframe: "today",
      evidence: "photo_gps20",
      surveyId: "none",
      targetLocation: "target_set",
      target: {
        mode: "target_set",
        kind: "custom_target_builder",
        label: name,
        patchId: state.context?.patch?.id || "",
        patchName: label,
        cells: preview.cells,
        totalEligibleCells: preview.cells.length,
        targetCount: fillAll ? preview.cells.length : 1,
        requiresUniqueCellProgress: fillAll,
        generatedAt: new Date().toISOString(),
        customTargetId: savedTarget?.id || ""
      },
      quantity: 1
    };
  }

  function questDescription(spec, count) {
    const subject =
      spec.completionMode === "one"
        ? "one qualifying observation"
        : "one observation in each marked target square";
    return `Make ${subject} for ${targetName()}. ${count} target cell${count === 1 ? "" : "s"} are marked from the custom builder.`;
  }

  async function startCurrentTarget(savedTarget = null) {
    if (!window.GridWildQuests?.startQuestFromRecipe) {
      toast("Quest tools are still loading.");
      return null;
    }
    const spec = readSpec();
    const preview = refreshPreviewNow();
    if (preview.blocked || preview.tooMany || !preview.totalMatches) {
      toast(
        preview?.tooMany
          ? "Tighten the filter to 400 target cells or fewer."
          : "No target cells to start."
      );
      return null;
    }
    const recipe = questRecipeForPreview(savedTarget, preview);
    if (!recipe) return null;

    const quest = await window.GridWildQuests.startQuestFromRecipe(recipe, {
      title: `Custom Target: ${targetName()}`,
      description: questDescription(spec, preview.totalMatches),
      source: state.context?.source === "patch" ? "patch" : "manual",
      autoEmbark: true,
      openStatus: false
    });

    if (quest) {
      toast("Custom target quest started.");
      close();
    }
    return quest;
  }

  function targetById(id) {
    return allSavedTargets().find((row) => String(row.id) === String(id)) || null;
  }

  function bindWindow() {
    state.root.querySelector(".gw-qtb-close")?.addEventListener("click", close);
    state.root.querySelector("[data-gw-qtb-cancel]")?.addEventListener("click", close);
    state.root.addEventListener("click", (event) => {
      if (event.target === state.root) close();
    });

    state.root.querySelector("[data-gw-qtb-name]")?.addEventListener("input", () => {
      state.nameTouched = true;
    });

    state.root.querySelectorAll("[data-gw-qtb-control]").forEach((el) => {
      el.addEventListener("input", () => {
        syncLensControl();
        updateNameFromSpec();
        schedulePreview();
      });
      el.addEventListener("change", () => {
        syncLensControl();
        updateNameFromSpec();
        schedulePreview();
      });
    });

    state.root.querySelector("[data-gw-qtb-save]")?.addEventListener("click", saveCurrentTarget);
    state.root.querySelector("[data-gw-qtb-save-start]")?.addEventListener("click", async () => {
      const saved = saveCurrentTarget();
      if (saved) await startCurrentTarget(saved);
    });

    state.root
      .querySelector("[data-gw-qtb-saved-list]")
      ?.addEventListener("click", async (event) => {
        const loadBtn = event.target.closest("[data-gw-qtb-load]");
        const startBtn = event.target.closest("[data-gw-qtb-start]");
        const deleteBtn = event.target.closest("[data-gw-qtb-delete]");

        if (loadBtn) {
          const row = targetById(loadBtn.dataset.gwQtbLoad);
          if (row?.spec) applySpec(row.spec);
          return;
        }

        if (startBtn) {
          const row = targetById(startBtn.dataset.gwQtbStart);
          if (!row?.spec) return;
          applySpec(row.spec);
          window.setTimeout(() => startCurrentTarget(row), 0);
          return;
        }

        if (deleteBtn) {
          const id = deleteBtn.dataset.gwQtbDelete;
          saveSavedTargets(loadSavedTargets().filter((row) => String(row.id) !== String(id)));
          refreshSavedList();
        }
      });

    state.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  function open(options = {}) {
    if (!window.map || !window.L) {
      toast("Map tools are still loading.");
      return;
    }

    close();
    injectStyles();
    state.context = normalizeContext(options);
    state.nameTouched = false;
    state.root = document.createElement("div");
    state.root.className = "gw-qtb-backdrop";
    state.root.innerHTML = renderWindow(state.context);
    document.body.appendChild(state.root);
    syncLensControl();
    bindWindow();
    updatePreview();
    state.root.querySelector("[data-gw-qtb-name]")?.focus();
  }

  function close() {
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.root?.remove();
    state.root = null;
    state.context = null;
    state.latestPreview = null;
    clearPreviewLayer();
  }

  window.GridWildQuestTargetBuilder = {
    open,
    close,
    getSavedTargets: loadSavedTargets
  };
})();
