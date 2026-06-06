// -----------------------------------------------------------------------------
// GridWild Classroom Loop
// A modular alternative to the original Classroom: learn, practice, apply, reflect.
// -----------------------------------------------------------------------------

(function () {
  const PACKS = [
    {
      id: "flies_bees",
      title: "Fly or Bee?",
      focus: "Insects",
      summary:
        "Learn halteres, wing pairs, eyes, and pollen-carrying clues before trying live unknowns.",
      marks: [
        "one_pair_of_wings_versus_two_pairs",
        "fly_halteres",
        "big_compound_eyes",
        "pollen_baskets",
        "hairy_body"
      ],
      contrast: [
        { label: "True flies", clue: "One wing pair, halteres, often large eyes." },
        {
          label: "Bees and wasps",
          clue: "Two wing pairs, no halteres, often hairy bodies or pollen baskets."
        }
      ],
      examples: [
        {
          label: "Known example A",
          prompt: "A winged insect with one visible wing pair and tiny knobs behind the wings.",
          answer: "True fly direction",
          rank: "Order Diptera",
          marks: ["one_pair_of_wings_versus_two_pairs", "fly_halteres", "big_compound_eyes"]
        },
        {
          label: "Known example B",
          prompt: "A fuzzy insect visiting flowers with packed pollen on the hind legs.",
          answer: "Bee direction",
          rank: "Bees and wasps",
          marks: ["hairy_body", "pollen_baskets"]
        }
      ]
    },
    {
      id: "maples_oaks_mints",
      title: "Leaves That Narrow Fast",
      focus: "Plants",
      summary: "Use arrangement, stem shape, odor, and fruit clues to narrow common plant groups.",
      marks: [
        "opposite_leaves",
        "alternate_leaves",
        "square_stem_versus_round_stem",
        "aromatic_crushed_leaf_odor",
        "lobed_leaf",
        "acorn_nut",
        "winged_seed_samara"
      ],
      contrast: [
        {
          label: "Mint-family direction",
          clue: "Opposite leaves, square stems, aromatic crushed leaves."
        },
        { label: "Oak direction", clue: "Alternate leaves, lobes, acorns." },
        { label: "Maple direction", clue: "Opposite leaves and winged samaras." }
      ],
      examples: [
        {
          label: "Known example A",
          prompt: "Opposite leaves, square stem, and a strong smell when crushed.",
          answer: "Mint-family direction",
          rank: "Family Lamiaceae style evidence",
          marks: ["opposite_leaves", "square_stem_versus_round_stem", "aromatic_crushed_leaf_odor"]
        },
        {
          label: "Known example B",
          prompt: "Alternate lobed leaves and a nut seated in a cup.",
          answer: "Oak direction",
          rank: "Genus Quercus style evidence",
          marks: ["alternate_leaves", "lobed_leaf", "acorn_nut"]
        }
      ]
    },
    {
      id: "mushroom_surfaces",
      title: "Gills, Pores, Teeth",
      focus: "Fungi",
      summary:
        "Practice broad mushroom underside clues before trying to name a fungus too specifically.",
      marks: [
        "gills_present",
        "pores_instead_of_gills",
        "teeth_spines_instead_of_gills",
        "gills_decurrent_down_stalk",
        "ring_on_stalk",
        "volva_cup_at_base",
        "growing_on_wood_versus_soil_versus_leaf_litter"
      ],
      contrast: [
        { label: "Gilled mushrooms", clue: "Radiating plates under the cap." },
        { label: "Boletes and pore fungi", clue: "Tiny holes instead of plates." },
        { label: "Toothed fungi", clue: "Spines or teeth under the cap." }
      ],
      examples: [
        {
          label: "Known example A",
          prompt: "A cap-and-stalk mushroom with radiating plates running slightly down the stalk.",
          answer: "Gilled mushroom direction",
          rank: "Broad fungus group",
          marks: ["gills_present", "gills_decurrent_down_stalk"]
        },
        {
          label: "Known example B",
          prompt: "The underside is full of tiny pores rather than plates.",
          answer: "Pore fungus / bolete direction",
          rank: "Broad fungus group",
          marks: ["pores_instead_of_gills"]
        }
      ]
    }
  ];

  const STAGES = [
    { key: "learn", label: "Learn", title: "Learn the marks" },
    { key: "practice", label: "Practice", title: "Practice on known examples" },
    { key: "apply", label: "Apply", title: "Try a live unknown" },
    { key: "reflect", label: "Reflect", title: "Calibrate confidence" }
  ];

  const DESIGN_PROMPTS = [
    {
      id: "pack_source",
      question: "Where should lesson packs come from first?",
      options: ["Nearby common taxa", "Current quest target", "Recent personal observations"]
    },
    {
      id: "gate_live",
      question: "Should live iNat submission require field-mark evidence?",
      options: ["Require 1-3 marks", "Prompt but allow skip", "No gate"]
    },
    {
      id: "reward_shape",
      question: "What should rewards favor most?",
      options: ["Good evidence", "Correct broad rank", "Specific IDs"]
    }
  ];

  const state = {
    packId: PACKS[0].id,
    stage: "learn",
    exampleIndex: 0,
    revealed: false,
    marked: {},
    promptChoices: {}
  };

  let activeRoot = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function currentPack() {
    return PACKS.find((pack) => pack.id === state.packId) || PACKS[0];
  }

  function currentExample() {
    const pack = currentPack();
    return pack.examples[state.exampleIndex % pack.examples.length] || pack.examples[0];
  }

  function fieldMark(id) {
    return (
      window.GridWildFieldMarks?.get?.(id) || {
        id,
        label: id.replace(/_/g, " "),
        prompt: "Can you see this field mark?",
        explanation: "This mark is part of the practice pack."
      }
    );
  }

  function markState(id) {
    return state.marked[id] || "unset";
  }

  function setMark(id, value) {
    if (!id) return;
    if (!value || value === "unset") delete state.marked[id];
    else state.marked[id] = value;
    render();
  }

  function activeEvidence() {
    return Object.entries(state.marked)
      .filter(([, value]) => value !== "unset")
      .map(([id, value]) => ({ mark: fieldMark(id), value }));
  }

  function suggestions() {
    const dispositions = {};
    Object.entries(state.marked).forEach(([id, value]) => {
      if (value === "seen" || value === "out") dispositions[id] = value;
    });
    return window.GridWildFieldMarks?.suggestionsFor?.(dispositions) || [];
  }

  function injectStyles() {
    if (document.getElementById("gwClassroomLoopStyles")) return;
    const style = document.createElement("style");
    style.id = "gwClassroomLoopStyles";
    style.textContent = `
      .gw-classloop-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        color: #efe6d3;
        background: rgba(6, 9, 10, 0.76);
        box-sizing: border-box;
      }

      .gw-classloop-shell {
        width: min(1180px, 97vw);
        max-height: 93vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid rgba(145,210,244,0.38);
        background:
          radial-gradient(circle at 12% 0%, rgba(145,210,244,0.13), transparent 32%),
          linear-gradient(180deg, rgba(29,35,32,0.99), rgba(13,16,17,0.99));
        box-shadow: 0 24px 80px rgba(0,0,0,0.64);
      }

      .gw-classloop-head,
      .gw-classloop-rail,
      .gw-classloop-card-head,
      .gw-classloop-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-classloop-head {
        padding: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.09);
      }

      .gw-classloop-kicker {
        color: #91d2f4;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .gw-classloop-title {
        margin-top: 3px;
        color: #f0d18a;
        font-size: 22px;
        font-weight: 950;
        line-height: 1.08;
      }

      .gw-classloop-sub {
        margin-top: 4px;
        color: rgba(239,230,211,0.66);
        font-size: 12px;
      }

      .gw-classloop-close,
      .gw-classloop-btn,
      .gw-classloop-stage,
      .gw-classloop-pack,
      .gw-classloop-mark-btn,
      .gw-classloop-choice {
        border: 1px solid rgba(215,183,116,0.28);
        border-radius: 8px;
        color: #efe6d3;
        background: rgba(255,255,255,0.06);
        font-weight: 950;
        cursor: pointer;
      }

      .gw-classloop-close {
        width: 34px;
        height: 34px;
        color: #f0d18a;
        font-size: 17px;
      }

      .gw-classloop-body {
        min-height: 0;
        overflow: auto;
        padding: 14px;
      }

      .gw-classloop-layout {
        display: grid;
        grid-template-columns: minmax(250px, 0.36fr) minmax(0, 1fr) minmax(270px, 0.42fr);
        gap: 12px;
        align-items: start;
      }

      .gw-classloop-panel,
      .gw-classloop-main {
        min-width: 0;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(0,0,0,0.16);
      }

      .gw-classloop-panel {
        padding: 12px;
      }

      .gw-classloop-main {
        overflow: hidden;
      }

      .gw-classloop-rail {
        padding: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-wrap: wrap;
      }

      .gw-classloop-stage {
        min-height: 34px;
        padding: 7px 10px;
        font-size: 11px;
      }

      .gw-classloop-stage.is-active,
      .gw-classloop-btn.primary,
      .gw-classloop-pack.is-active,
      .gw-classloop-mark-btn.is-seen,
      .gw-classloop-choice.is-active {
        color: #10251d;
        background: #91d2f4;
        border-color: rgba(255,255,255,0.52);
      }

      .gw-classloop-content {
        padding: 14px;
      }

      .gw-classloop-section-title {
        color: #f0d18a;
        font-size: 14px;
        font-weight: 950;
      }

      .gw-classloop-small {
        color: rgba(239,230,211,0.66);
        font-size: 11px;
        line-height: 1.35;
      }

      .gw-classloop-pack-list,
      .gw-classloop-card-list,
      .gw-classloop-mark-list,
      .gw-classloop-prompt-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .gw-classloop-pack,
      .gw-classloop-card,
      .gw-classloop-prompt {
        padding: 10px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.045);
      }

      .gw-classloop-pack {
        text-align: left;
      }

      .gw-classloop-pack b,
      .gw-classloop-card b,
      .gw-classloop-prompt b {
        display: block;
        color: #efe6d3;
        font-size: 12px;
      }

      .gw-classloop-pack span,
      .gw-classloop-card span,
      .gw-classloop-prompt span {
        display: block;
        margin-top: 3px;
      }

      .gw-classloop-mark {
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.045);
        padding: 9px;
      }

      .gw-classloop-mark-label {
        color: #efe6d3;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-classloop-mark-actions,
      .gw-classloop-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 9px;
      }

      .gw-classloop-mark-btn,
      .gw-classloop-btn,
      .gw-classloop-choice {
        min-height: 30px;
        padding: 6px 9px;
        font-size: 10px;
      }

      .gw-classloop-mark-btn.is-out {
        color: #ffe4df;
        background: rgba(190,70,60,0.34);
      }

      .gw-classloop-example {
        border-radius: 14px;
        border: 1px solid rgba(145,210,244,0.20);
        background:
          linear-gradient(180deg, rgba(145,210,244,0.08), rgba(255,255,255,0.035));
        padding: 14px;
      }

      .gw-classloop-answer {
        margin-top: 10px;
        padding: 10px;
        border-radius: 10px;
        color: #10251d;
        background: #f0d18a;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-classloop-live-box {
        border-radius: 12px;
        border: 1px solid rgba(158,230,189,0.24);
        background: rgba(80,180,120,0.10);
        padding: 12px;
      }

      @media (max-width: 920px) {
        .gw-classloop-layout {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      @media (max-width: 520px) {
        .gw-classloop-backdrop {
          padding: 0;
        }

        .gw-classloop-shell {
          width: 100vw;
          max-height: 100dvh;
          min-height: 100dvh;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function open(options = {}) {
    injectStyles();
    close();
    if (options.packId) state.packId = options.packId;
    if (options.stage) state.stage = options.stage;
    activeRoot = document.createElement("div");
    activeRoot.className = "gw-classloop-backdrop";
    document.body.appendChild(activeRoot);
    activeRoot.addEventListener("click", (evt) => {
      if (evt.target === activeRoot) close();
    });
    render();
  }

  function close() {
    activeRoot?.remove();
    activeRoot = null;
  }

  function render() {
    if (!activeRoot) return;
    const pack = currentPack();
    activeRoot.innerHTML = `
      <div class="gw-classloop-shell">
        <div class="gw-classloop-head">
          <div>
            <div class="gw-classloop-kicker">Wildlab Classroom</div>
            <div class="gw-classloop-title">Learn -> Practice -> Identify</div>
            <div class="gw-classloop-sub">A mock loop for building field-mark confidence before live iNaturalist IDs.</div>
          </div>
          <button class="gw-classloop-close" type="button" data-gw-classloop-close aria-label="Close Classroom">x</button>
        </div>
        <div class="gw-classloop-body">
          <div class="gw-classloop-layout">
            ${renderPackPanel(pack)}
            ${renderMain(pack)}
            ${renderDesignPanel()}
          </div>
        </div>
      </div>
    `;
    bind(activeRoot);
  }

  function renderPackPanel(pack) {
    return `
      <aside class="gw-classloop-panel">
        <div class="gw-classloop-section-title">Lesson packs</div>
        <div class="gw-classloop-small">Small loops built from field marks, contrast cases, known examples, and a live-ID bridge.</div>
        <div class="gw-classloop-pack-list">
          ${PACKS.map(
            (item) => `
            <button class="gw-classloop-pack ${item.id === pack.id ? "is-active" : ""}" type="button" data-gw-classloop-pack="${esc(item.id)}">
              <b>${esc(item.title)}</b>
              <span class="gw-classloop-small">${esc(item.summary)}</span>
            </button>
          `
          ).join("")}
        </div>
      </aside>
    `;
  }

  function renderMain(pack) {
    return `
      <main class="gw-classloop-main">
        <div class="gw-classloop-rail">
          ${STAGES.map(
            (stage) => `
            <button class="gw-classloop-stage ${state.stage === stage.key ? "is-active" : ""}" type="button" data-gw-classloop-stage="${esc(stage.key)}">
              ${esc(stage.label)}
            </button>
          `
          ).join("")}
        </div>
        <div class="gw-classloop-content">
          ${renderStage(pack)}
        </div>
      </main>
    `;
  }

  function renderStage(pack) {
    if (state.stage === "practice") return renderPracticeStage(pack);
    if (state.stage === "apply") return renderApplyStage(pack);
    if (state.stage === "reflect") return renderReflectStage(pack);
    return renderLearnStage(pack);
  }

  function renderLearnStage(pack) {
    return `
      <div class="gw-classloop-section-title">${esc(pack.title)}: marks first</div>
      <p class="gw-classloop-small">${esc(pack.summary)}</p>
      <div class="gw-classloop-card-list">
        ${pack.contrast
          .map(
            (item) => `
          <div class="gw-classloop-card">
            <b>${esc(item.label)}</b>
            <span class="gw-classloop-small">${esc(item.clue)}</span>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="gw-classloop-mark-list">
        ${pack.marks.map((id) => renderMarkCard(id)).join("")}
      </div>
      <div class="gw-classloop-actions">
        <button class="gw-classloop-btn primary" type="button" data-gw-classloop-stage="practice">Practice known examples</button>
      </div>
    `;
  }

  function renderPracticeStage(pack) {
    const example = currentExample();
    return `
      <div class="gw-classloop-section-title">Known research-grade practice</div>
      <p class="gw-classloop-small">Mocked as a ground-truth lane: hide the ID, mark what you see, then reveal what evidence justified the answer.</p>
      <div class="gw-classloop-example">
        <div class="gw-classloop-card-head">
          <div>
            <div class="gw-classloop-kicker">${esc(example.label)}</div>
            <div class="gw-classloop-title" style="font-size:18px;">What direction does this support?</div>
          </div>
          <button class="gw-classloop-btn" type="button" data-gw-classloop-next-example>Next</button>
        </div>
        <p class="gw-classloop-small">${esc(example.prompt)}</p>
        <div class="gw-classloop-mark-list">
          ${pack.marks.map((id) => renderMarkCard(id, example.marks.includes(id))).join("")}
        </div>
        <div class="gw-classloop-actions">
          <button class="gw-classloop-btn primary" type="button" data-gw-classloop-reveal>${state.revealed ? "Hide answer" : "Reveal ground truth"}</button>
          <button class="gw-classloop-btn" type="button" data-gw-classloop-stage="apply">Try live unknown</button>
        </div>
        ${
          state.revealed
            ? `
          <div class="gw-classloop-answer">
            Ground truth: ${esc(example.answer)} (${esc(example.rank)}). Strong marks: ${example.marks.map((id) => esc(fieldMark(id).label)).join(", ")}.
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  function renderApplyStage(pack) {
    const evidence = activeEvidence();
    return `
      <div class="gw-classloop-section-title">Bridge to live Identify</div>
      <div class="gw-classloop-live-box">
        <p class="gw-classloop-small">The goal is not to guess. The goal is to carry evidence into a real unknown and stop at the rank your marks support.</p>
        <div class="gw-classloop-card-list">
          <div class="gw-classloop-card">
            <b>Evidence you have warmed up</b>
            <span class="gw-classloop-small">
              ${evidence.length ? evidence.map((row) => `${row.value}: ${row.mark.label}`).join("; ") : "No marks selected yet. Practice can require 1-3 before live submission."}
            </span>
          </div>
          <div class="gw-classloop-card">
            <b>Suggested directions</b>
            <span class="gw-classloop-small">${
              suggestions()
                .slice(0, 3)
                .map((row) => row.label)
                .join(", ") || "Select marks to create suggestions."
            }</span>
          </div>
        </div>
        <div class="gw-classloop-actions">
          <button class="gw-classloop-btn primary" type="button" data-gw-classloop-open-identify>Open live Identify</button>
          <button class="gw-classloop-btn" type="button" data-gw-classloop-stage="reflect">Reflect after attempt</button>
        </div>
      </div>
    `;
  }

  function renderReflectStage(pack) {
    return `
      <div class="gw-classloop-section-title">Reflect and calibrate</div>
      <p class="gw-classloop-small">This is where GridWild can teach iNat judgment: when broad IDs are better, when a mark supports a family, and when species-level confidence is not earned yet.</p>
      <div class="gw-classloop-card-list">
        <div class="gw-classloop-card">
          <b>Reward evidence</b>
          <span class="gw-classloop-small">XP for naming the mark, ruling out a lookalike, and stopping at a justified rank.</span>
        </div>
        <div class="gw-classloop-card">
          <b>Mark mastery</b>
          <span class="gw-classloop-small">Track comfort by mark: halteres noticed, gills vs pores, opposite leaves, square stem.</span>
        </div>
        <div class="gw-classloop-card">
          <b>Next loop</b>
          <span class="gw-classloop-small">Use missed marks to recommend the next pack instead of generic lessons.</span>
        </div>
      </div>
      <div class="gw-classloop-actions">
        <button class="gw-classloop-btn primary" type="button" data-gw-classloop-stage="learn">Start another loop</button>
      </div>
    `;
  }

  function renderMarkCard(id, expected = false) {
    const mark = fieldMark(id);
    const value = markState(id);
    return `
      <div class="gw-classloop-mark">
        <div class="gw-classloop-row">
          <div>
            <div class="gw-classloop-mark-label">${esc(mark.label)}</div>
            <div class="gw-classloop-small">${esc(mark.prompt || mark.explanation || "")}</div>
          </div>
          ${expected ? `<span class="gw-classloop-small">target</span>` : ""}
        </div>
        <div class="gw-classloop-mark-actions">
          ${renderMarkButton(id, "seen", value)}
          ${renderMarkButton(id, "out", value)}
          ${renderMarkButton(id, "unset", value)}
        </div>
      </div>
    `;
  }

  function renderMarkButton(id, value, current) {
    const label = value === "seen" ? "Seen" : value === "out" ? "Rule out" : "Unsure";
    const cls =
      value === "seen" && current === "seen"
        ? "is-seen"
        : value === "out" && current === "out"
          ? "is-out"
          : "";
    return `<button class="gw-classloop-mark-btn ${cls}" type="button" data-gw-classloop-mark="${esc(id)}" data-gw-classloop-mark-value="${esc(value)}">${esc(label)}</button>`;
  }

  function renderDesignPanel() {
    return `
      <aside class="gw-classloop-panel">
        <div class="gw-classloop-section-title">Design prompts</div>
        <div class="gw-classloop-small">These are intentionally unresolved choices for you to react to.</div>
        <div class="gw-classloop-prompt-list">
          ${DESIGN_PROMPTS.map(
            (prompt) => `
            <div class="gw-classloop-prompt">
              <b>${esc(prompt.question)}</b>
              <div class="gw-classloop-actions">
                ${prompt.options
                  .map(
                    (option) => `
                  <button
                    class="gw-classloop-choice ${state.promptChoices[prompt.id] === option ? "is-active" : ""}"
                    type="button"
                    data-gw-classloop-prompt="${esc(prompt.id)}"
                    data-gw-classloop-choice="${esc(option)}"
                  >
                    ${esc(option)}
                  </button>
                `
                  )
                  .join("")}
              </div>
            </div>
          `
          ).join("")}
        </div>
        <div class="gw-classloop-card-list">
          <div class="gw-classloop-card">
            <b>Old Classroom</b>
            <span class="gw-classloop-small">The previous Learn / Practice pane is still available from the Identify card.</span>
          </div>
        </div>
      </aside>
    `;
  }

  function bind(root) {
    root.querySelector("[data-gw-classloop-close]")?.addEventListener("click", close);

    root.querySelectorAll("[data-gw-classloop-pack]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.packId = btn.dataset.gwClassloopPack || state.packId;
        state.exampleIndex = 0;
        state.revealed = false;
        state.marked = {};
        render();
      });
    });

    root.querySelectorAll("[data-gw-classloop-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.stage = btn.dataset.gwClassloopStage || "learn";
        state.revealed = false;
        render();
      });
    });

    root.querySelectorAll("[data-gw-classloop-mark]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMark(btn.dataset.gwClassloopMark, btn.dataset.gwClassloopMarkValue || "unset");
      });
    });

    root.querySelector("[data-gw-classloop-reveal]")?.addEventListener("click", () => {
      state.revealed = !state.revealed;
      render();
    });

    root.querySelector("[data-gw-classloop-next-example]")?.addEventListener("click", () => {
      const pack = currentPack();
      state.exampleIndex = (state.exampleIndex + 1) % pack.examples.length;
      state.revealed = false;
      state.marked = {};
      render();
    });

    root.querySelector("[data-gw-classloop-open-identify]")?.addEventListener("click", () => {
      close();
      window.GridWildIdentify?.openIdentifyDialog?.();
    });

    root.querySelectorAll("[data-gw-classloop-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.promptChoices[btn.dataset.gwClassloopPrompt] = btn.dataset.gwClassloopChoice || "";
        render();
      });
    });
  }

  document.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-gw-classloop-open]");
    if (!btn) return;
    evt.preventDefault();
    evt.stopPropagation();
    open();
  });

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && activeRoot?.isConnected) close();
  });

  window.GridWildClassroomLoop = {
    open,
    close,
    getState: () => ({
      ...state,
      marked: { ...state.marked },
      promptChoices: { ...state.promptChoices }
    })
  };
})();
