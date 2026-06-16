// -----------------------------------------------------------------------------
// GridWild Player Interactions
// Direct chat requests, party invites/requests, HUD inbox, and blocks.
// -----------------------------------------------------------------------------

(function () {
  const POLL_INTERVAL_MS = 12000;
  const QUEST_ASSIGNMENTS_KEY = "gw_inbox_quest_assignments_v1";
  const QUEST_ASSIGNMENT_MUTES_KEY = "gw_inbox_muted_quest_assignments_v1";

  let stylesInjected = false;
  let hudRoot = null;
  let inboxOpen = false;
  let refreshTimer = null;
  let refreshInFlight = false;
  let chatRoot = null;
  let state = {
    notifications: [],
    conversations: [],
    blocks: [],
    questAssignments: loadQuestAssignments(),
    mutedQuestAssignments: loadMutedQuestAssignments()
  };

  function esc(s) {
    return String(s ?? "")
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

  function isSignedIn() {
    return Boolean(window.GridWildAPI?.getPlayerId?.() && window.GridWildAPI?.getSessionToken?.());
  }

  function isOnlineGameplayReady() {
    return window.GridWildOnline?.isReady?.() === true || window.__gwState?.bootstrapReady === true;
  }

  function storageKey(base) {
    try {
      const playerId = localStorage.getItem("gwPlayerId");
      return playerId ? `${base}:${playerId}` : base;
    } catch {
      return base;
    }
  }

  function loadStoredList(baseKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(baseKey)) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadQuestAssignments() {
    return loadStoredList(QUEST_ASSIGNMENTS_KEY).filter((row) => row?.id);
  }

  function saveQuestAssignments() {
    try {
      localStorage.setItem(
        storageKey(QUEST_ASSIGNMENTS_KEY),
        JSON.stringify(state.questAssignments || [])
      );
    } catch (err) {
      console.warn("Could not save quest assignments:", err);
    }
  }

  function loadMutedQuestAssignments() {
    return loadStoredList(QUEST_ASSIGNMENT_MUTES_KEY).map(String).filter(Boolean);
  }

  function saveMutedQuestAssignments() {
    try {
      localStorage.setItem(
        storageKey(QUEST_ASSIGNMENT_MUTES_KEY),
        JSON.stringify(state.mutedQuestAssignments || [])
      );
    } catch (err) {
      console.warn("Could not save muted quest assignments:", err);
    }
  }

  function ensureLocalQuestState() {
    if (!Array.isArray(state.questAssignments)) state.questAssignments = loadQuestAssignments();
    if (!Array.isArray(state.mutedQuestAssignments)) {
      state.mutedQuestAssignments = loadMutedQuestAssignments();
    }
  }

  function myPlayerId() {
    return String(window.GridWildAPI?.getPlayerId?.() || "");
  }

  function playerName(player, fallback = "Explorer") {
    return player?.display_name || player?.displayName || fallback;
  }

  function firstName(name) {
    return (
      String(name || "Explorer")
        .trim()
        .split(/\s+/)[0] || "Explorer"
    );
  }

  function targetPlayerId(context = {}) {
    return String(
      context.targetPlayerId ||
        context.target_player_id ||
        context.player_id ||
        context.presence?.player_id ||
        context.player?.id ||
        ""
    );
  }

  function targetPlayer(context = {}) {
    return context.player || context.presence?.player || context.data?.player || null;
  }

  function targetParty(context = {}) {
    return (
      context.active_party ||
      context.activeParty ||
      context.presence?.active_party ||
      context.data?.active_party ||
      null
    );
  }

  function currentParty() {
    const party = window.__gwState?.party || null;
    const id = window.GridWildPartyLive?.getActivePartyId?.() || party?.id || "";
    if (!id) return null;

    return {
      id,
      name: party?.name || "Your party",
      visibility: party?.visibility || ""
    };
  }

  function isTargetBlocked(targetId) {
    return state.blocks.some((row) => String(row.blocked_player_id) === String(targetId));
  }

  function isQuestAssignmentBlocked(row) {
    const ids = [
      row.sender_player_id,
      row.payload?.senderPlayerId,
      row.payload?.observerPlayerId,
      row.payload?.playerId
    ]
      .map((id) => String(id || ""))
      .filter(Boolean);
    return ids.some(isTargetBlocked);
  }

  function conversationForTarget(targetId) {
    return (
      state.conversations.find(
        (row) =>
          String(row.sender_player_id) === String(targetId) ||
          String(row.recipient_player_id) === String(targetId)
      ) || null
    );
  }

  function injectStyles() {
    if (stylesInjected || document.getElementById("gwPlayerInteractionsStyles")) {
      stylesInjected = true;
      return;
    }

    const style = document.createElement("style");
    style.id = "gwPlayerInteractionsStyles";
    style.textContent = `
      .gw-player-interaction-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .gw-player-interaction-note {
        margin-top: 8px;
        color: rgba(239,230,211,0.62);
        font-size: 12px;
        line-height: 1.35;
      }

      .gw-player-action-btn,
      .gw-player-inbox-pill,
      .gw-player-inbox-action,
      .gw-direct-chat-close,
      .gw-direct-chat-open {
        border: 1px solid rgba(240,209,138,0.22);
        background: rgba(255,255,255,0.07);
        color: #f4e8cf;
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-player-action-btn {
        min-height: 38px;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
      }

      .gw-player-action-btn:hover,
      .gw-player-inbox-action:hover,
      .gw-direct-chat-open:hover,
      .gw-direct-chat-close:hover {
        background: rgba(240,209,138,0.16);
      }

      .gw-player-action-btn.is-danger {
        border-color: rgba(242,142,125,0.38);
        color: #ffd0c8;
      }

      .gw-player-action-btn:disabled,
      .gw-player-inbox-action:disabled,
      .gw-direct-chat-open:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .gw-player-inbox-root {
        position: fixed;
        top: calc(max(12px, env(safe-area-inset-top)) + 50px);
        right: 12px;
        z-index: 100003;
        display: grid;
        justify-items: end;
        pointer-events: none;
      }

      .gw-player-inbox-root.is-hidden {
        display: none;
      }

      .gw-player-inbox-pill {
        pointer-events: auto;
        min-height: 38px;
        border-radius: 999px;
        padding: 8px 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background:
          linear-gradient(180deg, rgba(48,41,35,0.94), rgba(28,24,21,0.96));
        box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      }

      .gw-player-inbox-count {
        min-width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        padding: 0 6px;
        background: #f0d18a;
        color: #231a12;
        font-size: 12px;
        line-height: 1;
      }

      .gw-player-inbox-panel {
        pointer-events: auto;
        width: min(360px, calc(100vw - 24px));
        max-height: min(520px, calc(100vh - 126px));
        overflow: auto;
        margin-top: 8px;
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.24);
        background:
          linear-gradient(180deg, rgba(43,36,30,0.98), rgba(24,21,18,0.98));
        box-shadow: 0 18px 44px rgba(0,0,0,0.36);
        display: none;
      }

      .gw-player-inbox-root.is-open .gw-player-inbox-panel {
        display: block;
      }

      .gw-player-inbox-head,
      .gw-direct-chat-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px;
        border-bottom: 1px solid rgba(240,209,138,0.14);
      }

      .gw-player-inbox-title,
      .gw-direct-chat-title {
        color: #f4e8cf;
        font-size: 14px;
        font-weight: 950;
      }

      .gw-player-inbox-list {
        display: grid;
        gap: 8px;
        padding: 10px;
      }

      .gw-player-inbox-item,
      .gw-direct-chat-row {
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.16);
        background: rgba(255,255,255,0.045);
        padding: 10px;
      }

      .gw-player-inbox-item.is-quest-assignment {
        border-color: rgba(117,230,164,0.26);
        background:
          linear-gradient(180deg, rgba(66,82,54,0.24), rgba(255,255,255,0.045));
      }

      .gw-player-inbox-item-title,
      .gw-direct-chat-row-title {
        color: #f4e8cf;
        font-size: 13px;
        line-height: 1.25;
        font-weight: 950;
      }

      .gw-player-inbox-item-copy,
      .gw-direct-chat-row-meta {
        margin-top: 4px;
        color: rgba(239,230,211,0.62);
        font-size: 12px;
        line-height: 1.35;
      }

      .gw-player-inbox-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 9px;
      }

      .gw-player-inbox-assignment-footer {
        margin-top: 8px;
        padding-top: 7px;
        border-top: 1px solid rgba(240,209,138,0.12);
        color: rgba(196,237,190,0.82);
        font-size: 11px;
        line-height: 1.25;
        font-weight: 850;
      }

      .gw-player-inbox-action,
      .gw-direct-chat-open,
      .gw-direct-chat-close {
        min-height: 30px;
        border-radius: 8px;
        padding: 6px 9px;
        font-size: 12px;
      }

      .gw-player-inbox-action.is-danger {
        border-color: rgba(242,142,125,0.34);
        color: #ffd0c8;
      }

      .gw-direct-chat-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100005;
        display: grid;
        place-items: center;
        padding: 14px;
        background: rgba(0,0,0,0.48);
      }

      .gw-direct-chat-modal {
        width: min(620px, 96vw);
        max-height: min(760px, 92vh);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.24);
        background:
          linear-gradient(180deg, rgba(43,36,30,0.98), rgba(24,21,18,0.98));
        box-shadow: 0 22px 60px rgba(0,0,0,0.46);
        overflow: hidden;
      }

      .gw-direct-chat-body {
        min-height: 420px;
        overflow: hidden;
      }

      .gw-direct-chat-body .gw-chat-room {
        height: 100%;
        border: 0;
        border-radius: 0;
      }

      .gw-direct-chat-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        margin-top: 8px;
      }

      @media (max-width: 640px) {
        .gw-player-interaction-actions {
          grid-template-columns: 1fr;
        }

        .gw-player-inbox-root {
          right: 10px;
          top: calc(max(10px, env(safe-area-inset-top)) + 50px);
        }

        .gw-direct-chat-body {
          min-height: 360px;
        }
      }
    `;

    document.head.appendChild(style);
    stylesInjected = true;
  }

  function renderAvatarActionsHtml(context = {}) {
    injectStyles();

    const targetId = targetPlayerId(context);
    if (!targetId || targetId === myPlayerId()) return "";

    if (!isSignedIn()) {
      return `
        <div class="gw-avatar-panel-section">
          <div class="gw-avatar-section-title">Interactions</div>
          <div class="gw-player-interaction-note">
            Sign in with a GridWild account to chat, join parties, and manage blocks.
          </div>
        </div>
      `;
    }

    const blocked = isTargetBlocked(targetId);
    const ownParty = currentParty();
    const theirParty = targetParty(context);
    const currentConversation = conversationForTarget(targetId);
    const actions = [];

    if (!blocked) {
      actions.push({
        action: "chat",
        label: currentConversation ? "Message" : "Chat"
      });

      if (ownParty?.id && String(ownParty.id) !== String(theirParty?.id || "")) {
        actions.push({
          action: "party_invite",
          label: "Invite to Party"
        });
      }

      if (theirParty?.id && String(theirParty.id) !== String(ownParty?.id || "")) {
        actions.push({
          action: theirParty.visibility === "public" ? "party_join_public" : "party_join_request",
          label: theirParty.visibility === "public" ? "Join Party" : "Request Party"
        });
      }

      actions.push({
        action: "block",
        label: "Block",
        danger: true
      });
    }

    return `
      <div class="gw-avatar-panel-section" data-gw-player-interactions-section>
        <div class="gw-avatar-section-title">Interactions</div>
        ${
          blocked
            ? `<div class="gw-player-interaction-note">This player is blocked.</div>`
            : `<div class="gw-player-interaction-actions">
              ${actions
                .map(
                  (action) => `
                <button
                  class="gw-player-action-btn${action.danger ? " is-danger" : ""}"
                  type="button"
                  data-gw-player-action="${esc(action.action)}"
                >
                  ${esc(action.label)}
                </button>
              `
                )
                .join("")}
            </div>`
        }
      </div>
    `;
  }

  function setButtonsBusy(root, busy) {
    root.querySelectorAll("[data-gw-player-action]").forEach((button) => {
      button.disabled = !!busy;
    });
  }

  async function joinPublicParty(party) {
    if (!party?.id) throw new Error("Party is unavailable.");
    await window.GridWildAPI.joinParty(party.id);
    window.GridWildPartyLive?.setActivePartyId?.(party.id);
    await window.GridWildPartyLive?.loadParty?.({ forceNearby: true });
    window.GridWildPartyLive?.refreshPartySheet?.();
    window.GridWildParty?.refreshMapBeacon?.();
    toast(`Joined ${party.name || "party"}.`);
  }

  async function handleAvatarAction(action, context = {}, root = document) {
    const targetId = targetPlayerId(context);
    const theirPlayer = targetPlayer(context);
    const theirName = playerName(theirPlayer);
    const theirParty = targetParty(context);
    const ownParty = currentParty();

    if (!targetId) return;
    if (!isSignedIn()) {
      toast("Sign in with a GridWild account first.");
      return;
    }

    setButtonsBusy(root, true);

    try {
      if (action === "chat") {
        const result = await window.GridWildAPI.createPlayerInteraction({
          type: "chat_request",
          target_player_id: targetId
        });
        const row = result?.interaction || null;
        await refresh({ quiet: true });

        if (row?.status === "accepted" && row?.room_id) {
          openDirectChat(row);
        } else if (String(row?.sender_player_id || "") === String(targetId)) {
          inboxOpen = true;
          renderHud();
          toast(`${theirName} already asked to chat. Check the HUD inbox.`);
        } else {
          toast(`Chat request sent to ${theirName}.`);
        }
      } else if (action === "party_invite") {
        if (!ownParty?.id) throw new Error("Join or create a party first.");
        await window.GridWildAPI.createPlayerInteraction({
          type: "party_invite",
          target_player_id: targetId,
          party_id: ownParty.id
        });
        await refresh({ quiet: true });
        toast(`Party invite sent to ${theirName}.`);
      } else if (action === "party_join_public") {
        await joinPublicParty(theirParty);
      } else if (action === "party_join_request") {
        if (!theirParty?.id) throw new Error("That party is unavailable.");
        await window.GridWildAPI.createPlayerInteraction({
          type: "party_join_request",
          target_player_id: targetId,
          party_id: theirParty.id
        });
        await refresh({ quiet: true });
        toast(`Party request sent to ${theirName}.`);
      } else if (action === "block") {
        const ok = window.confirm?.(
          `Block ${theirName}? They will disappear from nearby HUD presence and cannot chat with you.`
        );
        if (!ok) return;
        await window.GridWildAPI.blockPlayer(targetId);
        await refresh({ quiet: true });
        window.GridWildPresence?.pollNearby?.({ force: true });
        window.GridWildAvatarInspection?.close?.();
        toast(`${theirName} blocked.`);
      }
    } catch (err) {
      console.warn("Player interaction failed:", err);
      toast(err?.message || "Could not complete that interaction.");
    } finally {
      setButtonsBusy(root, false);
    }
  }

  function bindAvatarActions(root = document, context = {}) {
    root.querySelectorAll("[data-gw-player-action]").forEach((button) => {
      if (button.dataset.gwPlayerActionBound === "true") return;
      button.dataset.gwPlayerActionBound = "true";
      button.addEventListener("click", () => {
        handleAvatarAction(button.dataset.gwPlayerAction, context, root);
      });
    });
  }

  function notificationText(row) {
    if (row.type === "quest_assignment") {
      const patchName = row.payload?.patchName || "a subscribed Patch";
      return [
        row.title || "Quest assignment",
        row.copy || row.body || `Unknown observations need IDs inside ${patchName}.`
      ];
    }

    const sender = playerName(row.sender);
    const recipient = playerName(row.recipient);
    const party = row.party?.name || row.payload?.party_name || "party";

    if (row.status === "declined") {
      if (row.type === "chat_request")
        return ["Chat request declined", `${recipient} declined the chat request.`];
      if (row.type === "party_invite")
        return ["Party invite declined", `${recipient} declined the invite to ${party}.`];
      if (row.type === "party_join_request")
        return ["Party request declined", `${recipient} declined the request to join ${party}.`];
    }

    if (row.type === "chat_request")
      return ["Chat request", `${sender} wants to start a private chat.`];
    if (row.type === "party_invite") return ["Party invite", `${sender} invited you to ${party}.`];
    if (row.type === "party_join_request")
      return ["Party request", `${sender} wants to join ${party}.`];

    return ["Notification", "New player interaction."];
  }

  function normalizeQuestAssignment(row) {
    if (!row?.id) return null;
    return {
      ...row,
      id: String(row.id),
      type: "quest_assignment",
      status: row.status || "available",
      created_at: row.created_at || row.createdAt || new Date().toISOString(),
      payload: row.payload && typeof row.payload === "object" ? row.payload : {}
    };
  }

  function questAssignmentTime(row) {
    const time = new Date(row.created_at || row.createdAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function visibleQuestAssignments() {
    ensureLocalQuestState();
    const muted = new Set((state.mutedQuestAssignments || []).map(String));
    return (state.questAssignments || [])
      .filter((row) => row?.id && !muted.has(String(row.id)) && !isQuestAssignmentBlocked(row))
      .sort((a, b) => questAssignmentTime(b) - questAssignmentTime(a));
  }

  function inboxNotifications() {
    const rows = [...visibleQuestAssignments(), ...(state.notifications || [])];
    return rows.sort((a, b) => questAssignmentTime(b) - questAssignmentTime(a));
  }

  function questAssignmentFooter(row) {
    if (row.type !== "quest_assignment") return "";
    const payload = row.payload || {};
    const count = Number(payload.unknownCount || payload.observationCount || 0);
    const taxon = payload.taxonLabel || "Any life";
    const patch = payload.patchName || "subscribed Patch";
    const countLabel = count
      ? `${count} unknown observation${count === 1 ? "" : "s"}`
      : "Unknown observations";
    return `
      <div class="gw-player-inbox-assignment-footer">
        Quest assignment - ${esc(countLabel)} - ${esc(taxon)} - ${esc(patch)}
      </div>
    `;
  }

  function renderNotificationActions(row) {
    if (row.type === "quest_assignment") {
      return `
        <button class="gw-player-inbox-action" type="button" data-gw-quest-assignment-action="start" data-assignment-id="${esc(row.id)}">
          Start
        </button>
        <button class="gw-player-inbox-action" type="button" data-gw-quest-assignment-action="patch" data-assignment-id="${esc(row.id)}">
          Patch
        </button>
        <button class="gw-player-inbox-action is-danger" type="button" data-gw-quest-assignment-action="mute" data-assignment-id="${esc(row.id)}">
          Mute
        </button>
      `;
    }

    if (row.status === "declined") {
      return `
        <button class="gw-player-inbox-action" type="button" data-gw-interaction-response="dismiss" data-interaction-id="${esc(row.id)}">
          Dismiss
        </button>
      `;
    }

    if (row.type === "chat_request") {
      return `
        <button class="gw-player-inbox-action" type="button" data-gw-interaction-response="accept" data-interaction-id="${esc(row.id)}">
          Accept
        </button>
        <button class="gw-player-inbox-action is-danger" type="button" data-gw-interaction-response="decline" data-interaction-id="${esc(row.id)}">
          Decline
        </button>
      `;
    }

    if (row.type === "party_invite") {
      return `
        <button class="gw-player-inbox-action" type="button" data-gw-interaction-response="accept" data-interaction-id="${esc(row.id)}">
          Join
        </button>
        <button class="gw-player-inbox-action is-danger" type="button" data-gw-interaction-response="decline" data-interaction-id="${esc(row.id)}">
          Decline
        </button>
      `;
    }

    if (row.type === "party_join_request") {
      return `
        <button class="gw-player-inbox-action" type="button" data-gw-interaction-response="accept" data-interaction-id="${esc(row.id)}">
          Allow
        </button>
        <button class="gw-player-inbox-action is-danger" type="button" data-gw-interaction-response="decline" data-interaction-id="${esc(row.id)}">
          Decline
        </button>
      `;
    }

    return "";
  }

  function renderNotification(row) {
    const [title, copy] = notificationText(row);
    return `
      <div class="gw-player-inbox-item ${row.type === "quest_assignment" ? "is-quest-assignment" : ""}">
        <div class="gw-player-inbox-item-title">${esc(title)}</div>
        <div class="gw-player-inbox-item-copy">${esc(copy)}</div>
        ${questAssignmentFooter(row)}
        <div class="gw-player-inbox-actions">
          ${renderNotificationActions(row)}
        </div>
      </div>
    `;
  }

  function ensureHud() {
    injectStyles();
    if (hudRoot?.isConnected) return hudRoot;

    hudRoot = document.createElement("div");
    hudRoot.id = "gwPlayerInteractionHud";
    hudRoot.className = "gw-player-inbox-root";
    document.body.appendChild(hudRoot);
    return hudRoot;
  }

  function renderHud() {
    const root = ensureHud();
    const rows = inboxNotifications();
    const count = rows.length;
    const hidden = !isSignedIn() && count === 0;
    root.classList.toggle("is-hidden", hidden);
    root.classList.toggle("is-open", inboxOpen);

    root.innerHTML = `
      <button class="gw-player-inbox-pill" type="button" data-gw-inbox-toggle aria-expanded="${inboxOpen ? "true" : "false"}">
        <span>Inbox</span>
        <span class="gw-player-inbox-count">${count}</span>
      </button>
      <div class="gw-player-inbox-panel" role="dialog" aria-label="HUD inbox">
        <div class="gw-player-inbox-head">
          <div class="gw-player-inbox-title">HUD Inbox</div>
          <button class="gw-player-inbox-action" type="button" data-gw-inbox-close>Close</button>
        </div>
        <div class="gw-player-inbox-list">
          ${
            count
              ? rows.map(renderNotification).join("")
              : `<div class="gw-player-inbox-item">
                <div class="gw-player-inbox-item-title">Inbox clear</div>
                <div class="gw-player-inbox-item-copy">Chat, party, and quest assignments will appear here.</div>
              </div>`
          }
        </div>
      </div>
    `;

    bindHud(root);
  }

  async function handleNotificationResponse(button) {
    const id = button.dataset.interactionId;
    const response = button.dataset.gwInteractionResponse;
    if (!id || !response) return;

    button.disabled = true;

    try {
      const result = await window.GridWildAPI.respondPlayerInteraction(id, response);
      const row = result?.interaction || null;
      await refresh({ quiet: true });

      if (response === "accept" && row?.type === "chat_request" && row?.room_id) {
        openDirectChat(row);
      } else if (response === "accept" && row?.type === "party_invite") {
        window.GridWildPartyLive?.setActivePartyId?.(row.party_id);
        await window.GridWildPartyLive?.loadParty?.({ forceNearby: true });
        window.GridWildPartyLive?.refreshPartySheet?.();
        window.GridWildParty?.refreshMapBeacon?.();
        toast(`Joined ${row.party?.name || "party"}.`);
      } else if (response === "accept" && row?.type === "party_join_request") {
        await window.GridWildPartyLive?.loadParty?.({ forceNearby: true });
        window.GridWildPartyLive?.refreshPartySheet?.();
        toast(`${playerName(row.sender)} can join ${row.party?.name || "the party"}.`);
      } else if (response === "decline") {
        toast("Declined.");
      }
    } catch (err) {
      console.warn("Could not respond to player interaction:", err);
      toast(err?.message || "Could not respond.");
      await refresh({ quiet: true });
    }
  }

  function removeQuestAssignment(id, options = {}) {
    ensureLocalQuestState();
    const targetId = String(id || "");
    if (!targetId) return;

    state.questAssignments = (state.questAssignments || []).filter(
      (row) => String(row.id) !== targetId
    );
    if (options.mute === true && !state.mutedQuestAssignments.includes(targetId)) {
      state.mutedQuestAssignments.push(targetId);
      saveMutedQuestAssignments();
    }
    saveQuestAssignments();
    renderHud();
    window.dispatchEvent(
      new CustomEvent("gwQuestAssignmentsChanged", {
        detail: { assignments: visibleQuestAssignments() }
      })
    );
  }

  async function handleQuestAssignmentAction(button) {
    const id = button.dataset.assignmentId;
    const action = button.dataset.gwQuestAssignmentAction;
    if (!id || !action) return;

    ensureLocalQuestState();
    const row = (state.questAssignments || []).find((item) => String(item.id) === String(id));
    if (!row) return;

    if (action === "patch") {
      const patchId = row.payload?.patchId;
      if (patchId && window.GridWildPatches?.openPatchDetail) {
        window.GridWildPatches.openPatchDetail(patchId);
      } else {
        toast("That Patch is not available locally.");
      }
      return;
    }

    if (action === "mute") {
      removeQuestAssignment(id, { mute: true });
      toast("Quest assignment muted.");
      return;
    }

    if (action !== "start") return;

    const recipe = row.payload?.recipe;
    if (!recipe || !window.GridWildQuests?.startQuestFromRecipe) {
      toast("Quest tools are still loading.");
      return;
    }

    button.disabled = true;
    try {
      const quest = await window.GridWildQuests.startQuestFromRecipe(recipe, {
        title: row.payload?.questTitle || row.title || "Identify Unknowns",
        description:
          row.payload?.questDescription ||
          row.body ||
          row.copy ||
          "Identify unknown observations inside a subscribed Patch.",
        source: "patch_subscription",
        autoEmbark: true,
        optimisticEmbark: true,
        openStatus: false
      });

      if (quest) {
        removeQuestAssignment(id);
        toast("Quest assignment accepted.");
        if (window.GridWildIdentify?.openIdentifyDialog) {
          window.GridWildIdentify.openIdentifyDialog(quest);
        }
      } else {
        button.disabled = false;
      }
    } catch (err) {
      console.warn("Could not start quest assignment:", err);
      toast(err?.message || "Could not start that quest.");
      button.disabled = false;
    }
  }

  function bindHud(root = hudRoot) {
    if (!root) return;

    root.querySelector("[data-gw-inbox-toggle]")?.addEventListener("click", () => {
      inboxOpen = !inboxOpen;
      renderHud();
    });

    root.querySelector("[data-gw-inbox-close]")?.addEventListener("click", () => {
      inboxOpen = false;
      renderHud();
    });

    root.querySelectorAll("[data-gw-interaction-response]").forEach((button) => {
      button.addEventListener("click", () => handleNotificationResponse(button));
    });

    root.querySelectorAll("[data-gw-quest-assignment-action]").forEach((button) => {
      button.addEventListener("click", () => handleQuestAssignmentAction(button));
    });
  }

  function closeDirectChat() {
    const container = chatRoot?.querySelector?.("[data-gw-direct-chat-container]");
    if (container) window.GridWildChat?.destroy?.(container);
    chatRoot?.remove();
    chatRoot = null;
  }

  function openDirectChat(rowOrRoomId, options = {}) {
    const row =
      typeof rowOrRoomId === "string"
        ? state.conversations.find((item) => String(item.room_id) === String(rowOrRoomId)) || {
            room_id: rowOrRoomId
          }
        : rowOrRoomId || {};
    const roomId = row.room_id || options.roomId || null;
    if (!roomId) {
      toast("Direct chat is not ready yet.");
      return;
    }

    injectStyles();
    closeDirectChat();

    const other =
      row.other_player ||
      (String(row.sender_player_id || "") === myPlayerId() ? row.recipient : row.sender) ||
      options.otherPlayer ||
      null;
    const titleName = playerName(other, options.title || "Direct chat");
    const title = options.title || `Chat with ${titleName}`;

    chatRoot = document.createElement("div");
    chatRoot.className = "gw-direct-chat-backdrop";
    chatRoot.innerHTML = `
      <div class="gw-direct-chat-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="gw-direct-chat-head">
          <div class="gw-direct-chat-title">${esc(title)}</div>
          <button class="gw-direct-chat-close" type="button" data-gw-direct-chat-close>Close</button>
        </div>
        <div class="gw-direct-chat-body" data-gw-direct-chat-container></div>
      </div>
    `;

    document.body.appendChild(chatRoot);

    chatRoot.addEventListener("click", (event) => {
      if (event.target === chatRoot) closeDirectChat();
    });
    chatRoot
      .querySelector("[data-gw-direct-chat-close]")
      ?.addEventListener("click", closeDirectChat);

    const container = chatRoot.querySelector("[data-gw-direct-chat-container]");
    window.GridWildChat?.mount?.(container, {
      roomType: "direct",
      roomId,
      title,
      placeholder: `Message ${firstName(titleName)}...`,
      signedOutMessage: "Sign in to use direct chat.",
      disabledMessage: "Direct chat is unavailable."
    });
  }

  function renderMessagesSectionHtml() {
    injectStyles();

    const conversations = state.conversations || [];
    return `
      <div class="gw-card" id="gwPlayerMessagesCard">
        <div class="gw-card-title">Messages</div>
        ${
          !isSignedIn()
            ? `<div class="gw-muted" style="font-size:12px;line-height:1.35;margin-top:8px;">
              Sign in with a GridWild account to use direct messages.
            </div>`
            : conversations.length
              ? conversations
                  .map((row) => {
                    const other =
                      row.other_player ||
                      (String(row.sender_player_id) === myPlayerId() ? row.recipient : row.sender);
                    const name = playerName(other);
                    return `
                  <div class="gw-direct-chat-row">
                    <div>
                      <div class="gw-direct-chat-row-title">${esc(name)}</div>
                      <div class="gw-direct-chat-row-meta">Private field chat</div>
                    </div>
                    <button class="gw-direct-chat-open" type="button" data-gw-direct-chat-room="${esc(row.room_id)}">
                      Open
                    </button>
                  </div>
                `;
                  })
                  .join("")
              : `<div class="gw-muted" style="font-size:12px;line-height:1.35;margin-top:8px;">
                Accepted private chats will appear here.
              </div>`
        }
      </div>
    `;
  }

  function bindMessagesSection(root = document) {
    root.querySelectorAll("[data-gw-direct-chat-room]").forEach((button) => {
      if (button.dataset.gwDirectChatBound === "true") return;
      button.dataset.gwDirectChatBound = "true";
      button.addEventListener("click", () => {
        openDirectChat(button.dataset.gwDirectChatRoom);
      });
    });
  }

  function updateMessagesSection() {
    const current = document.getElementById("gwPlayerMessagesCard");
    if (!current) return;

    current.outerHTML = renderMessagesSectionHtml();
    bindMessagesSection(document);
  }

  function setQuestAssignments(assignments = [], options = {}) {
    ensureLocalQuestState();
    const muted = new Set((state.mutedQuestAssignments || []).map(String));
    const base = options.replace === true ? [] : state.questAssignments || [];
    const byId = new Map(
      base
        .map(normalizeQuestAssignment)
        .filter(Boolean)
        .map((row) => [String(row.id), row])
    );

    (assignments || [])
      .map(normalizeQuestAssignment)
      .filter(Boolean)
      .forEach((row) => {
        if (muted.has(String(row.id))) return;
        byId.set(String(row.id), {
          ...byId.get(String(row.id)),
          ...row
        });
      });

    state.questAssignments = Array.from(byId.values())
      .sort((a, b) => questAssignmentTime(b) - questAssignmentTime(a))
      .slice(0, 30);
    saveQuestAssignments();
    renderHud();
    window.dispatchEvent(
      new CustomEvent("gwQuestAssignmentsChanged", {
        detail: { assignments: visibleQuestAssignments() }
      })
    );
    return visibleQuestAssignments();
  }

  function getQuestAssignments() {
    return visibleQuestAssignments();
  }

  async function refresh(options = {}) {
    if (refreshInFlight) return state;
    ensureLocalQuestState();
    const questAssignments = state.questAssignments || [];
    const mutedQuestAssignments = state.mutedQuestAssignments || [];

    if (!isOnlineGameplayReady() || !isSignedIn() || !window.GridWildAPI?.getPlayerInteractions) {
      state = {
        notifications: [],
        conversations: [],
        blocks: [],
        questAssignments,
        mutedQuestAssignments
      };
      renderHud();
      updateMessagesSection();
      window.dispatchEvent(new CustomEvent("gwPlayerInteractionsChanged", { detail: state }));
      return state;
    }

    refreshInFlight = true;
    try {
      const result = await window.GridWildAPI.getPlayerInteractions();
      state = {
        notifications: result?.notifications || [],
        conversations: result?.conversations || [],
        blocks: result?.blocks || [],
        questAssignments,
        mutedQuestAssignments
      };
      renderHud();
      updateMessagesSection();
      window.dispatchEvent(new CustomEvent("gwPlayerInteractionsChanged", { detail: state }));
    } catch (err) {
      if (!options.quiet) console.warn("Could not load player interactions:", err);
    } finally {
      refreshInFlight = false;
    }

    return state;
  }

  function startPolling() {
    injectStyles();
    renderHud();

    if (refreshTimer) return;
    refreshTimer = window.setInterval(() => refresh({ quiet: true }), POLL_INTERVAL_MS);
    refresh({ quiet: true });
  }

  function stopPolling() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  window.addEventListener("gwBootstrapReady", startPolling);
  window.addEventListener("gwAccountChanged", () => {
    state = {
      notifications: [],
      conversations: [],
      blocks: [],
      questAssignments: loadQuestAssignments(),
      mutedQuestAssignments: loadMutedQuestAssignments()
    };
    renderHud();
    updateMessagesSection();
    refresh({ quiet: true });
  });
  window.addEventListener("gwActivePartyChanged", () => {
    window.GridWildAvatarInspection?.refreshOpen?.();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && refreshTimer) refresh({ quiet: true });
  });

  window.GridWildPlayerInteractions = {
    bindAvatarActions,
    bindMessagesSection,
    closeDirectChat,
    getQuestAssignments,
    openDirectChat,
    refresh,
    renderAvatarActionsHtml,
    renderMessagesSectionHtml,
    removeQuestAssignment,
    setQuestAssignments,
    startPolling,
    stopPolling
  };
})();
