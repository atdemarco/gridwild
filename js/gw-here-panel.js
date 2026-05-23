(function () {
  const HERE_RADIUS_CELLS = 7;
  const MAX_TAXA_CELLS = 225;
  const MAX_SELECTION_TAXA_CELLS = 1600;
  const TAXON_LABELS = {
    Aves: "Birds",
    Mammalia: "Mammals",
    Plantae: "Plants",
    Fungi: "Fungi",
    Insecta: "Insects",
    Reptilia: "Reptiles",
    Amphibia: "Amphibians",
    Arachnida: "Arachnids",
    Mollusca: "Mollusks",
    Actinopterygii: "Fishes",
    Unknown: "Unknown"
  };

  const TAXON_COLORS = [
    "#79c86b",
    "#e0b24d",
    "#62b7c7",
    "#d47b63",
    "#9a8bd8",
    "#c77fb6",
    "#7fb069",
    "#d19a66",
    "#6f9ed4"
  ];

  const GENUS_COMMON_ALIASES = {
    Acer: "Maples",
    Aloe: "Aloes",
    Apis: "Honey Bees",
    Eristalis: "Drone Flies",
    Hibiscus: "Hibiscus",
    Mentha: "Mints",
    Quercus: "Oaks",
    Rudbeckia: "Black-eyed Susans",
    Zinnia: "Zinnias"
  };

  function gridApi() {
    return window.GridWildGrid;
  }

  function esc(value) {
    return gridApi()?.escapeHtml?.(value) || String(value ?? "");
  }

  function toast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    }
  }

  function injectStyles() {
    if (document.getElementById("gwHerePanelStyles")) return;
    const style = document.createElement("style");
    style.id = "gwHerePanelStyles";
    style.textContent = `
      .gw-hud-toolband.has-here-tools {
        width: max-content;
        grid-auto-flow: column;
        grid-auto-columns: var(--gw-hud-round-button-size);
        grid-template-columns: none;
      }

      .gw-hud-toolband.has-here-tools .gw-hud-round-btn {
        box-sizing: border-box;
      }

      .gw-hud-select-btn.is-armed,
      .gw-hud-select-btn.has-selection,
      .gw-hud-investigate-btn.is-on {
        color: #ffe7a3;
        border-color: rgba(240,209,138,0.72);
        box-shadow:
          0 14px 34px rgba(0,0,0,0.46),
          inset 0 0 0 1px rgba(255,225,151,0.28),
          0 0 12px rgba(240,209,138,0.18);
      }

      .gw-hud-select-btn .gw-select-hand-icon,
      .gw-hud-select-btn.has-selection .gw-select-lasso-icon {
        display: none;
      }

      .gw-hud-select-btn.has-selection .gw-select-hand-icon {
        display: block;
      }

      .gw-selection-active #map {
        cursor: crosshair;
      }

      .gw-here-panel {
        box-sizing: border-box;
        position: absolute;
        right: 12px;
        top: max(74px, calc(env(safe-area-inset-top) + 74px));
        z-index: 1325;
        width: 248px;
        pointer-events: auto;
        color: #efe6d3;
        background:
          linear-gradient(180deg, rgba(43, 36, 29, 0.97), rgba(20, 17, 15, 0.99));
        border: 1px solid rgba(240, 209, 138, 0.42);
        border-radius: 8px;
        box-shadow:
          0 14px 34px rgba(0,0,0,0.46),
          inset 0 1px 0 rgba(255,255,255,0.06),
          inset 0 0 0 1px rgba(255,255,255,0.025);
        padding: 9px;
        backdrop-filter: blur(4px) saturate(0.85);
        -webkit-backdrop-filter: blur(4px) saturate(0.85);
      }

      .gw-here-panel[hidden] {
        display: none;
      }

      .gw-here-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .gw-here-title {
        font-size: 11px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: 0;
        text-transform: uppercase;
        color: #f0d18a;
      }

      .gw-here-meta {
        font-size: 9.5px;
        line-height: 1;
        color: rgba(239,230,211,0.62);
        white-space: nowrap;
      }

      .gw-here-map {
        width: 100%;
        aspect-ratio: 1 / 0.72;
        overflow: hidden;
        border: 1px solid rgba(240,209,138,0.26);
        border-radius: 6px;
        background: rgba(8, 10, 9, 0.56);
      }

      .gw-here-map svg,
      .gw-here-pie svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .gw-here-pie {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 0.76;
        margin-top: 9px;
        overflow: hidden;
        border-radius: 6px;
        background: rgba(239,230,211,0.08);
        border: 1px solid rgba(240,209,138,0.16);
      }

      .gw-here-pie-chart {
        width: 100%;
        height: 100%;
      }

      .gw-here-pie-home {
        position: absolute;
        right: 5px;
        top: 5px;
        z-index: 2;
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: #f0d18a;
        background: rgba(20,17,15,0.82);
        border: 1px solid rgba(240,209,138,0.36);
        box-shadow: 0 5px 12px rgba(0,0,0,0.28);
        padding: 0;
        cursor: pointer;
      }

      .gw-here-pie-home svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-here-pie-slice {
        cursor: zoom-in;
        transition: filter 120ms ease, transform 120ms ease;
      }

      .gw-here-pie-slice:hover {
        filter: brightness(1.12) saturate(1.08);
      }

      .gw-here-taxa-list {
        display: grid;
        gap: 6px;
        margin-top: 8px;
      }

      .gw-here-taxa-group {
        display: grid;
        gap: 4px;
      }

      .gw-here-taxa-heading {
        font-size: 8.5px;
        line-height: 1;
        color: rgba(240,209,138,0.72);
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-here-inline-list {
        display: block;
        color: rgba(239,230,211,0.76);
        font-size: 10px;
        line-height: 1.55;
      }

      .gw-here-inline-item {
        display: inline-block;
        vertical-align: baseline;
        white-space: nowrap;
      }

      .gw-here-inline-link {
        display: inline;
        border: 0;
        background: transparent;
        color: rgba(239,230,211,0.92);
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: 850;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }

      .gw-here-inline-link:hover {
        color: #f0d18a;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .gw-here-inline-count {
        color: rgba(239,230,211,0.50);
        font-size: 0.82em;
        font-weight: 750;
      }

      .gw-here-inline-comma {
        color: rgba(239,230,211,0.42);
      }

      .gw-here-taxa-row {
        width: 100%;
        min-width: 0;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 7px;
        border: 1px solid rgba(240,209,138,0.13);
        border-radius: 6px;
        background: rgba(0,0,0,0.14);
        color: rgba(239,230,211,0.88);
        padding: 5px 6px;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-here-taxa-row:hover {
        border-color: rgba(240,209,138,0.30);
        background: rgba(240,209,138,0.08);
      }

      .gw-here-observer-row {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        border: 1px solid rgba(240,209,138,0.13);
        border-radius: 6px;
        background: rgba(0,0,0,0.14);
        color: rgba(239,230,211,0.88);
        padding: 5px 6px;
        box-sizing: border-box;
      }

      .gw-here-observer-avatar {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        background: rgba(240,209,138,0.10);
        border: 1px solid rgba(240,209,138,0.22);
      }

      .gw-here-observer-avatar.is-empty {
        display: grid;
        place-items: center;
        color: rgba(240,209,138,0.82);
        font-size: 10px;
        font-weight: 950;
      }

      .gw-here-observer-name {
        min-width: 0;
        display: grid;
        gap: 1px;
      }

      .gw-here-observer-login,
      .gw-here-observer-real {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-observer-login {
        font-size: 10px;
        font-weight: 850;
      }

      .gw-here-observer-real {
        font-size: 8.5px;
        font-weight: 750;
        color: rgba(239,230,211,0.50);
      }

      .gw-here-taxa-name {
        min-width: 0;
        display: grid;
        gap: 1px;
        overflow: hidden;
        font-size: 10px;
        font-weight: 850;
      }

      .gw-here-taxa-name-main,
      .gw-here-taxa-name-sub {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-taxa-name-sub {
        font-size: 8.5px;
        font-weight: 750;
        color: rgba(239,230,211,0.50);
      }

      .gw-here-taxa-count {
        flex: 0 0 auto;
        font-size: 9px;
        color: rgba(239,230,211,0.58);
        white-space: nowrap;
      }

      .gw-here-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin-top: 8px;
      }

      .gw-here-stat {
        min-width: 0;
        border-radius: 6px;
        border: 1px solid rgba(240,209,138,0.14);
        background: rgba(0,0,0,0.16);
        padding: 5px 4px;
      }

      .gw-here-stat b,
      .gw-here-stat span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-here-stat b {
        font-size: 12px;
        line-height: 1.05;
      }

      .gw-here-stat span {
        margin-top: 2px;
        font-size: 8.5px;
        line-height: 1;
        color: rgba(239,230,211,0.58);
        text-transform: uppercase;
        font-weight: 850;
      }

      .gw-selection-rect {
        stroke: #ffe7a3;
        stroke-width: 2.4;
        stroke-dasharray: 6 5;
        stroke-linejoin: round;
        fill: rgba(255,231,163,0.08);
        animation: gw-selection-dash 1.1s linear infinite;
      }

      @keyframes gw-selection-dash {
        to { stroke-dashoffset: -22; }
      }

      @media (max-width: 760px) {
        .gw-here-panel {
          top: max(70px, calc(env(safe-area-inset-top) + 70px));
          right: 9px;
          width: 176px;
          padding: 7px;
        }

        .gw-here-map {
          aspect-ratio: 1 / 0.82;
        }

        .gw-here-pie {
          aspect-ratio: 1 / 0.88;
        }

        .gw-here-taxa-list {
          max-height: 154px;
          overflow: auto;
        }

        .gw-here-stats {
          grid-template-columns: 1fr;
        }

        .gw-here-stat {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 6px;
        }

        .gw-here-stat span {
          margin-top: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const band = document.querySelector(".gw-hud-toolband");
    if (!band) return;

    band.classList.add("has-here-tools");

    if (!document.getElementById("gwHudInvestigateBtn")) {
      const investigateBtn = document.createElement("button");
      investigateBtn.className = "gw-pill gw-hud-round-btn gw-hud-investigate-btn";
      investigateBtn.id = "gwHudInvestigateBtn";
      investigateBtn.type = "button";
      investigateBtn.setAttribute("aria-label", "Investigate here");
      investigateBtn.setAttribute("aria-expanded", "false");
      investigateBtn.setAttribute("aria-controls", "gwHerePanel");
      investigateBtn.title = "Investigate";
      investigateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 6.5h8.5l2.5 2.5v8.5H7z"></path>
          <path d="M15.5 6.5V9h2.5"></path>
          <circle cx="10.6" cy="11.6" r="3.1"></circle>
          <path d="m12.9 13.9 3.6 3.6"></path>
        </svg>
      `;
      band.appendChild(investigateBtn);
    }

    if (document.getElementById("gwHudSelectTool")) return;

    const btn = document.createElement("button");
    btn.className = "gw-pill gw-hud-round-btn gw-hud-select-btn";
    btn.id = "gwHudSelectTool";
    btn.type = "button";
    btn.setAttribute("aria-label", "Select cells");
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Select cells";
    btn.innerHTML = `
      <svg class="gw-select-lasso-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.2 6.8c2.2-2.1 7.5-2.6 10.5-.8 3.4 2.1 3.1 6.8-.1 8.8-3 1.9-8.5 1.6-10.9-.5-2.4-2.1-2-5.5.5-7.5Z" stroke-dasharray="2.2 2.4"></path>
        <path d="M15.6 14.7 20 20"></path>
        <path d="M18.3 20h3.1"></path>
      </svg>
      <svg class="gw-select-hand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 12.5V6.8a1.4 1.4 0 0 1 2.8 0v5"></path>
        <path d="M10.8 11.8V5.5a1.4 1.4 0 0 1 2.8 0v6.3"></path>
        <path d="M13.6 12V7a1.35 1.35 0 0 1 2.7 0v6"></path>
        <path d="M16.3 13v-2.2a1.3 1.3 0 0 1 2.6 0v4.4c0 3.8-2.5 5.8-5.8 5.8h-1.1c-2 0-3.4-.8-4.7-2.5L4.9 15a1.45 1.45 0 0 1 2.2-1.9L9 14.6"></path>
      </svg>
    `;
    band.appendChild(btn);
  }

  function ensurePanel() {
    let panel = document.getElementById("gwHerePanel");
    if (panel) return panel;

    panel = document.createElement("aside");
    panel.className = "gw-here-panel";
    panel.id = "gwHerePanel";
    panel.setAttribute("aria-label", "Here panel");
    panel.hidden = !herePanelOpen;
    panel.innerHTML = `
      <div class="gw-here-head">
        <div class="gw-here-title" id="gwHereTitle">Here</div>
        <div class="gw-here-meta" id="gwHereMeta">15 x 15</div>
      </div>
      <div class="gw-here-map" id="gwHereMap"></div>
      <div class="gw-here-pie" id="gwHerePie">
        <button class="gw-here-pie-home" id="gwHerePieHome" type="button" aria-label="Reset taxa chart" title="Reset taxa chart">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 11.5 12 4l9 7.5"></path>
            <path d="M6 10.5V20h12v-9.5"></path>
            <path d="M10 20v-5h4v5"></path>
          </svg>
        </button>
        <div class="gw-here-pie-chart" id="gwHerePieChart"></div>
      </div>
      <div class="gw-here-taxa-list" id="gwHereTaxaList"></div>
      <div class="gw-here-stats" id="gwHereStats"></div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle, explode = 0) {
    const mid = (startAngle + endAngle) / 2;
    const offX = Math.cos(mid) * explode;
    const offY = Math.sin(mid) * explode;
    const point = (r, a) => ({
      x: cx + offX + Math.cos(a) * r,
      y: cy + offY + Math.sin(a) * r
    });
    const p1 = point(rOuter, startAngle);
    const p2 = point(rOuter, endAngle);
    const p3 = point(rInner, endAngle);
    const p4 = point(rInner, startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
      "Z"
    ].join(" ");
  }

  function renderMiniMap(bounds, selectedBounds) {
    const api = gridApi();
    if (!api) return "";

    const cells = api.cellsForBounds(bounds);
    const widthCells = bounds.maxIx - bounds.minIx + 1;
    const heightCells = bounds.maxIy - bounds.minIy + 1;
    const cell = 12;
    const gap = 0.8;
    const w = widthCells * cell;
    const h = heightCells * cell;
    const selected = selectedBounds || null;
    const userCell = api.currentUserCell?.();
    const centerCell = api.centerCell?.();

    const rects = cells.map(item => {
      const x = (item.ix - bounds.minIx) * cell;
      const y = (bounds.maxIy - item.iy) * cell;
      const style = item.style || {};
      const fill = style.fillColor || "rgba(239,230,211,0.12)";
      const alpha = Math.max(0.16, Math.min(0.9, Number(style.fillOpacity || 0.18)));
      return `<rect x="${x + gap / 2}" y="${y + gap / 2}" width="${cell - gap}" height="${cell - gap}" rx="1.2" fill="${fill}" opacity="${alpha}"></rect>`;
    }).join("");

    const selectionRect = selected ? (() => {
      const x = (selected.minIx - bounds.minIx) * cell;
      const y = (bounds.maxIy - selected.maxIy) * cell;
      const rw = (selected.maxIx - selected.minIx + 1) * cell;
      const rh = (selected.maxIy - selected.minIy + 1) * cell;
      return `<rect class="gw-selection-rect" x="${x + 1.2}" y="${y + 1.2}" width="${Math.max(0, rw - 2.4)}" height="${Math.max(0, rh - 2.4)}" rx="2.2"></rect>`;
    })() : "";

    function markerFor(cellInfo, cls, label, color) {
      if (!cellInfo) return "";
      if (
        cellInfo.ix < bounds.minIx ||
        cellInfo.ix > bounds.maxIx ||
        cellInfo.iy < bounds.minIy ||
        cellInfo.iy > bounds.maxIy
      ) return "";

      const x = (cellInfo.ix - bounds.minIx + 0.5) * cell;
      const y = (bounds.maxIy - cellInfo.iy + 0.5) * cell;
      return `
        <g class="${cls}">
          <circle cx="${x}" cy="${y}" r="4.3" fill="${color}" stroke="rgba(20,17,15,0.9)" stroke-width="1.3"></circle>
          <text x="${x}" y="${y + 2.8}" text-anchor="middle" font-size="6.4" font-weight="950" fill="rgba(20,17,15,0.96)">${label}</text>
        </g>
      `;
    }

    return `
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Here minimap">
        <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(7,9,8,0.58)"></rect>
        ${rects}
        ${selectionRect}
        ${markerFor(centerCell, "gw-here-center", "+", "#f0d18a")}
        ${markerFor(userCell, "gw-here-avatar", "A", "#98e6c4")}
      </svg>
    `;
  }

  function taxonDisplayName(name) {
    return TAXON_LABELS[name] || name || "Unknown";
  }

  function makeTaxonomyTree(record) {
    const root = {
      name: "Life",
      rank: "root",
      path: "root",
      weight: 0,
      genusNames: new Set(),
      rows: [],
      children: new Map()
    };

    const rows = Array.isArray(record?.genera) ? record.genera : [];

    function child(parent, rank, name) {
      const label = name || "Unknown";
      const key = `${rank}:${label}`;
      if (!parent.children.has(key)) {
        parent.children.set(key, {
          name: label,
          rank,
          path: `${parent.path}/${encodeURIComponent(key)}`,
          weight: 0,
          genusNames: new Set(),
          rows: [],
          children: new Map()
        });
      }
      return parent.children.get(key);
    }

    for (const row of rows) {
      const count = Math.max(0, Number(row?.count) || 0);
      if (count <= 0) continue;

      const genus = row?.genus_name || "Unknown";
      const parts = [
        ["iconic_taxon", row?.iconic_taxon_name || "Unknown"],
        ["order", row?.order_name || "Unknown"],
        ["family", row?.family_name || "Unknown"],
        ["genus", genus]
      ];

      let node = root;
      node.weight += count;
      node.rows.push(row);
      if (genus !== "Unknown") node.genusNames.add(genus);

      for (const [rank, name] of parts) {
        node = child(node, rank, name);
        node.weight += count;
        node.rows.push(row);
        if (genus !== "Unknown") node.genusNames.add(genus);
      }
    }

    function finalize(node) {
      return {
        ...node,
        genusCount: node.genusNames.size,
        children: Array.from(node.children.values())
          .map(finalize)
          .sort((a, b) =>
            (b.weight - a.weight) ||
            (b.genusCount - a.genusCount) ||
            a.name.localeCompare(b.name)
          )
      };
    }

    return finalize(root);
  }

  function findPieNode(node, path) {
    if (!node) return null;
    if (node.path === path) return node;
    for (const child of node.children || []) {
      const found = findPieNode(child, path);
      if (found) return found;
    }
    return null;
  }

  function currentPieNode() {
    return findPieNode(herePieState.tree, herePieState.currentPath) || herePieState.tree;
  }

  function resetPieState(record, signature) {
    herePieState.signature = signature;
    herePieState.record = record;
    herePieState.tree = makeTaxonomyTree(record);
    herePieState.currentPath = "root";
    herePieState.pathStack = [];
  }

  function renderPie() {
    const node = currentPieNode();
    const counts = (node?.children || [])
      .filter(child => Number(child.weight) > 0)
      .slice(0, 10);

    if (!counts.length) {
      return `
        <svg viewBox="0 0 220 160" role="img" aria-label="No taxa data" data-pie-back="true">
          <text x="110" y="74" text-anchor="middle" font-size="12" font-weight="850" fill="rgba(239,230,211,0.72)">No taxa yet</text>
          <text x="110" y="92" text-anchor="middle" font-size="10" fill="rgba(239,230,211,0.48)">selected cells are quiet</text>
        </svg>
      `;
    }

    const total = counts.reduce((sum, item) => sum + item.weight, 0) || 1;
    const cx = 75;
    const cy = 80;
    const rOuter = 50;
    const rInner = 22;
    let cursor = -Math.PI / 2;
    const slices = counts.map((item, index) => {
      const angle = (item.weight / total) * Math.PI * 2;
      const start = cursor;
      const end = cursor + angle;
      cursor = end;
      const color = TAXON_COLORS[index % TAXON_COLORS.length];
      const mid = (start + end) / 2;
      const lx = cx + Math.cos(mid) * 78;
      const ly = cy + Math.sin(mid) * 58;
      const pct = Math.round((item.weight / total) * 100);
      const label = taxonDisplayName(item.name);
      const canZoom = (item.children || []).length > 0;
      return `
        <g class="gw-here-pie-slice" data-pie-path="${esc(item.path)}" data-can-zoom="${canZoom ? "true" : "false"}">
          <title>${esc(label)} - ${item.weight} obs - ${item.genusCount} genera</title>
          <path d="${arcPath(cx, cy, rOuter, rInner, start, end, 3.5)}" fill="${color}" stroke="rgba(255,255,255,0.82)" stroke-width="1.2"></path>
          ${pct >= 9 ? `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" font-weight="850" fill="rgba(239,230,211,0.88)">${esc(label)}</text>` : ""}
        </g>
      `;
    }).join("");

    const legend = counts.slice(0, 4).map((item, index) => {
      const label = taxonDisplayName(item.name);
      return `
        <g transform="translate(142 ${38 + index * 22})">
          <rect x="0" y="-8" width="8" height="8" rx="2" fill="${TAXON_COLORS[index % TAXON_COLORS.length]}"></rect>
          <text x="13" y="-2" font-size="9.5" font-weight="800" fill="rgba(239,230,211,0.82)">${esc(label)}</text>
          <text x="13" y="10" font-size="8.5" fill="rgba(239,230,211,0.52)">${item.weight} obs</text>
        </g>
      `;
    }).join("");

    const centerLabel = node?.rank === "root" ? "Taxa" : taxonDisplayName(node.name);
    return `
      <svg viewBox="0 0 220 160" role="img" aria-label="Taxa pie chart">
        <rect x="0" y="0" width="220" height="160" fill="transparent" data-pie-back="true"></rect>
        ${slices}
        <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="rgba(20,17,15,0.94)" stroke="rgba(240,209,138,0.18)"></circle>
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="10.5" font-weight="950" fill="#f0d18a">${esc(centerLabel).slice(0, 16)}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="8.5" fill="rgba(239,230,211,0.55)">${node.weight} obs</text>
        ${legend}
      </svg>
    `;
  }

  function formatCommonName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function genusCommonName(genus) {
    const rec = window.GridWildGenusCodex?.genera?.[genus];
    return formatCommonName(rec?.common || GENUS_COMMON_ALIASES[genus] || "");
  }

  function taxonListLabel(row) {
    const genus = row?.genus || row?.genus_name || "Unknown";
    const common = genusCommonName(genus);
    if (common && common !== genus) {
      return { main: common, sub: genus };
    }

    return { main: genus, sub: "" };
  }

  function scaledListFontSize(count, maxCount, minPx = 10, maxPx = 13) {
    const value = Math.max(0, Number(count) || 0);
    const max = Math.max(1, Number(maxCount) || 1);
    const t = Math.sqrt(value / max);
    return (minPx + (maxPx - minPx) * t).toFixed(1);
  }

  function inlineComma(index, total) {
    return index < total - 1 ? `<span class="gw-here-inline-comma">, </span>` : "";
  }

  function aggregateGeneraFromRows(rows) {
    const byGenus = new Map();

    for (const row of rows) {
      const genus = row?.genus_name;
      if (!genus || genus === "Unknown") continue;
      const count = Number(row?.count) || 0;
      if (count <= 0) continue;

      if (!byGenus.has(genus)) {
        byGenus.set(genus, {
          genus,
          count: 0,
          family: row?.family_name || "",
          order: row?.order_name || "",
          iconic: row?.iconic_taxon_name || ""
        });
      }

      byGenus.get(genus).count += count;
    }

    return Array.from(byGenus.values());
  }

  function renderTaxaList() {
    const node = currentPieNode();
    const genera = aggregateGeneraFromRows(node?.rows || []);
    if (!genera.length) {
      return `<div class="gw-here-taxa-heading">No genus-level taxa in this context</div>`;
    }

    const common = genera
      .slice()
      .sort((a, b) => (b.count - a.count) || a.genus.localeCompare(b.genus))
      .slice(0, 5);
    const commonNames = new Set(common.map(row => row.genus));
    let rare = genera
      .filter(row => !commonNames.has(row.genus))
      .sort((a, b) => (a.count - b.count) || a.genus.localeCompare(b.genus))
      .slice(0, 5);

    if (!rare.length) {
      rare = genera
        .slice()
        .sort((a, b) => (a.count - b.count) || a.genus.localeCompare(b.genus))
        .slice(0, 5);
    }

    const nodeLabel = node?.rank === "root" ? "" : ` - ${taxonDisplayName(node.name)}`;
    const taxaMaxCount = Math.max(...genera.map(row => Number(row.count) || 0), 1);

    function section(title, rows) {
      return `
        <div class="gw-here-taxa-group">
          <div class="gw-here-taxa-heading">${title}${esc(nodeLabel)}</div>
          <div class="gw-here-inline-list">
          ${rows.map((row, index) => {
            const label = taxonListLabel(row);
            const titleText = label.sub
              ? `${label.main} (${label.sub})`
              : label.main;
            const fontSize = scaledListFontSize(row.count, taxaMaxCount);
            return `
              <span class="gw-here-inline-item" style="font-size:${fontSize}px">
                <button class="gw-here-inline-link" type="button" data-genus="${esc(row.genus)}" title="${esc(titleText)} - ${esc(row.family || row.order || row.iconic || row.genus)}">${esc(label.main)}</button>
                <span class="gw-here-inline-count">${row.count}</span>${inlineComma(index, rows.length)}
              </span>
            `;
          }).join("")}
          </div>
        </div>
      `;
    }

    return `${section("Common taxa", common)}${section("Rare taxa", rare)}`;
  }

  function renderTopObserversList(record, observerDict) {
    const rows = (Array.isArray(record?.top_observers) ? record.top_observers : [])
      .filter(row => (Number(row?.observer_id) || row?.observer_login) && Number(row?.count) > 0)
      .sort((a, b) =>
        (Number(b.count) - Number(a.count)) ||
        (Number(b.species) - Number(a.species)) ||
        String(a.observer_login || a.observer_id || "").localeCompare(String(b.observer_login || b.observer_id || ""))
      )
      .slice(0, 5);

    if (!rows.length) {
      return `
        <div class="gw-here-taxa-group">
          <div class="gw-here-taxa-heading">Top observers</div>
          <div class="gw-here-taxa-heading">No observer leaderboard for this context</div>
        </div>
      `;
    }

    const api = gridApi();
    const maxCount = Math.max(...rows.map(row => Number(row.count) || 0), 1);

    return `
      <div class="gw-here-taxa-group">
        <div class="gw-here-taxa-heading">Top observers</div>
        <div class="gw-here-inline-list">
        ${rows.map((row, index) => {
          const observerId = Number(row.observer_id);
          const meta = Number.isFinite(observerId) && observerId > 0
            ? api?.observerMeta?.(observerDict, observerId) || {}
            : {};
          const login = row.observer_login || meta.login || `user ${observerId}`;
          const name = row.observer_name || meta.name || "";
          const count = Number(row.count) || 0;
          const species = Number(row.species) || 0;
          const fontSize = scaledListFontSize(count, maxCount, 9.8, 12.8);
          const url = row.observer_url || (login && !login.startsWith("user ")
            ? `https://www.inaturalist.org/people/${encodeURIComponent(login)}`
            : "");

          return `
            <span class="gw-here-inline-item" style="font-size:${fontSize}px" title="${esc(name || login)}">
              ${url ? `
                <a class="gw-here-inline-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">@${esc(login)}</a>
              ` : `
                <span class="gw-here-inline-link">@${esc(login)}</span>
              `}
              <span class="gw-here-inline-count">${count}${species ? `/${species} spp` : ""}</span>${inlineComma(index, rows.length)}
            </span>
          `;
        }).join("")}
        </div>
      </div>
    `;
  }

  function renderContextLists(previewNote = "") {
    return `${previewNote}${renderTaxaList()}${renderTopObserversList(herePieState.record, herePieState.observerDict)}`;
  }

  function summarizeCells(bounds) {
    const api = gridApi();
    const cells = api?.cellsForBounds?.(bounds) || [];
    return cells.reduce((acc, cell) => {
      const m = cell.metrics || {};
      const count = Number(m.count) || 0;
      acc.obs += count;
      acc.species += Number(m.species) || 0;
      if (count > 0) acc.active++;
      return acc;
    }, { cells: cells.length, active: 0, obs: 0, species: 0 });
  }

  function cellCountForBounds(bounds) {
    if (!bounds) return 0;
    return Math.max(0, bounds.maxIx - bounds.minIx + 1) *
      Math.max(0, bounds.maxIy - bounds.minIy + 1);
  }

  function centeredTaxaBounds(bounds, maxCells) {
    const count = cellCountForBounds(bounds);
    if (!bounds || count <= maxCells) return bounds;

    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const aspect = Math.max(0.25, Math.min(4, width / Math.max(1, height)));
    let takeW = Math.max(1, Math.min(width, Math.floor(Math.sqrt(maxCells * aspect))));
    let takeH = Math.max(1, Math.min(height, Math.floor(maxCells / takeW)));

    while (takeW * takeH > maxCells && takeH > 1) takeH--;
    while (takeW * takeH > maxCells && takeW > 1) takeW--;

    const centerIx = Math.floor((bounds.minIx + bounds.maxIx) / 2);
    const centerIy = Math.floor((bounds.minIy + bounds.maxIy) / 2);
    let minIx = centerIx - Math.floor((takeW - 1) / 2);
    let minIy = centerIy - Math.floor((takeH - 1) / 2);
    minIx = Math.max(bounds.minIx, Math.min(minIx, bounds.maxIx - takeW + 1));
    minIy = Math.max(bounds.minIy, Math.min(minIy, bounds.maxIy - takeH + 1));

    return {
      minIx,
      maxIx: minIx + takeW - 1,
      minIy,
      maxIy: minIy + takeH - 1
    };
  }

  function getTaxaBoundsForContext(bounds, selection) {
    const maxCells = selection ? MAX_SELECTION_TAXA_CELLS : MAX_TAXA_CELLS;
    const count = cellCountForBounds(bounds);
    const taxaBounds = centeredTaxaBounds(bounds, maxCells);
    return {
      bounds: taxaBounds,
      capped: count > maxCells,
      cellCount: count,
      taxaCellCount: cellCountForBounds(taxaBounds)
    };
  }

  let refreshToken = 0;
  let herePanelOpen = false;
  const herePieState = {
    signature: null,
    record: null,
    observerDict: null,
    previewNote: "",
    tree: null,
    currentPath: "root",
    pathStack: []
  };

  function investigateButton() {
    return document.getElementById("gwHudInvestigateBtn");
  }

  function syncHerePanelState() {
    const panel = ensurePanel();
    const btn = investigateButton();
    if (panel) panel.hidden = !herePanelOpen;
    if (btn) {
      btn.classList.toggle("is-on", herePanelOpen);
      btn.setAttribute("aria-expanded", herePanelOpen ? "true" : "false");
      btn.setAttribute("aria-label", herePanelOpen ? "Close investigation" : "Investigate here");
      btn.title = herePanelOpen ? "Close investigation" : "Investigate";
    }
  }

  function setHerePanelOpen(open, options = {}) {
    herePanelOpen = open === true;
    syncHerePanelState();
    if (herePanelOpen && options.refresh !== false) {
      scheduleRefresh(10);
    }
  }

  function toggleHerePanel() {
    setHerePanelOpen(!herePanelOpen);
  }

  function rerenderPieOnly() {
    const chartEl = document.getElementById("gwHerePieChart");
    if (chartEl) chartEl.innerHTML = renderPie();
  }

  function rerenderTaxaListOnly() {
    const listEl = document.getElementById("gwHereTaxaList");
    if (listEl) listEl.innerHTML = renderContextLists(herePieState.previewNote || "");
  }

  function rerenderTaxaHud() {
    rerenderPieOnly();
    rerenderTaxaListOnly();
  }

  function zoomPieTo(path) {
    const node = findPieNode(herePieState.tree, path);
    if (!node) return;

    if (!node.children?.length) {
      if (node.rank === "genus" && node.name && node.name !== "Unknown") {
        window.GridWildGenusCodex?.open?.(node.name);
      }
      return;
    }

    herePieState.pathStack = herePieState.pathStack || [];
    herePieState.pathStack.push(herePieState.currentPath || "root");
    herePieState.currentPath = path;
    rerenderTaxaHud();
  }

  function zoomPieBack() {
    if (herePieState.pathStack?.length) {
      herePieState.currentPath = herePieState.pathStack.pop();
    } else {
      herePieState.currentPath = "root";
    }
    rerenderTaxaHud();
  }

  function zoomPieHome() {
    herePieState.currentPath = "root";
    herePieState.pathStack = [];
    rerenderTaxaHud();
  }

  function bindHerePanelInteractions() {
    const panel = ensurePanel();
    if (!panel || panel.dataset.interactionsBound === "true") return;
    panel.dataset.interactionsBound = "true";

    panel.addEventListener("click", evt => {
      const home = evt.target.closest?.("#gwHerePieHome");
      if (home) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieHome();
        return;
      }

      const taxonRow = evt.target.closest?.("[data-genus]");
      if (taxonRow) {
        evt.preventDefault();
        evt.stopPropagation();
        const genus = taxonRow.dataset.genus;
        if (genus) window.GridWildGenusCodex?.open?.(genus);
        return;
      }

      const slice = evt.target.closest?.("[data-pie-path]");
      if (slice) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieTo(slice.dataset.piePath);
        return;
      }

      if (evt.target.closest?.("[data-pie-back]")) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieBack();
        return;
      }

      if (evt.target.closest?.("#gwHerePieChart svg")) {
        evt.preventDefault();
        evt.stopPropagation();
        zoomPieBack();
      }
    });
  }

  async function refresh() {
    const api = gridApi();
    if (!api) return;

    ensurePanel();
    if (!herePanelOpen) return;

    const token = ++refreshToken;
    const selection = window.GridWildSelectionTool?.getSelection?.() || null;
    const bounds = selection?.bounds || api.centerAreaBounds(HERE_RADIUS_CELLS);
    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const title = document.getElementById("gwHereTitle");
    const meta = document.getElementById("gwHereMeta");
    const mapEl = document.getElementById("gwHereMap");
    const pieChartEl = document.getElementById("gwHerePieChart");
    const taxaListEl = document.getElementById("gwHereTaxaList");
    const statsEl = document.getElementById("gwHereStats");
    const summary = summarizeCells(bounds);
    const taxaContext = getTaxaBoundsForContext(bounds, selection);
    const taxaBounds = taxaContext.bounds;
    const filterSignature = api.activeFilterSignature?.() || "";
    const contextSignature = [
      selection ? "selection" : "here",
      bounds.minIx,
      bounds.maxIx,
      bounds.minIy,
      bounds.maxIy,
      taxaBounds.minIx,
      taxaBounds.maxIx,
      taxaBounds.minIy,
      taxaBounds.maxIy,
      filterSignature,
      taxaContext.capped ? "preview" : "full"
    ].join(":");

    if (title) title.textContent = selection ? "Selection" : "Here";
    if (meta) meta.textContent = `${width} x ${height}`;
    if (mapEl) mapEl.innerHTML = renderMiniMap(bounds, selection?.bounds || null);
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="gw-here-stat"><b>${summary.obs}</b><span>Obs</span></div>
        <div class="gw-here-stat"><b>${summary.species}</b><span>Species</span></div>
        <div class="gw-here-stat"><b>${summary.active}/${summary.cells}</b><span>Cells</span></div>
      `;
    }

    if (pieChartEl) {
      pieChartEl.innerHTML = `
        <svg viewBox="0 0 220 160" role="img" aria-label="Loading taxa">
          <text x="110" y="82" text-anchor="middle" font-size="11" font-weight="850" fill="rgba(239,230,211,0.64)">Reading taxa...</text>
        </svg>
      `;
    }
    if (taxaListEl) {
      taxaListEl.innerHTML = `<div class="gw-here-taxa-heading">Reading taxa...</div>`;
    }

    const [record, observerDict] = await Promise.all([
      api.mergedGeneraRecordForBounds(taxaBounds, { applyFilters: true }),
      api.loadObserverDictionary?.().catch(() => null)
    ]);
    if (token !== refreshToken) return;
    herePieState.taxaContext = taxaContext;
    herePieState.observerDict = observerDict || null;
    herePieState.previewNote = taxaContext.capped
      ? `<div class="gw-here-taxa-heading">Taxa preview: ${taxaContext.taxaCellCount}/${taxaContext.cellCount} selected cells</div>`
      : "";
    if (herePieState.signature !== contextSignature) {
      resetPieState(record, contextSignature);
    } else {
      herePieState.record = record;
      herePieState.tree = makeTaxonomyTree(record);
      if (!findPieNode(herePieState.tree, herePieState.currentPath)) {
        herePieState.currentPath = "root";
        herePieState.pathStack = [];
      }
    }
    if (pieChartEl) pieChartEl.innerHTML = renderPie();
    if (taxaListEl) {
      taxaListEl.innerHTML = renderContextLists(herePieState.previewNote);
    }
  }

  function scheduleRefresh(delay = 90) {
    clearTimeout(scheduleRefresh.timer);
    scheduleRefresh.timer = setTimeout(refresh, delay);
  }

  function ensureSelectionLayer() {
    if (!window.map || !window.L) return null;
    if (!map.getPane("gwSelectionPane")) {
      map.createPane("gwSelectionPane");
      map.getPane("gwSelectionPane").style.zIndex = 735;
      map.getPane("gwSelectionPane").style.pointerEvents = "none";
    }

    if (!ensureSelectionLayer.layer) {
      ensureSelectionLayer.layer = L.layerGroup([], { pane: "gwSelectionPane" }).addTo(map);
    }

    return ensureSelectionLayer.layer;
  }

  function selectionTool() {
    let armed = false;
    let dragging = false;
    let startCell = null;
    let hoverCell = null;
    let selection = null;
    let draftRect = null;
    let finalRect = null;

    function button() {
      return document.getElementById("gwHudSelectTool");
    }

    function syncButton() {
      const btn = button();
      if (!btn) return;
      btn.classList.toggle("is-armed", armed);
      btn.classList.toggle("has-selection", !!selection);
      btn.setAttribute("aria-pressed", armed || selection ? "true" : "false");
      btn.setAttribute("aria-label", selection ? "Clear selection" : armed ? "Cancel cell selection" : "Select cells");
      btn.title = selection ? "Clear selection" : armed ? "Cancel selection" : "Select cells";
      document.body.classList.toggle("gw-selection-active", armed);
    }

    function fireChange() {
      window.dispatchEvent(new CustomEvent("gridwild:selectionchange", {
        detail: { selection }
      }));
      if (selection) setHerePanelOpen(true);
      scheduleRefresh(10);
    }

    function drawRect(bounds, final = false) {
      const layer = ensureSelectionLayer();
      const api = gridApi();
      if (!layer || !api || !bounds) return null;
      const rect = L.rectangle(api.boundsToLatLngBounds(bounds), {
        pane: "gwSelectionPane",
        interactive: false,
        className: "gw-map-selection-rect",
        color: "#ffe7a3",
        weight: final ? 2.8 : 2,
        opacity: final ? 0.98 : 0.78,
        dashArray: final ? "8 5" : "4 5",
        fillColor: "#ffe7a3",
        fillOpacity: final ? 0.08 : 0.05
      });
      rect.addTo(layer);
      return rect;
    }

    function redrawDraft() {
      const layer = ensureSelectionLayer();
      const api = gridApi();
      if (!layer || !api || !startCell || !hoverCell) return;
      if (draftRect) layer.removeLayer(draftRect);
      draftRect = drawRect(api.normalizeCellBounds(startCell, hoverCell), false);
    }

    function setFinal(bounds) {
      const layer = ensureSelectionLayer();
      if (!layer) return;
      if (draftRect) {
        layer.removeLayer(draftRect);
        draftRect = null;
      }
      if (finalRect) layer.removeLayer(finalRect);
      finalRect = drawRect(bounds, true);
      selection = {
        bounds,
        cells: gridApi()?.cellsForBounds?.(bounds) || []
      };
      armed = false;
      dragging = false;
      startCell = null;
      hoverCell = null;
      map.dragging.enable();
      syncButton();
      fireChange();
      toast(`${selection.cells.length} cells selected`);
    }

    function clearSelection() {
      const layer = ensureSelectionLayer();
      if (draftRect && layer) layer.removeLayer(draftRect);
      if (finalRect && layer) layer.removeLayer(finalRect);
      draftRect = null;
      finalRect = null;
      selection = null;
      dragging = false;
      startCell = null;
      hoverCell = null;
      armed = false;
      map.dragging.enable();
      syncButton();
      fireChange();
    }

    function arm() {
      armed = true;
      if (selection) clearSelection();
      armed = true;
      syncButton();
      toast("Drag to select cells");
    }

    function cancelArm() {
      armed = false;
      dragging = false;
      startCell = null;
      hoverCell = null;
      if (draftRect) {
        ensureSelectionLayer()?.removeLayer(draftRect);
        draftRect = null;
      }
      map.dragging.enable();
      syncButton();
    }

    function toggleFromButton() {
      if (selection) {
        clearSelection();
        return;
      }

      if (armed) {
        cancelArm();
        return;
      }

      arm();
    }

    function onMouseDown(evt) {
      if (!armed || !evt?.latlng) return;
      evt.originalEvent?.preventDefault?.();
      evt.originalEvent?.stopPropagation?.();
      map.dragging.disable();
      dragging = true;
      startCell = gridApi().latLngToCell(evt.latlng);
      hoverCell = startCell;
      redrawDraft();
    }

    function onMouseMove(evt) {
      if (!armed || !dragging || !evt?.latlng) return;
      hoverCell = gridApi().latLngToCell(evt.latlng);
      redrawDraft();
    }

    function onMouseUp(evt) {
      if (!armed || !dragging) return;
      evt.originalEvent?.preventDefault?.();
      evt.originalEvent?.stopPropagation?.();
      hoverCell = evt?.latlng ? gridApi().latLngToCell(evt.latlng) : hoverCell;
      setFinal(gridApi().normalizeCellBounds(startCell, hoverCell));
    }

    function bind() {
      const btn = button();
      if (!btn || btn.dataset.bound === "true") return;
      btn.dataset.bound = "true";
      btn.addEventListener("click", toggleFromButton);
      map.on("mousedown", onMouseDown);
      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);
      map.on("mouseout", onMouseUp);
      syncButton();
    }

    return {
      bind,
      clear: clearSelection,
      getSelection: () => selection
    };
  }

  function init() {
    if (!window.map || !window.L) return;
    injectStyles();
    ensureButton();
    ensurePanel();
    bindHerePanelInteractions();
    syncHerePanelState();

    window.GridWildSelectionTool = window.GridWildSelectionTool || selectionTool();
    window.GridWildSelectionTool.bind();

    window.GridWildHerePanel = window.GridWildHerePanel || {
      refresh,
      scheduleRefresh,
      open: () => setHerePanelOpen(true),
      close: () => setHerePanelOpen(false),
      toggle: toggleHerePanel,
      isOpen: () => herePanelOpen
    };

    const investigate = investigateButton();
    if (investigate && investigate.dataset.bound !== "true") {
      investigate.dataset.bound = "true";
      investigate.addEventListener("click", toggleHerePanel);
    }

    map.on("moveend zoomend resize", () => {
      if (!window.GridWildSelectionTool?.getSelection?.()) scheduleRefresh();
      else scheduleRefresh(200);
    });
    window.addEventListener("gridwild:selectionchange", () => scheduleRefresh(10));
    window.addEventListener("gridwild:filterschange", () => scheduleRefresh(10));
    window.addEventListener("gwRecentINatUpdated", () => scheduleRefresh(80));
    document.addEventListener("change", evt => {
      if (evt.target?.matches?.("[data-iconic], #taxaChecklist input, #toggleHeat")) {
        scheduleRefresh(10);
      }
    });
    window.addEventListener("load", () => scheduleRefresh(250));
    scheduleRefresh(200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
