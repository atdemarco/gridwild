// -----------------------------------------------------------------------------
// GridWild Field Marks
// Vocabulary layer for Wildlab Classroom practice and lightweight keying.
// -----------------------------------------------------------------------------

(function () {
  const CATEGORY_DEFS = [
    {
      key: "plant_form",
      title: "Plant growth form and whole-plant clues",
      lane: "plant",
      raw: `
Tree vs shrub vs herb
Woody vs non-woody stem
Vine/climber vs self-supporting plant
Grass-like vs broadleaf plant
Fern-like fronds vs seed plant leaves
Moss-like mat vs vascular plant
Aquatic/emergent vs terrestrial plant
Rosette growth form
Upright single stem
Branching bushy habit
Mat-forming/creeping habit
Clumping/tussock habit
Twining vine habit
Tendril-climbing habit
Trailing groundcover habit
Tree bark texture
Young green stems vs woody old stems
Hollow stem vs solid stem
Square stem vs round stem
Milky sap present
Aromatic/crushed-leaf odor
Thorny/spiny plant
Succulent/fleshy plant
Evergreen vs deciduous habit
Annual-looking weedy habit
      `
    },
    {
      key: "leaf_arrangement",
      title: "Leaf arrangement",
      lane: "plant",
      raw: `
Opposite leaves
Alternate leaves
Whorled leaves
Basal leaves only
Leaves clustered at branch tips
Two-ranked leaves
Spiral leaf arrangement
Paired leaflets
Leaf arrangement changes up stem
Dense overlapping scale-like leaves
      `
    },
    {
      key: "leaf_shape",
      title: "Leaf shape",
      lane: "plant",
      raw: `
Simple leaf
Compound leaf
Pinnately compound leaf
Palmately compound leaf
Trifoliate leaf
Needle-like leaf
Scale-like leaf
Strap-shaped leaf
Heart-shaped leaf
Oval/elliptic leaf
Lance-shaped leaf
Linear leaf
Lobed leaf
Deeply divided leaf
Fan-shaped leaf
Spoon-shaped leaf
Arrowhead-shaped leaf
Kidney-shaped leaf
Round leaf
Needle bundle number
Leaflet number
Leaflets opposite vs alternate
Terminal leaflet present
Leaf blade asymmetric
Juvenile vs adult leaf shape
      `
    },
    {
      key: "leaf_surface",
      title: "Leaf edges, tips, bases, and surfaces",
      lane: "plant",
      raw: `
Smooth leaf margin
Serrated/toothed margin
Double-toothed margin
Wavy margin
Lobed margin
Spiny margin
Rolled-under margin
Pointed leaf tip
Rounded leaf tip
Notched leaf tip
Drip-tip
Tapered leaf base
Heart-shaped leaf base
Unequal leaf base
Hairy leaf surface
Smooth/glabrous leaf surface
Waxy/glossy leaf surface
Rough/sandpapery leaf surface
Fuzzy underside
Silvery underside
Veins raised beneath leaf
Parallel veins
Net-like veins
Palmate veins
Pinnate veins
Strong midrib
Translucent dots/glands
Leaf stipules present
Sheathing leaf base
Leaf petiole long vs absent
      `
    },
    {
      key: "flowers",
      title: "Flowers and inflorescences",
      lane: "plant",
      raw: `
Flower color
Flower symmetry radial vs bilateral
Number of petals
Petals fused vs separate
Tubular flower
Bell-shaped flower
Pea-shaped flower
Daisy-like composite flower
Umbel flower cluster
Spike flower cluster
Raceme flower cluster
Panicle flower cluster
Catkin
Cone-like flower head
Tiny inconspicuous flowers
Showy bracts vs true petals
Flower head solitary vs clustered
Flowers in leaf axils
Flowers at stem tips
Fragrant flowers
Irregular lower lip/upper lip flower
Long floral spur
Prominent stamens
Separate male/female flowers
Flowering season
      `
    },
    {
      key: "fruits",
      title: "Fruits, seeds, cones, and plant reproductive structures",
      lane: "plant",
      raw: `
Berry-like fruit
Dry capsule
Pod/legume
Winged seed/samara
Acorn/nut
Cone
Fleshy drupe
Aggregate fruit
Multiple fruit cluster
Burr with hooks
Parachute-like seeds
Milkweed-style silky seeds
Seed head persistent after flowering
Fruit color
Fruit position: upright vs dangling
Fruit in clusters
Fruit with beak or awn
Seed pod splitting pattern
Cone scale shape
Fruit season
      `
    },
    {
      key: "grass_like",
      title: "Grasses, sedges, rushes, and grass-like plants",
      lane: "plant",
      raw: `
Sedges have edges triangular stem
Round rush stem
Jointed grass stem
Grass blade ligule
Grass blade auricles
Open vs closed leaf sheath
Spikelet arrangement
Feathery grass inflorescence
Bristly grass head
Flat sedge leaves
Basal clump vs running grass
Seed head drooping vs upright
Awns present
Rhizome/spreading colony
Wetland grass-like habitat
      `
    },
    {
      key: "ferns_mosses_lichens",
      title: "Ferns, mosses, liverworts, lichens",
      lane: "cryptogam",
      raw: `
Fern frond once-divided
Fern frond twice-divided
Fern sori position
Round sori vs linear sori
Sori covered by indusium
Fertile fronds different from sterile fronds
Fiddleheads present
Moss cushion vs carpet
Moss hairpoints
Moss leaf nerve/costa visible
Moss capsule shape
Liverwort leafy vs thalloid
Lichen crustose form
Lichen foliose form
Lichen fruticose form
Lichen apothecia little cups/discs
Lichen soredia/powdery surface
Lichen color when wet vs dry
Growing on bark vs rock vs soil
Moss/lichen substrate specificity
      `
    },
    {
      key: "fungi",
      title: "Fungi and mushrooms",
      lane: "fungus",
      raw: `
Cap shape
Cap color
Cap surface slimy vs dry
Cap scales/warts
Gills present
Pores instead of gills
Teeth/spines instead of gills
Gills attached vs free
Gills decurrent down stalk
Gill color
Stalk present vs absent
Ring on stalk
Volva/cup at base
Bulbous base
Shelf/bracket fungus form
Puffball form
Jelly fungus texture
Coral fungus branching
Staining/bruising color
Growing on wood vs soil vs leaf litter
Clustered vs solitary fruiting
Mushroom odor
Spore print color
Seasonal fruiting pattern
Mycorrhizal tree association
      `
    },
    {
      key: "insect_body",
      title: "Insect body basics",
      lane: "insect",
      raw: `
Six legs visible
Three body regions visible
Winged vs wingless adult
One pair of wings vs two pairs
Hard wing covers/elytra
Membranous wings
Scaly wings
Hairy body
Shiny body
Flattened body
Hump-backed body
Long-bodied vs round-bodied
Body color pattern
Warning colors
Camouflage shape
      `
    },
    {
      key: "insect_head",
      title: "Insect antennae, mouthparts, and heads",
      lane: "insect",
      raw: `
Antennae length
Clubbed antennae
Feathered antennae
Elbowed antennae
Threadlike antennae
Sawtooth antennae
Big compound eyes
Eyes meeting on top of head
Long snout/rostrum
Piercing beak
Chewing jaws
Sponge-like fly mouthparts
Long butterfly/moth proboscis
Head wider than body
Face markings
      `
    },
    {
      key: "insect_wings",
      title: "Insect wings and flight structures",
      lane: "insect",
      raw: `
Butterfly vs moth resting posture
Dragonfly wings held open
Damselfly wings held closed
Fly halteres
Beetle elytra meeting in straight line
True bug hemelytra X-pattern
Lacewing net-veined wings
Caddisfly tent-like wings
Mayfly upright wings
Wing spots/bands
Wing venation pattern
Clear wings vs colored wings
Hindwing visible or hidden
Folded wings roof-like over body
Scale-covered wings
      `
    },
    {
      key: "insect_legs_behavior",
      title: "Insect legs, posture, and behavior",
      lane: "insect",
      raw: `
Jumping hind legs
Raptorial grabbing forelegs
Swimming legs
Pollen baskets
Spiny legs
Long stilt-like legs
Caterpillar proleg number
Larva case-bearing habit
Leaf-mining trail pattern
Gall shape on plant
      `
    }
  ];

  const CATEGORY_BY_KEY = Object.fromEntries(CATEGORY_DEFS.map(category => [category.key, category]));

  const SIGNAL_RULES = [
    { re: /halteres|sponge-like fly|one pair of wings/i, groups: ["true_flies"] },
    { re: /elytra|hard wing covers|beetle/i, groups: ["beetles"] },
    { re: /hemelytra|x-pattern|piercing beak|true bug/i, groups: ["true_bugs"] },
    { re: /scaly wings|butterfly|moth|proboscis/i, groups: ["butterflies_moths"] },
    { re: /dragonfly|damselfly|eyes meeting/i, groups: ["dragonflies_damselflies"] },
    { re: /pollen baskets|fuzzy body/i, groups: ["bees_wasps"] },
    { re: /raptorial|jumping hind legs|clubbed antennae|feathered antennae/i, groups: ["insects"] },
    { re: /opposite leaves|square stem|aromatic/i, groups: ["mint_like_plants"] },
    { re: /grass|sedge|rush|ligule|auricles|spikelet|awns/i, groups: ["graminoids"] },
    { re: /fern|sori|fiddleheads/i, groups: ["ferns"] },
    { re: /moss/i, groups: ["mosses"] },
    { re: /lichen/i, groups: ["lichens"] },
    { re: /gills|pores|spore print|cap|stalk|volva|puffball|shelf|coral fungus|jelly fungus|mushroom/i, groups: ["fungi"] },
    { re: /flower|petal|stamen|bract|catkin|umbel|raceme|panicle/i, groups: ["flowering_plants"] },
    { re: /cone|needle|scale-like leaf/i, groups: ["conifers"] },
    { re: /berry|fruit|seed|pod|samara|acorn|drupe|capsule/i, groups: ["fruiting_plants"] },
    { re: /leaf|stem|vine|tree|shrub|herb|woody|rosette|bark|sap|thorny|succulent/i, groups: ["plants"] }
  ];

  const GROUPS = {
    plants: {
      label: "Plants",
      desc: "Leaf, stem, flower, fruit, and whole-plant marks are steering this toward plants."
    },
    flowering_plants: {
      label: "Flowering plants",
      desc: "Petals, flower clusters, fruits, or seed pods suggest angiosperms."
    },
    mint_like_plants: {
      label: "Mint-family direction",
      desc: "Opposite leaves, square stems, and aromatic leaves often point toward mints and allies."
    },
    graminoids: {
      label: "Grasses, sedges, rushes",
      desc: "Blade, sheath, spikelet, awn, or triangular-stem marks suggest grass-like plants."
    },
    conifers: {
      label: "Conifers",
      desc: "Needles, scale-like leaves, cones, and cone scales point toward conifers."
    },
    fruiting_plants: {
      label: "Fruiting plants",
      desc: "Fruit and seed structures can narrow plant groups after flowering."
    },
    ferns: {
      label: "Ferns",
      desc: "Fronds, sori, and fiddleheads are fern-oriented marks."
    },
    mosses: {
      label: "Mosses",
      desc: "Cushions, carpets, capsules, and visible leaf nerves point toward mosses."
    },
    lichens: {
      label: "Lichens",
      desc: "Crustose, foliose, fruticose, cup, disc, and powdery marks point toward lichens."
    },
    fungi: {
      label: "Fungi",
      desc: "Caps, gills, pores, shelves, stalks, spores, and wood/soil fruiting are fungal marks."
    },
    insects: {
      label: "Insects",
      desc: "Six legs, antennae, wings, body regions, or insect mouthparts are in play."
    },
    true_flies: {
      label: "True flies",
      desc: "One wing pair, halteres, big eyes, or sponge-like mouthparts point toward flies."
    },
    beetles: {
      label: "Beetles",
      desc: "Hard wing covers meeting in a line strongly suggest beetles."
    },
    true_bugs: {
      label: "True bugs",
      desc: "X-pattern forewings and piercing beaks suggest true bugs."
    },
    butterflies_moths: {
      label: "Butterflies and moths",
      desc: "Scaly wings, resting posture, and long proboscis marks suggest Lepidoptera."
    },
    dragonflies_damselflies: {
      label: "Dragonflies and damselflies",
      desc: "Wing posture, large eyes, and long abdomen marks point toward odonates."
    },
    bees_wasps: {
      label: "Bees and wasps",
      desc: "Pollen baskets, fuzzy bodies, or wasp waist marks point toward bees/wasps."
    }
  };

  function slugify(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\bvs\b/g, " versus ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function lines(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  function splitWords(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  function inferAliases(label) {
    const aliases = new Set([label]);
    String(label)
      .split(/\s+vs\s+|\/|:|,/i)
      .map(part => part.trim())
      .filter(part => part.length > 3)
      .forEach(part => aliases.add(part));
    return [...aliases];
  }

  function inferPrompt(label) {
    return `Can you see ${String(label).toLowerCase()}?`;
  }

  function inferExplanation(label, category) {
    return `${label} is a visible ${category.title.toLowerCase()} mark. Use it as evidence, not as a final ID by itself.`;
  }

  function inferSignals(label, category) {
    const groups = new Set();
    if (category.lane === "plant") groups.add("plants");
    if (category.lane === "fungus") groups.add("fungi");
    if (category.lane === "insect") groups.add("insects");
    if (category.lane === "cryptogam") groups.add("ferns");

    SIGNAL_RULES.forEach(rule => {
      if (rule.re.test(label)) {
        rule.groups.forEach(group => groups.add(group));
      }
    });

    return [...groups].map(group => ({ group, weight: group === "plants" || group === "insects" ? 1 : 2 }));
  }

  const FIELD_MARKS = CATEGORY_DEFS.flatMap(category => lines(category.raw).map((label, index) => {
    const id = slugify(label);
    return {
      id,
      label,
      category: category.key,
      categoryLabel: category.title,
      lane: category.lane,
      prompt: inferPrompt(label),
      explanation: inferExplanation(label, category),
      aliases: inferAliases(label),
      signals: inferSignals(label, category),
      order: index
    };
  }));

  const MARK_BY_ID = Object.fromEntries(FIELD_MARKS.map(mark => [mark.id, mark]));

  function list() {
    return FIELD_MARKS.slice();
  }

  function categories() {
    return CATEGORY_DEFS.map(category => ({ ...category, raw: undefined }));
  }

  function grouped(marks = FIELD_MARKS) {
    return CATEGORY_DEFS.map(category => ({
      ...category,
      raw: undefined,
      marks: marks.filter(mark => mark.category === category.key)
    })).filter(group => group.marks.length);
  }

  function get(id) {
    return MARK_BY_ID[id] || null;
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function search(query, options = {}) {
    const clean = normalize(query);
    const words = clean ? clean.split(/\s+/).filter(Boolean) : [];
    const source = Array.isArray(options.source) ? options.source : FIELD_MARKS;
    if (!words.length) return source.slice();

    return source.filter(mark => {
      const hay = normalize([
        mark.label,
        mark.categoryLabel,
        mark.prompt,
        mark.explanation,
        ...(mark.aliases || [])
      ].join(" "));
      return words.every(word => hay.includes(word));
    });
  }

  function suggestionsFor(dispositions = {}) {
    const scores = {};
    Object.entries(dispositions || {}).forEach(([id, disposition]) => {
      const mark = get(id);
      if (!mark || disposition === "unsure") return;

      const multiplier = disposition === "seen" ? 1 : -0.65;
      mark.signals.forEach(signal => {
        const group = signal.group;
        scores[group] = (scores[group] || 0) + (signal.weight || 1) * multiplier;
      });
    });

    return Object.entries(scores)
      .map(([id, score]) => ({
        id,
        score,
        label: GROUPS[id]?.label || id,
        desc: GROUPS[id]?.desc || "Suggested by selected field marks."
      }))
      .filter(row => Math.abs(row.score) > 0.1)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function nextQuizIndex(index, delta = 1) {
    if (!FIELD_MARKS.length) return 0;
    return (Number(index || 0) + delta + FIELD_MARKS.length) % FIELD_MARKS.length;
  }

  window.GridWildFieldMarks = {
    list,
    grouped,
    get,
    search,
    categories,
    suggestionsFor,
    nextQuizIndex,
    groups: GROUPS
  };
})();
