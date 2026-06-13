// -----------------------------------------------------------------------------
// GridWild Draft Observations
// One observation may contain many photos.
// iNat upload/classifier are placeholders.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_draft_observations_v1";
  const PRIMARY_CAPTURE_MAX_SIDE = 1000;
  const PRIMARY_CAPTURE_QUALITY = 0.62;
  const FALLBACK_CAPTURE_MAX_SIDE = 720;
  const FALLBACK_CAPTURE_QUALITY = 0.5;
  const SERVER_PREVIEW_LINEAR_RATIO = 0.05;
  const SERVER_PREVIEW_MIN_SIDE = 96;
  const SERVER_PREVIEW_MAX_SIDE = 240;
  const SERVER_PREVIEW_QUALITY = 0.48;
  const SERVER_MIRROR_DEBOUNCE_MS = 1400;
  const SERVER_MIRROR_MAX_DRAFTS = 50;
  const SERVER_PREVIEW_POLICY = "gridwild_preview_linear_5pct";
  let activeDraftId = null;
  let mirrorTimer = null;
  let mirrorSyncInFlight = false;
  let mirrorSyncQueued = false;
  let mirrorUnavailableUntil = 0;
  let serverHydratedForPlayerId = null;

  function nowISO() {
    return new Date().toISOString();
  }

  function isServerMirrorEligible() {
    return Boolean(
      window.GridWildAPI?.getPlayerId?.() &&
      window.GridWildAPI?.getSessionToken?.() &&
      window.GridWildAPI?.upsertDraftObservationMirrors
    );
  }

  function noteMirrorUnavailable(unavailable = true) {
    if (!unavailable) return;
    mirrorUnavailableUntil = Date.now() + 60 * 1000;
  }

  function suppressMirrorError(err) {
    const message = String(err?.message || "");
    if (err?.status === 401 || /GridWild login expired|account session/i.test(message)) return;
    if (/draft_observations|schema cache|relation .* does not exist/i.test(message)) {
      noteMirrorUnavailable(true);
      return;
    }

    console.warn("Could not mirror draft observations:", err);
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

  function isQuotaExceededError(err) {
    if (err?.isGridWildDraftQuotaError) return true;

    return (
      err?.name === "QuotaExceededError" ||
      err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err?.name === "GridWildDraftQuotaError" ||
      err?.code === 22 ||
      err?.code === 1014 ||
      /quota|exceeded/i.test(String(err?.message || ""))
    );
  }

  function compactDraftsForStorage(drafts) {
    return (drafts || [])
      .filter((draft) => {
        if (!draft?.id) return false;
        if (draft.id === activeDraftId) return true;
        if ((draft.photos || []).length > 0) return true;
        if (String(draft.notes || "").trim()) return true;
        return draft.handoff?.status && draft.handoff.status !== "not_sent";
      })
      .map((draft) => {
        if (draft.status !== "uploaded") return draft;

        return {
          ...draft,
          photos: [],
          primaryPhotoId: null,
          storageCompactedAt: nowISO()
        };
      });
  }

  function saveDrafts(drafts, options = {}) {
    const rows = drafts || [];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch (err) {
      if (!isQuotaExceededError(err)) throw err;

      const compacted = compactDraftsForStorage(rows);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
      } catch (retryErr) {
        if (!isQuotaExceededError(retryErr)) throw retryErr;

        const storageErr = new Error(
          "Draft photo storage quota is full. Delete or upload older draft observations, then try again."
        );
        storageErr.name = "GridWildDraftQuotaError";
        storageErr.isGridWildDraftQuotaError = true;
        throw storageErr;
      }
    }

    window.dispatchEvent(new CustomEvent("gwDraftObservationsChanged"));
    if (options.mirror !== false) {
      scheduleServerMirror();
    }
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
      cellKey: window.getCellKeyForLatLng ? window.getCellKeyForLatLng(lat, lng) : null
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
    return loadDrafts().find((d) => d.id === id) || null;
  }

  function upsertDraft(draft) {
    const drafts = loadDrafts();
    const idx = drafts.findIndex((d) => d.id === draft.id);

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

  function dataUrlByteLength(dataUrl) {
    const text = String(dataUrl || "");
    const b64 = text.split(",")[1] || "";
    return Math.round((b64.length * 3) / 4);
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read draft image."));
      img.src = dataUrl;
    });
  }

  async function fileToCompressedImage(
    file,
    maxSide = PRIMARY_CAPTURE_MAX_SIDE,
    quality = PRIMARY_CAPTURE_QUALITY
  ) {
    const img = new Image();
    img.src = await fileToDataURL(file);
    await img.decode();

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return {
      dataUrl,
      originalWidth: img.width,
      originalHeight: img.height,
      storedWidth: canvas.width,
      storedHeight: canvas.height,
      sourceSizeBytes: Number(file.size) || null,
      storedSizeBytes: dataUrlByteLength(dataUrl)
    };
  }

  async function fileToCompressedDataURL(
    file,
    maxSide = PRIMARY_CAPTURE_MAX_SIDE,
    quality = PRIMARY_CAPTURE_QUALITY
  ) {
    return (await fileToCompressedImage(file, maxSide, quality)).dataUrl;
  }

  async function scorePhotoPlaceholder(dataUrl) {
    // Placeholder. Later: blur, exposure, subject size, classifier.
    return {
      blurScore: null,
      exposureScore: null,
      qualityLabel: "unchecked"
    };
  }

  async function makePhotoRecord(file, draft, options = {}) {
    const image = await fileToCompressedImage(
      file,
      options.maxSide || PRIMARY_CAPTURE_MAX_SIDE,
      options.quality || PRIMARY_CAPTURE_QUALITY
    );
    const quality = await scorePhotoPlaceholder(image.dataUrl);

    return {
      id: `photo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      kind: "original",
      sourcePhotoId: null,
      name: file.name || "capture.jpg",
      mimeType: file.type || "image/jpeg",
      createdAt: nowISO(),
      dataUrl: image.dataUrl,
      originalWidth: image.originalWidth,
      originalHeight: image.originalHeight,
      storedWidth: image.storedWidth,
      storedHeight: image.storedHeight,
      sourceSizeBytes: image.sourceSizeBytes,
      storedSizeBytes: image.storedSizeBytes,
      role: draft.photos.length === 0 ? "primary" : "detail",
      quality,
      transforms: null
    };
  }

  function addPhotoRecordToDraft(draft, photo) {
    draft.photos.push(photo);
    if (!draft.primaryPhotoId) draft.primaryPhotoId = photo.id;
  }

  function removePhotoRecordFromDraft(draft, photoId) {
    draft.photos = draft.photos.filter((photo) => photo.id !== photoId);
    if (draft.primaryPhotoId === photoId) {
      draft.primaryPhotoId = draft.photos[0]?.id || null;
    }
  }

  async function addFilesToDraft(draftId, fileList) {
    let draft = getDraft(draftId);
    if (!draft) throw new Error("No active draft observation.");

    const files = Array.from(fileList || []);
    for (const file of files) {
      let photo = await makePhotoRecord(file, draft);
      addPhotoRecordToDraft(draft, photo);

      try {
        draft = upsertDraft(draft);
        continue;
      } catch (err) {
        if (!isQuotaExceededError(err)) throw err;
      }

      removePhotoRecordFromDraft(draft, photo.id);

      photo = await makePhotoRecord(file, draft, {
        maxSide: FALLBACK_CAPTURE_MAX_SIDE,
        quality: FALLBACK_CAPTURE_QUALITY
      });
      addPhotoRecordToDraft(draft, photo);

      draft = upsertDraft(draft);
    }

    return draft;
  }

  function startCaptureForNewObservation() {
    const draft = makeDraft();
    activeDraftId = draft.id;

    try {
      upsertDraft(draft);
    } catch (err) {
      activeDraftId = null;
      console.warn("Could not start draft observation:", err);
      alert(err?.message || "Could not start a draft observation.");
      return;
    }

    const input = document.getElementById("cameraInput");
    if (!input) {
      activeDraftId = null;
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

      try {
        upsertDraft(draft);
      } catch (err) {
        activeDraftId = null;
        throw err;
      }
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
    saveDrafts(loadDrafts().filter((d) => d.id !== draftId));
    deleteServerMirror(draftId);
  }

  function removePhoto(draftId, photoId) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    draft.photos = draft.photos.filter((p) => p.id !== photoId);

    if (draft.primaryPhotoId === photoId) {
      draft.primaryPhotoId = draft.photos[0]?.id || null;
    }

    return upsertDraft(draft);
  }

  function setPrimaryPhoto(draftId, photoId) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    if (draft.photos.some((p) => p.id === photoId)) {
      draft.primaryPhotoId = photoId;
    }

    return upsertDraft(draft);
  }

  function addDerivedPhoto(draftId, sourcePhotoId, dataUrl, transforms) {
    const draft = getDraft(draftId);
    if (!draft) return null;

    const source = draft.photos.find((p) => p.id === sourcePhotoId);
    if (!source) return null;

    draft.photos.push({
      id: `photo_copy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      kind: "derived",
      sourcePhotoId,
      name: `${source.name || "photo"} edited copy`,
      mimeType: "image/jpeg",
      createdAt: nowISO(),
      dataUrl,
      originalWidth: source.originalWidth || source.storedWidth || null,
      originalHeight: source.originalHeight || source.storedHeight || null,
      storedWidth: transforms?.outputWidth || null,
      storedHeight: transforms?.outputHeight || null,
      storedSizeBytes: dataUrlByteLength(dataUrl),
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

  function cloneWithoutDataUrl(value, depth = 0) {
    if (depth > 8) return null;
    if (value == null) return value;
    if (typeof value === "string") {
      if (/^data:image\//i.test(value)) return null;
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map((item) => cloneWithoutDataUrl(item, depth + 1));
    if (typeof value !== "object") return null;

    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (/^(dataUrl|originalDataUrl|sourceDataUrl|rawDataUrl)$/i.test(key)) return;
      out[key] = cloneWithoutDataUrl(child, depth + 1);
    });
    return out;
  }

  function photoMetadataForMirror(photo) {
    return {
      id: photo.id,
      kind: photo.kind || "original",
      sourcePhotoId: photo.sourcePhotoId || null,
      name: photo.name || "capture.jpg",
      mimeType: photo.mimeType || "image/jpeg",
      createdAt: photo.createdAt || null,
      role: photo.role || "detail",
      quality: cloneWithoutDataUrl(photo.quality || {}),
      transforms: cloneWithoutDataUrl(photo.transforms || null),
      originalWidth: Number(photo.originalWidth) || null,
      originalHeight: Number(photo.originalHeight) || null,
      storedWidth: Number(photo.storedWidth) || null,
      storedHeight: Number(photo.storedHeight) || null,
      sourceSizeBytes: Number(photo.sourceSizeBytes) || null,
      storedSizeBytes: Number(photo.storedSizeBytes) || null
    };
  }

  function targetPreviewMaxSide(photo, image) {
    const sourceMax = Math.max(
      Number(photo.originalWidth) || Number(photo.storedWidth) || image.width,
      Number(photo.originalHeight) || Number(photo.storedHeight) || image.height
    );
    const target = Math.round(sourceMax * SERVER_PREVIEW_LINEAR_RATIO);
    return Math.max(SERVER_PREVIEW_MIN_SIDE, Math.min(SERVER_PREVIEW_MAX_SIDE, target));
  }

  async function previewForPhoto(photo) {
    const sourceDataUrl = photo?.dataUrl || photo?.preview?.dataUrl || "";
    if (!sourceDataUrl) {
      return {
        ...photoMetadataForMirror(photo || {}),
        preview: null
      };
    }

    const image = await loadImageFromDataUrl(sourceDataUrl);
    const maxSide = targetPreviewMaxSide(photo, image);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);

    const previewDataUrl = canvas.toDataURL("image/jpeg", SERVER_PREVIEW_QUALITY);

    return {
      ...photoMetadataForMirror({
        ...photo,
        storedWidth: photo.storedWidth || image.width,
        storedHeight: photo.storedHeight || image.height,
        storedSizeBytes: photo.storedSizeBytes || dataUrlByteLength(sourceDataUrl)
      }),
      preview: {
        dataUrl: previewDataUrl,
        mimeType: "image/jpeg",
        width,
        height,
        generatedAt: nowISO(),
        policy: SERVER_PREVIEW_POLICY,
        sourceWidth: Number(photo.originalWidth) || image.width,
        sourceHeight: Number(photo.originalHeight) || image.height,
        targetMaxSide: maxSide,
        byteLength: dataUrlByteLength(previewDataUrl)
      }
    };
  }

  async function draftToMirrorPayload(draft) {
    const photos = [];
    for (const photo of draft.photos || []) {
      photos.push(await previewForPhoto(photo));
    }

    return {
      id: draft.id,
      status: draft.status || "draft",
      createdAt: draft.createdAt || null,
      updatedAt: draft.updatedAt || null,
      observedAt: draft.observedAt || draft.createdAt || null,
      location: cloneWithoutDataUrl(draft.location || {}),
      notes: draft.notes || "",
      captiveCultivated: draft.captiveCultivated || "unsure",
      suggestedId: cloneWithoutDataUrl(draft.suggestedId || {}),
      photos,
      primaryPhotoId: draft.primaryPhotoId || photos[0]?.id || null,
      handoff: cloneWithoutDataUrl(draft.handoff || {}),
      metadata: {
        ...cloneWithoutDataUrl(draft),
        photos: (draft.photos || []).map(photoMetadataForMirror),
        mirror: {
          version: 1,
          previewOnly: true,
          previewPolicy: SERVER_PREVIEW_POLICY,
          previewLinearRatio: SERVER_PREVIEW_LINEAR_RATIO,
          generatedAt: nowISO()
        }
      }
    };
  }

  async function mirrorDraftsNow() {
    if (!isServerMirrorEligible()) return false;
    if (Date.now() < mirrorUnavailableUntil) return false;

    if (mirrorSyncInFlight) {
      mirrorSyncQueued = true;
      return false;
    }

    mirrorSyncInFlight = true;
    mirrorSyncQueued = false;

    try {
      const drafts = loadDrafts().slice(0, SERVER_MIRROR_MAX_DRAFTS);
      if (!drafts.length) return true;

      const payloads = [];
      for (const draft of drafts) {
        payloads.push(await draftToMirrorPayload(draft));
      }

      const result = await window.GridWildAPI.upsertDraftObservationMirrors(payloads);
      noteMirrorUnavailable(result?.unavailable === true);
      return !result?.unavailable;
    } catch (err) {
      suppressMirrorError(err);
      return false;
    } finally {
      mirrorSyncInFlight = false;
      if (mirrorSyncQueued) {
        mirrorSyncQueued = false;
        scheduleServerMirror();
      }
    }
  }

  function scheduleServerMirror() {
    if (!isServerMirrorEligible()) return;
    if (Date.now() < mirrorUnavailableUntil) return;

    window.clearTimeout(mirrorTimer);
    mirrorTimer = window.setTimeout(() => {
      mirrorTimer = null;
      mirrorDraftsNow();
    }, SERVER_MIRROR_DEBOUNCE_MS);
  }

  function draftUpdatedTime(draft) {
    const time = Date.parse(
      draft?.updatedAt || draft?.serverMirror?.syncedAt || draft?.createdAt || ""
    );
    return Number.isFinite(time) ? time : 0;
  }

  function mergeRemotePhoto(localPhoto, remotePhoto) {
    if (!localPhoto) return remotePhoto;
    if (localPhoto.dataUrl && !localPhoto.serverPreview) {
      return {
        ...remotePhoto,
        ...localPhoto,
        preview: remotePhoto.preview || localPhoto.preview || null,
        serverPreviewDataUrl: remotePhoto.dataUrl || localPhoto.serverPreviewDataUrl || null
      };
    }
    return {
      ...localPhoto,
      ...remotePhoto,
      dataUrl: localPhoto.dataUrl || remotePhoto.dataUrl || ""
    };
  }

  function mergeRemoteDraft(localDraft, remoteDraft) {
    if (!localDraft) return remoteDraft;

    const localTime = draftUpdatedTime(localDraft);
    const remoteTime = draftUpdatedTime(remoteDraft);
    if (localTime > remoteTime) return localDraft;

    const localPhotosById = new Map((localDraft.photos || []).map((photo) => [photo.id, photo]));
    const mergedPhotos = (remoteDraft.photos || []).map((photo) =>
      mergeRemotePhoto(localPhotosById.get(photo.id), photo)
    );

    for (const localPhoto of localDraft.photos || []) {
      if (!mergedPhotos.some((photo) => photo.id === localPhoto.id)) {
        mergedPhotos.push(localPhoto);
      }
    }

    return {
      ...localDraft,
      ...remoteDraft,
      photos: mergedPhotos,
      primaryPhotoId:
        remoteDraft.primaryPhotoId || localDraft.primaryPhotoId || mergedPhotos[0]?.id || null
    };
  }

  function mergeRemoteDrafts(localDrafts, remoteDrafts) {
    const rowsById = new Map((localDrafts || []).map((draft) => [draft.id, draft]));

    for (const remoteDraft of remoteDrafts || []) {
      if (!remoteDraft?.id) continue;
      rowsById.set(remoteDraft.id, mergeRemoteDraft(rowsById.get(remoteDraft.id), remoteDraft));
    }

    return Array.from(rowsById.values()).sort((a, b) => draftUpdatedTime(b) - draftUpdatedTime(a));
  }

  async function hydrateServerMirrors(options = {}) {
    if (!isServerMirrorEligible()) return [];
    if (Date.now() < mirrorUnavailableUntil && options.force !== true) return [];

    const playerId = window.GridWildAPI?.getPlayerId?.() || "";
    if (serverHydratedForPlayerId === playerId && options.force !== true) return [];

    try {
      const result = await window.GridWildAPI.getDraftObservationMirrors();
      noteMirrorUnavailable(result?.unavailable === true);
      if (result?.unavailable) return [];

      const remoteDrafts = Array.isArray(result?.drafts) ? result.drafts : [];
      if (remoteDrafts.length) {
        saveDrafts(mergeRemoteDrafts(loadDrafts(), remoteDrafts), { mirror: false });
      }
      serverHydratedForPlayerId = playerId;
      return remoteDrafts;
    } catch (err) {
      suppressMirrorError(err);
      return [];
    }
  }

  function deleteServerMirror(draftId) {
    if (!isServerMirrorEligible() || !draftId) return;
    if (Date.now() < mirrorUnavailableUntil) return;

    window.GridWildAPI.deleteDraftObservationMirror(draftId)
      .then((result) => noteMirrorUnavailable(result?.unavailable === true))
      .catch(suppressMirrorError);
  }

  function bindServerMirrorLifecycle() {
    if (window.__gwDraftObservationMirrorBound) return;
    window.__gwDraftObservationMirrorBound = true;

    const hydrateAndSync = () => {
      hydrateServerMirrors()
        .then(() => scheduleServerMirror())
        .catch(suppressMirrorError);
    };

    window.addEventListener("gwBootstrapReady", hydrateAndSync);
    window.addEventListener("gwAccountChanged", () => {
      serverHydratedForPlayerId = null;
      hydrateAndSync();
    });

    if (window.__gwState?.player?.id) {
      window.setTimeout(hydrateAndSync, 600);
    }
  }

  function prepareINaturalistHandoff(draftId) {
    const draft = getDraft(draftId);
    if (!draft) throw new Error("Draft not found.");
    if (!draft.photos?.length) throw new Error("Add at least one photo first.");

    const lat = Number(draft.location?.lat);
    const lng = Number(draft.location?.lng);
    const acc = Number(draft.location?.accuracyMeters);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("This draft is missing usable location coordinates.");
    }

    const taxonGuess =
      draft.suggestedId?.taxonName ||
      draft.suggestedId?.iconicTaxon ||
      draft.suggestedId?.kingdom ||
      "";

    const handoff = {
      status: "prepared",
      preparedAt: nowISO(),
      destination: "iNaturalist",
      phase: "manual_export",
      inatObservationId: null
    };

    draft.handoff = {
      ...(draft.handoff || {}),
      ...handoff
    };

    upsertDraft(draft);

    const fieldPacket = {
      species_guess: taxonGuess || "Unknown organism",
      observed_on_string: draft.observedAt || draft.createdAt,
      latitude: lat,
      longitude: lng,
      positional_accuracy: Number.isFinite(acc) ? Math.round(acc) : "",
      captive_cultivated: draft.captiveCultivated === "captive_cultivated",
      description: [
        draft.notes || "",
        "",
        "Prepared in GridWild.",
        draft.location?.cellKey ? `GridWild cell: ${draft.location.cellKey}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
      photo_count: draft.photos.length
    };

    return {
      ok: true,
      draft,
      fieldPacket,
      message: "iNaturalist handoff prepared. No upload has occurred yet."
    };
  }

  async function getINatJWT() {
    const resp = await fetch("/.netlify/functions/inat-token");

    if (!resp.ok) {
      throw new Error("Connect iNaturalist first.");
    }

    const data = await resp.json();
    return data.api_token;
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);

    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  async function uploadToINaturalist(draftId) {
    const draft = getDraft(draftId);
    if (!draft) throw new Error("Draft not found.");
    if (!draft.photos?.length) throw new Error("Add at least one photo first.");

    const token = await getINatJWT();

    const lat = Number(draft.location?.lat);
    const lng = Number(draft.location?.lng);
    const acc = Number(draft.location?.accuracyMeters);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("This draft is missing usable location coordinates.");
    }

    const taxonGuess =
      draft.suggestedId?.taxonName ||
      draft.suggestedId?.iconicTaxon ||
      draft.suggestedId?.kingdom ||
      "Unknown organism";

    const observationPayload = {
      observation: {
        species_guess: taxonGuess,
        observed_on_string: draft.observedAt || draft.createdAt,
        latitude: lat,
        longitude: lng,
        positional_accuracy: Number.isFinite(acc) ? Math.round(acc) : null,
        captive: draft.captiveCultivated === "captive_cultivated",
        description: [
          draft.notes || "",
          "",
          "Uploaded from GridWild.",
          draft.location?.cellKey ? `GridWild cell: ${draft.location.cellKey}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      }
    };

    const obsResp = await fetch("https://api.inaturalist.org/v1/observations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(observationPayload)
    });

    const obsData = await obsResp.json();

    if (!obsResp.ok) {
      console.warn("iNat observation create failed:", obsData);
      throw new Error(
        obsData?.error || obsData?.errors || "iNaturalist observation upload failed."
      );
    }

    const obsId = obsData?.id || obsData?.results?.[0]?.id;
    if (!obsId) {
      console.warn("Unexpected iNat observation response:", obsData);
      throw new Error("iNaturalist created an observation but did not return an ID.");
    }

    for (const photo of draft.photos) {
      const form = new FormData();

      form.append("observation_photo[observation_id]", String(obsId));

      const blob = dataUrlToBlob(photo.dataUrl);
      form.append("file", blob, photo.name || "gridwild-photo.jpg");

      const photoResp = await fetch("https://api.inaturalist.org/v1/observation_photos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      });

      const photoData = await photoResp.json();

      if (!photoResp.ok) {
        console.warn("iNat photo upload failed:", photoData);
        throw new Error(
          photoData?.error || photoData?.errors || "iNaturalist photo upload failed."
        );
      }
    }

    draft.status = "uploaded";
    draft.handoff = {
      ...(draft.handoff || {}),
      status: "uploaded",
      uploadedAt: nowISO(),
      inatObservationId: obsId
    };

    upsertDraft(draft);

    return {
      ok: true,
      observationId: obsId,
      url: `https://www.inaturalist.org/observations/${obsId}`
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
    uploadToINaturalist,
    addFilesToActiveDraft,
    prepareINaturalistHandoff,
    hydrateServerMirrors,
    mirrorDraftsNow,
    getActiveDraftId: () => activeDraftId,
    setActiveDraftId: (id) => {
      activeDraftId = id;
    }
  };

  bindServerMirrorLifecycle();
})();
