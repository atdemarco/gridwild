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
      key: "fern_fronds",
      title: "Fern fronds and form",
      lane: "cryptogam",
      raw: `
Fern frond once-divided
Fern frond twice-divided
Fertile fronds different from sterile fronds
Fiddleheads present
      `
    },
    {
      key: "fern_sori",
      title: "Fern sori and spores",
      lane: "cryptogam",
      raw: `
Fern sori position
Round sori vs linear sori
Sori covered by indusium
      `
    },
    {
      key: "moss_liverworts",
      title: "Mosses and liverworts",
      lane: "cryptogam",
      raw: `
Moss cushion vs carpet
Moss hairpoints
Moss leaf nerve/costa visible
Moss capsule shape
Liverwort leafy vs thalloid
      `
    },
    {
      key: "lichen_forms",
      title: "Lichen forms and surfaces",
      lane: "cryptogam",
      raw: `
Lichen crustose form
Lichen foliose form
Lichen fruticose form
Lichen apothecia little cups/discs
Lichen soredia/powdery surface
Lichen color when wet vs dry
      `
    },
    {
      key: "cryptogam_substrate",
      title: "Cryptogam substrate and habitat",
      lane: "cryptogam",
      raw: `
Growing on bark vs rock vs soil
Moss/lichen substrate specificity
      `
    },
    {
      key: "fungus_cap",
      title: "Fungus cap and surface",
      lane: "fungus",
      raw: `
Cap shape
Cap color
Cap surface slimy vs dry
Cap scales/warts
Staining/bruising color
Mushroom odor
      `
    },
    {
      key: "fungus_gills_pores",
      title: "Gills, pores, teeth, and spores",
      lane: "fungus",
      raw: `
Gills present
Pores instead of gills
Teeth/spines instead of gills
Gills attached vs free
Gills decurrent down stalk
Gill color
Spore print color
      `
    },
    {
      key: "fungus_stalk_base",
      title: "Stalk, ring, and base",
      lane: "fungus",
      raw: `
Stalk present vs absent
Ring on stalk
Volva/cup at base
Bulbous base
      `
    },
    {
      key: "fungus_growth_forms",
      title: "Fungus fruiting forms",
      lane: "fungus",
      raw: `
Shelf/bracket fungus form
Puffball form
Jelly fungus texture
Coral fungus branching
      `
    },
    {
      key: "fungus_ecology",
      title: "Fungus growth and ecology",
      lane: "fungus",
      raw: `
Growing on wood vs soil vs leaf litter
Clustered vs solitary fruiting
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

  function laneLabel(lane) {
    if (lane === "plant") return "Plants";
    if (lane === "cryptogam") return "Ferns, mosses, lichens";
    if (lane === "fungus") return "Fungi";
    if (lane === "insect") return "Insects";
    return "Field marks";
  }

  function lowerFirst(value) {
    const text = String(value || "").trim();
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
  }

  function splitContrast(label) {
    return String(label || "")
      .split(/\s+vs\s+|\/|,/i)
      .map(part => part.trim())
      .filter(Boolean);
  }

  const FIELD_MARK_GLOSSARY = {
    tree: "a woody plant with one main trunk that lifts the leafy crown above the ground",
    shrub: "a woody plant with several stems rising from the base, usually shorter than a tree",
    herb: "a plant with soft, non-woody stems that usually die back at the end of the season",
    present: "the feature can be seen",
    absent: "the feature is not visible",
    separate: "not joined or fused together",
    dry: "not slimy, sticky, or wet-looking on the surface",
    upright: "held upward or standing rather than hanging down",
    dangling: "hanging downward from the plant",
    free: "not attached to the nearby structure",
    attached: "joined to the nearby structure",
    colored: "showing obvious pigment or pattern rather than being clear",
    woody: "firm stem tissue that persists year to year, like twigs, bark, or trunks",
    "woody stem": "a hard, persistent stem with bark or twiggy growth",
    "non woody stem": "a softer green stem that does not form permanent wood",
    "non woody": "soft green stem tissue rather than bark or wood",
    "vine climber": "a plant that leans, twines, climbs, or grabs support instead of standing alone",
    climber: "a plant that uses another surface for support",
    "self supporting plant": "a plant that holds itself upright without climbing or trailing over support",
    "grass like": "narrow leaves and jointed or grass-like stems, often needing close inspection of sheaths and seed heads",
    broadleaf: "a plant with wider, flatter leaves rather than grass-like blades",
    "broadleaf plant": "a plant with wider, flatter leaves rather than grass-like blades",
    "fern like fronds": "leafy fronds that are often divided into many small segments and do not bear flowers",
    "seed plant leaves": "ordinary seed-plant leaves from flowering plants or conifers, rather than fern fronds",
    "moss like mat": "a low cushion or carpet of very small plants, often soft and close to the surface",
    "vascular plant": "a plant with internal water-conducting tissue, usually with clear stems, roots, or larger leaves",
    aquatic: "growing in water",
    emergent: "rooted in water or saturated soil but rising above the surface",
    terrestrial: "growing on land rather than in water",
    rosette: "a low circle of leaves radiating from the plant base",
    "upright single stem": "one main vertical stem, not a clump or many-branched base",
    "branching bushy habit": "many side branches making the plant look full or shrubby",
    "mat forming creeping habit": "growth that spreads flat across the ground or surface",
    "clumping tussock habit": "many shoots packed from one base, making a tuft or bunch",
    "twining vine habit": "a climbing stem that wraps around its support",
    "tendril climbing habit": "a climber using thin curling tendrils to grab support",
    "trailing groundcover habit": "stems running along the ground rather than standing upright",
    "tree bark texture": "the surface pattern of bark, such as smooth, furrowed, flaky, plated, or peeling",
    "young green stems": "new soft stems, often green and flexible",
    "woody old stems": "older hard stems with bark, scars, or twiggy structure",
    "hollow stem": "a stem with an empty center when viewed at a break or cut end",
    "solid stem": "a stem filled with tissue rather than a hollow tube",
    "square stem": "a four-sided stem; rolling it between fingers can reveal the edges",
    "round stem": "a cylindrical stem without sharp lengthwise corners",
    "milky sap present": "white or colored latex-like fluid released from a broken leaf or stem",
    "aromatic crushed leaf odor": "a noticeable smell released when a leaf is gently crushed",
    "thorny spiny plant": "a plant armed with sharp points on stems, leaves, or leaf edges",
    "succulent fleshy plant": "thick water-storing leaves or stems",
    evergreen: "keeping green leaves through the dormant season",
    deciduous: "dropping leaves for part of the year",
    "annual looking weedy habit": "fast, soft growth with many flowers or seeds, like a plant completing life in one season",
    "opposite leaves": "two leaves attached at the same node, directly across from one another",
    "alternate leaves": "one leaf per node, switching sides as you move up the stem",
    "whorled leaves": "three or more leaves attached around the same node",
    "basal leaves only": "leaves mostly or entirely at ground level, with little leafy stem above",
    "leaves clustered at branch tips": "leaves packed near twig ends instead of spread evenly along the branch",
    "two ranked leaves": "leaves arranged in two flat rows along the stem",
    "spiral leaf arrangement": "leaves stepping around the stem in a spiral rather than forming opposite pairs",
    "paired leaflets": "leaflets occurring in pairs along a compound leaf",
    "leaf arrangement changes up stem": "lower and upper leaves attach differently on the same plant",
    "dense overlapping scale like leaves": "tiny leaves packed over each other like shingles, often hugging a twig",
    "simple leaf": "one undivided blade, even if the edge is toothed or lobed",
    "compound leaf": "one leaf divided into separate leaflets on a shared stalk",
    "pinnately compound leaf": "leaflets arranged along both sides of a central stalk, like a feather",
    "palmately compound leaf": "leaflets spreading from one point, like fingers from a palm",
    "trifoliate leaf": "a compound leaf with three leaflets",
    "needle like leaf": "a long, narrow, stiff leaf shaped like a needle",
    "scale like leaf": "a tiny flattened leaf that overlaps or hugs the stem",
    "strap shaped leaf": "a long flat leaf with nearly parallel sides",
    "heart shaped leaf": "a broad leaf with a notch at the base and a pointed tip",
    "oval elliptic leaf": "a leaf widest near the middle and tapering toward both ends",
    "lance shaped leaf": "a narrow leaf that is widest below the middle and tapers to a point",
    "linear leaf": "a very narrow leaf with nearly parallel sides",
    "lobed leaf": "a blade with rounded or pointed projections cut into the outline",
    "deeply divided leaf": "a blade cut so deeply that the divisions nearly reach the midrib or base",
    "fan shaped leaf": "a leaf spreading outward from a narrow base like a fan",
    "spoon shaped leaf": "a leaf narrow at the base and broader near the rounded tip",
    "arrowhead shaped leaf": "a leaf with pointed basal lobes, like an arrowhead",
    "kidney shaped leaf": "a rounded leaf with a notch at the base, wider than long",
    "round leaf": "a nearly circular leaf blade",
    "needle bundle number": "the number of needles held together in one fascicle or bundle",
    "leaflet number": "how many leaflets make up one compound leaf",
    "leaflets opposite": "leaflets paired across from each other on the leaf stalk",
    "leaflets alternate": "leaflets staggered one by one along the leaf stalk",
    "terminal leaflet present": "a single leaflet at the very end of a compound leaf",
    "leaf blade asymmetric": "the two sides of the leaf blade are noticeably unequal",
    "juvenile leaf shape": "young leaves have a different shape from mature leaves",
    "adult leaf shape": "mature leaves show the shape most useful for identification",
    "smooth leaf margin": "a leaf edge without teeth, lobes, or spines",
    "serrated toothed margin": "a leaf edge with small saw-like teeth",
    "double toothed margin": "large teeth with smaller teeth on them",
    "wavy margin": "a leaf edge that rises and falls gently without sharp teeth",
    "lobed margin": "a leaf edge cut into larger rounded or pointed sections",
    "spiny margin": "a leaf edge armed with sharp points",
    "rolled under margin": "the leaf edge curls downward toward the underside",
    "pointed leaf tip": "the leaf ends in a clear point",
    "rounded leaf tip": "the leaf tip is blunt or smoothly rounded",
    "notched leaf tip": "the leaf tip has a small indentation",
    "drip tip": "a narrow extended point that helps water run off",
    "tapered leaf base": "the blade narrows gradually where it meets the stalk",
    "heart shaped leaf base": "the base has two rounded lobes and a notch where the stalk attaches",
    "unequal leaf base": "one side of the blade base attaches lower or larger than the other",
    "hairy leaf surface": "visible or touchable hairs on the leaf",
    "smooth glabrous leaf surface": "a leaf surface without hairs",
    "waxy glossy leaf surface": "a shiny or wax-coated leaf surface",
    "rough sandpapery leaf surface": "a gritty or rough texture when lightly touched",
    "fuzzy underside": "dense fine hairs on the lower leaf surface",
    "silvery underside": "a pale, reflective, or whitish lower leaf surface",
    "veins raised beneath leaf": "veins stand out as ridges on the underside",
    "parallel veins": "major veins run side by side along the leaf",
    "net like veins": "veins branch and reconnect into a network",
    "palmate veins": "several main veins spread from one point",
    "pinnate veins": "side veins branch from a single midrib",
    "strong midrib": "one central vein is much more prominent than the others",
    "translucent dots glands": "tiny see-through dots or oil glands visible when backlit",
    "leaf stipules present": "small paired appendages at the base of the leaf stalk",
    "sheathing leaf base": "the leaf base wraps partly or fully around the stem",
    "leaf petiole long": "the leaf has a noticeable stalk",
    "leaf petiole absent": "the blade attaches directly to the stem",
    "flower color": "the main visible color of petals or petal-like bracts",
    "flower symmetry radial": "a flower divisible into matching halves in several directions",
    "flower symmetry bilateral": "a flower divisible into matching halves in only one direction",
    "number of petals": "the count of petals or petal-like lobes on one flower",
    "petals fused": "petals joined into a tube, bell, lip, or other single structure",
    "petals separate": "petals free from each other",
    "tubular flower": "a flower shaped like a tube",
    "bell shaped flower": "a flower flaring like a bell",
    "pea shaped flower": "a flower with banner, wing, and keel parts like a pea or bean flower",
    "daisy like composite flower": "a flower head made of many small flowers, often with ray and disk florets",
    "umbel flower cluster": "flower stalks radiating from one point like umbrella ribs",
    "spike flower cluster": "stalkless or nearly stalkless flowers arranged along a central stem",
    "raceme flower cluster": "stalked flowers arranged along a central stem",
    "panicle flower cluster": "a branched flower cluster with many smaller stalks",
    catkin: "a drooping or upright cluster of many tiny flowers, often without showy petals",
    cone: "a reproductive structure made of overlapping scales",
    "tiny inconspicuous flowers": "small flowers that are easy to miss and may lack showy petals",
    "showy bracts": "colored leaf-like parts near flowers that look petal-like",
    "true petals": "the actual petal parts of the flower",
    "flower head solitary": "one flower or head held alone",
    "flower head clustered": "several flowers or heads grouped together",
    "flowers in leaf axils": "flowers arising where leaf stalks meet the stem",
    "flowers at stem tips": "flowers held at the ends of stems or branches",
    "fragrant flowers": "flowers with a noticeable scent",
    "irregular lower lip upper lip flower": "a two-lipped flower with upper and lower parts",
    "long floral spur": "a narrow tube or projection extending behind the flower",
    "prominent stamens": "pollen-bearing parts clearly stick out or dominate the flower",
    "separate male female flowers": "pollen-producing and seed-producing flowers are separate",
    "flowering season": "the time of year when flowers are present",
    "berry like fruit": "a fleshy fruit with seeds inside",
    "dry capsule": "a dry fruit that splits open to release seeds",
    "pod legume": "a dry fruit that opens along seams, common in pea and bean relatives",
    "winged seed samara": "a seed or fruit with a papery wing for wind dispersal",
    "acorn nut": "a hard dry fruit or seed with a tough shell",
    "fleshy drupe": "a fleshy fruit with one hard pit, like a cherry",
    "aggregate fruit": "one fruit made from many small units from one flower",
    "multiple fruit cluster": "a fruit mass formed from many flowers packed together",
    "burr with hooks": "a seed or fruit covered with hooks that catch on fur or clothing",
    "parachute like seeds": "seeds with hairs or plumes that catch the wind",
    "milkweed style silky seeds": "seeds attached to long silky hairs",
    "seed head persistent after flowering": "dry flower or seed structures remain after petals fade",
    "fruit color": "the visible color of mature or ripening fruit",
    "fruit position upright": "fruit held above or along the stem",
    "fruit position dangling": "fruit hanging downward",
    "fruit in clusters": "several fruits grouped together",
    "fruit with beak or awn": "fruit ending in a narrow point, bristle, or tail",
    "seed pod splitting pattern": "the way a dry pod opens to release seeds",
    "cone scale shape": "the form and edge of the overlapping cone scales",
    "fruit season": "the time of year when fruit is visible",
    "sedges have edges triangular stem": "many sedges have three-sided stems you can feel or see in cross-section",
    "round rush stem": "rush stems are often round or cylindrical",
    "jointed grass stem": "grasses often show nodes or joints along the stem",
    "grass blade ligule": "a small flap, membrane, or line of hairs where the blade meets the sheath",
    "grass blade auricles": "small ear-like lobes at the base of the blade",
    "open leaf sheath": "the sheath margins overlap but are not fused into a tube",
    "closed leaf sheath": "the sheath forms a tube around the stem",
    "spikelet arrangement": "the way small grass flower units are placed on the seed head",
    "feathery grass inflorescence": "a seed head with soft, plume-like branches",
    "bristly grass head": "a seed head with stiff bristles or awns",
    "flat sedge leaves": "sedge leaves flattened like blades",
    "basal clump": "many leaves or stems arising from the base",
    "running grass": "grass spreading by creeping stems or rhizomes",
    "seed head drooping": "the seed head bends downward",
    "seed head upright": "the seed head stands erect",
    "awns present": "bristle-like tips or tails attached to spikelets or seeds",
    "rhizome spreading colony": "an underground stem spreads and makes a patch of connected shoots",
    "wetland grass like habitat": "grass-like plants growing in wet soil, marshes, edges, or shallow water",
    "fern frond once divided": "a fern frond divided one time into leaflets or pinnae",
    "fern frond twice divided": "a fern frond whose pinnae are divided again into smaller segments",
    "fern sori position": "where the spore patches sit on the underside or edge of the frond",
    "round sori": "round fern spore patches",
    "linear sori": "long narrow fern spore patches",
    "sori covered by indusium": "spore patches partly covered by a thin flap or membrane",
    "fertile fronds different from sterile fronds": "spore-bearing fronds look different from non-spore fronds",
    "fiddleheads present": "young fern fronds coiled like scrolls",
    "moss cushion": "a rounded mound of moss",
    "moss carpet": "a flat spreading sheet of moss",
    "moss hairpoints": "fine pale hair-like tips on moss leaves",
    "moss leaf nerve costa visible": "a central rib visible in tiny moss leaves",
    "moss capsule shape": "the shape of the spore capsule held above the moss",
    "liverwort leafy": "a liverwort with tiny leaf-like rows",
    "liverwort thalloid": "a flat ribbon-like liverwort body without obvious leaves",
    "lichen crustose form": "a crust-like lichen tightly attached to bark, rock, or soil",
    "lichen foliose form": "a leaf-like lichen with lobes that lift from the surface",
    "lichen fruticose form": "a shrubby, hair-like, or branching lichen",
    "lichen apothecia little cups discs": "cup or disk structures where some lichens make spores",
    "lichen soredia powdery surface": "powdery granules used by lichens to reproduce",
    "lichen color when wet": "lichen color after moisture has darkened or revived it",
    "lichen color when dry": "lichen color in dry conditions",
    "growing on bark": "attached to tree bark",
    "growing on rock": "attached to stone",
    "growing on soil": "attached to bare ground",
    "moss lichen substrate specificity": "the kind of surface a moss or lichen seems restricted to",
    "cap shape": "the outline of the mushroom cap, such as convex, flat, bell-shaped, depressed, or shelf-like",
    "cap color": "the visible color of the mushroom cap, noting age and moisture",
    "cap surface slimy": "a slippery or sticky cap surface",
    "cap surface dry": "a non-sticky cap surface",
    "cap scales warts": "raised patches, scales, or wart-like bits on the cap",
    "gills present": "thin radiating plates on the underside of a mushroom cap",
    "pores instead of gills": "a sponge-like underside with many tiny holes",
    "teeth spines instead of gills": "downward-pointing teeth or spines instead of plates or pores",
    "gills attached": "gills meet or run onto the stalk",
    "gills free": "gills stop before reaching the stalk",
    "gills decurrent down stalk": "gills run downward along the stalk",
    "gill color": "the color of the gill surface, which may change with age",
    "stalk present": "a stem-like support under the cap or fruiting body",
    "stalk absent": "the fruiting body is attached directly to the surface",
    "ring on stalk": "a band or skirt on the stalk left by a veil",
    "volva cup at base": "a cup, sack, or rim around the base of the stalk",
    "bulbous base": "a swollen base at the bottom of the stalk",
    "shelf bracket fungus form": "a shelf-like fruiting body growing from wood",
    "puffball form": "a round or pear-shaped fungus with spores inside",
    "jelly fungus texture": "soft, rubbery, gelatinous fungus tissue",
    "coral fungus branching": "upright branching fruiting body like coral",
    "staining bruising color": "a color change after handling, cutting, or pressure",
    "growing on wood": "fruiting from logs, stumps, buried wood, or living trees",
    "growing on leaf litter": "fruiting from fallen leaves or forest duff",
    "clustered fruiting": "several fungi growing together from one area or base",
    "solitary fruiting": "one fruiting body growing alone",
    "mushroom odor": "a noticeable smell such as mealy, almond-like, fishy, spicy, or unpleasant",
    "spore print color": "the color of spores dropped onto a surface",
    "seasonal fruiting pattern": "the time of year and weather pattern when the fungus appears",
    "mycorrhizal tree association": "a fungus growing with particular trees through root partnerships",
    "six legs visible": "adult insects have three pairs of legs",
    "three body regions visible": "insects have head, thorax, and abdomen",
    "winged adult": "the adult has wings",
    "wingless adult": "the adult lacks visible wings",
    "one pair of wings": "only two functional wings are visible, a key fly clue",
    "two pairs": "four wings are visible or folded together",
    "hard wing covers elytra": "hardened front wings covering the back wings, typical of beetles",
    "membranous wings": "thin clear or smoky wings without scales",
    "scaly wings": "wings covered in tiny scales, typical of butterflies and moths",
    "hairy body": "noticeable body hairs or fuzz",
    "shiny body": "a smooth reflective body surface",
    "flattened body": "body pressed low and broad from top to bottom",
    "hump backed body": "arched body profile",
    "long bodied": "body much longer than wide",
    "round bodied": "body compact or rounded",
    "body color pattern": "arrangement of colors, spots, bands, or patches",
    "warning colors": "bright contrasting colors that may signal defense",
    "camouflage shape": "body form or color that resembles leaves, bark, twigs, or surroundings",
    "antennae length": "how long the antennae are compared with the body",
    "clubbed antennae": "antennae ending in a thicker knob or club",
    "feathered antennae": "antennae with many fine side branches",
    "elbowed antennae": "antennae sharply bent like an elbow",
    "threadlike antennae": "slender antennae with a simple string-like shape",
    "sawtooth antennae": "antennae segments with tooth-like projections",
    "big compound eyes": "large many-faceted eyes taking up much of the head",
    "eyes meeting on top of head": "compound eyes touch or nearly touch above the head",
    "long snout rostrum": "an extended snout-like head part",
    "piercing beak": "a straw-like beak used for piercing and sucking",
    "chewing jaws": "visible biting mouthparts",
    "sponge like fly mouthparts": "soft pad-like mouthparts used by many flies",
    "long butterfly moth proboscis": "a long coiled or extended feeding tube",
    "head wider than body": "the head is broader than the thorax or body behind it",
    "face markings": "distinct lines, patches, or colors on the face",
    "butterfly resting posture": "wings often held upright or partly open at rest",
    "moth resting posture": "wings often folded roof-like, flat, or wrapped around the body",
    "dragonfly wings held open": "wings spread out sideways when resting",
    "damselfly wings held closed": "wings usually held together over the body when resting",
    "fly halteres": "tiny knobbed balancing organs behind the wings",
    "beetle elytra meeting in straight line": "hardened wing covers meet in a central seam",
    "true bug hemelytra x pattern": "forewings overlap to make an X-like pattern",
    "lacewing net veined wings": "delicate wings with many cross-veins like lace",
    "caddisfly tent like wings": "wings held roof-like over the body",
    "mayfly upright wings": "wings held upright over the body at rest",
    "wing spots bands": "visible spots or bands on the wings",
    "wing venation pattern": "the branching pattern of veins in a wing",
    "clear wings": "transparent or mostly see-through wings",
    "colored wings": "wings with strong pigment or pattern",
    "hindwing visible": "the rear wing can be seen",
    "hindwing hidden": "the rear wing is covered or folded out of sight",
    "folded wings roof like over body": "wings slant down over the body like a tent roof",
    "scale covered wings": "wings covered by tiny powdery scales",
    "jumping hind legs": "enlarged rear legs built for jumping",
    "raptorial grabbing forelegs": "front legs modified for seizing prey",
    "swimming legs": "legs flattened or fringed for moving through water",
    "pollen baskets": "packed pollen carried on hind legs, especially in bees",
    "spiny legs": "legs with obvious spines",
    "long stilt like legs": "very long thin legs holding the body high",
    "caterpillar proleg number": "the number and position of fleshy false legs on a larva",
    "larva case bearing habit": "a larva carrying or living in a protective case",
    "leaf mining trail pattern": "pale tunnels or blotches made inside a leaf by a larva",
    "gall shape on plant": "a swelling or growth made by the plant around an insect or mite"
  };

  const GLOSSARY_BY_KEY = Object.fromEntries(Object.entries(FIELD_MARK_GLOSSARY).map(([key, value]) => [
    key.toLowerCase().replace(/&/g, " and ").replace(/\bvs\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim(),
    value
  ]));

  function glossaryKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\bvs\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function exactDefinitionForTerm(value) {
    const key = glossaryKey(value);
    if (!key) return "";
    if (GLOSSARY_BY_KEY[key]) return GLOSSARY_BY_KEY[key];
    const singular = key.replace(/\b(leaves)\b/g, "leaf").replace(/s\b/g, "");
    if (GLOSSARY_BY_KEY[singular]) return GLOSSARY_BY_KEY[singular];
    return "";
  }

  function definitionForTerm(value) {
    const key = glossaryKey(value);
    const exact = exactDefinitionForTerm(value);
    if (exact) return exact;
    const hit = Object.keys(GLOSSARY_BY_KEY)
      .sort((a, b) => b.length - a.length)
      .find(candidate => key.includes(candidate) || (key.length >= 9 && candidate.includes(key)));
    return hit ? GLOSSARY_BY_KEY[hit] : "";
  }

  function definitionsForContrast(label) {
    const rawParts = splitContrast(label);
    const firstWords = rawParts[0]
      ? rawParts[0].replace(/:/g, " ").split(/\s+/).filter(Boolean)
      : [];
    const bases = [
      firstWords.slice(0, -1).join(" "),
      firstWords[0] || "",
      firstWords.slice(0, 2).join(" ")
    ].filter(Boolean);

    return rawParts.map((part, index) => {
      const contextual = bases.map(base => `${base} ${part}`);
      const candidates = index === 0
        ? [part, ...contextual]
        : [...contextual, part];
      const definition = candidates.map(exactDefinitionForTerm).find(Boolean) || definitionForTerm(part);
      return { part, definition: definition || "" };
    });
  }

  function hasAny(text, words) {
    return words.some(word => text.includes(word));
  }

  function escXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function shortCaption(label) {
    const text = String(label || "").replace(/\s+vs\s+/ig, " / ").replace(/\s+/g, " ").trim();
    return text.length > 30 ? `${text.slice(0, 27)}...` : text;
  }

  function sketchFrame(label, body) {
    const caption = escXml(shortCaption(label));
    return `
      <svg class="gw-fieldmark-sheet-sketch" viewBox="0 0 160 118" role="img" aria-label="${caption} schematic">
        <rect x="1" y="1" width="158" height="116" rx="8" fill="currentColor" opacity="0.035"></rect>
        ${body}
        <text x="80" y="108" text-anchor="middle" fill="currentColor" opacity="0.72" font-size="9" font-weight="800">${caption}</text>
      </svg>
    `;
  }

  function leafBody(kind = "oval") {
    if (kind === "needle") return `<path d="M80 20 C74 46 74 72 80 96 C86 72 86 46 80 20Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 22 L80 94" stroke="currentColor" stroke-width="1.6" opacity="0.7"></path>`;
    if (kind === "linear") return `<path d="M70 18 C66 44 66 72 70 98 L90 98 C94 72 94 44 90 18Z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2"></path><path d="M80 20 L80 97" stroke="currentColor" stroke-width="1.6" opacity="0.7"></path>`;
    if (kind === "heart") return `<path d="M80 94 C46 66 39 36 59 26 C70 20 78 27 80 38 C82 27 90 20 101 26 C121 36 114 66 80 94Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 40 L80 92" stroke="currentColor" stroke-width="1.4" opacity="0.65"></path>`;
    if (kind === "lobed") return `<path d="M80 18 C93 28 91 42 103 49 C92 54 101 70 87 73 C88 84 83 91 80 98 C77 91 72 84 73 73 C59 70 68 54 57 49 C69 42 67 28 80 18Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 24 L80 94" stroke="currentColor" stroke-width="1.4" opacity="0.65"></path>`;
    if (kind === "fan") return `<path d="M80 96 C50 78 43 50 54 28 C72 38 88 38 106 28 C117 50 110 78 80 96Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 96 L56 31 M80 96 L80 39 M80 96 L104 31" stroke="currentColor" stroke-width="1.3" opacity="0.62"></path>`;
    if (kind === "round") return `<circle cx="80" cy="58" r="32" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></circle><path d="M80 90 L80 102" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>`;
    if (kind === "arrow") return `<path d="M80 20 C96 34 107 55 112 80 C97 75 87 80 80 96 C73 80 63 75 48 80 C53 55 64 34 80 20Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 26 L80 94" stroke="currentColor" stroke-width="1.4" opacity="0.65"></path>`;
    return `<path d="M80 18 C47 35 43 75 80 99 C117 75 113 35 80 18Z" fill="currentColor" opacity="0.17" stroke="currentColor" stroke-width="2"></path><path d="M80 22 L80 96 M80 55 C68 50 60 44 54 35 M80 64 C94 58 103 50 109 39" stroke="currentColor" stroke-width="1.4" opacity="0.65" fill="none"></path>`;
  }

  function plantStemSketch(label, mode) {
    const stem = `<path d="M80 18 L80 92" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>`;
    const leaf = (x, y, flip = 1) => `<ellipse cx="${x}" cy="${y}" rx="19" ry="8" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2" transform="rotate(${flip * 24} ${x} ${y})"></ellipse>`;
    let body = stem;
    if (mode === "opposite") body += `${leaf(57, 36, -1)}${leaf(103, 36, 1)}${leaf(58, 64, 1)}${leaf(102, 64, -1)}`;
    else if (mode === "whorled") body += `${leaf(55, 46, -1)}${leaf(105, 46, 1)}${leaf(80, 29, 0)}${leaf(80, 63, 0)}<circle cx="80" cy="46" r="4" fill="currentColor"></circle>`;
    else if (mode === "basal") body = `<path d="M80 86 L80 52" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="80" cy="84" rx="22" ry="8" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.8" transform="rotate(${a} 80 84)"></ellipse>`).join("")}`;
    else if (mode === "scale") body += [26, 35, 44, 53, 62, 71, 80].map((y, i) => `<path d="M80 ${y} C${i % 2 ? 101 : 59} ${y - 8} ${i % 2 ? 102 : 58} ${y + 8} 80 ${y + 13}Z" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="1.5"></path>`).join("");
    else body += `${leaf(58, 30, -1)}${leaf(102, 45, 1)}${leaf(58, 61, -1)}${leaf(102, 77, 1)}`;
    return sketchFrame(label, body);
  }

  function plantHabitSketch(label, text) {
    let body = `<path d="M28 91 L132 91" stroke="currentColor" stroke-width="2" opacity="0.35"></path>`;
    if (text.includes("tree")) body += `<path d="M80 88 L80 43" stroke="currentColor" stroke-width="5" stroke-linecap="round"></path><circle cx="80" cy="35" r="24" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2"></circle>`;
    else if (text.includes("vine") || text.includes("twining") || text.includes("tendril")) body += `<path d="M56 90 C105 80 49 54 94 43 C121 36 96 24 116 18" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"></path><path d="M94 43 C105 43 110 35 103 31" stroke="currentColor" stroke-width="1.8" fill="none"></path>`;
    else if (text.includes("mat") || text.includes("creeping") || text.includes("trailing")) body += `<path d="M34 82 C56 68 76 93 98 77 C116 65 125 78 134 70" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path><circle cx="55" cy="72" r="6" fill="currentColor" opacity="0.22"></circle><circle cx="97" cy="78" r="6" fill="currentColor" opacity="0.22"></circle>`;
    else if (text.includes("clumping") || text.includes("tussock") || text.includes("grass")) body += [52, 62, 72, 82, 92, 102].map((x, i) => `<path d="M80 90 C${x} ${66 - i * 2} ${x + 2} 43 ${x - 4} 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>`).join("");
    else body += `<path d="M80 89 L80 39 M80 58 C60 45 50 34 42 20 M80 61 C101 48 111 37 119 24 M80 73 C61 69 48 66 36 58 M80 75 C99 72 113 68 128 60" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"></path>`;
    return sketchFrame(label, body);
  }

  function flowerSketch(label, text) {
    let body = `<path d="M80 92 L80 63" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>`;
    if (text.includes("umbel")) body += [40, 60, 80, 100, 120].map(x => `<path d="M80 64 L${x} 31" stroke="currentColor" stroke-width="1.7" opacity="0.7"></path><circle cx="${x}" cy="29" r="7" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.6"></circle>`).join("");
    else if (text.includes("spike") || text.includes("catkin")) body = `<path d="M80 92 L80 25" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>${[35,45,55,65,75].map((y,i) => `<circle cx="${i % 2 ? 92 : 68}" cy="${y}" r="7" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.6"></circle>`).join("")}`;
    else if (text.includes("raceme") || text.includes("panicle")) body += `<path d="M80 70 C62 57 58 45 50 31 M80 66 C98 54 103 43 112 29 M80 78 C62 75 50 69 40 59 M80 75 C101 70 113 65 124 55" stroke="currentColor" stroke-width="1.8" fill="none"></path>${[50,112,40,124].map((x,i) => `<circle cx="${x}" cy="${[31,29,59,55][i]}" r="6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"></circle>`).join("")}`;
    else if (text.includes("tubular") || text.includes("bell")) body += `<path d="M64 35 C66 22 94 22 96 35 L89 65 C84 72 76 72 71 65Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></path>`;
    else if (text.includes("daisy")) body += [0,45,90,135].map(a => `<ellipse cx="80" cy="42" rx="8" ry="24" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="1.5" transform="rotate(${a} 80 42)"></ellipse>`).join("") + `<circle cx="80" cy="42" r="10" fill="currentColor" opacity="0.28"></circle>`;
    else body += [0,60,120].map(a => `<ellipse cx="80" cy="42" rx="12" ry="26" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.6" transform="rotate(${a} 80 42)"></ellipse>`).join("") + `<circle cx="80" cy="42" r="7" fill="currentColor" opacity="0.32"></circle>`;
    return sketchFrame(label, body);
  }

  function fruitSketch(label, text) {
    let body = `<path d="M36 90 L124 90" stroke="currentColor" stroke-width="2" opacity="0.35"></path>`;
    if (text.includes("samara") || text.includes("winged")) body += `<ellipse cx="68" cy="55" rx="28" ry="10" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="2" transform="rotate(-26 68 55)"></ellipse><circle cx="94" cy="66" r="8" fill="currentColor" opacity="0.25"></circle>`;
    else if (text.includes("pod") || text.includes("capsule")) body += `<path d="M56 36 C82 27 109 37 112 71 C86 81 59 70 56 36Z" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="2"></path><path d="M60 43 C77 58 91 63 108 68" stroke="currentColor" stroke-width="1.5" opacity="0.7"></path>`;
    else if (text.includes("cone")) body += [30,42,54,66,78].map((y,i) => `<path d="M80 ${y} C${55 + i * 3} ${y + 9} ${105 - i * 3} ${y + 9} 80 ${y + 20}Z" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="1.4"></path>`).join("");
    else if (text.includes("burr")) body += `<circle cx="80" cy="58" r="25" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="2"></circle>${[20,50,80,110,140,170,210,250,290,330].map(a => `<path d="M80 58 L${80 + Math.cos(a * Math.PI / 180) * 36} ${58 + Math.sin(a * Math.PI / 180) * 36}" stroke="currentColor" stroke-width="1.4"></path>`).join("")}`;
    else if (text.includes("parachute") || text.includes("silky")) body += `<path d="M80 77 L80 48" stroke="currentColor" stroke-width="1.8"></path><path d="M80 48 C52 35 50 22 80 21 C110 22 108 35 80 48Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.7"></path><ellipse cx="80" cy="83" rx="7" ry="10" fill="currentColor" opacity="0.22"></ellipse>`;
    else body += [58,80,102].map((x,i) => `<circle cx="${x}" cy="${54 + (i % 2) * 11}" r="15" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></circle>`).join("") + `<path d="M80 38 L80 25" stroke="currentColor" stroke-width="2"></path>`;
    return sketchFrame(label, body);
  }

  function grassSketch(label, text) {
    let body = `<path d="M80 92 L80 28" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>`;
    if (text.includes("triangular")) body = `<polygon points="80,29 45,88 115,88" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="2"></polygon><text x="80" y="76" text-anchor="middle" fill="currentColor" opacity="0.65" font-size="22" font-weight="900">3</text>`;
    else if (text.includes("round rush")) body = `<circle cx="80" cy="62" r="31" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2.3"></circle><circle cx="80" cy="62" r="8" fill="currentColor" opacity="0.2"></circle>`;
    else if (text.includes("ligule") || text.includes("auricle") || text.includes("sheath")) body += `<path d="M80 62 C61 61 54 70 51 86 M80 62 C99 61 106 70 109 86" stroke="currentColor" stroke-width="2" fill="none"></path><path d="M67 60 C73 53 87 53 93 60" stroke="currentColor" stroke-width="2" fill="none" opacity="0.8"></path>`;
    else if (text.includes("spikelet") || text.includes("awn") || text.includes("seed head")) body += [38,48,58,68,78].map((y,i) => `<path d="M80 ${y} L${i % 2 ? 107 : 53} ${y - 8}" stroke="currentColor" stroke-width="1.8"></path><path d="M${i % 2 ? 107 : 53} ${y - 8} L${i % 2 ? 120 : 40} ${y - 18}" stroke="currentColor" stroke-width="1" opacity="0.65"></path>`).join("");
    else body += `<path d="M80 90 C55 58 52 35 49 20 M80 91 C101 62 105 37 112 19 M80 92 C73 62 72 39 72 21 M80 92 C89 61 91 38 91 20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>`;
    return sketchFrame(label, body);
  }

  function cryptogamSketch(label, text) {
    let body = `<path d="M34 88 L126 88" stroke="currentColor" stroke-width="2" opacity="0.35"></path>`;
    if (text.includes("fiddlehead")) body += `<path d="M81 92 C78 72 92 64 93 49 C94 33 77 27 68 38 C59 49 70 60 80 53" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path>`;
    else if (text.includes("fern") || text.includes("sori") || text.includes("indusium")) body += `<path d="M80 92 L80 22" stroke="currentColor" stroke-width="3"></path>${[34,44,54,64,74].map(y => `<path d="M80 ${y} C62 ${y - 7} 51 ${y - 7} 42 ${y - 4} M80 ${y} C98 ${y - 7} 109 ${y - 7} 118 ${y - 4}" stroke="currentColor" stroke-width="2" fill="none"></path>`).join("")}${hasAny(text, ["sori", "indusium"]) ? [47,57,67,77].map(y => `<circle cx="60" cy="${y}" r="3" fill="currentColor" opacity="0.32"></circle><circle cx="100" cy="${y}" r="3" fill="currentColor" opacity="0.32"></circle>`).join("") : ""}`;
    else if (text.includes("lichen")) body += text.includes("fruticose") ? `<path d="M80 88 C73 67 63 54 54 40 M80 88 C86 67 96 53 111 38 M80 88 C80 66 82 52 79 31" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path>` : text.includes("crustose") ? `<path d="M45 70 C54 42 78 45 90 35 C108 39 119 52 116 75 C94 89 63 86 45 70Z" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="2"></path>` : `<path d="M45 73 C55 45 78 48 84 61 C96 42 118 53 116 76 C100 89 82 81 72 86 C58 83 51 81 45 73Z" fill="currentColor" opacity="0.13" stroke="currentColor" stroke-width="2"></path>`;
    else body += `<path d="M42 84 C55 69 69 80 80 67 C91 80 106 69 119 84" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path>${[52,70,92,110].map(x => `<path d="M${x} 82 L${x} 54" stroke="currentColor" stroke-width="1.8"></path><ellipse cx="${x}" cy="50" rx="6" ry="9" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.3"></ellipse>`).join("")}`;
    return sketchFrame(label, body);
  }

  function fungusSketch(label, text) {
    let body = `<path d="M33 91 L127 91" stroke="currentColor" stroke-width="2" opacity="0.35"></path>`;
    if (text.includes("shelf") || text.includes("bracket")) body += `<path d="M55 45 C86 24 125 37 132 65 C103 75 75 70 55 57Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></path><path d="M52 88 L52 28" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>`;
    else if (text.includes("puffball")) body += `<circle cx="80" cy="58" r="30" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="2"></circle><path d="M71 87 L89 87" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>`;
    else if (text.includes("coral")) body += `<path d="M80 90 L80 55 M80 65 L58 43 M80 65 L103 43 M58 43 L49 29 M58 43 L65 28 M103 43 L97 27 M103 43 L116 31" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path>`;
    else if (text.includes("spore print")) body += `<path d="M48 72 C70 83 91 83 113 72" stroke="currentColor" stroke-width="2" fill="none"></path>${[58,70,82,94,106].map(x => `<ellipse cx="${x}" cy="78" rx="6" ry="2" fill="currentColor" opacity="0.25"></ellipse>`).join("")}<path d="M55 45 C65 21 95 21 105 45 C92 54 68 54 55 45Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></path>`;
    else {
      body += `<path d="M55 45 C65 21 95 21 105 45 C92 54 68 54 55 45Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="2"></path><path d="M72 50 C70 64 68 78 64 91 L96 91 C92 78 90 64 88 50Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2"></path>`;
      if (text.includes("gill")) body += [63,72,81,90,99].map(x => `<path d="M80 49 L${x} 60" stroke="currentColor" stroke-width="1.5" opacity="0.75"></path>`).join("");
      if (text.includes("pore")) body += [65,75,85,95].map(x => `<circle cx="${x}" cy="58" r="2" fill="currentColor" opacity="0.65"></circle>`).join("");
      if (text.includes("teeth") || text.includes("spines")) body += [66,76,86,96].map(x => `<path d="M${x} 53 L${x - 3} 64 L${x + 3} 64Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1"></path>`).join("");
      if (text.includes("ring")) body += `<path d="M65 65 C75 70 85 70 95 65" stroke="currentColor" stroke-width="3" fill="none"></path>`;
      if (text.includes("volva") || text.includes("base") || text.includes("bulbous")) body += `<path d="M58 90 C66 101 94 101 102 90" stroke="currentColor" stroke-width="3" fill="none"></path>`;
    }
    return sketchFrame(label, body);
  }

  function insectSketch(label, text) {
    let body = `<ellipse cx="80" cy="56" rx="18" ry="25" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"></ellipse><circle cx="80" cy="27" r="14" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"></circle><ellipse cx="80" cy="84" rx="16" ry="18" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2"></ellipse>`;
    if (text.includes("wing") || text.includes("elytra") || text.includes("halteres")) body += `<ellipse cx="55" cy="52" rx="23" ry="12" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.8" transform="rotate(-28 55 52)"></ellipse><ellipse cx="105" cy="52" rx="23" ry="12" fill="currentColor" opacity="0.11" stroke="currentColor" stroke-width="1.8" transform="rotate(28 105 52)"></ellipse>${text.includes("halteres") ? `<circle cx="54" cy="76" r="5" fill="currentColor" opacity="0.25"></circle><circle cx="106" cy="76" r="5" fill="currentColor" opacity="0.25"></circle>` : ""}${text.includes("elytra") ? `<path d="M80 35 L80 81" stroke="currentColor" stroke-width="2" opacity="0.7"></path>` : ""}${text.includes("venation") || text.includes("lacewing") ? `<path d="M40 52 L70 50 M90 50 L120 52 M48 45 L61 60 M112 45 L99 60" stroke="currentColor" stroke-width="1" opacity="0.65"></path>` : ""}`;
    if (text.includes("antennae") || text.includes("snout") || text.includes("eyes") || text.includes("mouth") || text.includes("jaws") || text.includes("proboscis") || text.includes("beak")) body += `<path d="M70 18 C56 5 44 11 42 24 M90 18 C104 5 116 11 118 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>${text.includes("clubbed") ? `<circle cx="42" cy="24" r="4" fill="currentColor"></circle><circle cx="118" cy="24" r="4" fill="currentColor"></circle>` : ""}${text.includes("proboscis") || text.includes("beak") || text.includes("snout") ? `<path d="M80 35 C77 48 83 56 80 70" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"></path>` : ""}`;
    body += [43,55,68].map(y => `<path d="M64 ${y} L38 ${y - 9} M96 ${y} L122 ${y - 9}" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>`).join("");
    if (text.includes("jumping")) body += `<path d="M64 70 L33 96 M96 70 L127 96" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>`;
    if (text.includes("pollen")) body += `<circle cx="37" cy="95" r="6" fill="currentColor" opacity="0.25"></circle><circle cx="123" cy="95" r="6" fill="currentColor" opacity="0.25"></circle>`;
    if (text.includes("leaf-mining")) body = `<path d="M80 18 C48 36 45 74 80 98 C115 74 112 36 80 18Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"></path><path d="M58 73 C75 63 63 48 82 42 C98 37 92 28 105 25" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"></path>`;
    if (text.includes("gall")) body = `<path d="M80 18 C48 36 45 74 80 98 C115 74 112 36 80 18Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"></path><circle cx="86" cy="58" r="16" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="2"></circle>`;
    return sketchFrame(label, body);
  }

  function buildSchematic(mark, category) {
    const label = mark.label || "";
    const text = label.toLowerCase();
    if (mark.category === "leaf_arrangement") {
      if (text.includes("opposite")) return plantStemSketch(label, "opposite");
      if (text.includes("whorled")) return plantStemSketch(label, "whorled");
      if (text.includes("basal")) return plantStemSketch(label, "basal");
      if (text.includes("scale-like")) return plantStemSketch(label, "scale");
      return plantStemSketch(label, "alternate");
    }
    if (mark.category === "leaf_shape" || mark.category === "leaf_surface") {
      const kind = text.includes("needle") ? "needle" : text.includes("linear") || text.includes("strap") ? "linear" : text.includes("heart") ? "heart" : text.includes("lobed") || text.includes("divided") ? "lobed" : text.includes("fan") ? "fan" : text.includes("round") || text.includes("kidney") ? "round" : text.includes("arrow") ? "arrow" : "oval";
      return sketchFrame(label, leafBody(kind));
    }
    if (category.lane === "plant" && mark.category === "plant_form") return plantHabitSketch(label, text);
    if (category.lane === "plant" && mark.category === "flowers") return flowerSketch(label, text);
    if (category.lane === "plant" && mark.category === "fruits") return fruitSketch(label, text);
    if (category.lane === "plant" && mark.category === "grass_like") return grassSketch(label, text);
    if (category.lane === "cryptogam") return cryptogamSketch(label, text);
    if (category.lane === "fungus") return fungusSketch(label, text);
    if (category.lane === "insect") return insectSketch(label, text);
    return sketchFrame(label, `<circle cx="80" cy="58" r="30" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2"></circle><path d="M58 58 L102 58 M80 36 L80 80" stroke="currentColor" stroke-width="2" opacity="0.55"></path>`);
  }

  function inferSummary(label, category) {
    const text = String(label || "").toLowerCase();
    const parts = splitContrast(label);
    if (parts.length > 1) {
      const definedParts = definitionsForContrast(label).filter(row => row.definition);
      if (definedParts.length) {
        return `${label} separates ${definedParts.map(row => `${lowerFirst(row.part)} (${row.definition})`).join("; ")}.`;
      }
      return `${label} is a choice between visible states. Use it to name what you actually see, then let the rest of the organism confirm or weaken that choice.`;
    }
    const direct = definitionForTerm(label);
    if (direct) return `${label}: ${direct}.`;
    if (category.key === "leaf_arrangement") return `${label} describes where leaves attach to the stem. Leaf arrangement is often one of the quickest plant clues because it is read at the node, not from leaf shape alone.`;
    if (category.key === "leaf_shape") return `${label} describes the outline or construction of a leaf blade. Shape is useful when paired with arrangement, margin, veins, and the plant's overall form.`;
    if (category.key === "leaf_surface") return `${label} names a detail of a leaf edge, tip, base, surface, or vein pattern. These small traits often separate look-alike plants.`;
    if (category.key === "flowers") return `${label} is a flower or flower-cluster clue. Flowers can be brief, but when present they carry strong information about plant groups.`;
    if (category.key === "fruits") return `${label} is a fruit, seed, or cone clue. These marks describe mature reproductive structures and how they protect or move seeds.`;
    if (category.key === "grass_like") return `${label} is a grass-like plant clue. Sedges, rushes, and grasses often require stem, sheath, ligule, and seed-head details.`;
    if (category.lane === "cryptogam") return `${label} is a small-plant or lichen clue. These marks focus on fronds, spores, cushions, mats, lobes, crusts, and the surface they grow on.`;
    if (category.lane === "fungus") return `${label} is a mushroom or fungus clue. Good fungus notes combine the cap, underside, stalk/base, growth form, substrate, and season.`;
    if (category.lane === "insect") return `${label} is an insect clue. Insects are often narrowed by body plan, wings, antennae, mouthparts, legs, posture, and behavior.`;
    if (hasAny(text, ["tree", "shrub", "herb", "stem", "vine", "clump", "mat", "rosette"])) return `${label} is a whole-organism clue. Start with the plant's growth form before zooming in on leaves or flowers.`;
    return `${label} is field-guide language for one thing you can see. It helps turn an observation into describable evidence before it becomes an ID.`;
  }

  function inferWhy(label, category) {
    const text = String(label || "").toLowerCase();
    if (category.key === "leaf_arrangement") return "Leaves attach at nodes in repeated patterns. Because that pattern is often stable within a plant group, it can quickly narrow the search.";
    if (hasAny(text, ["simple", "compound", "leaflet", "terminal leaflet"])) return "Confusing a leaflet with a whole leaf sends an ID in the wrong direction. Look for buds at the base of true leaves.";
    if (hasAny(text, ["margin", "tip", "base", "vein", "hairy", "glabrous", "waxy", "rough"])) return "Leaf details are small but durable. They are especially helpful when flowers or fruits are missing.";
    if (category.key === "flowers") return "Flower shape and cluster style often reflect plant family relationships, pollination style, and season.";
    if (category.key === "fruits") return "Fruits and seeds preserve clues after flowers fade. Their shape, texture, and dispersal structures can be very diagnostic.";
    if (category.key === "grass_like") return "Grass-like plants look similar from a distance, so keys lean heavily on stems, sheaths, ligules, spikelets, and awns.";
    if (hasAny(text, ["sori", "indusium", "fiddlehead", "frond"])) return "Fern IDs often depend on frond division and sori because ferns do not have flowers or seeds.";
    if (hasAny(text, ["lichen", "soredia", "apothecia"])) return "Lichen growth form and surface structures give you a shared vocabulary before microscopic or chemical details are needed.";
    if (hasAny(text, ["gill", "pore", "teeth", "spore"])) return "The underside or spore surface is one of the main places fungi reveal their structure.";
    if (hasAny(text, ["stalk", "ring", "volva", "base"])) return "Stalk and base details can disappear if a mushroom is picked carelessly, so they are worth checking in place.";
    if (hasAny(text, ["wing", "elytra", "halteres", "venation"])) return "Wing number, texture, resting posture, and venation are major shortcuts in insect identification.";
    if (hasAny(text, ["antennae", "mouthparts", "eyes", "snout", "jaws", "proboscis"])) return "Head details often reveal how an insect feeds and which broad group it belongs to.";
    if (hasAny(text, ["legs", "pollen", "proleg", "case", "mine", "gall"])) return "Leg shape and behavior show how the animal moves, feeds, or lives, which can be as useful as body color.";
    return "This clue gets stronger when it agrees with several other field marks from the same organism.";
  }

  function inferLookFor(label, category) {
    const text = String(label || "").toLowerCase();
    const categoryText = String(category?.title || "visible field mark").toLowerCase();
    const direct = definitionForTerm(label);

    if (/tree|shrub|herb/.test(text)) return "Step back first. Compare a single woody trunk, many woody stems from the base, or soft green stems that die back.";
    if (/woody|non-woody/.test(text)) return "Feel or look at the stem. Woody stems are firm and persistent; non-woody stems are softer, greener, and seasonal.";
    if (/vine|climber|twining|tendril/.test(text)) return "Look for a stem that depends on another plant or surface, coils around support, or grabs with tendrils.";
    if (/aquatic|emergent/.test(text)) return "Check whether the plant is rooted in water, rising through water, floating, or growing fully on land.";
    if (/rosette/.test(text)) return "Look for leaves arranged in a low circle at the base, often before a flowering stem rises.";
    if (/milky sap/.test(text)) return "Only if safe and appropriate, note whether a broken leaf or stem releases white or colored sap.";
    if (/aromatic|odor/.test(text)) return "Gently crush a small leaf if allowed, then describe the smell in plain words.";
    if (/triangular stem|sedges have edges/.test(text)) return "Feel or view the stem in cross-section. Many sedges have a three-sided stem instead of a round one.";
    if (/round rush stem/.test(text)) return "Roll the stem gently between fingers or look at a cut end; rush stems often feel round rather than edged.";
    if (/jointed grass stem/.test(text)) return "Look for swollen nodes along the stem where grass leaves and sheaths attach.";
    if (/ligule|auricle|sheath/.test(text)) return "Pull a grass leaf gently away from the stem and inspect the collar area where blade and sheath meet.";
    if (/spikelet|awn|grass head|seed head/.test(text)) return "Look at the seed head closely. Note small spikelets, bristles, awns, and whether the head droops or stands upright.";
    if (/opposite leaves/.test(text)) return "Find a stem node and check whether two leaves leave the stem directly across from each other.";
    if (/alternate leaves/.test(text)) return "Trace the stem node by node. Alternate leaves attach one at a time, switching sides as they climb the stem.";
    if (/whorled leaves/.test(text)) return "Look for three or more leaves attached around the same point on the stem.";
    if (/dense overlapping scale-like leaves/.test(text)) return "Look for tiny leaves packed over one another like roof shingles, often hugging a twig or stem.";
    if (/gills present/.test(text)) return "Look under the cap for thin, radiating plates instead of a smooth or sponge-like underside.";
    if (/pores instead of gills/.test(text)) return "Look under the cap for many small holes or a sponge-like surface rather than plates.";
    if (/teeth|spines/.test(text)) return "Look under the fruiting body for downward points or little spines.";
    if (/stalk present/.test(text)) return "Check whether the fruiting body has a central or side stalk, or whether it sits directly on the surface.";
    if (/ring on stalk/.test(text)) return "Look for a skirt, band, or raised zone around the mushroom stalk.";
    if (/volva|cup at base/.test(text)) return "Check the very base of the stalk for a cup, sack, or rim. You may need to see the whole base.";
    if (/cap/.test(text)) return "Start with the top of the fruiting body: its shape, color, texture, and surface details.";
    if (/fern frond/.test(text)) return "Look at one whole fern leaf and count how many times the blade is divided.";
    if (/sori/.test(text)) return "Check the underside of fern fronds for spore patches, then note their shape and position.";
    if (/moss/.test(text)) return "Look closely at the small green growth form: cushion, carpet, hairpoint, capsule, or leaf nerve.";
    if (/liverwort/.test(text)) return "Decide whether the plant looks leafy with tiny rows of leaves or thalloid like a flat green ribbon.";
    if (/lichen/.test(text)) return "Look at the lichen body shape and surface: crust, leaf-like lobes, shrubby branches, cups, discs, or powder.";
    if (/antennae/.test(text)) return "Check the head first and compare the antenna shape, length, and texture.";
    if (/wing|elytra|halteres/.test(text)) return "Look at the wings at rest: count visible pairs, note coverings, and check for tiny structures behind them.";
    if (/legs|proleg|raptorial|jumping|swimming/.test(text)) return "Look at leg shape and placement, especially enlarged, spiny, swimming, grabbing, or extra larval legs.";
    if (direct) return `Check the ${lowerFirst(categoryText)} and confirm the plain meaning: ${direct}.`;
    if (/flower/.test(text)) return "Look at one flower and its cluster: color, shape, symmetry, petal number, and where it sits on the plant.";
    if (/fruit|seed|pod|cone|acorn|samara|capsule/.test(text)) return "Look at mature reproductive structures and how they are held, clustered, or opened.";
    if (/leaf/.test(text)) return "Use several leaves, not just one. Check attachment, blade shape, edge, surface, veins, and underside.";
    if (/stem|bark|sap|thorn|spine|vine|shrub|tree|herb/.test(text)) return "Step back for whole-plant form, then inspect stems for texture, support, sap, or armature.";
    if (category.key === "plant_form") return "Start with the whole organism: height, branching, support, stem texture, and whether it grows upright, trailing, clumped, or matted.";
    if (category.key === "leaf_shape") return "Hold one typical mature leaf flat and describe the blade outline, divisions, and leaflet pattern.";
    if (category.key === "leaf_surface") return "Inspect the leaf edge, tip, base, upper surface, underside, and veins with the best light you have.";
    if (category.key === "flowers") return "Look for the freshest open flowers and the whole cluster, not just one petal.";
    if (category.key === "fruits") return "Look for mature fruits or seeds and note whether they are fleshy, dry, winged, hooked, clustered, or cone-like.";
    if (category.key === "grass_like") return "Look low on the plant for stem shape, nodes, sheaths, ligules, and the way spikelets or seed heads are arranged.";
    if (category.lane === "cryptogam") return "Use a close view. Shape, surface texture, spore structures, and the growing surface matter more than size.";
    if (category.lane === "fungus") return "Photograph or inspect the top, side, underside, full stalk base, and what it is growing from.";
    if (category.lane === "insect") return "Use a clear view of the head, thorax, abdomen, wings, legs, and antennae before relying on color.";

    return `Look for this as a visible ${categoryText} clue. Say what you can see before deciding what it means.`;
  }

  function inferCompare(label, category) {
    const parts = splitContrast(label);
    if (parts.length > 1) {
      const definedParts = definitionsForContrast(label).filter(row => row.definition);
      if (definedParts.length) {
        return `Decide which state fits best: ${definedParts.map(row => `${row.part} = ${row.definition}`).join("; ")}.`;
      }
      const joined = parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
      return `Compare ${joined}, then choose the closest visible state.`;
    }

    const text = String(label || "").toLowerCase();
    const direct = definitionForTerm(label);
    if (direct) return `Confirm it on more than one view when possible: ${label} means ${direct}.`;
    if (/gills/.test(text)) return "Compare with pores, teeth, folds, or a smooth underside.";
    if (/pores/.test(text)) return "Compare with true gills: pores look like holes, while gills look like plates.";
    if (/opposite|alternate|whorled/.test(text)) return "Compare leaf attachment at multiple stem nodes; one odd shoot can mislead you.";
    if (/lichen/.test(text)) return "Compare crustose, foliose, and fruticose forms before using color alone.";
    if (/moss|liverwort/.test(text)) return "Compare growth form and capsules; moisture can make small plants look very different.";
    if (/wing|antennae|legs|mouthparts/.test(text)) return "Compare the same body part across nearby insects, because posture can hide details.";
    return `Compare the ${lowerFirst(category?.title)} details that could be confused with ${lowerFirst(label)}. A field mark is stronger when several clues agree.`;
  }

  function inferCaution(label, category) {
    const text = String(`${label || ""} ${category?.title || ""}`).toLowerCase();
    if (/fung|mushroom|gill|pore|stalk|volva|spore/.test(text)) {
      return "This is an identification clue only, not an edibility or safety decision.";
    }
    if (/leaf/.test(text)) return "Check mature leaves and more than one branch; seedlings and new shoots can break the usual pattern.";
    if (/flower|fruit|seed/.test(text)) return "Season matters. The same plant may show this mark only briefly.";
    if (/moss|lichen|liverwort/.test(text)) return "Moisture, age, and substrate can change color and shape.";
    if (/insect|wing|antennae|legs|body/.test(text)) return "A photo angle can hide parts. Treat missing details as unknown, not absent.";
    return `If ${lowerFirst(label)} conflicts with another visible mark, record both and keep the ID broader.`;
  }

  function fieldNoteTarget(category) {
    if (category.key === "leaf_arrangement" || category.key === "leaf_shape" || category.key === "leaf_surface") return "leaf or stem node";
    if (category.key === "flowers") return "flower or flower cluster";
    if (category.key === "fruits") return "fruit, seed, or cone";
    if (category.key === "grass_like") return "stem, sheath, or seed head";
    if (category.lane === "cryptogam") return "frond, lichen body, moss patch, or substrate";
    if (category.lane === "fungus") return "cap, underside, stalk/base, or substrate";
    if (category.lane === "insect") return "body part, posture, or behavior";
    return "organism";
  }

  function inferSayIt(label, category) {
    const parts = definitionsForContrast(label).filter(row => row.definition);
    if (parts.length > 1) {
      return `Field note: choose the best state for ${lowerFirst(label)} (${parts.map(row => row.part).join(" / ")}), then note where you saw it.`;
    }
    return `Field note: "${label}" on the ${fieldNoteTarget(category)}; add location, count, color, or texture if it helps.`;
  }

  function buildInfoSheet(mark, category) {
    const directionLabels = (mark.signals || [])
      .map(signal => GROUPS[signal.group]?.label || signal.group)
      .filter(Boolean);
    const directions = [...new Set(directionLabels)].slice(0, 5);

    return {
      id: mark.id,
      title: mark.label,
      eyebrow: `${laneLabel(mark.lane)} / ${category.title}`,
      summary: inferSummary(mark.label, category),
      why: inferWhy(mark.label, category),
      lookFor: inferLookFor(mark.label, category),
      compare: inferCompare(mark.label, category),
      caution: inferCaution(mark.label, category),
      sayIt: inferSayIt(mark.label, category),
      schematic: buildSchematic(mark, category),
      codexStatus: "Codex link pending",
      directions
    };
  }

  function inferSignals(label, category) {
    const groups = new Set();
    if (category.lane === "plant") groups.add("plants");
    if (category.lane === "fungus") groups.add("fungi");
    if (category.lane === "insect") groups.add("insects");
    if (category.key.startsWith("fern_")) groups.add("ferns");
    if (category.key === "moss_liverworts") groups.add("mosses");
    if (category.key.startsWith("lichen_")) groups.add("lichens");
    if (category.key === "cryptogam_substrate") {
      groups.add("mosses");
      groups.add("lichens");
    }

    SIGNAL_RULES.forEach(rule => {
      if (rule.re.test(label)) {
        rule.groups.forEach(group => groups.add(group));
      }
    });

    return [...groups].map(group => ({ group, weight: group === "plants" || group === "insects" ? 1 : 2 }));
  }

  const FIELD_MARKS = CATEGORY_DEFS.flatMap(category => lines(category.raw).map((label, index) => {
    const id = slugify(label);
    const mark = {
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
    mark.infoSheet = buildInfoSheet(mark, category);
    return mark;
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

  function infoSheet(markOrId) {
    const mark = typeof markOrId === "string" ? get(markOrId) : markOrId;
    if (!mark) return null;
    return mark.infoSheet || buildInfoSheet(mark, CATEGORY_BY_KEY[mark.category] || { title: mark.categoryLabel || "Field marks" });
  }

  function infoSheets(options = {}) {
    const source = list().filter(mark => {
      if (options.lane && mark.lane !== options.lane) return false;
      if (options.category && mark.category !== options.category) return false;
      return true;
    });
    return source.map(mark => infoSheet(mark)).filter(Boolean);
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
    infoSheet,
    infoSheets,
    search,
    categories,
    suggestionsFor,
    nextQuizIndex,
    groups: GROUPS
  };
})();
