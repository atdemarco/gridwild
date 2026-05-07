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
      const local = raw
  ? { ...DEFAULT_STATE, ...JSON.parse(raw) }
  : { ...DEFAULT_STATE };

const dbWildpoints =
  window.__gwState?.player?.wildpoints;

if (dbWildpoints !== undefined && dbWildpoints !== null) {
  local.wildPoints = Number(dbWildpoints || 0);
}


const dbInventory = window.__gwState?.playerInventory;
if (Array.isArray(dbInventory)) {
  local.ownedItems = dbInventory
    .map(x => x.item_id)
    .filter(Boolean);
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

async function addWildPoints(n, reason = "manual") {
  const amount = Number(n || 0);

  try {
    const player = await window.GridWildAPI.addWildpoints(amount);

    window.__gwState = window.__gwState || {};
    window.__gwState.player = player;

    showRewardToast(amount, reason);

    refreshHud();

    window.dispatchEvent(new CustomEvent("gwEconomyChanged", {
      detail: player
    }));

    return player;
  } catch (err) {
    console.warn("Could not award wildpoints:", err);

    // fallback to local
    const state = load();

    state.wildPoints =
      Math.max(0, Number(state.wildPoints || 0) + amount);

    showRewardToast(amount, reason);

    return save(state);
  }
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
    return dbInventory.some(x => x.item_id === itemId);
  }

  return load().ownedItems.includes(itemId);
  }

  function hasAchievement(id) {
    if (!id) return true;

    const storeRaw = localStorage.getItem("gw_user_achievements_v1");
    if (!storeRaw) return false;

    try {
      const store = JSON.parse(storeRaw);
      return !!store?.[id]?.unlocked;
    } catch {
      return false;
    }
  }

function getCatalogItem(itemId) {
  return window.GridWildStore?.getCatalog?.().find(x => x.id === itemId) || null;
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
  const price = Number(item.price || 0);

  try {
    if (currency === "wildPoints") {
      const player = await window.GridWildAPI.addWildpoints(-price);

      window.__gwState = window.__gwState || {};
      window.__gwState.player = player;

      await window.GridWildAPI.addPlayerInventoryItem(item.id);

      window.__gwState = window.__gwState || {};
      window.__gwState.playerInventory = [
        ...(window.__gwState.playerInventory || []).filter(x => x.item_id !== item.id),
        { item_id: item.id }
      ];

      state.ownedItems = Array.from(new Set([...(state.ownedItems || []), item.id]));
      save(state);
      refreshHud();

      return { ok: true, item, state };
    }

    state[currency] = Number(state[currency] || 0) - price;
    state.ownedItems = Array.from(new Set([...(state.ownedItems || []), item.id]));
    save(state);

    return { ok: true, item, state };
  } catch (err) {
    console.warn("Could not buy item:", err);
    return { ok: false, reason: "Purchase failed." };
  }
}
function equipItem(itemId) {
  const item = getCatalogItem(itemId);
  if (!item) return { ok: false, reason: "Missing item." };

  const state = load();

  if (!(state.ownedItems || []).includes(itemId)) {
    return { ok: false, reason: "Item not owned." };
  }

  const slot = item.slot || item.category;
  if (!slot) return { ok: false, reason: "Item has no equipment slot." };

  state.equipped = {
    ...(state.equipped || {}),
    [slot]: itemId
  };

  save(state);

  window.GridWildAPI?.setPlayerEquipment?.(slot, itemId)
    .then(result => {
      window.__gwState = window.__gwState || {};
      window.__gwState.playerEquipment = result.equipment;
      window.GridWildCharacter?.renderSummary?.();
    })
    .catch(err => {
      console.warn("Could not sync equipment:", err);
    });

  return { ok: true, item, state };
}

    function getEquippedItems() {
    const state = load();
    const catalog = window.GridWildStore?.getCatalog?.() || [];
    const equipped = state.equipped || {};

    const out = {};

    Object.entries(equipped).forEach(([slot, itemId]) => {
        out[slot] = catalog.find(x => x.id === itemId) || null;
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

    document.querySelectorAll(".gw-economy-toast").forEach(el => el.remove());

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


    function rewardObservationHandoff(draftId) {
      if (!draftId) return { ok: false, reason: "Missing draft id." };

      const key = `gw_obs_rewarded_${draftId}`;
      if (localStorage.getItem(key)) {
        return { ok: false, reason: "Already rewarded." };
      }

      const points = 25;
      localStorage.setItem(key, new Date().toISOString());

      addWildPoints(points, "observation_handoff");

      return { ok: true, points };
    }
    


    window.GridWildEconomy = {
    load,
    save,
    addWildPoints,
    rewardObservationHandoff,
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