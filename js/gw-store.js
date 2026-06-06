// -----------------------------------------------------------------------------
// GridWild Store UI
// Requires: GridWildEconomy
// Optional: GridWildStoreCatalog
// -----------------------------------------------------------------------------

(function () {
  const CATEGORIES = [
    { id: "featured", label: "Featured" },
    { id: "hat", label: "Hats" },
    { id: "title", label: "Titles" },
    { id: "frame", label: "Frames" },
    { id: "trail", label: "Trails" },
    { id: "companion", label: "Companions" },
    { id: "seasonal", label: "Seasonal" }
  ];

  let activeCategory = "featured";

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getCatalog() {
    const external = window.GridWildStoreCatalog?.items;
    return Array.isArray(external) ? external : [];
  }

  function getEconomy() {
    return (
      window.GridWildEconomy?.load?.() || {
        wildPoints: 0,
        prestigeTokens: 0,
        ownedItems: [],
        equipped: {}
      }
    );
  }

  function owns(itemId) {
    return window.GridWildEconomy?.owns?.(itemId) || false;
  }

  function hasAchievement(id) {
    if (!id) return true;

    const dbRows = window.__gwState?.playerAchievements;
    if (!Array.isArray(dbRows)) return false;
    return dbRows.some((row) => row.achievement_id === id && row.unlocked === true);
  }

  function isLocked(item) {
    return item.requiresAchievement && !hasAchievement(item.requiresAchievement);
  }

  function canAfford(item, state) {
    const currency = item.currency || "wildPoints";
    return Number(state[currency] || 0) >= Number(item.price || 0);
  }

  function currencyIcon(item) {
    return (item.currency || "wildPoints") === "prestigeTokens" ? "⭐" : "🍃";
  }

  function achievementLabel(id) {
    if (!id) return "";

    const def = window.GridWildAchievements?.DEFINITIONS?.find?.((d) => d.id === id);

    if (def?.name) return def.name;

    return String(id)
      .replace(/_/g, " ")
      .replace(/\bobs\b/i, "observations")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function rarityLabel(rarity) {
    return String(rarity || "common").toUpperCase();
  }

  function rarityStyle(rarity) {
    const r = String(rarity || "common").toLowerCase();

    if (r === "rare") return "border-color:rgba(90,190,255,0.42);";
    if (r === "epic") return "border-color:rgba(190,120,255,0.48);";
    if (r === "legendary") return "border-color:rgba(255,210,90,0.65);";
    if (r === "seasonal") return "border-color:rgba(120,230,190,0.48);";

    return "";
  }

  function categoryCount(catId) {
    const items = getCatalog();

    if (catId === "featured") {
      return items.filter(
        (x) =>
          x.featured ||
          ["rare", "epic", "legendary", "seasonal"].includes(String(x.rarity || "").toLowerCase())
      ).length;
    }

    return items.filter((x) => x.category === catId).length;
  }

  function filteredItems() {
    const items = getCatalog();

    if (activeCategory === "featured") {
      return items
        .filter(
          (x) =>
            x.featured ||
            ["rare", "epic", "legendary", "seasonal"].includes(String(x.rarity || "").toLowerCase())
        )
        .slice(0, 24);
    }

    return items.filter((x) => x.category === activeCategory);
  }

  function injectStyles() {
    if (document.getElementById("gwStoreStyles")) return;

    const style = document.createElement("style");
    style.id = "gwStoreStyles";
    style.textContent = `
      .gw-store-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99996;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        background: rgba(9, 12, 10, 0.76);
      }

      .gw-store-modal {
        width: min(760px, 96vw);
        max-height: min(820px, 92vh);
        overflow: hidden;
        border-radius: 24px;
        color: #efe6d3;
        background:
          linear-gradient(180deg, rgba(47,40,33,0.98), rgba(23,19,16,0.99));
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.56);
        display: grid;
        grid-template-rows: auto auto auto 1fr auto;
      }

      .gw-store-head {
        padding: 16px 16px 10px;
        border-bottom: 1px solid rgba(215,183,116,0.16);
      }

      .gw-store-title {
        color: #f0d18a;
        font-size: 22px;
        font-weight: 950;
      }

      .gw-store-sub {
        color: rgba(239,230,211,0.68);
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.35;
      }

      .gw-store-balance {
        padding: 10px 16px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid rgba(215,183,116,0.12);
        font-size: 13px;
      }

      .gw-store-balance strong {
        color: #ffe082;
        font-size: 16px;
      }

      .gw-store-tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 10px 16px;
        border-bottom: 1px solid rgba(215,183,116,0.12);
      }

      .gw-store-tab {
        border: 1px solid rgba(215,183,116,0.24);
        background: rgba(255,255,255,0.06);
        color: #efe6d3;
        border-radius: 999px;
        padding: 8px 11px;
        font-size: 11px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .gw-store-tab.active {
        background: linear-gradient(180deg, #ffe082, #d7b774);
        color: #1f271d;
        border-color: rgba(255,224,130,0.78);
      }

      .gw-store-count {
        opacity: 0.72;
        margin-left: 3px;
      }

      .gw-store-grid {
        padding: 14px;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 12px;
      }

      .gw-store-item {
        position: relative;
        border-radius: 18px;
        border: 1px solid rgba(215,183,116,0.20);
        background:
          linear-gradient(180deg, rgba(57,48,39,0.92), rgba(34,28,23,0.94));
        padding: 12px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.20);
      }

      .gw-store-item.locked {
        opacity: 0.62;
        filter: grayscale(0.55);
      }

      .gw-store-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        border-radius: 999px;
        padding: 3px 7px;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        background: rgba(255,255,255,0.10);
        color: rgba(239,230,211,0.82);
        border: 1px solid rgba(255,255,255,0.12);
      }

      .gw-store-badge.owned {
        background: rgba(80,220,140,0.12);
        color: #9ee6bd;
        border-color: rgba(80,220,140,0.28);
      }

      .gw-store-badge.equipped {
        background: linear-gradient(180deg, #ffe082, #d7b774);
        color: #1f271d;
        border-color: rgba(255,224,130,0.78);
      }

      .gw-store-badge.locked {
        background: rgba(246,179,107,0.12);
        color: #f6b36b;
        border-color: rgba(246,179,107,0.28);
      }

      .gw-store-item-top {
        display: flex;
        gap: 11px;
        align-items: center;
        padding-right: 56px;
      }

      .gw-store-icon {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        background: rgba(240,209,138,0.10);
        border: 1px solid rgba(240,209,138,0.22);
        flex: 0 0 auto;
      }

      .gw-store-name {
        font-size: 14px;
        line-height: 1.15;
        font-weight: 950;
        color: #f4e8cf;
      }

      .gw-store-meta {
        margin-top: 4px;
        font-size: 10px;
        color: rgba(240,209,138,0.78);
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .gw-store-desc {
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.35;
        color: rgba(239,230,211,0.68);
        min-height: 34px;
      }

      .gw-store-action {
        margin-top: 12px;
        width: 100%;
        border: 0;
        border-radius: 999px;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 950;
        cursor: pointer;
        background: linear-gradient(180deg, #ffe082, #d7b774);
        color: #1f271d;
      }

      .gw-store-action.secondary {
        background: rgba(255,255,255,0.10);
        color: #efe6d3;
        border: 1px solid rgba(255,255,255,0.14);
      }

      .gw-store-action:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .gw-store-foot {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 12px 16px 16px;
        border-top: 1px solid rgba(215,183,116,0.12);
      }

      .gw-store-toast {
        position: fixed;
        left: 14px;
        right: 14px;
        top: calc(max(12px, env(safe-area-inset-top)) + 52px);
        z-index: 100003;
        border-radius: 18px;
        padding: 12px 14px;
        background: linear-gradient(180deg, #ffe082, #d7b774);
        color: #21301f;
        font-weight: 950;
        box-shadow: 0 16px 44px rgba(0,0,0,0.35);
        animation: gwStoreToastPop 220ms ease-out;
      }

      @keyframes gwStoreToastPop {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
  }

  function showToast(message, sub = "") {
    injectStyles();

    document.querySelectorAll(".gw-store-toast").forEach((el) => el.remove());

    const toast = document.createElement("div");
    toast.className = "gw-store-toast";
    toast.innerHTML = `
      ${esc(message)}
      ${sub ? `<br><span style="font-size:12px;opacity:.75;">${esc(sub)}</span>` : ""}
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function renderTabs() {
    return CATEGORIES.map(
      (c) => `
      <button
        class="gw-store-tab ${c.id === activeCategory ? "active" : ""}"
        data-store-category="${esc(c.id)}"
        type="button"
      >
        ${esc(c.label)}
        <span class="gw-store-count">${categoryCount(c.id)}</span>
      </button>
    `
    ).join("");
  }

  function getItemBadge(item, state) {
    const owned = owns(item.id);
    const slot = item.slot || item.category;
    const equipped = state.equipped?.[slot] === item.id;
    const locked = isLocked(item);

    if (equipped) return `<span class="gw-store-badge equipped">Equipped</span>`;
    if (owned) return `<span class="gw-store-badge owned">Owned</span>`;
    if (locked) return `<span class="gw-store-badge locked">Locked</span>`;
    return "";
  }

  function renderItem(item, state) {
    const owned = owns(item.id);
    const locked = isLocked(item);
    const affordable = canAfford(item, state);
    const slot = item.slot || item.category;
    const equipped = state.equipped?.[slot] === item.id;

    let buttonText = `Buy · ${currencyIcon(item)} ${Number(item.price || 0).toLocaleString()}`;
    let disabled = false;
    let secondary = false;

    if (equipped) {
      buttonText = "Equipped";
      disabled = true;
      secondary = true;
    } else if (owned) {
      buttonText = "Equip";
    } else if (locked) {
      buttonText = "Locked";
      disabled = true;
      secondary = true;
    } else if (!affordable) {
      buttonText = `Need ${currencyIcon(item)} ${Number(item.price || 0).toLocaleString()}`;
      disabled = true;
      secondary = true;
    }

    return `
      <div class="gw-store-item ${locked ? "locked" : ""}" style="${rarityStyle(item.rarity)}">
        ${getItemBadge(item, state)}

        <div class="gw-store-item-top">
          <div class="gw-store-icon">${esc(item.icon || "🎒")}</div>

          <div style="min-width:0;">
            <div class="gw-store-name">${esc(item.name)}</div>
            <div class="gw-store-meta">
              ${esc(rarityLabel(item.rarity))} · ${esc(slot || "item")}
            </div>
          </div>
        </div>

        <div class="gw-store-desc">
          ${esc(item.description || "A GridWild cosmetic item.")}
          ${
            locked
              ? `<div style="margin-top:6px;color:#f6b36b;font-weight:850;">
                   Requires: ${esc(achievementLabel(item.requiresAchievement))}
                 </div>`
              : ""
          }
        </div>

        <button
          class="gw-store-action ${secondary ? "secondary" : ""}"
          data-store-buy="${esc(item.id)}"
          type="button"
          ${disabled ? "disabled" : ""}
        >
          ${esc(buttonText)}
        </button>
      </div>
    `;
  }

  function renderInto(root) {
    const state = getEconomy();
    const items = filteredItems();

    root.innerHTML = `
      <div class="gw-store-modal">
        <div class="gw-store-head">
          <div class="gw-store-title">GridWild Store</div>
          <div class="gw-store-sub">
            Spend Wild Points on cosmetics, titles, companions, frames, and trail effects.
          </div>
        </div>

        <div class="gw-store-balance">
          <span>Balance</span>
          <strong>
            🍃 ${Number(state.wildPoints || 0).toLocaleString()}
            ${Number(state.prestigeTokens || 0) ? ` · ⭐ ${Number(state.prestigeTokens || 0).toLocaleString()}` : ""}
          </strong>
        </div>

        <div class="gw-store-tabs">
          ${renderTabs()}
        </div>

        <div class="gw-store-grid">
          ${
            items.length
              ? items.map((item) => renderItem(item, state)).join("")
              : `<div class="gw-muted">No items in this category yet.</div>`
          }
        </div>

        <div class="gw-store-foot">
          <button class="gw-store-action secondary" id="gwStoreCloseBtn" type="button">Close</button>
          <button class="gw-store-action" id="gwStoreInventoryBtn" type="button">Inventory</button>
        </div>
      </div>
    `;

    bindInside(root);
  }

  async function buyOrEquip(itemId, root) {
    const item = getCatalog().find((x) => x.id === itemId);
    if (!item) return;

    const owned = owns(item.id);

    if (owned) {
      const result = await window.GridWildEconomy?.equipItem?.(item.id);

      if (!result?.ok) {
        alert(result?.reason || "Could not equip item.");
        return;
      }

      showToast("Equipped", item.name);
      renderInto(root);
      window.GridWildCharacter?.renderSummary?.();
      return;
    }

    const result = await window.GridWildEconomy?.buyItem?.(item.id);

    if (!result?.ok) {
      alert(result?.reason || "Could not buy item.");
      return;
    }

    showToast("Purchased", item.name);
    renderInto(root);
    window.GridWildCharacter?.renderSummary?.();
    window.GridWildEconomy?.refreshHud?.();
  }

  function bindInside(root) {
    root.querySelectorAll(".gw-store-tab").forEach((btn) => {
      btn.onclick = () => {
        activeCategory = btn.dataset.storeCategory || "featured";
        renderInto(root);
      };
    });

    root.querySelectorAll("[data-store-buy]").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await buyOrEquip(btn.dataset.storeBuy, root);
        } finally {
          btn.disabled = false;
        }
      };
    });

    root.querySelector("#gwStoreCloseBtn")?.addEventListener("click", () => {
      root.remove();
    });

    root.querySelector("#gwStoreInventoryBtn")?.addEventListener("click", () => {
      root.remove();
      window.GridWildInventory?.open?.();
    });
  }

  function open() {
    injectStyles();

    document.querySelectorAll(".gw-store-backdrop").forEach((el) => el.remove());

    const root = document.createElement("div");
    root.className = "gw-store-backdrop";

    document.body.appendChild(root);

    root.onclick = (evt) => {
      if (evt.target === root) root.remove();
    };

    renderInto(root);
  }

  function bindButtons(root = document) {
    root.querySelector("#gwOpenStoreBtn")?.addEventListener("click", open);
  }

  window.GridWildStore = {
    open,
    bindButtons,
    getCatalog,
    ensureStyles: injectStyles
  };
})();
