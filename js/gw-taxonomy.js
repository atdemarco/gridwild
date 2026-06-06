// -----------------------------------------------------------------------------
// GridWild Taxonomy Registry
// Shared non-species taxonomy vocabulary for display names, matching, and future
// Fieldmarks/Codex enrichment.
// -----------------------------------------------------------------------------

(function () {
  const COMMON_NAMES = {
    iconic_taxon: {
      Animalia: ["Animals"],
      Arachnida: ["Arachnids"],
      Aves: ["Birds"],
      Fungi: ["Fungi"],
      Insecta: ["Insects"],
      Mammalia: ["Mammals"],
      Mollusca: ["Mollusks"],
      Plantae: ["Plants"],
      Reptilia: ["Reptiles"],
      Amphibia: ["Amphibians"],
      Actinopterygii: ["Ray-finned fishes"],
      Unknown: ["Unknown"]
    },
    order: {
      Araneae: ["Spiders"],
      Coleoptera: ["Beetles"],
      Diptera: ["Flies"],
      Hemiptera: ["True bugs"],
      Hymenoptera: ["Bees, wasps, and ants"],
      Lepidoptera: ["Butterflies and moths"],
      Odonata: ["Dragonflies and damselflies"],
      Orthoptera: ["Grasshoppers and crickets"],
      Unknown: ["Unknown order"]
    },
    family: {},
    genus: {
      Acer: ["Maples"],
      Aloe: ["Aloes"],
      Apis: ["Honey bees"],
      Eristalis: ["Drone flies"],
      Hibiscus: ["Rosemallows", "Hibiscus"],
      Mentha: ["Mints"],
      Quercus: ["Oaks"],
      Rudbeckia: ["Coneflowers", "Black-eyed Susans"],
      Zinnia: ["Zinnias"],
      Unknown: ["Unknown genus"]
    }
  };

  const QUEST_TAXA = {
    Any: { label: "Any life", icon: "🌎" },
    Insecta: { label: "Insects", icon: "🐛" },
    Plantae: { label: "Plants", icon: "🌿" },
    Fungi: { label: "Fungi", icon: "🍄" },
    Aves: { label: "Birds", icon: "🐦" },
    Mammalia: { label: "Mammals", icon: "🦝" }
  };

  const TAXON_LINES = [
    { key: "leafhopper", label: "Leafhopper", terms: ["leafhopper", "cicadellidae"], icon: "🟩" },
    { key: "fern", label: "Fern", terms: ["fern", "polypodiopsida"], icon: "🌿" },
    { key: "moss", label: "Moss", terms: ["moss", "bryophyta"], icon: "🟢" },
    { key: "fungus", label: "Fungus", terms: ["fungi", "mushroom"], icon: "🍄" },
    { key: "bee", label: "Bee", terms: ["bee", "apidae"], icon: "🐝" },
    { key: "fly", label: "Fly", terms: ["fly", "diptera"], icon: "🪰" },
    { key: "beetle", label: "Beetle", terms: ["beetle", "coleoptera"], icon: "🪲" },
    { key: "bird", label: "Bird", terms: ["aves", "bird"], icon: "🐦" },
    { key: "tree", label: "Tree", terms: ["tree", "quercus", "acer"], icon: "🌳" },
    { key: "lichen", label: "Lichen", terms: ["lichen"], icon: "🪨" }
  ];

  const FIELD_MARK_REFS = {};
  const CODEX_COPY = {};

  function normalizeRank(rank) {
    return rank === "iconic" ? "iconic_taxon" : String(rank || "").trim();
  }

  function namesFor(rank, scientific) {
    const map = COMMON_NAMES[normalizeRank(rank)] || {};
    const value = map[String(scientific || "").trim()];
    if (!value) return [];
    return Array.isArray(value) ? value.slice() : [value];
  }

  function firstCommonName(rank, scientific) {
    return namesFor(rank, scientific)[0] || "";
  }

  function registerCommonNames(groups = {}) {
    Object.entries(groups || {}).forEach(([rank, entries]) => {
      const key = normalizeRank(rank);
      COMMON_NAMES[key] ||= {};
      Object.entries(entries || {}).forEach(([scientific, value]) => {
        const incoming = Array.isArray(value) ? value : [value];
        const current = namesFor(key, scientific);
        COMMON_NAMES[key][scientific] = [...new Set([...current, ...incoming].filter(Boolean))];
      });
    });
  }

  function titleCaseTaxonLabel(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function genusCodexCommonName(name) {
    const rec = window.GridWildGenusCodex?.genera?.[name];
    if (!rec) return "";
    if (rec.common) return titleCaseTaxonLabel(rec.common);
    const fact = (rec.facts || []).find((item) => /iNaturalist lists "/.test(String(item)));
    const match = String(fact || "").match(/iNaturalist lists "([^"]+)"/);
    return match?.[1] ? titleCaseTaxonLabel(match[1]) : "";
  }

  function displayName(rank, scientific) {
    const clean = String(scientific || "Unknown").trim() || "Unknown";
    return (
      firstCommonName(rank, clean) ||
      (normalizeRank(rank) === "genus" ? genusCodexCommonName(clean) : "") ||
      clean
    );
  }

  function displayEntry(entry, rank) {
    const scientific = String(entry?.name || "Unknown").trim() || "Unknown";
    const common = displayName(rank, scientific);
    return {
      common,
      scientific,
      count: Math.round(Number(entry?.count) || 0),
      aliased: Boolean(common && common !== scientific)
    };
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function containsTaxonTerm(haystack, term) {
    const hay = ` ${normalizeSearchText(haystack)} `;
    const needle = normalizeSearchText(term);
    return Boolean(needle) && hay.includes(` ${needle} `);
  }

  function matchesTaxonLine(line, haystack) {
    return (line?.terms || []).some((term) => containsTaxonTerm(haystack, term));
  }

  window.GridWildTaxonomy = {
    commonNames: COMMON_NAMES,
    questTaxa: QUEST_TAXA,
    taxonLines: TAXON_LINES,
    fieldMarkRefs: FIELD_MARK_REFS,
    codexCopy: CODEX_COPY,
    registerCommonNames,
    namesFor,
    firstCommonName,
    displayName,
    displayEntry,
    matchesTaxonLine,
    containsTaxonTerm,
    normalizeSearchText
  };
})();
