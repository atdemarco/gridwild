// -----------------------------------------------------------------------------
// GridWild Room Chat
// Reusable embedded chat UI. Party is the first supported room type.
// -----------------------------------------------------------------------------

(function () {
  const POLL_INTERVAL_MS = 5000;
  const controllers = new WeakMap();
  const attachmentSources = new Map();
  const attachmentMeta = {
    location: { label: "Location", hint: "Drop your current pin", icon: "&#8982;" },
    wildlist: { label: "Wildlist", hint: "Saved or prior party", icon: "W" },
    niche: { label: "Niche", hint: "Share a field niche", icon: "&#9671;" },
    identification: { label: "Identification", hint: "Share an ID item", icon: "ID" }
  };
  let mapLocationMarker = null;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function errorMessage(err, fallback = "Chat is unavailable.") {
    const raw = String(err?.message || err || "");

    try {
      const parsed = JSON.parse(raw);
      return parsed?.error || fallback;
    } catch {
      return raw || fallback;
    }
  }

  function formatMessageTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function cleanText(value, fallback = "") {
    return String(value || "").trim() || fallback;
  }

  function finiteNumber(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function registerAttachmentSource(source = {}) {
    const id = cleanText(source.id).toLowerCase();
    if (!id || typeof source.getItems !== "function") return false;
    attachmentSources.set(id, { ...source, id });
    return true;
  }

  function sharePayload(message) {
    if (message?.message_type !== "share") return null;

    const payload = message?.payload || {};
    const kind = cleanText(payload.kind).toLowerCase();
    if (!attachmentMeta[kind]) return null;

    return {
      kind,
      id: cleanText(payload.id),
      source: cleanText(payload.source),
      title: cleanText(payload.title, message?.body || attachmentMeta[kind].label),
      subtitle: cleanText(payload.subtitle),
      count: finiteNumber(payload.count),
      lat: finiteNumber(payload.lat),
      lng: finiteNumber(payload.lng)
    };
  }

  function injectStyles() {
    if (document.getElementById("gwChatStyles")) return;

    const style = document.createElement("style");
    style.id = "gwChatStyles";
    style.textContent = `
      .gw-chat-room {
        min-width: 0;
        margin-top: 14px;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid rgba(215,183,116,0.16);
        background: rgba(10,15,12,0.34);
      }

      .gw-chat-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 11px 8px;
        border-bottom: 1px solid rgba(215,183,116,0.10);
      }

      .gw-chat-title {
        color: #f0d18a;
        font-size: 11px;
        line-height: 1.2;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .gw-chat-status {
        min-width: 0;
        overflow: hidden;
        color: rgba(239,230,211,0.54);
        font-size: 10px;
        line-height: 1.2;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-status.is-error {
        color: #f0b6a9;
      }

      .gw-chat-messages {
        min-height: 92px;
        max-height: 220px;
        overflow-y: auto;
        padding: 8px 10px;
        overscroll-behavior: contain;
      }

      .gw-chat-empty {
        padding: 26px 10px;
        color: rgba(239,230,211,0.52);
        font-size: 11px;
        line-height: 1.4;
        text-align: center;
      }

      .gw-chat-message {
        min-width: 0;
        padding: 7px 0;
        border-bottom: 1px solid rgba(215,183,116,0.08);
      }

      .gw-chat-message:last-child {
        border-bottom: 0;
      }

      .gw-chat-message.is-mine {
        padding-left: 8px;
        border-left: 2px solid rgba(131,209,116,0.48);
      }

      .gw-chat-message-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        color: rgba(239,230,211,0.48);
        font-size: 9px;
        line-height: 1.2;
      }

      .gw-chat-sender {
        min-width: 0;
        overflow: hidden;
        color: rgba(240,209,138,0.84);
        font-size: 10px;
        font-weight: 900;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-body {
        margin-top: 3px;
        overflow-wrap: anywhere;
        color: #efe6d3;
        font-size: 12px;
        line-height: 1.35;
        text-align: left;
      }

      .gw-chat-location-chip,
      .gw-chat-attachment-chip {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 5px;
        padding: 8px 9px;
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.26);
        background: rgba(240,209,138,0.08);
        color: #fff2c8;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-chat-location-chip:hover,
      .gw-chat-location-chip:focus-visible,
      .gw-chat-attachment-chip:hover,
      .gw-chat-attachment-chip:focus-visible {
        border-color: rgba(240,209,138,0.55);
        background: rgba(240,209,138,0.14);
        outline: none;
      }

      .gw-chat-location-icon,
      .gw-chat-attachment-icon {
        flex: 0 0 auto;
        width: 25px;
        height: 25px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(0,0,0,0.22);
        font-size: 13px;
      }

      .gw-chat-location-copy,
      .gw-chat-attachment-copy {
        min-width: 0;
      }

      .gw-chat-location-label,
      .gw-chat-location-coords,
      .gw-chat-attachment-label,
      .gw-chat-attachment-subtitle {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-location-label,
      .gw-chat-attachment-label {
        font-size: 11px;
        font-weight: 900;
      }

      .gw-chat-location-coords,
      .gw-chat-attachment-subtitle {
        margin-top: 2px;
        color: rgba(239,230,211,0.56);
        font-size: 9px;
      }

      .gw-chat-composer {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) 34px;
        gap: 7px;
        padding: 9px;
        border-top: 1px solid rgba(215,183,116,0.10);
        background: rgba(0,0,0,0.12);
      }

      .gw-chat-input {
        width: 100%;
        min-width: 0;
        height: 34px;
        box-sizing: border-box;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.20);
        background: rgba(20,17,15,0.58);
        color: #efe6d3;
        font: inherit;
        font-size: 12px;
        outline: none;
      }

      .gw-chat-input:focus {
        border-color: rgba(240,209,138,0.56);
        box-shadow: 0 0 0 2px rgba(240,209,138,0.10);
      }

      .gw-chat-input::placeholder {
        color: rgba(239,230,211,0.40);
      }

      .gw-chat-icon-btn {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        padding: 0;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.24);
        background: rgba(255,255,255,0.05);
        color: #f0d18a;
        font: inherit;
        font-size: 18px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-chat-icon-btn[data-chat-send] {
        font-size: 14px;
      }

      .gw-chat-icon-btn:hover,
      .gw-chat-icon-btn:focus-visible {
        border-color: rgba(240,209,138,0.58);
        background: rgba(240,209,138,0.12);
        outline: none;
      }

      .gw-chat-icon-btn:disabled,
      .gw-chat-input:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .gw-chat-picker-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100120;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        box-sizing: border-box;
        padding: 12px;
        background: rgba(5,8,6,0.68);
      }

      .gw-chat-picker {
        width: min(440px, 100%);
        max-height: min(78vh, 620px);
        overflow: hidden;
        border: 1px solid rgba(240,209,138,0.32);
        border-radius: 8px;
        background: rgba(24,25,20,0.99);
        box-shadow: 0 18px 54px rgba(0,0,0,0.52);
        color: #efe6d3;
      }

      .gw-chat-picker-head {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) 36px;
        align-items: center;
        min-height: 48px;
        padding: 5px 8px;
        border-bottom: 1px solid rgba(215,183,116,0.14);
      }

      .gw-chat-picker-title {
        overflow: hidden;
        color: #f0d18a;
        font-size: 13px;
        font-weight: 950;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-picker-dismiss {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #f0d18a;
        font: inherit;
        font-size: 22px;
        cursor: pointer;
      }

      .gw-chat-picker-dismiss:hover,
      .gw-chat-picker-dismiss:focus-visible {
        background: rgba(240,209,138,0.10);
        outline: none;
      }

      .gw-chat-picker-content {
        max-height: calc(min(78vh, 620px) - 49px);
        overflow-y: auto;
        padding: 10px;
        overscroll-behavior: contain;
      }

      .gw-chat-source-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .gw-chat-source-btn {
        min-width: 0;
        min-height: 94px;
        display: grid;
        grid-template-rows: 34px auto auto;
        align-content: center;
        justify-items: center;
        gap: 4px;
        padding: 10px 7px;
        border: 1px solid rgba(215,183,116,0.20);
        border-radius: 8px;
        background: rgba(255,255,255,0.045);
        color: #efe6d3;
        font: inherit;
        cursor: pointer;
      }

      .gw-chat-source-btn:hover,
      .gw-chat-source-btn:focus-visible {
        border-color: rgba(240,209,138,0.54);
        background: rgba(240,209,138,0.10);
        outline: none;
      }

      .gw-chat-source-icon {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(240,209,138,0.12);
        color: #f0d18a;
        font-size: 14px;
        font-weight: 950;
      }

      .gw-chat-source-label {
        max-width: 100%;
        overflow: hidden;
        font-size: 12px;
        font-weight: 950;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-source-hint {
        max-width: 100%;
        overflow: hidden;
        color: rgba(239,230,211,0.54);
        font-size: 9px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-picker-list {
        display: grid;
        gap: 6px;
      }

      .gw-chat-picker-item {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        gap: 9px;
        padding: 9px;
        border: 1px solid rgba(215,183,116,0.16);
        border-radius: 8px;
        background: rgba(255,255,255,0.035);
        color: #efe6d3;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-chat-picker-item:hover,
      .gw-chat-picker-item:focus-visible {
        border-color: rgba(240,209,138,0.48);
        background: rgba(240,209,138,0.09);
        outline: none;
      }

      .gw-chat-picker-item-copy {
        min-width: 0;
      }

      .gw-chat-picker-item-title,
      .gw-chat-picker-item-subtitle {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-chat-picker-item-title {
        font-size: 11px;
        font-weight: 950;
      }

      .gw-chat-picker-item-subtitle {
        margin-top: 2px;
        color: rgba(239,230,211,0.55);
        font-size: 9px;
      }

      .gw-chat-picker-empty {
        padding: 28px 12px;
        color: rgba(239,230,211,0.58);
        font-size: 11px;
        line-height: 1.45;
        text-align: center;
      }

      @media (max-width: 600px) {
        .gw-chat-messages {
          max-height: 190px;
        }

        .gw-chat-composer {
          grid-template-columns: 38px minmax(0, 1fr) 38px;
        }

        .gw-chat-icon-btn {
          width: 38px;
        }

        .gw-chat-picker-backdrop {
          padding: 0;
        }

        .gw-chat-picker {
          width: 100%;
          border-right: 0;
          border-bottom: 0;
          border-left: 0;
          border-radius: 8px 8px 0 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function locationPayload(message) {
    if (message?.payload?.lat == null || message?.payload?.lng == null) return null;

    const lat = Number(message?.payload?.lat);
    const lng = Number(message?.payload?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      accuracyMeters: Number(message?.payload?.accuracy_meters)
    };
  }

  function renderMessage(message, myPlayerId) {
    const senderName = message?.sender?.display_name || "Explorer";
    const mine = String(message?.sender_player_id || "") === String(myPlayerId || "");
    const location = message?.message_type === "location" ? locationPayload(message) : null;
    const shared = sharePayload(message);
    const sharedMeta = shared ? attachmentMeta[shared.kind] : null;
    const sharedSubtitle = shared
      ? shared.subtitle || (shared.count != null ? `${shared.count} items` : sharedMeta.hint)
      : "";

    return `
      <div class="gw-chat-message${mine ? " is-mine" : ""}">
        <div class="gw-chat-message-meta">
          <span class="gw-chat-sender">${esc(senderName)}</span>
          <span>${esc(formatMessageTime(message?.created_at))}</span>
        </div>
        ${
          location
            ? `
              <button
                class="gw-chat-location-chip"
                type="button"
                data-chat-location-open
                data-lat="${location.lat}"
                data-lng="${location.lng}"
                data-label="${esc(message?.body || "Shared location")}"
              >
                <span class="gw-chat-location-icon">&#8982;</span>
                <span class="gw-chat-location-copy">
                  <span class="gw-chat-location-label">${esc(message?.body || "Shared location")}</span>
                  <span class="gw-chat-location-coords">${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}</span>
                </span>
              </button>
            `
            : shared
              ? `
                <button
                  class="gw-chat-attachment-chip"
                  type="button"
                  data-chat-attachment-open
                  data-kind="${esc(shared.kind)}"
                  data-id="${esc(shared.id)}"
                  data-source="${esc(shared.source)}"
                  data-title="${esc(shared.title)}"
                  data-subtitle="${esc(sharedSubtitle)}"
                  data-lat="${shared.lat ?? ""}"
                  data-lng="${shared.lng ?? ""}"
                >
                  <span class="gw-chat-attachment-icon">${sharedMeta.icon}</span>
                  <span class="gw-chat-attachment-copy">
                    <span class="gw-chat-attachment-label">${esc(shared.title)}</span>
                    <span class="gw-chat-attachment-subtitle">${esc(sharedSubtitle)}</span>
                  </span>
                </button>
              `
              : `<div class="gw-chat-body">${esc(message?.body || "")}</div>`
        }
      </div>
    `;
  }

  function renderShell(options) {
    const canRead = options.canRead !== false;
    const canSend = options.canSend !== false;
    const disabledMessage = options.disabledMessage || "Join this room to use chat.";
    const placeholder = options.placeholder || "Message party...";

    return `
      <section class="gw-chat-room" aria-label="${esc(options.title || "Chat")}">
        <div class="gw-chat-head">
          <div class="gw-chat-title">${esc(options.title || "Chat")}</div>
          <div class="gw-chat-status" data-chat-status>${canRead ? "Connecting..." : esc(disabledMessage)}</div>
        </div>
        <div class="gw-chat-messages" data-chat-messages aria-live="polite">
          <div class="gw-chat-empty">${canRead ? "Loading messages..." : esc(disabledMessage)}</div>
        </div>
        <form class="gw-chat-composer" data-chat-composer>
          <button class="gw-chat-icon-btn" type="button" data-chat-attachment title="Add to chat" aria-label="Add to chat"${canSend ? "" : " disabled"}>+</button>
          <input class="gw-chat-input" data-chat-input maxlength="500" autocomplete="off" placeholder="${canSend ? esc(placeholder) : esc(disabledMessage)}"${canSend ? "" : " disabled"}>
          <button class="gw-chat-icon-btn" type="submit" data-chat-send title="Send chat message" aria-label="Send chat message"${canSend ? "" : " disabled"}>&#9654;</button>
        </form>
      </section>
    `;
  }

  function setStatus(controller, text = "", isError = false) {
    const status = controller.container.querySelector("[data-chat-status]");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  }

  function openSharedAttachment(controller, detail = {}) {
    const localWildlist =
      detail.kind === "wildlist" && detail.source !== "party"
        ? window.GridWildPlaylists?.getById?.(detail.id)
        : null;
    const localNiche =
      detail.kind === "niche"
        ? (window.GridWildLocalNiches?.getNiches?.() || []).find(
            (niche) => String(niche?.id || niche?.source_key || "") === String(detail.id || "")
          )
        : null;
    const opensAppView = Boolean(
      (detail.kind === "wildlist" && detail.source === "party" && detail.id) ||
      localWildlist ||
      localNiche ||
      (detail.kind === "niche" && detail.lat != null && detail.lng != null)
    );
    if (opensAppView) controller.options.onAttachmentOpen?.(detail);
    window.dispatchEvent(new CustomEvent("gwChatAttachmentSelected", { detail }));

    window.setTimeout(async () => {
      if (detail.kind === "wildlist" && detail.source === "party" && detail.id) {
        await window.GridWildParty?.hydratePartySnapshot?.(detail.id);
        window.GridWildParty?.openPartyRecap?.(detail.id);
        return;
      }

      if (localWildlist) {
        window.GridWildPlaylists?.openViewer?.(localWildlist.id);
        return;
      }

      if (localNiche) {
        window.GridWildLocalNiches?.openNicheDetail?.(localNiche.id || localNiche.source_key);
        return;
      }

      if (detail.kind === "niche" && detail.lat != null && detail.lng != null) {
        focusLocation({ ...detail, label: detail.title || "Shared niche" });
        return;
      }

      if (detail.kind === "wildlist" && typeof window.showGridWildToast === "function") {
        window.showGridWildToast("This Wildlist is shared as a chat summary.");
      }
    }, 0);
  }

  function bindMessageAttachments(controller) {
    controller.container.querySelectorAll("[data-chat-location-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const detail = {
          lat: Number(button.dataset.lat),
          lng: Number(button.dataset.lng),
          label: button.dataset.label || "Shared location"
        };

        focusLocation(detail);
        controller.options.onLocationOpen?.(detail);
      });
    });

    controller.container.querySelectorAll("[data-chat-attachment-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const detail = {
          kind: button.dataset.kind || "",
          id: button.dataset.id || "",
          source: button.dataset.source || "",
          title: button.dataset.title || "",
          subtitle: button.dataset.subtitle || "",
          lat: finiteNumber(button.dataset.lat),
          lng: finiteNumber(button.dataset.lng)
        };

        openSharedAttachment(controller, detail);
      });
    });
  }

  function renderMessages(controller, messages) {
    const list = controller.container.querySelector("[data-chat-messages]");
    if (!list) return;

    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    const previousCount = controller.messages.length;
    controller.messages = Array.isArray(messages) ? messages : [];

    list.innerHTML = controller.messages.length
      ? controller.messages.map((message) => renderMessage(message, controller.myPlayerId)).join("")
      : `<div class="gw-chat-empty">No messages yet. Start the field conversation.</div>`;

    bindMessageAttachments(controller);
    if (nearBottom || controller.messages.length > previousCount) {
      list.scrollTop = list.scrollHeight;
    }
  }

  async function refresh(controller, options = {}) {
    if (!controller?.container?.isConnected || !controller.options.canRead) return false;
    if (controller.loading) return false;

    controller.loading = true;
    if (!options.quiet) setStatus(controller, "Refreshing...");

    try {
      const result = await window.GridWildAPI.getChatMessages(
        controller.options.roomType,
        controller.options.roomId,
        { limit: controller.options.limit || 60 }
      );

      renderMessages(controller, result?.messages || []);
      setStatus(controller, "Live");
      return true;
    } catch (err) {
      console.warn("Could not load chat room:", err);
      setStatus(controller, errorMessage(err), true);
      return false;
    } finally {
      controller.loading = false;
    }
  }

  async function send(controller, message) {
    if (controller.sending || !controller.options.canSend) return false;
    controller.sending = true;
    setStatus(controller, "Sending...");
    setComposerDisabled(controller, true);

    try {
      const result = await window.GridWildAPI.sendChatMessage(
        controller.options.roomType,
        controller.options.roomId,
        message
      );
      if (result?.message) {
        renderMessages(controller, [
          ...controller.messages.filter((row) => row.id !== result.message.id),
          result.message
        ]);
      }
      await refresh(controller, { quiet: true });
      setStatus(controller, "Sent");
      return true;
    } catch (err) {
      console.warn("Could not send chat message:", err);
      setStatus(controller, errorMessage(err, "Could not send message."), true);
      return false;
    } finally {
      controller.sending = false;
      setComposerDisabled(controller, false);
    }
  }

  function setComposerDisabled(controller, disabled) {
    controller.container
      .querySelectorAll("[data-chat-input], [data-chat-attachment], [data-chat-send]")
      .forEach((el) => {
        el.disabled = disabled || !controller.options.canSend;
      });
  }

  function latestLocation() {
    const location = window.__gwLastUserLocation || {};
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      accuracyMeters: Number(location.accuracyMeters)
    };
  }

  function requestLocation() {
    const latest = latestLocation();
    if (latest) return Promise.resolve(latest);

    if (!navigator.geolocation) {
      return Promise.reject(new Error("Current location is unavailable."));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy
          }),
        () => reject(new Error("Could not get your current location.")),
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 15000
        }
      );
    });
  }

  async function sendLocation(controller) {
    if (controller.sending || !controller.options.canSend) return;
    setStatus(controller, "Getting location...");

    try {
      const location = await requestLocation();
      const input = controller.container.querySelector("[data-chat-input]");
      const label = String(input?.value || "").trim() || "Shared location";
      const sent = await send(controller, {
        message_type: "location",
        body: label,
        payload: {
          lat: location.lat,
          lng: location.lng,
          accuracy_meters: Number.isFinite(location.accuracyMeters) ? location.accuracyMeters : null
        }
      });

      if (sent && input) input.value = "";
    } catch (err) {
      setStatus(controller, errorMessage(err, "Could not share location."), true);
    }
  }

  function getWildlistAttachmentItems() {
    const saved = window.GridWildPlaylists?.loadAll?.() || [];
    const savedItems = saved.map((wildlist) => {
      const count = Array.isArray(wildlist.snapshotObservations)
        ? wildlist.snapshotObservations.length
        : Array.isArray(wildlist.observationIds)
          ? wildlist.observationIds.length
          : 0;
      const type = wildlist.mode === "custom" ? "Ad hoc Wildlist" : "Saved Wildlist";

      return {
        id: wildlist.id,
        source: "wildlist",
        title: cleanText(wildlist.title, "Untitled Wildlist"),
        subtitle: `${type} - ${count} observation${count === 1 ? "" : "s"}`,
        count
      };
    });

    const history = Array.isArray(window.__gwState?.partyHistory)
      ? window.__gwState.partyHistory
      : [];
    const partyItems = history
      .filter((party) => party?.id && (party.status === "ended" || party.ended_at || party.endedAt))
      .map((party) => {
        const snapshot = window.__gwState?.partySnapshotsById?.[party.id] || {};
        const count = Array.isArray(snapshot.evidence)
          ? snapshot.evidence.length
          : finiteNumber(party.progress) || 0;
        return {
          id: party.id,
          source: "party",
          title: cleanText(party.name || party.title, "Prior party"),
          subtitle: `Prior party - ${count} observation${count === 1 ? "" : "s"}`,
          count
        };
      });

    return [...savedItems, ...partyItems];
  }

  function getNicheAttachmentItems() {
    const niches = window.GridWildLocalNiches?.getNiches?.() || [];
    const seen = new Set();

    return niches
      .map((niche) => {
        const id = cleanText(niche?.id || niche?.source_key);
        if (!id || seen.has(id)) return null;
        seen.add(id);

        const place = cleanText(niche?.primary_place_label || niche?.place_context?.primary_label);
        const theme = cleanText(niche?.theme, "Local niche");
        return {
          id,
          source: "niche",
          title: cleanText(niche?.short_title || niche?.title, "Local niche"),
          subtitle: place ? `${theme} - ${place}` : theme,
          lat: finiteNumber(niche?.centroid_lat),
          lng: finiteNumber(niche?.centroid_lng)
        };
      })
      .filter(Boolean);
  }

  function getIdentificationAttachmentItems() {
    const claims =
      window.GridWildIdentificationEvidence?.loadClaims?.() ||
      window.__gwState?.identificationClaims ||
      [];
    const seen = new Set();

    return claims
      .map((claim) => {
        const id = cleanText(
          claim?.id || claim?.serverId || claim?.observationId || claim?.observation_id
        );
        if (!id || seen.has(id)) return null;
        seen.add(id);

        const confidence = cleanText(claim?.confidence);
        const status = cleanText(claim?.status);
        return {
          id,
          source: "identification",
          title: cleanText(
            claim?.taxonCommonName ||
              claim?.taxon_common_name ||
              claim?.taxonName ||
              claim?.taxon_name,
            "Identification item"
          ),
          subtitle: ["Identification", confidence, status].filter(Boolean).join(" - ")
        };
      })
      .filter(Boolean);
  }

  function closeAttachmentPicker(controller) {
    controller?.picker?.remove?.();
    if (controller) controller.picker = null;
  }

  function pickerMeta(source) {
    return {
      ...(attachmentMeta[source.id] || {}),
      ...source
    };
  }

  function renderAttachmentSourceGrid(controller) {
    const picker = controller.picker;
    if (!picker) return;

    const sources = [...attachmentSources.values()];
    picker.innerHTML = `
      <section class="gw-chat-picker" role="dialog" aria-modal="true" aria-label="Add to chat">
        <div class="gw-chat-picker-head">
          <span></span>
          <div class="gw-chat-picker-title">Add to chat</div>
          <button class="gw-chat-picker-dismiss" type="button" data-chat-picker-close title="Close" aria-label="Close">&times;</button>
        </div>
        <div class="gw-chat-picker-content">
          <div class="gw-chat-source-grid">
            ${sources
              .map((source) => {
                const meta = pickerMeta(source);
                return `
                <button class="gw-chat-source-btn" type="button" data-chat-source="${esc(source.id)}">
                  <span class="gw-chat-source-icon">${meta.icon || "+"}</span>
                  <span class="gw-chat-source-label">${esc(meta.label || source.id)}</span>
                  <span class="gw-chat-source-hint">${esc(meta.hint || "Share item")}</span>
                </button>
              `;
              })
              .join("")}
          </div>
        </div>
      </section>
    `;

    picker.querySelector("[data-chat-picker-close]")?.addEventListener("click", () => {
      closeAttachmentPicker(controller);
    });
    picker.querySelectorAll("[data-chat-source]").forEach((button) => {
      button.addEventListener("click", async () => {
        const source = attachmentSources.get(button.dataset.chatSource);
        if (!source) return;

        if (source.immediate && typeof source.select === "function") {
          closeAttachmentPicker(controller);
          await source.select(controller);
          return;
        }

        await renderAttachmentItems(controller, source);
      });
    });
  }

  async function renderAttachmentItems(controller, source) {
    const picker = controller.picker;
    if (!picker) return;
    const meta = pickerMeta(source);

    picker.innerHTML = `
      <section class="gw-chat-picker" role="dialog" aria-modal="true" aria-label="${esc(meta.label || source.id)}">
        <div class="gw-chat-picker-head">
          <button class="gw-chat-picker-dismiss" type="button" data-chat-picker-back title="Back" aria-label="Back">&#8249;</button>
          <div class="gw-chat-picker-title">${esc(meta.label || source.id)}</div>
          <button class="gw-chat-picker-dismiss" type="button" data-chat-picker-close title="Close" aria-label="Close">&times;</button>
        </div>
        <div class="gw-chat-picker-content" data-chat-picker-content>
          <div class="gw-chat-picker-empty">Loading...</div>
        </div>
      </section>
    `;

    picker.querySelector("[data-chat-picker-back]")?.addEventListener("click", () => {
      renderAttachmentSourceGrid(controller);
    });
    picker.querySelector("[data-chat-picker-close]")?.addEventListener("click", () => {
      closeAttachmentPicker(controller);
    });

    let items = [];
    try {
      items = await source.getItems(controller);
    } catch (err) {
      console.warn(`Could not load ${source.id} chat attachments:`, err);
    }

    if (controller.picker !== picker) return;
    const content = picker.querySelector("[data-chat-picker-content]");
    if (!content) return;

    if (!Array.isArray(items) || !items.length) {
      content.innerHTML = `<div class="gw-chat-picker-empty">${esc(source.emptyMessage || `No ${meta.label || source.id} items are available yet.`)}</div>`;
      return;
    }

    content.innerHTML = `
      <div class="gw-chat-picker-list">
        ${items
          .map(
            (item, index) => `
          <button class="gw-chat-picker-item" type="button" data-chat-item="${index}">
            <span class="gw-chat-source-icon">${meta.icon || "+"}</span>
            <span class="gw-chat-picker-item-copy">
              <span class="gw-chat-picker-item-title">${esc(item.title || meta.label || source.id)}</span>
              <span class="gw-chat-picker-item-subtitle">${esc(item.subtitle || meta.hint || "Share item")}</span>
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    content.querySelectorAll("[data-chat-item]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = items[Number(button.dataset.chatItem)];
        if (!item) return;

        const message =
          typeof source.toMessage === "function"
            ? source.toMessage(item, controller)
            : {
                message_type: "share",
                body: cleanText(item.title, meta.label || "Shared item"),
                payload: {
                  kind: source.kind || source.id,
                  id: cleanText(item.id) || null,
                  source: cleanText(item.source || source.id) || null,
                  title: cleanText(item.title, meta.label || "Shared item"),
                  subtitle: cleanText(item.subtitle) || null,
                  count: finiteNumber(item.count),
                  lat: finiteNumber(item.lat),
                  lng: finiteNumber(item.lng)
                }
              };

        if (await send(controller, message)) {
          closeAttachmentPicker(controller);
        }
      });
    });
  }

  function openAttachmentPicker(controller) {
    if (!controller?.options?.canSend || controller.sending) return;
    closeAttachmentPicker(controller);

    const picker = document.createElement("div");
    picker.className = "gw-chat-picker-backdrop";
    picker.addEventListener("click", (event) => {
      if (event.target === picker) closeAttachmentPicker(controller);
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAttachmentPicker(controller);
    });

    controller.picker = picker;
    document.body.appendChild(picker);
    renderAttachmentSourceGrid(controller);
    picker.querySelector("[data-chat-picker-close]")?.focus();
  }

  function focusLocation(detail = {}) {
    const lat = Number(detail.lat);
    const lng = Number(detail.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const mapInstance = window.map;
    const leaflet = window.L;

    if (mapInstance && leaflet) {
      if (mapLocationMarker) mapInstance.removeLayer(mapLocationMarker);

      mapLocationMarker = leaflet
        .circleMarker([lat, lng], {
          radius: 10,
          color: "#fff2c8",
          weight: 3,
          fillColor: "#ef9d47",
          fillOpacity: 0.92
        })
        .addTo(mapInstance)
        .bindPopup(
          `<strong>${esc(detail.label || "Shared location")}</strong><br>${lat.toFixed(5)}, ${lng.toFixed(5)}`
        );

      mapInstance.flyTo([lat, lng], Math.max(mapInstance.getZoom(), 18), { duration: 0.55 });
      mapLocationMarker.openPopup();
    }

    window.dispatchEvent(
      new CustomEvent("gwChatLocationSelected", { detail: { ...detail, lat, lng } })
    );
    return true;
  }

  function bindComposer(controller) {
    const form = controller.container.querySelector("[data-chat-composer]");
    const input = controller.container.querySelector("[data-chat-input]");

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = String(input?.value || "").trim();
      if (!body) {
        input?.focus();
        return;
      }

      const sent = await send(controller, {
        message_type: "text",
        body
      });
      if (sent && input) {
        input.value = "";
        input.focus();
      }
    });

    controller.container.querySelector("[data-chat-attachment]")?.addEventListener("click", () => {
      openAttachmentPicker(controller);
    });
  }

  registerAttachmentSource({
    id: "location",
    immediate: true,
    getItems: () => [],
    select: sendLocation
  });

  registerAttachmentSource({
    id: "wildlist",
    getItems: getWildlistAttachmentItems,
    emptyMessage: "No saved Wildlists or prior parties are available yet."
  });

  registerAttachmentSource({
    id: "niche",
    getItems: getNicheAttachmentItems,
    emptyMessage: "No niches are available near you yet."
  });

  registerAttachmentSource({
    id: "identification",
    getItems: getIdentificationAttachmentItems,
    emptyMessage: "No identification items are available yet."
  });

  function mount(container, options = {}) {
    if (!container) return null;
    destroy(container);
    injectStyles();

    const signedIn = Boolean(window.GridWildAPI?.getSessionToken?.());
    const canRead = options.canRead !== false && signedIn;
    const canSend = options.canSend !== false && canRead;
    const disabledMessage = !signedIn
      ? options.signedOutMessage || "Sign in to use party chat."
      : options.disabledMessage || "Join this party to use chat.";

    const normalizedOptions = {
      ...options,
      canRead,
      canSend,
      disabledMessage
    };

    container.innerHTML = renderShell(normalizedOptions);

    const controller = {
      container,
      options: normalizedOptions,
      myPlayerId: window.GridWildAPI?.getPlayerId?.() || "",
      messages: [],
      loading: false,
      sending: false,
      pollTimer: null,
      picker: null
    };

    controllers.set(container, controller);
    bindComposer(controller);

    if (canRead) {
      refresh(controller);
      controller.pollTimer = window.setInterval(() => {
        if (!container.isConnected) {
          destroy(container);
          return;
        }
        refresh(controller, { quiet: true });
      }, POLL_INTERVAL_MS);
    }

    return controller;
  }

  function destroy(container) {
    const controller = controllers.get(container);
    if (!controller) return;

    window.clearInterval(controller.pollTimer);
    closeAttachmentPicker(controller);
    controllers.delete(container);
  }

  window.GridWildChat = {
    mount,
    destroy,
    focusLocation,
    openAttachmentPicker,
    registerAttachmentSource
  };
})();
