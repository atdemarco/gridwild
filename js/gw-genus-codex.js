// -----------------------------------------------------------------------------
// GridWild Genus Codex
// Reusable genus slideshow pane with fixed lore + reusable field-mark glossary.
// Public API:
//   window.GridWildGenusCodex.open("Quercus")
//   window.GridWildGenusCodex.openFromTaxonName("House Sparrow (Passer domesticus)")
// -----------------------------------------------------------------------------

(function () {
  const FIELD_MARKS = {
    lobed_leaf: {
      label: "Lobed leaf",
      desc: "Leaf edge has rounded or pointed projections.",
      svg: leafSvg("lobed")
    },
    serrated_margin: {
      label: "Serrated margin",
      desc: "Leaf edge has small saw-like teeth.",
      svg: leafSvg("serrated")
    },
    opposite_leaves: {
      label: "Opposite leaves",
      desc: "Leaves emerge in pairs across the stem.",
      svg: stemSvg("opposite")
    },
    alternate_leaves: {
      label: "Alternate leaves",
      desc: "Leaves alternate one-by-one along the stem.",
      svg: stemSvg("alternate")
    },
    palmate_leaf: {
      label: "Palmate leaf",
      desc: "Main veins radiate from one central point.",
      svg: leafSvg("palmate")
    },
    compound_leaf: {
      label: "Compound leaf",
      desc: "One leaf is divided into multiple leaflets.",
      svg: leafSvg("compound")
    },
    acorn: {
      label: "Acorn",
      desc: "Nut seated in a scaly cupule.",
      svg: acornSvg()
    },
    samara: {
      label: "Samara",
      desc: "Winged fruit, often spinning as it falls.",
      svg: samaraSvg()
    },
    catkin: {
      label: "Catkin",
      desc: "Dangling flower cluster, often wind-pollinated.",
      svg: simpleIconSvg("〽", "catkin")
    },
    basal_rosette: {
      label: "Basal rosette",
      desc: "Leaves cluster low around the plant base.",
      svg: simpleIconSvg("✺", "rosette")
    },

    conical_bill: {
      label: "Conical bill",
      desc: "Short triangular bill for seeds.",
      svg: birdBillSvg("conical")
    },
    hooked_bill: {
      label: "Hooked bill",
      desc: "Curved tip used for tearing prey.",
      svg: birdBillSvg("hooked")
    },
    short_tail: {
      label: "Short tail",
      desc: "Compact rear profile; tail does not dominate silhouette.",
      svg: simpleIconSvg("◖", "short tail")
    },
    streaked_breast: {
      label: "Streaked breast",
      desc: "Vertical marks on chest or flanks.",
      svg: simpleIconSvg("≋", "streaks")
    },
    eye_ring: {
      label: "Eye ring",
      desc: "Pale ring around the eye.",
      svg: simpleIconSvg("◎", "eye ring")
    },

    fuzzy_body: {
      label: "Fuzzy body",
      desc: "Dense hairs give a plush appearance.",
      svg: insectSvg("fuzzy")
    },
    pollen_basket: {
      label: "Pollen basket",
      desc: "Flattened hind-leg area carrying pollen.",
      svg: insectSvg("pollen")
    },
    wasp_waist: {
      label: "Wasp waist",
      desc: "Very narrow connection between thorax and abdomen.",
      svg: insectSvg("waist")
    },
    elytra: {
      label: "Elytra",
      desc: "Hardened beetle forewings meeting down the back.",
      svg: insectSvg("elytra")
    },
    halteres: {
      label: "Halteres",
      desc: "Tiny balancing organs behind fly wings.",
      svg: insectSvg("halteres")
    },
    scales_on_wings: {
      label: "Scaly wings",
      desc: "Butterfly and moth wings are covered in tiny scales.",
      svg: insectSvg("scales")
    },
    long_proboscis: {
      label: "Long proboscis",
      desc: "Tube-like mouthpart for sipping nectar.",
      svg: insectSvg("proboscis")
    },

    eyes_touching: {
      label: "Eyes touching",
      desc: "Large compound eyes meet broadly on top.",
      svg: dragonflySvg("eyes")
    },
    elongated_abdomen: {
      label: "Long abdomen",
      desc: "Long narrow abdomen behind winged thorax.",
      svg: dragonflySvg("abdomen")
    },
    aquatic_nymph: {
      label: "Aquatic nymph",
      desc: "Immature stage lives underwater.",
      svg: simpleIconSvg("≈", "aquatic")
    },

    fruiting_body: {
      label: "Fruiting body",
      desc: "Visible mushroom-like reproductive structure.",
      svg: mushroomSvg("cap")
    },
    gills: {
      label: "Gills",
      desc: "Radiating plates under a mushroom cap.",
      svg: mushroomSvg("gills")
    },
    pores: {
      label: "Pores",
      desc: "Tiny holes instead of gills under cap.",
      svg: mushroomSvg("pores")
    }
  };

  const CODEX_BASE_URL = "assets/genuscodex/";
  const CODEX_MANIFEST_URL = `${CODEX_BASE_URL}genus-codex-manifest.json`;
  
  const GENERA = {};
  let codexLoadPromise = null;
  
  function basename(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop();
  }

  async function loadGenusCodex() {
    if (codexLoadPromise) return codexLoadPromise;

    codexLoadPromise = (async () => {
    
      const manifestResp = await fetch(CODEX_MANIFEST_URL);

      if (!manifestResp.ok) {
        throw new Error(`Failed to load genus codex manifest: HTTP ${manifestResp.status}`);
      }

      const manifest = await manifestResp.json();

      const batchFiles = (manifest.batchFiles || [])
        .map(row => basename(row.file))
        .filter(Boolean);

      const batches = await Promise.all(
        batchFiles.map(async file => {
          const resp = await fetch(`${CODEX_BASE_URL}${file}`);
          if (!resp.ok) {
            throw new Error(`Failed to load codex batch ${file}: HTTP ${resp.status}`);
          }
          return resp.json();
        })
      );

      for (const batch of batches) {
        Object.assign(GENERA, batch);
      }

      window.__gwGenusCodexLoaded = true;
      console.log(`GridWild Genus Codex loaded: ${Object.keys(GENERA).length} genera`);

      return GENERA;
    })();

    return codexLoadPromise;
  }



  function genus(genus, common, family, badge, fieldMarks, lore, facts, thumbUrl = "") {
    return { genus, common, family, badge, fieldMarks, lore, facts, thumbUrl };
  }

  function injectStyles() {
    if (document.getElementById("gwGenusCodexStyles")) return;
    const style = document.createElement("style");
    style.id = "gwGenusCodexStyles";
    style.textContent = `
      .gw-codex-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99997;
        background:
          radial-gradient(circle at 50% 18%, rgba(255,255,255,0.10), transparent 34%),
          rgba(13, 20, 15, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        color: #fff7df;
      }

      .gw-codex-card {
        width: min(450px, 96vw);
        max-height: min(760px, 92vh);
        border-radius: 26px;
        padding: 18px 16px 14px;
        box-sizing: border-box;
        background:
          linear-gradient(180deg, rgba(52, 73, 46, 0.98), rgba(24, 35, 25, 0.99)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 8px);
        border: 2px solid rgba(240, 207, 132, 0.76);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .gw-codex-top {
        display: grid;
        grid-template-columns: 86px 1fr;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }

      .gw-codex-thumb {
        width: 86px;
        height: 86px;
        border-radius: 18px;
        background:
          radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 34%),
          linear-gradient(180deg, rgba(234,210,142,0.25), rgba(0,0,0,0.14));
        border: 1px solid rgba(240,207,132,0.32);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffe7a3;
        font-size: 30px;
        font-weight: 900;
        overflow: hidden;
      }

      .gw-codex-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .gw-codex-genus {
        font-size: 31px;
        line-height: 1;
        font-weight: 950;
        font-style: italic;
        color: #ffe7a3;
        text-shadow: 0 2px 0 rgba(0,0,0,0.25);
      }

      .gw-codex-common {
        margin-top: 5px;
        font-size: 14px;
        font-weight: 800;
        color: rgba(255,247,223,0.92);
      }

      .gw-codex-meta {
        margin-top: 4px;
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(240,207,132,0.86);
        font-weight: 900;
      }

      .gw-codex-lore {
        min-height: 82px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: 21px;
        line-height: 1.24;
        font-weight: 850;
        color: #fff7df;
        padding: 8px 8px 12px;
      }

      .gw-codex-section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: rgba(240,207,132,0.95);
        font-weight: 950;
        margin: 6px 0 8px;
      }

      .gw-fieldmark-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 10px;
      }

      .gw-fieldmark {
        min-height: 126px;
        border-radius: 16px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(240,207,132,0.18);
        padding: 7px;
        box-sizing: border-box;
        text-align: center;
      }

      .gw-fieldmark-plate {
        height: 52px;
        border-radius: 12px;
        background: rgba(255,247,223,0.92);
        border: 1px solid rgba(0,0,0,0.16);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 6px;
        overflow: hidden;
      }

      .gw-fieldmark-plate svg {
        width: 100%;
        height: 100%;
      }

      .gw-fieldmark-label {
        color: #ffe7a3;
        font-weight: 900;
        font-size: 12px;
        line-height: 1.05;
      }

      .gw-fieldmark-desc {
        margin-top: 4px;
        color: rgba(255,247,223,0.78);
        font-size: 10.5px;
        line-height: 1.18;
      }

      .gw-codex-fact {
        margin-top: 4px;
        border-radius: 17px;
        padding: 12px;
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(240,207,132,0.20);
        color: rgba(255,247,223,0.92);
        font-size: 14px;
        line-height: 1.28;
      }

      .gw-codex-dots {
        display: flex;
        justify-content: center;
        gap: 7px;
        margin: 12px 0;
      }

      .gw-codex-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.35);
      }

      .gw-codex-dot.active {
        width: 24px;
        background: #ffe082;
      }

      .gw-codex-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 9px;
      }

      .gw-codex-btn {
        border: 0;
        border-radius: 999px;
        min-height: 46px;
        padding: 11px 12px;
        font-size: 14px;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-codex-btn.primary {
        background: #ffe082;
        color: #21301f;
        box-shadow: 0 6px 0 rgba(0,0,0,0.28);
      }

      .gw-codex-btn.secondary {
        background: rgba(255,255,255,0.12);
        color: #fff7df;
        border: 1px solid rgba(255,255,255,0.18);
      }

      @media (max-width: 420px) {
        .gw-codex-card { padding: 15px 13px 13px; }
        .gw-codex-genus { font-size: 27px; }
        .gw-codex-lore { font-size: 18px; min-height: 72px; }
        .gw-fieldmark-grid { gap: 6px; }
        .gw-fieldmark { min-height: 118px; padding: 6px; }
      }
    `;
    document.head.appendChild(style);
  }

  async function open(genusName, opts = {}) {
    injectStyles();

    try {
      await loadGenusCodex();
    } catch (err) {
      console.warn("GridWild Genus Codex failed to load; using fallback:", err);
    }

    const clean = normalizeGenus(genusName);
    const rec = GENERA[clean] || makeFallbackGenus(clean || "Unknown");
    
    let idx = 0;
    const slides = rec.lore.slice(0, 3);
    while (slides.length < 3) slides.push("This genus is waiting for a better field note.");

    const root = document.createElement("div");
    root.className = "gw-codex-backdrop";

    const card = document.createElement("div");
    card.className = "gw-codex-card";
    root.appendChild(card);
    document.body.appendChild(root);

    root.addEventListener("click", (evt) => {
      if (evt.target === root) root.remove();
    });

    function render() {
      const marks = (rec.fieldMarks || [])
        .slice(0, 3)
        .map(k => FIELD_MARKS[k])
        .filter(Boolean);

      card.innerHTML = `
        <div class="gw-codex-top">
          <div class="gw-codex-thumb">
            ${rec.thumbUrl ? `<img src="${esc(rec.thumbUrl)}" alt="${esc(rec.genus)}">` : esc(rec.genus.slice(0, 1))}
          </div>
          <div>
            <div class="gw-codex-genus">${esc(rec.genus)}</div>
            <div class="gw-codex-common">${esc(rec.common || "Genus account")}</div>
            <div class="gw-codex-meta">${esc(rec.family || "family unknown")} · ${esc(rec.badge || "Field Mark")}</div>
          </div>
        </div>

        <div class="gw-codex-lore">${esc(slides[idx])}</div>

        <div class="gw-codex-section-title">Field marks</div>
        <div class="gw-fieldmark-grid">
          ${marks.length ? marks.map(renderFieldMark).join("") : renderFieldMark({
            label: "Placeholder",
            desc: "Add glossary tokens for this genus.",
            svg: simpleIconSvg("?", "placeholder")
          })}
        </div>

        <div class="gw-codex-section-title">Rotating field note</div>
        <div class="gw-codex-fact">${esc(selectFact(rec, idx))}</div>

        <div class="gw-codex-dots">
          ${slides.map((_, i) => `<div class="gw-codex-dot ${i === idx ? "active" : ""}"></div>`).join("")}
        </div>

        <div class="gw-codex-actions">
          <button class="gw-codex-btn secondary" id="gwCodexBack">${idx === 0 ? "Close" : "< Back"}</button>
          <button class="gw-codex-btn secondary" id="gwCodexShuffle">Fact</button>
          <button class="gw-codex-btn primary" id="gwCodexNext">${idx === slides.length - 1 ? "Done" : "Next >"}</button>
        </div>
      `;

      document.getElementById("gwCodexBack").onclick = () => {
        if (idx === 0) root.remove();
        else {
          idx -= 1;
          render();
        }
      };

      document.getElementById("gwCodexNext").onclick = () => {
        if (idx >= slides.length - 1) root.remove();
        else {
          idx += 1;
          render();
        }
      };

      document.getElementById("gwCodexShuffle").onclick = () => {
        render();
      };
    }

    render();
  }

  function renderFieldMark(m) {
    return `
      <div class="gw-fieldmark">
        <div class="gw-fieldmark-plate">${m.svg}</div>
        <div class="gw-fieldmark-label">${esc(m.label)}</div>
        <div class="gw-fieldmark-desc">${esc(m.desc)}</div>
      </div>
    `;
  }

  function selectFact(rec, idx) {
    const facts = Array.isArray(rec.facts) && rec.facts.length ? rec.facts : ["No factoids loaded yet."];
    const salt = Math.floor(Date.now() / 45000);
    return facts[(idx + salt) % facts.length];
  }

  function openFromTaxonName(name) {
    const genus = extractGenusFromTaxonName(name);
    return open(genus);
  }

  function normalizeGenus(s) {
    return String(s || "")
      .trim()
      .replace(/[^A-Za-z]/g, " ")
      .split(/\s+/)
      .filter(Boolean)[0] || "";
  }

  function extractGenusFromTaxonName(s) {
    const raw = String(s || "").trim();

    // Handles "House Sparrow (Passer domesticus)".
    const paren = raw.match(/\(([A-Z][a-z]+)\s+[a-z-]+\)/);
    if (paren) return paren[1];

    // Handles "Passer domesticus".
    const binomial = raw.match(/\b([A-Z][a-z]+)\s+[a-z-]+\b/);
    if (binomial) return binomial[1];

    // Handles already-genus display names.
    return normalizeGenus(raw);
  }

  function makeFallbackGenus(genusName) {
    return genus(
      genusName,
      "Genus account placeholder",
      "Unknown family",
      "Unwritten Codex",
      [],
      [
        `${genusName} has entered the GridWild codex.`,
        "Its field marks have not been fully illustrated yet.",
        "This account can be upgraded with glossary tokens and local facts."
      ],
      [
        "Placeholder account: add fixed lore, field marks, and rotating stats.",
        "Use this fallback to test clicks from menus before the dictionary is complete.",
        "Future version: auto-seed from iNaturalist taxonomy and curated field guides."
      ]
    );
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // ---------------------------------------------------------------------------
  // Tiny reusable lithograph-ish SVG generators
  // ---------------------------------------------------------------------------

  function plateSvg(inner) {
    return `
      <svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="120" height="70" fill="#fff7df"/>
        <g stroke="#1d1a14" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          ${inner}
        </g>
        <path d="M91 14 l14 0 l-4 -4 M105 14 l-4 4" stroke="#9b2f20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function leafSvg(type) {
    if (type === "serrated") {
      return plateSvg(`<path d="M59 59 C26 45 24 21 58 8 C94 21 91 45 59 59 Z"/>
        <path d="M59 58 L59 10"/>
        <path d="M58 11 L50 19 L61 18 L48 27 L63 26 L47 36 L65 35 L50 45 L61 43"/>`);
    }
    if (type === "palmate") {
      return plateSvg(`<path d="M60 58 L60 35 M60 35 L35 20 M60 35 L46 9 M60 35 L60 7 M60 35 L75 9 M60 35 L86 20"/>
        <path d="M60 57 C28 37 36 13 47 18 C49 3 57 7 60 18 C64 7 72 3 74 18 C87 13 94 37 60 57 Z"/>`);
    }
    if (type === "compound") {
      return plateSvg(`<path d="M60 62 L60 10"/>
        <ellipse cx="44" cy="23" rx="10" ry="16"/>
        <ellipse cx="76" cy="23" rx="10" ry="16"/>
        <ellipse cx="42" cy="43" rx="10" ry="16"/>
        <ellipse cx="78" cy="43" rx="10" ry="16"/>
        <ellipse cx="60" cy="14" rx="9" ry="14"/>`);
    }
    return plateSvg(`<path d="M59 59 C25 42 27 18 58 8 C93 18 94 42 59 59 Z"/>
      <path d="M59 58 L59 10"/>
      <path d="M59 33 C45 29 37 24 30 17 M59 33 C73 29 81 24 88 17"/>`);
  }

  function stemSvg(type) {
    if (type === "opposite") {
      return plateSvg(`<path d="M60 62 L60 8"/>
        <ellipse cx="42" cy="22" rx="15" ry="8" transform="rotate(-25 42 22)"/>
        <ellipse cx="78" cy="22" rx="15" ry="8" transform="rotate(25 78 22)"/>
        <ellipse cx="40" cy="43" rx="15" ry="8" transform="rotate(-25 40 43)"/>
        <ellipse cx="80" cy="43" rx="15" ry="8" transform="rotate(25 80 43)"/>`);
    }
    return plateSvg(`<path d="M60 62 L60 8"/>
      <ellipse cx="42" cy="22" rx="15" ry="8" transform="rotate(-25 42 22)"/>
      <ellipse cx="80" cy="35" rx="15" ry="8" transform="rotate(25 80 35)"/>
      <ellipse cx="42" cy="49" rx="15" ry="8" transform="rotate(-25 42 49)"/>`);
  }

  function acornSvg() {
    return plateSvg(`<path d="M40 25 C45 10 76 10 81 25 C76 34 45 34 40 25 Z"/>
      <path d="M46 30 C45 49 54 61 61 61 C70 61 78 49 75 30"/>
      <path d="M49 24 l7 -5 l7 5 l7 -5 l7 5"/>
      <path d="M61 14 C61 10 63 7 67 6"/>`);
  }

  function samaraSvg() {
    return plateSvg(`<path d="M58 39 C26 31 20 14 31 9 C46 5 56 22 62 37"/>
      <path d="M62 37 C87 19 105 19 105 34 C104 48 80 48 63 40"/>
      <circle cx="62" cy="39" r="5"/>`);
  }

  function birdBillSvg(type) {
    if (type === "hooked") {
      return plateSvg(`<path d="M31 40 C48 18 78 19 91 34"/>
        <path d="M74 29 C95 28 102 38 87 47"/>
        <circle cx="55" cy="28" r="3"/>`);
    }
    return plateSvg(`<path d="M30 42 C47 20 75 22 88 42 Z"/>
      <path d="M88 42 L108 35 L88 30"/>
      <circle cx="55" cy="30" r="3"/>`);
  }

  function insectSvg(type) {
    if (type === "waist") {
      return plateSvg(`<ellipse cx="37" cy="36" rx="17" ry="13"/>
        <ellipse cx="80" cy="36" rx="23" ry="16"/>
        <path d="M53 36 C60 32 61 40 66 36"/>
        <path d="M42 24 L34 9 M42 48 L34 62 M80 20 L96 8 M82 52 L99 63"/>`);
    }
    if (type === "elytra") {
      return plateSvg(`<ellipse cx="60" cy="36" rx="30" ry="24"/>
        <path d="M60 13 L60 59"/>
        <path d="M42 30 h7 M72 30 h7 M43 45 h7 M72 45 h7"/>`);
    }
    if (type === "halteres") {
      return plateSvg(`<ellipse cx="55" cy="35" rx="22" ry="10"/>
        <path d="M45 30 C20 12 16 38 43 36"/>
        <path d="M65 30 C95 12 98 38 68 36"/>
        <path d="M78 42 l14 9 M92 51 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0"/>`);
    }
    if (type === "proboscis") {
      return plateSvg(`<ellipse cx="53" cy="34" rx="17" ry="10"/>
        <path d="M65 36 C78 45 86 50 100 47"/>
        <path d="M42 28 C16 8 11 40 39 36"/>
        <path d="M58 28 C85 8 91 40 61 36"/>`);
    }
    return plateSvg(`<ellipse cx="60" cy="36" rx="27" ry="18"/>
      <path d="M35 24 L20 12 M35 48 L20 61 M60 18 L60 6 M82 24 L100 12 M82 48 L100 61"/>
      <path d="M38 24 q22 -18 44 0 M38 48 q22 18 44 0"/>`);
  }

  function dragonflySvg(type) {
    if (type === "eyes") {
      return plateSvg(`<circle cx="52" cy="25" r="14"/><circle cx="68" cy="25" r="14"/>
        <path d="M60 37 L60 62"/>
        <path d="M55 39 C27 18 17 50 55 46 M65 39 C93 18 103 50 65 46"/>`);
    }
    return plateSvg(`<circle cx="60" cy="18" r="8"/>
      <path d="M60 26 C57 39 57 50 60 63 C63 50 63 39 60 26 Z"/>
      <path d="M55 28 C24 8 13 42 54 39 M65 28 C96 8 107 42 66 39"/>`);
  }

  function mushroomSvg(type) {
    if (type === "gills") {
      return plateSvg(`<path d="M30 31 C40 9 82 9 92 31 Z"/>
        <path d="M43 31 L37 44 M51 31 L48 47 M60 31 L60 48 M69 31 L72 47 M78 31 L84 44"/>
        <path d="M54 31 C53 43 50 53 43 61 H77 C70 53 67 43 66 31"/>`);
    }
    if (type === "pores") {
      return plateSvg(`<path d="M30 31 C40 9 82 9 92 31 Z"/>
        <path d="M33 32 H89"/>
        <circle cx="47" cy="38" r="2"/><circle cx="58" cy="39" r="2"/><circle cx="69" cy="38" r="2"/><circle cx="80" cy="39" r="2"/>
        <path d="M54 32 C53 43 50 53 43 61 H77 C70 53 67 43 66 32"/>`);
    }
    return plateSvg(`<path d="M30 31 C40 9 82 9 92 31 Z"/>
      <path d="M54 31 C53 43 50 53 43 61 H77 C70 53 67 43 66 31"/>`);
  }

  function simpleIconSvg(symbol, label) {
    return `
      <svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="70" fill="#fff7df"/>
        <text x="60" y="42" text-anchor="middle" font-size="34" font-weight="900" fill="#1d1a14">${esc(symbol)}</text>
        <text x="60" y="61" text-anchor="middle" font-size="10" fill="#1d1a14">${esc(label)}</text>
      </svg>
    `;
  }

  window.GridWildGenusCodex = {
    open,
    openFromTaxonName,
    load: loadGenusCodex,
    genera: GENERA,
    fieldMarks: FIELD_MARKS
  };

    // Intentionally lazy-loaded. The Codex JSON batches are large, so defer them
  // until the user actually opens a Codex view.

})();