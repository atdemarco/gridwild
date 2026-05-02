// -----------------------------------------------------------------------------
// GridWild Character Identity
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_character_v1";

  const DEFAULT_CHARACTER = {
    displayName: "New Wanderer",
    archetype: "naturalist",
    icon: "🌿",
    color: "fern"
  };

  const ARCHETYPES = [
    { id: "naturalist", label: "Naturalist", icon: "🌿" },
    { id: "bug_hunter", label: "Bug Hunter", icon: "🪲" },
    { id: "birder", label: "Birder", icon: "🐦" },
    { id: "fungus_friend", label: "Fungus Friend", icon: "🍄" },
    { id: "urban_ranger", label: "Urban Ranger", icon: "🏙️" },
    { id: "night_moth_seeker", label: "Night Moth Seeker", icon: "🌙" }
  ];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_CHARACTER, ...JSON.parse(raw) } : { ...DEFAULT_CHARACTER };
    } catch {
      return { ...DEFAULT_CHARACTER };
    }
  }

  function save(character) {
    const next = { ...DEFAULT_CHARACTER, ...(character || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("gwCharacterChanged", { detail: next }));
    return next;
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderSummary() {
    const el = document.getElementById("gwCharacterSummaryBody");
    if (!el) return;

    const c = load();
    const archetype = ARCHETYPES.find(a => a.id === c.archetype) || ARCHETYPES[0];
    const equipped = window.GridWildEconomy?.getEquippedItems?.() || {};

    el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
        <div style="
        width:58px;height:58px;border-radius:18px;
        display:flex;align-items:center;justify-content:center;
        font-size:32px;
        background:rgba(240,209,138,0.10);
        border:1px solid rgba(240,209,138,0.24);
        ">
        ${esc(equipped.hat?.icon || c.icon || archetype.icon)}
        </div>

        <div style="min-width:0;">
        <div style="font-size:18px;font-weight:950;line-height:1.1;">
            ${esc(c.displayName)}
        </div>

        <div class="gw-muted" style="font-size:12px;margin-top:3px;">
            ${esc(equipped.title?.name?.replace(/^Title:\s*/i, "") || archetype.label)}
            · ${esc(c.color)}
        </div>
        </div>
    </div>

    <div class="gw-list" style="margin-top:12px;">
        <div class="gw-rowline">
        <span>Hat / Look</span>
        <span class="gw-muted">${equipped.hat ? `${esc(equipped.hat.icon)} ${esc(equipped.hat.name)}` : "None equipped"}</span>
        </div>

        <div class="gw-rowline">
        <span>Title</span>
        <span class="gw-muted">${equipped.title ? `${esc(equipped.title.icon)} ${esc(equipped.title.name.replace(/^Title:\\s*/i, ""))}` : "None equipped"}</span>
        </div>

        <div class="gw-rowline">
        <span>Companion</span>
        <span class="gw-muted">${equipped.companion ? `${esc(equipped.companion.icon)} ${esc(equipped.companion.name)}` : "None equipped"}</span>
        </div>

        <div class="gw-rowline">
        <span>Trail</span>
        <span class="gw-muted">${equipped.trail ? `${esc(equipped.trail.icon)} ${esc(equipped.trail.name)}` : "None equipped"}</span>
        </div>

        <div class="gw-rowline">
        <span>Frame</span>
        <span class="gw-muted">${equipped.frame ? `${esc(equipped.frame.icon)} ${esc(equipped.frame.name)}` : "None equipped"}</span>
        </div>
    </div>
    `;
  }

  function openEditor() {
    const c = load();

    if (!document.getElementById("gwCharacterModalZFix")) {
    const style = document.createElement("style");
    style.id = "gwCharacterModalZFix";
    style.textContent = `
        .gw-character-modal-backdrop {
        z-index: 100001 !important;
        }
    `;
    document.head.appendChild(style);
    }

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-character-modal-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">Create Character</div>
        <div class="gw-quest-modal-subtitle">
          This is your GridWild identity, separate from iNaturalist.
        </div>

        <div class="gw-quest-form">
          <div class="gw-quest-field">
            <label>Display name</label>
            <input id="gwCharNameInput" value="${esc(c.displayName)}" style="
              width:100%;box-sizing:border-box;border-radius:12px;padding:10px;
              border:1px solid rgba(215,183,116,0.30);
              background:rgba(20,17,15,0.88);color:#efe6d3;font-weight:750;
            ">
          </div>

          <div class="gw-quest-field">
            <label>Explorer type</label>
            <select id="gwCharTypeInput">
              ${ARCHETYPES.map(a => `
                <option value="${esc(a.id)}" ${a.id === c.archetype ? "selected" : ""}>
                  ${esc(a.icon)} ${esc(a.label)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Icon</label>
            <select id="gwCharIconInput">
              ${["🌿","🪲","🐦","🍄","🏙️","🌙","🦋","🐝","🦊","🧭"].map(icon => `
                <option value="${esc(icon)}" ${icon === c.icon ? "selected" : ""}>${esc(icon)}</option>
              `).join("")}
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Color theme</label>
            <select id="gwCharColorInput">
              ${["fern","moss","amber","lichen","night","river"].map(color => `
                <option value="${esc(color)}" ${color === c.color ? "selected" : ""}>${esc(color)}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwCharCancelBtn">Cancel</button>
          <button class="gw-quest-btn primary" id="gwCharSaveBtn">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    root.onclick = evt => {
      if (evt.target === root) root.remove();
    };

    root.querySelector("#gwCharCancelBtn").onclick = () => root.remove();

    root.querySelector("#gwCharSaveBtn").onclick = () => {
      const archetype = root.querySelector("#gwCharTypeInput").value;
      const fallback = ARCHETYPES.find(a => a.id === archetype) || ARCHETYPES[0];

      save({
        displayName: root.querySelector("#gwCharNameInput").value.trim() || "New Wanderer",
        archetype,
        icon: root.querySelector("#gwCharIconInput").value || fallback.icon,
        color: root.querySelector("#gwCharColorInput").value || "fern"
      });

      root.remove();
      renderSummary();
    };
  }

  function bindButtons(root = document) {
    root.querySelector("#gwEditCharacterBtn")?.addEventListener("click", openEditor);
  }

  window.addEventListener("gwEconomyChanged", () => {
      renderSummary();
    });

  window.GridWildCharacter = {
    load,
    save,
    renderSummary,
    openEditor,
    bindButtons,
    ARCHETYPES
  };
})();