// -----------------------------------------------------------------------------
// GridWild Profile / Self View
// -----------------------------------------------------------------------------

(function () {
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function homeNicheBadgeHtml() {
    const home =
      window.GridWildLocalNiches?.getHomeNiche?.() || window.__gwState?.homeNiche || null;
    const title = home?.short_title || home?.title || "";
    if (!title) return "";

    return `
      <div class="gw-store-desc" style="
        display:inline-flex;align-items:center;gap:7px;max-width:100%;
        min-height:0;margin-top:8px;padding:5px 8px;border-radius:999px;
        border:1px solid rgba(255,230,111,0.45);
        background:rgba(255,230,111,0.08);
        color:#fff0a1;font-size:12px;font-weight:900;
      " title="Home Niche: ${esc(title)}">
        <span style="width:14px;height:14px;display:inline-grid;place-items:center;flex:0 0 auto;">
          <svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">
            <path d="M3 11.5 12 4l9 7.5"></path>
            <path d="M5.5 10.5V20h13v-9.5"></path>
            <path d="M9.5 20v-6h5v6"></path>
          </svg>
        </span>
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          Steward of ${esc(title)}
        </span>
      </div>
    `;
  }

  function getAchievementsUnlockedCount() {
    try {
      const raw = localStorage.getItem("gw_user_achievements_v1");
      const store = raw ? JSON.parse(raw) : {};
      return Object.values(store).filter((x) => x?.unlocked).length;
    } catch {
      return 0;
    }
  }

  function getQuestStats() {
    const quests = window.GridWildQuests?.getVisibleQuests?.() || [];

    return {
      total: quests.length,
      completed: quests.filter((q) => q.status === "completed" || q.status === "complete").length,
      active: quests.filter((q) => q.status === "active").length
    };
  }

  function frameStyle(frame) {
    if (!frame) return "";

    if (frame.id === "brass_field_frame") {
      return "border:3px solid rgba(215,183,116,0.85);";
    }

    if (frame.id === "fern_border") {
      return "border:3px solid rgba(90,190,110,0.85);box-shadow:0 0 0 4px rgba(90,190,110,0.12);";
    }

    if (frame.id === "beetle_carapace_frame") {
      return "border:3px solid rgba(120,90,180,0.9);box-shadow:0 0 18px rgba(160,110,255,0.22);";
    }

    if (frame.id === "museum_label_frame") {
      return "border:3px double rgba(240,209,138,0.85);";
    }

    return "";
  }

  function open() {
    window.GridWildStore?.ensureStyles?.();
    document.querySelectorAll(".gw-store-backdrop").forEach((el) => el.remove());

    const character = window.GridWildCharacter?.load?.() || {};
    const economy = window.GridWildEconomy?.load?.() || {};
    const equipped = window.GridWildEconomy?.getEquippedItems?.() || {};
    const iNat = window.__gwUser?.profile || {};
    const quests = getQuestStats();
    const achCount = getAchievementsUnlockedCount();
    const ownedCount = (economy.ownedItems || []).length;

    const root = document.createElement("div");
    root.className = "gw-store-backdrop";

    root.innerHTML = `
      <div class="gw-store-modal">
        <div class="gw-store-head">
          <div class="gw-store-title">GridWild Profile</div>
          <div class="gw-store-sub">
            Your GridWild identity, separate from your iNaturalist page.
          </div>
        </div>

        <div class="gw-store-grid">
          <div class="gw-store-item" style="grid-column:1 / -1;${frameStyle(equipped.frame)}">
            <div class="gw-store-item-top">
                <div class="gw-store-icon" style="
                    width:72px;
                    height:72px;
                    font-size:38px;
                    ${frameStyle(equipped.frame)}
                ">
                ${esc(equipped.hat?.icon || character.icon || "🌿")}
              </div>

              <div>
                <div class="gw-store-name" style="font-size:22px;">
                  ${esc(window.__gwState?.player?.display_name || character.displayName || "New Wanderer")}
                </div>
                <div class="gw-store-meta">
                  ${esc(equipped.title?.name?.replace(/^Title:\\s*/i, "") || character.archetype || "Naturalist")}
                </div>
                <div class="gw-store-desc" style="min-height:0;">
                  ${esc(character.color || "fern")} field style
                </div>
                ${homeNicheBadgeHtml()}
              </div>
            </div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">Wallet</div>
            <div
              id="gwProfileWildpointsValue"
              class="gw-store-desc"
              style="font-size:24px;font-weight:950;color:#ffe082;"
            >
              🍃 ${Number(window.GridWildPlayerUI?.getWildpoints?.() || 0).toLocaleString()}
            </div>
            <div class="gw-store-meta">Wild Points</div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">Achievements</div>
            <div class="gw-store-desc" style="font-size:24px;font-weight:950;color:#ffe082;">
              🏅 ${achCount.toLocaleString()}
            </div>
            <div class="gw-store-meta">Unlocked</div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">Quests</div>
            <div class="gw-store-desc">
              <b>${quests.completed}</b> completed<br>
              <b>${quests.active}</b> active<br>
              <b>${quests.total}</b> total
            </div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">Inventory</div>
            <div class="gw-store-desc" style="font-size:24px;font-weight:950;color:#ffe082;">
              🎒 ${ownedCount}
            </div>
            <div class="gw-store-meta">Owned cosmetics</div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">Equipped</div>
            <div class="gw-store-desc">
              Hat: ${equipped.hat ? `${esc(equipped.hat.icon)} ${esc(equipped.hat.name)}` : "None"}<br>
              Companion: ${equipped.companion ? `${esc(equipped.companion.icon)} ${esc(equipped.companion.name)}` : "None"}<br>
              Trail: ${equipped.trail ? `${esc(equipped.trail.icon)} ${esc(equipped.trail.name)}` : "None"}<br>
              Frame: ${equipped.frame ? `${esc(equipped.frame.icon)} ${esc(equipped.frame.name)}` : "None"}
            </div>
          </div>

          <div class="gw-store-item">
            <div class="gw-store-name">iNaturalist Link</div>
            <div class="gw-store-desc">
              @${esc(iNat.login || window.__gwUser?.username || "unknown")}<br>
              ${Number(iNat.observations_count || 0).toLocaleString()} observations<br>
              ${Number(iNat.species_count || 0).toLocaleString()} species
            </div>
          </div>
        </div>

        <div class="gw-store-foot">
          <button class="gw-store-action secondary" id="gwProfileCloseBtn">Close</button>
          <button class="gw-store-action" id="gwProfileInventoryBtn">Inventory</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    root.onclick = (evt) => {
      if (evt.target === root) root.remove();
    };

    root.querySelector("#gwProfileCloseBtn").onclick = () => root.remove();

    root.querySelector("#gwProfileInventoryBtn").onclick = () => {
      root.remove();
      window.GridWildInventory?.open?.();
    };
  }

  function bindButtons(root = document) {
    root.querySelector("#gwOpenProfileBtn")?.addEventListener("click", open);
  }

  window.GridWildProfile = {
    open,
    bindButtons
  };
})();
