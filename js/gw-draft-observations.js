// -----------------------------------------------------------------------------
// GridWild Draft Observations
// One observation may contain many photos.
// iNat upload/classifier are placeholders.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_draft_observations_v1";
  let activeDraftId = null;

  function nowISO() {
    return new Date().toISOString();
  }

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveDrafts(drafts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts || []));
    window.dispatchEvent(new CustomEvent("gwDraftObservationsChanged"));
  }

  function makeLocationSnapshot() {
    const lf = typeof lastFix !== "undefined" ? lastFix : null;

    const lat = lf?.latitude ?? map.getCenter().lat;
    const lng = lf?.longitude ?? map.getCenter().lng;
    const accuracy = lf?.accuracy ?? null;

    return {
      lat,
      lng,
      accuracyMeters: accuracy,
      cellKey: window.getCellKeyForLatLng
        ? window.getCellKeyForLatLng(lat, lng)
        : null
    };
  }

  function makeDraft() {
    const location = makeLocationSnapshot();

    return {
      id: `draft_obs_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      status: "draft",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      observedAt: nowISO(),
      location,
      notes: "",
      captiveCultivated: "unsure",
      suggestedId: {
        kingdom: "Unknown",
        iconicTaxon: "Unknown",
        taxonName: "",
        confidence: null,
        source: "placeholder"
      },
      photos: [],
      primaryPhotoId: null,
      handoff: {
        status: "not_sent",
        inatObservationId: null
      }
    };
  }

  function getDraft(id) {
    return loadDrafts().find(d => d.id === id) || null;
  }

  function upsertDraft(draft) {
    const drafts = loadDrafts();
    const idx = drafts.findIndex(d => d.id === draft.id);

    draft.updatedAt = nowISO();

    if (idx >= 0) drafts[idx] = draft;
    else drafts.unshift(draft);

    saveDrafts(drafts);
    return draft;
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("FileReader failed."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

    async function fileToCompressedDataURL(file, maxSide = 1400, quality = 0.72) {
    const img = new Image();
    img.src = await fileToDataURL(file);
    await img.decode();

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", quality);
    }

  async function scorePhotoPlaceholder(dataUrl) {
    // Placeholder. Later: blur, exposure, subject size, classifier.
    return {
      blurScore: null,
      exposureScore: null,
      qualityLabel: "unchecked"
    };
  }

  async function addFilesToDraft(draftId, fileList) {
    const draft = getDraft(draftId);
    if (!draft) throw new Error("No active draft observation.");

    const files = Array.from(fileList || []);
    for (const file of files) {
      const dataUrl = await fileToCompressedDataURL(file, 1400, 0.72);
      const quality = await scorePhotoPlaceholder(dataUrl);

      const photo = {
        id: `photo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        kind: "original",
        sourcePhotoId: null,
        name: file.name || "capture.jpg",
        mimeType: file.type || "image/jpeg",
        createdAt: nowISO(),
        dataUrl,
        role: draft.photos.length === 0 ? "primary" : "detail",
        quality,
        transforms: null
      };

      draft.photos.push(photo);
      if (!draft.primaryPhotoId) draft.primaryPhotoId = photo.id;
    }

    return upsertDraft(draft);
  }

  function startCaptureForNewObservation() {
    const draft = makeDraft();
    activeDraftId = draft.id;
    upsertDraft(draft);

    const input = document.getElementById("cameraInput");
    if (!input) {
      alert("Camera input is missing.");
      return;
    }

    input.click();
  }

  function addPhotoToExistingDraft(draftId) {
    activeDraftId = draftId;
    document.getElementById("cameraInput")?.click();
  }

  async function addFilesToActiveDraft(files) {
    if (!activeDraftId) {
      const draft = makeDraft();
      activeDraftId = draft.id;
      upsertDraft(draft);
    }

    return addFilesToDraft(activeDraftId, files);
  }

  function updateDraftFields(draftId, patch) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    Object.assign(draft, patch || {});
    return upsertDraft(draft);
  }

  function deleteDraft(draftId) {
    saveDrafts(loadDrafts().filter(d => d.id !== draftId));
  }

  function removePhoto(draftId, photoId) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    draft.photos = draft.photos.filter(p => p.id !== photoId);

    if (draft.primaryPhotoId === photoId) {
      draft.primaryPhotoId = draft.photos[0]?.id || null;
    }

    return upsertDraft(draft);
  }

  function setPrimaryPhoto(draftId, photoId) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    if (draft.photos.some(p => p.id === photoId)) {
      draft.primaryPhotoId = photoId;
    }

    return upsertDraft(draft);
  }

  function addDerivedPhoto(draftId, sourcePhotoId, dataUrl, transforms) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    const source = draft.photos.find(p => p.id === sourcePhotoId);
    if (!source) return null;

    draft.photos.push({
      id: `photo_copy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      kind: "derived",
      sourcePhotoId,
      name: `${source.name || "photo"} edited copy`,
      mimeType: "image/jpeg",
      createdAt: nowISO(),
      dataUrl,
      role: "detail_copy",
      quality: {
        blurScore: null,
        exposureScore: null,
        qualityLabel: "edited"
      },
      transforms
    });

    return upsertDraft(draft);
  }

  function mockSendToINaturalist(draftId) {
    const draft = getDraft(draftId);
    if (!draft) throw new Error("Draft not found.");
    if (!draft.photos.length) throw new Error("Add at least one photo first.");

    // Placeholder only. Later: OAuth + upload photos + create iNat observation.
    deleteDraft(draftId);

    const key = draft.location?.cellKey;
    if (key && window.GridWildFog) {
      window.GridWildFog.markObserved(key, {
        obsCountIncrement: 1,
        speciesCountIncrement: 0
      });
    }

    window.updateGrid?.();
    window.GridWildFogCanvas?.scheduleRender?.();

    return {
      ok: true,
      placeholder: true,
      message: "Mock handoff complete. Draft removed."
    };
  }

  window.GridWildDraftObservations = {
    loadDrafts,
    saveDrafts,
    getDraft,
    upsertDraft,
    deleteDraft,
    removePhoto,
    setPrimaryPhoto,
    addDerivedPhoto,
    updateDraftFields,
    startCaptureForNewObservation,
    addPhotoToExistingDraft,
    addFilesToActiveDraft,
    mockSendToINaturalist,
    getActiveDraftId: () => activeDraftId,
    setActiveDraftId: id => { activeDraftId = id; }
  };
})();