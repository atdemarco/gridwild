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
    const byId = new Map();
    const runtime = window.GridWildQuests?.getVisibleQuests?.() || [];
    const local = loadQuests();

    [...runtime, ...local].forEach(q => {
      if (!q) return;
      const status = String(q.status || "").toLowerCase();
      if (q.archived || q.archivedAt || status === "completed" || status === "complete") return;
      byId.set(String(q.dbId || q.id), q);
    });

    return Array.from(byId.values());
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

  const CLAIMED_STATUSES = new Set(["claimed", "submitted", "verified", "counted"]);

  function isClaimedStatus(status) {
    return CLAIMED_STATUSES.has(String(status || "").toLowerCase());
  }

  function getAllEvidenceObservations() {
  // Reward evidence must exist on iNaturalist before the server can verify it.
  return window.GridWildRecentINat?.getRecentObservations?.() || [];
}

  function syncQuestStateFromData(data) {
    if (!data) return;

    window.__gwState = window.__gwState || {};
    window.__gwState.quests = data.quests || [];
    window.__gwState.questEvidence = (data.quests || [])
      .flatMap(q => q.quest_evidence || []);

    window.GridWildQuests?.renderQuestListIntoPage?.();
    window.refreshQuestBadge?.();
    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  }

  function refreshQuestStateFromApi() {
    return window.GridWildAPI?.getQuests?.()
      .then(data => {
        syncQuestStateFromData(data);
        return data;
      })
      .catch(err => {
        console.warn("Could not refresh quests after evidence change:", err);
        return null;
      });
  }

  function addOptimisticEvidence(quest, obs) {
    const dbQuestId = quest?.dbId || quest?.id;
    const id = obsId(obs);
    if (!dbQuestId || !id) return;

    window.__gwState = window.__gwState || {};
    const evidence = window.__gwState.questEvidence || [];
    const already = evidence.some(e =>
      String(e.quest_id) === String(dbQuestId) &&
      String(e.obs_id) === id &&
      isClaimedStatus(e.status)
    );

    if (!already) {
      window.__gwState.questEvidence = [
        ...evidence,
        {
          quest_id: dbQuestId,
          obs_id: id,
          source: obs.source || "observation",
          status: "claimed",
          claimed_at: new Date().toISOString()
        }
      ];
      window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
    }
  }

  function removeOptimisticEvidence(quest, obs) {
    const dbQuestId = quest?.dbId || quest?.id;
    const id = obsId(obs);
    if (!dbQuestId || !id || !window.__gwState?.questEvidence) return;

    window.__gwState.questEvidence = window.__gwState.questEvidence.filter(e =>
      !(
        String(e.quest_id) === String(dbQuestId) &&
        String(e.obs_id) === id &&
        e.status === "claimed"
      )
    );
    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  }



  function isTaxonMatch(obs, quest) {
    const want = quest?.recipe?.iconicTaxon || "Any";
    if (want === "Any") return true;
    return String(obs?.iconic_taxon_name || "") === want;
  }

  function isEvidenceMatch(obs, quest) {
    const ev = quest?.recipe?.evidence || "";
    if (ev !== "photo_gps20") return true;

    if (obs?.source === "draft" && !(obs?._draft?.photos || []).length) {
      return false;
    }

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

  function criterionDetails(obs, quest) {
    const accuracy = Number(obs?.accuracy);
    const hasPhoto = obs?.source !== "draft" || (obs?._draft?.photos || []).length > 0;
    const needsPreciseGps = (quest?.recipe?.evidence || "") === "photo_gps20";

    return {
      taxon: {
        ok: isTaxonMatch(obs, quest),
        label: quest?.recipe?.iconicTaxon === "Any"
          ? "Any"
          : `${obs?.iconic_taxon_name || "Unknown"}`
      },
      gps: {
        ok: isEvidenceMatch(obs, quest),
        label: needsPreciseGps
          ? `${hasPhoto ? "Photo" : "No photo"} · ±${Number.isFinite(accuracy) ? Math.round(accuracy) : "?"}m`
          : "Not required"
      },
      time: {
        ok: isTimeMatch(obs, quest),
        label: obs?.observed_on ? new Date(obs.observed_on).toLocaleDateString() : "Unknown"
      },
      location: {
        ok: isLocationMatch(obs, quest),
        label: quest?.recipe?.targetLocation === "anywhere" ? "Anywhere" : (obs?.lat && obs?.lng ? "In range check" : "No GPS")
      }
    };
  }

  function getEvidenceRowsForQuest(quest) {
    return getAllEvidenceObservations()
      .map(obs => {
        const checks = criterionDetails(obs, quest);
        const ok = Object.values(checks).every(check => check.ok);
        const channel = getChannelForQuest(quest);
        const lockedTo = claimedQuestForObservationChannel(obs, channel);

        return {
          obs,
          checks,
          ok,
          already: isObservationClaimedForQuest(obs, quest),
          blocked: !!lockedTo && lockedTo !== quest.id
        };
      })
      .sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        return String(b.obs?.observed_on || "").localeCompare(String(a.obs?.observed_on || ""));
      });
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
    if (String(e.obs_id) !== id || !isClaimedStatus(e.status)) continue;

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
      isClaimedStatus(e.status)
    )) {
      return true;
    }

    return false;
  }

  function claimObservationForQuest(obs, quest, options = {}) {
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
    addOptimisticEvidence(quest, obs);

    window.GridWildAPI?.claimQuestEvidence?.(
      quest.dbId || quest.id,
      id,
      obs.source || "observation"
    ).then(() => {
      return refreshQuestStateFromApi();
    }).then(() => {
      if (options.autoComplete !== false) completeQuestIfReady(quest);
    }).catch(err => {
      removeOptimisticEvidence(quest, obs);
      console.warn("Could not sync quest evidence claim:", err);
      if (options.notifyError !== false) {
        alert(`Could not verify quest evidence: ${err?.message || "Unknown error"}`);
      }
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
      const result = claimObservationForQuest(obs, quest, { notifyError: false });
      if (result.ok) claimed += 1;
    }

    return claimed;
  }

  function getActiveQuest() {
    const activeId = window.__gwState?.activeQuestId;
    if (!activeId) return null;

    return openQuests().find(q =>
      String(q.dbId || q.id) === String(activeId) ||
      String(q.id) === String(activeId)
    ) || null;
  }

  function autoClaimDraftsForActiveQuest() {
    const quest = getActiveQuest();
    if (!quest) return 0;

    const candidates = getAllEvidenceObservations()
      .filter(o => o.source === "draft" && qualifies(o, quest));

    let claimed = 0;
    for (const obs of candidates) {
      if (isObservationClaimedForQuest(obs, quest)) continue;

      const result = claimObservationForQuest(obs, quest, { notifyError: false });
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
        isClaimedStatus(e.status)
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

  function criterionCell(check) {
    return `
      <td class="${check.ok ? "is-hit" : "is-miss"}">
        <span>${check.ok ? "Hit" : "Miss"}</span>
        <small>${esc(check.label)}</small>
      </td>
    `;
  }

  function evidenceObsName(obs) {
    return obs?.taxon || obs?.common_name || obs?.scientific_name || "Unknown observation";
  }

  function evidenceRowKey(row) {
    const obs = row?.obs || {};
    return [
      obs.source || "observation",
      obsId(obs) || "missing-id",
      obs.observed_on || "",
      obs.lat ?? "",
      obs.lng ?? ""
    ].join("::");
  }

  function renderEvidenceSelectorBody(quest) {
    const rows = getEvidenceRowsForQuest(quest);
    const progress = getQuestProgress(quest);
    const completeReady = progress.claimed >= progress.target;

    return `
      <div class="gw-evidence-selector-head">
        <div>
          <div class="gw-evidence-selector-kicker">Quest Evidence</div>
          <div class="gw-evidence-selector-title">${esc(quest?.title || "Active Quest")}</div>
          <div class="gw-evidence-selector-sub">${progress.claimed} / ${progress.target} evidence linked</div>
        </div>
        <button class="gw-evidence-selector-close" type="button" aria-label="Close evidence selector">×</button>
      </div>

      <div class="gw-quest-progressbar">
        <div style="width:${Math.min(100, 100 * progress.claimed / Math.max(1, progress.target))}%;"></div>
      </div>

      <div class="gw-evidence-selector-listbox" role="listbox" aria-label="Possible quest evidence">
        <div class="gw-evidence-selector-table-wrap">
          <table class="gw-evidence-selector-table">
            <thead>
              <tr>
                <th>Observation</th>
                <th>Taxon</th>
                <th>GPS/Photo</th>
                <th>Time</th>
                <th>Place</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((row, index) => `
                <tr class="${row.already ? "is-linked" : row.ok ? "is-qualified" : "is-unqualified"}">
                  <td>
                    <b>${esc(evidenceObsName(row.obs))}</b>
                    <small>${row.obs.source === "draft" ? "Draft" : "Observation"} · ${esc(row.obs.iconic_taxon_name || "Unknown")} · ${esc(row.obs.observed_on || "unknown date")}</small>
                  </td>
                  ${criterionCell(row.checks.taxon)}
                  ${criterionCell(row.checks.gps)}
                  ${criterionCell(row.checks.time)}
                  ${criterionCell(row.checks.location)}
                  <td>
                    ${
                      row.already
                        ? `<span class="gw-evidence-badge claimed">Linked</span>`
                        : row.blocked
                        ? `<span class="gw-evidence-badge blocked">Used</span>`
                        : row.ok
                            ? `<button class="gw-mini-btn gw-evidence-selector-claim" type="button" data-evidence-key="${esc(evidenceRowKey(row))}">Claim</button>`
                            : `<span class="gw-evidence-badge blocked">Not enough</span>`
                    }
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="6">
                    <div class="gw-evidence-selector-empty">No draft or recent observations are available yet.</div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <div class="gw-evidence-selector-actions">
        <button class="gw-quest-btn secondary gw-evidence-selector-dismiss" type="button">
          ${completeReady ? "Close" : "Not enough evidence"}
        </button>
        <button class="gw-quest-btn primary gw-evidence-selector-complete" type="button" ${completeReady ? "" : "disabled"}>
          Complete Quest
        </button>
      </div>
    `;
  }

  function bindEvidenceSelector(root, quest) {
    const close = () => root.remove();
    const refresh = () => {
      const scroller = root.querySelector(".gw-evidence-selector-table-wrap");
      const scrollTop = scroller?.scrollTop || 0;
      const scrollLeft = scroller?.scrollLeft || 0;

      root.querySelector(".gw-evidence-selector-card").innerHTML = renderEvidenceSelectorBody(quest);
      bindEvidenceSelector(root, quest);

      const nextScroller = root.querySelector(".gw-evidence-selector-table-wrap");
      if (nextScroller) {
        nextScroller.scrollTop = scrollTop;
        nextScroller.scrollLeft = scrollLeft;
      }
    };

    root.querySelector(".gw-evidence-selector-close")?.addEventListener("click", close);
    root.querySelector(".gw-evidence-selector-dismiss")?.addEventListener("click", close);
    root.onclick = evt => {
      if (evt.target === root) close();
    };

    root.querySelectorAll(".gw-evidence-selector-claim").forEach(btn => {
      btn.addEventListener("click", evt => {
        evt.stopPropagation();
        const rows = getEvidenceRowsForQuest(quest);
        const row = rows.find(candidate =>
          evidenceRowKey(candidate) === String(btn.dataset.evidenceKey)
        );
        const obs = row?.obs || null;
        const result = claimObservationForQuest(obs, quest, { autoComplete: false });

        if (!result.ok) {
          alert(result.reason || "Could not claim this observation.");
          return;
        }

        animateEvidenceClaim(btn);
        refresh();
      });
    });

    root.querySelector(".gw-evidence-selector-complete")?.addEventListener("click", async evt => {
      evt.stopPropagation();
      const ok = await completeQuestIfReady(quest);
      if (ok) close();
      else refresh();
    });
  }

  function openEvidenceSelector(quest) {
    if (!quest) return;

    document.querySelectorAll(".gw-evidence-selector-backdrop").forEach(el => el.remove());

    const root = document.createElement("div");
    root.className = "gw-evidence-selector-backdrop";
    root.innerHTML = `
      <div class="gw-evidence-selector-card">
        ${renderEvidenceSelectorBody(quest)}
      </div>
    `;

    document.body.appendChild(root);
    bindEvidenceSelector(root, quest);
  }

  const completingQuestIds = new Set();

  async function completeQuestIfReady(quest) {
    if (!quest || !(quest.source === "db" || quest.dbId)) return false;

    const progress = getQuestProgress(quest);
    if (progress.claimed < progress.target) return false;

    const questId = quest.dbId || quest.id;
    if (completingQuestIds.has(String(questId))) return false;

    completingQuestIds.add(String(questId));

    try {
      const result = await window.GridWildAPI?.completeQuest?.(questId);
      if (!result) return false;

      window.__gwState = window.__gwState || {};
      window.__gwState.player = result.player || window.__gwState.player;
      if (String(window.__gwState.activeQuestId || "") === String(questId)) {
        window.__gwState.activeQuestId = null;
      }

      quest.status = "completed";
      quest.completedAt = result.player_quest?.completed_at || new Date().toISOString();

      window.GridWildPlayerUI?.refreshPlayerUI?.();
      window.GridWildQuestLayer?.completeQuest?.(quest);
      await refreshQuestStateFromApi();

      return true;
    } catch (err) {
      console.warn("Could not auto-complete quest:", err);
      return false;
    } finally {
      completingQuestIds.delete(String(questId));
    }
  }

  function renderRecentObservationBadge(obs) {
    const matches = getObservationQuestMatches(obs);

    const id = obsId(obs);
    const evidence = window.__gwState?.questEvidence || [];

    const claimed = evidence.some(e =>
      String(e.obs_id) === id && isClaimedStatus(e.status)
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

      .gw-evidence-selector-backdrop {
        position:fixed;
        inset:0;
        z-index:99996;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:14px;
        background:rgba(8,12,10,0.68);
        box-sizing:border-box;
      }

      .gw-evidence-selector-card {
        width:min(980px, 96vw);
        height:min(620px, 88vh);
        overflow:hidden;
        display:grid;
        grid-template-rows:auto auto minmax(0, 1fr) auto;
        gap:12px;
        border-radius:20px;
        padding:14px;
        color:#efe6d3;
        background:
          radial-gradient(circle at 12% 0%, rgba(118,231,191,0.14), transparent 38%),
          linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        border:1px solid rgba(215,183,116,0.52);
        box-shadow:0 24px 80px rgba(0,0,0,0.58);
        box-sizing:border-box;
      }

      .gw-evidence-selector-head,
      .gw-evidence-selector-actions {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .gw-evidence-selector-kicker {
        font-size:10px;
        font-weight:950;
        letter-spacing:0.14em;
        text-transform:uppercase;
        color:#9ff0ce;
      }

      .gw-evidence-selector-title {
        margin-top:3px;
        font-size:18px;
        font-weight:950;
        color:#f0d18a;
      }

      .gw-evidence-selector-sub {
        margin-top:3px;
        font-size:12px;
        color:rgba(239,230,211,0.68);
      }

      .gw-evidence-selector-close {
        width:34px;
        height:34px;
        border:1px solid rgba(215,183,116,0.35);
        border-radius:10px;
        color:#f0d18a;
        background:rgba(255,255,255,0.06);
        font-size:22px;
        line-height:1;
        cursor:pointer;
      }

      .gw-evidence-selector-listbox {
        min-height:0;
        overflow:hidden;
        border-radius:14px;
        border:1px solid rgba(215,183,116,0.22);
        background:rgba(0,0,0,0.12);
      }

      .gw-evidence-selector-table-wrap {
        width:100%;
        height:100%;
        overflow:auto;
      }

      .gw-evidence-selector-table {
        width:100%;
        min-width:780px;
        border-collapse:collapse;
        font-size:12px;
      }

      .gw-evidence-selector-table th,
      .gw-evidence-selector-table td {
        padding:9px 10px;
        border-bottom:1px solid rgba(215,183,116,0.14);
        text-align:left;
        vertical-align:middle;
      }

      .gw-evidence-selector-table th {
        position:sticky;
        top:0;
        z-index:1;
        background:rgba(31,26,22,0.98);
        color:rgba(240,209,138,0.9);
        font-size:10px;
        font-weight:950;
        letter-spacing:0.08em;
        text-transform:uppercase;
      }

      .gw-evidence-selector-table td b,
      .gw-evidence-selector-table td small {
        display:block;
        max-width:230px;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .gw-evidence-selector-table td small {
        margin-top:3px;
        color:rgba(239,230,211,0.62);
      }

      .gw-evidence-selector-table td.is-hit > span {
        color:#9ff0ce;
        font-weight:950;
      }

      .gw-evidence-selector-table td.is-miss > span {
        color:#ffb7a8;
        font-weight:950;
      }

      .gw-evidence-selector-table tr.is-linked {
        background:rgba(118,231,191,0.08);
      }

      .gw-evidence-selector-table tr.is-qualified {
        background:rgba(255,224,130,0.05);
      }

      .gw-evidence-selector-empty {
        padding:14px;
        color:rgba(239,230,211,0.62);
      }

      .gw-evidence-selector-actions {
        margin-top:0;
        padding-top:12px;
        border-top:1px solid rgba(215,183,116,0.18);
        background:linear-gradient(180deg, rgba(20,17,15,0), rgba(20,17,15,0.86));
      }

      .gw-evidence-selector-complete:disabled {
        cursor:not-allowed;
        opacity:0.45;
        filter:saturate(0.5);
      }

      @media (max-width: 720px) {
        .gw-evidence-selector-card {
          height:min(600px, 92vh);
          padding:12px;
        }

        .gw-evidence-selector-head,
        .gw-evidence-selector-actions {
          align-items:stretch;
        }

        .gw-evidence-selector-actions {
          flex-direction:column;
        }

        .gw-evidence-selector-actions .gw-quest-btn {
          width:100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  injectStyles();

  window.addEventListener("gwDraftObservationsChanged", () => {
    autoClaimDraftsForActiveQuest();
  });

  window.addEventListener("gwQuestEmbarked", () => {
    autoClaimDraftsForActiveQuest();
  });

  window.GridWildQuestEvidence = {
    getCandidatesForQuest,
    getEvidenceRowsForQuest,
    getObservationQuestMatches,
    claimObservationForQuest,
    autoClaimForQuest,
    autoClaimDraftsForActiveQuest,
    getClaimedForQuest,
    getQuestProgress,
    openEvidenceSelector,
    renderRecentObservationBadge,
    renderQuestEvidencePanel,
    bindQuestEvidencePanel,
    animateEvidenceClaim
  };
})();
