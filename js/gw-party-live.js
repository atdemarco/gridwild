// -----------------------------------------------------------------------------
// GridWild Party Live Data Bridge
// -----------------------------------------------------------------------------

(function () {
  const PARTY_POLL_INTERVAL_MS = 15000;
  const PARTY_COVER_POLL_INTERVAL_MS = 15000;
  const NEARBY_PARTIES_REFRESH_MS = 30000;
  const PARTY_HISTORY_REFRESH_MS = 60000;

  let loadPartyInFlight = null;
  let loadPartyInFlightKey = null;
  let lastNearbyPartiesLoadedAt = 0;
  let lastPartyHistoryLoadedAt = 0;

  function getActivePartyId() {
    window.__gwState = window.__gwState || {};

    if ("activePartyId" in window.__gwState) {
      return window.__gwState.activePartyId || null;
    }

    return window.__gwState.party?.id || null;
  }

  function isOptimisticPartyId(id) {
    return String(id || "").startsWith("pending_party_");
  }

  function playerId() {
    return window.GridWildAPI?.getPlayerId?.() || window.__gwState?.player?.id || null;
  }

  function playerDisplayName() {
    return window.__gwState?.player?.display_name || window.__gwUser?.username || "You";
  }

  function isOnlineGameplayReady() {
    return window.GridWildOnline?.isReady?.() === true || window.__gwState?.bootstrapReady === true;
  }

  function currentPartySnapshot() {
    return {
      party: window.__gwState?.party || null,
      members: window.__gwState?.partyMembers || [],
      events: window.__gwState?.partyEvents || [],
      evidence: window.__gwState?.partyEvidence || []
    };
  }

  function dispatchActivePartyChanged(id, extra = {}) {
    window.dispatchEvent(
      new CustomEvent("gwActivePartyChanged", {
        detail: { id: id || null, ...extra }
      })
    );
  }

  function setActivePartyId(id) {
    window.__gwState = window.__gwState || {};
    window.__gwState.activePartyId = id || null;

    if (!id) {
      window.__gwState.party = null;
      window.__gwState.partyMembers = [];
      window.__gwState.partyEvents = [];
      window.__gwState.partyEvidence = [];
      window.__gwState.partyProgress = 0;
      window.__gwState.partyRoute = [];
      window.__gwState.partyRoutePartyId = null;
    }

    if (isOnlineGameplayReady()) {
      window.GridWildAPI?.setActiveParty?.(id || null).catch((err) => {
        if (!window.GridWildOnline?.isUnavailableError?.(err)) {
          console.warn("Could not sync active party state:", err);
        }
      });
    }

    dispatchActivePartyChanged(window.__gwState.activePartyId);
  }

  function applyOptimisticParty(form = {}) {
    window.__gwState = window.__gwState || {};

    const id = `pending_party_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    const name = form.title || form.name || "Field Party";
    const currentPlayerId = playerId();
    const currentPlayerName = playerDisplayName();
    const durationMinutes = Number(form.durationMinutes || 60);
    const target = Number(form.target || 10);
    const lat = Number(form.resolvedLocation?.lat);
    const lng = Number(form.resolvedLocation?.lng);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

    const party = {
      id,
      name,
      title: name,
      status: "starting",
      visibility: form.visibility || "public",
      created_by: currentPlayerId,
      created_at: now,
      starts_at: now,
      duration_minutes: Number.isFinite(durationMinutes) ? durationMinutes : 60,
      target: Number.isFinite(target) ? target : 10,
      member_count: 1,
      linked_quest_id: form.linkedQuestId || null,
      linked_quest_title: form.linkedQuestTitle || "",
      location_mode: form.locationMode || "anywhere",
      location_user_id: form.locationUserId || null,
      location_label: form.locationLabel || form.resolvedLocation?.label || null,
      location_config: {
        locationMode: form.locationMode || "anywhere",
        locationUserId: form.locationUserId || null,
        location: form.location || null,
        resolvedLocation: form.resolvedLocation || null
      },
      lat: hasLocation ? lat : null,
      lng: hasLocation ? lng : null,
      pending: true,
      _optimistic: true
    };

    window.__gwState.activePartyId = id;
    window.__gwState.party = party;
    window.__gwState.partyMembers = [
      {
        id: `${id}_member_self`,
        party_id: id,
        player_id: currentPlayerId,
        role: "leader",
        joined_at: now,
        _optimistic: true,
        players: {
          id: currentPlayerId,
          display_name: currentPlayerName,
          wildpoints: window.__gwState?.player?.wildpoints || 0
        }
      }
    ];
    window.__gwState.partyEvents = [
      {
        id: `${id}_event_starting`,
        party_id: id,
        player_id: currentPlayerId,
        event_type: "party_created",
        payload: { optimistic: true },
        created_at: now,
        _optimistic: true
      }
    ];
    window.__gwState.partyEvidence = [];
    window.__gwState.partyProgress = 0;
    window.__gwState.partyRoute = hasLocation
      ? [
          {
            id: `${id}_route_start`,
            party_id: id,
            player_id: currentPlayerId,
            lat,
            lng,
            accuracy_meters: Number.isFinite(Number(form.resolvedLocation?.accuracyMeters))
              ? Number(form.resolvedLocation.accuracyMeters)
              : null,
            created_at: now,
            _optimistic: true
          }
        ]
      : [];
    window.__gwState.partyRoutePartyId = id;

    dispatchActivePartyChanged(id, { optimistic: true, party });
    window.dispatchEvent(new CustomEvent("gwPartiesChanged", { detail: { optimistic: true } }));
    window.GridWildParty?.scheduleActivePartyHudRender?.();
    window.GridWildParty?.refreshMapBeacon?.();
    refreshPartySheet();

    return { id, party };
  }

  function clearOptimisticParty(id) {
    if (!id || !isOptimisticPartyId(id)) return;
    if (String(getActivePartyId() || "") !== String(id)) return;

    window.__gwState = window.__gwState || {};
    window.__gwState.activePartyId = null;
    window.__gwState.party = null;
    window.__gwState.partyMembers = [];
    window.__gwState.partyEvents = [];
    window.__gwState.partyEvidence = [];
    window.__gwState.partyProgress = 0;
    window.__gwState.partyRoute = [];
    window.__gwState.partyRoutePartyId = null;

    dispatchActivePartyChanged(null, { optimisticCleared: true });
    window.dispatchEvent(
      new CustomEvent("gwPartiesChanged", { detail: { optimisticCleared: true } })
    );
    window.GridWildParty?.scheduleActivePartyHudRender?.();
    window.GridWildParty?.refreshMapBeacon?.();
    refreshPartySheet();
  }

  function promoteOptimisticParty(optimisticId, dbParty) {
    if (!optimisticId || !isOptimisticPartyId(optimisticId) || !dbParty?.id) return;
    if (String(getActivePartyId() || "") !== String(optimisticId)) return;

    window.__gwState = window.__gwState || {};
    const previousParty = window.__gwState.party || {};

    window.__gwState.party = {
      ...previousParty,
      ...dbParty,
      id: dbParty.id,
      name: dbParty.name || previousParty.name || previousParty.title || "Field Party",
      title: dbParty.name || previousParty.title || previousParty.name || "Field Party",
      location_config: dbParty.location_config || previousParty.location_config || null,
      location_mode: dbParty.location_mode || previousParty.location_mode || "anywhere",
      location_label: dbParty.location_label || previousParty.location_label || null,
      lat: dbParty.lat ?? previousParty.lat ?? null,
      lng: dbParty.lng ?? previousParty.lng ?? null,
      pending: false,
      _optimistic: false
    };

    window.__gwState.partyMembers = (window.__gwState.partyMembers || []).map((row) => ({
      ...row,
      party_id: dbParty.id,
      _optimistic: false
    }));
    window.__gwState.partyEvents = (window.__gwState.partyEvents || []).map((row) => ({
      ...row,
      party_id: dbParty.id,
      _optimistic: false
    }));
    window.__gwState.partyRoute = (window.__gwState.partyRoute || []).map((row) => ({
      ...row,
      party_id: dbParty.id,
      _optimistic: false
    }));
    window.__gwState.partyRoutePartyId = dbParty.id;
  }

  async function loadParty(options = {}) {
    const loadKey = `${getActivePartyId() || ""}:${options.forceNearby ? "nearby" : "normal"}`;

    if (loadPartyInFlight && loadPartyInFlightKey === loadKey) {
      return loadPartyInFlight;
    }

    const promise = loadPartyNow(options).finally(() => {
      if (loadPartyInFlight === promise) {
        loadPartyInFlight = null;
        loadPartyInFlightKey = null;
      }
    });

    loadPartyInFlight = promise;
    loadPartyInFlightKey = loadKey;

    return loadPartyInFlight;
  }

  async function loadPartyNow(options = {}) {
    try {
      const activeId = getActivePartyId();
      if (isOptimisticPartyId(activeId)) {
        return currentPartySnapshot();
      }

      if (!isOnlineGameplayReady()) {
        return currentPartySnapshot();
      }

      const data = await window.GridWildAPI.getParty(activeId || null);
      const now = Date.now();
      const shouldRefreshNearby =
        options.forceNearby ||
        !lastNearbyPartiesLoadedAt ||
        now - lastNearbyPartiesLoadedAt >= NEARBY_PARTIES_REFRESH_MS;
      let partyEndedDuringLoad = false;
      let party = data?.party || null;

      const currentActiveId = getActivePartyId();
      if (activeId && String(currentActiveId || "") !== String(activeId)) {
        return data;
      }

      if (!activeId && currentActiveId) {
        return data;
      }

      if (activeId && (!party || party.status === "ended")) {
        partyEndedDuringLoad = party?.status === "ended";
        setActivePartyId(null);
        party = null;
      }

      window.__gwState = window.__gwState || {};
      const partyId = party?.id || null;
      const rowBelongsToParty = (row) =>
        partyId && String(row?.party_id || row?.partyId || "") === String(partyId);
      const scopedMembers = partyId ? (data.members || []).filter(rowBelongsToParty) : [];
      const scopedEvents = partyId ? (data.events || []).filter(rowBelongsToParty) : [];
      const scopedEvidence = partyId ? (data.evidence || []).filter(rowBelongsToParty) : [];

      window.__gwState.party = party;
      window.__gwState.partyMembers = scopedMembers;
      window.__gwState.partyEvents = scopedEvents;
      window.__gwState.partyEvidence = scopedEvidence;
      window.__gwState.partyProgress = scopedEvidence.filter(
        (row) => row?.status !== "excluded"
      ).length;

      window.__gwState.partyRoute = [];
      window.__gwState.partyRoutePartyId = partyId;

      if (partyId) {
        try {
          const routeData = await window.GridWildAPI.getPartyRoute(partyId);
          window.__gwState.partyRoute = (routeData.route || []).filter(
            (row) => !row?.party_id || String(row.party_id) === String(partyId)
          );
        } catch (err) {
          console.warn("Could not load party route:", err);
          window.__gwState.partyRoute = [];
        }
      }

      if (party?.id && !getActivePartyId()) {
        setActivePartyId(party.id);
      }

      if (shouldRefreshNearby) {
        try {
          const nearby = await window.GridWildAPI.getNearbyParties();
          window.__gwState.nearbyParties = nearby.parties || [];
          lastNearbyPartiesLoadedAt = Date.now();
        } catch (err) {
          console.warn("Could not load nearby parties:", err);
          window.__gwState.nearbyParties = [];
          lastNearbyPartiesLoadedAt = Date.now();
        }
      }

      const shouldRefreshHistory =
        options.forceHistory ||
        partyEndedDuringLoad ||
        !lastPartyHistoryLoadedAt ||
        now - lastPartyHistoryLoadedAt >= PARTY_HISTORY_REFRESH_MS;

      if (shouldRefreshHistory)
        try {
          const history = await window.GridWildAPI?.getPartyHistory?.(25);
          window.__gwState.partyHistory = history?.parties || [];
          lastPartyHistoryLoadedAt = Date.now();
        } catch (err) {
          console.warn("Could not load party history:", err);
          window.__gwState.partyHistory = window.__gwState.partyHistory || [];
        }

      window.dispatchEvent(new CustomEvent("gwPartiesChanged"));

      return data;
    } catch (err) {
      if (
        !window.GridWildOnline?.isUnavailableError?.(err) &&
        !/GridWild login expired on this device/i.test(err?.message || "")
      ) {
        console.error("Failed to load party:", err);
      }
      return null;
    }
  }

  function renderPartyHtml() {
    const party = window.__gwState?.party;
    const members = window.__gwState?.partyMembers || [];

    if (!party) {
      return `
        <div class="gw-card">
          <div class="gw-card-title">Party</div>
          <div class="gw-muted">You are not in a party.</div>
          <button class="gw-mini-btn" id="gwCreatePartyBtn">
            Create Party
            </button>
            <div style="margin-top:10px;">
            <input
                id="gwJoinPartyInput"
                placeholder="Enter Party ID"
                style="width:100%;padding:6px;border-radius:6px;margin-bottom:6px;"
            />
            <button class="gw-mini-btn" id="gwJoinPartyBtn">
                Join Party
            </button>
            </div>

        </div>
      `;
    }

    return `
      <div class="gw-card">
        <div class="gw-card-title">${party.name}</div>
        <div class="gw-muted" style="font-size:12px;">
          Party ID: ${party.id}
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Members</div>
        <div class="gw-list">
          ${members
            .map(
              (m) => `
            <div class="gw-rowline">
              <span>${m.players?.display_name || "Unknown"}</span>
              <span class="gw-muted">
                ${m.role} · 🍃 ${m.players?.wildpoints ?? 0}
              </span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function bindPartyControls() {
    const createBtn = document.getElementById("gwCreatePartyBtn");
    if (createBtn) {
      createBtn.onclick = async () => {
        try {
          const result = await window.GridWildAPI.createParty("Field Party");

          if (result?.party?.id) {
            setActivePartyId(result.party.id);
          }

          await loadParty();
          refreshPartySheet();
          window.GridWildParty?.refreshMapBeacon?.();
        } catch (err) {
          console.error("Could not create party:", err);
          alert(`Could not create party: ${err.message}`);
        }
      };
    }

    const copyBtn = document.getElementById("gwCopyPartyIdBtn");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const id = window.__gwState?.party?.id;
        if (!id) return;

        await navigator.clipboard.writeText(id);
        alert("Party ID copied");
      };
    }

    const joinBtn = document.getElementById("gwJoinPartyBtn");

    if (joinBtn) {
      joinBtn.onclick = async () => {
        const id = document.getElementById("gwJoinPartyInput").value.trim();
        if (!id) return;

        try {
          await window.GridWildAPI.joinParty(id);

          setActivePartyId(id);

          await loadParty();
          refreshPartySheet();

          window.GridWildParty?.refreshMapBeacon?.();
        } catch (err) {
          alert("Could not join party");
          console.error(err);
        }
      };
    }
  }

  function refreshPartySheet() {
    const statusContainer = document.getElementById("gwPartyLiveStatus");
    const bodyContainer = document.getElementById("gwPartySheetBody");

    if (!bodyContainer) return;

    if (statusContainer) {
      statusContainer.innerHTML = renderPartyHtml();
      bindPartyControls();
    }

    // Render / refresh unified Party UI
    let wrapper = bodyContainer.querySelector("#gwLegacyPartyUI");

    const legacyHtml = window.GridWildParty?.renderSheetHtml?.();

    if (legacyHtml) {
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "gwLegacyPartyUI";
        bodyContainer.appendChild(wrapper);
      }

      wrapper.innerHTML = legacyHtml;
      window.GridWildParty?.bindSheetControls?.(wrapper);
    }
  }

  async function createDbPartyFromLegacyForm(form = {}, options = {}) {
    const name = form.title || form.name || "Field Party";
    const optimisticParty =
      options.optimistic === true ? applyOptimisticParty({ ...form, title: name }) : null;
    let dbParty = null;

    try {
      const result = await window.GridWildAPI.createParty(name, form.linkedQuestId || null, {
        mode: form.mode || "live",
        visibility: form.visibility || "public",
        starts_at:
          form.mode === "scheduled" && form.startsAt ? new Date(form.startsAt).toISOString() : null,
        duration_minutes: Number(form.durationMinutes || 60),
        target: Number(form.target || 10),
        location_mode: form.locationMode || "anywhere",
        location_user_id: form.locationUserId || null,
        location_label: form.locationLabel || null,
        location: form.location || null,
        resolved_location: form.resolvedLocation || null,
        lat: form.resolvedLocation?.lat ?? null,
        lng: form.resolvedLocation?.lng ?? null
      });

      dbParty = result.party;

      if (dbParty?.id) {
        promoteOptimisticParty(optimisticParty?.id, dbParty);
        setActivePartyId(dbParty.id);
      }

      await loadParty();

      refreshPartySheet();
      window.GridWildParty?.refreshMapBeacon?.();

      return dbParty;
    } catch (err) {
      if (!dbParty && optimisticParty?.id) {
        clearOptimisticParty(optimisticParty.id);
      }
      throw err;
    }
  }

  let partyPollTimer = null;

  function startPartyPolling() {
    stopPartyPolling();
    if (!isOnlineGameplayReady()) return;

    partyPollTimer = setInterval(async () => {
      await loadParty();
      refreshPartySheet();
    }, PARTY_POLL_INTERVAL_MS);
  }

  function stopPartyPolling() {
    if (partyPollTimer) {
      clearInterval(partyPollTimer);
      partyPollTimer = null;
    }
  }

  function startCoverPolling(partyId) {
    stopCoverPolling();
    if (!isOnlineGameplayReady()) return;

    window.__gwPartyCoverPollTimer = setInterval(async () => {
      await loadParty();
      window.GridWildParty?.refreshOpenCover?.(partyId);
    }, PARTY_COVER_POLL_INTERVAL_MS);
  }

  function stopCoverPolling() {
    if (window.__gwPartyCoverPollTimer) {
      clearInterval(window.__gwPartyCoverPollTimer);
      window.__gwPartyCoverPollTimer = null;
    }
  }

  window.GridWildPartyLive = {
    loadParty,
    refreshPartySheet,
    createDbPartyFromLegacyForm,
    applyOptimisticParty,
    clearOptimisticParty,
    startPartyPolling,
    stopPartyPolling,
    startCoverPolling,
    stopCoverPolling,
    getActivePartyId,
    setActivePartyId
  };
})();
