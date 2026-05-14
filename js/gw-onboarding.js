// ─────────────────────────────────────────────────────────────
// GridWild onboarding: splash carousel + guided mobile tour
// ─────────────────────────────────────────────────────────────

(function () {
  const STORAGE_KEY = "gw_onboarded_v1";

  const tourTargets = [
    {
      selector: "#recenterFab",
      title: "Recenter GPS",
      body: "Tap this to jump back to your current position. The small badge shows GPS health while you explore.",
      arrow: "top-right"
    },
    {
      selector: "#gwLocationPickerBtn",
      title: "Choose a place",
      body: "Use Location to jump to coordinates, pick a saved base, or explore somewhere away from your current GPS position.",
      arrow: "top-left"
    },
    {
      selector: "#legendPill",
      title: "Map controls",
      body: "Legend opens the full control sheet: layer toggles, heat metric, fog options, and the older iconic taxa checkboxes.",
      arrow: "top-left"
    },
    {
      selector: "#gwHudLegend",
      title: "Change lens",
      body: "This compact colormap shows the active ecological lens. Tap it to open the Lens picker and change how the overlay is colored.",
      arrow: "top-left"
    },
    {
      selector: "#gwHudTaxaFilter",
      title: "Filter life groups",
      body: "These quick toggles filter the overlay by major life group. They mirror the Iconic taxa controls in the Legend sheet.",
      arrow: "top-left"
    },
    {
      selector: "#map",
      title: "Your living grid",
      body: "Each square is a patch of nearby nature. Move through the grid, reveal fog, and use observations to make places permanent.",
      arrow: "center"
    },
    {
      selector: "#btnInfo",
      title: "Inspect the center",
      body: "Scan opens details for the center square: summary stats, local observers, taxonomy structure, and recent activity.",
      arrow: "bottom-left"
    },
    {
      selector: "#btnCamera",
      title: "Capture a find",
      body: "Use the camera button to start a draft observation, edit the photo, and send it toward iNaturalist.",
      arrow: "bottom-center"
    },
    {
      selector: "#btnCommunity",
      title: "Explore together",
      body: "Party opens shared exploration tools: live parties, routes, evidence, recaps, and group survey workflows.",
      arrow: "bottom-right"
    },
    {
      selector: "#btnQuest",
      title: "Take quests",
      body: "Quest opens daily prompts, current quests, archives, and survey-linked challenges that give direction to a walk.",
      arrow: "bottom-right"
    },
    {
      selector: "#btnMe",
      title: "Your explorer",
      body: "Me holds your account, character, achievements, inventory, playlists, and progress across GridWild.",
      arrow: "bottom-left"
    }
  ];

  const splashCards = [
    {
      emoji: "🌎",
      title: "Welcome to GridWild",
      body: "GridWild turns your neighborhood into a living map of biodiversity. Every square around you contains nature waiting to be observed."
    },
    {
      emoji: "📷",
      title: "Anything alive counts",
      body: "A blade of grass, a flower, a beetle, a tree, moss on a wall, a pigeon on a roof — all of it helps reveal the life around you."
    },
    {
      emoji: "🖼️",
      title: "Tune your photos",
      body: "After photographing a find, use the photo editor to lighten, crop, or zoom your image before handing it off to iNaturalist."
    },
    {
      type: "character",
      emoji: "🧭",
      title: "Create your field identity",
      body: "Choose how other GridWild explorers will see you: your name, explorer type, icon, and field style."
    },
    {
      type: "account",
      emoji: "GW",
      title: "Save your explorer",
      body: "Create a GridWild account to keep quests, Wildpoints, inventory, parties, and your field identity across devices."
    },
    {
      emoji: "🧑‍🤝‍🧑",
      title: "Explore as a party",
      body: "Start a party to explore with friends in real time, or schedule a public or private place and time to gather and survey nature together."
    },
    {
      emoji: "📚",
      title: "Publish Wildlists",
      body: "Curate and publish playlist galleries of your observations. Build them manually, choose a whole party event, or auto-generate collections, then present your finds as shareable field stories."
    },
    {
    emoji: "🏕️",
    title: "Choose a home base",
    body: "Pick a home base for your GridWild identity. From there, you can host Field Stations for other explorers to visit, gather around, and help survey nearby life."
    },
    {
    emoji: "🗺️",
    title: "Plan your path",
    body: "Map out a route before you explore. Choose the squares, habitats, or survey stops you want to visit, then follow your path in the field."
    },
    {
      emoji: "📋",
      title: "Join field surveys",
      body: "Create or join ongoing field surveys to track what lives in a place over time. Surveys can focus a group around a habitat, event, season, or shared discovery goal."
    },
    {
      emoji: "🎯",
      title: "Quests give direction",
      body: "Earn points by completing nature quests of different difficulty: common species, overlooked taxa, seasonal finds, and hard discoveries. Quests help achieve survey goals"
    },
  //    {
  //     emoji: "🏴",
    //    title: "Claim territory",
    //    body: "Make observations in nearby squares to rise on the local leaderboard. Keep your observations fresh to defend your top spot."
    // },
  {
    emoji: "🏅",
    title: "Earn achievements",
    body: "Unlock achievements by meeting observation criteria. Record 10 plants in a day, or become the local Night Bloom Archivist by finding flowers after sunset."
  },
  {
    emoji: "🍃",
    title: "Spend Wildpoints",
    body: "Earn Wildpoints as you explore, then use them to customize your GridWild identity, gear, titles, field style, and other explorer details."
  },
    {
      emoji: "🐦",
      title: "Powered by iNaturalist",
      body: "GridWild connects with iNaturalist. Your observations can be identified by the community and contribute to real biodiversity knowledge."
    }
  ];

  function injectStyles() {
    if (document.getElementById("gwOnboardingStyles")) return;

    const style = document.createElement("style");
    style.id = "gwOnboardingStyles";
    style.textContent = `

      .gw-splash-card {
          touch-action: pan-y;
        }
          
      .gw-onboard-hidden { display: none !important; }

      .gw-onboard-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background:
          radial-gradient(circle at 50% 20%, rgba(255,255,255,0.10), transparent 34%),
          rgba(13, 20, 15, 0.82);
        color: #fff7df;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        box-sizing: border-box;
      }

      .gw-splash-card {
        width: min(430px, 94vw);
        min-height: 520px;
        border-radius: 26px;
        padding: 26px 22px 20px;
        box-sizing: border-box;
        background:
          linear-gradient(180deg, rgba(52, 73, 46, 0.97), rgba(24, 35, 25, 0.98)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 8px);
        border: 2px solid rgba(240, 207, 132, 0.76);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        display: flex;
        flex-direction: column;
        text-align: center;
      }

      .gw-splash-emoji {
        font-size: 62px;
        line-height: 1;
        margin: 8px 0 18px;
        filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
      }

      .gw-splash-title {
        font-size: 30px;
        line-height: 1.05;
        font-weight: 900;
        letter-spacing: -0.02em;
        margin: 0 0 16px;
        color: #ffe7a3;
        text-shadow: 0 2px 0 rgba(0,0,0,0.25);
      }

      .gw-splash-body {
        font-size: 18px;
        line-height: 1.45;
        margin: 0 auto;
        color: #fff7df;
        max-width: 34ch;
      }

      .gw-splash-dots {
        display: flex;
        justify-content: center;
        gap: 7px;
        margin: auto 0 18px;
      }

      .gw-splash-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.35);
      }

      .gw-splash-dot.active {
        width: 24px;
        background: #ffe082;
      }

      .gw-onboard-actions {
        display: flex;
        gap: 10px;
      }

      .gw-onboard-btn {
        border: 0;
        border-radius: 999px;
        padding: 13px 16px;
        font-size: 15px;
        font-weight: 850;
        cursor: pointer;
        min-height: 48px;
      }

      .gw-onboard-btn.primary {
        flex: 1;
        background: #ffe082;
        color: #21301f;
        box-shadow: 0 7px 0 rgba(0,0,0,0.28);
      }

      .gw-onboard-btn.secondary {
        background: rgba(255,255,255,0.12);
        color: #fff7df;
        border: 1px solid rgba(255,255,255,0.18);
      }

      .gw-tour-layer {
        position: fixed;
        inset: 0;
        z-index: 99998;
        pointer-events: none;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      .gw-tour-shade {
        position: absolute;
        inset: 0;
        background: rgba(5, 10, 7, 0.58);
      }

      .gw-tour-spotlight {
        position: absolute;
        border: 3px solid #ffe082;
        border-radius: 999px;
        box-shadow:
          0 0 0 9999px rgba(5, 10, 7, 0.58),
          0 0 22px rgba(255, 224, 130, 0.9);
        transition: all 260ms ease;
      }

      .gw-tour-card {
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 96px;
        pointer-events: auto;
        border-radius: 22px;
        padding: 18px;
        color: #fff7df;
        background: linear-gradient(180deg, rgba(43, 61, 38, 0.98), rgba(21, 31, 23, 0.98));
        border: 2px solid rgba(240, 207, 132, 0.72);
        box-shadow: 0 18px 60px rgba(0,0,0,0.45);
      }

      .gw-tour-title {
        font-size: 22px;
        font-weight: 900;
        color: #ffe7a3;
        margin: 0 0 7px;
      }

      .gw-tour-body {
        font-size: 16px;
        line-height: 1.36;
        margin: 0 0 14px;
      }

      .gw-tour-arrow {
        position: absolute;
        z-index: 100000;
        color: #ffe082;
        font-size: 42px;
        font-weight: 900;
        text-shadow: 0 4px 12px rgba(0,0,0,0.55);
        animation: gwBounce 0.9s infinite;
        pointer-events: none;
      }

      @keyframes gwBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }

      .gw-tour-progress {
        font-size: 13px;
        opacity: 0.82;
        margin-bottom: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  function makeEl(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function launchSplash() {
    injectStyles();

    let idx = 0;

    const root = makeEl("div", "gw-onboard-backdrop");
    const card = makeEl("div", "gw-splash-card");
    root.appendChild(card);
    document.body.appendChild(root);

    // ─────────────────────────────────────────────
    // Swipe carousel support
    // ─────────────────────────────────────────────
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    function goNextFromSplash() {
      if (idx < splashCards.length - 1) {
        idx++;
        render();
      } else {
        root.remove();
        launchTour();
      }
    }

    function goPrevFromSplash() {
      if (idx > 0) {
        idx--;
        render();
      }
    }

    card.addEventListener("touchstart", (e) => {
      if (!e.touches || e.touches.length !== 1) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    card.addEventListener("touchend", (e) => {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;

      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;

      const isHorizontalSwipe =
        Math.abs(dx) > 55 &&
        Math.abs(dx) > Math.abs(dy) * 1.4 &&
        dt < 650;

      if (!isHorizontalSwipe) return;

      if (dx < 0) {
        goNextFromSplash();   // swipe left = next
      } else {
        goPrevFromSplash();   // swipe right = previous
      }
    }, { passive: true });



function renderCharacterCard() {
  const c = splashCards[idx];
  const character = window.GridWildCharacter?.load?.() || {
    displayName: "New Wanderer",
    archetype: "naturalist",
    icon: "🌿",
    color: "fern"
  };

  card.innerHTML = `
    <div class="gw-splash-emoji">${c.emoji}</div>
    <h1 class="gw-splash-title">${c.title}</h1>
    <p class="gw-splash-body">${c.body}</p>

    <div style="
      margin:22px auto 10px;
      width:100%;
      max-width:320px;
      border-radius:20px;
      border:1px solid rgba(240,207,132,0.34);
      background:rgba(0,0,0,0.16);
      padding:14px;
      box-sizing:border-box;
      text-align:left;
    ">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="
          width:58px;height:58px;border-radius:18px;
          display:flex;align-items:center;justify-content:center;
          font-size:32px;
          background:rgba(240,209,138,0.12);
          border:1px solid rgba(240,209,138,0.26);
        ">
          ${character.icon || "🌿"}
        </div>

        <div>
          <div style="font-size:18px;font-weight:950;color:#ffe7a3;">
            ${character.displayName || "New Wanderer"}
          </div>
          <div style="font-size:12px;color:rgba(255,247,223,0.70);margin-top:3px;">
            ${character.archetype || "naturalist"} · ${character.color || "fern"}
          </div>
        </div>
      </div>

      <button class="gw-onboard-btn secondary" id="gwOnboardEditCharacter" style="width:100%;margin-top:14px;">
        Edit character
      </button>
    </div>

    <div class="gw-splash-dots">
      ${splashCards.map((_, i) => `<div class="gw-splash-dot ${i === idx ? "active" : ""}"></div>`).join("")}
    </div>

    <div class="gw-onboard-actions">
      <button class="gw-onboard-btn secondary" id="gwOnboardSkip">Skip</button>
      <button class="gw-onboard-btn primary" id="gwOnboardNext">Looks good</button>
    </div>
  `;

  document.getElementById("gwOnboardEditCharacter").onclick = () => {
    window.GridWildCharacter?.openEditor?.();
  };

  document.getElementById("gwOnboardSkip").onclick = finishAll;

  document.getElementById("gwOnboardNext").onclick = goNextFromSplash;
}

function renderAccountCard() {
  const c = splashCards[idx];
  const signedIn = window.GridWildAccount?.getAccount?.();

  card.innerHTML = `
    <div class="gw-splash-emoji">${c.emoji}</div>
    <h1 class="gw-splash-title">${c.title}</h1>
    <p class="gw-splash-body">${c.body}</p>

    <div style="
      margin:22px auto 10px;
      width:100%;
      max-width:320px;
      border-radius:20px;
      border:1px solid rgba(240,207,132,0.34);
      background:rgba(0,0,0,0.16);
      padding:14px;
      box-sizing:border-box;
      text-align:left;
    ">
      <div style="font-size:14px;line-height:1.4;color:rgba(255,247,223,0.82);">
        ${signedIn?.username
          ? `Signed in as <b>@${signedIn.username}</b>.`
          : "Guest progress stays on this device. An account lets you come back anywhere."}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
        <button class="gw-onboard-btn secondary" id="gwOnboardLoginAccount">Log in</button>
        <button class="gw-onboard-btn primary" id="gwOnboardCreateAccount">Create</button>
      </div>
    </div>

    <div class="gw-splash-dots">
      ${splashCards.map((_, i) => `<div class="gw-splash-dot ${i === idx ? "active" : ""}"></div>`).join("")}
    </div>

    <div class="gw-onboard-actions">
      <button class="gw-onboard-btn secondary" id="gwOnboardSkip">Skip</button>
      <button class="gw-onboard-btn primary" id="gwOnboardNext">Continue</button>
    </div>
  `;

  document.getElementById("gwOnboardCreateAccount").onclick = () => {
    window.GridWildAccount?.openModal?.("signup");
  };

  document.getElementById("gwOnboardLoginAccount").onclick = () => {
    window.GridWildAccount?.openModal?.("login");
  };

  document.getElementById("gwOnboardSkip").onclick = finishAll;
  document.getElementById("gwOnboardNext").onclick = goNextFromSplash;
}


    function render() {
      const c = splashCards[idx];
      if (c.type === "character") {
        renderCharacterCard();
        return;
      }
      if (c.type === "account") {
        renderAccountCard();
        return;
      }

      card.innerHTML = `
        <div class="gw-splash-emoji">${c.emoji}</div>
        <h1 class="gw-splash-title">${c.title}</h1>
        <p class="gw-splash-body">${c.body}</p>
        <div class="gw-splash-dots">
          ${splashCards.map((_, i) => `<div class="gw-splash-dot ${i === idx ? "active" : ""}"></div>`).join("")}
        </div>
        <div class="gw-onboard-actions">
          <button class="gw-onboard-btn secondary" id="gwOnboardSkip">Skip</button>
          <button class="gw-onboard-btn primary" id="gwOnboardNext">
            ${idx === splashCards.length - 1 ? "Start tour" : "Next"}
          </button>
        </div>
      `;

      document.getElementById("gwOnboardSkip").onclick = finishAll;
      document.getElementById("gwOnboardNext").onclick = goNextFromSplash;
    }

    function finishAll() {
      localStorage.setItem(STORAGE_KEY, "1");
      root.remove();
    }

    render();
  }

  function getTargetRect(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;

    const r = el.getBoundingClientRect();

    if (r.width < 2 || r.height < 2) return null;

    return {
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height
    };
  }

  function launchTour() {
    injectStyles();

    let idx = 0;

    const layer = makeEl("div", "gw-tour-layer");
    layer.innerHTML = `
      <div class="gw-tour-shade"></div>
      <div class="gw-tour-spotlight"></div>
      <div class="gw-tour-arrow">↓</div>
      <div class="gw-tour-card">
        <div class="gw-tour-progress"></div>
        <div class="gw-tour-title"></div>
        <div class="gw-tour-body"></div>
        <div class="gw-onboard-actions">
          <button class="gw-onboard-btn secondary" id="gwTourSkip">Skip</button>
          <button class="gw-onboard-btn primary" id="gwTourNext">Next</button>
        </div>
      </div>
    `;

    document.body.appendChild(layer);

    const spotlight = layer.querySelector(".gw-tour-spotlight");
    const arrow = layer.querySelector(".gw-tour-arrow");
    const title = layer.querySelector(".gw-tour-title");
    const body = layer.querySelector(".gw-tour-body");
    const progress = layer.querySelector(".gw-tour-progress");
    const next = layer.querySelector("#gwTourNext");
    const skip = layer.querySelector("#gwTourSkip");

    function render() {
      const step = tourTargets[idx];
      const rect = getTargetRect(step.selector) || fallbackRect(step.arrow);

      const pad = step.selector === "#map" ? 24 : 12;
      const size = Math.max(rect.w, rect.h) + pad * 2;

      spotlight.style.left = `${rect.x + rect.w / 2 - size / 2}px`;
      spotlight.style.top = `${rect.y + rect.h / 2 - size / 2}px`;
      spotlight.style.width = `${size}px`;
      spotlight.style.height = `${size}px`;

      positionArrow(rect, step.arrow);

      progress.textContent = `Step ${idx + 1} of ${tourTargets.length}`;
      title.textContent = step.title;
      body.textContent = step.body;
      next.textContent = idx === tourTargets.length - 1 ? "Finish" : "Next";
    }

    function fallbackRect(where) {
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (where === "top-right") return { x: w - 78, y: 16, w: 56, h: 56 };
      if (where === "top-left") return { x: 16, y: 16, w: 88, h: 38 };
      if (where === "bottom-left") return { x: 18, y: h - 88, w: 64, h: 64 };
      if (where === "bottom-center") return { x: w / 2 - 32, y: h - 88, w: 64, h: 64 };
      if (where === "bottom-right") return { x: w - 82, y: h - 88, w: 64, h: 64 };

      return { x: w / 2 - 50, y: h / 2 - 50, w: 100, h: 100 };
    }

    function positionArrow(rect, where) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;

      arrow.textContent = "↓";

      if (where === "top-right") {
        arrow.style.left = `${cx - 14}px`;
        arrow.style.top = `${rect.y + rect.h + 18}px`;
        arrow.textContent = "↑";
      } else if (where === "top-left") {
        arrow.style.left = `${cx - 14}px`;
        arrow.style.top = `${rect.y + rect.h + 18}px`;
        arrow.textContent = "↑";
      } else if (where === "bottom-center" || where === "bottom-right" || where === "bottom-left") {
        arrow.style.left = `${cx - 14}px`;
        arrow.style.top = `${rect.y - 52}px`;
        arrow.textContent = "↓";
      } else {
        arrow.style.left = `${cx - 18}px`;
        arrow.style.top = `${cy - 90}px`;
        arrow.textContent = "↓";
      }
    }

    function finish() {
      localStorage.setItem(STORAGE_KEY, "1");
      layer.remove();
      showBeginnerQuest();
    }

    next.onclick = () => {
      if (idx < tourTargets.length - 1) {
        idx++;
        render();
      } else {
        finish();
      }
    };

    skip.onclick = finish;

    window.addEventListener("resize", render, { passive: true });

    render();
  }

  function showBeginnerQuest() {
    const toast = makeEl("div", "gw-onboard-backdrop");
    toast.innerHTML = `
      <div class="gw-splash-card" style="min-height: auto;">
        <div class="gw-splash-emoji">🌱</div>
        <h1 class="gw-splash-title">Beginner Quest</h1>
        <p class="gw-splash-body">
          Observe any living thing nearby.<br><br>
          Reward: <b>+100 XP</b>
        </p>
        <div style="height:24px"></div>
        <button class="gw-onboard-btn primary" id="gwBeginQuest">Start exploring</button>
      </div>
    `;

    document.body.appendChild(toast);

    document.getElementById("gwBeginQuest").onclick = async evt => {
      const btn = evt.currentTarget;

      if (!window.GridWildQuests?.startQuestFromRecipe) {
        toast.remove();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Starting...";

      const quest = await window.GridWildQuests.startQuestFromRecipe({
        range: "anywhere",
        iconicTaxon: "Any",
        objectiveType: "any_observation",
        difficulty: 1,
        timeframe: "today",
        evidence: "photo_gps20",
        surveyId: "none",
        targetLocation: "anywhere",
        target: {
          mode: "anywhere",
          label: "Anywhere",
          radiusCells: null
        }
      }, {
        title: "Beginner Quest: Observe any living thing",
        source: "onboarding",
        rewardXP: 100,
        autoEmbark: true,
        openStatus: false
      });

      if (quest) {
        toast.remove();
      } else {
        btn.disabled = false;
        btn.textContent = "Start exploring";
      }
    };
  }

  window.GridWildOnboarding = {
    launch: launchSplash,
    launchTour,
    reset: function () {
      localStorage.removeItem(STORAGE_KEY);
      launchSplash();
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTimeout(launchSplash, 600);
    }
  });
})();
