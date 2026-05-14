// -----------------------------------------------------------------------------
// GridWild Avatar Renderer
// Shared presentation helper for player identity previews.
// -----------------------------------------------------------------------------

(function () {
  const COLOR_THEMES = {
    fern: { body: "#4f9f64", accent: "#d8f0b0", glow: "rgba(115, 210, 130, 0.30)" },
    moss: { body: "#6f8f4f", accent: "#e2d48f", glow: "rgba(150, 185, 90, 0.28)" },
    amber: { body: "#b47b36", accent: "#ffe082", glow: "rgba(255, 190, 80, 0.28)" },
    lichen: { body: "#9aa872", accent: "#e7edd0", glow: "rgba(195, 215, 145, 0.28)" },
    night: { body: "#4e5d87", accent: "#c7d7ff", glow: "rgba(135, 165, 255, 0.28)" },
    river: { body: "#3f8790", accent: "#c6f1ed", glow: "rgba(95, 210, 215, 0.28)" }
  };

  const ARCHETYPE_LABELS = {
    naturalist: "Naturalist",
    bug_hunter: "Bug Hunter",
    birder: "Birder",
    fungus_friend: "Fungus Friend",
    urban_ranger: "Urban Ranger",
    night_moth_seeker: "Night Moth Seeker"
  };

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function injectStyles() {
    if (document.getElementById("gwAvatarRendererStyles")) return;

    const style = document.createElement("style");
    style.id = "gwAvatarRendererStyles";
    style.textContent = `
      .gw-avatar {
        --gw-avatar-body: #4f9f64;
        --gw-avatar-accent: #d8f0b0;
        --gw-avatar-glow: rgba(115, 210, 130, 0.30);
        position: relative;
        width: 72px;
        height: 72px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }

      .gw-avatar.large {
        width: min(260px, 68vw);
        height: min(260px, 68vw);
      }

      .gw-avatar-stage {
        position: absolute;
        inset: 5%;
        border-radius: 999px;
        background:
          radial-gradient(circle at 50% 42%, rgba(255,255,255,0.18), transparent 36%),
          radial-gradient(circle at 50% 62%, var(--gw-avatar-glow), rgba(0,0,0,0) 66%);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10);
      }

      .gw-avatar.large .gw-avatar-stage {
        inset: 0;
        border-radius: 30px;
        background:
          radial-gradient(circle at 50% 34%, rgba(255,255,255,0.16), transparent 34%),
          linear-gradient(180deg, rgba(63, 83, 58, 0.72), rgba(23, 19, 16, 0.82));
        border: 1px solid rgba(215,183,116,0.22);
      }

      .gw-avatar-shadow {
        position: absolute;
        width: 52%;
        height: 11%;
        left: 24%;
        bottom: 17%;
        border-radius: 999px;
        background: rgba(0,0,0,0.28);
        filter: blur(2px);
      }

      .gw-avatar-body {
        position: absolute;
        width: 46%;
        height: 48%;
        left: 27%;
        top: 29%;
        border-radius: 45% 45% 38% 38%;
        background:
          radial-gradient(circle at 36% 25%, rgba(255,255,255,0.28), transparent 18%),
          linear-gradient(180deg, var(--gw-avatar-accent), var(--gw-avatar-body));
        border: 2px solid rgba(31, 39, 29, 0.48);
        box-shadow: inset 0 -8px 14px rgba(0,0,0,0.16);
      }

      .gw-avatar-head {
        position: absolute;
        width: 38%;
        height: 34%;
        left: 31%;
        top: 15%;
        border-radius: 45% 45% 50% 50%;
        background:
          radial-gradient(circle at 38% 34%, rgba(255,255,255,0.24), transparent 17%),
          linear-gradient(180deg, var(--gw-avatar-accent), var(--gw-avatar-body));
        border: 2px solid rgba(31, 39, 29, 0.52);
        box-shadow: inset 0 -6px 12px rgba(0,0,0,0.13);
      }

      .gw-avatar-face {
        position: absolute;
        left: 39%;
        right: 39%;
        top: 29%;
        height: 9%;
        border-radius: 999px;
        background: rgba(31, 39, 29, 0.68);
        box-shadow: 12px 0 0 rgba(31, 39, 29, 0.68);
      }

      .gw-avatar-hat,
      .gw-avatar-companion,
      .gw-avatar-title,
      .gw-avatar-trail {
        position: absolute;
        display: grid;
        place-items: center;
        line-height: 1;
        text-shadow: 0 2px 8px rgba(0,0,0,0.45);
      }

      .gw-avatar-hat {
        left: 50%;
        top: 9%;
        transform: translateX(-50%) rotate(-6deg);
        width: 42%;
        height: 26%;
        font-size: 18px;
        z-index: 5;
      }

      .gw-avatar.large .gw-avatar-hat {
        font-size: 44px;
      }

      .gw-avatar-companion {
        right: 10%;
        bottom: 24%;
        width: 26%;
        height: 26%;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.16);
        font-size: 17px;
        z-index: 4;
      }

      .gw-avatar.large .gw-avatar-companion {
        font-size: 42px;
      }

      .gw-avatar-title {
        left: 16%;
        bottom: 20%;
        width: 24%;
        height: 24%;
        border-radius: 999px;
        color: #1f271d;
        background: linear-gradient(180deg, #ffe082, #d7b774);
        border: 1px solid rgba(255,224,130,0.70);
        font-size: 15px;
        z-index: 4;
      }

      .gw-avatar.large .gw-avatar-title {
        font-size: 34px;
      }

      .gw-avatar-trail {
        left: 10%;
        top: 24%;
        width: 80%;
        height: 56%;
        color: rgba(255, 224, 130, 0.86);
        font-size: 15px;
        z-index: 1;
        animation: gwAvatarTrailDrift 3.8s ease-in-out infinite;
      }

      .gw-avatar.large .gw-avatar-trail {
        font-size: 30px;
      }

      .gw-avatar-frame {
        position: absolute;
        inset: 2%;
        border-radius: 999px;
        border: 2px solid rgba(215,183,116,0.42);
        pointer-events: none;
        z-index: 6;
      }

      .gw-avatar.large .gw-avatar-frame {
        border-radius: 30px;
        border-width: 3px;
      }

      .gw-avatar-frame.frame-fern_border {
        border-color: rgba(90,190,110,0.86);
        box-shadow: inset 0 0 0 4px rgba(90,190,110,0.12);
      }

      .gw-avatar-frame.frame-beetle_carapace_frame {
        border-color: rgba(166, 121, 230, 0.90);
        box-shadow: inset 0 0 20px rgba(166, 121, 230, 0.18);
      }

      .gw-avatar-frame.frame-museum_label_frame {
        border-style: double;
        border-color: rgba(240,209,138,0.90);
      }

      @keyframes gwAvatarTrailDrift {
        0%, 100% { opacity: 0.54; transform: translateY(0); }
        50% { opacity: 1; transform: translateY(-4px); }
      }
    `;

    document.head.appendChild(style);
  }

  function getTheme(color) {
    return COLOR_THEMES[String(color || "").toLowerCase()] || COLOR_THEMES.fern;
  }

  function getAvatarState() {
    const character = window.GridWildCharacter?.load?.() || {};
    const equipped = window.GridWildEconomy?.getEquippedItems?.() || {};
    const archetypeDef = window.GridWildCharacter?.ARCHETYPES?.find?.(a => a.id === character.archetype);

    return {
      character,
      equipped,
      displayName: window.__gwState?.player?.display_name || character.displayName || "New Wanderer",
      archetypeLabel: archetypeDef?.label || ARCHETYPE_LABELS[character.archetype] || "Naturalist",
      color: character.color || "fern",
      baseIcon: character.icon || archetypeDef?.icon || ""
    };
  }

  function renderHtml(options = {}) {
    injectStyles();

    const state = options.state || getAvatarState();
    const equipped = state.equipped || {};
    const theme = getTheme(state.color);
    const sizeClass = options.size === "large" ? "large" : "small";
    const frameClass = equipped.frame?.id ? ` frame-${esc(equipped.frame.id)}` : "";
    const trailIcon = equipped.trail?.icon || "";
    const hatIcon = equipped.hat?.icon || state.baseIcon || "";
    const companionIcon = equipped.companion?.icon || "";
    const titleIcon = equipped.title?.icon || "";

    return `
      <div
        class="gw-avatar ${sizeClass}"
        style="--gw-avatar-body:${esc(theme.body)};--gw-avatar-accent:${esc(theme.accent)};--gw-avatar-glow:${esc(theme.glow)};"
        aria-label="${esc(state.displayName)} field look"
      >
        <div class="gw-avatar-stage"></div>
        ${trailIcon ? `<div class="gw-avatar-trail" title="${esc(equipped.trail?.name || "Trail")}">${esc(trailIcon)}</div>` : ""}
        <div class="gw-avatar-shadow"></div>
        <div class="gw-avatar-body"></div>
        <div class="gw-avatar-head"></div>
        <div class="gw-avatar-face"></div>
        ${hatIcon ? `<div class="gw-avatar-hat" title="${esc(equipped.hat?.name || state.archetypeLabel)}">${esc(hatIcon)}</div>` : ""}
        ${companionIcon ? `<div class="gw-avatar-companion" title="${esc(equipped.companion?.name || "Companion")}">${esc(companionIcon)}</div>` : ""}
        ${titleIcon ? `<div class="gw-avatar-title" title="${esc(equipped.title?.name || "Title")}">${esc(titleIcon)}</div>` : ""}
        ${equipped.frame ? `<div class="gw-avatar-frame${frameClass}" title="${esc(equipped.frame.name || "Frame")}"></div>` : ""}
      </div>
    `;
  }

  function render(container, options = {}) {
    if (!container) return null;
    container.innerHTML = renderHtml(options);
    return container.firstElementChild;
  }

  window.GridWildAvatarRenderer = {
    getAvatarState,
    renderHtml,
    render
  };
})();
