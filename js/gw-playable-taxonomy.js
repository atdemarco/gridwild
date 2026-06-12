// -----------------------------------------------------------------------------
// GridWild Playable Taxonomic Resolution
// Small curated backbone for beginner-facing endpoint rules.
// -----------------------------------------------------------------------------

(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  /**
   * @typedef {"life"|"kingdom"|"phylum"|"class"|"order"|"family"|"genus"|"species"|"subspecies"} TaxonomicRank
   * @typedef {"required"|"optional"|"bonus"|"hidden"|"discouraged"} EndpointMode
   * @typedef {"curated"|"inaturalist-derived"|"mixed"|"placeholder"} TaxonEndpointSource
   *
   * @typedef {Object} TaxonEndpointMetrics
   * @property {number} observability
   * @property {number} identifiability
   * @property {number} distinctiveness
   * @property {number} localDataSupport
   * @property {number} validationReliability
   *
   * @typedef {Object} TaxonEndpointInaturalistStats
   * @property {number=} observationCount
   * @property {number=} localObservationCount
   * @property {number=} researchGradeRatio
   * @property {number=} observerCount
   * @property {number=} identifierCount
   * @property {Record<string, number>=} finalIdRankDistribution
   * @property {TaxonomicRank=} medianConsensusRank
   * @property {number=} disagreementRate
   * @property {string=} lastUpdated
   *
   * @typedef {Object} TaxonEndpointProfile
   * @property {string} taxonKey
   * @property {string} displayName
   * @property {number|null} iNaturalistTaxonId
   * @property {string} broadParentGroup
   * @property {TaxonomicRank} beginnerEndpointRank
   * @property {TaxonomicRank[]=} beginnerEndpointAlternatives
   * @property {TaxonomicRank} developerEndpointRank
   * @property {TaxonomicRank[]=} developerEndpointAlternatives
   * @property {TaxonomicRank} expertEndpointRank
   * @property {TaxonomicRank[]=} expertEndpointAlternatives
   * @property {TaxonomicRank} minimumConfidenceRank
   * @property {EndpointMode} speciesMode
   * @property {string} rationale
   * @property {string} beginnerQuestLanguage
   * @property {TaxonEndpointMetrics} metrics
   * @property {number=} beginnerPlayabilityScore
   * @property {string[]} notesFlags
   * @property {TaxonEndpointSource} source
   * @property {TaxonEndpointInaturalistStats|null=} iNaturalistStats
   * @property {string[]=} aliases
   * @property {boolean=} isFallback
   * @property {string=} fallbackReason
   */

  const TAXONOMIC_RANKS = Object.freeze([
    "life",
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "subspecies"
  ]);

  const ENDPOINT_MODES = Object.freeze(["required", "optional", "bonus", "hidden", "discouraged"]);
  const ENDPOINT_SOURCES = Object.freeze([
    "curated",
    "inaturalist-derived",
    "mixed",
    "placeholder"
  ]);

  const SCORE_WEIGHTS = Object.freeze({
    identifiability: 0.3,
    observability: 0.2,
    localDataSupport: 0.2,
    validationReliability: 0.15,
    distinctiveness: 0.15
  });

  const SCORE_FIELDS = Object.freeze(Object.keys(SCORE_WEIGHTS));
  const PROFILE_ARTIFACT_URL = "assets/playable_taxonomy/playable_taxon_profiles.json";

  const SEED_PROFILES = [
    {
      taxonKey: "birds",
      displayName: "Birds / Aves",
      iNaturalistTaxonId: 3,
      broadParentGroup: "Animals",
      beginnerEndpointRank: "species",
      developerEndpointRank: "species",
      expertEndpointRank: "subspecies",
      expertEndpointAlternatives: ["species"],
      minimumConfidenceRank: "species",
      speciesMode: "required",
      rationale:
        "High observability, field-guide culture, and strong community convergence make many birds beginner-playable at species level.",
      beginnerQuestLanguage: "Find a bird and try to resolve it to species.",
      metrics: {
        observability: 94,
        identifiability: 92,
        distinctiveness: 86,
        localDataSupport: 95,
        validationReliability: 92
      },
      notesFlags: ["field-guide-friendly", "species-rich-but-well-supported"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["aves", "bird"]
    },
    {
      taxonKey: "mammals",
      displayName: "Mammals",
      iNaturalistTaxonId: 40151,
      broadParentGroup: "Animals",
      beginnerEndpointRank: "species",
      developerEndpointRank: "species",
      expertEndpointRank: "subspecies",
      expertEndpointAlternatives: ["species"],
      minimumConfidenceRank: "species",
      speciesMode: "required",
      rationale:
        "Many local mammal communities have low species richness and many species are visually recognizable from shape, size, tracks, or context.",
      beginnerQuestLanguage:
        "Find a mammal sign or mammal observation and resolve it to species when the evidence supports it.",
      metrics: {
        observability: 70,
        identifiability: 84,
        distinctiveness: 78,
        localDataSupport: 84,
        validationReliability: 82
      },
      notesFlags: ["some-observations-use-signs", "camera-trap-friendly"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["mammalia", "mammal"]
    },
    {
      taxonKey: "reptiles-amphibians",
      displayName: "Reptiles and amphibians",
      iNaturalistTaxonId: null,
      broadParentGroup: "Animals",
      beginnerEndpointRank: "genus",
      beginnerEndpointAlternatives: ["species"],
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "genus",
      speciesMode: "optional",
      rationale:
        "Many are visually identifiable, but regional lookalike complexes make genus the safer beginner endpoint in an initial non-local slice.",
      beginnerQuestLanguage:
        "Find a reptile or amphibian and aim for genus first; species is a win when the field marks are clear.",
      metrics: {
        observability: 62,
        identifiability: 72,
        distinctiveness: 74,
        localDataSupport: 70,
        validationReliability: 68
      },
      notesFlags: ["regional-complexes", "location-will-improve-resolution"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["reptilia", "amphibia", "herps", "reptile", "amphibian"]
    },
    {
      taxonKey: "odonata",
      displayName: "Dragonflies and damselflies / Odonata",
      iNaturalistTaxonId: 47792,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "genus",
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "genus",
      speciesMode: "bonus",
      rationale:
        "Odonates are visible and photographable, but species identification can require angles, sex, age, or fine detail.",
      beginnerQuestLanguage: "Find a dragonfly or damselfly and try to place it to genus.",
      metrics: {
        observability: 82,
        identifiability: 70,
        distinctiveness: 74,
        localDataSupport: 76,
        validationReliability: 70
      },
      notesFlags: ["photographable", "detail-dependent-species"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["dragonflies", "damselflies", "dragonfly", "damselfly"]
    },
    {
      taxonKey: "butterflies",
      displayName: "Butterflies",
      iNaturalistTaxonId: null,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "genus",
      beginnerEndpointAlternatives: ["species"],
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "genus",
      speciesMode: "optional",
      rationale:
        "Many butterflies are beginner-identifiable, but lookalike complexes and worn individuals make genus the safer default endpoint.",
      beginnerQuestLanguage:
        "Find a butterfly and aim for genus; species counts when the pattern is clear.",
      metrics: {
        observability: 86,
        identifiability: 74,
        distinctiveness: 78,
        localDataSupport: 82,
        validationReliability: 74
      },
      notesFlags: ["charismatic", "lookalike-complexes"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["butterfly", "rhopalocera", "lepidoptera butterfly"]
    },
    {
      taxonKey: "moths",
      displayName: "Moths",
      iNaturalistTaxonId: null,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      developerEndpointAlternatives: ["species"],
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "bonus",
      rationale:
        "Moths are extremely diverse; many species are difficult, but some families and genera are recognizable and rewarding.",
      beginnerQuestLanguage: "Find a moth and place it into a family or recognizable genus.",
      metrics: {
        observability: 72,
        identifiability: 54,
        distinctiveness: 62,
        localDataSupport: 74,
        validationReliability: 58
      },
      notesFlags: ["very-diverse", "night-observation-friendly"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["moth", "lepidoptera moth"]
    },
    {
      taxonKey: "beetles",
      displayName: "Beetles",
      iNaturalistTaxonId: 47208,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Beetles are very diverse, and species identification is often expert-level without close structural detail.",
      beginnerQuestLanguage: "Find a beetle and try for family; genus is a strong next step.",
      metrics: {
        observability: 68,
        identifiability: 48,
        distinctiveness: 58,
        localDataSupport: 72,
        validationReliability: 54
      },
      notesFlags: ["high-diversity", "species-often-expert"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["coleoptera", "beetle"]
    },
    {
      taxonKey: "flies",
      displayName: "Flies / Diptera",
      iNaturalistTaxonId: 47822,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "family",
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Many fly species need expert review or microscopy, so family-level play is a better beginner default.",
      beginnerQuestLanguage: "Find a fly and identify the family or broad fly type.",
      metrics: {
        observability: 70,
        identifiability: 42,
        distinctiveness: 50,
        localDataSupport: 68,
        validationReliability: 48
      },
      notesFlags: ["microscopy-common", "family-level-play"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["diptera", "fly"]
    },
    {
      taxonKey: "hymenoptera",
      displayName: "Bees, wasps, and ants / Hymenoptera",
      iNaturalistTaxonId: 47201,
      broadParentGroup: "Insects",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Some groups are recognizable, but many bees, wasps, and ants are difficult at species level from casual photos.",
      beginnerQuestLanguage: "Find a bee, wasp, or ant and aim for family or a familiar genus.",
      metrics: {
        observability: 74,
        identifiability: 50,
        distinctiveness: 58,
        localDataSupport: 72,
        validationReliability: 52
      },
      notesFlags: ["mixed-beginner-access", "many-specialist-ids"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["bees", "wasps", "ants", "bee", "wasp", "ant"]
    },
    {
      taxonKey: "spiders",
      displayName: "Spiders",
      iNaturalistTaxonId: 47119,
      broadParentGroup: "Arachnids",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Many spiders require close detail or expert review, but family and genus endpoints are often playable.",
      beginnerQuestLanguage:
        "Find a spider and try for family; genus is a good challenge when details are visible.",
      metrics: {
        observability: 66,
        identifiability: 52,
        distinctiveness: 62,
        localDataSupport: 68,
        validationReliability: 56
      },
      notesFlags: ["detail-dependent", "family-genus-playable"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["araneae", "spider"]
    },
    {
      taxonKey: "trees",
      displayName: "Trees",
      iNaturalistTaxonId: null,
      broadParentGroup: "Plants",
      beginnerEndpointRank: "genus",
      beginnerEndpointAlternatives: ["species"],
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "genus",
      speciesMode: "optional",
      rationale:
        "Many trees are learnable from leaves, bark, habit, fruit, and seasonality, but species confidence varies by region and season.",
      beginnerQuestLanguage:
        "Find a tree and place it to genus; species counts when leaves, bark, or fruit are clear.",
      metrics: {
        observability: 92,
        identifiability: 74,
        distinctiveness: 78,
        localDataSupport: 82,
        validationReliability: 72
      },
      notesFlags: ["seasonal-characters", "genus-first"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["tree", "woody plants", "forest trees"]
    },
    {
      taxonKey: "wildflowers",
      displayName: "Wildflowers / herbaceous flowering plants",
      iNaturalistTaxonId: null,
      broadParentGroup: "Plants",
      beginnerEndpointRank: "genus",
      beginnerEndpointAlternatives: ["family", "species"],
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "optional",
      rationale:
        "Wildflowers are visually rewarding, but difficulty varies widely by group, season, and available plant parts.",
      beginnerQuestLanguage:
        "Find a wildflower and identify its family or genus; species is a bonus when the characters line up.",
      metrics: {
        observability: 88,
        identifiability: 64,
        distinctiveness: 72,
        localDataSupport: 80,
        validationReliability: 64
      },
      notesFlags: ["variable-difficulty", "flowering-season-matters"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["wildflower", "flowering plants", "herbaceous plants", "angiosperms"]
    },
    {
      taxonKey: "grasses-sedges-rushes",
      displayName: "Grasses, sedges, and rushes",
      iNaturalistTaxonId: null,
      broadParentGroup: "Plants",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Species often require technical characters, but family and some genus endpoints are useful for beginner play.",
      beginnerQuestLanguage:
        "Find a grass, sedge, or rush and aim for family or a recognizable genus.",
      metrics: {
        observability: 84,
        identifiability: 38,
        distinctiveness: 46,
        localDataSupport: 70,
        validationReliability: 44
      },
      notesFlags: ["technical-characters", "family-first"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["grass", "grasses", "sedge", "sedges", "rush", "rushes", "graminoids"]
    },
    {
      taxonKey: "ferns",
      displayName: "Ferns",
      iNaturalistTaxonId: null,
      broadParentGroup: "Plants",
      beginnerEndpointRank: "genus",
      developerEndpointRank: "species",
      expertEndpointRank: "species",
      minimumConfidenceRank: "genus",
      speciesMode: "bonus",
      rationale:
        "Many ferns are learnable to genus, while species often need closer sori, frond, or habitat detail.",
      beginnerQuestLanguage: "Find a fern and try to place it to genus.",
      metrics: {
        observability: 76,
        identifiability: 62,
        distinctiveness: 64,
        localDataSupport: 68,
        validationReliability: 60
      },
      notesFlags: ["genus-playable", "species-needs-detail"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["fern"]
    },
    {
      taxonKey: "fungi",
      displayName: "Fungi",
      iNaturalistTaxonId: 47170,
      broadParentGroup: "Fungi",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "discouraged",
      rationale:
        "Species identification often requires microscopy, chemistry, substrate, or expert review, but broad form groups and genera can be playable.",
      beginnerQuestLanguage: "Find a fungus and identify its broad form, family, or genus.",
      metrics: {
        observability: 64,
        identifiability: 40,
        distinctiveness: 58,
        localDataSupport: 66,
        validationReliability: 42
      },
      notesFlags: ["broad-form-groups", "microscopy-or-chemistry-common"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["fungus", "mushrooms", "mushroom"]
    },
    {
      taxonKey: "lichens",
      displayName: "Lichens",
      iNaturalistTaxonId: null,
      broadParentGroup: "Fungi",
      beginnerEndpointRank: "family",
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "hidden",
      rationale:
        "Many lichens require chemistry, microscopy, or expert characters, so broad group or family play is the beginner-safe endpoint.",
      beginnerQuestLanguage: "Find a lichen and place it into a broad group or family.",
      metrics: {
        observability: 70,
        identifiability: 34,
        distinctiveness: 48,
        localDataSupport: 58,
        validationReliability: 36
      },
      notesFlags: ["chemistry-common", "broad-group-play"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["lichen"]
    },
    {
      taxonKey: "mosses-liverworts",
      displayName: "Mosses and liverworts",
      iNaturalistTaxonId: null,
      broadParentGroup: "Plants",
      beginnerEndpointRank: "family",
      developerEndpointRank: "genus",
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "hidden",
      rationale:
        "Many mosses and liverworts require magnification or expert characters, making broad group or family the safer beginner endpoint.",
      beginnerQuestLanguage: "Find a moss or liverwort and identify the broad group or family.",
      metrics: {
        observability: 76,
        identifiability: 32,
        distinctiveness: 42,
        localDataSupport: 56,
        validationReliability: 34
      },
      notesFlags: ["magnification-common", "broad-group-play"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["moss", "mosses", "liverwort", "liverworts", "bryophytes"]
    },
    {
      taxonKey: "snails-slugs",
      displayName: "Snails and slugs",
      iNaturalistTaxonId: null,
      broadParentGroup: "Mollusks",
      beginnerEndpointRank: "family",
      beginnerEndpointAlternatives: ["genus"],
      developerEndpointRank: "genus",
      developerEndpointAlternatives: ["species"],
      expertEndpointRank: "species",
      minimumConfidenceRank: "family",
      speciesMode: "bonus",
      rationale:
        "Some snails and slugs are recognizable, but many require shell, anatomy, or close detail for species confidence.",
      beginnerQuestLanguage: "Find a snail or slug and aim for family or genus.",
      metrics: {
        observability: 60,
        identifiability: 50,
        distinctiveness: 56,
        localDataSupport: 58,
        validationReliability: 50
      },
      notesFlags: ["detail-dependent", "some-recognizable-genera"],
      source: "curated",
      iNaturalistStats: null,
      aliases: ["snail", "slug", "gastropods", "gastropoda"]
    }
  ];

  const FALLBACK_PROFILE = {
    taxonKey: "uncurated-taxon",
    displayName: "Uncurated taxon group",
    iNaturalistTaxonId: null,
    broadParentGroup: "Life",
    beginnerEndpointRank: "family",
    beginnerEndpointAlternatives: ["genus"],
    developerEndpointRank: "genus",
    expertEndpointRank: "species",
    minimumConfidenceRank: "family",
    speciesMode: "discouraged",
    rationale:
      "No curated GridWild endpoint exists yet, so this group falls back to a broader beginner endpoint until local stats or curation improve it.",
    beginnerQuestLanguage:
      "Try to place this organism into a recognizable family, genus, or broad field group before making it a species-level challenge.",
    metrics: {
      observability: 42,
      identifiability: 38,
      distinctiveness: 42,
      localDataSupport: 30,
      validationReliability: 34
    },
    notesFlags: ["fallback", "needs-curation"],
    source: "placeholder",
    iNaturalistStats: null,
    aliases: []
  };

  function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function computeBeginnerPlayabilityScore(metrics = {}) {
    const total = SCORE_FIELDS.reduce(
      (sum, key) => sum + clampScore(metrics[key]) * SCORE_WEIGHTS[key],
      0
    );
    return Math.round(total * 10) / 10;
  }

  function isValidRank(rank) {
    return TAXONOMIC_RANKS.includes(rank);
  }

  function rankIndex(rank) {
    return TAXONOMIC_RANKS.indexOf(rank);
  }

  function compareRanks(a, b) {
    const ai = rankIndex(a);
    const bi = rankIndex(b);
    if (ai < 0 || bi < 0) return null;
    return ai - bi;
  }

  function isRankAtLeastAsSpecific(rank, minimumRank) {
    const cmp = compareRanks(rank, minimumRank);
    return cmp == null ? false : cmp >= 0;
  }

  function isRankBroaderThan(rank, otherRank) {
    const cmp = compareRanks(rank, otherRank);
    return cmp == null ? false : cmp < 0;
  }

  function isEndpointMode(value) {
    return ENDPOINT_MODES.includes(value);
  }

  function isEndpointSource(value) {
    return ENDPOINT_SOURCES.includes(value);
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function slugify(value) {
    return normalizeSearch(value).replace(/\s+/g, "-") || "unknown";
  }

  function normalizeProfile(profile) {
    const copy = {
      ...profile,
      beginnerEndpointAlternatives: Array.isArray(profile.beginnerEndpointAlternatives)
        ? profile.beginnerEndpointAlternatives.slice()
        : [],
      developerEndpointAlternatives: Array.isArray(profile.developerEndpointAlternatives)
        ? profile.developerEndpointAlternatives.slice()
        : [],
      expertEndpointAlternatives: Array.isArray(profile.expertEndpointAlternatives)
        ? profile.expertEndpointAlternatives.slice()
        : [],
      notesFlags: Array.isArray(profile.notesFlags) ? profile.notesFlags.slice() : [],
      aliases: Array.isArray(profile.aliases) ? profile.aliases.slice() : []
    };
    copy.beginnerPlayabilityScore = computeBeginnerPlayabilityScore(copy.metrics);
    return copy;
  }

  function buildProfileIndex(profiles) {
    const index = new Map();
    profiles.forEach((profile) => {
      [profile.taxonKey, profile.displayName, ...(profile.aliases || [])].forEach((term) => {
        const normalized = normalizeSearch(term);
        if (normalized && !index.has(normalized)) index.set(normalized, profile);
      });
    });
    return index;
  }

  const SEEDED_PROFILES = Object.freeze(SEED_PROFILES.map(normalizeProfile));
  let activeProfiles = SEEDED_PROFILES;
  let activeProfileIndex = buildProfileIndex(activeProfiles);
  let activeProfileSource = {
    source: "seed",
    url: null,
    playableTaxonomyVersion: "playable-taxonomy-seed",
    loadedAt: null
  };
  let profileLoadPromise = null;

  function profilePayloadProfiles(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.profiles)) return payload.profiles;
    return null;
  }

  function activateProfiles(payload, options = {}) {
    const profiles = profilePayloadProfiles(payload);
    if (!profiles) {
      throw new Error("Playable taxonomy artifact must be an array or contain profiles[].");
    }

    const normalized = Object.freeze(profiles.map(normalizeProfile));
    const errors = validateSeedProfiles(normalized);
    if (errors.length) {
      throw new Error(`Playable taxonomy artifact is invalid: ${errors.slice(0, 5).join("; ")}`);
    }

    activeProfiles = normalized;
    activeProfileIndex = buildProfileIndex(activeProfiles);
    activeProfileSource = {
      source: options.source || payload.source || "artifact",
      url: options.url || null,
      playableTaxonomyVersion:
        options.playableTaxonomyVersion ||
        payload.playable_taxonomy_version ||
        payload.playableTaxonomyVersion ||
        "playable-taxonomy-artifact",
      loadedAt: new Date().toISOString()
    };

    return getProfiles();
  }

  function restoreSeedProfiles() {
    activeProfiles = SEEDED_PROFILES;
    activeProfileIndex = buildProfileIndex(activeProfiles);
    activeProfileSource = {
      source: "seed",
      url: null,
      playableTaxonomyVersion: "playable-taxonomy-seed",
      loadedAt: null
    };
    profileLoadPromise = null;
    return getProfiles();
  }

  async function loadProfiles(options = {}) {
    if (Array.isArray(options.profiles)) {
      return activateProfiles(
        {
          profiles: options.profiles,
          playable_taxonomy_version: options.playableTaxonomyVersion
        },
        { source: options.source || "provided" }
      );
    }

    const force = options.force === true;
    const url = options.url || PROFILE_ARTIFACT_URL;
    if (!force && activeProfileSource.source === "artifact") return getProfiles();
    if (!force && profileLoadPromise) return profileLoadPromise;
    if (typeof root.fetch !== "function") return getProfiles();

    profileLoadPromise = root
      .fetch(url, { headers: { accept: "application/json" } })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((payload) => activateProfiles(payload, { source: "artifact", url }))
      .catch((err) => {
        console.warn("Playable taxonomy artifact unavailable; using seeded profiles.", err);
        return getProfiles();
      })
      .finally(() => {
        profileLoadPromise = null;
      });

    return profileLoadPromise;
  }

  function getProfileSource() {
    return { ...activeProfileSource };
  }

  function extractLookupTerms(input) {
    if (typeof input === "string") return [input];
    if (!input || typeof input !== "object") return [];
    return [
      input.taxonKey,
      input.slug,
      input.key,
      input.displayName,
      input.name,
      input.scientificName,
      input.commonName,
      input.iconicTaxon,
      input.iconic_taxon,
      input.className,
      input.orderName,
      input.familyName,
      input.group,
      input.parentGroup,
      input.broadParentGroup
    ].filter(Boolean);
  }

  function fallbackFor(input) {
    const terms = extractLookupTerms(input);
    const displayName = titleCase(terms[0]) || FALLBACK_PROFILE.displayName;
    const broadParentGroup =
      (typeof input === "object" &&
        input &&
        (input.broadParentGroup || input.parentGroup || input.iconicTaxon || input.iconic_taxon)) ||
      FALLBACK_PROFILE.broadParentGroup;

    return normalizeProfile({
      ...FALLBACK_PROFILE,
      taxonKey: `fallback-${slugify(displayName)}`,
      displayName,
      broadParentGroup: titleCase(broadParentGroup) || FALLBACK_PROFILE.broadParentGroup,
      isFallback: true,
      fallbackReason: "No exact seeded playable endpoint profile matched this taxon group."
    });
  }

  function getEndpointForTaxonGroup(input) {
    const terms = extractLookupTerms(input);
    for (const term of terms) {
      const match = activeProfileIndex.get(normalizeSearch(term));
      if (match) return match;
    }
    return fallbackFor(input);
  }

  function displayRank(rank) {
    return titleCase(rank);
  }

  function endpointModeLabel(mode) {
    const labels = {
      required: "Species required",
      optional: "Species optional",
      bonus: "Species bonus",
      hidden: "Species hidden",
      discouraged: "Species discouraged"
    };
    return labels[mode] || titleCase(mode);
  }

  function formatEndpointRanks(primaryRank, alternateRanks = []) {
    return [primaryRank, ...(alternateRanks || [])].filter(Boolean).map(displayRank).join(" / ");
  }

  function getQuestLanguageForEndpoint(profileOrInput) {
    const profile = profileOrInput?.taxonKey
      ? profileOrInput
      : getEndpointForTaxonGroup(profileOrInput);
    if (profile?.beginnerQuestLanguage) return profile.beginnerQuestLanguage;
    const label = profile?.displayName || "this organism";
    const rank = displayRank(
      profile?.beginnerEndpointRank || FALLBACK_PROFILE.beginnerEndpointRank
    );
    return `Find ${label} and identify it to ${rank}.`;
  }

  function validateMetricScores(profile, errors) {
    if (!profile.metrics || typeof profile.metrics !== "object") {
      errors.push("metrics must be an object");
      return;
    }

    SCORE_FIELDS.forEach((key) => {
      const value = Number(profile.metrics[key]);
      if (!Number.isFinite(value)) errors.push(`metrics.${key} must be a number`);
      if (Number.isFinite(value) && (value < 0 || value > 100)) {
        errors.push(`metrics.${key} must be between 0 and 100`);
      }
    });
  }

  function validateRankArray(profile, key, errors) {
    if (profile[key] == null) return;
    if (!Array.isArray(profile[key])) {
      errors.push(`${key} must be an array when provided`);
      return;
    }
    profile[key].forEach((rank) => {
      if (!isValidRank(rank)) errors.push(`${key} contains invalid rank: ${rank}`);
    });
  }

  function validateTaxonEndpointProfile(profile) {
    const errors = [];
    if (!profile || typeof profile !== "object") return ["profile must be an object"];

    ["taxonKey", "displayName", "broadParentGroup", "rationale", "beginnerQuestLanguage"].forEach(
      (key) => {
        if (!String(profile[key] || "").trim()) errors.push(`${key} is required`);
      }
    );

    [
      "beginnerEndpointRank",
      "developerEndpointRank",
      "expertEndpointRank",
      "minimumConfidenceRank"
    ].forEach((key) => {
      if (!isValidRank(profile[key])) errors.push(`${key} is invalid`);
    });

    validateRankArray(profile, "beginnerEndpointAlternatives", errors);
    validateRankArray(profile, "developerEndpointAlternatives", errors);
    validateRankArray(profile, "expertEndpointAlternatives", errors);

    if (!isEndpointMode(profile.speciesMode)) errors.push("speciesMode is invalid");
    if (!isEndpointSource(profile.source)) errors.push("source is invalid");

    if (
      profile.iNaturalistTaxonId !== null &&
      profile.iNaturalistTaxonId !== undefined &&
      (!Number.isInteger(Number(profile.iNaturalistTaxonId)) ||
        Number(profile.iNaturalistTaxonId) <= 0)
    ) {
      errors.push("iNaturalistTaxonId must be a positive integer or null");
    }

    if (!Array.isArray(profile.notesFlags)) errors.push("notesFlags must be an array");
    validateMetricScores(profile, errors);

    const score = computeBeginnerPlayabilityScore(profile.metrics);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      errors.push("beginnerPlayabilityScore must compute to a value between 0 and 100");
    }

    return errors;
  }

  function validateSeedProfiles(profiles = SEEDED_PROFILES) {
    const errors = [];
    const seen = new Set();
    profiles.forEach((profile, index) => {
      const key = String(profile?.taxonKey || "");
      if (seen.has(key)) errors.push(`${key || `profile-${index}`} has a duplicate taxonKey`);
      if (key) seen.add(key);

      validateTaxonEndpointProfile(profile).forEach((message) => {
        errors.push(`${key || `profile-${index}`}: ${message}`);
      });
    });
    return errors;
  }

  function getProfiles() {
    return activeProfiles.map((profile) => ({
      ...profile,
      beginnerEndpointAlternatives: profile.beginnerEndpointAlternatives.slice(),
      developerEndpointAlternatives: profile.developerEndpointAlternatives.slice(),
      expertEndpointAlternatives: profile.expertEndpointAlternatives.slice(),
      notesFlags: profile.notesFlags.slice(),
      aliases: profile.aliases.slice()
    }));
  }

  root.GridWildPlayableTaxonomy = {
    ranks: TAXONOMIC_RANKS,
    endpointModes: ENDPOINT_MODES,
    endpointSources: ENDPOINT_SOURCES,
    scoreWeights: SCORE_WEIGHTS,
    profileArtifactUrl: PROFILE_ARTIFACT_URL,
    get profiles() {
      return activeProfiles;
    },
    computeBeginnerPlayabilityScore,
    compareRanks,
    displayRank,
    endpointModeLabel,
    formatEndpointRanks,
    getEndpointForTaxonGroup,
    getProfileSource,
    getProfiles,
    getQuestLanguageForEndpoint,
    isRankAtLeastAsSpecific,
    isRankBroaderThan,
    isValidRank,
    loadProfiles,
    normalizeSearch,
    restoreSeedProfiles,
    validateSeedProfiles,
    validateTaxonEndpointProfile
  };
})();
