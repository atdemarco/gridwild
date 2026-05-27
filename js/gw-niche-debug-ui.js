// js/gw-niche-debug-ui.js
// Small GUI for the current-view niche graph debug/audit layer.

(function () {
  const MODES = [
    ["osm-context", "OSM context"],
    ["path-adjacent", "Path adjacent"],
    ["path-side", "Path side"],
    ["graph-strong-links", "Strong links"],
    ["graph-cut-links", "Cut links"],
    ["regions-pass1", "Pass 1 regions"],
    ["regions-pass2", "Pass 2 regions"],
    ["regions-pass3", "Pass 3 regions"],
    ["region-boundaries", "Boundaries"],
    ["region-evidence", "Evidence"]
  ];

  let panel = null;
  let button = null;

  function $(id) {
    return document.getElementById(id);
  }

  function injectCss() {
    if ($("gwNicheDebugUiCss")) return;
    const style = document.createElement("style");
    style.id = "gwNicheDebugUiCss";
    style.textContent = `
      .gw-niche-debug-btn {
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
      }
      .gw-niche-debug-panel {
        position: fixed;
        left: 12px;
        top: 168px;
        z-index: 99970;
        width: min(330px, calc(100vw - 24px));
        max-height: calc(100vh - 210px);
        overflow: auto;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.34);
        background: rgba(22, 19, 16, 0.94);
        color: #efe6d3;
        box-shadow: 0 18px 44px rgba(0,0,0,0.34);
        backdrop-filter: blur(8px);
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
      }
      .gw-niche-debug-panel[hidden] { display: none; }
      .gw-niche-debug-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 11px;
        border-bottom: 1px solid rgba(215,183,116,0.18);
      }
      .gw-niche-debug-title {
        font-weight: 900;
        font-size: 13px;
      }
      .gw-niche-debug-body {
        padding: 10px 11px 12px;
        display: grid;
        gap: 9px;
      }
      .gw-niche-debug-row {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
      }
      .gw-niche-debug-row label {
        color: rgba(239,230,211,0.72);
        font-size: 11px;
        font-weight: 800;
      }
      .gw-niche-debug-panel select,
      .gw-niche-debug-panel input[type="range"] {
        width: 100%;
      }
      .gw-niche-debug-slider {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 38px;
        align-items: center;
        gap: 8px;
      }
      .gw-niche-debug-value {
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: #f2d08d;
        font-size: 11px;
        font-weight: 900;
      }
      .gw-niche-debug-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .gw-niche-debug-panel button,
      .gw-niche-debug-action {
        border: 1px solid rgba(215,183,116,0.25);
        border-radius: 7px;
        background: rgba(244, 209, 138, 0.14);
        color: #f5ead3;
        font-weight: 900;
        padding: 7px 8px;
      }
      .gw-niche-debug-panel button:active {
        transform: translateY(1px);
      }
      .gw-niche-debug-close {
        width: 28px;
        height: 28px;
        padding: 0;
      }
      .gw-niche-debug-check {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(239,230,211,0.78);
        font-size: 11px;
        font-weight: 800;
      }
      .gw-niche-debug-status,
      .gw-niche-debug-evidence {
        border-radius: 7px;
        background: rgba(255,255,255,0.055);
        padding: 8px;
        color: rgba(239,230,211,0.82);
      }
      .gw-niche-debug-status div,
      .gw-niche-debug-evidence div {
        margin: 2px 0;
      }
      .gw-niche-debug-warn {
        color: #f0c36c;
      }
    `;
    document.head.appendChild(style);
  }

  function makeButton() {
    if (button) return button;
    const host = document.querySelector(".gw-hud-toolband");
    if (!host) return null;

    button = document.createElement("button");
    button.id = "gwNicheDebugToggle";
    button.type = "button";
    button.className = "gw-pill gw-hud-round-btn gw-niche-debug-btn";
    button.title = "Niche graph debug";
    button.setAttribute("aria-label", "Open niche graph debug");
    button.textContent = "NG";
    button.addEventListener("click", () => togglePanel());
    host.appendChild(button);
    return button;
  }

  function sliderRow(id, label, value) {
    return `
      <div class="gw-niche-debug-row">
        <label for="${id}">${label}</label>
        <div class="gw-niche-debug-slider">
          <input id="${id}" type="range" min="0.1" max="0.9" step="0.01" value="${value}" />
          <output class="gw-niche-debug-value" id="${id}Value" for="${id}">${Number(value).toFixed(2)}</output>
        </div>
      </div>
    `;
  }

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "gwNicheDebugPanel";
    panel.className = "gw-niche-debug-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="gw-niche-debug-head">
        <div class="gw-niche-debug-title">Niche Graph Debug</div>
        <button class="gw-niche-debug-close" id="gwNicheDebugClose" type="button" aria-label="Close">x</button>
      </div>
      <div class="gw-niche-debug-body">
        <div class="gw-niche-debug-actions">
          <button id="gwNicheDebugRun" type="button">Run view</button>
          <button id="gwNicheDebugShow" type="button">Hide overlay</button>
        </div>
        <div class="gw-niche-debug-row">
          <label for="gwNicheDebugMode">Mode</label>
          <select id="gwNicheDebugMode">
            ${MODES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </div>
        <div class="gw-niche-debug-row">
          <label for="gwNicheDebugPass">Pass</label>
          <select id="gwNicheDebugPass">
            <option value="1">Pass 1</option>
            <option value="2">Pass 2</option>
            <option value="3">Pass 3</option>
          </select>
        </div>
        <div class="gw-niche-debug-row">
          <label for="gwNicheDebugTrailMode">Trail mode</label>
          <select id="gwNicheDebugTrailMode">
            <option value="corridor">corridor</option>
            <option value="divider">divider</option>
            <option value="neutral">neutral</option>
          </select>
        </div>
        ${sliderRow("gwNicheDebugPass1", "Pass 1 cut", "0.45")}
        ${sliderRow("gwNicheDebugPass2", "Pass 2 cut", "0.50")}
        ${sliderRow("gwNicheDebugPass3", "Pass 3 cut", "0.55")}
        <label class="gw-niche-debug-check">
          <input type="checkbox" id="gwNicheDebugRerun" />
          <span>Rerun after map move</span>
        </label>
        <div class="gw-niche-debug-status" id="gwNicheDebugStatus">
          <div>Run current view to build graph.</div>
        </div>
        <div class="gw-niche-debug-evidence" id="gwNicheDebugEvidence">
          <div>Evidence mode: click a region. Link modes: click a visible edge.</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    bindPanel();
    return panel;
  }

  function readOptions() {
    return {
      mode: $("gwNicheDebugMode")?.value || "regions-pass1",
      pass: Number($("gwNicheDebugPass")?.value || 1),
      trailMode: $("gwNicheDebugTrailMode")?.value || "corridor",
      pass1Threshold: Number($("gwNicheDebugPass1")?.value || 0.45),
      pass2Threshold: Number($("gwNicheDebugPass2")?.value || 0.50),
      pass3Threshold: Number($("gwNicheDebugPass3")?.value || 0.55)
    };
  }

  function syncSliderValue(id) {
    const input = $(id);
    const output = $(`${id}Value`);
    if (!input || !output) return;
    output.value = Number(input.value || 0).toFixed(2);
    output.textContent = output.value;
  }

  function toast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    }
  }

  function run() {
    const runBtn = $("gwNicheDebugRun");
    const previousText = runBtn?.textContent || "Run view";

    try {
      toast("Building niche graph for current view...");
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Running...";
      }

      const result = window.GridWildNicheDebug?.runCurrentView?.(readOptions());
      if (result) {
        toast(`Niche graph ready: ${result.cells.length} cells, ${result.graph.edges.length} edges`);
      }
      return result;
    } catch (err) {
      console.warn("GridWild niche graph run failed:", err);
      toast("Niche graph run failed");
      throw err;
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = previousText;
      }
    }
  }

  function bindPanel() {
    $("gwNicheDebugClose")?.addEventListener("click", () => togglePanel(false));
    $("gwNicheDebugRun")?.addEventListener("click", run);
    $("gwNicheDebugShow")?.addEventListener("click", () => {
      const next = !(window.GridWildNicheDebugState?.visible === true);
      window.GridWildNicheDebug?.toggle?.(next);
    });
    $("gwNicheDebugMode")?.addEventListener("change", () => {
      const value = $("gwNicheDebugMode").value;
      window.GridWildNicheDebug?.setMode?.(value);
    });
    $("gwNicheDebugPass")?.addEventListener("change", () => {
      window.GridWildNicheDebug?.setPass?.($("gwNicheDebugPass").value);
    });
    ["gwNicheDebugPass1", "gwNicheDebugPass2", "gwNicheDebugPass3"].forEach(id => {
      syncSliderValue(id);
      $(id)?.addEventListener("input", () => syncSliderValue(id));
    });
    ["gwNicheDebugPass1", "gwNicheDebugPass2", "gwNicheDebugPass3", "gwNicheDebugTrailMode"].forEach(id => {
      $(id)?.addEventListener("change", () => {
        if (window.GridWildNicheDebug?.getLastResult?.()) run();
      });
    });
    $("gwNicheDebugRerun")?.addEventListener("change", () => {
      window.GridWildNicheDebug.rerunOnMove = $("gwNicheDebugRerun").checked;
    });
  }

  function togglePanel(show) {
    makePanel();
    panel.hidden = show == null ? !panel.hidden : show !== true;
  }

  function regionCounts(result) {
    if (!result) return "Regions: none";
    return `Regions: P1 ${result.regionsPass1.length}, P2 ${result.regionsPass2.length}, P3 ${result.regionsPass3.length}`;
  }

  function updateStatus(detail = {}) {
    const result = detail.result;
    const status = $("gwNicheDebugStatus");
    const evidence = $("gwNicheDebugEvidence");
    const showBtn = $("gwNicheDebugShow");
    window.GridWildNicheDebugState = detail;

    if (showBtn) showBtn.textContent = detail.visible ? "Hide overlay" : "Show overlay";
    if (button) button.classList.toggle("is-on", detail.visible === true);

    if (status) {
      if (!result) {
        status.innerHTML = "<div>Run current view to build graph.</div>";
      } else {
        const warnings = result.debug?.warnings || [];
        const p2Size = Number(result.options?.pass2NeighborhoodSize || 5);
        const p2Active = Number(result.options?.pass2NeighborhoodMinActiveCells || 2);
        const p2Obs = Number(result.options?.pass2NeighborhoodMinObservations || 3);
        status.innerHTML = `
          <div>Cells: ${result.cells.length.toLocaleString()} | Edges: ${result.graph.edges.length.toLocaleString()}</div>
          <div>${regionCounts(result)}</div>
          <div>Stride: ${result.debug?.visibleStrideCells || 1} | OSM path cells: ${result.osmPriorsSummary.pathAdjacent}</div>
          <div>Pass 2 Lens: ${p2Size}x${p2Size} pool | min ${p2Active} cells / ${p2Obs} obs</div>
          ${warnings.slice(0, 2).map(w => `<div class="gw-niche-debug-warn">${w}</div>`).join("")}
        `;
      }
    }

    if (evidence) {
      const inspection = detail.inspection;
      if (!inspection) {
        evidence.innerHTML = "<div>Evidence mode: click a region. Link modes: click a visible edge.</div>";
      } else {
        if (inspection.type === "edge") {
          evidence.innerHTML = `
            <div><b>${inspection.id}</b></div>
            ${inspection.a && inspection.b ? `<div>${inspection.a} -> ${inspection.b}</div>` : ""}
            ${(inspection.evidence || []).map(item => `<div>${item}</div>`).join("")}
          `;
        } else {
          evidence.innerHTML = `
            <div><b>${inspection.id}</b></div>
            ${(inspection.evidence || []).map(item => `<div>${item}</div>`).join("")}
          `;
        }
      }
    }
  }

  function init() {
    injectCss();
    makeButton();
    makePanel();
    window.addEventListener("gwNicheDebugUpdated", evt => updateStatus(evt.detail || {}));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
