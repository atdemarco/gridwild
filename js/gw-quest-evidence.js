// -----------------------------------------------------------------------------
// GridWild Quest Evidence
// Manual/assisted linking of recent observations to open quests.
// -----------------------------------------------------------------------------

(function () {
  const QUEST_STORAGE_KEY = "gw_quests_v1";
  const LINK_STORAGE_KEY = "gw_quest_evidence_links_v1";
  const MAX_GPS_ACCURACY_M = 20;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function loadQuests() {
    try {
      const raw = localStorage.getItem(QUEST_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadLinks() {
    try {
      const raw = localStorage.getItem(LINK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveLinks(links) {
    localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(links || {}));
    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  }

  function openQuests() {
    return loadQuests().filter(q =>
      !q.archived &&
      !q.archivedAt &&
      q.status !== "completed" &&
      q.status !== "complete"
    );
  }

  function getChannelForQuest(quest) {
    const r = quest?.recipe || {};
    if (quest?.source === "today") return "daily";
    if (r.surveyId && r.surveyId !== "none") return "survey";
    return "codex";
  }

  function obsId(obs) {
    return String(obs?.id || "");
  }

  function normalizeDraftAsObservation(draft) {
  return {
    id: draft.id,
    source: "draft",
    taxon: draft?.suggestedId?.taxonName || "Draft observation",
    common_name: "",
    scientific_name: draft?.suggestedId?.taxonName || "",
    iconic_taxon_name: draft?.suggestedId?.iconicTaxon || "Unknown",
    observed_on: draft?.observedAt || draft?.createdAt || draft?.updatedAt,
    accuracy: draft?.location?.accuracyMeters,
    lat: draft?.location?.lat,
    lng: draft?.location?.lng,
    _draft: draft
  };
}

function getAllEvidenceObservations() {
  const recent = window.GridWildRecentINat?.getRecentObservations?.() || [];

  const drafts = (window.GridWildDraftObservations?.loadDrafts?.() || [])
    .filter(d => d.status !== "sent" && d.status !== "deleted")
    .map(normalizeDraftAsObservation);

  return [...recent, ...drafts];
}


  function isTaxonMatch(obs, quest) {
    const want = quest?.recipe?.iconicTaxon || "Any";
    if (want === "Any") return true;
    return String(obs?.iconic_taxon_name || "") === want;
  }

  function isEvidenceMatch(obs, quest) {
    const ev = quest?.recipe?.evidence || "";
    if (ev !== "photo_gps20") return true;

    const acc = Number(obs?.accuracy);
    return Number.isFinite(acc) && acc > 0 && acc <= MAX_GPS_ACCURACY_M;
  }

  function isTimeMatch(obs, quest) {
    const timeframe = quest?.recipe?.timeframe || "today";
    const d = obs?.observed_on ? new Date(obs.observed_on) : null;
    if (!d || Number.isNaN(d.getTime())) return true;

    const now = new Date();
    const ageMs = now.getTime() - d.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    if (timeframe === "now" || timeframe === "today") return ageMs <= 1.5 * dayMs;
    if (timeframe === "week") return ageMs <= 8 * dayMs;
    if (timeframe === "weekend") return ageMs <= 4 * dayMs;

    return true;
  }

  function isLocationMatch(obs, quest) {
    const target = quest?.recipe?.target || null;
    const mode = quest?.recipe?.targetLocation || target?.mode || "anywhere";

    if (!target || mode === "anywhere") return true;
    if (!Number.isFinite(Number(obs?.lat)) || !Number.isFinite(Number(obs?.lng))) return false;
    if (typeof window.getCellKeyForLatLng !== "function") return true;

    const key = window.getCellKeyForLatLng(obs.lat, obs.lng);
    const [ix, iy] = key.split(",").map(Number);

    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return false;
    if (!Number.isFinite(Number(target.ix)) || !Number.isFinite(Number(target.iy))) return true;

    const radius = Number(target.radiusCells ?? 0);
    return Math.abs(ix - Number(target.ix)) <= radius &&
           Math.abs(iy - Number(target.iy)) <= radius;
  }

  function qualifies(obs, quest) {
    return (
      isTaxonMatch(obs, quest) &&
      isEvidenceMatch(obs, quest) &&
      isTimeMatch(obs, quest) &&
      isLocationMatch(obs, quest)
    );
  }

  function getObservationQuestMatches(obs) {
    return openQuests().filter(q => qualifies(obs, q));
  }

    function getCandidatesForQuest(quest) {
    return getAllEvidenceObservations().filter(o => qualifies(o, quest));
    }

function claimedQuestForObservationChannel(obs, channel) {
  const id = obsId(obs);
  const evidence = window.__gwState?.questEvidence || [];
  const quests = window.GridWildQuests?.getVisibleQuests?.() || [];

  for (const e of evidence) {
    if (String(e.obs_id) !== id || e.status !== "claimed") continue;

    const q = quests.find(x =>
      String(x.dbId || x.id) === String(e.quest_id)
    );

    if (!q) continue;

    if (getChannelForQuest(q) === channel) {
      return q.id;
    }
  }

  return null;
}

  function isObservationClaimedForQuest(obs, quest) {
    const id = obsId(obs);

    const dbEvidence = window.__gwState?.questEvidence || [];
    const dbQuestId = quest.dbId || quest.id;

    if (dbEvidence.some(e =>
      String(e.quest_id) === String(dbQuestId) &&
      String(e.obs_id) === String(id) &&
      e.status === "claimed"
    )) {
      return true;
    }

    return false;
  }

  function claimObservationForQuest(obs, quest) {
    if (!obs || !quest) return { ok: false, reason: "Missing observation or quest." };
    if (!qualifies(obs, quest)) return { ok: false, reason: "Observation does not qualify." };

    const channel = getChannelForQuest(quest);
    const already = claimedQuestForObservationChannel(obs, channel);

    if (already && already !== quest.id) {
      return {
        ok: false,
        reason: `Already claimed for another ${channel} quest.`
      };
    }

    const id = obsId(obs);

    window.GridWildAPI?.claimQuestEvidence?.(
      quest.dbId || quest.id,
      id,
      obs.source || "observation"
    ).then(() => {
      window.GridWildAPI?.getQuests?.()
        .then(data => {
          window.__gwState = window.__gwState || {};
          window.__gwState.quests = data.quests || [];
          window.GridWildQuests?.renderQuestListIntoPage?.();
          window.refreshQuestBadge?.();
        })
        .catch(err => {
          console.warn("Could not refresh quests after evidence claim:", err);
        });
    }).catch(err => {
      console.warn("Could not sync quest evidence claim:", err);
    });

    return {
      ok: true,
      link: {
        questId: quest.id,
        obsId: id,
        channel,
        status: "claimed",
        claimedAt: new Date().toISOString(),
        dbBacked: true
      }
    };
  }

  function autoClaimForQuest(quest) {
    const candidates = getCandidatesForQuest(quest);
    let claimed = 0;

    for (const obs of candidates) {
      const result = claimObservationForQuest(obs, quest);
      if (result.ok) claimed += 1;
    }

    return claimed;
  }

  function getClaimedForQuest(quest) {
    const dbQuestId = quest.dbId || quest.id;
    const evidence = window.__gwState?.questEvidence || [];
    const obs = getAllEvidenceObservations();
    const byId = new Map(obs.map(o => [obsId(o), o]));

    return evidence
      .filter(e =>
        String(e.quest_id) === String(dbQuestId) &&
        e.status === "claimed"
      )
      .map(e => byId.get(String(e.obs_id)))
      .filter(Boolean);
  }

  function getQuestProgress(quest) {
    const claimed = getClaimedForQuest(quest).length;
    const target = Number(quest?.recipe?.quantity || quest?.targetCount || 1);
    return {
      claimed,
      target: Number.isFinite(target) && target > 0 ? target : 1
    };
  }

  function renderRecentObservationBadge(obs) {
    const matches = getObservationQuestMatches(obs);

    const id = obsId(obs);
    const evidence = window.__gwState?.questEvidence || [];

    const claimed = evidence.some(e =>
      String(e.obs_id) === id && e.status === "claimed"
    );
    if (claimed) {
      return `<span class="gw-evidence-badge claimed" title="Already linked to a quest">🔗</span>`;
    }

    if (!matches.length) return "";

    return `
      <span class="gw-evidence-badge candidate" title="Qualifies for ${matches.length} open quest${matches.length === 1 ? "" : "s"}">
        ⚡${matches.length > 1 ? matches.length : ""}
      </span>
    `;
  }

  function renderQuestEvidencePanel(quest) {
    const progress = getQuestProgress(quest);
    const candidates = getCandidatesForQuest(quest);
    const channel = getChannelForQuest(quest);

    return `
      <div class="gw-quest-evidence-panel" id="gwQuestEvidencePanel" data-quest-id="${esc(quest.id)}">
        <div class="gw-quest-evidence-head">
          <div>
            <div class="gw-quest-evidence-title">Evidence</div>
            <div class="gw-muted" style="font-size:11px;">
              ${progress.claimed} / ${progress.target} claimed · ${esc(channel)} credit channel
            </div>
          </div>

          <button class="gw-quest-btn secondary gw-auto-claim-btn" type="button">
            Auto Claim Candidates
          </button>
        </div>

        <div class="gw-quest-progressbar">
          <div style="width:${Math.min(100, 100 * progress.claimed / Math.max(1, progress.target))}%;"></div>
        </div>

        <div class="gw-quest-evidence-subtitle">
          Relevant Finds (${candidates.length})
        </div>

        ${
          candidates.length
            ? `<div class="gw-list">
                ${candidates.slice(0, 20).map(o => {
                  const already = isObservationClaimedForQuest(o, quest);
                  const lockedTo = claimedQuestForObservationChannel(o, channel);
                  const blocked = lockedTo && lockedTo !== quest.id;

                  return `
                    <div class="gw-rowline gw-evidence-row" data-obs-id="${esc(obsId(o))}">
                      <span style="min-width:0;">
                        <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${esc(o.taxon || o.common_name || o.scientific_name || "Unknown taxon")}
                        </span>
                        <span class="gw-muted" style="font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${o.source === "draft" ? "Draft · " : ""}${esc(o.iconic_taxon_name || "Unknown")} · ${esc(o.observed_on || "unknown date")} · ±${Math.round(Number(o.accuracy) || 0)}m
                        </span>
                      </span>

                      ${
                        already
                          ? `<span class="gw-evidence-badge claimed">Linked</span>`
                          : blocked
                            ? `<span class="gw-evidence-badge blocked">Used</span>`
                            : `<button class="gw-mini-btn gw-claim-evidence-btn" type="button" data-obs-id="${esc(obsId(o))}">Claim</button>`
                      }
                    </div>
                  `;
                }).join("")}
              </div>`
            : `<div class="gw-muted" style="font-size:12px;">No matching recent observations yet.</div>`
        }
      </div>
    `;
  }

  function animateEvidenceClaim(fromEl) {
    if (!fromEl) return;

    const from = fromEl.getBoundingClientRect();
    const toEl = document.querySelector(".gw-quest-modal-title") || document.body;
    const to = toEl.getBoundingClientRect();

    const ghost = document.createElement("div");
    ghost.className = "gw-evidence-claim-ghost";
    ghost.textContent = "📎 Evidence logged!";
    ghost.style.left = `${from.left + from.width / 2}px`;
    ghost.style.top = `${from.top + from.height / 2}px`;

    document.body.appendChild(ghost);

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(0.72)`;
      ghost.style.opacity = "0";
    });

    setTimeout(() => ghost.remove(), 720);
  }

  function bindQuestEvidencePanel(root, quest) {
    const panel = root.querySelector("#gwQuestEvidencePanel");
    if (!panel) return;

    function refreshPanel() {
      panel.outerHTML = renderQuestEvidencePanel(quest);
      bindQuestEvidencePanel(root, quest);
    }

    panel.querySelectorAll(".gw-claim-evidence-btn").forEach(btn => {
      btn.addEventListener("click", evt => {
        evt.stopPropagation();

        const obs = getAllEvidenceObservations()
          .find(o => obsId(o) === String(btn.dataset.obsId));

        const result = claimObservationForQuest(obs, quest);
        if (!result.ok) {
          alert(result.reason || "Could not claim this observation.");
          return;
        }

        animateEvidenceClaim(btn);
        refreshPanel();
      });
    });

    panel.querySelector(".gw-auto-claim-btn")?.addEventListener("click", evt => {
      evt.stopPropagation();
      const n = autoClaimForQuest(quest);
      animateEvidenceClaim(evt.currentTarget);
      refreshPanel();
      if (!n) alert("No additional eligible observations could be claimed.");
    });
  }

  function injectStyles() {
    if (document.getElementById("gwQuestEvidenceStyles")) return;

    const style = document.createElement("style");
    style.id = "gwQuestEvidenceStyles";
    style.textContent = `
      .gw-evidence-badge {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:24px;
        min-height:22px;
        padding:3px 7px;
        border-radius:999px;
        font-size:11px;
        font-weight:950;
        white-space:nowrap;
        border:1px solid rgba(240,209,138,0.24);
      }

      .gw-evidence-badge.candidate {
        color:#1f271d;
        background:linear-gradient(180deg,#ffe082,#d7b774);
        box-shadow:0 0 10px rgba(255,224,130,0.24);
      }

      .gw-evidence-badge.claimed {
        color:#9ee6bd;
        background:rgba(80,220,140,0.10);
        border-color:rgba(80,220,140,0.28);
      }

      .gw-evidence-badge.blocked {
        color:rgba(239,230,211,0.58);
        background:rgba(255,255,255,0.06);
      }

      .gw-quest-evidence-panel {
        margin-top:14px;
        padding:12px;
        border-radius:18px;
        background:rgba(255,255,255,0.06);
        border:1px solid rgba(215,183,116,0.22);
      }

      .gw-quest-evidence-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .gw-quest-evidence-title {
        font-size:13px;
        font-weight:950;
        color:#f0d18a;
      }

      .gw-quest-evidence-subtitle {
        margin:10px 0 7px;
        font-size:11px;
        font-weight:950;
        letter-spacing:0.08em;
        text-transform:uppercase;
        color:rgba(240,209,138,0.82);
      }

      .gw-quest-progressbar {
        margin-top:10px;
        height:10px;
        overflow:hidden;
        border-radius:999px;
        background:rgba(0,0,0,0.24);
        border:1px solid rgba(215,183,116,0.14);
      }

      .gw-quest-progressbar > div {
        height:100%;
        border-radius:999px;
        background:linear-gradient(90deg, rgba(118,231,191,0.9), rgba(255,224,130,0.95));
        transition:width 180ms ease;
      }

      .gw-evidence-claim-ghost {
        position:fixed;
        z-index:100000;
        pointer-events:none;
        transform:translate(0,0) scale(1);
        transition:transform 700ms cubic-bezier(.2,.85,.2,1), opacity 700ms ease;
        padding:8px 10px;
        border-radius:999px;
        background:#ffe082;
        color:#1f271d;
        font-size:12px;
        font-weight:950;
        box-shadow:0 12px 30px rgba(0,0,0,0.32);
      }
    `;

    document.head.appendChild(style);
  }

  injectStyles();

  window.GridWildQuestEvidence = {
    getCandidatesForQuest,
    getObservationQuestMatches,
    claimObservationForQuest,
    autoClaimForQuest,
    getClaimedForQuest,
    getQuestProgress,
    renderRecentObservationBadge,
    renderQuestEvidencePanel,
    bindQuestEvidencePanel,
    animateEvidenceClaim
  };
})();