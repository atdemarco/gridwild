// js/gw-playlists.js
// -----------------------------------------------------------------------------
// GridWild Wildlists / Playlists
// Shareable galleries built from iNaturalist observations.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_playlists_v1";

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function uid(prefix = "wildlist") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }


  function ensureStyles() {
  if (document.getElementById("gwPlaylistStyles")) return;

  const style = document.createElement("style");
  style.id = "gwPlaylistStyles";
  style.textContent = `
    .gw-playlist-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99998;
      background: rgba(8,12,10,0.72);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      box-sizing: border-box;
    }

    .gw-playlist-modal {
      width: min(760px, 96vw);
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

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAll(playlists) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists || []));
  }

  function getRecentObs() {
    return window.GridWildRecentINat?.getRecentObservations?.() || [];
  }

  function compactObs(o) {
  return {
    id: o.id,
    taxon: o.taxon || "",
    common_name: o.common_name || "",
    scientific_name: o.scientific_name || "",
    observed_on: o.observed_on || null,
    photo_url: o.photo_url || o.photo_square_url || null,
    photo_square_url: o.photo_square_url || o.photo_url || null,
    photo_medium_url: o.photo_medium_url || o.photo_square_url || o.photo_url || null,
    iconic_taxon_name: o.iconic_taxon_name || "Unknown",
    genus_name: o.genus_name || "",
    uri: o.uri || null
  };
}

  function savePlaylist(playlist) {
    const all = loadAll();
    const now = new Date().toISOString();

    const full = {
      id: playlist.id || uid(),
      title: playlist.title || "Untitled Wildlist",
      description: playlist.description || "",
      mode: playlist.mode || "custom",
      template: playlist.template || null,
      observationIds: playlist.observationIds || [],
      snapshotObservations: playlist.snapshotObservations || [],
      visibility: playlist.visibility || "unlisted",
      coverObsId: playlist.coverObsId || null,
      createdAt: playlist.createdAt || now,
      updatedAt: now
    };

    const idx = all.findIndex(p => p.id === full.id);
    if (idx >= 0) all[idx] = full;
    else all.unshift(full);

    saveAll(all);
    return full;
  }

  function getById(id) {
    return loadAll().find(p => p.id === id) || null;
  }

  function deleteById(id) {
    saveAll(loadAll().filter(p => p.id !== id));
  }

  function filterToday(obs) {
    const today = new Date().toISOString().slice(0, 10);
    return obs.filter(o => String(o.observed_on || "").slice(0, 10) === today);
  }

  function filterThisWeek(obs) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 7);

    return obs.filter(o => {
      const d = new Date(o.observed_on || o.created_at || 0);
      return !Number.isNaN(d.getTime()) && d >= cutoff;
    });
  }

  function filterMysteries(obs) {
    return obs.filter(o => {
      const sci = String(o.scientific_name || "").trim();
      const common = String(o.common_name || "").trim();
      const iconic = String(o.iconic_taxon_name || "").trim();

      return (
        !sci ||
        sci.toLowerCase() === "unknown" ||
        iconic.toLowerCase() === "unknown" ||
        (!common && !sci)
      );
    });
  }

  function filterLeafhoppers(obs) {
    return obs.filter(o => {
      const hay = [
        o.taxon,
        o.common_name,
        o.scientific_name
      ].join(" ").toLowerCase();

      return (
        hay.includes("leafhopper") ||
        hay.includes("cicadellidae") ||
        hay.includes("hemiptera")
      );
    });
  }

  function buildTemplatePlaylist(template) {
    const obs = getRecentObs();

    let title = "New Wildlist";
    let selected = [];

    if (template === "today") {
      title = "Today's Observations";
      selected = filterToday(obs);
    } else if (template === "week") {
      title = "This Week's Observations";
      selected = filterThisWeek(obs);
    } else if (template === "mysteries") {
      title = "My Mysteries";
      selected = filterMysteries(obs);
    } else if (template === "leafhoppers") {
      title = "My Leafhoppers";
      selected = filterLeafhoppers(obs);
    }

    return savePlaylist({
      title,
      description: "",
      mode: "template",
      template,
      observationIds: selected.map(o => o.id),
      snapshotObservations: selected.map(compactObs)
    });
  }

  function renderSummary() {
    const el = document.getElementById("gwWildlistsSummary");
    if (!el) return;

    const all = loadAll();

    if (!all.length) {
      el.innerHTML = `<div class="gw-muted" style="font-size:12px;">No Wildlists yet.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="gw-list">
        ${all.slice(0, 3).map(p => `
          <div class="gw-rowline">
            <span style="min-width:0;">
              <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${esc(p.title)}
              </span>
              <span class="gw-muted" style="font-size:11px;">
                ${(p.snapshotObservations || []).length} observations
              </span>
            </span>
            <button class="gw-mini-btn gw-open-wildlist-btn" data-id="${esc(p.id)}">Open</button>
          </div>
        `).join("")}
      </div>
    `;

    el.querySelectorAll(".gw-open-wildlist-btn").forEach(btn => {
    btn.addEventListener("click", evt => {
        evt.preventDefault();
        evt.stopPropagation();

        const id = btn.dataset.id;
        console.log("Opening Wildlist:", id);

        openViewer(id);
    });
    });
  }

  function openCustomBuilder(options = {}) {
  ensureStyles();

  const obs = getRecentObs();

  const editingPlaylistId = options.editingPlaylistId || null;
  const preselectedIds = new Set((options.selectedIds || []).map(String));

  if (!obs.length) {
    alert("Refresh Recent Observations first so GridWild has observations to build from.");
    return;
  }

  const modal = document.createElement("div");
  modal.className = "gw-playlist-backdrop";

  modal.innerHTML = `
    <div class="gw-playlist-modal">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div>
          <div style="font-size:22px;font-weight:950;color:#f0d18a;">Create Custom Wildlist</div>
          <div class="gw-muted" style="font-size:12px;margin-top:3px;">
            Choose observations to include in a shareable gallery.
          </div>
        </div>
        <button class="gw-mini-btn" id="gwCustomWildlistCloseBtn">Close</button>
      </div>

      <div style="display:grid;gap:8px;margin-top:12px;">
        <input id="gwCustomWildlistTitle" value="${esc(options.title || "Custom Wildlist")}" style="
          width:100%;
          box-sizing:border-box;
          padding:10px;
          border-radius:12px;
          border:1px solid rgba(215,183,116,0.28);
          background:rgba(255,255,255,0.06);
          color:#efe6d3;
          font-weight:800;
        ">

        <textarea id="gwCustomWildlistDescription" rows="3" placeholder="Description..." style="
          width:100%;
          box-sizing:border-box;
          padding:10px;
          border-radius:12px;
          border:1px solid rgba(215,183,116,0.28);
          background:rgba(255,255,255,0.06);
          color:#efe6d3;
          resize:vertical;
        ">${esc(options.description || "")}</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="gw-mini-btn" id="gwSelectAllWildlistObsBtn">Select All</button>
        <button class="gw-mini-btn" id="gwClearWildlistObsBtn">Clear</button>
        <button class="gw-mini-btn" id="gwSaveCustomWildlistBtn">Save Wildlist</button>
      </div>

      <div id="gwCustomWildlistCount" class="gw-muted" style="font-size:12px;margin-top:10px;">
        0 selected
      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
        gap:10px;
        margin-top:12px;
      ">
        ${obs.slice(0, 120).map(o => {
          const img = o.photo_square_url || o.photo_url || "";
          const name = o.taxon || o.common_name || o.scientific_name || "Unknown taxon";

          return `
            <label class="gw-card gw-custom-wildlist-tile" style="
              margin:0;
              padding:8px;
              cursor:pointer;
              display:block;
            ">
                <input
                type="checkbox"
                class="gwCustomWildlistObsCheck"
                value="${esc(o.id)}"
                ${preselectedIds.has(String(o.id)) ? "checked" : ""}
                style="margin-bottom:6px;"
                >

              <div style="
                aspect-ratio:1/1;
                border-radius:12px;
                overflow:hidden;
                background:rgba(0,0,0,0.22);
                display:flex;
                align-items:center;
                justify-content:center;
                margin-bottom:8px;
              ">
                ${img
                  ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;">`
                  : `<span class="gw-muted">No photo</span>`
                }
              </div>

              <div style="font-weight:900;font-size:12px;line-height:1.2;">
                ${esc(name)}
              </div>

              <div class="gw-muted" style="font-size:10px;margin-top:3px;">
                ${esc(o.observed_on || "unknown date")}
              </div>
            </label>
          `;
        }).join("")}
      </div>

      ${obs.length > 120 ? `
        <div class="gw-muted" style="font-size:11px;margin-top:10px;">
          Showing first 120 recent observations.
        </div>
      ` : ""}
    </div>
  `;

  document.body.appendChild(modal);

  const checks = Array.from(modal.querySelectorAll(".gwCustomWildlistObsCheck"));
  const countEl = modal.querySelector("#gwCustomWildlistCount");

  function updateCount() {
    const n = checks.filter(c => c.checked).length;
    countEl.textContent = `${n} selected`;
  }

  checks.forEach(c => c.addEventListener("change", updateCount));

  modal.querySelector("#gwSelectAllWildlistObsBtn").onclick = () => {
    checks.forEach(c => c.checked = true);
    updateCount();
  };

  modal.querySelector("#gwClearWildlistObsBtn").onclick = () => {
    checks.forEach(c => c.checked = false);
    updateCount();
  };

  modal.querySelector("#gwCustomWildlistCloseBtn").onclick = () => modal.remove();

  modal.querySelector("#gwSaveCustomWildlistBtn").onclick = () => {
    const selectedIds = checks
      .filter(c => c.checked)
      .map(c => String(c.value));

    if (!selectedIds.length) {
      alert("Choose at least one observation.");
      return;
    }

    const selected = obs
      .filter(o => selectedIds.includes(String(o.id)))
      .map(compactObs);

    const title =
      modal.querySelector("#gwCustomWildlistTitle")?.value?.trim() ||
      "Custom Wildlist";

    const description =
      modal.querySelector("#gwCustomWildlistDescription")?.value?.trim() ||
      "";

    const playlist = savePlaylist({
    id: editingPlaylistId || undefined,
    title,
    description,
    mode: "custom",
    template: null,
    observationIds: selected.map(o => o.id),
    snapshotObservations: selected
    });

    modal.remove();
    renderSummary();
    openViewer(playlist.id);
  };

  modal.onclick = evt => {
    if (evt.target === modal) modal.remove();
  };

  updateCount();
}

function openCustomBuilderFromPlaylist(playlistId) {
  const playlist = getById(playlistId);

  if (!playlist) {
    alert("Wildlist not found.");
    return;
  }

  openCustomBuilder({
    editingPlaylistId: playlist.id,
    title: playlist.title,
    description: playlist.description,
    selectedIds: playlist.observationIds || []
  });
}

  function openCreateMenu() {
    const obs = getRecentObs();

    if (!obs.length) {
      alert("Refresh Recent Observations first so GridWild has observations to build from.");
      return;
    }

    const choice = prompt(
      [
        "Create Wildlist template:",
        "",
        "1 = Today's Observations",
        "2 = This Week's Observations",
        "3 = My Mysteries",
        "4 = My Leafhoppers",
        "5 = Custom Wildlist",
      ].join("\n")
    );

    let playlist = null;

    if (choice === "1") playlist = buildTemplatePlaylist("today");
    if (choice === "2") playlist = buildTemplatePlaylist("week");
    if (choice === "3") playlist = buildTemplatePlaylist("mysteries");
    if (choice === "4") playlist = buildTemplatePlaylist("leafhoppers");
    if (choice === "5") return openCustomBuilder();

    if (!playlist) return;

    renderSummary();
    openViewer(playlist.id);
  }

  function openLibrary() {
    const all = loadAll();

    if (!all.length) {
      alert("No Wildlists yet. Create one first.");
      return;
    }

    const labels = all.map((p, i) =>
      `${i + 1}. ${p.title} (${(p.snapshotObservations || []).length} obs)`
    );

    const choice = prompt(["Open which Wildlist?", "", ...labels].join("\n"));
    const idx = Number(choice) - 1;

    if (!Number.isInteger(idx) || !all[idx]) return;
    openViewer(all[idx].id);
  }

  function getShareUrl(playlistId) {
    const url = new URL(window.location.href);
    url.searchParams.set("gw_playlist", playlistId);
    return url.toString();
  }

 function getPlaylistCoverObs(observations, playlist = {}) {
  if (playlist.coverObsId) {
    const chosen = observations.find(o => String(o.id) === String(playlist.coverObsId));
    if (chosen) return chosen;
  }

  return (
    observations.find(o => o.photo_medium_url || o.photo_square_url || o.photo_url) ||
    observations[0] ||
    null
  );
}

function getPlaylistStats(observations) {
  const taxa = new Set();
  const dates = [];

  for (const o of observations || []) {
    const name = o.scientific_name || o.taxon || o.common_name;
    if (name) taxa.add(name);

    const raw = o.observed_on || o.created_at;
    const d = raw ? new Date(raw) : null;
    if (d && !Number.isNaN(d.getTime())) dates.push(d);
  }

  dates.sort((a, b) => a - b);

  const fmt = d => d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  let dateRange = "Unknown dates";
  if (dates.length === 1) {
    dateRange = fmt(dates[0]);
  } else if (dates.length > 1) {
    dateRange = `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
  }

  return {
    nObs: observations.length,
    nTaxa: taxa.size,
    dateRange
  };
}

  function openViewer(playlistId) {
    ensureStyles(); 
    const playlist = getById(playlistId);
    if (!playlist) {
      alert("Wildlist not found.");
      return;
    }

    const observations = playlist.snapshotObservations || [];
    const coverObs = getPlaylistCoverObs(observations, playlist);
    const coverImg = coverObs?.photo_medium_url || coverObs?.photo_square_url || coverObs?.photo_url || "";
    const stats = getPlaylistStats(observations);
    const author = window.__gwUser?.username || "unknown";

    const modal = document.createElement("div");
    modal.className = "gw-playlist-backdrop";
    modal.innerHTML = `
      <div class="gw-playlist-modal">
        <div style="
  position:relative;
  border-radius:20px;
  overflow:hidden;
  min-height:190px;
  background:rgba(0,0,0,0.35);
  margin-bottom:12px;
">
  ${coverImg ? `
    <img src="${esc(coverImg)}" style="
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:cover;
      filter:saturate(1.08) contrast(1.03);
    ">
  ` : ""}

  <div style="
    position:absolute;
    inset:0;
    background:
      linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.72)),
      radial-gradient(circle at 20% 10%, rgba(240,209,138,0.18), transparent 38%);
  "></div>

  <div style="
    position:relative;
    z-index:1;
    padding:16px;
    min-height:190px;
    box-sizing:border-box;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
  ">
    <div style="display:flex;justify-content:flex-end;">
      <button class="gw-mini-btn" id="gwWildlistCloseBtn">Close</button>
    </div>

    <div>
      <div style="
        font-size:26px;
        line-height:1.05;
        font-weight:950;
        color:#ffe7a3;
        text-shadow:0 2px 12px rgba(0,0,0,0.85);
      ">
        ${esc(playlist.title)}
      </div>

      <div style="
        margin-top:6px;
        font-size:12px;
        font-weight:800;
        color:rgba(255,239,201,0.90);
        text-shadow:0 1px 8px rgba(0,0,0,0.8);
      ">
        by @${esc(author)}
      </div>
    </div>
  </div>
</div>

<div class="gw-card" style="margin-bottom:12px;">
  <div class="gw-kpi-grid">
    <div class="gw-kpi">
      <div class="gw-kpi-k">Observations</div>
      <div class="gw-kpi-v">${stats.nObs.toLocaleString()}</div>
    </div>

    <div class="gw-kpi">
      <div class="gw-kpi-k">Taxa</div>
      <div class="gw-kpi-v">${stats.nTaxa.toLocaleString()}</div>
    </div>
  </div>

  <div class="gw-muted" style="font-size:12px;margin-top:10px;">
    ${esc(stats.dateRange)}
  </div>
</div>

        ${playlist.description ? `
          <div class="gw-muted" style="font-size:13px;line-height:1.4;margin-top:8px;">
            ${esc(playlist.description)}
          </div>
        ` : ""}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;">
        <button class="gw-mini-btn" id="gwWildlistCopyLinkBtn">Copy Share Link</button>
        <button class="gw-mini-btn" id="gwWildlistEditBtn">Edit</button>
        <button class="gw-mini-btn" id="gwWildlistDeleteBtn">Delete</button>
        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(auto-fill, minmax(135px, 1fr));
          gap:10px;
          margin-top:14px;
        ">
          ${observations.map((o, i) => renderObsTile(o, playlist.id, i)).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll(".gw-wildlist-slide-tile").forEach(tile => {
    tile.onclick = evt => {
        evt.preventDefault();
        evt.stopPropagation();

        const i = Number(tile.dataset.index || 0);
        openSlideshow(playlist.id, i);
    };
    });

    modal.querySelectorAll(".gw-set-cover-btn").forEach(btn => {
    btn.onclick = evt => {
        evt.preventDefault();
        evt.stopPropagation();

        const updated = {
        ...playlist,
        coverObsId: btn.dataset.obsId
        };

        savePlaylist(updated);
        modal.remove();
        openViewer(playlist.id);
    };
    });

    modal.querySelector("#gwWildlistCloseBtn").onclick = () => modal.remove();

    modal.querySelector("#gwWildlistCopyLinkBtn").onclick = async () => {
      const link = getShareUrl(playlist.id);
      try {
        await navigator.clipboard.writeText(link);
        alert("Wildlist link copied.");
      } catch {
        prompt("Copy this Wildlist link:", link);
      }
    };

    modal.querySelector("#gwWildlistDeleteBtn").onclick = () => {
      if (!confirm(`Delete "${playlist.title}"?`)) return;
      deleteById(playlist.id);
      modal.remove();
      renderSummary();
    };

    modal.querySelector("#gwWildlistEditBtn").onclick = () => {
    modal.remove();
    openCustomBuilderFromPlaylist(playlist.id);
    };

    modal.onclick = evt => {
      if (evt.target === modal) modal.remove();
    };
  }

  function openSlideshow(playlistId, startIndex = 0) {
  ensureStyles();

  const playlist = getById(playlistId);
  if (!playlist) return;

  const observations = playlist.snapshotObservations || [];
  if (!observations.length) return;

  let idx = Math.max(0, Math.min(startIndex, observations.length - 1));

  const modal = document.createElement("div");
  modal.className = "gw-playlist-backdrop";

  function render() {
    const o = observations[idx];
    const img = o.photo_medium_url || o.photo_square_url || o.photo_url || "";
    const name = o.taxon || o.common_name || o.scientific_name || "Unknown taxon";
    const sci = o.scientific_name || "";

    modal.innerHTML = `
      <div class="gw-playlist-modal" style="width:min(720px,96vw);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <button class="gw-mini-btn" id="gwSlidePrevBtn">‹ Prev</button>
          <div class="gw-muted" style="font-size:12px;text-align:center;">
            ${idx + 1} / ${observations.length}
          </div>
          <button class="gw-mini-btn" id="gwSlideNextBtn">Next ›</button>
        </div>

        <div style="
          margin-top:12px;
          border-radius:18px;
          overflow:hidden;
          background:rgba(0,0,0,0.35);
          min-height:280px;
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          ${img
            ? `<img src="${esc(img)}" style="width:100%;max-height:62vh;object-fit:contain;">`
            : `<div class="gw-muted">No photo</div>`
          }
        </div>

        <div style="margin-top:12px;">
          <div style="font-size:20px;font-weight:950;color:#f0d18a;line-height:1.15;">
            ${esc(name)}
          </div>

          ${sci ? `
            <div class="gw-muted" style="font-size:13px;margin-top:3px;">
              <i>${esc(sci)}</i>
            </div>
          ` : ""}

          <div class="gw-muted" style="font-size:12px;margin-top:6px;">
            ${esc(o.observed_on || "unknown date")}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
          ${o.uri ? `
            <a class="gw-mini-btn" href="${esc(o.uri)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none;">
              Open iNaturalist
            </a>
          ` : `<button class="gw-mini-btn" disabled>Open iNaturalist</button>`}

          <button class="gw-mini-btn" id="gwSlideCloseBtn">Close</button>
        </div>
      </div>
    `;

    modal.querySelector("#gwSlidePrevBtn").onclick = () => {
      idx = (idx - 1 + observations.length) % observations.length;
      render();
    };

    modal.querySelector("#gwSlideNextBtn").onclick = () => {
      idx = (idx + 1) % observations.length;
      render();
    };

    modal.querySelector("#gwSlideCloseBtn").onclick = () => modal.remove();
  }

  modal.onclick = evt => {
    if (evt.target === modal) modal.remove();
  };

  document.body.appendChild(modal);
  render();

  window.addEventListener("keydown", function onKey(e) {
    if (!document.body.contains(modal)) {
      window.removeEventListener("keydown", onKey);
      return;
    }

    if (e.key === "ArrowLeft") {
      idx = (idx - 1 + observations.length) % observations.length;
      render();
    }

    if (e.key === "ArrowRight") {
      idx = (idx + 1) % observations.length;
      render();
    }

    if (e.key === "Escape") {
      modal.remove();
      window.removeEventListener("keydown", onKey);
    }
  });
}



function renderObsTile(o, playlistId = "", index = 0) {
  const img = o.photo_medium_url || o.photo_square_url || o.photo_url || "";
  const name = o.taxon || o.common_name || o.scientific_name || "Unknown taxon";

  return `
    <div
      class="gw-card gw-wildlist-slide-tile"
      data-playlist-id="${esc(playlistId)}"
      data-index="${esc(index)}"
      style="margin:0;padding:8px;text-align:left;cursor:pointer;border-radius:16px;"
    >
      <div style="
        aspect-ratio:1/1;
        border-radius:12px;
        overflow:hidden;
        background:rgba(0,0,0,0.22);
        display:flex;
        align-items:center;
        justify-content:center;
        margin-bottom:8px;
      ">
        ${img
          ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;">`
          : `<span class="gw-muted">No photo</span>`
        }
      </div>

      <div style="font-weight:900;font-size:12px;line-height:1.2;color:#efe6d3;">
        ${esc(name)}
      </div>

      <div class="gw-muted" style="font-size:10px;margin-top:3px;">
        ${esc(o.observed_on || "unknown date")}
      </div>

      <button
        class="gw-mini-btn gw-set-cover-btn"
        type="button"
        data-obs-id="${esc(o.id)}"
        style="margin-top:7px;width:100%;padding:6px 7px;font-size:10px;"
      >
        Set Cover
      </button>
    </div>
  `;
}

  function handlePlaylistFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("gw_playlist");
    if (!id) return;

    setTimeout(() => {
      openViewer(id);
    }, 300);
  }

  function addObservationToWildlist(obsId) {
  const obs = getRecentObs().find(o => String(o.id) === String(obsId));

  if (!obs) {
    alert("Observation not found in recent cache.");
    return;
  }

  const all = loadAll();

  if (!all.length) {
    const playlist = savePlaylist({
      title: "Custom Wildlist",
      description: "",
      mode: "custom",
      template: null,
      observationIds: [obs.id],
      snapshotObservations: [compactObs(obs)]
    });

    renderSummary();
    alert(`Added to new Wildlist: ${playlist.title}`);
    return;
  }

  const labels = all.map((p, i) =>
    `${i + 1}. ${p.title} (${(p.snapshotObservations || []).length} obs)`
  );

  const choice = prompt([
    "Add to which Wildlist?",
    "",
    "0. Create new Wildlist",
    ...labels
  ].join("\n"));

  if (choice === null) return;

  let playlist = null;

  if (choice === "0") {
    const title = prompt("New Wildlist title:", "Custom Wildlist") || "Custom Wildlist";
    playlist = savePlaylist({
      title,
      description: "",
      mode: "custom",
      template: null,
      observationIds: [obs.id],
      snapshotObservations: [compactObs(obs)]
    });
  } else {
    const idx = Number(choice) - 1;
    playlist = all[idx];

    if (!playlist) return;

    const ids = new Set((playlist.observationIds || []).map(String));
    if (ids.has(String(obs.id))) {
      alert("That observation is already in this Wildlist.");
      return;
    }

    playlist.observationIds = [...(playlist.observationIds || []), obs.id];
    playlist.snapshotObservations = [
      ...(playlist.snapshotObservations || []),
      compactObs(obs)
    ];

    playlist = savePlaylist(playlist);
  }

  renderSummary();
  alert(`Added to ${playlist.title}.`);
}

  function bindButtons(root = document) {
    root.querySelector("#gwCreateWildlistBtn")?.addEventListener("click", openCreateMenu);
    root.querySelector("#gwOpenWildlistsBtn")?.addEventListener("click", openLibrary);
  }

  window.GridWildPlaylists = {
    loadAll,
    savePlaylist,
    getById,
    deleteById,
    renderSummary,
    bindButtons,
    handlePlaylistFromUrl,
    openViewer,
    openCreateMenu,
    openLibrary,
    buildTemplatePlaylist,
    openCustomBuilder,
    openCustomBuilderFromPlaylist,
    addObservationToWildlist,
    openSlideshow
  };
})();