// -----------------------------------------------------------------------------
// GridWild Observation Editor
// Draft editor + simple crop/rotate/lighten-darken copy mechanism.
// -----------------------------------------------------------------------------

(function () {
  let currentDraftId = null;
  let selectedPhotoId = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isoToDatetimeLocalValue(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";

    const pad = (n) => String(n).padStart(2, "0");

    return (
      [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("-") +
      "T" +
      [pad(d.getHours()), pad(d.getMinutes())].join(":")
    );
  }

  function datetimeLocalValueToISO(value) {
    if (!value) return new Date().toISOString();

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();

    return d.toISOString();
  }

  function injectStyles() {
    if (document.getElementById("gwObservationEditorStyles")) return;

    const style = document.createElement("style");
    style.id = "gwObservationEditorStyles";
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
        width: min(900px, 96vw);
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

      .gw-obs-title {
        font-size: 20px;
        font-weight: 950;
        color: #f0d18a;
        margin-bottom: 4px;
      }

      .gw-obs-sub {
        font-size: 12px;
        color: rgba(239,230,211,0.66);
        margin-bottom: 12px;
      }

      .gw-obs-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
        gap: 12px;
      }

      .gw-obs-mainimg {
        height: min(62vh, 520px);
        min-height: 280px;
        border-radius: 18px;
        background: rgba(0,0,0,0.24);
        border: 1px solid rgba(215,183,116,0.24);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

        .gw-obs-mainimg img {
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        object-fit: contain;
        display: block;
        will-change: transform, filter;
        }

      .gw-obs-thumbs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        margin-top: 10px;
        padding-bottom: 3px;
      }

      .gw-obs-thumb {
        width: 68px;
        height: 68px;
        flex: 0 0 auto;
        border-radius: 12px;
        overflow: hidden;
        border: 2px solid transparent;
        background: rgba(255,255,255,0.08);
        cursor: pointer;
        position: relative;
      }

      .gw-obs-thumb.active {
        border-color: #ffe082;
      }

      .gw-obs-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .gw-obs-copytag {
        position: absolute;
        left: 3px;
        bottom: 3px;
        font-size: 9px;
        padding: 2px 4px;
        border-radius: 999px;
        background: rgba(0,0,0,0.68);
        color: #ffe082;
      }

      .gw-obs-panel {
        border-radius: 18px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(215,183,116,0.18);
        padding: 12px;
        margin-bottom: 10px;
      }

      .gw-obs-label {
        display: block;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #d7b774;
        margin-bottom: 5px;
      }

      .gw-obs-panel input,
      .gw-obs-panel textarea,
      .gw-obs-panel select {
        width: 100%;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(215,183,116,0.30);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        padding: 9px;
      }

      .gw-obs-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .gw-obs-btn {
        border: 0;
        border-radius: 999px;
        padding: 11px 12px;
        font-weight: 900;
        cursor: pointer;
        background: rgba(255,255,255,0.12);
        color: #efe6d3;
      }

      .gw-obs-btn.primary {
        background: #ffe082;
        color: #21301f;
      }

      .gw-obs-btn.danger {
        background: rgba(160,50,40,0.30);
        color: #ffd9d3;
      }

      .gw-obs-edit-controls {
        display: grid;
        gap: 8px;
      }

      @media (max-width: 760px) {
        .gw-obs-grid {
          grid-template-columns: 1fr;
        }
      }

      .gw-obs-party-chip {
        margin: 8px 0 12px 0;
        padding: 10px 12px;
        border-radius: 16px;
        border: 1px solid rgba(215,183,116,0.22);
        background: rgba(255,255,255,0.06);
      }

      .gw-obs-party-chip-title {
        font-size: 12px;
        font-weight: 950;
        color: #fff2c8;
      }

      .gw-obs-party-chip-sub {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.35;
        color: rgba(239,230,211,0.68);
      }

      .gw-obs-party-chip.counted {
        border-color: rgba(100,220,150,0.38);
        background: rgba(80,220,140,0.10);
      }

      .gw-obs-party-chip.will-count {
        border-color: rgba(240,209,138,0.48);
        background: rgba(240,209,138,0.10);
      }

      .gw-obs-party-chip.blocked {
        border-color: rgba(255,170,90,0.38);
        background: rgba(255,150,80,0.09);
      }

      .gw-obs-party-chip.muted {
        opacity: 0.74;
      }
    `;

    document.head.appendChild(style);
  }

  function getDraft() {
    return window.GridWildDraftObservations?.getDraft?.(currentDraftId);
  }

  function getSelectedPhoto(draft) {
    return draft?.photos?.find((p) => p.id === selectedPhotoId) || draft?.photos?.[0] || null;
  }

  function open(draftId) {
    injectStyles();

    currentDraftId = draftId;
    const draft = getDraft();
    if (!draft) return;

    selectedPhotoId = draft.primaryPhotoId || draft.photos[0]?.id || null;

    document.querySelectorAll(".gw-obs-backdrop").forEach((el) => el.remove());

    const root = document.createElement("div");
    root.className = "gw-obs-backdrop";
    root.innerHTML = `<div class="gw-obs-editor" id="gwObsEditorCard"></div>`;
    document.body.appendChild(root);

    root.addEventListener("click", (evt) => {
      if (evt.target === root) root.remove();
    });

    render(root);
  }

  function openActiveDraft() {
    const id = window.GridWildDraftObservations?.getActiveDraftId?.();
    if (id) open(id);
  }

  function renderPartyChipForDraft(draft) {
    if (window.GridWildParty?.renderDraftPartyChipHtml) {
      return window.GridWildParty.renderDraftPartyChipHtml(draft);
    }

    return "";
  }

  function render(root = document) {
    const draft = getDraft();
    if (!draft) return;

    const photo = getSelectedPhoto(draft);
    const card =
      root.querySelector("#gwObsEditorCard") || document.getElementById("gwObsEditorCard");
    if (!card) return;

    card.innerHTML = `
      <div class="gw-obs-title">Observation Editor</div>
      <div class="gw-obs-sub">
        One draft observation · ${draft.photos.length} photo${draft.photos.length === 1 ? "" : "s"} ·
        ${esc(draft.location?.cellKey || "no cell")}
      </div>

      ${renderPartyChipForDraft(draft)}

      <div class="gw-obs-grid">
        <div>
          <div class="gw-obs-mainimg">
            ${photo ? `<img id="gwObsMainImage" src="${photo.dataUrl}" alt="">` : `<div>No photo yet.</div>`}
          </div>

          <div class="gw-obs-thumbs">
            ${draft.photos
              .map(
                (p) => `
              <button class="gw-obs-thumb ${p.id === photo?.id ? "active" : ""}" data-photo-id="${esc(p.id)}">
                <img src="${p.dataUrl}" alt="">
                ${p.kind === "derived" ? `<span class="gw-obs-copytag">copy</span>` : ""}
              </button>
            `
              )
              .join("")}
          </div>

          <div class="gw-obs-panel" style="margin-top:10px;">
            <div class="gw-obs-label">Photo edit copy</div>
            <div class="gw-obs-edit-controls">
              <label>Zoom crop
                <input id="gwObsCropZoom" type="range" min="1" max="3" step="0.05" value="1">
              </label>
              <label>Pan left / right
            <input id="gwObsPanX" type="range" min="-100" max="100" step="1" value="0">
            </label>
            <label>Pan up / down
            <input id="gwObsPanY" type="range" min="-100" max="100" step="1" value="0">
            </label>
              <label>Rotate / straighten
                <input id="gwObsRotate" type="range" min="-20" max="20" step="1" value="0">
              </label>
              <label>Lighten / darken
                <input id="gwObsExposure" type="range" min="-60" max="60" step="1" value="0">
              </label>
            </div>
          </div>
        </div>

        <div>
          <div class="gw-obs-panel">
            <label class="gw-obs-label" for="gwObsObservedAt">Observation date / time</label>
            <input
              id="gwObsObservedAt"
              type="datetime-local"
              value="${esc(isoToDatetimeLocalValue(draft.observedAt || draft.createdAt))}"
            >
            <div class="gw-obs-sub" style="margin-top:8px;">
              This is the observation timestamp that will eventually be sent to iNaturalist.
            </div>
          </div>
          <div class="gw-obs-panel">
            <label class="gw-obs-label">Suggested ID placeholder</label>
            <select id="gwObsKingdom">
              ${["Unknown", "Plantae", "Animalia", "Fungi", "Insecta", "Aves", "Mammalia"]
                .map(
                  (k) =>
                    `<option value="${k}" ${draft.suggestedId?.kingdom === k ? "selected" : ""}>${k}</option>`
                )
                .join("")}
            </select>
            <div class="gw-obs-sub" style="margin-top:8px;">
              Classifier not enabled yet. This is a placeholder for broad ID.
            </div>
          </div>

          <div class="gw-obs-panel">
            <label class="gw-obs-label">Wild status</label>
            <select id="gwObsCaptive">
              <option value="unsure" ${draft.captiveCultivated === "unsure" ? "selected" : ""}>Unsure</option>
              <option value="wild" ${draft.captiveCultivated === "wild" ? "selected" : ""}>Wild / naturalized</option>
              <option value="captive_cultivated" ${draft.captiveCultivated === "captive_cultivated" ? "selected" : ""}>Captive / cultivated</option>
            </select>
          </div>

          <div class="gw-obs-panel">
            <label class="gw-obs-label">Notes</label>
            <textarea id="gwObsNotes" rows="4" placeholder="Field notes, microhabitat, behavior...">${esc(draft.notes || "")}</textarea>
          </div>

          <div class="gw-obs-panel">
            <div class="gw-obs-label">Location health</div>
            <div>
              GPS ±${Math.round(Number(draft.location?.accuracyMeters) || 0)} m<br>
              Cell: ${esc(draft.location?.cellKey || "unknown")}
            </div>
          </div>

          <div class="gw-obs-actions">
            <button class="gw-obs-btn" id="gwObsAddPhotoBtn">Add Photo</button>
            <button class="gw-obs-btn" id="gwObsSetPrimaryBtn">Set Primary</button>
            <button class="gw-obs-btn" id="gwObsSaveCopyBtn">Save Edit Copy</button>
            <button class="gw-obs-btn danger" id="gwObsDeletePhotoBtn">Delete Photo</button>
            <button class="gw-obs-btn" id="gwObsCloseBtn">Close</button>
            <button class="gw-obs-btn primary" id="gwObsSendBtn">Prepare for iNaturalist</button>
          </div>
        </div>
      </div>
    `;

    bind(card);
  }

  function updateEditPreview() {
    const img = document.getElementById("gwObsMainImage");
    if (!img) return;

    const zoom = Number(document.getElementById("gwObsCropZoom")?.value || 1);
    const panX = Number(document.getElementById("gwObsPanX")?.value || 0);
    const panY = Number(document.getElementById("gwObsPanY")?.value || 0);
    const rotate = Number(document.getElementById("gwObsRotate")?.value || 0);
    const exposure = Number(document.getElementById("gwObsExposure")?.value || 0);

    img.style.transformOrigin = "center center";
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotate}deg)`;
    img.style.filter = `brightness(${100 + exposure}%)`;
  }

  function openINaturalistHandoffModal(fieldPacket, draft) {
    const text = JSON.stringify(fieldPacket, null, 2);

    const modal = document.createElement("div");
    modal.className = "gw-obs-backdrop";
    modal.innerHTML = `
    <div class="gw-obs-editor" style="max-width:720px;">
      <div class="gw-obs-title">Prepare for iNaturalist</div>
      <div class="gw-obs-sub">
        Phase 1 manual handoff. Nothing has been uploaded yet.
      </div>

      <div class="gw-obs-panel">
        <div class="gw-obs-label">Copy these fields into iNaturalist</div>
        <textarea id="gwINatHandoffText" rows="14" readonly>${esc(text)}</textarea>
      </div>

      <div class="gw-obs-panel">
        <div class="gw-obs-label">Photos</div>
        <div>${draft.photos.length} photo${draft.photos.length === 1 ? "" : "s"} attached in GridWild.</div>
        <div class="gw-obs-sub" style="margin-top:6px;">
          For now, manually add the saved/captured photos to iNaturalist.
        </div>
      </div>

      <div class="gw-obs-actions">
        <button class="gw-obs-btn" id="gwINatCopyBtn">Copy Fields</button>
        <button class="gw-obs-btn" id="gwINatOpenBtn">Open iNaturalist</button>
        <button class="gw-obs-btn primary" id="gwINatDoneBtn">Done</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    modal.querySelector("#gwINatCopyBtn").onclick = async () => {
      await navigator.clipboard.writeText(text);
      alert("Copied iNaturalist handoff fields.");
    };

    modal.querySelector("#gwINatOpenBtn").onclick = () => {
      window.open(
        "https://www.inaturalist.org/observations/upload",
        "_blank",
        "noopener,noreferrer"
      );
    };

    modal.querySelector("#gwINatDoneBtn").onclick = () => {
      modal.remove();
      render();
      window.initGridWildMobilePanels?.();
    };

    modal.addEventListener("click", (evt) => {
      if (evt.target === modal) modal.remove();
    });
  }

  function bind(card) {
    ["gwObsCropZoom", "gwObsPanX", "gwObsPanY", "gwObsRotate", "gwObsExposure"].forEach((id) => {
      const el = card.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener("input", updateEditPreview);
    });

    updateEditPreview();

    card.querySelectorAll(".gw-obs-thumb").forEach((btn) => {
      btn.onclick = () => {
        selectedPhotoId = btn.dataset.photoId;
        render();
      };
    });

    card.querySelector("#gwObsAddPhotoBtn").onclick = () => {
      saveFields();
      window.GridWildDraftObservations?.addPhotoToExistingDraft?.(currentDraftId);
    };

    card.querySelector("#gwObsSetPrimaryBtn").onclick = () => {
      if (!selectedPhotoId) return;
      window.GridWildDraftObservations?.setPrimaryPhoto?.(currentDraftId, selectedPhotoId);
      render();
    };

    card.querySelector("#gwObsDeletePhotoBtn").onclick = () => {
      if (!selectedPhotoId) return;
      if (!confirm("Delete this photo from the draft observation?")) return;
      window.GridWildDraftObservations?.removePhoto?.(currentDraftId, selectedPhotoId);
      selectedPhotoId = null;
      render();
    };

    card.querySelector("#gwObsSaveCopyBtn").onclick = async () => {
      await saveEditCopy();
      render();
    };

    card.querySelector("#gwObsCloseBtn").onclick = () => {
      saveFields();
      document.querySelector(".gw-obs-backdrop")?.remove();
      window.initGridWildMobilePanels?.();
    };

    card.querySelector("#gwObsSendBtn").onclick = async () => {
      saveFields();

      try {
        if (window.GridWildINatAuth?.isConnected?.()) {
          await window.GridWildDraftObservations.uploadToINaturalist(currentDraftId);
          alert("Uploaded to iNaturalist.");
          render();
          window.initGridWildMobilePanels?.();
          return;
        }

        const result = window.GridWildDraftObservations.prepareINaturalistHandoff(currentDraftId);

        openINaturalistHandoffModal(result.fieldPacket, result.draft);
      } catch (err) {
        alert(err.message);
      }
    };
  }

  function saveFields() {
    const kingdom = document.getElementById("gwObsKingdom")?.value || "Unknown";
    const captiveCultivated = document.getElementById("gwObsCaptive")?.value || "unsure";
    const notes = document.getElementById("gwObsNotes")?.value || "";
    const observedAtLocal = document.getElementById("gwObsObservedAt")?.value || "";

    const draft = getDraft();
    if (!draft) return;

    draft.observedAt = datetimeLocalValueToISO(observedAtLocal);

    draft.suggestedId = {
      ...(draft.suggestedId || {}),
      kingdom,
      iconicTaxon: kingdom,
      source: "placeholder"
    };
    draft.captiveCultivated = captiveCultivated;
    draft.notes = notes;

    window.GridWildDraftObservations?.upsertDraft?.(draft);
  }

  async function saveEditCopy() {
    const draft = getDraft();
    const photo = getSelectedPhoto(draft);
    if (!photo) return;

    const zoom = Number(document.getElementById("gwObsCropZoom")?.value || 1);
    const panX = Number(document.getElementById("gwObsPanX")?.value || 0);
    const panY = Number(document.getElementById("gwObsPanY")?.value || 0);
    const rotate = Number(document.getElementById("gwObsRotate")?.value || 0);
    const exposure = Number(document.getElementById("gwObsExposure")?.value || 0);

    const img = await loadImage(photo.dataUrl);

    const canvas = document.createElement("canvas");
    const size = Math.min(img.width, img.height);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.save();

    ctx.filter = `brightness(${100 + exposure}%)`;
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -img.width / 2 + panX, -img.height / 2 + panY);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);

    window.GridWildDraftObservations?.addDerivedPhoto?.(currentDraftId, photo.id, dataUrl, {
      cropMode: "center_square",
      zoom,
      panX,
      panY,
      rotationDeg: rotate,
      exposureDelta: exposure
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  window.GridWildObservationEditor = {
    open,
    openActiveDraft
  };
})();
