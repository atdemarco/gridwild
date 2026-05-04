// Mobile bottom-sheet content + lightweight wiring for GridWild

window.__gwUser = window.__gwUser || {
  username: localStorage.getItem("gw_inat_username") || "andrew2285"
};


(function () {

    window.__gwUser = window.__gwUser || {
    username: localStorage.getItem("gw_inat_username") || "andrew2285",
    profile: null
  };
  
  function $(id) {
    return document.getElementById(id);
  }

  // --------------------------------------------------------------------------
  // Sheet body templates
  // --------------------------------------------------------------------------

    function renderMeContent() {
    return `
      <div class="gw-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div class="gw-card-title">Explorer Card</div>
            <button class="gw-mini-btn" id="gwUserSettingsBtn" title="Change iNaturalist username">
              ⚙ Account
            </button>
          </div>

        <div id="gwUserProfileBody">
          Loading explorer profile...
        </div>
      </div>  

      <div class="gw-card">
      <div class="gw-card-title">GridWild Identity</div>
      <div id="gwCharacterSummaryBody">
        Loading character...
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
        <button class="gw-mini-btn" id="gwOpenProfileBtn">Profile</button>
        <button class="gw-mini-btn" id="gwOpenStoreBtn">Store</button>
        <button class="gw-mini-btn" id="gwOpenInventoryBtn">Inventory</button>
        <button class="gw-mini-btn" id="gwEditCharacterBtn">Edit Character</button>
      </div>
    </div>

      <div class="gw-card">
        <div class="gw-card-title">Exploration Map</div>
          <div id="gwFogProgressBody">
            Loading exploration progress...
          </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Draft Observations</div>
        <div id="gwDraftObservationsList" style="margin-top:8px;">
          <div class="gw-muted">No draft observations yet.</div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Recent Observations</div>

        <button class="gw-mini-btn" id="gwRefreshRecentINatBtn">
          Refresh Recent Observations
        </button>

        <div id="gwRecentINatProgress" style="display:none;margin-top:12px;">
          <div class="gw-muted" id="gwRecentINatProgressText" style="font-size:12px;margin-bottom:6px;">
            Preparing download...
          </div>

          <div style="
            height:12px;
            border-radius:999px;
            overflow:hidden;
            background:rgba(255,255,255,0.08);
            border:1px solid rgba(215,183,116,0.16);
          ">
            <div id="gwRecentINatProgressBar" style="
              width:0%;
              height:100%;
              background:linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
              transition:width 160ms ease;
            "></div>
          </div>
        </div>

        <div id="gwRecentINatList" style="margin-top:12px;">
          <div class="gw-muted">No recent observations loaded yet.</div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Wildlists</div>
        <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
          Build shareable galleries from your observations.
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="gw-mini-btn" id="gwCreateWildlistBtn">Create</button>
          <button class="gw-mini-btn" id="gwOpenWildlistsBtn">My Wildlists</button>
        </div>

        <div id="gwWildlistsSummary" style="margin-top:10px;"></div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Field Progress</div>
        <div id="gwUserProgressBody">
          Loading progression...
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Collection</div>
        <div id="gwUserExtraStats">
          Loading collection stats...
        </div>
      </div>

    ${window.GridWildAchievements ? window.GridWildAchievements.renderButtonHtml() : ""}
    `;
  }
 //  ${window.GridWildOutfitter ? window.GridWildOutfitter.renderButtonHtml() : ""}
 
  function injectINatAccountStyles() {
    if (document.getElementById("gwINatAccountStyles")) return;

    const style = document.createElement("style");
    style.id = "gwINatAccountStyles";
    style.textContent = `
      .gw-obs-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99997;
        background: rgba(8,12,10,0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-obs-editor {
        width: min(520px, 96vw);
        max-height: 92vh;
        overflow: auto;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        color: #efe6d3;
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        padding: 14px;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  }

  function openINatAccountModal() {
    injectINatAccountStyles();

    const connected = window.GridWildINatAuth?.isConnected?.();
    const username = window.GridWildINatAuth?.getUseopenINatAccountModalrname?.() || "";

    const modal = document.createElement("div");
    modal.className = "gw-obs-backdrop";
    modal.innerHTML = `
    <div class="gw-obs-editor" style="max-width:520px;">
      <div class="gw-obs-title">iNaturalist Account</div>
      <div class="gw-obs-sub">
        Connect iNaturalist so GridWild can upload draft observations.
      </div>

      <div class="gw-obs-panel">
        <label class="gw-obs-label">iNaturalist username</label>
        <input id="gwINatUsernameInput" value="${escapeHtmlLocal(username)}">
      </div>

      <div class="gw-obs-panel">
        <label class="gw-obs-label">API token / JWT</label>
        <textarea id="gwINatTokenInput" rows="5" placeholder="Paste token here"></textarea>
        <div class="gw-muted" style="font-size:11px;margin-top:6px;">
          Prototype only. For production, use OAuth through a backend instead of storing tokens in localStorage.
        </div>
      </div>

      <div class="gw-obs-actions">
        <button class="gw-obs-btn" id="gwINatCancelBtn">Cancel</button>
        <button class="gw-obs-btn" id="gwINatDisconnectBtn">${connected ? "Disconnect" : "Clear"}</button>
        <button class="gw-obs-btn primary" id="gwINatSaveBtn">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#gwINatCancelBtn").onclick = () => modal.remove();

  modal.querySelector("#gwINatDisconnectBtn").onclick = () => {
    window.GridWildINatAuth?.disconnect?.();
    modal.remove();
    window.initGridWildMobilePanels?.();
  };

  modal.querySelector("#gwINatSaveBtn").onclick = async () => {
    const u = modal.querySelector("#gwINatUsernameInput").value;
    const t = modal.querySelector("#gwINatTokenInput").value;

    window.GridWildINatAuth?.setUsername?.(u);
    if (t.trim()) window.GridWildINatAuth?.setToken?.(t);

    try {
      await window.GridWildINatAuth?.testToken?.();
      alert("iNaturalist connection works.");
    } catch (err) {
      alert(`Saved, but token test failed: ${err.message}`);
    }

    modal.remove();
    window.initGridWildMobilePanels?.();
  };

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.remove();
  });
}

function formatDraftObservedAt(d) {
  const raw = d?.observedAt || d?.createdAt || d?.updatedAt;
  if (!raw) return "No date set";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "No date set";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getRecentObsGenus(o) {
  if (o?.genus_name) return o.genus_name;

  const sci = String(o?.scientific_name || "").trim();
  const m = sci.match(/^([A-Z][a-zA-Z-]+)(?:\s|$)/);
  if (m) return m[1];

  return "";
}

function renderDraftObservationsList() {
  const el = document.getElementById("gwDraftObservationsList");
  if (!el) return;

  const drafts = window.GridWildDraftObservations?.loadDrafts?.() || [];

  if (!drafts.length) {
    el.innerHTML = `<div class="gw-muted">No draft observations yet.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="gw-list">
      ${drafts.map(d => {
        const primary =
          d.photos.find(p => p.id === d.primaryPhotoId) ||
          d.photos[0];

        return `
          <div class="gw-rowline gw-draft-obs-row" data-draft-id="${escapeHtmlLocal(d.id)}" style="cursor:pointer;">
            <span style="display:flex;align-items:center;gap:10px;min-width:0;">
              <span style="
                width:42px;height:42px;border-radius:10px;overflow:hidden;
                background:rgba(0,0,0,0.08);display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
              ">
                ${primary?.dataUrl
                  ? `<img src="${primary.dataUrl}" style="width:100%;height:100%;object-fit:cover;">`
                  : "📷"
                }
              </span>

              <span style="min-width:0; flex:1 1 0;">
                <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  Draft observation
                </span>
                  <span class="gw-muted" style="font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${formatDraftObservedAt(d)} · ${d.photos.length} photo${d.photos.length === 1 ? "" : "s"}
                  </span>
              </span>
            </span>

            <span class="gw-codex-link">Edit ›</span>
          </div>
        `;
      }).join("")}
    </div>
  `;

  el.querySelectorAll(".gw-draft-obs-row").forEach(row => {
    row.addEventListener("click", () => {
      window.GridWildObservationEditor?.open?.(row.dataset.draftId);
    });
  });
}

if (!window.__gwDraftObsListenerBound) {
  window.__gwDraftObsListenerBound = true;

  window.addEventListener("gwDraftObservationsChanged", () => {
    renderDraftObservationsList();
  });
}

if (!window.__gwQuestEvidenceListenerBound) {
  window.__gwQuestEvidenceListenerBound = true;

  window.addEventListener("gwQuestEvidenceChanged", () => {
    renderRecentINatList();
  });

  window.addEventListener("gwQuestStarted", () => {
    renderRecentINatList();
  });
}

function renderRecentINatList() {
  const el = document.getElementById("gwRecentINatList");
  if (!el) return;

  const obs = window.GridWildRecentINat?.getRecentObservations?.() || [];

  if (!obs.length) {
    el.innerHTML = `<div class="gw-muted">No recent observations loaded yet.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="gw-list">
      ${obs.slice(0, 30).map(o => {
        const genus = getRecentObsGenus(o);
        const displayName = o.taxon || o.common_name || o.scientific_name || "Unknown taxon";
        const sci = o.scientific_name || "";

        const questBadge = window.GridWildQuestEvidence
        ? window.GridWildQuestEvidence.renderRecentObservationBadge(o)
        : "";

        return `
          <div
            class="gw-rowline gw-genus-open-row"
            data-genus="${escapeHtmlLocal(genus)}"
            style="cursor:${genus ? "pointer" : "default"};"
          >
            <span style="min-width:0;flex:1 1 0;">
              <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHtmlLocal(displayName)}
              </span>

              <span class="gw-muted" style="font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHtmlLocal(sci || "no scientific name")} · ${escapeHtmlLocal(o.observed_on || "unknown date")} · ±${Math.round(Number(o.accuracy) || 0)}m
              </span>
            </span>

              <span
                style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:0 1 auto;min-width:0;"
      
              >

                ${questBadge}

                <button
                  class="gw-mini-btn gw-add-wildlist-from-recent-btn"
                  data-obs-id="${escapeHtmlLocal(o.id)}"
                  title="Add to Wildlist"
                  style="padding:5px 7px;font-size:10px;"
                >
                  + Wildlist
                </button>

                <span
                  class="gw-codex-link"
                title="${genus ? "Open genus codex" : "No genus available"}"
              >
                ${genus ? `<span>${escapeHtmlLocal(genus)}</span><span class="gw-codex-chevron">›</span>` : "—"}
              </span>
            </span>
          </div>
        `;
      }).join("")}
    </div>

    ${obs.length > 30 ? `
      <div class="gw-muted" style="font-size:11px;margin-top:8px;">
        Showing 30 of ${formatNum(obs.length)} cached recent observations.
      </div>
    ` : ""}
  `;

  el.querySelectorAll(".gw-genus-open-row").forEach(row => {
    row.addEventListener("click", () => {
      const genus = row.dataset.genus || "";
      if (!genus) return;
      window.GridWildGenusCodex?.open?.(genus);
    });
  });

    el.querySelectorAll(".gw-add-wildlist-from-recent-btn").forEach(btn => {
    btn.addEventListener("click", evt => {
      evt.preventDefault();
      evt.stopPropagation();

      window.GridWildPlaylists?.addObservationToWildlist?.(btn.dataset.obsId);
    });
  });
}

function bindRecentINatButton() {
  const btn = document.getElementById("gwRefreshRecentINatBtn");
  if (!btn) return;

  btn.onclick = async () => {
    if (!window.GridWildRecentINat) {
      alert("Recent iNaturalist sync is not loaded.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Downloading...";

    try {
      await window.GridWildRecentINat.refreshRecentObservations(
        window.__gwUser?.username || "andrew2285"
      );

      renderFogProgress();
      renderRecentINatList();
    } catch (err) {
      console.warn("Recent iNat refresh failed:", err);
      alert(`Could not refresh recent observations: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Refresh Recent Observations";
    }
  };
}

function updateRecentINatProgressUI(detail) {
  const wrap = document.getElementById("gwRecentINatProgress");
  const bar = document.getElementById("gwRecentINatProgressBar");
  const text = document.getElementById("gwRecentINatProgressText");

  if (!wrap || !bar || !text) return;

  wrap.style.display = detail.status === "done" ? "none" : "block";

  const pct = Number.isFinite(Number(detail.pct))
    ? Math.max(0, Math.min(100, Number(detail.pct)))
    : Math.min(95, (Number(detail.page || 0) / 10) * 100);

  bar.style.width = `${pct}%`;

  text.textContent =
    `Page ${detail.page || 0} · accepted ${detail.accepted || 0} · rejected ${detail.rejected || 0}`;
}

function escapeHtmlLocal(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clearExploredSquaresCache() {
  if (!window.GridWildFog?.clearAllFogProgress) {
    alert("Exploration cache is not available yet.");
    return;
  }

  const stats = window.GridWildFog.getStats?.();
  const n = Number(stats?.storedCells || 0);

  const ok = confirm(
    `Clear explored-square cache? This will forget ${n.toLocaleString()} explored cells on this device.`
  );
  if (!ok) return;

  window.GridWildFog.clearMovementExploration();

  // Reset God’s Eye movement debounce so it can immediately repaint from the current center.
  if (window.__gwState) {
    window.__gwState.lastGodsEyeCenterKey = null;
  }

  if (typeof window.updateGrid === "function") {
    window.updateGrid();
  }

  if (window.GridWildFogCanvas) {
    window.GridWildFogCanvas.scheduleRender();
  }

  if (typeof renderFogProgress === "function") {
    renderFogProgress();
  }

  if (typeof window.refreshGridWildMobileInfo === "function") {
    window.refreshGridWildMobileInfo();
  }
}

function renderFogProgress() {
  const el = document.getElementById("gwFogProgressBody");
  if (!el) return;

  if (!window.GridWildFog) {
    el.innerHTML = `<div class="gw-muted">Exploration map not available yet.</div>`;
    return;
  }

  const stats = window.GridWildFog.getStats();

  el.innerHTML = `
    <div class="gw-list">
      <div class="gw-rowline">
        <span>Surveyed cells</span>
        <span class="gw-muted">${formatNum(stats.surveyed)}</span>
      </div>

      <div class="gw-rowline">
        <span>Documented cells</span>
        <span class="gw-muted">${formatNum(stats.documented)}</span>
      </div>

      <div class="gw-rowline">
        <span>Fading cells</span>
        <span class="gw-muted">${formatNum(stats.expired)}</span>
      </div>

      <div class="gw-rowline">
        <span>Total explored memory</span>
        <span class="gw-muted">${formatNum(stats.storedCells)}</span>
      </div>
    </div>

    <div class="gw-muted" style="font-size:11px;line-height:1.35;margin-top:10px;">
      Walking into a cell surveys it temporarily. Making an observation documents it permanently.
    </div>
  `;
}


function renderInfoContent() {
  return `
      <div class="gw-card" id="gwSummaryPane">
        <div class="gw-summary-title">Center square</div>
        <div class="gw-summary-body" id="gwSummaryBody">Loading…</div>
      </div>

      <div class="gw-card" id="gwTopObserversPane">
        <div class="gw-card-title">Top observers</div>
        <div id="gwTopObserversBody" class="gw-summary-body">Loading…</div>
      </div>

      <div class="gw-card" id="gwCladoPane">
        <div class="gw-clado-title">Taxonomic structure</div>
        <div class="gw-clado-subtitle">
          Center 3×3 square taxonomy: iconic taxon → order → family → genus
        </div>

        <div class="gw-clado-wrap" id="gwCladoWrap">
          <div id="gwCladoBody" class="gw-clado-empty">
            Waiting for taxonomy data…
          </div>

          <div class="gw-clado-hint">
            tap slice = drill down • tap center = back
          </div>
        </div>
      </div>
    `;
}

function renderCommunityContent() {
  if (window.GridWildParty?.renderSheetHtml) {
    return window.GridWildParty.renderSheetHtml();
  }

  return `
    <div class="gw-card">
      <div class="gw-card-title">Party</div>
      <div class="gw-muted">Party system loading...</div>
    </div>
  `;
}

  function renderCommunityContentOLD() {
    return `
      <div class="gw-card">
        <div class="gw-card-title">Guild Territory</div>
        <div class="gw-list">
          <div class="gw-rowline"><span>Territory holder</span><span class="gw-muted">@BirdNerdDC</span></div>
          <div class="gw-rowline"><span>Nearby specialist</span><span class="gw-muted">MossWizard</span></div>
          <div class="gw-rowline"><span>Guild goal</span><span class="gw-muted">200 spring spp</span></div>
        </div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Nearby activity</div>
        <div class="gw-list">
          <div class="gw-rowline"><span>Warbler found 300m away</span><span class="gw-muted">today</span></div>
          <div class="gw-rowline"><span>New bee species nearby</span><span class="gw-muted">today</span></div>
          <div class="gw-rowline"><span>3 observers active here</span><span class="gw-muted">now</span></div>
        </div>
      </div>
    `;
  }


  function renderQuestContent() {
  const dailyHtml = window.GridWildQuests
    ? window.GridWildQuests.renderDailyQuestsHtml()
    : `<div class="gw-muted">Daily quests loading...</div>`;

  const questListHtml = window.GridWildQuests
    ? window.GridWildQuests.renderQuestListHtml()
    : `<div class="gw-muted">Quest system loading...</div>`;

  return `
    <div class="gw-card">
      <div class="gw-card-title">Quest Generator</div>

      <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
        Generate a field quest from recipe ingredients: target location, taxon flavor,
        objective, difficulty, timeframe, evidence, and optional survey.
      </div>

      <button class="gw-mini-btn" id="gwGenerateQuestBtn">
        Generate Quest
      </button>

      <button class="gw-mini-btn" id="gwExploreSurveysBtn" style="margin-left:8px;">
        Explore Surveys
      </button>
    </div>

    <div class="gw-card">
      <div class="gw-card-title">Today's Quests</div>
      <div id="gwDailyQuestListBody">
        ${dailyHtml}
      </div>
    </div>

    <div class="gw-card">
      <div class="gw-card-title">Current and Prior Quests</div>
      <div id="gwQuestListBody">
        ${questListHtml}
      </div>
    </div>
  `;
}

  function renderLegendContent() {
    return `
      
      <div class="gw-card">
        <div class="gw-card-title">Help</div>

        <button class="gw-help-row" id="gwReplayWelcomeBtn">
          🌎 Welcome tutorial
        </button>

        <button class="gw-help-row" id="gwReplayTourBtn">
          🧭 Control tour
        </button>
      </div>

      <div class="gw-card">
        <div class="gw-legend-title">How to read the overlay</div>
        <div class="gw-legend-subtitle">
          Hue = observers • vividness = species • opacity = observations
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Observers</div>
          <div class="gw-huebar"></div>
          <div class="gw-legend-axislabels">
            <span>few</span>
            <span>mid</span>
            <span>many</span>
          </div>
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Species</div>
          <div class="gw-chiprow">
            <div class="gw-chip chip-dull"></div>
            <div class="gw-chip chip-mid"></div>
            <div class="gw-chip chip-vivid"></div>
          </div>
        </div>

        <div class="gw-legend-section">
          <div class="gw-legend-rowlabel">Observations</div>
          <div class="gw-chiprow">
            <div class="gw-chip chip-faint"></div>
            <div class="gw-chip chip-medium"></div>
            <div class="gw-chip chip-opaque"></div>
          </div>
        </div>
      </div>
      
      <div class="gw-card">
        <div class="gw-card-title">Jump to GPS</div>

        <input
          id="gwJumpGpsInput"
          type="text"
          placeholder="38.8895,-77.0353"
          style="
            width:100%;
            box-sizing:border-box;
            margin-bottom:8px;
            padding:8px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.05);
            color:inherit;
          "
        >

        <button id="gwJumpToGpsBtn" class="gw-mini-btn" style="width:100%;">
          Jump
        </button>

        <div id="gwJumpGpsStatus" class="gw-muted" style="font-size:11px;margin-top:6px;"></div>
      </div>

      <div class="gw-card">
        <div class="gw-card-title">Layer controls</div>

        
        <div class="gw-togglegrid">
          <label class="gw-toggleline">
            <input type="checkbox" id="togglePoints_clone" />
            <span>Show points</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleHeat_clone" checked />
            <span>Show heat</span>
          </label>
  
          <label class="gw-toggleline">
          <input type="checkbox" id="toggleOsmBuildings_clone" checked />
          <span>Buildings / Roofs</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleDynamicINat_clone" />
            <span>Live iNat</span>
          </label>
          <label class="gw-toggleline">
            <input type="checkbox" id="toggleShimmer_clone" />
            <span>Captive shimmer</span>
          </label>
          <label class="gw-toggleline">
            <input type="checkbox" id="toggleFog_clone" checked />
            <span>Fog of war</span>
          </label>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleFogSmoothing_clone" checked />
            <span>Fog smoothing</span>
          </label>

          <div class="gw-toggleline gw-godseye-row">
            <label class="gw-toggleline gw-godseye-label">
              <input type="checkbox" id="toggleGodsEye_clone" />
              <span>God’s Eye</span>
            </label>

            <button class="gw-mini-btn gw-clear-fog-btn" id="gwClearFogCacheBtn" type="button">
              clear cache
            </button>
          </div>

          <label class="gw-toggleline">
            <input type="checkbox" id="toggleLockLocation_clone" checked />
            <span>Lock to current location</span>
          </label>
        </div>

        <div class="gw-card-title" style="margin-top:14px;">Heat metric</div>
        <div class="gw-togglegrid">
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="count" checked />
            <span>n observations</span>
          </label>
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="species" />
            <span>n species</span>
          </label>
          <label class="gw-toggleline">
            <input type="radio" name="heatMetric_clone" value="observers" />
            <span>n observers</span>
          </label>
        </div>

        <div class="gw-card-title" style="margin-top:14px;">Iconic taxa</div>
        <div class="gw-checklist" id="taxaChecklistClone"></div>
      </div>
    `;
  }


  function safeNum(x) {
    return Number.isFinite(Number(x)) ? Number(x) : 0;
  }

  function formatNum(x) {
    return safeNum(x).toLocaleString();
  }

  function computeExplorerRank(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    const ids = safeNum(profile?.identifications_count);

    const score = obs + (spp * 8) + (ids * 0.35);

    if (score >= 120000) return "Mythic Surveyor";
    if (score >= 60000)  return "Master Naturalist";
    if (score >= 25000)  return "Senior Tracker";
    if (score >= 10000)  return "Field Ranger";
    if (score >= 4000)   return "Trail Scout";
    if (score >= 1200)   return "Apprentice Observer";
    return "New Wanderer";
  }

  function computeExplorerLevel(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    const ids = safeNum(profile?.identifications_count);

    const xp = obs + spp * 10 + Math.floor(ids * 0.25);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 40)));
    const xpIntoLevel = xp - 40 * Math.pow(level - 1, 2);
    const xpForNext = Math.max(100, 40 * (Math.pow(level, 2) - Math.pow(level - 1, 2)));
    const pct = Math.max(0, Math.min(100, (xpIntoLevel / xpForNext) * 100));

    return { xp, level, xpIntoLevel, xpForNext, pct };
  }

  function estimateRarityScore(profile) {
    const obs = safeNum(profile?.observations_count);
    const spp = safeNum(profile?.species_count);
    if (obs <= 0) return 0;
    return (spp / obs) * 1000;
  }

  function estimateCoverageScore(profile) {
    const obs = safeNum(profile?.observations_count);
    const ids = safeNum(profile?.identifications_count);
    return Math.round(Math.sqrt(obs) + Math.sqrt(ids));
  }

  function getIconUrl(user) {
    return (
      user?.icon_url ||
      user?.user_icon_url ||
      "https://static.inaturalist.org/attachments/users/icons/defaults/thumb.png"
    );
  }

  async function fetchINatUserProfile(username) {
    const resp = await fetch(`https://api.inaturalist.org/v1/users/${encodeURIComponent(username)}`);
    if (!resp.ok) {
      throw new Error(`iNat user lookup failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const user = data?.results?.[0];
    if (!user) {
      throw new Error("iNat username not found");
    }

    return user;
  }

  async function fetchINatRecentObservations(username, perPage = 30) {
    const url = new URL("https://api.inaturalist.org/v1/observations");
    url.searchParams.set("user_login", username);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("order_by", "created_at");
    url.searchParams.set("order", "desc");

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      throw new Error(`iNat recent obs lookup failed: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return Array.isArray(data?.results) ? data.results : [];
  }

  function summarizeRecentObservations(obs) {
    const iconicCounts = new Map();
    const taxonNames = new Set();

    for (const row of obs) {
      const iconic = row?.taxon?.iconic_taxon_name || "Unknown";
      iconicCounts.set(iconic, (iconicCounts.get(iconic) || 0) + 1);

      const name = row?.taxon?.preferred_common_name || row?.taxon?.name;
      if (name) taxonNames.add(name);
    }

    const topIconic = Array.from(iconicCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      recentObs: obs.length,
      recentSpecies: taxonNames.size,
      dominantIconic: topIconic ? `${topIconic[0]} (${topIconic[1]})` : "—"
    };
  }

  function renderExplorerProfile(user) {
    const rank = computeExplorerRank(user);
    const lv = computeExplorerLevel(user);
    const rarity = estimateRarityScore(user);

    return `
      <div style="display:flex;gap:12px;align-items:center;">
        <img
          src="${getIconUrl(user)}"
          alt="${user.login}"
          style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.12);"
        />

        <div style="min-width:0;">
          <div style="font-size:18px;font-weight:900;line-height:1.1;">${user.login}</div>
          <div class="gw-muted" style="margin-top:2px;">${user.name || rank}</div>
          <div style="margin-top:6px;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:rgba(240,209,138,0.95);font-weight:800;">
            ${rank}
          </div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:6px;">
          <span class="gw-muted">Level ${lv.level}</span>
          <span class="gw-muted">${formatNum(lv.xpIntoLevel)} / ${formatNum(lv.xpForNext)} XP</span>
        </div>

        <div style="height:12px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.06);">
          <div style="
            width:${lv.pct.toFixed(1)}%;
            height:100%;
            background:linear-gradient(90deg, rgba(140,110,54,0.95), rgba(240,209,138,0.98));
          "></div>
        </div>
      </div>

      <div class="gw-kpi-grid" style="margin-top:12px;">
        <div class="gw-kpi">
          <div class="gw-kpi-k">Observations</div>
          <div class="gw-kpi-v">${formatNum(user.observations_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Species</div>
          <div class="gw-kpi-v">${formatNum(user.species_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">IDs</div>
          <div class="gw-kpi-v">${formatNum(user.identifications_count)}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Rarity score</div>
          <div class="gw-kpi-v">${rarity.toFixed(1)}</div>
        </div>
      </div>
    `;
  }

  function renderExplorerProgress(user, recentSummary) {
    const coverage = estimateCoverageScore(user);
    const journalPosts = safeNum(user?.journal_posts_count);
    const projects = safeNum(user?.projects_count);

    return `
      <div class="gw-list">

        <div class="gw-rowline">
          <span>Coverage score</span>
          <span class="gw-muted">${formatNum(coverage)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent observations scanned</span>
          <span class="gw-muted">${formatNum(recentSummary.recentObs)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent species detected</span>
          <span class="gw-muted">${formatNum(recentSummary.recentSpecies)}</span>
        </div>

        <div class="gw-rowline">
          <span>Dominant recent kingdom lane</span>
          <span class="gw-muted">${recentSummary.dominantIconic}</span>
        </div>

        <div class="gw-rowline">
          <span>Journal posts</span>
          <span class="gw-muted">${formatNum(journalPosts)}</span>
        </div>

        <div class="gw-rowline">
          <span>Projects</span>
          <span class="gw-muted">${formatNum(projects)}</span>
        </div>

      </div>
    `;
  }

  function renderExplorerCollection(user, recentSummary) {
    const obs = safeNum(user?.observations_count);
    const spp = safeNum(user?.species_count);
    const ids = safeNum(user?.identifications_count);

    const speciesPerObs = obs > 0 ? (spp / obs) : 0;
    const idsPerObs = obs > 0 ? (ids / obs) : 0;

    return `
      <div class="gw-list">

        <div class="gw-rowline">
          <span>Species per observation</span>
          <span class="gw-muted">${speciesPerObs.toFixed(3)}</span>
        </div>

        <div class="gw-rowline">
          <span>IDs per observation</span>
          <span class="gw-muted">${idsPerObs.toFixed(3)}</span>
        </div>

        <div class="gw-rowline">
          <span>Recent ecological lane</span>
          <span class="gw-muted">${recentSummary.dominantIconic}</span>
        </div>

        <div class="gw-rowline">
          <span>Active username</span>
          <span class="gw-muted">@${user.login}</span>
        </div>

      </div>
    `;
  }

  async function loadINatUserProfileIntoPanel() {
    const username = window.__gwUser?.username || "andrew2285";

    const profileEl = document.getElementById("gwUserProfileBody");
    const progressEl = document.getElementById("gwUserProgressBody");
    const extraEl = document.getElementById("gwUserExtraStats");

    if (profileEl) profileEl.innerHTML = "Loading explorer profile...";
    if (progressEl) progressEl.innerHTML = "Loading progression...";
    if (extraEl) extraEl.innerHTML = "Loading collection stats...";

    try {
      const [user, recentObs] = await Promise.all([
        fetchINatUserProfile(username),
        fetchINatRecentObservations(username, 30)
      ]);

      window.__gwUser.profile = user;

      const recentSummary = summarizeRecentObservations(recentObs);

      if (profileEl) profileEl.innerHTML = renderExplorerProfile(user);
      if (progressEl) progressEl.innerHTML = renderExplorerProgress(user, recentSummary);
      if (extraEl) extraEl.innerHTML = renderExplorerCollection(user, recentSummary);

    } catch (err) {
      console.warn("Failed to load iNat ME panel profile:", err);

      if (profileEl) {
        profileEl.innerHTML = `
          <div class="gw-muted" style="margin-bottom:10px;">
            Could not load iNaturalist profile for
            <b>@${username}</b>.
          </div>

          <button class="gw-mini-btn" id="gwRetryUserLoadBtn">
            Retry
          </button>
        `;
      }

      if (progressEl) progressEl.innerHTML = "—";
      if (extraEl) extraEl.innerHTML = "—";

      setTimeout(() => {
        const retryBtn = document.getElementById("gwRetryUserLoadBtn");
        if (retryBtn) {
          retryBtn.addEventListener("click", () => {
            loadINatUserProfileIntoPanel();
          });
        }
      }, 0);
    }
  }

  function bindUserSettingsButton() {
    const btn = document.getElementById("gwUserSettingsBtn");
    if (!btn) return;

    btn.onclick = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openINatAccountModal();
    };
  }

  function bindINatOAuthButton() {
    document.getElementById("gw-connect-inat-btn")?.addEventListener("click", () => {
      window.location.href = "/.netlify/functions/inat-oauth-start";
    });
  }

  async function loadINatUserProfile() {

  const username = window.__gwUser.username;

  try {

    const resp = await fetch(
      `https://api.inaturalist.org/v1/users/${username}`
    );

    const data = await resp.json();

    const user = data.results?.[0];
    if (!user) throw new Error("User not found");

    document.getElementById("gwUserProfileBody").innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">

        <img src="${user.icon_url}"
             style="width:56px;height:56px;border-radius:50%;object-fit:cover;">

        <div>
          <div style="font-weight:800;font-size:18px;">
            ${user.login}
          </div>

          <div class="gw-muted">
            ${user.name || ""}
          </div>
        </div>

      </div>

      <div class="gw-kpi-grid" style="margin-top:12px;">

        <div class="gw-kpi">
          <div class="gw-kpi-k">Observations</div>
          <div class="gw-kpi-v">${user.observations_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Species</div>
          <div class="gw-kpi-v">${user.species_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">IDs</div>
          <div class="gw-kpi-v">${user.identifications_count.toLocaleString()}</div>
        </div>

        <div class="gw-kpi">
          <div class="gw-kpi-k">Posts</div>
          <div class="gw-kpi-v">${user.journal_posts_count.toLocaleString()}</div>
        </div>

      </div>
    `;

  } catch(err) {

    document.getElementById("gwUserProfileBody").innerHTML =
      "Could not load iNaturalist profile.";
  }
}

window.refreshGridWildMePanel = function refreshGridWildMePanel() {
  bindUserSettingsButton();
  bindINatOAuthButton();
  loadINatUserProfileIntoPanel();
  renderFogProgress();
  bindRecentINatButton();
  renderRecentINatList();
  renderDraftObservationsList();

  window.GridWildAchievements?.bindButtons?.(document);
  window.GridWildAchievements?.refreshAchievementSummary?.();

  window.GridWildCharacter?.renderSummary?.();
  window.GridWildCharacter?.bindButtons?.(document);

  window.GridWildStore?.bindButtons?.(document);
  window.GridWildInventory?.bindButtons?.(document);
  window.GridWildProfile?.bindButtons?.(document);

  window.GridWildParty?.bindSheetControls?.(document);
  window.GridWildParty?.refreshMapBeacon?.();
  window.GridWildParty?.handleJoinFromUrl?.();

  window.GridWildPlaylists?.bindButtons?.(document);
  window.GridWildPlaylists?.renderSummary?.();
  window.GridWildPlaylists?.handlePlaylistFromUrl?.();

  window.GridWildEconomy?.refreshHud?.();

  // window.GridWildOutfitter?.bind?.(document);
};

  // --------------------------------------------------------------------------
  // Clone-control mirroring
  // --------------------------------------------------------------------------

  function mirrorCheckbox(realId, cloneId) {
    const real = $(realId);
    const clone = $(cloneId);
    if (!real || !clone) return;

    clone.checked = real.checked;

    clone.addEventListener("change", () => {
      real.checked = clone.checked;
      real.dispatchEvent(new Event("change", { bubbles: true }));
    });

    real.addEventListener("change", () => {
      clone.checked = real.checked;
    });
  }

  function mirrorHeatMetricRadios() {
    const realRadios = Array.from(document.querySelectorAll('input[name="heatMetric"]'));
    const cloneRadios = Array.from(document.querySelectorAll('input[name="heatMetric_clone"]'));

    function syncCloneFromReal() {
      const checked = document.querySelector('input[name="heatMetric"]:checked')?.value || "count";
      cloneRadios.forEach(r => {
        r.checked = (r.value === checked);
      });
    }

    cloneRadios.forEach(clone => {
      clone.addEventListener("change", () => {
        if (!clone.checked) return;

        const real = document.querySelector(`input[name="heatMetric"][value="${clone.value}"]`);
        if (!real) return;

        real.checked = true;
        real.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    realRadios.forEach(real => {
      real.addEventListener("change", syncCloneFromReal);
    });

    syncCloneFromReal();
  }

  function buildTaxaCloneChecklist() {
    const hostReal = $("taxaChecklist");
    const hostClone = $("taxaChecklistClone");
    if (!hostReal || !hostClone) return;

    hostClone.innerHTML = "";

    hostReal.querySelectorAll('input[data-iconic]').forEach(realCb => {
      const iconic = realCb.getAttribute("data-iconic");
      const labelText =
        realCb.parentElement?.querySelector("span")?.textContent || iconic;

      const row = document.createElement("label");
      const clone = document.createElement("input");
      const span = document.createElement("span");

      clone.type = "checkbox";
      clone.checked = realCb.checked;
      clone.dataset.iconicClone = iconic;
      span.textContent = labelText;

      clone.addEventListener("change", () => {
        realCb.checked = clone.checked;
        realCb.dispatchEvent(new Event("change", { bubbles: true }));
      });

      realCb.addEventListener("change", () => {
        clone.checked = realCb.checked;
      });

      row.appendChild(clone);
      row.appendChild(span);
      hostClone.appendChild(row);
    });
  }

  function syncCloneControlsFromReal() {
    [
      ["togglePoints", "togglePoints_clone"],
      ["toggleHeat", "toggleHeat_clone"],
      ["toggleDynamicINat", "toggleDynamicINat_clone"],
      ["toggleShimmer", "toggleShimmer_clone"],
      ["toggleFog", "toggleFog_clone"],
      ["toggleFogSmoothing", "toggleFogSmoothing_clone"],
      ["toggleGodsEye", "toggleGodsEye_clone"],
      ["toggleLockLocation", "toggleLockLocation_clone"],
      ["toggleOsmBuildings", "toggleOsmBuildings_clone"]
    ].forEach(([realId, cloneId]) => {
      const real = $(realId);
      const clone = $(cloneId);
      if (real && clone) clone.checked = real.checked;
    });

    const checked = document.querySelector('input[name="heatMetric"]:checked')?.value || "count";
    document.querySelectorAll('input[name="heatMetric_clone"]').forEach(r => {
      r.checked = (r.value === checked);
    });
  }

  // --------------------------------------------------------------------------
  // Public boot
  // --------------------------------------------------------------------------

  window.initGridWildMobilePanels = function initGridWildMobilePanels() {
    const meBody = $("sheetMeBody");
    const infoBody = $("sheetInfoBody");
    const communityBody = $("sheetCommunityBody");
    const questBody = $("sheetQuestBody");
    const legendBody = $("sheetLegendBody");

    if (meBody) meBody.innerHTML = renderMeContent();
    if (infoBody) infoBody.innerHTML = renderInfoContent();
    if (communityBody) communityBody.innerHTML = renderCommunityContent();
    if (questBody) {
      questBody.innerHTML = renderQuestContent();
    }

    if (legendBody) legendBody.innerHTML = renderLegendContent();

    mirrorCheckbox("togglePoints", "togglePoints_clone");
    mirrorCheckbox("toggleHeat", "toggleHeat_clone");
    mirrorCheckbox("toggleDynamicINat", "toggleDynamicINat_clone");
    mirrorCheckbox("toggleShimmer", "toggleShimmer_clone");
    mirrorCheckbox("toggleFog", "toggleFog_clone");
    mirrorCheckbox("toggleFogSmoothing", "toggleFogSmoothing_clone");
    mirrorCheckbox("toggleGodsEye", "toggleGodsEye_clone");
    mirrorCheckbox("toggleLockLocation", "toggleLockLocation_clone");
    mirrorCheckbox("toggleOsmBuildings", "toggleOsmBuildings_clone");
    mirrorHeatMetricRadios();

    setTimeout(() => {
      if (window.GridWildQuests && questBody) {
        window.GridWildQuests.bindQuestSheetControls(questBody);
      }
      bindUserSettingsButton();
      bindINatOAuthButton();
      loadINatUserProfileIntoPanel();

      bindRecentINatButton();
      renderRecentINatList();
      renderDraftObservationsList();
      
      renderFogProgress();

      const tut1 = document.getElementById("gwReplayWelcomeBtn");
      if (tut1) {
        tut1.onclick = () => {
          if (window.GridWildOnboarding) {
            window.GridWildOnboarding.reset();
          }
        };
      }

      const tut2 = document.getElementById("gwReplayTourBtn");
      if (tut2) {
        tut2.onclick = () => {
          if (window.GridWildOnboarding) {
            window.GridWildOnboarding.launchTour();
          }
        };
      }

      buildTaxaCloneChecklist();
      syncCloneControlsFromReal();
  
      if (typeof window.paintLegendFromHeatFunction === "function") {
        window.paintLegendFromHeatFunction();
      }

      if (typeof window.updateHudCenterSummary === "function") {
        window.updateHudCenterSummary();
      }

      if (typeof window.updateTopObserversPanel === "function") {
        window.updateTopObserversPanel();
      }

      if (typeof window.updateHudCladogram === "function") {
        window.updateHudCladogram();
      }

      window.GridWildAchievements?.bindButtons?.(document);
      window.GridWildAchievements?.refreshAchievementSummary?.();

      window.GridWildCharacter?.renderSummary?.();
      window.GridWildCharacter?.bindButtons?.(document);

      window.GridWildStore?.bindButtons?.(document);
      window.GridWildInventory?.bindButtons?.(document);
      window.GridWildProfile?.bindButtons?.(document);

      window.GridWildParty?.bindSheetControls?.(document);
      window.GridWildParty?.refreshMapBeacon?.();
      window.GridWildParty?.handleJoinFromUrl?.();

      window.GridWildPlaylists?.bindButtons?.(document);
      window.GridWildPlaylists?.renderSummary?.();
      window.GridWildPlaylists?.handlePlaylistFromUrl?.();

      window.GridWildEconomy?.refreshHud?.();
      // window.GridWildOutfitter?.bind?.(document);

      const clearFogBtn = document.getElementById("gwClearFogCacheBtn");
      if (clearFogBtn) {
        clearFogBtn.onclick = clearExploredSquaresCache;
      }

      if (typeof window.initJumpToGpsControl === "function") {
       window.initJumpToGpsControl();
      }
      
    }, 50);
  };

  window.addEventListener("gwRecentINatProgress", (e) => {
        updateRecentINatProgressUI(e.detail || {});
      });

  window.refreshGridWildMobileInfo = function refreshGridWildMobileInfo() {
    if (typeof window.paintLegendFromHeatFunction === "function") {
      window.paintLegendFromHeatFunction();
    }

    if (typeof window.updateHudCenterSummary === "function") {
      window.updateHudCenterSummary();
    }

    if (typeof window.updateTopObserversPanel === "function") {
      window.updateTopObserversPanel();
    }

    if (typeof window.updateHudCladogram === "function") {
      window.updateHudCladogram();
    }


    buildTaxaCloneChecklist();
    syncCloneControlsFromReal();
  };
})();