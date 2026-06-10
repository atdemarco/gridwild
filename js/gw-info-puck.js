// Shared draggable HUD puck for minimized Patch/Niche detail popups.

(function () {
  const POS_KEY = "gw_info_puck_pos_v1";
  const DEFAULT_POS = { left: 18, top: 156 };

  let puck = null;
  let current = null;
  let resizeBound = false;
  let suppressNextClick = false;

  function injectStyles() {
    if (document.getElementById("gwInfoPuckStyles")) return;

    const style = document.createElement("style");
    style.id = "gwInfoPuckStyles";
    style.textContent = `
      .gw-info-puck {
        position: fixed;
        z-index: 99993;
        width: min(168px, calc(100vw - 20px));
        height: 46px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px;
        border-radius: 999px;
        color: #efe6d3;
        background: linear-gradient(180deg, rgba(39,35,30,0.96), rgba(17,16,14,0.98));
        border: 1px solid rgba(215,183,116,0.42);
        box-shadow: 0 18px 42px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.08);
        cursor: grab;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
      }

      .gw-info-puck[hidden] {
        display: none;
      }

      .gw-info-puck.is-dragging {
        cursor: grabbing;
      }

      .gw-info-puck-main,
      .gw-info-puck-close {
        appearance: none;
        border: 0;
        color: inherit;
        cursor: pointer;
        font: inherit;
      }

      .gw-info-puck-main {
        min-width: 0;
        flex: 1;
        height: 36px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0 8px 0 4px;
        background: rgba(255,255,255,0.06);
      }

      .gw-info-puck-main:hover {
        background: rgba(215,183,116,0.14);
      }

      .gw-info-puck-mark {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: #102421;
        background: #f0d18a;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0;
      }

      .gw-info-puck[data-kind="niche"] .gw-info-puck-mark {
        background: #76e7bf;
      }

      .gw-info-puck[data-kind="quest-target"] .gw-info-puck-mark {
        background: #9bd7ff;
      }

      .gw-info-puck-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(239,230,211,0.88);
        font-size: 11px;
        font-weight: 950;
      }

      .gw-info-puck-close {
        width: 26px;
        height: 26px;
        min-width: 26px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(170,55,45,0.28);
        color: #ffd8d2;
        font-size: 17px;
        font-weight: 950;
        line-height: 1;
      }

      .gw-info-puck-close:hover {
        background: rgba(210,72,58,0.42);
      }
    `;

    document.head.appendChild(style);
  }

  function loadPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (Number.isFinite(parsed?.left) && Number.isFinite(parsed?.top)) {
        return parsed;
      }
    } catch {}

    return { ...DEFAULT_POS };
  }

  function clampPosition(pos) {
    const width = puck?.offsetWidth || 168;
    const height = puck?.offsetHeight || 46;
    const maxLeft = Math.max(10, window.innerWidth - width - 10);
    const maxTop = Math.max(10, window.innerHeight - height - 10);

    return {
      left: Math.max(10, Math.min(maxLeft, Number(pos?.left) || DEFAULT_POS.left)),
      top: Math.max(10, Math.min(maxTop, Number(pos?.top) || DEFAULT_POS.top))
    };
  }

  function positionPuck(pos) {
    if (!puck) return;
    const next = clampPosition(pos || loadPosition());
    puck.style.left = `${next.left}px`;
    puck.style.top = `${next.top}px`;
  }

  function savePosition() {
    if (!puck) return;

    try {
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({
          left: Number.parseFloat(puck.style.left) || DEFAULT_POS.left,
          top: Number.parseFloat(puck.style.top) || DEFAULT_POS.top
        })
      );
    } catch {}
  }

  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;

    window.addEventListener("resize", () => {
      if (!puck || puck.hidden) return;
      positionPuck({
        left: Number.parseFloat(puck.style.left) || DEFAULT_POS.left,
        top: Number.parseFloat(puck.style.top) || DEFAULT_POS.top
      });
      savePosition();
    });
  }

  function restore() {
    const item = current;
    if (!item) return;

    current = null;
    if (puck) puck.hidden = true;
    item.beforeRestore?.();
    window.setTimeout(
      () => {
        item.restore?.();
      },
      item.beforeRestore ? 80 : 0
    );
  }

  function dismiss() {
    const item = current;
    current = null;
    if (puck) puck.hidden = true;
    item?.onDismiss?.();
  }

  function ensurePuck() {
    if (puck) return puck;

    injectStyles();
    puck = document.createElement("div");
    puck.className = "gw-info-puck";
    puck.hidden = true;
    puck.innerHTML = `
      <button class="gw-info-puck-main" type="button">
        <span class="gw-info-puck-mark">P</span>
        <span class="gw-info-puck-text">Detail</span>
      </button>
      <button class="gw-info-puck-close" type="button" aria-label="Dismiss minimized detail" title="Dismiss">&times;</button>
    `;

    let drag = null;

    puck.addEventListener("pointerdown", (evt) => {
      if (evt.pointerType === "mouse" && evt.button !== 0) return;
      if (evt.target.closest(".gw-info-puck-close")) return;

      const startLeft = Number.parseFloat(puck.style.left) || loadPosition().left;
      const startTop = Number.parseFloat(puck.style.top) || loadPosition().top;

      drag = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        startLeft,
        startTop,
        moved: false
      };

      puck.setPointerCapture?.(evt.pointerId);
    });

    puck.addEventListener("pointermove", (evt) => {
      if (!drag || drag.pointerId !== evt.pointerId) return;

      const dx = evt.clientX - drag.startX;
      const dy = evt.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;

      evt.preventDefault();
      puck.classList.add("is-dragging");
      positionPuck({
        left: drag.startLeft + dx,
        top: drag.startTop + dy
      });
    });

    puck.addEventListener("pointerup", (evt) => {
      if (!drag || drag.pointerId !== evt.pointerId) return;

      suppressNextClick = drag.moved;
      drag = null;
      puck.classList.remove("is-dragging");
      puck.releasePointerCapture?.(evt.pointerId);
      savePosition();
    });

    puck.addEventListener("pointercancel", (evt) => {
      if (drag?.pointerId === evt.pointerId) {
        drag = null;
        puck.classList.remove("is-dragging");
      }
    });

    puck.addEventListener("click", (evt) => {
      if (evt.target.closest(".gw-info-puck-close")) return;

      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }

      restore();
    });

    puck.querySelector(".gw-info-puck-close")?.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      dismiss();
    });

    document.body.appendChild(puck);
    positionPuck(loadPosition());
    bindResize();

    return puck;
  }

  function minimize(options = {}) {
    current = {
      kind: options.kind || "detail",
      mark: options.mark || "?",
      title: options.title || "Detail",
      beforeRestore: typeof options.beforeRestore === "function" ? options.beforeRestore : null,
      restore: typeof options.restore === "function" ? options.restore : null,
      onDismiss: typeof options.onDismiss === "function" ? options.onDismiss : null
    };

    const el = ensurePuck();
    el.dataset.kind = current.kind;
    el.querySelector(".gw-info-puck-mark").textContent = current.mark;
    el.querySelector(".gw-info-puck-text").textContent = current.title;
    el.querySelector(".gw-info-puck-main").setAttribute(
      "aria-label",
      `Restore ${current.kind} detail: ${current.title}`
    );
    el.querySelector(".gw-info-puck-main").title = `Restore ${current.title}`;
    positionPuck(loadPosition());
    el.hidden = false;
  }

  window.GridWildInfoPuck = {
    minimize,
    restore,
    dismiss,
    currentKind: () => current?.kind || null
  };
})();
