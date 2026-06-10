// GridWild Field sheet
// Consolidates field-context overlays, niches, patches, and surveys.

(function () {
  const FIELD_AREA_SCAN_LIMIT = 1800;

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

      .gw-field-home-inset {
        display: grid;
        grid-template-columns: minmax(86px, 0.86fr) minmax(118px, 1.14fr);
        min-height: 78px;
        overflow: hidden;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.18);
        background:
          linear-gradient(180deg, rgba(34,31,25,0.82), rgba(16,18,16,0.86));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.05),
          inset 0 0 0 1px rgba(255,255,255,0.018);
      }

      .gw-field-home-action {
        appearance: none;
        min-width: 0;
        border: 0;
        border-right: 1px solid rgba(215,183,116,0.14);
        border-radius: 0;
        padding: 9px;
        display: grid;
        align-content: center;
        gap: 3px;
        color: rgba(239,230,211,0.82);
        background: rgba(0,0,0,0.12);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-field-home-action:hover {
        background: rgba(240,209,138,0.08);
        color: #f4e8cf;
      }

      .gw-field-home-action-main {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        color: #f0d18a;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .gw-field-home-plus {
        width: 24px;
        height: 24px;
        min-width: 24px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: #17231e;
        background: #f0d18a;
        font-size: 20px;
        line-height: 1;
        font-weight: 950;
      }

      .gw-field-home-label,
      .gw-field-home-name,
      .gw-field-home-sub {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-field-home-name {
        color: #f4e8cf;
        font-size: 12px;
        line-height: 1.15;
        font-weight: 900;
      }

      .gw-field-home-sub {
        color: rgba(239,230,211,0.56);
        font-size: 10px;
        line-height: 1.2;
      }

      .gw-field-home-map {
        appearance: none;
        position: relative;
        min-width: 0;
        border: 0;
        border-radius: 0;
        padding: 0;
        overflow: hidden;
        color: inherit;
        background:
          radial-gradient(circle at 48% 42%, rgba(240,209,138,0.08), transparent 54%),
          rgba(5,8,7,0.52);
        cursor: pointer;
      }

      .gw-field-home-map:disabled {
        cursor: default;
        opacity: 0.72;
      }

      .gw-field-home-map:not(:disabled):hover .gw-field-minimap svg {
        filter: brightness(1.1) saturate(1.08);
      }

      .gw-field-minimap {
        position: absolute;
        inset: 0;
      }

      .gw-field-minimap svg {
        display: block;
        width: 100%;
        height: 100%;
        transition: filter 140ms ease;
      }

      .gw-field-minimap-empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: rgba(239,230,211,0.48);
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
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
    return window.GridWildLocalNiches?.isVisible?.() ?? window.__gwState?.showLocalNiches !== false;
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
    return (
      window.GridWildLocalNiches?.buildNicheDisplayTitle?.(niche) ||
      niche?.short_title ||
      niche?.title ||
      niche?.primary_place_label ||
      "Home niche"
    );
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

  function patchInsetColor(patch) {
    if (!patch) return "#f0d18a";
    if (
      patch.source === "inat_project" ||
      patch.metadata?.imported_from === "inat_project" ||
      /iNaturalist/i.test(String(patch.source_label || ""))
    ) {
      return "#7ddfff";
    }
    return patch.survey_geometry?.styles?.boundary?.fillColor || "#f0d18a";
  }

  function surveyRows() {
    return window.GridWildSurveyDesigner?.loadSurveys?.() || [];
  }

  function joinedSurveys() {
    return surveyRows().filter((survey) => window.GridWildSurveyLayer?.isJoined?.(survey.id));
  }

  function currentSurvey() {
    const joined = joinedSurveys();
    return (
      joined.find((survey) => window.GridWildSurveyLayer?.isVisible?.(survey.id)) ||
      joined[0] ||
      null
    );
  }

  function surveySubtitle(survey) {
    if (!survey) return "none";
    const count = joinedSurveys().length;
    const visible = window.GridWildSurveyLayer?.isVisible?.(survey.id);
    return `${count} joined${visible ? " / visible" : ""}`;
  }

  function homeNiche() {
    return window.GridWildLocalNiches?.getHomeNiche?.() || window.__gwState?.homeNiche || null;
  }

  function parseCellKey(key) {
    const [ix, iy] = String(key || "")
      .split(",")
      .map(Number);
    return Number.isFinite(ix) && Number.isFinite(iy)
      ? { ix: Math.floor(ix), iy: Math.floor(iy), key: `${Math.floor(ix)},${Math.floor(iy)}` }
      : null;
  }

  function keyForCell(cell) {
    return cell?.key || `${Math.floor(Number(cell?.ix))},${Math.floor(Number(cell?.iy))}`;
  }

  function hydrateCell(cell) {
    const ix = Math.floor(Number(cell?.ix));
    const iy = Math.floor(Number(cell?.iy));
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
    const key = `${ix},${iy}`;
    const baseMetrics =
      window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;
    const metrics =
      typeof window.getDisplayMetricsForCell === "function"
        ? window.getDisplayMetricsForCell(ix, iy, baseMetrics || null)
        : baseMetrics;
    return {
      ix,
      iy,
      key,
      metrics: metrics || null,
      style: metrics ? window.GridWildGrid?.metricsToFill?.(metrics) || null : null,
      bounds: window.GridWildGrid?.cellBounds?.(ix, iy) || null
    };
  }

  function dedupeCells(cells = []) {
    const seen = new Set();
    return (Array.isArray(cells) ? cells : [])
      .map((cell) => hydrateCell(cell))
      .filter(Boolean)
      .filter((cell) => {
        if (seen.has(cell.key)) return false;
        seen.add(cell.key);
        return true;
      });
  }

  function cellsFromIds(ids = []) {
    return dedupeCells((Array.isArray(ids) ? ids : []).map(parseCellKey).filter(Boolean));
  }

  function boundsForCells(cells = []) {
    const rows = (Array.isArray(cells) ? cells : []).filter(
      (cell) => Number.isFinite(Number(cell?.ix)) && Number.isFinite(Number(cell?.iy))
    );
    if (!rows.length) return null;
    return {
      minIx: Math.min(...rows.map((cell) => Math.floor(Number(cell.ix)))),
      maxIx: Math.max(...rows.map((cell) => Math.floor(Number(cell.ix)))),
      minIy: Math.min(...rows.map((cell) => Math.floor(Number(cell.iy)))),
      maxIy: Math.max(...rows.map((cell) => Math.floor(Number(cell.iy))))
    };
  }

  function cellCenterLatLng(cell) {
    const bounds = window.GridWildGrid?.cellBounds?.(cell.ix, cell.iy);
    if (!bounds?.sw || !bounds?.ne) return null;
    return {
      lat: (Number(bounds.sw.lat) + Number(bounds.ne.lat)) / 2,
      lng: (Number(bounds.sw.lng) + Number(bounds.ne.lng)) / 2
    };
  }

  function pointInRing(point, ring = []) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || ring.length < 3) return false;

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      const yi = Number(a.lat);
      const xi = Number(a.lng);
      const yj = Number(b.lat);
      const xj = Number(b.lng);
      if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
      const crosses =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
      if (crosses) inside = !inside;
    }

    return inside;
  }

  function normalizeRing(points = []) {
    return (Array.isArray(points) ? points : [])
      .map((point) => ({
        lat: Number(point?.lat ?? point?.[0]),
        lng: Number(point?.lng ?? point?.lon ?? point?.[1])
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function ringsFromGeoJson(geojson) {
    if (!geojson) return [];
    if (geojson.type === "Feature") return ringsFromGeoJson(geojson.geometry);
    if (geojson.type === "FeatureCollection") {
      return (geojson.features || []).flatMap((feature) => ringsFromGeoJson(feature));
    }
    if (geojson.type === "GeometryCollection") {
      return (geojson.geometries || []).flatMap((geometry) => ringsFromGeoJson(geometry));
    }
    if (geojson.type === "Polygon") {
      return (geojson.coordinates || [])
        .map((ring) => normalizeRing((ring || []).map(([lng, lat]) => ({ lat, lng }))))
        .filter((ring) => ring.length >= 3);
    }
    if (geojson.type === "MultiPolygon") {
      return (geojson.coordinates || []).flatMap((poly) =>
        (poly || [])
          .map((ring) => normalizeRing((ring || []).map(([lng, lat]) => ({ lat, lng }))))
          .filter((ring) => ring.length >= 3)
      );
    }
    return [];
  }

  function ringsFromPatch(patch) {
    const rings =
      Array.isArray(patch?.geometry?.rings) && patch.geometry.rings.length
        ? patch.geometry.rings
        : patch?.survey_geometry?.boundary
          ? [patch.survey_geometry.boundary]
          : patch?.boundary
            ? [patch.boundary]
            : [];
    return rings.map(normalizeRing).filter((ring) => ring.length >= 3);
  }

  function ringsFromSurvey(survey) {
    const g = survey?.geometries || {};
    const boundary = Array.isArray(g.boundary) ? g.boundary : [];
    const rings = [];
    if (boundary.length && boundary[0]?.lat != null) rings.push(normalizeRing(boundary));
    boundary.forEach((item) => {
      if (item?.geojson) rings.push(...ringsFromGeoJson(item.geojson));
    });
    (g.denseZones || []).forEach((poly) => rings.push(normalizeRing(poly)));
    return rings.filter((ring) => ring.length >= 3);
  }

  function surveyGeometryPoints(survey) {
    const g = survey?.geometries || {};
    return [
      ...ringsFromSurvey(survey).flat(),
      ...(g.paths || []).flatMap((path) => normalizeRing(path)),
      ...(g.exclusions || []).flatMap((poly) => normalizeRing(poly)),
      ...(g.assets || []).map((asset) => ({
        lat: Number(asset?.lat),
        lng: Number(asset?.lng)
      }))
    ].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function cellsForRings(rings = []) {
    const api = window.GridWildGrid;
    if (!api?.latLngToCell || !api?.cellBounds) return [];
    const points = rings.flat();
    if (!points.length) return [];

    const vertexCells = points.map((point) => api.latLngToCell([point.lat, point.lng]));
    const bounds = boundsForCells(vertexCells);
    if (!bounds) return [];

    const width = bounds.maxIx - bounds.minIx + 1;
    const height = bounds.maxIy - bounds.minIy + 1;
    const bboxCells = width * height;
    const stride = Math.max(1, Math.ceil(Math.sqrt(bboxCells / FIELD_AREA_SCAN_LIMIT)));
    const cells = [];

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy += stride) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix += stride) {
        const center = cellCenterLatLng({ ix, iy });
        if (!center) continue;
        if (rings.some((ring) => pointInRing(center, ring))) cells.push({ ix, iy });
      }
    }

    return cells.length ? dedupeCells(cells) : dedupeCells(vertexCells);
  }

  function cellsFromSurveyGeometry(survey) {
    const rings = ringsFromSurvey(survey);
    if (rings.length) return cellsForRings(rings);
    const points = surveyGeometryPoints(survey);
    return dedupeCells(
      points.map((point) => window.GridWildGrid?.latLngToCell?.([point.lat, point.lng]))
    );
  }

  function colorForMiniCell(cell, fallback = "#76e7bf") {
    const style = cell?.style || null;
    if (style?.fillColor) return style.fillColor;
    const count = Number(cell?.metrics?.count) || 0;
    if (count > 0) return fallback;
    return "rgba(239,230,211,0.16)";
  }

  function renderFieldMiniMap(cells = [], options = {}) {
    const rows = dedupeCells(cells);
    const bounds = boundsForCells(rows);
    if (!bounds || !rows.length) {
      return `
        <div class="gw-field-minimap">
          <svg viewBox="0 0 80 52" role="img" aria-label="No area selected">
            <rect x="0" y="0" width="80" height="52" fill="rgba(7,9,8,0.62)"></rect>
            ${Array.from({ length: 12 })
              .map((_, index) => {
                const x = 9 + (index % 4) * 14;
                const y = 8 + Math.floor(index / 4) * 13;
                return `<rect x="${x}" y="${y}" width="10" height="9" rx="1.2" fill="rgba(239,230,211,0.10)"></rect>`;
              })
              .join("")}
          </svg>
          <span class="gw-field-minimap-empty">None</span>
        </div>
      `;
    }

    const widthCells = bounds.maxIx - bounds.minIx + 1;
    const heightCells = bounds.maxIy - bounds.minIy + 1;
    const cell = 9;
    const w = Math.max(32, widthCells * cell);
    const h = Math.max(28, heightCells * cell);
    const selected = new Set(rows.map(keyForCell));

    const rects = rows
      .map((item) => {
        const x = (item.ix - bounds.minIx) * cell;
        const y = (bounds.maxIy - item.iy) * cell;
        const active = selected.has(keyForCell(item));
        const fill = colorForMiniCell(item, options.color || "#76e7bf");
        const alpha = active
          ? Math.max(0.26, Math.min(0.94, Number(item.style?.fillOpacity || 0.5)))
          : 0.12;
        return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cell - 1}" height="${cell - 1}" rx="1.3" fill="${fill}" opacity="${alpha}" stroke="rgba(255,255,255,0.14)" stroke-width="0.35"></rect>`;
      })
      .join("");

    const outlineColor = options.color || "#ffe7a3";
    const outline = `<rect x="1.2" y="1.2" width="${Math.max(0, w - 2.4)}" height="${Math.max(0, h - 2.4)}" rx="2.4" fill="rgba(255,231,163,0.04)" stroke="${outlineColor}" opacity="0.86" stroke-width="1.8" stroke-dasharray="5 4"></rect>`;

    return `
      <div class="gw-field-minimap">
        <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(options.label || "Area map")}">
          <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(7,9,8,0.64)"></rect>
          ${rects}
          ${outline}
        </svg>
      </div>
    `;
  }

  function fieldAreaContext(kind) {
    if (kind === "niche") {
      const niche = homeNiche();
      const cells = cellsFromIds(niche?.grid_cell_ids || []);
      const fallback =
        !cells.length &&
        Number.isFinite(Number(niche?.centroid_lat)) &&
        Number.isFinite(Number(niche?.centroid_lng))
          ? dedupeCells([
              window.GridWildGrid?.latLngToCell?.([niche.centroid_lat, niche.centroid_lng])
            ])
          : [];
      return {
        kind,
        title: "Home Niche",
        label: niche ? displayNicheTitle(niche) : "No home niche",
        subtitle: niche ? nicheSubtitle(niche) : "Choose a local niche",
        item: niche,
        cells: cells.length ? cells : fallback,
        rings: [],
        color: "#76e7bf"
      };
    }

    if (kind === "patch") {
      const patch = window.GridWildPatches?.getHomePatch?.() || null;
      const rings = ringsFromPatch(patch);
      return {
        kind,
        title: "Home Patch",
        label: patch ? patchTitle(patch) : "No home patch",
        subtitle: patch ? patchSubtitle(patch) : "Choose a saved patch",
        item: patch,
        cells: rings.length ? cellsForRings(rings) : [],
        rings,
        color: patchInsetColor(patch)
      };
    }

    const survey = currentSurvey();
    const rings = ringsFromSurvey(survey);
    return {
      kind: "survey",
      title: "Current Survey",
      label: survey ? survey.name || "Untitled survey" : "No current survey",
      subtitle: survey ? surveySubtitle(survey) : "Join a survey",
      item: survey,
      cells: survey ? cellsFromSurveyGeometry(survey) : [],
      rings,
      color: "#7ad3e6"
    };
  }

  function renderFieldAreaInset(kind) {
    const ctx = fieldAreaContext(kind);
    const hasItem = Boolean(ctx.item);
    const canMap = hasItem && ctx.cells.length > 0;
    const actionLabel = hasItem
      ? "Leave"
      : `<span class="gw-field-home-plus" aria-hidden="true">+</span>`;
    return `
      <div class="gw-field-home-inset" data-gw-field-area="${esc(kind)}">
        <button class="gw-field-home-action" type="button" data-gw-field-area-action="${esc(kind)}" title="${hasItem ? `Leave ${ctx.title}` : `Add ${ctx.title}`}">
          <span class="gw-field-home-action-main">${actionLabel}</span>
          <span class="gw-field-home-name">${esc(ctx.title)}</span>
          <span class="gw-field-home-sub">${esc(ctx.label)}</span>
        </button>
        <button class="gw-field-home-map" type="button" data-gw-field-area-map="${esc(kind)}" ${canMap ? "" : "disabled"} aria-label="${esc(canMap ? `Open Here for ${ctx.label}` : `${ctx.title} has no mapped area yet`)}" title="${esc(canMap ? `Open Here for ${ctx.label}` : `${ctx.title} has no mapped area yet`)}">
          ${renderFieldMiniMap(ctx.cells, { label: ctx.label, color: ctx.color })}
        </button>
      </div>
    `;
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

      <button class="gw-mini-btn gw-field-bottom-action" id="gwFieldTaxonomyExplorerBtn" type="button">
        Explorer UI
      </button>
    `;
  }

  function renderFieldNicheList() {
    const rows = savedNicheRows().filter((niche) => !isHomeNiche(niche));
    const inset = renderFieldAreaInset("niche");
    if (!rows.length) {
      return inset;
    }

    return `
      ${inset}
      <div class="gw-field-list">
        ${rows
          .map((niche) => {
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
          })
          .join("")}
      </div>
    `;
  }

  function renderFieldPatchList() {
    const rows = (window.GridWildPatches?.getPatches?.() || []).filter(
      (patch) => !patch.is_home_patch
    );
    const inset = renderFieldAreaInset("patch");
    if (!rows.length) {
      return inset;
    }

    return `
      ${inset}
      <div class="gw-field-list">
        ${rows
          .map(
            (patch) => `
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
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderFieldSurveyList() {
    const current = currentSurvey();
    const rows = joinedSurveys().filter((survey) => String(survey.id) !== String(current?.id));
    const inset = renderFieldAreaInset("survey");
    if (!rows.length) {
      return inset;
    }

    return `
      ${inset}
      <div class="gw-field-list">
        ${rows
          .map((survey) => {
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
          })
          .join("")}
      </div>
    `;
  }

  function savedNicheRows() {
    const home =
      window.GridWildLocalNiches?.getHomeNiche?.() || window.__gwState?.homeNiche || null;
    const saved = window.GridWildLocalNiches?.getBookmarkedNiches?.() || [];
    const seen = new Set();
    return [home, ...saved]
      .filter(Boolean)
      .filter((niche) => {
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
      await window.ensureGridWildLocalNichesLoaded().catch((err) => {
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
    window.dispatchEvent(
      new CustomEvent("gridwild:fieldcontextchange", {
        detail: { visible: desired }
      })
    );
  }

  async function openNicheSelector() {
    ensureSelectorStyles();

    if (window.ensureGridWildLocalNichesLoaded) {
      await window.ensureGridWildLocalNichesLoaded().catch((err) => {
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

    root.onclick = async (evt) => {
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

    return rows
      .map((niche) => {
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
      })
      .join("");
  }

  function nicheRows() {
    const seen = new Set();
    const rows = [
      ...(window.GridWildLocalNiches?.getHomeNiche?.()
        ? [window.GridWildLocalNiches.getHomeNiche()]
        : []),
      ...(window.GridWildLocalNiches?.getBookmarkedNiches?.() || []),
      ...(window.GridWildLocalNiches?.getNiches?.() || [])
    ];

    return rows
      .filter(Boolean)
      .filter((niche) => {
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
    const homeId = String(
      window.__gwState?.homeNicheId || window.GridWildLocalNiches?.getHomeNiche?.()?.id || ""
    );
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
      await window.ensureGridWildSurveyDataLoaded().catch((err) => {
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
    document
      .querySelectorAll(".gw-quest-modal-backdrop.gw-field-center-backdrop")
      .forEach((el) => el.remove());
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
    root.onclick = (evt) => {
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

  function focusFieldArea(ctx) {
    if (!ctx || !window.map || !window.L) return;
    const ringPoints = (ctx.rings || []).flat();
    const bounds = boundsForCells(ctx.cells || []);

    if (ringPoints.length >= 2) {
      map.fitBounds(
        ringPoints.map((point) => [point.lat, point.lng]),
        { padding: [36, 36], maxZoom: 18 }
      );
      return;
    }

    if (bounds && window.GridWildGrid?.boundsToLatLngBounds) {
      map.fitBounds(window.GridWildGrid.boundsToLatLngBounds(bounds), {
        padding: [36, 36],
        maxZoom: 18
      });
      return;
    }

    const cellCenter = ctx.cells?.[0] ? cellCenterLatLng(ctx.cells[0]) : null;
    const lat = Number(ctx.item?.centroid_lat ?? ctx.item?.centroid?.lat ?? cellCenter?.lat);
    const lng = Number(ctx.item?.centroid_lng ?? ctx.item?.centroid?.lng ?? cellCenter?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
    }
  }

  function minimizeFieldForHere(ctx) {
    document
      .querySelectorAll(
        ".gw-quest-modal-backdrop.gw-field-selector-backdrop, .gw-quest-modal-backdrop.gw-field-center-backdrop"
      )
      .forEach((el) => el.remove());
    window.GridWildSheets?.closeAll?.();

    window.GridWildInfoPuck?.minimize?.({
      kind: "field",
      mark: "F",
      title: ctx?.title || "Field",
      restore: () => window.GridWildSheets?.open?.("info")
    });
  }

  async function openFieldAreaHere(kind) {
    const ctx = fieldAreaContext(kind);
    if (!ctx.item || !ctx.cells.length) {
      await handleFieldAreaAction(kind);
      return;
    }

    focusFieldArea(ctx);
    minimizeFieldForHere(ctx);

    if (window.ensureGridWildHerePanelLoaded) {
      await window.ensureGridWildHerePanelLoaded().catch((err) => {
        console.warn("Could not load Here panel for Field area:", err);
      });
    }

    const label = ctx.label || ctx.title;
    if (window.GridWildSelectionTool?.setSelectionFromCells) {
      window.GridWildSelectionTool.setSelectionFromCells(ctx.cells, {
        label,
        source: `field_${kind}`,
        rings: ctx.rings || [],
        toast: false
      });
    }
    window.GridWildHerePanel?.open?.();
    window.GridWildHerePanel?.scheduleRefresh?.(10);
  }

  async function handleFieldAreaAction(kind) {
    const ctx = fieldAreaContext(kind);
    if (kind === "niche") {
      if (ctx.item) {
        await window.GridWildLocalNiches?.unsetHomeNiche?.();
        renderIntoPage();
      } else {
        openNicheSelector();
      }
      return;
    }

    if (kind === "patch") {
      if (ctx.item) {
        window.GridWildPatches?.unsetHomePatch?.();
        renderIntoPage();
      } else {
        window.GridWildPatches?.openPatchSelector?.();
      }
      return;
    }

    if (ctx.item) {
      window.GridWildSurveyLayer?.leave?.(ctx.item.id);
      renderIntoPage();
    } else {
      openSurveyList();
    }
  }

  function bind(root = document) {
    const target = root || document;
    if (target.dataset?.fieldSheetBound === "true") return;
    if (target.dataset) target.dataset.fieldSheetBound = "true";

    target.addEventListener("click", (evt) => {
      if (evt.target.closest("#gwFieldMasterToggle")) {
        setFieldContextVisible(!fieldContextEnabled());
        return;
      }

      const areaAction = evt.target.closest("[data-gw-field-area-action]");
      if (areaAction && target.contains(areaAction)) {
        handleFieldAreaAction(areaAction.dataset.gwFieldAreaAction);
        return;
      }

      const areaMap = evt.target.closest("[data-gw-field-area-map]");
      if (areaMap && target.contains(areaMap)) {
        openFieldAreaHere(areaMap.dataset.gwFieldAreaMap);
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
        return;
      }

      if (evt.target.closest("#gwFieldTaxonomyExplorerBtn")) {
        window.GridWildPlayableTaxonomyExplorer?.open?.();
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
