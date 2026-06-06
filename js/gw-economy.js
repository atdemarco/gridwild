// -----------------------------------------------------------------------------
// GridWild Economy
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_economy_v1";

  const DEFAULT_STATE = {
    wildPoints: 0,
    prestigeTokens: 0,
    ownedItems: [],
    equipped: {
      title: null,
      frame: null,
      trail: null,
      companion: null,
      hat: null
    }
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const local = raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };

      const dbWildpoints = window.__gwState?.player?.wildpoints;

      if (dbWildpoints !== undefined && dbWildpoints !== null) {
        local.wildPoints = Number(dbWildpoints || 0);
      }

      const dbInventory = window.__gwState?.playerInventory;
      if (Array.isArray(dbInventory)) {
        local.ownedItems = dbInventory.map((x) => x.item_id).filter(Boolean);
      }

      const dbEquipment = window.__gwState?.playerEquipment;
      if (dbEquipment) {
        local.equipped = {
          ...local.equipped,
          title: dbEquipment.title || null,
          frame: dbEquipment.frame || null,
          trail: dbEquipment.trail || null,
          companion: dbEquipment.companion || null,
          hat: dbEquipment.hat || null
        };
      }

      return local;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function save(state) {
    const next = {
      ...DEFAULT_STATE,
      ...(state || {}),
      equipped: {
        ...DEFAULT_STATE.equipped,
        ...((state || {}).equipped || {})
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("gwEconomyChanged", { detail: next }));
    refreshHud();
    return next;
  }

  function refreshHud() {
    const el = document.getElementById("gwWildPointsValue");
    if (!el) return;

    const dbWildpoints = window.__gwState?.player?.wildpoints;

    if (dbWildpoints !== undefined && dbWildpoints !== null) {
      el.textContent = Number(dbWildpoints || 0).toLocaleString();
      return;
    }

    const state = load();
    el.textContent = Number(state.wildPoints || 0).toLocaleString();
  }

  function bindHud() {
    document.getElementById("gwWildPointsPill")?.addEventListener("click", () => {
      window.GridWildStore?.open?.();
    });

    refreshHud();
  }

  function owns(itemId) {
    const dbInventory = window.__gwState?.playerInventory;

    if (Array.isArray(dbInventory)) {
      return dbInventory.some((x) => x.item_id === itemId);
    }

    return load().ownedItems.includes(itemId);
  }

  function hasAchievement(id) {
    if (!id) return true;

    const dbRows = window.__gwState?.playerAchievements;
    if (!Array.isArray(dbRows)) return false;
    return dbRows.some((row) => row.achievement_id === id && row.unlocked === true);
  }

  function getCatalogItem(itemId) {
    return window.GridWildStore?.getCatalog?.().find((x) => x.id === itemId) || null;
  }

  function canBuy(item) {
    if (!item) return { ok: false, reason: "Missing item." };
    if (owns(item.id)) return { ok: false, reason: "Already owned." };

    if (item.requiresAchievement && !hasAchievement(item.requiresAchievement)) {
      return { ok: false, reason: "Achievement locked." };
    }

    const state = load();
    const currency = item.currency || "wildPoints";

    const balance =
      currency === "wildPoints"
        ? Number(window.__gwState?.player?.wildpoints || 0)
        : Number(state[currency] || 0);

    if (balance < Number(item.price || 0)) {
      return { ok: false, reason: "Not enough currency." };
    }

    return { ok: true, reason: "OK" };
  }

  async function buyItem(itemId) {
    const item = getCatalogItem(itemId);
    const check = canBuy(item);

    if (!check.ok) return { ok: false, reason: check.reason };

    const state = load();
    const currency = item.currency || "wildPoints";

    try {
      if (currency !== "wildPoints") {
        return { ok: false, reason: "That currency is not supported yet." };
      }

      const result = await window.GridWildAPI.purchaseStoreItem(item.id);

      window.__gwState = window.__gwState || {};
      window.__gwState.player = result.player || window.__gwState.player;
      window.__gwState.playerInventory = [
        ...(window.__gwState.playerInventory || []).filter((x) => x.item_id !== item.id),
        result.inventory_item || { item_id: item.id }
      ];

      state.wildPoints = Number(result.player?.wildpoints || 0);
      state.ownedItems = Array.from(new Set([...(state.ownedItems || []), item.id]));
      save(state);
      refreshHud();

      return { ok: true, item, state };
    } catch (err) {
      console.warn("Could not buy item:", err);
      return { ok: false, reason: "Purchase failed." };
    }
  }
  async function equipItem(itemId) {
    const item = getCatalogItem(itemId);
    if (!item) return { ok: false, reason: "Missing item." };

    const state = load();

    if (!owns(itemId)) {
      return { ok: false, reason: "Item not owned." };
    }

    const slot = item.slot || item.category;
    if (!slot) return { ok: false, reason: "Item has no equipment slot." };

    try {
      const result = await window.GridWildAPI.setPlayerEquipment(slot, itemId);

      window.__gwState = window.__gwState || {};
      window.__gwState.playerEquipment = result.equipment;
      state.equipped = {
        ...(state.equipped || {}),
        [slot]: itemId
      };
      save(state);
      window.GridWildCharacter?.renderSummary?.();

      return { ok: true, item, state };
    } catch (err) {
      console.warn("Could not sync equipment:", err);
      return { ok: false, reason: "Could not equip item." };
    }
  }

  function getEquippedItems() {
    const state = load();
    const catalog = window.GridWildStore?.getCatalog?.() || [];
    const equipped = state.equipped || {};

    const out = {};

    Object.entries(equipped).forEach(([slot, itemId]) => {
      out[slot] = catalog.find((x) => x.id === itemId) || null;
    });

    return out;
  }

  function showRewardToast(amount, reason = "reward") {
    if (!amount) return;

    if (!document.getElementById("gwEconomyToastStyles")) {
      const style = document.createElement("style");
      style.id = "gwEconomyToastStyles";
      style.textContent = `
        .gw-economy-toast {
            position: fixed;
            left: 14px;
            right: 14px;
            top: calc(max(12px, env(safe-area-inset-top)) + 52px);
            z-index: 100002;
            border-radius: 18px;
            padding: 12px 14px;
            background: linear-gradient(180deg, #ffe082, #d7b774);
            color: #21301f;
            font-weight: 950;
            box-shadow: 0 16px 44px rgba(0,0,0,0.35);
            animation: gwEconomyToastPop 220ms ease-out;
        }

        @keyframes gwEconomyToastPop {
            from { transform: translateY(-12px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        `;
      document.head.appendChild(style);
    }

    document.querySelectorAll(".gw-economy-toast").forEach((el) => el.remove());

    const label =
      reason === "quest_completed"
        ? "Quest completed"
        : reason === "observation_handoff"
          ? "Observation prepared"
          : "Reward earned";

    const toast = document.createElement("div");
    toast.className = "gw-economy-toast";
    toast.innerHTML = `🍃 +${Number(amount).toLocaleString()} Wild Points<br><span style="font-size:12px;opacity:.75;">${label}</span>`;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
  window.GridWildEconomy = {
    load,
    save,
    refreshHud,
    bindHud,
    owns,
    hasAchievement,
    canBuy,
    buyItem,
    showRewardToast,
    equipItem,
    getEquippedItems
  };

  document.addEventListener("DOMContentLoaded", bindHud);
})();
