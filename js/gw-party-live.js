// -----------------------------------------------------------------------------
// GridWild Party Live Data Bridge
// -----------------------------------------------------------------------------

(function () {


    function getActivePartyId() {
    window.__gwState = window.__gwState || {};

    if ("activePartyId" in window.__gwState) {
        return window.__gwState.activePartyId || null;
    }

    return window.__gwState.party?.id || null;
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
        }

        window.GridWildAPI?.setActiveParty?.(id || null).catch(err => {
            console.warn("Could not sync active party state:", err);
        });

        window.dispatchEvent(new CustomEvent("gwActivePartyChanged", {
            detail: { id: window.__gwState.activePartyId }
        }));
        }

async function loadParty() {
  try {
    const activeId = getActivePartyId();
    const data = await window.GridWildAPI.getParty(activeId || null);

    window.__gwState = window.__gwState || {};
    window.__gwState.party = data.party;
    window.__gwState.partyMembers = data.members || [];
    window.__gwState.partyEvents = data.events || [];
    window.__gwState.partyEvidence = data.evidence || [];
    window.__gwState.partyProgress = data.progress || 0;


    window.__gwState.partyRoute = [];

    if (data.party?.id) {
      try {
        const routeData = await window.GridWildAPI.getPartyRoute(data.party.id);
        window.__gwState.partyRoute = routeData.route || [];
      } catch (err) {
        console.warn("Could not load party route:", err);
        window.__gwState.partyRoute = [];
      }
    }

    if (data.party?.id) {
      setActivePartyId(data.party.id);
    }

    try {
      const nearby = await window.GridWildAPI.getNearbyParties();
      window.__gwState.nearbyParties = nearby.parties || [];
    } catch (err) {
      console.warn("Could not load nearby parties:", err);
      window.__gwState.nearbyParties = [];
    }

    return data;
  } catch (err) {
    console.error("Failed to load party:", err);
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
          ${members.map(m => `
            <div class="gw-rowline">
              <span>${m.players?.display_name || "Unknown"}</span>
              <span class="gw-muted">
                ${m.role} · 🍃 ${m.players?.wildpoints ?? 0}
              </span>
            </div>
          `).join("")}
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

    if (!statusContainer || !bodyContainer) return;

    // 1. Update DB status card (top)
    statusContainer.innerHTML = renderPartyHtml();
    bindPartyControls();

        // 2. Render / refresh legacy Guild UI below
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

async function createDbPartyFromLegacyForm(form = {}) {
  const name = form.title || form.name || "Field Party";

  const result = await window.GridWildAPI.createParty(
    name,
    form.linkedQuestId || null,
    {
      mode: form.mode || "live",
      visibility: form.visibility || "public",
      starts_at: form.mode === "scheduled" && form.startsAt
        ? new Date(form.startsAt).toISOString()
        : null,
      duration_minutes: Number(form.durationMinutes || 60),
      target: Number(form.target || 10),
      location_mode: form.locationMode || "anywhere",
      location_user_id: form.locationUserId || null,
      location_label: form.locationLabel || null,
      location: form.location || null,
      resolved_location: form.resolvedLocation || null,
      lat: form.resolvedLocation?.lat ?? null,
      lng: form.resolvedLocation?.lng ?? null
    }
  );

  const dbParty = result.party;

  if (dbParty?.id) {
    setActivePartyId(dbParty.id);
  }

  await loadParty();

  refreshPartySheet();
  window.GridWildParty?.refreshMapBeacon?.();

  return dbParty;
}

let partyPollTimer = null;

function startPartyPolling() {
  stopPartyPolling();

  partyPollTimer = setInterval(async () => {
    await loadParty();
    refreshPartySheet();
  }, 5000);
}

function stopPartyPolling() {
  if (partyPollTimer) {
    clearInterval(partyPollTimer);
    partyPollTimer = null;
  }
}

function startCoverPolling(partyId) {
  stopCoverPolling();

  window.__gwPartyCoverPollTimer = setInterval(async () => {
    await loadParty();
    window.GridWildParty?.refreshOpenCover?.(partyId);
  }, 5000);
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
    startPartyPolling,
    stopPartyPolling,
    startCoverPolling,
    stopCoverPolling,
    getActivePartyId,
    setActivePartyId
    };

})();
