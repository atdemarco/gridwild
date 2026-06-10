// -----------------------------------------------------------------------------
// GridWild Hidden HUD Action Menu
// Right-click / long-hold map canvas actions.
// -----------------------------------------------------------------------------

(function () {
  const LONG_HOLD_MS = 620;
  const LONG_HOLD_MOVE_TOLERANCE_PX = 14;

  let stylesInjected = false;
  let menuRoot = null;
  let holdTimer = null;
  let holdStart = null;

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

  function injectStyles() {
    if (stylesInjected || document.getElementById("gwHudActionMenuStyles")) {
      stylesInjected = true;
      return;
    }

    const style = document.createElement("style");
    style.id = "gwHudActionMenuStyles";
    style.textContent = `
      .gw-hud-action-menu {
        position: fixed;
        z-index: 100006;
        width: min(238px, calc(100vw - 20px));
        border-radius: 8px;
        border: 1px solid rgba(255,216,90,0.44);
        background:
          linear-gradient(180deg, rgba(43,34,24,0.98), rgba(19,16,14,0.98));
        color: #fff7df;
        box-shadow:
          0 18px 48px rgba(0,0,0,0.42),
          0 0 0 1px rgba(255,255,255,0.08) inset,
          0 0 18px rgba(255,216,90,0.14);
        overflow: hidden;
        user-select: none;
        animation: gwHudActionMenuIn 120ms ease-out;
      }

      .gw-hud-action-menu-title {
        padding: 10px 11px 7px;
        color: rgba(255,216,90,0.96);
        font-size: 11px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,216,90,0.14);
      }

      .gw-hud-action-menu-list {
        display: grid;
        padding: 5px;
        gap: 4px;
      }

      .gw-hud-action-menu-btn {
        width: 100%;
        min-height: 36px;
        border: 1px solid transparent;
        border-radius: 7px;
        padding: 8px 9px;
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        background: transparent;
        color: #efe6d3;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-hud-action-menu-btn:hover,
      .gw-hud-action-menu-btn:focus-visible {
        outline: none;
        border-color: rgba(255,216,90,0.30);
        background: rgba(255,216,90,0.10);
      }

      .gw-hud-action-menu-icon {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255,216,90,0.16);
        color: #ffd85a;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-hud-action-menu-copy {
        min-width: 0;
      }

      .gw-hud-action-menu-label {
        color: #fff7df;
        font-size: 12px;
        line-height: 1.15;
        font-weight: 950;
      }

      .gw-hud-action-menu-sub {
        margin-top: 2px;
        color: rgba(239,230,211,0.58);
        font-size: 10px;
        line-height: 1.2;
        font-weight: 750;
      }

      .gw-hud-note-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100007;
        display: grid;
        place-items: center;
        padding: 14px;
        background: rgba(0,0,0,0.46);
      }

      .gw-hud-note-modal {
        width: min(420px, 94vw);
        border-radius: 8px;
        border: 1px solid rgba(255,216,90,0.36);
        background:
          linear-gradient(180deg, rgba(43,34,24,0.98), rgba(19,16,14,0.98));
        color: #fff7df;
        box-shadow: 0 22px 58px rgba(0,0,0,0.46);
        padding: 12px;
      }

      .gw-hud-note-title {
        color: #ffd85a;
        font-size: 13px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .gw-hud-note-modal textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 118px;
        margin-top: 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,216,90,0.22);
        background: rgba(255,255,255,0.08);
        color: #fff7df;
        padding: 9px;
        font: inherit;
        resize: vertical;
      }

      .gw-hud-note-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }

      .gw-hud-note-btn {
        min-height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(255,216,90,0.24);
        background: rgba(255,255,255,0.08);
        color: #fff7df;
        padding: 6px 10px;
        font: inherit;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-hud-note-btn.primary {
        background: #ffd85a;
        color: #21180f;
      }

      @keyframes gwHudActionMenuIn {
        from { opacity: 0; transform: translateY(4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;

    document.head.appendChild(style);
    stylesInjected = true;
  }

  function isMapCanvasTarget(target) {
    if (!target?.closest?.(".leaflet-container")) return false;
    if (window.GridWildPatches?.shouldSuppressHudActionMenu?.()) return false;
    if (target.closest(".leaflet-control, .leaflet-popup, .leaflet-tooltip")) return false;
    if (
      target.closest(
        ".leaflet-marker-icon, .leaflet-interactive, .gw-patch-boundary, .gw-patch-peek-outline"
      )
    )
      return false;
    if (target.closest(".gw-hud-action-menu, .gw-topbar, .gw-bottomnav")) return false;
    return true;
  }

  function currentLatLngFromEvent(event) {
    if (!window.map?.mouseEventToLatLng) return window.map?.getCenter?.() || null;
    return window.map.mouseEventToLatLng(event);
  }

  function clampMenuPosition(x, y) {
    const width = Math.min(238, window.innerWidth - 20);
    const maxX = window.innerWidth - width - 10;
    const maxY = window.innerHeight - 284;

    return {
      x: Math.max(10, Math.min(maxX, x)),
      y: Math.max(10, Math.min(Math.max(10, maxY), y))
    };
  }

  function hasActiveParty() {
    return Boolean(
      window.GridWildPartyLive?.getActivePartyId?.() ||
      window.__gwState?.party?.id ||
      window.__gwState?.activePartyId
    );
  }

  function menuItems(context) {
    const items = [
      {
        id: "patches",
        icon: "P",
        label: "Show Local Patches",
        sub: "Peek saved and nearby patch boundaries"
      }
    ];

    if (!hasActiveParty()) {
      items.push({
        id: "party-one",
        icon: "1",
        label: "Party of 1",
        sub: "Start a private solo field party"
      });
    }

    items.push(
      {
        id: "start-quest",
        icon: "Q",
        label: "Start Quest",
        sub: "Fill unobserved cells in a 9x9 grid"
      },
      {
        id: "custom-quest",
        icon: "C",
        label: "Custom...",
        sub: "Build target cells from heat filters"
      },
      {
        id: "copy-link",
        icon: "@",
        label: "Copy Map Link",
        sub: "Share this exact map view"
      },
      {
        id: "street-view",
        icon: "G",
        label: "Google Street View",
        sub: "Open panorama near this point"
      }
    );

    return items.filter((item) => {
      if (item.id === "field-note") return !!context?.latlng;
      if (item.id === "street-view") return !!context?.latlng;
      return true;
    });
  }

  function closeMenu() {
    menuRoot?.remove();
    menuRoot = null;
  }

  function openMenu(context) {
    if (!context?.latlng) return;
    injectStyles();
    closeMenu();

    const pos = clampMenuPosition(context.x, context.y);
    menuRoot = document.createElement("div");
    menuRoot.className = "gw-hud-action-menu";
    menuRoot.style.left = `${pos.x}px`;
    menuRoot.style.top = `${pos.y}px`;
    menuRoot.setAttribute("role", "menu");
    menuRoot.innerHTML = `
      <div class="gw-hud-action-menu-title">Field Actions</div>
      <div class="gw-hud-action-menu-list">
        ${menuItems(context)
          .map(
            (item) => `
          <button class="gw-hud-action-menu-btn" type="button" role="menuitem" data-gw-hud-action="${esc(item.id)}">
            <span class="gw-hud-action-menu-icon">${esc(item.icon)}</span>
            <span class="gw-hud-action-menu-copy">
              <span class="gw-hud-action-menu-label">${esc(item.label)}</span>
              <span class="gw-hud-action-menu-sub">${esc(item.sub)}</span>
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    document.body.appendChild(menuRoot);
    menuRoot.querySelectorAll("[data-gw-hud-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.gwHudAction;
        closeMenu();
        handleAction(action, context);
      });
    });
  }

  function mapViewLink(latlng = null) {
    const center = latlng || window.map?.getCenter?.();
    if (!center) return window.location.href;

    const url = new URL(window.location.href);
    url.searchParams.set("gwLat", Number(center.lat).toFixed(6));
    url.searchParams.set("gwLng", Number(center.lng).toFixed(6));
    url.searchParams.set(
      "gwZoom",
      String(Math.round(Number(window.map?.getZoom?.() || 18) * 100) / 100)
    );
    return url.toString();
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function latestAvatarLocation() {
    const loc = window.__gwLastUserLocation || null;
    const lat = Number(loc?.lat ?? loc?.latitude);
    const lng = Number(loc?.lng ?? loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      accuracyMeters: Number(loc?.accuracyMeters ?? loc?.accuracy)
    };
  }

  async function startPartyOfOne() {
    const loc = latestAvatarLocation();
    if (!loc) {
      toast("Need your avatar location first.");
      return;
    }

    if (hasActiveParty()) return;

    try {
      await window.GridWildPartyLive?.createDbPartyFromLegacyForm?.({
        name: "Party of 1",
        title: "Party of 1",
        mode: "live",
        visibility: "private",
        durationMinutes: 60,
        target: 1,
        locationMode: "user",
        locationUserId: "self",
        resolvedLocation: {
          label: "Current avatar location",
          lat: loc.lat,
          lng: loc.lng,
          accuracyMeters: loc.accuracyMeters,
          source: "avatar"
        },
        locationLabel: "Current avatar location"
      });
      window.GridWildPartyLive?.refreshPartySheet?.();
      window.GridWildParty?.refreshMapBeacon?.();
      toast("Party of 1 started.");
    } catch (err) {
      console.warn("Could not start Party of 1:", err);
      toast(err?.message || "Could not start Party of 1.");
    }
  }

  function staticGridReady() {
    return (
      window.__gwStaticHeatLoaded === true ||
      (window.__staticGridCounts instanceof Map && window.__staticGridCounts.size > 0)
    );
  }

  function waitForStaticGridReady(timeoutMs = 5000) {
    if (staticGridReady()) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("gridwild:staticheatloaded", onLoaded);
        window.clearTimeout(timer);
        resolve(value);
      };
      const onLoaded = () => finish(true);
      const timer = window.setTimeout(() => finish(staticGridReady()), timeoutMs);
      window.addEventListener("gridwild:staticheatloaded", onLoaded, { once: true });
    });
  }

  function gridCellKey(ix, iy) {
    return window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`;
  }

  function latLngToGridCell(latlng) {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    if (window.GridWildGrid?.latLngToCell) {
      const cell = window.GridWildGrid.latLngToCell([lat, lng]);
      const ix = Number(cell?.ix);
      const iy = Number(cell?.iy);
      if (Number.isFinite(ix) && Number.isFinite(iy)) {
        return { ix: Math.floor(ix), iy: Math.floor(iy) };
      }
    }

    const crs = window.map?.options?.crs;
    const leaflet = window.L;
    if (!crs?.project || !leaflet?.latLng) return null;

    const gridSizeM = Number(window.GridWildGrid?.gridSizeM) || 20 * 0.3048;
    const point = crs.project(leaflet.latLng(lat, lng));
    return {
      ix: Math.floor(point.x / gridSizeM),
      iy: Math.floor(point.y / gridSizeM)
    };
  }

  function staticObservationCountForCell(ix, iy) {
    const metrics =
      window.__staticGridCounts instanceof Map
        ? window.__staticGridCounts.get(gridCellKey(ix, iy))
        : null;
    return Number(metrics?.count) || 0;
  }

  function nineByNineTargetCells(latlng) {
    const center = latLngToGridCell(latlng);
    if (!center) return null;

    const cells = [];
    for (let iy = center.iy - 4; iy <= center.iy + 4; iy++) {
      for (let ix = center.ix - 4; ix <= center.ix + 4; ix++) {
        if (staticObservationCountForCell(ix, iy) > 0) continue;
        cells.push({ ix, iy, key: gridCellKey(ix, iy) });
      }
    }

    return {
      center,
      cells,
      totalSquares: 81,
      totalEligibleCells: cells.length
    };
  }

  function coordinateLabel(latlng) {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "selected point";
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  async function startGridFillQuest(context) {
    if (!window.GridWildQuests?.startQuestFromRecipe) {
      toast("Quest tools are still loading.");
      return;
    }

    const latlng = context?.latlng;
    if (!latlng) {
      toast("Choose a map point first.");
      return;
    }

    if (!staticGridReady()) toast("Loading grid memory...");
    const ready = await waitForStaticGridReady();
    if (!ready) {
      toast("Grid memory is still loading. Try Start Quest again in a moment.");
      return;
    }

    const targetInfo = nineByNineTargetCells(latlng);
    if (!targetInfo?.cells?.length) {
      toast("No unobserved target squares in this 9x9 grid.");
      return;
    }

    const label = coordinateLabel(latlng);
    const recipe = {
      range: "here",
      iconicTaxon: "Any",
      objectiveType: "any_observation",
      difficulty: 2,
      timeframe: "today",
      evidence: "photo_gps20",
      surveyId: "none",
      targetLocation: "target_set",
      target: {
        mode: "target_set",
        kind: "hud_grid_fill_9x9",
        label: "9x9 grid fill",
        patchName: `9x9 grid near ${label}`,
        cells: targetInfo.cells,
        totalEligibleCells: targetInfo.totalEligibleCells,
        totalSquares: targetInfo.totalSquares,
        targetCount: targetInfo.cells.length,
        requiresUniqueCellProgress: true,
        centerCell: targetInfo.center,
        generatedAt: new Date().toISOString()
      },
      quantity: 1
    };

    const quest = await window.GridWildQuests.startQuestFromRecipe(recipe, {
      title: "Help Fill Grid: 9x9",
      description: `Observe one organism in each marked unobserved GridWild square within the selected 9x9 grid. ${targetInfo.cells.length} of ${targetInfo.totalSquares} squares are marked for this run.`,
      source: "manual",
      autoEmbark: true,
      openStatus: false
    });

    if (quest) toast("9x9 grid quest started.");
  }

  function openCustomQuestBuilder(context) {
    if (!window.GridWildQuestTargetBuilder?.open) {
      toast("Quest Target Builder is still loading.");
      return;
    }
    window.GridWildQuestTargetBuilder.open({
      source: "hud",
      latlng: context?.latlng || window.map?.getCenter?.()
    });
  }

  function draftId() {
    return `draft_note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function makeFieldNoteDraft(latlng, notes) {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const now = new Date().toISOString();

    return {
      id: draftId(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
      observedAt: now,
      location: {
        lat,
        lng,
        accuracyMeters: null,
        cellKey: window.getCellKeyForLatLng ? window.getCellKeyForLatLng(lat, lng) : null
      },
      notes,
      captiveCultivated: "unsure",
      suggestedId: {
        kingdom: "Unknown",
        iconicTaxon: "Unknown",
        taxonName: "",
        confidence: null,
        source: "field_note"
      },
      photos: [],
      primaryPhotoId: null,
      handoff: {
        status: "not_sent",
        inatObservationId: null
      },
      metadata: {
        kind: "field_note",
        source: "hud_action_menu"
      }
    };
  }

  function openFieldNoteModal(latlng) {
    injectStyles();
    const existing = document.querySelector(".gw-hud-note-backdrop");
    existing?.remove();

    const root = document.createElement("div");
    root.className = "gw-hud-note-backdrop";
    root.innerHTML = `
      <div class="gw-hud-note-modal" role="dialog" aria-modal="true" aria-label="Drop field note">
        <div class="gw-hud-note-title">Drop Field Note</div>
        <textarea id="gwHudFieldNoteText" maxlength="1200" placeholder="What did you notice here?"></textarea>
        <div class="gw-hud-note-actions">
          <button class="gw-hud-note-btn" type="button" data-gw-note-cancel>Cancel</button>
          <button class="gw-hud-note-btn primary" type="button" data-gw-note-save>Save Note</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    const textarea = root.querySelector("#gwHudFieldNoteText");
    textarea?.focus();

    const close = () => root.remove();
    root.addEventListener("click", (event) => {
      if (event.target === root) close();
    });
    root.querySelector("[data-gw-note-cancel]")?.addEventListener("click", close);
    root.querySelector("[data-gw-note-save]")?.addEventListener("click", () => {
      const notes = String(textarea?.value || "").trim();
      if (!notes) {
        toast("Add a note first.");
        return;
      }

      const draft = makeFieldNoteDraft(latlng, notes);
      if (!draft) {
        toast("Could not place that note.");
        return;
      }

      window.GridWildDraftObservations?.upsertDraft?.(draft);
      window.GridWildDraftObservations?.setActiveDraftId?.(draft.id);
      window.refreshGridWildMePanel?.();
      close();
      toast("Field note saved.");
    });
  }

  function openStreetView(latlng) {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const url = new URL("https://www.google.com/maps/@");
    url.searchParams.set("api", "1");
    url.searchParams.set("map_action", "pano");
    url.searchParams.set("viewpoint", `${lat.toFixed(6)},${lng.toFixed(6)}`);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  async function handleAction(action, context) {
    if (action === "patches") {
      const rows =
        (await window.GridWildPatches?.showLocalPatchHighlights?.({
          marginRatio: 0.08,
          candidateLimit: 80,
          includeINatProjects: true
        })) || [];
      toast(
        rows.length
          ? `Showing ${rows.length} local patch${rows.length === 1 ? "" : "es"}.`
          : "No local patches in view."
      );
      return;
    }

    if (action === "party-one") {
      await startPartyOfOne();
      return;
    }

    if (action === "start-quest") {
      await startGridFillQuest(context);
      return;
    }

    if (action === "custom-quest") {
      openCustomQuestBuilder(context);
      return;
    }

    if (action === "copy-link") {
      try {
        await copyText(mapViewLink(context.latlng));
        toast("Map link copied.");
      } catch (err) {
        console.warn("Could not copy map link:", err);
        toast("Could not copy map link.");
      }
      return;
    }

    if (action === "field-note") {
      openFieldNoteModal(context.latlng);
      return;
    }

    if (action === "street-view") {
      openStreetView(context.latlng);
    }
  }

  function openFromDomEvent(event) {
    if (!event?.target?.closest?.(".leaflet-container")) return false;
    const latlng = currentLatLngFromEvent(event);
    if (!latlng) return false;

    if (window.GridWildPatches?.openPatchActionMenuAtLatLng?.(latlng, event)) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    }

    if (!isMapCanvasTarget(event.target)) return false;

    event.preventDefault?.();
    event.stopPropagation?.();
    openMenu({
      latlng,
      x: event.clientX,
      y: event.clientY
    });
    return true;
  }

  function clearHold() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    holdStart = null;
  }

  function bindLongHold(container) {
    container.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch") return;
        if (!isMapCanvasTarget(event.target)) return;

        const latlng = currentLatLngFromEvent(event);
        if (!latlng) return;

        clearHold();
        const patchMenu = window.GridWildPatches?.isPatchAtLatLng?.(latlng);
        holdStart = {
          x: event.clientX,
          y: event.clientY,
          target: event.target,
          latlng,
          patchMenu
        };

        holdTimer = window.setTimeout(() => {
          if (!holdStart?.latlng) return;
          event.preventDefault?.();
          if (holdStart.patchMenu) {
            window.GridWildPatches?.openPatchActionMenuAtLatLng?.(holdStart.latlng, event);
            clearHold();
            return;
          }
          openMenu({
            latlng: holdStart.latlng,
            x: holdStart.x,
            y: holdStart.y
          });
          clearHold();
        }, LONG_HOLD_MS);
      },
      { passive: false }
    );

    container.addEventListener(
      "pointermove",
      (event) => {
        if (!holdStart) return;
        const dist = Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y);
        if (dist > LONG_HOLD_MOVE_TOLERANCE_PX) clearHold();
      },
      { passive: true }
    );

    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      container.addEventListener(type, clearHold, { passive: true });
    });
  }

  function bind() {
    if (!window.map?.on || !window.map?.getContainer) return false;
    if (window.__gwHudActionMenuBound) return true;
    window.__gwHudActionMenuBound = true;

    injectStyles();
    const container = window.map.getContainer();

    window.map.on("contextmenu", (event) => {
      const original = event?.originalEvent;
      if (!original) return;
      openFromDomEvent(original);
    });

    container.addEventListener("contextmenu", openFromDomEvent, { passive: false });
    bindLongHold(container);

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!menuRoot || event.target?.closest?.(".gw-hud-action-menu")) return;
        closeMenu();
      },
      { passive: true }
    );

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.map.on("movestart zoomstart", closeMenu);
    return true;
  }

  function init() {
    if (bind()) return;
    window.setTimeout(init, 120);
  }

  window.GridWildHudActionMenu = {
    bind,
    close: closeMenu,
    openMenu
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
