const TABLE = "draft_observations";
const MAX_DRAFTS_PER_SYNC = 50;
const MAX_PHOTOS_PER_DRAFT = 12;
const MAX_PREVIEW_DATA_URL_LENGTH = 180000;
const MAX_TEXT_LENGTH = 20000;

function isMissingOptionalTable(err) {
  const message = String(err?.message || "");
  return err?.code === "42P01" || message.includes(TABLE) || message.includes("schema cache");
}

function cleanString(value, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function parseIsoOrNull(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scrubHeavyMedia(value, depth = 0) {
  if (depth > 6) return null;
  if (value == null) return value;

  if (typeof value === "string") {
    if (/^data:image\//i.test(value)) return null;
    return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => scrubHeavyMedia(item, depth + 1));
  }

  if (typeof value !== "object") return null;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(dataUrl|originalDataUrl|sourceDataUrl|rawDataUrl|blob|file)$/i.test(key)) continue;
    out[key] = scrubHeavyMedia(child, depth + 1);
  }
  return out;
}

function cleanPreviewDataUrl(value) {
  const text = String(value || "");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(text)) return "";
  if (text.length > MAX_PREVIEW_DATA_URL_LENGTH) return "";
  return text;
}

function cleanPhoto(raw) {
  if (!raw || typeof raw !== "object") return null;

  const preview = asObject(raw.preview);
  const previewDataUrl = cleanPreviewDataUrl(preview.dataUrl || raw.previewDataUrl || raw.dataUrl);
  const photoId = cleanString(raw.id, 160);
  if (!photoId) return null;

  return {
    id: photoId,
    kind: cleanString(raw.kind, 40) || "original",
    sourcePhotoId: cleanString(raw.sourcePhotoId || raw.source_photo_id, 160) || null,
    name: cleanString(raw.name, 240) || "capture.jpg",
    mimeType: cleanString(raw.mimeType || raw.mime_type, 80) || "image/jpeg",
    createdAt: parseIsoOrNull(raw.createdAt || raw.created_at),
    role: cleanString(raw.role, 60) || "detail",
    quality: scrubHeavyMedia(raw.quality || {}),
    transforms: scrubHeavyMedia(raw.transforms || null),
    originalWidth: finiteNumber(raw.originalWidth || raw.original_width),
    originalHeight: finiteNumber(raw.originalHeight || raw.original_height),
    storedWidth: finiteNumber(raw.storedWidth || raw.stored_width),
    storedHeight: finiteNumber(raw.storedHeight || raw.stored_height),
    sourceSizeBytes: finiteNumber(raw.sourceSizeBytes || raw.source_size_bytes),
    preview: previewDataUrl
      ? {
          dataUrl: previewDataUrl,
          mimeType: cleanString(preview.mimeType || "image/jpeg", 80),
          width: finiteNumber(preview.width),
          height: finiteNumber(preview.height),
          generatedAt: parseIsoOrNull(preview.generatedAt),
          policy: cleanString(preview.policy, 120) || "gridwild_preview_linear_5pct",
          sourceWidth: finiteNumber(preview.sourceWidth),
          sourceHeight: finiteNumber(preview.sourceHeight),
          targetMaxSide: finiteNumber(preview.targetMaxSide),
          byteLength: finiteNumber(preview.byteLength)
        }
      : null
  };
}

function cleanDraftMirror(raw, playerId) {
  const draftId = cleanString(raw?.id || raw?.clientDraftId || raw?.client_draft_id, 180);
  if (!draftId) return null;

  const photos = Array.isArray(raw.photos)
    ? raw.photos.map(cleanPhoto).filter(Boolean).slice(0, MAX_PHOTOS_PER_DRAFT)
    : [];
  const metadata = scrubHeavyMedia(
    raw.metadata && typeof raw.metadata === "object" ? raw.metadata : raw
  );

  return {
    player_id: playerId,
    client_draft_id: draftId,
    status: cleanString(raw.status, 40) || "draft",
    observed_at: parseIsoOrNull(raw.observedAt || raw.observed_at),
    location: scrubHeavyMedia(raw.location || {}),
    notes: cleanString(raw.notes, MAX_TEXT_LENGTH) || null,
    captive_cultivated: cleanString(raw.captiveCultivated || raw.captive_cultivated, 80) || null,
    suggested_id: scrubHeavyMedia(raw.suggestedId || raw.suggested_id || {}),
    photos,
    primary_photo_id: cleanString(raw.primaryPhotoId || raw.primary_photo_id, 160) || null,
    handoff: scrubHeavyMedia(raw.handoff || {}),
    metadata,
    client_created_at: parseIsoOrNull(raw.createdAt || raw.created_at),
    client_updated_at: parseIsoOrNull(raw.updatedAt || raw.updated_at)
  };
}

function rowToClientDraft(row) {
  const metadata = asObject(row?.metadata);
  const photos = (Array.isArray(row?.photos) ? row.photos : []).map((photo) => ({
    ...photo,
    dataUrl: photo?.preview?.dataUrl || "",
    serverPreview: true
  }));

  return {
    id: row.client_draft_id,
    status: row.status || metadata.status || "draft",
    createdAt: metadata.createdAt || row.client_created_at || row.created_at,
    updatedAt: metadata.updatedAt || row.client_updated_at || row.updated_at,
    observedAt: metadata.observedAt || row.observed_at || row.client_created_at || row.created_at,
    location: row.location || metadata.location || {},
    notes: row.notes ?? metadata.notes ?? "",
    captiveCultivated: row.captive_cultivated || metadata.captiveCultivated || "unsure",
    suggestedId: row.suggested_id || metadata.suggestedId || {},
    photos,
    primaryPhotoId: row.primary_photo_id || metadata.primaryPhotoId || photos[0]?.id || null,
    handoff: row.handoff || metadata.handoff || { status: "not_sent" },
    serverMirror: {
      previewOnly: true,
      syncedAt: row.updated_at,
      remoteId: row.id
    }
  };
}

module.exports = {
  MAX_DRAFTS_PER_SYNC,
  TABLE,
  cleanDraftMirror,
  isMissingOptionalTable,
  rowToClientDraft
};
