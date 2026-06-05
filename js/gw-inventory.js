// -----------------------------------------------------------------------------
// GridWild Inventory
// -----------------------------------------------------------------------------

(function () {
  const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "hat", label: "Hats" },
    { id: "title", label: "Titles" },
    { id: "frame", label: "Frames" },
    { id: "trail", label: "Trails" },
    { id: "companion", label: "Companions" },
    { id: "seasonal", label: "Seasonal" }
  ];

  let activeCategory = "all";

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getOwnedItems() {
    const state = window.GridWildEconomy?.load?.() || {};
    const ownedIds = state.ownedItems || [];
    const catalog = window.GridWildStore?.getCatalog?.() || [];

    return catalog.filter(item => ownedIds.includes(item.id));
  }

async function unequipSlot(slot) {
  const state = window.GridWildEconomy?.load?.();
  if (!state?.equipped) return;

  try {
    const result = await window.GridWildAPI.setPlayerEquipment(slot, null);

    window.__gwState = window.__gwState || {};
    window.__gwState.playerEquipment = result.equipment;
    state.equipped[slot] = null;
    window.GridWildEconomy?.save?.(state);
  } catch (err) {
    console.warn("Could not sync unequip:", err);
  }

  window.GridWildCharacter?.renderSummary?.();
}

  function renderTabs() {
    return CATEGORIES.map(c => `
      <button
        class="gw-store-tab ${activeCategory === c.id ? "active" : ""}"
        data-inventory-category="${esc(c.id)}"
        type="button"
      >
        ${esc(c.label)}
      </button>
    `).join("");
  }

  function renderItem(item, state) {
    const slot = item.slot || item.category;
    const equipped = state.equipped?.[slot] === item.id;

    return `
      <div class="gw-store-item">
        <div class="gw-store-item-top">
          <div class="gw-store-icon">${esc(item.icon || "🎒")}</div>

          <div style="min-width:0;">
            <div class="gw-store-name">
              ${esc(item.name)}
            </div>

            <div class="gw-store-meta">
              ${esc(slot)} · ${esc(item.rarity || "common")}
              ${equipped ? " · EQUIPPED" : ""}
            </div>
          </div>
        </div>

        <div class="gw-store-desc">
          ${esc(item.description || "A GridWild cosmetic item.")}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
          <button
            class="gw-store-action ${equipped ? "secondary" : ""}"
            data-inventory-equip="${esc(item.id)}"
            type="button"
            ${equipped ? "disabled" : ""}
          >
            ${equipped ? "Equipped" : "Equip"}
          </button>

          <button
            class="gw-store-action secondary"
            data-inventory-unequip="${esc(slot)}"
            type="button"
            ${equipped ? "" : "disabled"}
          >
            Unequip
          </button>
        </div>
      </div>
    `;
  }

  function renderInto(root) {
    const state = window.GridWildEconomy?.load?.() || {};
    const owned = getOwnedItems();

    const filtered = activeCategory === "all"
      ? owned
      : owned.filter(item => item.category === activeCategory || item.slot === activeCategory);

    root.innerHTML = `
      <div class="gw-store-modal">
        <div class="gw-store-head">
          <div class="gw-store-title">Inventory</div>
          <div class="gw-store-sub">
            Equip your owned GridWild cosmetics. Store purchases appear here.
          </div>
        </div>

        <div class="gw-store-balance">
          <span>Owned cosmetics</span>
          <strong>🎒 ${owned.length.toLocaleString()}</strong>
        </div>

        <div class="gw-store-tabs">
          ${renderTabs()}
        </div>

        <div class="gw-store-grid">
          ${
            filtered.length
              ? filtered.map(item => renderItem(item, state)).join("")
              : owned.length
                ? `<div class="gw-muted">No owned items in this category yet.</div>`
                : `<div class="gw-muted">No owned items yet. Visit the Store first.</div>`
          }
        </div>

        <div class="gw-store-foot" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          <button class="gw-store-action secondary" id="gwInventoryCloseBtn" type="button">Close</button>
          <button class="gw-store-action secondary" id="gwInventoryInspectBtn" type="button">My Field Look</button>
          <button class="gw-store-action" id="gwInventoryStoreBtn" type="button">Open Store</button>
        </div>
      </div>
    `;

    bindInside(root);
  }

  function bindInside(root) {
    root.querySelectorAll("[data-inventory-category]").forEach(btn => {
      btn.onclick = () => {
        activeCategory = btn.dataset.inventoryCategory || "all";
        renderInto(root);
      };
    });

    root.querySelectorAll("[data-inventory-equip]").forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        const result = await window.GridWildEconomy?.equipItem?.(btn.dataset.inventoryEquip);

        if (!result?.ok) {
          alert(result?.reason || "Could not equip item.");
          btn.disabled = false;
          return;
        }

        renderInto(root);
        window.GridWildCharacter?.renderSummary?.();
      };
    });

    root.querySelectorAll("[data-inventory-unequip]").forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await unequipSlot(btn.dataset.inventoryUnequip);
          renderInto(root);
        } finally {
          btn.disabled = false;
        }
      };
    });

    root.querySelector("#gwInventoryCloseBtn")?.addEventListener("click", () => {
      root.remove();
    });

    root.querySelector("#gwInventoryInspectBtn")?.addEventListener("click", () => {
      root.remove();
      window.GridWildAvatarInspection?.open?.();
    });

    root.querySelector("#gwInventoryStoreBtn")?.addEventListener("click", () => {
      root.remove();
      window.GridWildStore?.open?.();
    });
  }

  function open() {
    window.GridWildStore?.ensureStyles?.();
    document.querySelectorAll(".gw-store-backdrop").forEach(el => el.remove());

    const root = document.createElement("div");
    root.className = "gw-store-backdrop";

    document.body.appendChild(root);

    root.onclick = evt => {
      if (evt.target === root) root.remove();
    };

    renderInto(root);
  }

  function bindButtons(root = document) {
    root.querySelector("#gwOpenInventoryBtn")?.addEventListener("click", open);
  }

  window.GridWildInventory = {
    open,
    bindButtons
  };
})();
