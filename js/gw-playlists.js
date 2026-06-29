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

    .gw-playlist-modal .gw-muted {
      color: rgba(239,230,211,0.68);
    }

    .gw-playlist-empty-dialog {
      width: min(420px, 94vw);
      overflow: hidden;
    }

    .gw-playlist-empty-mark {
      width: 54px;
      height: 54px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      margin-bottom: 12px;
      color: #f0d18a;
      font-size: 27px;
      font-weight: 950;
      background:
        radial-gradient(circle at 28% 22%, rgba(240,209,138,0.35), transparent 32px),
        linear-gradient(135deg, rgba(79,116,67,0.78), rgba(37,55,35,0.96));
      border: 1px solid rgba(240,209,138,0.42);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 12px 34px rgba(0,0,0,0.28);
    }

    .gw-playlist-empty-title {
      font-size: 22px;
      font-weight: 950;
      color: #f0d18a;
      line-height: 1.1;
    }

    .gw-playlist-empty-copy {
      margin-top: 8px;
      color: rgba(239,230,211,0.78);
      font-size: 13px;
      line-height: 1.45;
    }

    .gw-playlist-dialog-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }

    .gw-playlist-primary-btn {
      border-color: rgba(240,209,138,0.42);
      background: linear-gradient(180deg, #f0d18a, #b8893e);
      color: #201510;
      box-shadow: 0 8px 22px rgba(0,0,0,0.20);
    }

    .gw-wildlist-library-modal {
      width: min(760px, 96vw);
    }

    .gw-wildlist-library-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .gw-wildlist-library-title {
      color: #f0d18a;
      font-size: 22px;
      font-weight: 950;
      line-height: 1.1;
    }

    .gw-wildlist-library-sub {
      margin-top: 4px;
      color: rgba(239,230,211,0.68);
      font-size: 12px;
      line-height: 1.35;
    }

    .gw-wildlist-library-list {
      display: grid;
      gap: 10px;
    }

    .gw-wildlist-library-item {
      border: 1px solid rgba(215,183,116,0.20);
      border-radius: 16px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035)),
        radial-gradient(circle at 12% 0%, rgba(119,161,87,0.16), transparent 38%);
      padding: 10px;
    }

    .gw-wildlist-library-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }

    .gw-wildlist-library-name {
      color: #f4e8cf;
      font-size: 14px;
      font-weight: 950;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .gw-wildlist-library-meta {
      margin-top: 3px;
      color: rgba(239,230,211,0.62);
      font-size: 11px;
      line-height: 1.3;
    }

    .gw-wildlist-library-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
    }

    .gw-wildlist-library-actions .gw-mini-btn {
      padding: 7px 9px;
      font-size: 11px;
      white-space: nowrap;
    }

    .gw-wildlist-library-status {
      color: rgba(239,230,211,0.62);
      font-size: 11px;
      min-height: 14px;
      margin-top: 5px;
      text-align: right;
    }

    .gw-custom-wildlist-filter-bank {
      margin-top: 10px;
      padding: 10px;
      border: 1px solid rgba(215,183,116,0.20);
      border-radius: 16px;
      background: rgba(255,255,255,0.045);
      display: grid;
      gap: 8px;
    }

    .gw-custom-wildlist-filter-row {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(128px, .8fr) minmax(128px, .8fr) auto;
      gap: 8px;
      align-items: end;
    }

    .gw-custom-wildlist-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .gw-custom-wildlist-field span {
      color: rgba(239,230,211,0.68);
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .gw-custom-wildlist-field input,
    .gw-custom-wildlist-field select {
      width: 100%;
      min-height: 36px;
      box-sizing: border-box;
      border-radius: 12px;
      border: 1px solid rgba(215,183,116,0.26);
      background: rgba(0,0,0,0.20);
      color: #efe6d3;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
    }

    .gw-custom-wildlist-filter-reset {
      min-height: 36px;
      white-space: nowrap;
    }

    @media (max-width: 560px) {
      .gw-wildlist-library-head {
        align-items: stretch;
      }

      .gw-wildlist-library-top {
        grid-template-columns: 1fr;
      }

      .gw-wildlist-library-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        justify-content: stretch;
      }

      .gw-wildlist-library-actions .gw-mini-btn {
        width: 100%;
      }

      .gw-custom-wildlist-filter-row {
        grid-template-columns: 1fr 1fr;
      }

      .gw-custom-wildlist-field:first-child {
        grid-column: 1 / -1;
      }

      .gw-custom-wildlist-filter-reset {
        width: 100%;
      }
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

  function getObsThumbUrl(obs) {
    return obs?.photo_square_url || obs?.photo_url || obs?.photo_medium_url || "";
  }

  function refreshWildlistPhotoSlots(root = document) {
    const latest = new Map(getRecentObs().map((obs) => [String(obs.id), obs]));

    root.querySelectorAll("[data-wildlist-photo-slot]").forEach((slot) => {
      const obs = latest.get(String(slot.dataset.obsId || ""));
      const img = getObsThumbUrl(obs);
      if (!img || slot.querySelector("img")) return;

      slot.innerHTML = `<img src="${esc(img)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">`;
    });
  }

  function requestWildlistThumbnails(ids, root = document) {
    const ensure = window.GridWildRecentINat?.ensureObservationPhotos;
    if (typeof ensure !== "function") return Promise.resolve();

    const cleaned = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!cleaned.length) return Promise.resolve();

    return ensure(cleaned)
      .then(() => refreshWildlistPhotoSlots(root))
      .catch((err) => console.warn("Could not fetch Wildlist thumbnails:", err));
  }

  function observeWildlistThumbnails(root = document) {
    const latest = new Map(getRecentObs().map((obs) => [String(obs.id), obs]));
    const slots = Array.from(root.querySelectorAll("[data-wildlist-photo-slot]")).filter((slot) => {
      const id = String(slot.dataset.obsId || "");
      return id && !getObsThumbUrl(latest.get(id));
    });

    if (!slots.length) return;

    if (!("IntersectionObserver" in window)) {
      requestWildlistThumbnails(
        slots.slice(0, 24).map((slot) => slot.dataset.obsId),
        root
      );
      return;
    }

    const queued = new Set();
    let timer = null;
    const flush = () => {
      timer = null;
      const ids = [...queued];
      queued.clear();
      requestWildlistThumbnails(ids, root);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.dataset.obsId;
          if (id) queued.add(id);
          observer.unobserve(entry.target);
        });

        if (queued.size && !timer) timer = setTimeout(flush, 80);
      },
      {
        root: root.querySelector(".gw-playlist-modal") || null,
        rootMargin: "220px"
      }
    );

    slots.forEach((slot) => observer.observe(slot));
  }

  const WILDLIST_RECIPES = [
    {
      id: "custom",
      title: "Custom Wildlist",
      subtitle: "Choose observations manually.",
      icon: "🧺"
    },
    {
      id: "today",
      title: "Today’s Observations",
      subtitle: "Everything observed today.",
      icon: "☀️"
    },
    {
      id: "week",
      title: "This Week’s Observations",
      subtitle: "Recent field activity from the last 7 days.",
      icon: "📅"
    },
    {
      id: "mysteries",
      title: "My Mysteries",
      subtitle: "Unknowns and observations needing identity work.",
      icon: "❓"
    },
    {
      id: "leafhoppers",
      title: "My Leafhoppers",
      subtitle: "Leafhopper-ish observations from recent activity.",
      icon: "🪲"
    },
    {
      id: "party_recent",
      title: "Recent Party",
      subtitle: "Build from recent party effort, route, and contributors.",
      icon: "👣",
      placeholder: true
    }
  ];

  function compactObs(o) {
    return {
      id: o.id,
      taxon: o.taxon || "",
      common_name: o.common_name || "",
      scientific_name: o.scientific_name || "",
      observed_on: o.observed_on || null,
      photo_url: o.photo_square_url || o.photo_url || null,
      photo_square_url: o.photo_square_url || o.photo_url || null,
      photo_medium_url: o.photo_square_url || o.photo_url || o.photo_medium_url || null,
      iconic_taxon_name: o.iconic_taxon_name || "Unknown",
      genus_name: o.genus_name || "",
      uri: o.uri || null,
      lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : null,
      lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : null,
      accuracy: Number.isFinite(Number(o.accuracy)) ? Number(o.accuracy) : null,
      place_guess: o.place_guess || ""
    };
  }

  function getWildlistObsName(o) {
    return o?.taxon || o?.common_name || o?.scientific_name || "Unknown taxon";
  }

  function getWildlistObsTime(o) {
    const raw = o?.time_observed_at || o?.observed_on || o?.created_at || "";
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  function getWildlistKingdom(o) {
    const raw = String(o?.iconic_taxon_name || "").trim();
    const key = raw.toLowerCase();

    if (!key || key === "unknown") return "Unknown";
    if (key === "plantae") return "Plants";
    if (key === "fungi") return "Fungi";
    if (key === "protozoa") return "Protozoa";
    if (key === "chromista") return "Chromista";

    if (
      [
        "animalia",
        "actinopterygii",
        "amphibia",
        "arachnida",
        "aves",
        "insecta",
        "mammalia",
        "mollusca",
        "reptilia"
      ].includes(key)
    ) {
      return "Animals";
    }

    return raw;
  }

  function getWildlistSearchText(o) {
    return [
      getWildlistObsName(o),
      o?.common_name,
      o?.scientific_name,
      o?.genus_name,
      o?.iconic_taxon_name,
      getWildlistKingdom(o),
      o?.observed_on
    ]
      .join(" ")
      .toLowerCase();
  }

  function getWildlistKingdomOptions(obs) {
    const preferredOrder = ["Animals", "Plants", "Fungi", "Protozoa", "Chromista", "Unknown"];
    const found = new Set((obs || []).map(getWildlistKingdom).filter(Boolean));

    return [
      ...preferredOrder.filter((name) => found.has(name)),
      ...[...found]
        .filter((name) => !preferredOrder.includes(name))
        .sort((a, b) => a.localeCompare(b))
    ];
  }

  function renderCustomWildlistFilterBank(obs) {
    const kingdoms = getWildlistKingdomOptions(obs);

    return `
      <div class="gw-custom-wildlist-filter-bank" id="gwCustomWildlistFilterBank">
        <div class="gw-custom-wildlist-filter-row">
          <label class="gw-custom-wildlist-field">
            <span>Find</span>
            <input id="gwCustomWildlistSearch" type="search" placeholder="Taxon, genus, date">
          </label>

          <label class="gw-custom-wildlist-field">
            <span>Kingdom</span>
            <select id="gwCustomWildlistKingdom">
              <option value="">All</option>
              ${kingdoms.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}
            </select>
          </label>

          <label class="gw-custom-wildlist-field">
            <span>Sort</span>
            <select id="gwCustomWildlistSort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="taxon">Taxon A-Z</option>
            </select>
          </label>

          <button class="gw-mini-btn gw-custom-wildlist-filter-reset" id="gwCustomWildlistFilterReset" type="button">
            Reset
          </button>
        </div>
      </div>
    `;
  }

  function initCustomWildlistFilterBank(modal, updateCount) {
    const bank = modal.querySelector("#gwCustomWildlistFilterBank");
    const grid = modal.querySelector("#gwCustomWildlistGrid");
    if (!bank || !grid) return;

    const search = bank.querySelector("#gwCustomWildlistSearch");
    const kingdom = bank.querySelector("#gwCustomWildlistKingdom");
    const sort = bank.querySelector("#gwCustomWildlistSort");
    const reset = bank.querySelector("#gwCustomWildlistFilterReset");

    const tiles = Array.from(grid.querySelectorAll(".gw-custom-wildlist-tile"));

    function apply() {
      const q = String(search?.value || "")
        .trim()
        .toLowerCase();
      const selectedKingdom = String(kingdom?.value || "");
      const sortMode = String(sort?.value || "newest");

      const ordered = tiles.slice().sort((a, b) => {
        if (sortMode === "oldest") {
          return Number(a.dataset.wildlistTime || 0) - Number(b.dataset.wildlistTime || 0);
        }

        if (sortMode === "taxon") {
          return String(a.dataset.wildlistName || "").localeCompare(
            String(b.dataset.wildlistName || "")
          );
        }

        return Number(b.dataset.wildlistTime || 0) - Number(a.dataset.wildlistTime || 0);
      });

      ordered.forEach((tile) => {
        const matchesKingdom = !selectedKingdom || tile.dataset.wildlistKingdom === selectedKingdom;
        const matchesSearch = !q || String(tile.dataset.wildlistSearch || "").includes(q);
        tile.style.display = matchesKingdom && matchesSearch ? "block" : "none";
        grid.appendChild(tile);
      });

      updateCount();
    }

    search?.addEventListener("input", apply);
    kingdom?.addEventListener("change", apply);
    sort?.addEventListener("change", apply);
    reset?.addEventListener("click", () => {
      if (search) search.value = "";
      if (kingdom) kingdom.value = "";
      if (sort) sort.value = "newest";
      apply();
      search?.focus();
    });

    apply();
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

    const idx = all.findIndex((p) => p.id === full.id);
    if (idx >= 0) all[idx] = full;
    else all.unshift(full);

    saveAll(all);
    return full;
  }

  function getById(id) {
    return loadAll().find((p) => p.id === id) || null;
  }

  function deleteById(id) {
    saveAll(loadAll().filter((p) => p.id !== id));
  }

  function localDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function observationDateKey(obs) {
    const raw = obs?.observed_on || obs?.time_observed_at || obs?.created_at || "";
    if (!raw) return "";

    const text = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }

    return localDateKey(new Date(text));
  }

  function observationDate(obs) {
    const key = observationDateKey(obs);
    if (!key) return null;

    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function filterToday(obs) {
    const today = localDateKey();
    return obs.filter((o) => observationDateKey(o) === today);
  }

  function filterThisWeek(obs) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 7);

    return obs.filter((o) => {
      const d = observationDate(o);
      return d && !Number.isNaN(d.getTime()) && d >= cutoff;
    });
  }

  function filterMysteries(obs) {
    return obs.filter((o) => {
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
    return obs.filter((o) => {
      const hay = [o.taxon, o.common_name, o.scientific_name].join(" ").toLowerCase();

      return (
        hay.includes("leafhopper") || hay.includes("cicadellidae") || hay.includes("hemiptera")
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
      observationIds: selected.map((o) => o.id),
      snapshotObservations: selected.map(compactObs)
    });
  }

  function applyRecipeFilters(selected, filters = {}) {
    let out = Array.isArray(selected) ? selected.slice() : [];

    const taxonFilter = String(filters.taxonFilter || "")
      .trim()
      .toLowerCase();
    if (taxonFilter) {
      out = out.filter((o) => {
        const hay = [o.taxon, o.common_name, o.scientific_name, o.iconic_taxon_name, o.genus_name]
          .join(" ")
          .toLowerCase();

        return hay.includes(taxonFilter);
      });
    }

    if (filters.photosOnly) {
      out = out.filter((o) => o.photo_medium_url || o.photo_square_url || o.photo_url);
    }

    const maxObs = Number(filters.maxObs || 60);
    if (Number.isFinite(maxObs) && maxObs > 0) {
      out = out.slice(0, maxObs);
    }

    return out;
  }

  function buildTemplatePlaylistWithFilters(template, filters = {}) {
    const obs = getRecentObs();

    let title = "New Wildlist";
    let selected = [];

    if (template === "today") {
      title = "Today’s Observations";
      selected = filterToday(obs);
    } else if (template === "week") {
      title = "This Week’s Observations";
      selected = filterThisWeek(obs);
    } else if (template === "mysteries") {
      title = "My Mysteries";
      selected = filterMysteries(obs);
    } else if (template === "leafhoppers") {
      title = "My Leafhoppers";
      selected = filterLeafhoppers(obs);
    }

    selected = applyRecipeFilters(selected, filters);

    if (!selected.length) {
      alert("No observations matched that recipe/filter combination.");
    }

    return savePlaylist({
      title,
      description: "",
      mode: "template",
      template,
      observationIds: selected.map((o) => o.id),
      snapshotObservations: selected.map(compactObs)
    });
  }

  function openPartyWildlistPlaceholder() {
    const partyStore = JSON.parse(localStorage.getItem("gw_party_sessions_v1") || "[]");

    alert(
      [
        "Party Wildlists are the next integration point.",
        "",
        `Found ${Array.isArray(partyStore) ? partyStore.length : 0} locally stored party sessions.`,
        "",
        "Next version will snapshot:",
        "• party title",
        "• participants",
        "• start/end time",
        "• route/path polyline",
        "• contributed observations",
        "• effort stats"
      ].join("\n")
    );
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
        ${all
          .slice(0, 3)
          .map(
            (p) => `
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
        `
          )
          .join("")}
      </div>
    `;

    el.querySelectorAll(".gw-open-wildlist-btn").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
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
    const builderObs = obs.slice(0, 120);

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

      ${renderCustomWildlistFilterBank(builderObs)}

      <div id="gwCustomWildlistCount" class="gw-muted" style="font-size:12px;margin-top:10px;">
        0 selected
      </div>

      <div id="gwCustomWildlistGrid" style="
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
        gap:10px;
        margin-top:12px;
      ">
        ${builderObs
          .map((o) => {
            const img = getObsThumbUrl(o);
            const name = getWildlistObsName(o);
            const kingdom = getWildlistKingdom(o);
            const searchText = getWildlistSearchText(o);
            const sortName = name.toLowerCase();
            const sortTime = getWildlistObsTime(o);

            return `
            <label
              class="gw-card gw-custom-wildlist-tile"
              data-obs-id="${esc(o.id)}"
              data-wildlist-kingdom="${esc(kingdom)}"
              data-wildlist-search="${esc(searchText)}"
              data-wildlist-name="${esc(sortName)}"
              data-wildlist-time="${esc(sortTime)}"
              style="
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
              " data-wildlist-photo-slot data-obs-id="${esc(o.id)}">
                ${
                  img
                    ? `<img src="${esc(img)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">`
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
          })
          .join("")}
      </div>

      ${
        obs.length > 120
          ? `
        <div class="gw-muted" style="font-size:11px;margin-top:10px;">
          Showing first 120 recent observations.
        </div>
      `
          : ""
      }
    </div>
  `;

    document.body.appendChild(modal);
    observeWildlistThumbnails(modal);

    const checks = Array.from(modal.querySelectorAll(".gwCustomWildlistObsCheck"));
    const countEl = modal.querySelector("#gwCustomWildlistCount");
    const tiles = Array.from(modal.querySelectorAll(".gw-custom-wildlist-tile"));

    function updateCount() {
      const n = checks.filter((c) => c.checked).length;
      const shown = tiles.filter((tile) => tile.style.display !== "none").length;
      countEl.textContent = `${n} selected - ${shown} shown`;
    }

    function getShownChecks() {
      return checks.filter((c) => c.closest(".gw-custom-wildlist-tile")?.style.display !== "none");
    }

    checks.forEach((c) => c.addEventListener("change", updateCount));
    initCustomWildlistFilterBank(modal, updateCount);

    modal.querySelector("#gwSelectAllWildlistObsBtn").onclick = () => {
      getShownChecks().forEach((c) => (c.checked = true));
      updateCount();
    };

    modal.querySelector("#gwClearWildlistObsBtn").onclick = () => {
      checks.forEach((c) => (c.checked = false));
      updateCount();
    };

    modal.querySelector("#gwCustomWildlistCloseBtn").onclick = () => modal.remove();

    modal.querySelector("#gwSaveCustomWildlistBtn").onclick = () => {
      const selectedIds = checks.filter((c) => c.checked).map((c) => String(c.value));

      if (!selectedIds.length) {
        alert("Choose at least one observation.");
        return;
      }

      const latestById = new Map(getRecentObs().map((o) => [String(o.id), o]));
      const initialById = new Map(obs.map((o) => [String(o.id), o]));
      const selected = selectedIds
        .map((id) => latestById.get(String(id)) || initialById.get(String(id)))
        .filter(Boolean)
        .map(compactObs);

      const title =
        modal.querySelector("#gwCustomWildlistTitle")?.value?.trim() || "Custom Wildlist";

      const description = modal.querySelector("#gwCustomWildlistDescription")?.value?.trim() || "";

      const playlist = savePlaylist({
        id: editingPlaylistId || undefined,
        title,
        description,
        mode: "custom",
        template: null,
        observationIds: selected.map((o) => o.id),
        snapshotObservations: selected
      });

      modal.remove();
      renderSummary();
      openViewer(playlist.id);
    };

    modal.onclick = (evt) => {
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
    ensureStyles();

    const obs = getRecentObs();

    const modal = document.createElement("div");
    modal.className = "gw-playlist-backdrop";

    modal.innerHTML = `
    <div class="gw-playlist-modal">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div>
          <div style="font-size:22px;font-weight:950;color:#f0d18a;">
            Create Wildlist
          </div>
          <div class="gw-muted" style="font-size:12px;margin-top:3px;">
            Choose a recipe, then optionally filter what goes into it.
          </div>
        </div>

        <button class="gw-mini-btn" id="gwRecipeCloseBtn">Close</button>
      </div>

      <div class="gw-card" style="margin-top:12px;">
        <div class="gw-card-title">Basic filters</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label class="gw-muted" style="font-size:11px;">
            Taxon contains
            <input id="gwRecipeTaxonFilter" placeholder="e.g. moss, bird, fern" style="
              width:100%;
              box-sizing:border-box;
              margin-top:4px;
              padding:8px;
              border-radius:10px;
              border:1px solid rgba(215,183,116,0.25);
              background:rgba(255,255,255,0.06);
              color:#efe6d3;
            ">
          </label>

          <label class="gw-muted" style="font-size:11px;">
            Max observations
            <input id="gwRecipeMaxObs" type="number" value="60" min="1" max="200" style="
              width:100%;
              box-sizing:border-box;
              margin-top:4px;
              padding:8px;
              border-radius:10px;
              border:1px solid rgba(215,183,116,0.25);
              background:rgba(255,255,255,0.06);
              color:#efe6d3;
            ">
          </label>
        </div>

        <label class="gw-toggleline" style="margin-top:10px;">
          <input type="checkbox" id="gwRecipePhotosOnly">
          <span>Only include observations with photos</span>
        </label>
      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));
        gap:10px;
        margin-top:12px;
      ">
        ${WILDLIST_RECIPES.map(
          (r) => `
          <button
            class="gw-card gw-recipe-btn"
            data-recipe-id="${esc(r.id)}"
            style="
              margin:0;
              text-align:left;
              cursor:pointer;
              min-height:118px;
              ${r.placeholder ? "opacity:.72;" : ""}
            "
          >
            <div style="font-size:26px;margin-bottom:8px;">${esc(r.icon)}</div>
            <div style="font-weight:950;color:#f0d18a;font-size:14px;">
              ${esc(r.title)}
            </div>
            <div class="gw-muted" style="font-size:11px;line-height:1.35;margin-top:5px;">
              ${esc(r.subtitle)}
            </div>
            ${
              r.placeholder
                ? `
              <div class="gw-muted" style="font-size:10px;margin-top:8px;">
                placeholder
              </div>
            `
                : ""
            }
          </button>
        `
        ).join("")}
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    modal.querySelector("#gwRecipeCloseBtn").onclick = () => modal.remove();

    modal.querySelectorAll(".gw-recipe-btn").forEach((btn) => {
      btn.onclick = () => {
        const recipeId = btn.dataset.recipeId;

        const taxonFilter = modal.querySelector("#gwRecipeTaxonFilter")?.value?.trim() || "";
        const photosOnly = !!modal.querySelector("#gwRecipePhotosOnly")?.checked;
        const maxObs = Number(modal.querySelector("#gwRecipeMaxObs")?.value || 60);

        modal.remove();

        if (recipeId === "custom") {
          return openCustomBuilder();
        }

        if (recipeId === "party_recent") {
          return openPartyWildlistPlaceholder();
        }

        const playlist = buildTemplatePlaylistWithFilters(recipeId, {
          taxonFilter,
          photosOnly,
          maxObs
        });

        renderSummary();
        openViewer(playlist.id);
      };
    });

    modal.onclick = (evt) => {
      if (evt.target === modal) modal.remove();
    };

    if (!obs.length) {
      // Allow modal to open, but warn once.
      setTimeout(() => {
        alert(
          "Recent observations are empty. Refresh Recent Observations before using observation-based recipes."
        );
      }, 100);
    }
  }

  function openLibrary() {
    ensureStyles();

    const all = loadAll();

    if (!all.length) {
      openEmptyLibraryDialog();
      return;
    }

    const modal = document.createElement("div");
    modal.className = "gw-playlist-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "gwWildlistLibraryTitle");

    modal.innerHTML = `
      <div class="gw-playlist-modal gw-wildlist-library-modal">
        <div class="gw-wildlist-library-head">
          <div>
            <div class="gw-wildlist-library-title" id="gwWildlistLibraryTitle">My Wildlists</div>
            <div class="gw-wildlist-library-sub">
              Open a field story or share a link.
            </div>
          </div>
          <button class="gw-mini-btn" id="gwWildlistLibraryCloseBtn" type="button">Close</button>
        </div>

        <div class="gw-wildlist-library-list">
          ${all.map((p) => renderLibraryItem(p)).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    modal.querySelector("#gwWildlistLibraryCloseBtn").onclick = close;

    modal.querySelectorAll(".gw-wildlist-library-open").forEach((btn) => {
      btn.onclick = (evt) => {
        evt.preventDefault();
        const id = btn.dataset.playlistId;
        close();
        openViewer(id);
      };
    });

    modal.querySelectorAll(".gw-wildlist-library-share").forEach((btn) => {
      btn.onclick = async (evt) => {
        evt.preventDefault();
        const id = btn.dataset.playlistId;
        const status = getLibraryField(modal, "gw-wildlist-library-status", id);
        await copyPlaylistShareLink(id, status);
      };
    });

    modal.onclick = (evt) => {
      if (evt.target === modal) close();
    };

    modal.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") close();
    });
  }

  function getLibraryField(root, className, playlistId) {
    return (
      Array.from(root.querySelectorAll(`.${className}`)).find(
        (el) => String(el.dataset.playlistId) === String(playlistId)
      ) || null
    );
  }

  function renderLibraryItem(playlist) {
    const observations = playlist.snapshotObservations || [];
    const stats = getPlaylistStats(observations);
    const updated = playlist.updatedAt ? new Date(playlist.updatedAt) : null;
    const updatedLabel =
      updated && !Number.isNaN(updated.getTime())
        ? updated.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
        : "unknown update";

    return `
      <section class="gw-wildlist-library-item" data-playlist-id="${esc(playlist.id)}">
        <div class="gw-wildlist-library-top">
          <div>
            <div class="gw-wildlist-library-name">${esc(playlist.title || "Untitled Wildlist")}</div>
            <div class="gw-wildlist-library-meta">
              ${observations.length.toLocaleString()} observations · ${stats.nTaxa.toLocaleString()} taxa · updated ${esc(updatedLabel)}
            </div>
          </div>

          <div class="gw-wildlist-library-actions">
            <button class="gw-mini-btn gw-wildlist-library-open" type="button" data-playlist-id="${esc(playlist.id)}">Open</button>
            <button class="gw-mini-btn gw-wildlist-library-share" type="button" data-playlist-id="${esc(playlist.id)}">Share</button>
          </div>
        </div>

        <div class="gw-wildlist-library-status" data-playlist-id="${esc(playlist.id)}"></div>
      </section>
    `;
  }

  function openEmptyLibraryDialog() {
    ensureStyles();

    const modal = document.createElement("div");
    modal.className = "gw-playlist-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "gwEmptyWildlistsTitle");

    modal.innerHTML = `
      <div class="gw-playlist-modal gw-playlist-empty-dialog">
        <div class="gw-playlist-empty-mark" aria-hidden="true">W</div>
        <div class="gw-playlist-empty-title" id="gwEmptyWildlistsTitle">
          No Wildlists yet
        </div>
        <div class="gw-playlist-empty-copy">
          Create your first Wildlist to collect observations into a field story you can reopen and share.
        </div>
        <div class="gw-playlist-dialog-actions">
          <button class="gw-mini-btn" id="gwEmptyWildlistsCloseBtn" type="button">Close</button>
          <button class="gw-mini-btn gw-playlist-primary-btn" id="gwEmptyWildlistsCreateBtn" type="button">Create Wildlist</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    modal.querySelector("#gwEmptyWildlistsCloseBtn").onclick = close;
    modal.querySelector("#gwEmptyWildlistsCreateBtn").onclick = () => {
      close();
      openCreateMenu();
    };

    modal.onclick = (evt) => {
      if (evt.target === modal) close();
    };

    modal.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") close();
    });

    modal.querySelector("#gwEmptyWildlistsCreateBtn")?.focus();
  }

  function getShareUrl(playlistId) {
    const url = new URL(window.location.href);
    url.searchParams.set("gw_playlist", playlistId);
    return url.toString();
  }

  async function copyPlaylistShareLink(playlistId, statusEl = null) {
    const link = getShareUrl(playlistId);
    try {
      await navigator.clipboard.writeText(link);
      if (statusEl) {
        statusEl.textContent = "Share link copied.";
        setTimeout(() => {
          if (statusEl.textContent === "Share link copied.") statusEl.textContent = "";
        }, 2200);
      } else {
        alert("Wildlist link copied.");
      }
    } catch {
      prompt("Copy this Wildlist link:", link);
    }
  }

  function getPlaylistCoverObs(observations, playlist = {}) {
    if (playlist.coverObsId) {
      const chosen = observations.find((o) => String(o.id) === String(playlist.coverObsId));
      if (chosen) return chosen;
    }

    return (
      observations.find((o) => o.photo_medium_url || o.photo_square_url || o.photo_url) ||
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

    const fmt = (d) =>
      d.toLocaleDateString([], {
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

  function initWildlistMiniMap(playlistId) {
    const host = document.getElementById("gwWildlistMiniMap");
    if (!host || !window.L) return;

    const playlist = getById(playlistId);
    const observations = playlist?.snapshotObservations || [];

    const pts = observations
      .filter((o) => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng)))
      .map((o) => ({
        lat: Number(o.lat),
        lng: Number(o.lng),
        name: o.taxon || o.common_name || o.scientific_name || "Observation"
      }));

    if (!pts.length) {
      host.innerHTML = `
      <div class="gw-muted" style="padding:12px;font-size:12px;">
        No mapped coordinates available for this Wildlist yet.
      </div>
    `;
      return;
    }

    host.innerHTML = "";

    const miniMap = L.map(host, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: true
    });

    (
      window.createGridWildDefaultBaseLayer?.({ flavor: "light" }) ||
      window.createStreetBaseLayer?.() ||
      L.layerGroup()
    ).addTo(miniMap);

    const group = L.featureGroup();

    pts.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        stroke: true,
        weight: 1,
        fillOpacity: 0.85
      })
        .bindPopup(p.name)
        .addTo(group);
    });

    group.addTo(miniMap);

    const bounds = group.getBounds();
    miniMap.fitBounds(bounds.pad(0.25), {
      maxZoom: 18
    });

    // Draw approximate GridWild cells if helper exists
    if (typeof window.getCellKeyForLatLng === "function") {
      const seen = new Set();

      pts.forEach((p) => {
        const key = window.getCellKeyForLatLng(p.lat, p.lng);
        if (!key || seen.has(key)) return;
        seen.add(key);

        // Placeholder cell marker for now: circle around occupied grid cell.
        L.circle([p.lat, p.lng], {
          radius: 10,
          weight: 1,
          fillOpacity: 0.08
        }).addTo(miniMap);
      });
    }

    setTimeout(() => miniMap.invalidateSize(), 100);
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
    const coverImg =
      coverObs?.photo_medium_url || coverObs?.photo_square_url || coverObs?.photo_url || "";
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
  ${
    coverImg
      ? `
    <img src="${esc(coverImg)}" style="
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:cover;
      filter:saturate(1.08) contrast(1.03);
    ">
  `
      : ""
  }

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


    <div class="gw-card" style="margin-bottom:12px;">
    <div class="gw-card-title">Observation Map</div>

    <div
        id="gwWildlistMiniMap"
        style="
        height:220px;
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(215,183,116,0.18);
        background:rgba(0,0,0,0.22);
        "
    ></div>

    <div class="gw-muted" style="font-size:11px;margin-top:8px;">
        Observation points and approximate occupied GridWild cells.
    </div>
    </div>

  <div class="gw-muted" style="font-size:12px;margin-top:10px;">
    ${esc(stats.dateRange)}
  </div>
</div>

        ${
          playlist.description
            ? `
          <div class="gw-muted" style="font-size:13px;line-height:1.4;margin-top:8px;">
            ${esc(playlist.description)}
          </div>
        `
            : ""
        }

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

    setTimeout(() => {
      initWildlistMiniMap(playlist.id);
    }, 80);

    modal.querySelectorAll(".gw-wildlist-slide-tile").forEach((tile) => {
      tile.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        const i = Number(tile.dataset.index || 0);
        openSlideshow(playlist.id, i);
      };
    });

    modal.querySelectorAll(".gw-set-cover-btn").forEach((btn) => {
      btn.onclick = (evt) => {
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
      await copyPlaylistShareLink(playlist.id);
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

    modal.onclick = (evt) => {
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
          ${
            img
              ? `<img src="${esc(img)}" style="width:100%;max-height:62vh;object-fit:contain;">`
              : `<div class="gw-muted">No photo</div>`
          }
        </div>

        <div style="margin-top:12px;">
          <div style="font-size:20px;font-weight:950;color:#f0d18a;line-height:1.15;">
            ${esc(name)}
          </div>

          ${
            sci
              ? `
            <div class="gw-muted" style="font-size:13px;margin-top:3px;">
              <i>${esc(sci)}</i>
            </div>
          `
              : ""
          }

          <div class="gw-muted" style="font-size:12px;margin-top:6px;">
            ${esc(o.observed_on || "unknown date")}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
          ${
            o.uri
              ? `
            <a class="gw-mini-btn" href="${esc(o.uri)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none;">
              Open iNaturalist
            </a>
          `
              : `<button class="gw-mini-btn" disabled>Open iNaturalist</button>`
          }

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

    modal.onclick = (evt) => {
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
        ${
          img
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
    const obs = getRecentObs().find((o) => String(o.id) === String(obsId));

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

    const labels = all.map(
      (p, i) => `${i + 1}. ${p.title} (${(p.snapshotObservations || []).length} obs)`
    );

    const choice = prompt(
      ["Add to which Wildlist?", "", "0. Create new Wildlist", ...labels].join("\n")
    );

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
      playlist.snapshotObservations = [...(playlist.snapshotObservations || []), compactObs(obs)];

      playlist = savePlaylist(playlist);
    }

    renderSummary();
    alert(`Added to ${playlist.title}.`);
  }

  function createFromObservations(observations, options = {}) {
    const selected = Array.isArray(observations) ? observations.filter(Boolean) : [];

    if (!selected.length) {
      alert("No observations selected for this Wildlist.");
      return null;
    }

    const playlist = savePlaylist({
      title: options.title || "Activity Wildlist",
      description: options.description || "",
      mode: options.mode || "activity",
      template: options.template || null,
      observationIds: selected.map((o) => o.id),
      snapshotObservations: selected.map(compactObs),
      coverObsId:
        options.coverObsId ||
        selected.find((o) => o.photo_medium_url || o.photo_square_url || o.photo_url)?.id ||
        null
    });

    renderSummary();

    if (options.open !== false) {
      openViewer(playlist.id);
    }

    return playlist;
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
    createFromObservations,
    openSlideshow,
    buildTemplatePlaylistWithFilters,
    openPartyWildlistPlaceholder
  };
})();
