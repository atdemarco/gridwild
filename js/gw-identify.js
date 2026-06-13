// -----------------------------------------------------------------------------
// GridWild Identify
// Fast, game-like identification deck for nearby iNaturalist unknowns.
// -----------------------------------------------------------------------------

(function () {
  function isClaimedStatus(status) {
    return ["claimed", "submitted", "verified", "counted"].includes(
      String(status || "").toLowerCase()
    );
  }

  const DEFAULT_RADIUS_KM = 25;
  const DEFAULT_PER_PAGE = 30;
  const MUTED_CHILD_TAXON_SHARE = 0.1;
  const CONFIDENCE_LEVELS = [
    { key: "coarse", label: "Coarse" },
    { key: "likely", label: "Likely" },
    { key: "careful", label: "Careful" }
  ];

  const KINGDOMS = [
    {
      key: "Animalia",
      id: 1,
      label: "Animals",
      scientificName: "Animalia",
      cue: "fur, feathers, shells, legs",
      className: "animal"
    },
    {
      key: "Plantae",
      id: 47126,
      label: "Plants",
      scientificName: "Plantae",
      cue: "leaves, flowers, mosses",
      className: "plant"
    },
    {
      key: "Fungi",
      id: 47170,
      label: "Fungi",
      scientificName: "Fungi",
      cue: "mushrooms, molds, lichens",
      className: "fungi"
    },
    {
      key: "Protozoa",
      id: 47686,
      label: "Protozoans",
      scientificName: "Protozoa",
      cue: "single-celled eukaryotes",
      className: "protozoa",
      showTopLevel: false
    },
    {
      key: "Chromista",
      id: 48222,
      label: "Chromists",
      scientificName: "Chromista",
      cue: "algae, kelp, diatoms",
      className: "chromista",
      showTopLevel: false
    }
  ];
  const TOP_LEVEL_KINGDOMS = KINGDOMS.filter((taxon) => taxon.showTopLevel !== false);

  const deck = {
    observations: [],
    index: 0,
    selectedTaxon: null,
    childTaxa: [],
    childParentId: null,
    childLoading: false,
    showMutedChildTaxa: false,
    loading: false,
    error: "",
    toast: "",
    lastFetchAt: null,
    radiusKm: DEFAULT_RADIUS_KM,
    selectedConfidence: "coarse",
    actionCount: 0,
    sourceKey: ""
  };

  let activeModal = null;
  let activeQuest = null;
  let accountGatePromise = null;
  const embeddedMounts = new Set();

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function compactDate(value) {
    if (!value) return "unknown date";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString();
  }

  function formatNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : "0";
  }

  function loadClaims() {
    return window.GridWildIdentificationEvidence?.loadClaims?.() || [];
  }

  function saveClaims(claims) {
    window.GridWildIdentificationEvidence?.saveClaims?.(claims);
  }

  function loadSkips() {
    return window.GridWildIdentificationEvidence?.loadSkips?.() || [];
  }

  function skipObservation(obs, reason = "uncertain") {
    return window.GridWildIdentificationEvidence?.skipObservation?.(obs, reason) || null;
  }

  function questKey(quest) {
    return String(quest?.dbId || quest?.id || "");
  }

  function isIdentificationQuest(questOrRecipe) {
    const r = questOrRecipe?.recipe || questOrRecipe || {};
    return (
      String(questOrRecipe?.quest_type || "").toLowerCase() === "identify" ||
      r.objectiveType === "identify_unknowns" ||
      r.evidence === "identification" ||
      r.evidenceType === "identification"
    );
  }

  function getClaimedForQuest(quest) {
    return window.GridWildIdentificationEvidence?.getClaimedForQuest?.(quest) || [];
  }

  function getQuestProgress(quest) {
    const target = Number(
      quest?.recipe?.quantity || quest?.recipe?.targetCount || quest?.targetCount || 1
    );
    return {
      claimed: getClaimedForQuest(quest).length,
      target: Number.isFinite(target) && target > 0 ? target : 1
    };
  }

  function isLinkedAccount() {
    return !!window.GridWildINatAuth?.isConnected?.();
  }

  function linkedAccountLabel() {
    if (!isLinkedAccount()) return "Not linked";
    const token = window.GridWildINatAuth?.getToken?.() || "";
    const user = window.GridWildINatAuth?.getUsername?.() || "iNaturalist";
    return token.startsWith("mock:") ? `Mock linked: ${user}` : `Linked: ${user}`;
  }

  function getGpsFix() {
    if (typeof lastFix !== "undefined" && lastFix) {
      const lat = Number(lastFix.latitude);
      const lng = Number(lastFix.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng, source: "gps" };
      }
    }

    if (typeof map !== "undefined" && map?.getCenter) {
      const c = map.getCenter();
      if (Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng))) {
        return { lat: Number(c.lat), lng: Number(c.lng), source: "map" };
      }
    }

    const locale = window.__gwQuestLocale || null;
    if (Number.isFinite(Number(locale?.lat)) && Number.isFinite(Number(locale?.lng))) {
      return { lat: Number(locale.lat), lng: Number(locale.lng), source: "locale" };
    }

    return { lat: 38.911325, lng: -77.076678, source: "fallback" };
  }

  function getPhotoUrl(obs) {
    const photo = obs?.photos?.[0] || {};
    return (
      photo.medium_url ||
      photo.large_url ||
      photo.url?.replace(/square\./, "medium.") ||
      photo.url ||
      ""
    );
  }

  function normalizeUnknownObservation(obs) {
    if (!obs || !obs.id) return null;

    const coords = obs.geojson?.coordinates || [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    return {
      id: String(obs.id),
      uri: obs.uri || `https://www.inaturalist.org/observations/${encodeURIComponent(obs.id)}`,
      photoUrl: getPhotoUrl(obs),
      observedOn: obs.observed_on || obs.time_observed_at || obs.created_at || null,
      createdAt: obs.created_at || null,
      place: obs.place_guess || "",
      user: obs.user?.login || "",
      description: obs.description || "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }

  function patchPolygonTargetForQuest(quest) {
    const target = quest?.recipe?.target || null;
    const mode = quest?.recipe?.targetLocation || target?.mode || "";
    if (mode !== "patch_polygon" || !Array.isArray(target?.rings) || !target.rings.length)
      return null;
    return target;
  }

  function pointInRing(point, ring = []) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      const intersects =
        pi.lat > point.lat !== pj.lat > point.lat &&
        point.lng <
          ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat || 1e-12) + pi.lng;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInRings(point, rings = []) {
    return rings.some((ring) => pointInRing(point, ring));
  }

  function unknownMatchesQuestSource(obs, quest) {
    const target = patchPolygonTargetForQuest(quest);
    if (!target) return true;
    if (!Number.isFinite(Number(obs?.lat)) || !Number.isFinite(Number(obs?.lng))) return false;
    return pointInRings({ lat: Number(obs.lat), lng: Number(obs.lng) }, target.rings);
  }

  function sourceKeyForQuest(quest, options = {}) {
    const target = patchPolygonTargetForQuest(quest);
    if (target) {
      return `patch:${target.patchId || ""}:${target.generatedAt || ""}:${target.rings.map((ring) => ring.length).join(".")}`;
    }
    const fix = options.fix || getGpsFix();
    return `nearby:${Number(fix.lat).toFixed(5)},${Number(fix.lng).toFixed(5)}:${options.radiusKm || deck.radiusKm || DEFAULT_RADIUS_KM}`;
  }

  function shouldFetchForQuest(quest, options = {}) {
    return !deck.observations.length || deck.sourceKey !== sourceKeyForQuest(quest, options);
  }

  function buildUnknownsUrl(options = {}) {
    const quest = options.quest || activeQuest;
    const recipe = quest?.recipe || quest || {};
    const target = patchPolygonTargetForQuest(quest);
    const fix =
      target && Number.isFinite(Number(target.lat)) && Number.isFinite(Number(target.lng))
        ? { lat: Number(target.lat), lng: Number(target.lng), source: "patch" }
        : options.fix || getGpsFix();
    const url = new URL("https://api.inaturalist.org/v1/observations");

    url.searchParams.set("identified", "false");
    url.searchParams.set("photos", "true");
    url.searchParams.set("geo", "true");
    url.searchParams.set("quality_grade", "needs_id");
    url.searchParams.set("captive", "false");
    url.searchParams.set("order_by", "created_at");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(options.perPage || DEFAULT_PER_PAGE));
    url.searchParams.set("lat", String(fix.lat));
    url.searchParams.set("lng", String(fix.lng));
    const radiusKm = target
      ? Math.max(0.2, Math.min(200, Number(target.radiusMeters || 0) / 1000 || DEFAULT_RADIUS_KM))
      : options.radiusKm || deck.radiusKm || DEFAULT_RADIUS_KM;
    url.searchParams.set("radius", String(radiusKm));
    url.searchParams.set("geoprivacy", "open");
    url.searchParams.set("taxon_geoprivacy", "open");
    if (recipe.iconicTaxon && recipe.iconicTaxon !== "Any") {
      url.searchParams.set("iconic_taxa", recipe.iconicTaxon);
    }
    if (recipe.target?.taxonId) {
      url.searchParams.set("taxon_id", String(recipe.target.taxonId));
    }

    return url;
  }

  async function fetchUnknownObservations(options = {}) {
    const quest = options.quest || activeQuest || null;
    const sourceKey = sourceKeyForQuest(quest, options);
    deck.loading = true;
    deck.error = "";
    deck.toast = "";
    rerenderActiveModal();
    rerenderQuestSheetPanel();

    try {
      const url = buildUnknownsUrl(options);
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`iNaturalist unknowns request failed: HTTP ${resp.status}`);

      const data = await resp.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      deck.observations = results
        .map(normalizeUnknownObservation)
        .filter((obs) => unknownMatchesQuestSource(obs, quest))
        .filter(Boolean);
      deck.index = 0;
      deck.selectedTaxon = null;
      deck.childTaxa = [];
      deck.childParentId = null;
      deck.showMutedChildTaxa = false;
      deck.lastFetchAt = nowISO();
      deck.actionCount = 0;
      deck.sourceKey = sourceKey;

      if (!deck.observations.length) {
        const target = patchPolygonTargetForQuest(quest);
        deck.toast = target
          ? `No unknowns came back inside ${target.patchName || "this Patch"}.`
          : "No nearby unknowns came back for this area.";
      }
    } catch (err) {
      console.warn("Could not load unknown observations:", err);
      deck.error = err.message || "Could not load nearby unknowns.";
    } finally {
      deck.loading = false;
      rerenderActiveModal();
      rerenderQuestSheetPanel();
    }

    return deck.observations;
  }

  function currentObservation() {
    if (!deck.observations.length) return null;
    const safeIndex =
      ((deck.index % deck.observations.length) + deck.observations.length) %
      deck.observations.length;
    return deck.observations[safeIndex] || null;
  }

  function selectedTaxonId() {
    return String(deck.selectedTaxon?.id || "");
  }

  function selectTaxon(taxon) {
    deck.selectedTaxon = {
      key: taxon.key || taxon.name || String(taxon.id),
      id: Number(taxon.id),
      label: taxon.label || taxon.preferred_common_name || taxon.name || "Selected taxon",
      scientificName: taxon.scientificName || taxon.name || taxon.label || "Selected taxon",
      defaultPhoto:
        taxon.defaultPhoto ||
        taxon.default_photo?.square_url ||
        taxon.default_photo?.medium_url ||
        "",
      className: taxon.className || ""
    };
    deck.toast = "";

    if (deck.childParentId !== deck.selectedTaxon.id) {
      deck.childTaxa = [];
      deck.childParentId = null;
      deck.showMutedChildTaxa = false;
    }

    rerenderActiveModal();
  }

  function advanceDeck() {
    if (deck.observations.length) {
      deck.index = (deck.index + 1) % deck.observations.length;
    }
    deck.selectedTaxon = null;
    deck.childTaxa = [];
    deck.childParentId = null;
    deck.showMutedChildTaxa = false;
    deck.toast = "";
    deck.actionCount += 1;
    rerenderActiveModal();
  }

  function skipCurrentObservation(reason = "uncertain") {
    const obs = currentObservation();
    if (obs) {
      skipObservation(obs, reason);
    }
    advanceDeck();
    deck.toast = "Skipped for now.";
    rerenderActiveModal();
    rerenderQuestSheetPanel();
  }

  function childTaxaUrl(parentId) {
    const url = new URL("https://api.inaturalist.org/v1/taxa");
    url.searchParams.set("parent_id", String(parentId));
    url.searchParams.set("is_active", "true");
    url.searchParams.set("per_page", "12");
    url.searchParams.set("order", "desc");
    url.searchParams.set("order_by", "observations_count");
    return url;
  }

  async function loadChildTaxa() {
    const parent = deck.selectedTaxon;
    if (!parent?.id) {
      deck.toast = "Pick a kingdom first.";
      rerenderActiveModal();
      return [];
    }

    deck.childLoading = true;
    deck.toast = "";
    rerenderActiveModal();

    try {
      const resp = await fetch(childTaxaUrl(parent.id).toString());
      if (!resp.ok) throw new Error(`Taxonomy request failed: HTTP ${resp.status}`);

      const data = await resp.json();
      const rows = Array.isArray(data?.results) ? data.results : [];
      deck.childTaxa = rows
        .map((t) => ({
          key: String(t.id || t.name || ""),
          id: Number(t.id),
          label: t.preferred_common_name || t.name || "Unnamed taxon",
          scientificName: t.name || "",
          rank: t.rank || "",
          observationsCount: Number(t.observations_count || 0),
          defaultPhoto: t.default_photo?.square_url || t.default_photo?.medium_url || ""
        }))
        .filter((t) => Number.isFinite(t.id) && t.id > 0);
      deck.childParentId = parent.id;
      deck.showMutedChildTaxa = false;

      if (!deck.childTaxa.length) {
        deck.toast = "No immediate children loaded for that taxon.";
      }
    } catch (err) {
      console.warn("Could not load child taxa:", err);
      deck.toast = err.message || "Could not load taxonomy children.";
    } finally {
      deck.childLoading = false;
      rerenderActiveModal();
    }

    return deck.childTaxa;
  }

  function claimExists(claims, quest, obs) {
    return (
      window.GridWildIdentificationEvidence?.hasClaimForObservation?.(quest, obs) ||
      claims.some(
        (claim) =>
          String(claim.questId || "") === questKey(quest) &&
          String(claim.observationId || "") === String(obs?.id || "") &&
          isClaimedStatus(claim.status)
      )
    );
  }

  function addOptimisticQuestEvidence(quest, claim) {
    const qid = questKey(quest);
    if (!qid || !claim?.observationId) return;

    window.__gwState = window.__gwState || {};
    const evidence = window.__gwState.questEvidence || [];
    const already = evidence.some(
      (e) =>
        String(e.quest_id) === qid &&
        String(e.obs_id) === String(claim.observationId) &&
        e.source === "identification" &&
        isClaimedStatus(e.status)
    );

    if (already) return;

    window.__gwState.questEvidence = [
      ...evidence,
      {
        quest_id: qid,
        obs_id: String(claim.observationId),
        source: "identification",
        status: "claimed",
        claimed_at: claim.claimedAt,
        taxon_id: claim.taxonId,
        taxon_name: claim.taxonName
      }
    ];
  }

  async function completeQuestIfReady(quest) {
    if (!quest || !(quest.source === "db" || quest.dbId)) return false;
    const progress = getQuestProgress(quest);
    if (progress.claimed < progress.target) return false;

    try {
      const result = await window.GridWildAPI?.completeQuest?.(quest.dbId || quest.id);
      if (!result) return false;

      window.__gwState = window.__gwState || {};
      window.__gwState.player = result.player || window.__gwState.player;
      if (String(window.__gwState.activeQuestId || "") === String(quest.dbId || quest.id)) {
        window.__gwState.activeQuestId = null;
      }

      quest.status = "completed";
      quest.completedAt = result.player_quest?.completed_at || nowISO();

      window.GridWildPlayerUI?.refreshPlayerUI?.();
      window.GridWildQuestLayer?.completeQuest?.(quest);
      window.GridWildQuests?.renderQuestListIntoPage?.();
      window.refreshQuestBadge?.();
      deck.toast = result.already_rewarded
        ? "Quest already completed."
        : `Quest complete: +${formatNum(result.reward || 0)} XP`;
      return true;
    } catch (err) {
      console.warn("Could not complete identification quest:", err);
      deck.toast = err.message || "Could not complete quest.";
      return false;
    }
  }

  async function submitIdentificationClaim(quest = activeQuest) {
    const obs = currentObservation();
    if (!obs) {
      deck.toast = "Load unknown observations first.";
      rerenderActiveModal();
      return { ok: false, reason: deck.toast };
    }

    if (!deck.selectedTaxon?.id) {
      deck.toast = "Pick an ID before submitting.";
      rerenderActiveModal();
      return { ok: false, reason: deck.toast };
    }

    const linked = await ensureLinkedAccount({ reason: "submit" });
    if (!linked) {
      deck.toast = "Identification not submitted.";
      rerenderActiveModal();
      return { ok: false, reason: "iNaturalist account is not linked." };
    }

    const claims = loadClaims();
    if (quest && claimExists(claims, quest, obs)) {
      deck.toast = "Already claimed for this quest.";
      advanceDeck();
      return { ok: false, reason: deck.toast };
    }

    const claimed = await window.GridWildIdentifyService?.claimIdentification?.({
      observation: obs,
      taxon: deck.selectedTaxon,
      confidence: deck.selectedConfidence,
      quest
    });

    if (!claimed?.ok) {
      deck.toast = claimed?.reason || "Identification was not claimed.";
      rerenderActiveModal();
      return { ok: false, reason: deck.toast };
    }

    const claim = claimed.claim;
    addOptimisticQuestEvidence(quest, claim);

    window.dispatchEvent(
      new CustomEvent("gwIdentificationClaimed", {
        detail: { claim, quest, observation: obs }
      })
    );

    const claimMessage = claimed.submission?.pendingRealSubmit
      ? `Local ID claim saved: ${claim.taxonCommonName || claim.taxonName}`
      : `ID claimed: ${claim.taxonCommonName || claim.taxonName}`;
    await completeQuestIfReady(quest);
    advanceDeck();
    deck.toast = claimMessage;
    rerenderActiveModal();
    rerenderQuestSheetPanel();

    return { ok: true, claim };
  }

  function findQuestById(id) {
    const key = String(id || "");
    if (!key) return null;
    const visible = window.GridWildQuests?.getVisibleQuests?.() || [];
    const local = window.GridWildQuests?.loadQuests?.() || [];
    return (
      [...visible, ...local].find((q) => String(q.id) === key || String(q.dbId || "") === key) ||
      null
    );
  }

  function observationImageHtml(obs) {
    if (obs?.photoUrl) {
      return `<img class="gw-identify-photo" src="${esc(obs.photoUrl)}" alt="Unknown iNaturalist observation" loading="lazy" decoding="async">`;
    }

    return `
      <div class="gw-identify-photo-placeholder" aria-hidden="true">
        <span>?</span>
      </div>
    `;
  }

  function kingdomButtonHtml(taxon) {
    const selected = selectedTaxonId() === String(taxon.id);
    return `
      <button
        class="gw-identify-kingdom ${esc(taxon.className)} ${selected ? "is-selected" : ""}"
        type="button"
        data-gw-identify-taxon="${esc(taxon.key)}"
      >
        <span class="gw-identify-kingdom-mark" aria-hidden="true">${esc(taxon.label.slice(0, 1))}</span>
        <span class="gw-identify-kingdom-main">${esc(taxon.label)}</span>
        <span class="gw-identify-kingdom-sub">${esc(taxon.cue)}</span>
      </button>
    `;
  }

  function splitChildTaxaByShare() {
    const total = deck.childTaxa.reduce(
      (sum, taxon) => sum + Math.max(0, Number(taxon.observationsCount) || 0),
      0
    );

    if (total <= 0) {
      return { common: deck.childTaxa, muted: [], total };
    }

    return deck.childTaxa.reduce(
      (groups, taxon) => {
        const count = Math.max(0, Number(taxon.observationsCount) || 0);
        const bucket = count / total < MUTED_CHILD_TAXON_SHARE ? groups.muted : groups.common;
        bucket.push(taxon);
        return groups;
      },
      { common: [], muted: [], total }
    );
  }

  function childTaxonButtonHtml(taxon, options = {}) {
    const muted = options.muted === true;
    const rank = taxon.rank || taxon.scientificName || "";

    return `
      <button
        class="gw-identify-child ${muted ? "is-muted" : ""}"
        type="button"
        data-gw-identify-child="${esc(taxon.id)}"
      >
        ${
          taxon.defaultPhoto
            ? `<img src="${esc(taxon.defaultPhoto)}" alt="" loading="lazy" decoding="async">`
            : `<span class="gw-identify-child-fallback" aria-hidden="true">${esc(taxon.label.slice(0, 1))}</span>`
        }
        <span>
          <b>${esc(taxon.label)}</b>
          <small>${formatNum(taxon.observationsCount)} obs${rank ? ` - ${esc(rank)}` : ""}</small>
        </span>
      </button>
    `;
  }

  function childTaxaHtml() {
    const selected = deck.selectedTaxon;

    if (!selected?.id) {
      return `
        <div class="gw-identify-key-empty">
          <b>More Specific</b>
          <span>No taxon selected.</span>
        </div>
      `;
    }

    if (deck.childLoading) {
      return `
        <div class="gw-identify-key-empty">
          <b>${esc(selected.label)}</b>
          <span>Loading taxonomy...</span>
        </div>
      `;
    }

    if (!deck.childTaxa.length) {
      return `
        <div class="gw-identify-key-empty">
          <b>${esc(selected.label)}</b>
          <span>Use More Specific to load visual children.</span>
          <a href="https://www.inaturalist.org/taxa/${esc(selected.id)}" target="_blank" rel="noopener">Open taxonomy</a>
        </div>
      `;
    }

    const split = splitChildTaxaByShare();
    const hasMuted = split.muted.length > 0;

    return `
      <div class="gw-identify-key-head">
        <span>
          <b>${esc(selected.label)}</b>
          <small>${esc(selected.scientificName || "")}</small>
        </span>
        <a href="https://www.inaturalist.org/taxa/${esc(selected.id)}" target="_blank" rel="noopener">Open iNat</a>
      </div>

      <div class="gw-identify-child-grid">
        ${split.common.map((taxon) => childTaxonButtonHtml(taxon)).join("")}
        ${
          hasMuted
            ? `
          <button
            class="gw-identify-child-more"
            type="button"
            data-gw-identify-toggle-muted
            aria-expanded="${deck.showMutedChildTaxa ? "true" : "false"}"
          >
            ${deck.showMutedChildTaxa ? "Less" : "More..."}
          </button>
          ${
            deck.showMutedChildTaxa
              ? `
            <div class="gw-identify-child-muted-list">
              ${split.muted.map((taxon) => childTaxonButtonHtml(taxon, { muted: true })).join("")}
            </div>
          `
              : ""
          }
        `
            : ""
        }
      </div>
    `;
  }

  function confidenceButtonHtml(level) {
    const selected = deck.selectedConfidence === level.key;
    return `
      <button
        class="gw-identify-confidence ${selected ? "is-selected" : ""}"
        type="button"
        data-gw-identify-confidence="${esc(level.key)}"
      >
        ${esc(level.label)}
      </button>
    `;
  }

  function renderIdentifyBody(quest = activeQuest, options = {}) {
    const embedded = options.embedded === true;
    const obs = currentObservation();
    const progress = quest && isIdentificationQuest(quest) ? getQuestProgress(quest) : null;
    const skipped = obs && window.GridWildIdentificationEvidence?.hasSkippedObservation?.(obs);

    return `
      <div class="gw-identify-head">
        <div>
          <div class="gw-identify-kicker">iNaturalist Identify</div>
          <div class="gw-identify-title">${quest ? esc(quest.title || "Identify Quest") : "Identify Unknowns"}</div>
          <div class="gw-identify-sub">
            ${progress ? `${progress.claimed} / ${progress.target} IDs claimed` : `${formatNum(deck.observations.length)} nearby unknowns`}
            <span>${esc(linkedAccountLabel())}</span>
          </div>
        </div>
        ${embedded ? "" : `<button class="gw-identify-close" type="button" aria-label="Close Identify">x</button>`}
      </div>

      <div class="gw-identify-workbench ${deck.loading ? "is-loading" : ""}">
        <section class="gw-identify-stage">
          ${
            deck.loading
              ? `<div class="gw-identify-empty">Loading nearby unknowns...</div>`
              : deck.error
                ? `<div class="gw-identify-empty">${esc(deck.error)}</div>`
                : obs
                  ? `
                    <div class="gw-identify-photo-wrap">
                      ${observationImageHtml(obs)}
                    </div>
                    <div class="gw-identify-obs-meta">
                      <span>Unknown observation</span>
                      ${skipped ? `<span>Previously skipped</span>` : ""}
                      <span>${esc(compactDate(obs.observedOn || obs.createdAt))}</span>
                      ${obs.user ? `<span>@${esc(obs.user)}</span>` : ""}
                      ${obs.place ? `<span>${esc(obs.place)}</span>` : ""}
                      <a href="${esc(obs.uri)}" target="_blank" rel="noopener">Open observation</a>
                    </div>
                  `
                  : `<div class="gw-identify-empty">No unknowns loaded.</div>`
          }
        </section>

        <section class="gw-identify-controls">
          <div class="gw-identify-kingdom-grid">
            ${TOP_LEVEL_KINGDOMS.map(kingdomButtonHtml).join("")}
          </div>

          <div class="gw-identify-actions">
            <button class="gw-identify-action secondary" type="button" data-gw-identify-skip>Skip</button>
            <button class="gw-identify-action secondary" type="button" data-gw-identify-more>More Specific</button>
            <button class="gw-identify-action primary" type="button" data-gw-identify-submit>Submit</button>
          </div>

          ${deck.toast ? `<div class="gw-identify-toast">${esc(deck.toast)}</div>` : ""}
        </section>

        <aside class="gw-identify-key-pane">
          ${childTaxaHtml()}
        </aside>
      </div>

      <div class="gw-identify-foot">
        <button class="gw-identify-foot-btn" type="button" data-gw-identify-refresh>
          Refresh Unknowns
        </button>
        ${
          embedded
            ? ""
            : `
          <button class="gw-identify-foot-btn" type="button" data-gw-classloop-open onclick="event.preventDefault(); event.stopPropagation(); window.GridWildClassroomLoop && window.GridWildClassroomLoop.open(); return false;">
            Classroom
          </button>
          <button class="gw-identify-foot-btn" type="button" data-gw-classroom-open onclick="event.preventDefault(); event.stopPropagation(); window.GridWildClassroom && window.GridWildClassroom.open(); return false;">
            Old Classroom
          </button>
        `
        }
        <button class="gw-identify-foot-btn" type="button" data-gw-inat-account-gate>
          Account
        </button>
      </div>
    `;
  }

  function bindIdentifyModal(root, quest, options = {}) {
    if (options.embedded !== true) {
      root.querySelector(".gw-identify-close")?.addEventListener("click", () => root.remove());
      root.onclick = (evt) => {
        if (evt.target === root) root.remove();
      };
    }

    root.querySelectorAll("[data-gw-identify-taxon]").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const taxon = KINGDOMS.find((k) => k.key === btn.dataset.gwIdentifyTaxon);
        if (taxon) selectTaxon(taxon);
      });
    });

    root.querySelectorAll("[data-gw-identify-child]").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const taxon = deck.childTaxa.find(
          (t) => String(t.id) === String(btn.dataset.gwIdentifyChild)
        );
        if (taxon) selectTaxon(taxon);
      });
    });

    root.querySelector("[data-gw-identify-toggle-muted]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      deck.showMutedChildTaxa = !deck.showMutedChildTaxa;
      rerenderActiveModal();
    });

    root.querySelectorAll("[data-gw-identify-confidence]").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        deck.selectedConfidence = btn.dataset.gwIdentifyConfidence || "coarse";
        rerenderActiveModal();
      });
    });

    root.querySelector("[data-gw-identify-skip]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      skipCurrentObservation();
    });

    root.querySelector("[data-gw-identify-submit]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      submitIdentificationClaim(quest);
    });

    root.querySelector("[data-gw-identify-more]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      loadChildTaxa();
    });

    root.querySelector("[data-gw-identify-refresh]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      fetchUnknownObservations({ quest });
    });

    root.querySelector("[data-gw-inat-account-gate]")?.addEventListener("click", (evt) => {
      evt.stopPropagation();
      ensureLinkedAccount({ reason: "status" });
    });
  }

  function rerenderEmbeddedPanes() {
    embeddedMounts.forEach((mount) => {
      if (!mount?.isConnected) {
        embeddedMounts.delete(mount);
        return;
      }
      const quest = mount.__gwIdentifyQuest || null;
      mount.innerHTML = renderIdentifyBody(quest, { embedded: true });
      bindIdentifyModal(mount, quest, { embedded: true });
    });
  }

  function rerenderActiveModal() {
    if (activeModal?.isConnected) {
      const card = activeModal.querySelector(".gw-identify-modal");
      if (card) {
        card.innerHTML = renderIdentifyBody(activeQuest);
        bindIdentifyModal(activeModal, activeQuest);
      }
    }
    rerenderEmbeddedPanes();
  }

  function mountEmbeddedPane(target, options = {}) {
    const mount = typeof target === "string" ? document.querySelector(target) : target;
    if (!mount) return null;

    injectStyles();
    mount.__gwIdentifyQuest = options.quest || null;
    mount.classList.add("gw-identify-embed-mount");
    embeddedMounts.add(mount);
    mount.innerHTML = renderIdentifyBody(mount.__gwIdentifyQuest, { embedded: true });
    bindIdentifyModal(mount, mount.__gwIdentifyQuest, { embedded: true });

    if (options.fetch !== false && !deck.loading && shouldFetchForQuest(mount.__gwIdentifyQuest)) {
      fetchUnknownObservations({ quest: mount.__gwIdentifyQuest });
    }

    return {
      destroy() {
        embeddedMounts.delete(mount);
        mount.innerHTML = "";
      }
    };
  }

  function openIdentifyDialog(quest = null) {
    activeQuest = quest || null;
    document.querySelectorAll(".gw-identify-backdrop").forEach((el) => el.remove());

    const root = document.createElement("div");
    root.className = "gw-identify-backdrop";
    root.innerHTML = `
      <div class="gw-identify-modal">
        ${renderIdentifyBody(activeQuest)}
      </div>
    `;

    activeModal = root;
    document.body.appendChild(root);
    bindIdentifyModal(root, activeQuest);

    if (!deck.loading && shouldFetchForQuest(activeQuest)) {
      fetchUnknownObservations({ quest: activeQuest });
    }
  }

  function renderQuestSheetPanel() {
    const claims = loadClaims();
    const skips = loadSkips();
    const linked = isLinkedAccount();
    const count = deck.observations.length;
    const latest = claims[0];

    return `
      <div class="gw-card gw-identify-sheet-card" id="gwIdentifySheetPanel">
        <div class="gw-identify-sheet-head">
          <div>
            <div class="gw-card-title">Identify Unknowns</div>
            <div class="gw-identify-sheet-sub">
              ${count ? `${formatNum(count)} nearby unknowns loaded` : "Nearby unknowns ready to load"}
            </div>
          </div>
          <span class="gw-identify-account-pill ${linked ? "is-linked" : ""}">
            ${esc(linked ? "Linked" : "Needs iNat")}
          </span>
        </div>

        <div class="gw-identify-sheet-stats">
          <span>
            <b>${formatNum(claims.length)}</b>
            <small>Mock IDs</small>
          </span>
          <span>
            <b>${formatNum(skips.length)}</b>
            <small>Skipped</small>
          </span>
          <span>
            <b>${deck.lastFetchAt ? compactDate(deck.lastFetchAt) : "--"}</b>
            <small>Loaded</small>
          </span>
        </div>

        ${
          latest
            ? `
          <div class="gw-identify-latest">
            Last ID: ${esc(latest.taxonCommonName || latest.taxonName || "taxon")}
          </div>
        `
            : ""
        }

        <div class="gw-identify-sheet-actions">
          <button class="gw-mini-btn" type="button" data-gw-identify-open>
            Open Identify
          </button>
          <button class="gw-mini-btn" type="button" data-gw-classloop-open onclick="event.preventDefault(); event.stopPropagation(); window.GridWildClassroomLoop && window.GridWildClassroomLoop.open(); return false;">
            Classroom
          </button>
          <button class="gw-mini-btn" type="button" data-gw-classroom-open onclick="event.preventDefault(); event.stopPropagation(); window.GridWildClassroom && window.GridWildClassroom.open(); return false;">
            Old Classroom
          </button>
          <button class="gw-mini-btn" type="button" data-gw-identify-refresh>
            Refresh Unknowns
          </button>
        </div>
      </div>
    `;
  }

  function rerenderQuestSheetPanel() {
    const panel = document.getElementById("gwIdentifySheetPanel");
    if (!panel) return;
    panel.outerHTML = renderQuestSheetPanel();
  }

  function renderQuestEvidencePanel(quest) {
    const progress = getQuestProgress(quest);
    const claims = getClaimedForQuest(quest);

    return `
      <div class="gw-identify-evidence-panel" id="gwIdentifyEvidencePanel">
        <div class="gw-identify-evidence-head">
          <div>
            <div class="gw-identify-evidence-title">Identification Evidence</div>
            <div class="gw-muted" style="font-size:11px;">
              ${progress.claimed} / ${progress.target} IDs claimed
            </div>
          </div>
          <button
            class="gw-quest-btn secondary"
            type="button"
            data-gw-identify-open
            data-quest-id="${esc(questKey(quest))}"
          >
            Open Identify
          </button>
        </div>

        <div class="gw-quest-progressbar">
          <div style="width:${Math.min(100, (100 * progress.claimed) / Math.max(1, progress.target))}%;"></div>
        </div>

        ${
          claims.length
            ? `<div class="gw-list" style="margin-top:10px;">
                ${claims
                  .slice(0, 6)
                  .map(
                    (claim) => `
                  <div class="gw-rowline">
                    <span style="min-width:0;">
                      <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${esc(claim.taxonCommonName || claim.taxonName || "Identification")}
                      </span>
                      <span class="gw-muted" style="font-size:11px;">
                        Obs ${esc(claim.observationId)} - ${esc(compactDate(claim.claimedAt))}
                      </span>
                    </span>
                    <span class="gw-evidence-badge claimed">ID</span>
                  </div>
                `
                  )
                  .join("")}
              </div>`
            : `<div class="gw-muted" style="font-size:12px;margin-top:10px;">No identification claims yet.</div>`
        }
      </div>
    `;
  }

  function openAccountGateDialog(resolve, options = {}) {
    document.querySelectorAll(".gw-identify-account-backdrop").forEach((el) => el.remove());

    const username = window.GridWildINatAuth?.getUsername?.() || "gridwild-identifier";
    const root = document.createElement("div");
    root.className = "gw-identify-account-backdrop";
    root.innerHTML = `
      <div class="gw-identify-account-modal">
        <div class="gw-identify-kicker">iNaturalist Account</div>
        <div class="gw-identify-title">Account link required</div>
        <div class="gw-identify-account-copy">
          Identification quests need an iNaturalist account before they can be accepted or completed.
        </div>
        <label class="gw-identify-account-label">
          Username
          <input id="gwIdentifyMockUsername" type="text" value="${esc(username)}" autocomplete="username">
        </label>
        <div class="gw-identify-account-actions">
          <a class="gw-identify-foot-btn" href="https://www.inaturalist.org/signup" target="_blank" rel="noopener">Create</a>
          <a class="gw-identify-foot-btn" href="/.netlify/functions/inat-oauth-start">Login</a>
          <button class="gw-identify-action primary" type="button" data-gw-identify-mock-link>Use Mock Link</button>
          <button class="gw-identify-action secondary" type="button" data-gw-identify-cancel-link>Cancel</button>
        </div>
      </div>
    `;

    const finish = (value) => {
      root.remove();
      accountGatePromise = null;
      resolve(value);
      rerenderActiveModal();
      rerenderQuestSheetPanel();
    };

    root.querySelector("[data-gw-identify-mock-link]")?.addEventListener("click", () => {
      const input = root.querySelector("#gwIdentifyMockUsername");
      const clean =
        String(input?.value || "gridwild-identifier")
          .trim()
          .replace(/^@+/, "") || "gridwild-identifier";
      window.GridWildINatAuth?.setUsername?.(clean);
      window.GridWildINatAuth?.setToken?.(`mock:${clean}:${Date.now()}`);
      finish(true);
    });

    root
      .querySelector("[data-gw-identify-cancel-link]")
      ?.addEventListener("click", () => finish(false));
    root.addEventListener("click", (evt) => {
      if (evt.target === root) finish(false);
    });

    document.body.appendChild(root);

    if (options.reason === "accept") {
      root.querySelector("#gwIdentifyMockUsername")?.focus();
    }
  }

  function ensureLinkedAccount(options = {}) {
    if (isLinkedAccount()) return Promise.resolve(true);
    if (accountGatePromise) return accountGatePromise;

    accountGatePromise = new Promise((resolve) => {
      openAccountGateDialog(resolve, options);
    });

    return accountGatePromise;
  }

  function injectStyles() {
    if (document.getElementById("gwIdentifyStyles")) return;

    const style = document.createElement("style");
    style.id = "gwIdentifyStyles";
    style.textContent = `
      .gw-identify-sheet-card,
      .gw-identify-evidence-panel {
        border-color: rgba(118, 231, 191, 0.28);
        background:
          linear-gradient(180deg, rgba(18, 42, 38, 0.78), rgba(29, 24, 20, 0.72));
      }

      .gw-identify-sheet-head,
      .gw-identify-evidence-head,
      .gw-identify-head,
      .gw-identify-foot,
      .gw-identify-account-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-identify-sheet-sub,
      .gw-identify-sub {
        margin-top: 3px;
        color: rgba(239,230,211,0.68);
        font-size: 12px;
      }

      .gw-identify-sub {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .gw-identify-account-pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 3px 8px;
        border-radius: 999px;
        color: #ffd8d2;
        background: rgba(170,55,45,0.20);
        border: 1px solid rgba(255,130,110,0.30);
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }

      .gw-identify-account-pill.is-linked {
        color: #9ee6bd;
        background: rgba(80,220,140,0.10);
        border-color: rgba(80,220,140,0.28);
      }

      .gw-identify-sheet-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 12px 0 10px;
      }

      .gw-identify-sheet-stats span {
        min-width: 0;
        padding: 9px;
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.16);
        background: rgba(255,255,255,0.06);
      }

      .gw-identify-sheet-stats b,
      .gw-identify-sheet-stats small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-identify-sheet-stats b {
        color: #f0d18a;
        font-size: 14px;
      }

      .gw-identify-sheet-stats small,
      .gw-identify-latest {
        color: rgba(239,230,211,0.62);
        font-size: 11px;
      }

      .gw-identify-sheet-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .gw-identify-backdrop,
      .gw-identify-account-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99998;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        background: rgba(8, 12, 10, 0.72);
        box-sizing: border-box;
      }

      .gw-identify-modal,
      .gw-identify-account-modal {
        width: min(1120px, 96vw);
        max-height: 92vh;
        overflow: hidden;
        color: #efe6d3;
        border-radius: 20px;
        border: 1px solid rgba(118, 231, 191, 0.42);
        background:
          radial-gradient(circle at 10% 0%, rgba(118,231,191,0.13), transparent 34%),
          linear-gradient(180deg, rgba(34,38,31,0.99), rgba(15,18,16,0.99));
        box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        box-sizing: border-box;
      }

      .gw-identify-modal {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 12px;
        height: min(760px, 92vh);
        padding: 14px;
      }

      .gw-identify-embed-mount {
        min-height: 560px;
        height: 100%;
        color: #efe6d3;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 12px;
      }

      .gw-identify-account-modal {
        width: min(520px, 94vw);
        padding: 18px;
      }

      .gw-identify-kicker {
        color: #9ff0ce;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .gw-identify-title {
        margin-top: 3px;
        color: #f0d18a;
        font-size: 20px;
        font-weight: 950;
        line-height: 1.12;
      }

      .gw-identify-close {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        border: 1px solid rgba(215,183,116,0.35);
        color: #f0d18a;
        background: rgba(255,255,255,0.06);
        font-size: 17px;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-identify-workbench {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr) minmax(250px, 0.72fr);
        gap: 12px;
      }

      .gw-identify-stage,
      .gw-identify-controls,
      .gw-identify-key-pane {
        min-height: 0;
        overflow: hidden;
        border: 1px solid rgba(215,183,116,0.18);
        border-radius: 14px;
        background: rgba(0,0,0,0.16);
      }

      .gw-identify-stage {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
      }

      .gw-identify-photo-wrap {
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.2);
      }

      .gw-identify-photo {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .gw-identify-photo-placeholder,
      .gw-identify-empty {
        min-height: 260px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(239,230,211,0.68);
        font-size: 13px;
        text-align: center;
        padding: 18px;
      }

      .gw-identify-photo-placeholder span {
        width: 82px;
        height: 82px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #f0d18a;
        border: 2px solid rgba(240,209,138,0.28);
        font-size: 46px;
        font-weight: 950;
      }

      .gw-identify-obs-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        padding: 10px;
        color: rgba(239,230,211,0.72);
        font-size: 11px;
      }

      .gw-identify-obs-meta span,
      .gw-identify-obs-meta a {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-identify-obs-meta a,
      .gw-identify-key-head a,
      .gw-identify-key-empty a {
        color: #9ff0ce;
        text-decoration: none;
        font-weight: 900;
      }

      .gw-identify-controls {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto auto;
        gap: 10px;
        padding: 10px;
      }

      .gw-identify-kingdom-grid {
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .gw-identify-kingdom {
        min-width: 0;
        min-height: 86px;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        grid-template-rows: auto auto;
        align-items: center;
        column-gap: 8px;
        padding: 10px;
        border-radius: 8px;
        border: 2px solid rgba(255,255,255,0.10);
        color: #10251d;
        cursor: pointer;
        text-align: left;
        box-shadow: inset 0 -12px 0 rgba(0,0,0,0.06);
      }

      .gw-identify-kingdom.animal { background: #f7c66f; }
      .gw-identify-kingdom.plant { background: #8ee09d; }
      .gw-identify-kingdom.fungi { background: #d7b0ff; }
      .gw-identify-kingdom.protozoa { background: #8fd7ff; }
      .gw-identify-kingdom.chromista { background: #ffb38f; }

      .gw-identify-kingdom.is-selected {
        border-color: #fff6d5;
        box-shadow:
          0 0 0 3px rgba(255,246,213,0.24),
          inset 0 -12px 0 rgba(0,0,0,0.06);
      }

      .gw-identify-kingdom-mark {
        grid-row: 1 / span 2;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.55);
        color: rgba(0,0,0,0.58);
        font-size: 22px;
        font-weight: 950;
      }

      .gw-identify-kingdom-main,
      .gw-identify-kingdom-sub {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-identify-kingdom-main {
        font-size: 16px;
        font-weight: 950;
        white-space: nowrap;
      }

      .gw-identify-kingdom-sub {
        color: rgba(0,0,0,0.68);
        font-size: 11px;
        line-height: 1.2;
      }

      .gw-identify-actions {
        display: grid;
        grid-template-columns: 0.85fr 1.1fr 1fr;
        gap: 8px;
      }

      .gw-identify-confidence-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      .gw-identify-confidence {
        min-width: 0;
        min-height: 30px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.22);
        color: rgba(239,230,211,0.74);
        background: rgba(255,255,255,0.06);
        font-size: 11px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-identify-confidence.is-selected {
        color: #10251d;
        background: #9ff0ce;
        border-color: rgba(255,255,255,0.48);
      }

      .gw-identify-action,
      .gw-identify-foot-btn {
        min-height: 38px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.28);
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 950;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      .gw-identify-action.primary {
        color: #10251d;
        background: linear-gradient(180deg, #ffe082, #d7b774);
      }

      .gw-identify-action.secondary,
      .gw-identify-foot-btn {
        color: #f0d18a;
        background: rgba(255,255,255,0.07);
      }

      .gw-identify-toast {
        min-height: 28px;
        display: flex;
        align-items: center;
        padding: 7px 9px;
        border-radius: 8px;
        color: #9ff0ce;
        background: rgba(118,231,191,0.10);
        border: 1px solid rgba(118,231,191,0.22);
        font-size: 12px;
        font-weight: 850;
      }

      .gw-identify-key-pane {
        padding: 10px;
        overflow: auto;
      }

      .gw-identify-key-empty {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        color: rgba(239,230,211,0.62);
        font-size: 12px;
      }

      .gw-identify-key-empty b,
      .gw-identify-key-head b {
        color: #f0d18a;
        font-size: 13px;
      }

      .gw-identify-key-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }

      .gw-identify-key-head span,
      .gw-identify-key-head small {
        display: block;
        min-width: 0;
      }

      .gw-identify-key-head small {
        margin-top: 2px;
        color: rgba(239,230,211,0.58);
        font-size: 11px;
      }

      .gw-identify-child-grid {
        display: grid;
        gap: 8px;
      }

      .gw-identify-child-muted-list {
        display: grid;
        gap: 6px;
      }

      .gw-identify-child {
        min-width: 0;
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-height: 62px;
        padding: 7px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.18);
        color: #efe6d3;
        background: rgba(255,255,255,0.06);
        text-align: left;
        cursor: pointer;
      }

      .gw-identify-child.is-muted {
        grid-template-columns: 38px minmax(0, 1fr);
        min-height: 48px;
        padding: 5px 7px;
        color: rgba(239,230,211,0.58);
        background: rgba(255,255,255,0.035);
        border-color: rgba(215,183,116,0.12);
      }

      .gw-identify-child img,
      .gw-identify-child-fallback {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        object-fit: cover;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(240,209,138,0.12);
        color: #f0d18a;
        font-weight: 950;
      }

      .gw-identify-child.is-muted img,
      .gw-identify-child.is-muted .gw-identify-child-fallback {
        width: 38px;
        height: 38px;
        border-radius: 7px;
        opacity: 0.68;
        filter: saturate(0.7);
      }

      .gw-identify-child b,
      .gw-identify-child small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-identify-child b {
        font-size: 12px;
      }

      .gw-identify-child small {
        color: rgba(239,230,211,0.58);
        font-size: 11px;
        margin-top: 2px;
      }

      .gw-identify-child.is-muted b {
        color: rgba(239,230,211,0.68);
        font-size: 11px;
      }

      .gw-identify-child.is-muted small {
        color: rgba(239,230,211,0.44);
        font-size: 10px;
      }

      .gw-identify-child-more {
        min-width: 0;
        min-height: 34px;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.20);
        color: rgba(240,209,138,0.88);
        background: rgba(255,255,255,0.055);
        font-size: 12px;
        font-weight: 950;
        cursor: pointer;
      }

      .gw-identify-foot {
        padding-top: 2px;
      }

      .gw-identify-evidence-panel {
        margin-top: 14px;
        padding: 12px;
        border-radius: 18px;
        border: 1px solid rgba(118,231,191,0.24);
      }

      .gw-identify-evidence-title {
        color: #9ff0ce;
        font-size: 13px;
        font-weight: 950;
      }

      .gw-identify-account-copy {
        margin: 10px 0 14px;
        color: rgba(239,230,211,0.72);
        font-size: 13px;
        line-height: 1.35;
      }

      .gw-identify-account-label {
        display: grid;
        gap: 6px;
        color: rgba(239,230,211,0.74);
        font-size: 12px;
        font-weight: 900;
      }

      .gw-identify-account-label input {
        width: 100%;
        box-sizing: border-box;
        border-radius: 10px;
        border: 1px solid rgba(215,183,116,0.28);
        background: rgba(255,255,255,0.08);
        color: #efe6d3;
        padding: 10px 11px;
        font: inherit;
      }

      .gw-identify-account-actions {
        flex-wrap: wrap;
        margin-top: 14px;
      }

      @media (max-width: 920px) {
        .gw-identify-backdrop {
          align-items: stretch;
          justify-content: center;
          padding: 10px;
        }

        .gw-identify-modal {
          width: min(620px, 100%);
          display: flex;
          flex-direction: column;
          height: calc(100vh - 20px);
          height: calc(100dvh - 20px);
          max-height: calc(100vh - 20px);
          max-height: calc(100dvh - 20px);
        }

        .gw-identify-head,
        .gw-identify-foot {
          flex: 0 0 auto;
        }

        .gw-identify-workbench {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: none;
          grid-auto-rows: auto;
          align-content: start;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-right: 2px;
        }

        .gw-identify-stage {
          flex: 0 0 auto;
          min-height: 0;
          grid-template-rows: auto auto;
        }

        .gw-identify-photo-wrap {
          min-height: 220px;
          max-height: 42dvh;
          aspect-ratio: 4 / 3;
        }

        .gw-identify-controls {
          flex: 0 0 auto;
          grid-template-rows: auto auto auto;
          overflow: visible;
        }

        .gw-identify-kingdom-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .gw-identify-key-pane {
          flex: 0 0 auto;
          min-height: 0;
          max-height: none;
          overflow: visible;
        }

        .gw-identify-key-empty {
          min-height: 130px;
        }
      }

      @media (max-width: 520px) {
        .gw-identify-backdrop {
          padding: 0;
        }

        .gw-identify-modal {
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          max-height: 100vh;
          max-height: 100dvh;
          min-height: 0;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
          padding: 10px;
        }

        .gw-identify-foot,
        .gw-identify-evidence-head {
          align-items: stretch;
          flex-direction: column;
        }

        .gw-identify-head {
          align-items: flex-start;
          padding-right: 42px;
          box-sizing: border-box;
        }

        .gw-identify-title {
          font-size: 18px;
        }

        .gw-identify-close {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 34px;
          height: 34px;
        }

        .gw-identify-workbench {
          gap: 10px;
        }

        .gw-identify-photo-wrap {
          min-height: 180px;
          max-height: 34dvh;
          aspect-ratio: 1 / 1;
        }

        .gw-identify-photo-placeholder,
        .gw-identify-empty {
          min-height: 180px;
        }

        .gw-identify-obs-meta {
          gap: 6px;
          padding: 8px;
        }

        .gw-identify-kingdom-grid {
          grid-template-columns: minmax(0, 1fr);
          gap: 7px;
        }

        .gw-identify-kingdom {
          min-height: 66px;
          grid-template-columns: 36px minmax(0, 1fr);
          padding: 8px;
        }

        .gw-identify-kingdom-mark {
          width: 34px;
          height: 34px;
          font-size: 18px;
        }

        .gw-identify-kingdom-main {
          font-size: 14px;
        }

        .gw-identify-actions {
          grid-template-columns: minmax(0, 1fr);
        }

        .gw-identify-key-pane {
          max-height: none;
        }

        .gw-identify-sheet-stats {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `;

    document.head.appendChild(style);
  }

  document.addEventListener("click", (evt) => {
    const openBtn = evt.target.closest("[data-gw-identify-open]");
    if (openBtn) {
      evt.preventDefault();
      evt.stopPropagation();
      openIdentifyDialog(findQuestById(openBtn.dataset.questId));
      return;
    }

    const refreshBtn = evt.target.closest("[data-gw-identify-refresh]");
    if (refreshBtn) {
      evt.preventDefault();
      evt.stopPropagation();
      fetchUnknownObservations();
      return;
    }

    const accountBtn = evt.target.closest("[data-gw-inat-account-gate]");
    if (accountBtn) {
      evt.preventDefault();
      evt.stopPropagation();
      ensureLinkedAccount({ reason: "status" });
    }
  });

  document.addEventListener("keydown", (evt) => {
    if (!activeModal?.isConnected) return;
    if (document.querySelector(".gw-identify-account-backdrop")) return;
    if (evt.target?.matches?.("input, textarea, select")) return;

    const key = String(evt.key || "");
    const idx = Number(key) - 1;

    if (idx >= 0 && idx < TOP_LEVEL_KINGDOMS.length) {
      evt.preventDefault();
      selectTaxon(TOP_LEVEL_KINGDOMS[idx]);
      return;
    }

    if (key === "Enter") {
      evt.preventDefault();
      submitIdentificationClaim(activeQuest);
      return;
    }

    if (key === " " || key === "ArrowRight") {
      evt.preventDefault();
      skipCurrentObservation();
      return;
    }

    if (key.toLowerCase() === "m") {
      evt.preventDefault();
      loadChildTaxa();
    }
  });

  window.addEventListener("gwINatAuthChanged", () => {
    rerenderActiveModal();
    rerenderQuestSheetPanel();
  });

  window.addEventListener("gwIdentificationSkipsChanged", () => {
    rerenderActiveModal();
    rerenderQuestSheetPanel();
  });

  window.addEventListener("gwIdentificationClaimsChanged", () => {
    rerenderActiveModal();
    rerenderQuestSheetPanel();
  });

  injectStyles();

  window.GridWildIdentify = {
    KINGDOMS,
    TOP_LEVEL_KINGDOMS,
    CONFIDENCE_LEVELS,
    fetchUnknownObservations,
    openIdentifyDialog,
    mountEmbeddedPane,
    ensureLinkedAccount,
    submitIdentificationClaim,
    renderQuestSheetPanel,
    renderQuestEvidencePanel,
    getClaimedForQuest,
    getQuestProgress,
    isIdentificationQuest,
    getDeck: () => ({ ...deck }),
    loadClaims
  };
})();
