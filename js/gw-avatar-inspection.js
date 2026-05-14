// -----------------------------------------------------------------------------
// GridWild Avatar Inspection
// Read-only identity panel for the current field look.
// -----------------------------------------------------------------------------

(function () {
  const SLOT_LABELS = [
    ["hat", "Hat / Look"],
    ["title", "Title"],
    ["frame", "Frame"],
    ["trail", "Trail"],
    ["companion", "Companion"]
  ];

  let currentRoot = null;

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cleanTitle(name) {
    return String(name || "").replace(/^Title:\s*/i, "");
  }

  function injectStyles() {
    window.GridWildStore?.ensureStyles?.();

    if (document.getElementById("gwAvatarInspectionStyles")) return;

    const style = document.createElement("style");
    style.id = "gwAvatarInspectionStyles";
    style.textContent = `
      .gw-avatar-inspection-modal {
        width: min(760px, 96vw);
        max-height: min(820px, 92vh);
        grid-template-rows: auto 1fr auto;
      }

      .gw-avatar-inspection-body {
        overflow: auto;
        padding: 14px;
      }

      .gw-avatar-inspection-hero {
        display: grid;
        grid-template-columns: minmax(220px, 0.95fr) minmax(220px, 1.05fr);
        gap: 14px;
        align-items: stretch;
      }

      .gw-avatar-preview-card,
      .gw-avatar-identity-card,
      .gw-avatar-panel-section {
        border-radius: 18px;
        border: 1px solid rgba(215,183,116,0.20);
        background:
          linear-gradient(180deg, rgba(57,48,39,0.92), rgba(34,28,23,0.94));
        box-shadow: 0 6px 18px rgba(0,0,0,0.20);
      }

      .gw-avatar-preview-card {
        min-height: 296px;
        display: grid;
        place-items: center;
        padding: 14px;
      }

      .gw-avatar-identity-card {
        padding: 14px;
        display: grid;
        align-content: center;
      }

      .gw-avatar-display-name {
        color: #f4e8cf;
        font-size: 28px;
        line-height: 1.05;
        font-weight: 950;
      }

      .gw-avatar-inspection-kicker {
        margin-top: 7px;
        color: rgba(240,209,138,0.82);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .gw-avatar-inspection-desc {
        margin-top: 12px;
        color: rgba(239,230,211,0.68);
        font-size: 13px;
        line-height: 1.42;
      }

      .gw-avatar-panel-section {
        margin-top: 12px;
        padding: 12px;
      }

      .gw-avatar-section-title {
        color: #f0d18a;
        font-size: 13px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
      }

      .gw-avatar-equipped-list {
        display: grid;
        gap: 8px;
      }

      .gw-avatar-equipped-row {
        display: grid;
        grid-template-columns: minmax(78px, 0.34fr) minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid rgba(215,183,116,0.10);
      }

      .gw-avatar-equipped-row:last-child {
        border-bottom: 0;
      }

      .gw-avatar-slot {
        color: rgba(240,209,138,0.76);
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .gw-avatar-item {
        min-width: 0;
        color: #efe6d3;
        font-size: 13px;
        line-height: 1.25;
        font-weight: 850;
      }

      .gw-avatar-item small {
        display: block;
        margin-top: 2px;
        color: rgba(239,230,211,0.56);
        font-size: 11px;
        font-weight: 750;
      }

      .gw-avatar-flair-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .gw-avatar-flair {
        border-radius: 999px;
        border: 1px solid rgba(240,209,138,0.24);
        background: rgba(240,209,138,0.08);
        color: #efe6d3;
        padding: 7px 9px;
        font-size: 12px;
        font-weight: 850;
        line-height: 1;
      }

      @media (max-width: 640px) {
        .gw-avatar-inspection-modal {
          width: min(96vw, 520px);
          max-height: 90vh;
        }

        .gw-avatar-inspection-hero {
          grid-template-columns: 1fr;
        }

        .gw-avatar-preview-card {
          min-height: 250px;
        }

        .gw-avatar-display-name {
          font-size: 24px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getUnlockedFlair(limit = 8) {
    const defs = window.GridWildAchievements?.DEFINITIONS || [];
    const dbRows = window.__gwState?.playerAchievements;
    let store = {};

    if (Array.isArray(dbRows)) {
      dbRows.forEach(row => {
        store[row.achievement_id] = { unlocked: !!row.unlocked };
      });
    } else if (window.GridWildAchievements?.getStore) {
      store = window.GridWildAchievements.getStore() || {};
    }

    return defs
      .filter(def => store[def.id]?.unlocked)
      .slice(0, limit);
  }

  function renderEquippedRows(equipped) {
    return SLOT_LABELS.map(([slot, label]) => {
      const item = equipped?.[slot];
      const name = item?.name ? cleanTitle(item.name) : "None equipped";
      const meta = item ? `${item.rarity || "common"} ${slot}` : "Open Inventory to change this slot.";

      return `
        <div class="gw-avatar-equipped-row">
          <div class="gw-avatar-slot">${esc(label)}</div>
          <div class="gw-avatar-item">
            ${item?.icon ? `${esc(item.icon)} ` : ""}${esc(name)}
            <small>${esc(meta)}</small>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderFlair(flair) {
    if (!flair.length) {
      return `<div class="gw-muted">No visible achievement flair unlocked yet.</div>`;
    }

    return `
      <div class="gw-avatar-flair-list">
        ${flair.map(def => `
          <span class="gw-avatar-flair">${esc(def.icon || "")} ${esc(def.name)}</span>
        `).join("")}
      </div>
    `;
  }

  function renderInto(root) {
    const avatarState = window.GridWildAvatarRenderer?.getAvatarState?.() || {
      character: {},
      equipped: {},
      displayName: "New Wanderer",
      archetypeLabel: "Naturalist",
      color: "fern"
    };

    const equipped = avatarState.equipped || {};
    const flair = getUnlockedFlair();
    const title = equipped.title?.name ? cleanTitle(equipped.title.name) : avatarState.archetypeLabel;

    root.innerHTML = `
      <div class="gw-store-modal gw-avatar-inspection-modal" role="dialog" aria-modal="true" aria-labelledby="gwAvatarInspectionTitle">
        <div class="gw-store-head">
          <div class="gw-store-title" id="gwAvatarInspectionTitle">My Field Look</div>
          <div class="gw-store-sub">
            Current GridWild identity and equipped cosmetics.
          </div>
        </div>

        <div class="gw-avatar-inspection-body">
          <div class="gw-avatar-inspection-hero">
            <div class="gw-avatar-preview-card">
              ${window.GridWildAvatarRenderer?.renderHtml?.({ size: "large", state: avatarState }) || ""}
            </div>

            <div class="gw-avatar-identity-card">
              <div class="gw-avatar-display-name">${esc(avatarState.displayName)}</div>
              <div class="gw-avatar-inspection-kicker">
                ${esc(title)} &middot; ${esc(avatarState.archetypeLabel)}
              </div>
              <div class="gw-avatar-inspection-desc">
                ${esc(avatarState.color || "fern")} field style &middot; ${Number(flair.length || 0).toLocaleString()} visible flair
              </div>
            </div>
          </div>

          <div class="gw-avatar-panel-section">
            <div class="gw-avatar-section-title">Equipped</div>
            <div class="gw-avatar-equipped-list">
              ${renderEquippedRows(equipped)}
            </div>
          </div>

          <div class="gw-avatar-panel-section">
            <div class="gw-avatar-section-title">Flair</div>
            ${renderFlair(flair)}
          </div>
        </div>

        <div class="gw-store-foot">
          <button class="gw-store-action secondary" id="gwAvatarInspectionCloseBtn" type="button">Close</button>
          <button class="gw-store-action" id="gwAvatarInspectionInventoryBtn" type="button">Change Outfit</button>
        </div>
      </div>
    `;

    bindInside(root);
  }

  function close() {
    currentRoot?.remove();
    currentRoot = null;
  }

  function open() {
    injectStyles();
    document.querySelectorAll(".gw-store-backdrop").forEach(el => el.remove());

    const root = document.createElement("div");
    root.className = "gw-store-backdrop gw-avatar-inspection-backdrop";
    currentRoot = root;

    document.body.appendChild(root);

    root.addEventListener("click", evt => {
      if (evt.target === root) close();
    });

    root.addEventListener("keydown", evt => {
      if (evt.key === "Escape") close();
    });

    renderInto(root);
    root.querySelector("#gwAvatarInspectionCloseBtn")?.focus();
  }

  function refreshOpen() {
    if (!currentRoot?.isConnected) return;
    renderInto(currentRoot);
  }

  function bindInside(root) {
    root.querySelector("#gwAvatarInspectionCloseBtn")?.addEventListener("click", close);

    root.querySelector("#gwAvatarInspectionInventoryBtn")?.addEventListener("click", () => {
      close();
      window.GridWildInventory?.open?.();
    });
  }

  function bindButtons(root = document) {
    root.querySelectorAll("[data-open-avatar-inspection], #gwOpenAvatarInspectionBtn").forEach(btn => {
      if (btn.dataset.avatarInspectionBound === "true") return;
      btn.dataset.avatarInspectionBound = "true";
      btn.addEventListener("click", open);
    });
  }

  window.addEventListener("gwEconomyChanged", refreshOpen);
  window.addEventListener("gwCharacterChanged", refreshOpen);
  window.addEventListener("gwAchievementsChanged", refreshOpen);

  window.GridWildAvatarInspection = {
    open,
    close,
    bindButtons,
    refreshOpen
  };
})();
