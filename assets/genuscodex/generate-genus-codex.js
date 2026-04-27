const fs = require("fs");
const path = require("path");

const SOURCE_DIR = "C:/Users/ad1470/Documents/GitHub/gridwild/assets/square_genera_superchunks";
const OUTPUT_DIR = process.cwd();
const BATCH_SIZE = 50;
const REVIEW_NOTE = "Genus-level account needs taxonomic review.";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const FIELD_MARKS_ALLOWED = new Set([
  "lobed_leaf",
  "serrated_margin",
  "opposite_leaves",
  "alternate_leaves",
  "palmate_leaf",
  "compound_leaf",
  "acorn",
  "samara",
  "catkin",
  "basal_rosette",
  "conical_bill",
  "hooked_bill",
  "short_tail",
  "streaked_breast",
  "eye_ring",
  "fuzzy_body",
  "pollen_basket",
  "wasp_waist",
  "elytra",
  "halteres",
  "scales_on_wings",
  "long_proboscis",
  "eyes_touching",
  "elongated_abdomen",
  "aquatic_nymph",
  "fruiting_body",
  "gills",
  "pores"
]);

const STINGING_FAMILIES = new Set([
  "Apidae",
  "Andrenidae",
  "Halictidae",
  "Megachilidae",
  "Vespidae",
  "Crabronidae",
  "Sphecidae",
  "Pompilidae",
  "Tiphiidae",
  "Formicidae"
]);

const GENUS_OVERRIDES = {
  Acer: {
    common: "Maples",
    badge: "Season Shaper",
    fieldMarks: ["opposite_leaves", "palmate_leaf", "samara"],
    notableMembers: ["Red Maple (Acer rubrum)."]
  },
  Anax: {
    common: "Darners",
    badge: "Sky Predator",
    fieldMarks: ["eyes_touching", "elongated_abdomen", "aquatic_nymph"],
    notableMembers: ["Common Green Darner (Anax junius)."]
  },
  Bombus: {
    common: "Bumble Bees",
    badge: "Velvet Engine",
    fieldMarks: ["fuzzy_body", "pollen_basket"],
    notableMembers: ["Common Eastern Bumble Bee (Bombus impatiens)."]
  },
  Carex: {
    common: "Sedges",
    badge: "Wetland Cipher",
    fieldMarks: ["alternate_leaves"]
  },
  Liriodendron: {
    common: "Tulip Trees",
    badge: "Canopy Tower",
    fieldMarks: ["alternate_leaves"],
    notableMembers: ["Tuliptree (Liriodendron tulipifera)."]
  },
  Passer: {
    common: "True Sparrows",
    badge: "Urban Survivor",
    fieldMarks: ["conical_bill", "short_tail"],
    notableMembers: ["House Sparrow (Passer domesticus)."]
  },
  Plantago: {
    common: "Plantains",
    badge: "Footpath Specialist",
    fieldMarks: ["basal_rosette"]
  },
  Platanus: {
    common: "Sycamores",
    badge: "River Giant",
    fieldMarks: ["palmate_leaf", "alternate_leaves"],
    notableMembers: ["American Sycamore (Platanus occidentalis)."]
  },
  Quercus: {
    common: "Oaks",
    badge: "Keystone Tree",
    fieldMarks: ["lobed_leaf", "acorn", "alternate_leaves"],
    notableMembers: ["White Oak (Quercus alba)."]
  },
  Rosa: {
    common: "Roses",
    badge: "Prickled Bloom",
    fieldMarks: ["compound_leaf", "serrated_margin"]
  },
  Rubus: {
    common: "Blackberries and Raspberries",
    badge: "Thorn Maze",
    fieldMarks: ["compound_leaf", "serrated_margin"]
  },
  Solidago: {
    common: "Goldenrods",
    badge: "Late-Summer Flame",
    fieldMarks: ["alternate_leaves"]
  },
  Symphyotrichum: {
    common: "American Asters",
    badge: "Autumn Star",
    fieldMarks: ["alternate_leaves"]
  },
  Taraxacum: {
    common: "Dandelions",
    badge: "Sidewalk Sun",
    fieldMarks: ["basal_rosette", "serrated_margin"]
  },
  Trifolium: {
    common: "Clovers",
    badge: "Luck Engine",
    fieldMarks: ["compound_leaf"]
  }
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pickFrom(list, seed, offset = 0) {
  return list[(seed + offset) % list.length];
}

function createLineage(genus, iconic, order, family) {
  return {
    genus,
    iconic,
    order,
    family,
    observationCount: 0,
    squareCount: 0,
    monthCounts: Array(12).fill(0)
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: null,
    batchSize: BATCH_SIZE
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--limit" && args[i + 1]) {
      options.limit = Number(args[i + 1]);
      i += 1;
    } else if (arg === "--batch-size" && args[i + 1]) {
      options.batchSize = Number(args[i + 1]);
      i += 1;
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 25 || options.batchSize > 50) {
    throw new Error("Batch size must be an integer between 25 and 50.");
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("Limit must be a positive integer.");
  }

  return options;
}

function readSourceData() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => name.startsWith("super") && name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const byGenus = new Map();

  for (const fileName of files) {
    const filePath = path.join(SOURCE_DIR, fileName);
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const square of Object.values(payload.squares || {})) {
      const genera = square.genera || {};
      const genus = genera.genus_name;
      if (!genus) {
        continue;
      }

      const iconic = genera.iconic_taxon_name || "";
      const order = genera.order_name || "";
      const family = genera.family_name || "";
      const count = Number(genera.count) || 0;
      const monthCounts = Array.isArray(genera.month_counts) ? genera.month_counts : [];
      const signature = `${iconic}||${order}||${family}`;

      if (!byGenus.has(genus)) {
        byGenus.set(genus, new Map());
      }
      const lineageMap = byGenus.get(genus);
      if (!lineageMap.has(signature)) {
        lineageMap.set(signature, createLineage(genus, iconic, order, family));
      }
      const lineage = lineageMap.get(signature);
      lineage.observationCount += count;
      lineage.squareCount += 1;
      for (let i = 0; i < 12; i += 1) {
        lineage.monthCounts[i] += Number(monthCounts[i]) || 0;
      }
    }
  }

  return byGenus;
}

function isMeaningfulLineage(lineage) {
  return Boolean(lineage.iconic || lineage.order || lineage.family);
}

function choosePrimaryLineage(lineages) {
  const sorted = [...lineages].sort((left, right) => {
    const leftQuality = Number(isMeaningfulLineage(left));
    const rightQuality = Number(isMeaningfulLineage(right));
    return (
      rightQuality - leftQuality ||
      right.observationCount - left.observationCount ||
      right.squareCount - left.squareCount ||
      left.family.localeCompare(right.family) ||
      left.order.localeCompare(right.order)
    );
  });
  return sorted[0];
}

function monthPeakText(monthCounts) {
  const pairs = monthCounts
    .map((count, index) => ({ count, index }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .slice(0, 2);

  if (pairs.length === 0) {
    return "Seasonality is unclear in source records.";
  }
  if (pairs.length === 1) {
    return `Source observations peak in ${MONTH_NAMES[pairs[0].index]}.`;
  }
  return `Source observations peak in ${MONTH_NAMES[pairs[0].index]} and ${MONTH_NAMES[pairs[1].index]}.`;
}

function classify(lineage) {
  const iconic = lineage.iconic;
  if (iconic === "Plantae") return "plant";
  if (iconic === "Aves") return "bird";
  if (iconic === "Insecta") return "insect";
  if (iconic === "Fungi") return "fungus";
  if (iconic === "Arachnida") return "arachnid";
  if (iconic === "Mammalia") return "mammal";
  if (iconic === "Reptilia") return "reptile";
  if (iconic === "Amphibia") return "amphibian";
  if (iconic === "Actinopterygii") return "fish";
  if (iconic === "Mollusca") return "mollusk";
  if (iconic === "Protozoa") return "protist";
  if (iconic === "Chromista") return "chromist";
  return "generic";
}

function buildBadge(genus, category) {
  const seed = hashString(`${genus}:${category}`);
  const badges = {
    plant: [
      "Leaf Signal",
      "Seed Marker",
      "Trail Architect",
      "Season Anchor",
      "Canopy Clue",
      "Root Thread",
      "Verge Keeper",
      "Bark Cipher"
    ],
    bird: [
      "Sky Caller",
      "Branch Scout",
      "Flight Note",
      "Dawn Witness",
      "Wing Signal",
      "Hedge Watcher",
      "Reed Caller",
      "Canopy Glimpse"
    ],
    insect: [
      "Wing Scout",
      "Nectar Runner",
      "Bark Crawler",
      "Flower Patrol",
      "Warm-Season Flash",
      "Leaf Tracker",
      "Air Thread",
      "Field Spark"
    ],
    fungus: [
      "Spore Lantern",
      "Log Reader",
      "Forest Texture",
      "Rain Signal",
      "Woodland Flush",
      "Cap Cipher",
      "Substrate Scout",
      "Pore Ledger"
    ],
    arachnid: [
      "Silk Clue",
      "Wall Runner",
      "Web Signal",
      "Leaf Lurker",
      "Shadow Hunter",
      "Branch Watcher",
      "Night Patrol",
      "Stillness Expert"
    ],
    mammal: [
      "Track Maker",
      "Dusk Walker",
      "Trail Shadow",
      "Den Scout",
      "Range Roamer",
      "Field Mammal",
      "Quiet Sign",
      "Habitat Reader"
    ],
    reptile: [
      "Sun Bather",
      "Scale Signal",
      "Edge Basking",
      "Stone Watcher",
      "Marsh Glider",
      "Dry-Ground Scout",
      "Heat Seeker",
      "Bank Crawler"
    ],
    amphibian: [
      "Rain Caller",
      "Pond Signal",
      "Wetland Pulse",
      "Night Chorus",
      "Creek Clue",
      "Spring Voice",
      "Pool Watcher",
      "Leaf-Litter Leap"
    ],
    fish: [
      "Current Reader",
      "Fin Signal",
      "Water Thread",
      "Stream Shape",
      "Pool Watcher",
      "Shoreline Flash",
      "Channel Scout",
      "Deep Turn"
    ],
    mollusk: [
      "Shell Trace",
      "Moisture Marker",
      "Slow Traveler",
      "Cover Seeker",
      "Substrate Sign",
      "Soft-Trail Clue",
      "Shade Dweller",
      "Surface Reader"
    ],
    protist: [
      "Microscope Clue",
      "Moist Film",
      "Pattern Trace",
      "Small-Scale Signal",
      "Culture Watch",
      "Wet-Surface Form",
      "Microworld Marker",
      "Fine Detail"
    ],
    chromist: [
      "Surface Film",
      "Water Pattern",
      "Microscope Thread",
      "Wet-Edge Clue",
      "Color Sheen",
      "Cell Drift",
      "Fine Texture",
      "Culture Signal"
    ],
    generic: [
      "Field Placeholder",
      "Taxon Marker",
      "Source Match",
      "Record Anchor",
      "Review Candidate",
      "Dataset Clue",
      "Broad Outline",
      "Genus Signal"
    ]
  };
  return pickFrom(badges[category] || badges.generic, seed);
}

function buildLore(lineage, category, batchIndex) {
  const genus = lineage.genus;
  const family = lineage.family;
  const order = lineage.order;
  const seed = hashString(`${genus}:${family}:${order}:${batchIndex}`);

  const templates = {
    plant: [
      () => `${genus} rewards a slower look, where leaves and structure carry the story.`,
      () => `On a trail edge, ${genus} can turn ordinary green into a real clue.`,
      () => `${genus} often makes its best impression through shape before color.`,
      () => `${genus} can make a roadside, hedge, or thicket feel suddenly more legible.`,
      () => `Leaves usually introduce ${genus}, but season often finishes the identification.`,
      () => `A patch of ${genus} can teach patience better than any signpost.`,
      () => `${genus} tends to reward people who notice structure before spectacle.`,
      () => `In the field, ${genus} often settles in through repeated small clues.`,
      () => `${genus} can change the whole tone of a verge, woods edge, or streambank.`,
      () => `The appeal of ${genus} is often architectural long before it becomes floral.`,
      () => `${genus} rarely asks for drama; it asks for a better look.`,
      () => `${genus} often meets the eye first as a silhouette, then as a pattern.`
    ],
    bird: [
      () => `${genus} often announces itself by posture before color settles the question.`,
      () => `Listen first; ${genus} may give itself away before it fully appears.`,
      () => `A quick silhouette of ${genus} can sharpen an entire morning walk.`,
      () => `${genus} often becomes memorable through motion before markings fall into place.`,
      () => `The field character of ${genus} usually begins with shape, stance, and rhythm.`,
      () => `${genus} can turn one call note into a complete shift of attention.`,
      () => `When ${genus} appears, posture and pace often tell the first half.`,
      () => `${genus} gives the landscape a voice as much as a silhouette.`,
      () => `A glimpse of ${genus} can make sky, branch, or marsh feel newly specific.`,
      () => `${genus} often rewards watchers who notice behavior before plumage.`,
      () => `The first clue to ${genus} may be where it chooses to stand.`,
      () => `${genus} tends to arrive as a pattern of movement, then a bird.`
    ],
    insect: [
      () => `${genus} makes small movements feel important once your eyes lock on.`,
      () => `Wing shape and behavior give ${genus} much of its field personality.`,
      () => `Warm light and patient watching often bring ${genus} into focus.`,
      () => `${genus} often appears as a gesture first and an identity second.`,
      () => `A flower head, bark seam, or lighted wall can suddenly belong to ${genus}.`,
      () => `${genus} rewards field notes that capture behavior as carefully as pattern.`,
      () => `${genus} often makes its case through timing, angle, and movement.`,
      () => `The charm of ${genus} usually begins when attention drops to finer scale.`,
      () => `${genus} can make an ordinary patch of habitat feel newly active.`,
      () => `A brief landing is sometimes all ${genus} offers before the puzzle begins.`,
      () => `${genus} becomes easier once motion and structure are read together.`,
      () => `${genus} often turns patient watching into the best identification tool.`
    ],
    fungus: [
      () => `${genus} asks you to read texture, moisture, and substrate all at once.`,
      () => `A flush of ${genus} can redraw a log or lawn overnight.`,
      () => `With ${genus}, the underside often matters as much as the cap.`,
      () => `${genus} often looks different by afternoon than it did at breakfast.`,
      () => `A damp spell can make ${genus} feel like a sudden punctuation mark.`,
      () => `${genus} usually rewards the observer who checks beneath, around, and underfoot.`,
      () => `Texture is often the first useful language for meeting ${genus}.`,
      () => `${genus} can turn a stump, mulch bed, or branch into a field lesson.`,
      () => `${genus} often asks for the whole scene, not just the fruiting body.`,
      () => `Light, age, and weather can make ${genus} feel newly different each visit.`,
      () => `${genus} tends to reward observers who notice what it is growing from.`,
      () => `The best clue to ${genus} may sit below the cap rather than above it.`
    ],
    arachnid: [
      () => `${genus} works best as a study in posture, patience, and sudden motion.`,
      () => `A web, a wall, or a leaf edge can become a stage for ${genus}.`,
      () => `${genus} turns stillness into one of its sharpest field marks.`,
      () => `${genus} often reads like a small lesson in angle and intent.`,
      () => `A careful look at ${genus} can make ordinary surfaces feel occupied.`,
      () => `${genus} tends to reveal itself through stance before pattern.`,
      () => `The presence of ${genus} often becomes obvious only after a pause.`,
      () => `${genus} can make a corner, stem, or web line suddenly important.`,
      () => `${genus} often rewards observers who notice where waiting happens.`,
      () => `With ${genus}, field character usually begins in outline rather than color.`,
      () => `${genus} gives a quiet surface just enough tension to be memorable.`,
      () => `${genus} often feels more architectural than decorative in the field.`
    ],
    mammal: [
      () => `${genus} is often known by the sign it leaves before the animal appears.`,
      () => `Tracks, posture, and movement give ${genus} much of its field character.`,
      () => `${genus} can make a familiar landscape feel newly inhabited.`,
      () => `${genus} often enters the story through motion, shadow, or feeding sign.`,
      () => `A brief look at ${genus} can linger longer than a full direct view.`,
      () => `${genus} tends to be read as much from context as from anatomy.`,
      () => `The field presence of ${genus} often begins at the edge of certainty.`,
      () => `${genus} can leave a trail of clues before it offers a full appearance.`,
      () => `Watching ${genus} often means reading habitat and behavior at the same time.`,
      () => `${genus} gives ordinary paths and clearings a sense of active use.`,
      () => `${genus} often feels larger in sign than in the moment of sighting.`,
      () => `${genus} can turn dusk, brush, or shoreline into a sharper scene.`
    ],
    reptile: [
      () => `${genus} often looks most convincing when heat and habitat line up together.`,
      () => `A basking pose can tell the story of ${genus} before details do.`,
      () => `${genus} brings quiet geometry to banks, stones, and open ground.`,
      () => `${genus} often resolves into place through posture more than pattern.`,
      () => `Sun, shade, and surface choice can say a lot about ${genus}.`,
      () => `${genus} makes stillness feel deliberate in the middle of warm habitat.`,
      () => `The best first clue to ${genus} is often how it occupies space.`,
      () => `${genus} can turn a log, wall, or shoreline into a waiting place.`,
      () => `${genus} often asks the observer to read movement in short, careful bursts.`,
      () => `${genus} gives dry ground and open edges a more watchful feeling.`,
      () => `A moment with ${genus} often begins with light reflecting off form.`,
      () => `${genus} tends to stand out when weather and substrate agree.`
    ],
    amphibian: [
      () => `${genus} belongs to damp edges where weather and timing change everything.`,
      () => `Many moments with ${genus} begin with sound, moisture, or movement.`,
      () => `${genus} can make a small pool feel suddenly alive with clues.`,
      () => `${genus} often appears when the ground and air finally cooperate.`,
      () => `A wet night or flooded margin can suddenly feel tuned to ${genus}.`,
      () => `${genus} tends to reveal itself through season and sound together.`,
      () => `${genus} can make a ditch, seep, or pond edge feel newly inhabited.`,
      () => `The story of ${genus} often starts with weather before it starts with sight.`,
      () => `${genus} rewards observers who watch where moisture lingers longest.`,
      () => `${genus} often turns a quiet chorus or rustle into the main event.`,
      () => `${genus} can make small water feel like the center of the landscape.`,
      () => `${genus} usually arrives with timing that feels almost exact.`
    ],
    fish: [
      () => `${genus} is easiest to read when shape, water, and motion align.`,
      () => `A brief flash of ${genus} can change how a stream is read.`,
      () => `${genus} often hides its best clues in profile rather than color.`,
      () => `${genus} can make current itself feel like part of the field mark.`,
      () => `A clean view of ${genus} often lasts only a second and still teaches plenty.`,
      () => `${genus} rewards observers who notice where the water slows or turns.`,
      () => `${genus} often becomes legible when body shape and habitat are read together.`,
      () => `${genus} can turn an ordinary pool or riffle into a closer study.`,
      () => `The presence of ${genus} often shows up first as movement against flow.`,
      () => `${genus} tends to make the water column feel more structured.`,
      () => `${genus} often asks for a side view before the pattern means much.`,
      () => `A moment with ${genus} usually depends on angle, clarity, and patience.`
    ],
    mollusk: [
      () => `${genus} rewards close attention to texture, moisture, and where it settles.`,
      () => `A shell, a trail, or a damp hiding place can frame ${genus}.`,
      () => `${genus} makes slow movement feel like a very precise signal.`,
      () => `${genus} often turns shade and surface into the real field marks.`,
      () => `The presence of ${genus} can make a log, stone, or stem worth lingering over.`,
      () => `${genus} tends to reveal itself through substrate as much as silhouette.`,
      () => `${genus} can make moisture feel visible even before the animal appears.`,
      () => `A careful look at ${genus} often begins with where it is resting.`,
      () => `${genus} often rewards observers who think in surfaces and shelter.`,
      () => `${genus} gives slow travel a crisp, readable shape in the field.`,
      () => `${genus} can make one damp corner feel unexpectedly rich in detail.`,
      () => `${genus} often becomes memorable through texture before size.`
    ],
    protist: [
      () => `${genus} asks for patience, magnification, and respect for fine detail.`,
      () => `With ${genus}, the real drama sits in pattern, shape, and context.`,
      () => `${genus} turns careful looking into the whole field experience.`,
      () => `${genus} often feels legible only when the observer slows all the way down.`,
      () => `A useful encounter with ${genus} usually begins at the microscope scale.`,
      () => `${genus} makes texture and form carry more weight than spectacle.`,
      () => `${genus} often rewards curiosity that stays disciplined about detail.`,
      () => `The interest of ${genus} lives in structure that reveals itself gradually.`,
      () => `${genus} can make a wet film or culture sample feel surprisingly eventful.`,
      () => `${genus} asks the observer to trust pattern more than first impressions.`,
      () => `${genus} often turns a tiny field of view into the whole landscape.`,
      () => `${genus} is a reminder that close looking can be its own adventure.`
    ],
    chromist: [
      () => `${genus} is best read through texture, water, and close visual context.`,
      () => `A thin film or subtle bloom can be the calling card of ${genus}.`,
      () => `${genus} rewards curiosity that stays focused on structure and setting.`,
      () => `${genus} often becomes meaningful only after the eye adjusts to subtlety.`,
      () => `A useful look at ${genus} usually depends on surface, sheen, and scale.`,
      () => `${genus} turns small variations in water or substrate into usable clues.`,
      () => `${genus} often asks for patience before pattern starts to hold.`,
      () => `${genus} can make a faint layer or stain feel taxonomically important.`,
      () => `${genus} rewards observers who keep context in view as they zoom in.`,
      () => `The field character of ${genus} often lives in structure more than color.`,
      () => `${genus} can make a small patch of moisture feel unexpectedly specific.`,
      () => `${genus} often turns understatement into its own kind of signal.`
    ],
    generic: [
      () => `${genus} is safest treated as a broad field clue before a precise identity.`,
      () => `This account for ${genus} stays cautious while the taxonomy does the talking.`,
      () => `${genus} works here as a useful handle for observation, not certainty.`,
      () => `${genus} is presented here with care while the finer taxonomy stays open.`,
      () => `For now, ${genus} works best as a stable label rather than a finished story.`,
      () => `${genus} is most useful here as a cautious anchor for field notes.`,
      () => `${genus} asks for restraint until better taxonomic detail is available.`,
      () => `This entry keeps ${genus} broad enough to stay honest and usable.`,
      () => `${genus} is treated here as a careful placeholder with field value.`,
      () => `Until the taxonomy tightens, ${genus} remains a practical but broad clue.`,
      () => `${genus} is safest read here as a starting point instead of a finish.`,
      () => `${genus} keeps its footing in the dataset even where detail stays thin.`
    ]
  };

  const selectedTemplates = templates[category] || templates.generic;
  const lore = [];
  const usedIndexes = new Set();
  let salt = 0;
  while (lore.length < 3) {
    let cursor = ((seed >>> (lore.length * 7)) + salt * 11 + batchIndex) % selectedTemplates.length;
    while (usedIndexes.has(cursor)) {
      cursor = (cursor + 1) % selectedTemplates.length;
    }
    if (!usedIndexes.has(cursor)) {
      lore.push(selectedTemplates[cursor]());
      usedIndexes.add(cursor);
    }
    salt += 1;
  }
  return lore;
}

function buildFieldMarks(lineage, category, override) {
  if (override?.fieldMarks) {
    return override.fieldMarks.filter((mark) => FIELD_MARKS_ALLOWED.has(mark));
  }

  const marks = new Set();
  const { genus, order, family } = lineage;

  if (category === "fungus") {
    if (["Agaricales", "Russulales"].includes(order)) {
      marks.add("fruiting_body");
      marks.add("gills");
    } else if (["Boletales", "Polyporales", "Hymenochaetales", "Phallales"].includes(order)) {
      marks.add("fruiting_body");
      if (order !== "Phallales") {
        marks.add("pores");
      }
    } else if (["Pezizales", "Auriculariales", "Cantharellales", "Gomphales"].includes(order)) {
      marks.add("fruiting_body");
    }
  }

  if (category === "insect") {
    if (order === "Coleoptera") marks.add("elytra");
    if (order === "Diptera") marks.add("halteres");
    if (order === "Lepidoptera") marks.add("scales_on_wings");
    if (order === "Odonata") {
      marks.add("elongated_abdomen");
      marks.add("aquatic_nymph");
      if (["Aeshnidae", "Libellulidae", "Corduliidae"].includes(family)) {
        marks.add("eyes_touching");
      }
    }
    if (order === "Hymenoptera") {
      if (["Apidae", "Andrenidae", "Halictidae"].includes(family)) marks.add("fuzzy_body");
      if (["Apidae", "Halictidae"].includes(family)) marks.add("pollen_basket");
      if (["Vespidae", "Crabronidae", "Sphecidae", "Pompilidae", "Tiphiidae"].includes(family)) {
        marks.add("wasp_waist");
      }
    }
    if (genus === "Xylocopa") {
      marks.add("fuzzy_body");
    }
  }

  if (category === "bird") {
    if (["Accipitriformes", "Falconiformes", "Strigiformes"].includes(order)) {
      marks.add("hooked_bill");
    }
    if (["Passeridae", "Fringillidae"].includes(family)) {
      marks.add("conical_bill");
    }
    if (family === "Troglodytidae") {
      marks.add("short_tail");
    }
  }

  return [...marks].filter((mark) => FIELD_MARKS_ALLOWED.has(mark));
}

function factPrefix(lineage) {
  return {
    familyFact: `Placed in the family ${lineage.family} in source data.`,
    orderFact: `Source records place ${lineage.genus} in the order ${lineage.order}.`,
    obsFact: `The source dataset includes ${pluralize(lineage.observationCount, "genus-level observation")}.`,
    squareFact: `Source records cover ${pluralize(lineage.squareCount, "mapped square")}.`,
    seasonFact: monthPeakText(lineage.monthCounts)
  };
}

function buildFacts(lineage, category) {
  const { familyFact, orderFact, obsFact, squareFact, seasonFact } = factPrefix(lineage);
  const stinging = lineage.order === "Hymenoptera" || STINGING_FAMILIES.has(lineage.family);

  const facts = {
    plant: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Use leaves, flowers, fruit, and overall growth habit together.",
      "For woody species, bark can help; for others, lean on fresh vegetative details.",
      "Habitat can vary across species and region within the genus.",
      "Flowering or fruiting timing often narrows an identification.",
      "Species-level identification may require close views or technical keys."
    ],
    bird: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Watch bill shape, posture, habitat, and season together.",
      "Voice is often one of the quickest clues to this genus.",
      "Flocking style and feeding height can help narrow options.",
      "Plumage may shift with age, sex, molt, or season.",
      "Species-level identification may require close views, sound, or multiple field marks."
    ],
    insect: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Check body shape, wings, antennae, and leg proportions together.",
      "Host plants or larval food can be useful when known.",
      "Behavior at flowers, bark, lights, or water often helps.",
      stinging ? "Observe respectfully; some can sting." : "Season, habitat, and behavior often matter as much as pattern.",
      "Species-level identification may require close inspection or photographs."
    ],
    fungus: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Look at cap shape, the underside, and the surface it grows from.",
      "Moisture and age can quickly change color, texture, and outline.",
      "Many fungi need close inspection or microscopy for reliable species-level ID.",
      "Habitat and fruiting form can vary across species in the genus.",
      "Never eat based on app identification."
    ],
    arachnid: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Leg posture, web style, and resting shape can all matter.",
      "Some genera are easier to place by behavior than by color alone.",
      "Habitat can narrow options: leaf litter, bark, flowers, walls, or water edges.",
      "Close photos of eyes, abdomen, or webs may be needed.",
      "Species-level identification may require microscopic or very close views."
    ],
    mammal: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Tracks, scat, posture, and feeding sign can be as useful as direct views.",
      "Activity time and habitat help narrow likely members of the genus.",
      "Juveniles and seasonal coats can shift overall appearance.",
      "Voice, gait, and tail use may provide extra clues when visible.",
      "Species-level identification may require range, behavior, and close comparison."
    ],
    reptile: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Scale pattern, body shape, and habitat work better together than color alone.",
      "Basking behavior and movement style can be useful field clues.",
      "Juveniles may look different from adults in tone or pattern.",
      "Safe viewing is best; keep distance and avoid handling wildlife.",
      "Species-level identification may require close pattern or scale details."
    ],
    amphibian: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Moisture, breeding season, and habitat strongly affect where this genus is found.",
      "Body build, toe shape, and skin texture can help narrow an ID.",
      "Calls are often as important as looks for frogs and toads.",
      "Larval and adult stages can occupy different microhabitats.",
      "Species-level identification may require close views or sound."
    ],
    fish: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Body shape, fin placement, and habitat are key first clues.",
      "Water type and current can narrow likely members of the genus.",
      "Breeding colors or juvenile patterns may differ from routine appearance.",
      "Views from above can miss traits needed for species-level ID.",
      "Species-level identification may require close inspection or location context."
    ],
    mollusk: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "Shell shape, surface texture, and habitat are often the starting clues.",
      "Moisture, substrate, and cover objects can strongly affect where it appears.",
      "Soft-body features may matter as much as shell traits in some groups.",
      "Close views are often needed for reliable species-level identification.",
      "Habitat and form vary across species in the genus."
    ],
    protist: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "The source data supports this genus, but field cues stay broad here.",
      "Microscopic shape, texture, and substrate may all matter together.",
      "Close inspection is often needed for reliable placement.",
      "Use the family and order context above as the safest starting point.",
      "Source taxonomy should be reviewed before adding richer copy."
    ],
    chromist: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "The source data supports this genus, but field cues stay broad here.",
      "Color, texture, water context, and shape may all matter together.",
      "Close inspection is often needed for reliable placement.",
      "Use the family and order context above as the safest starting point.",
      "Source taxonomy should be reviewed before adding richer copy."
    ],
    generic: [
      familyFact,
      orderFact,
      obsFact,
      squareFact,
      seasonFact,
      "The source data supports this genus, but field cues stay broad here.",
      "Habitat and structure can vary across species in the genus.",
      "Close inspection may be needed for reliable placement.",
      "Use the family and order context above as the safest starting point.",
      "Source taxonomy should be reviewed before adding richer copy."
    ]
  };

  return facts[category] || facts.generic;
}

function buildReviewFlag(genus, lineages, primary) {
  return {
    genus,
    primary: {
      iconic: primary.iconic,
      order: primary.order,
      family: primary.family,
      observationCount: primary.observationCount,
      squareCount: primary.squareCount
    },
    alternates: lineages
      .filter((lineage) => lineage !== primary)
      .map((lineage) => ({
        iconic: lineage.iconic,
        order: lineage.order,
        family: lineage.family,
        observationCount: lineage.observationCount,
        squareCount: lineage.squareCount
      }))
  };
}

function buildEntry(lineage, category, reviewNeeded, batchIndex) {
  const override = GENUS_OVERRIDES[lineage.genus];
  return {
    genus: lineage.genus,
    common: override?.common || "",
    family: lineage.family || "",
    badge: override?.badge || buildBadge(lineage.genus, category),
    fieldMarks: buildFieldMarks(lineage, category, override),
    thumbUrl: "",
    lore: buildLore(lineage, category, batchIndex),
    facts: buildFacts(lineage, category),
    notableMembers: override?.notableMembers || [],
    notes: reviewNeeded ? REVIEW_NOTE : ""
  };
}

function countSentences(text) {
  const matches = text.match(/[.!?](?=\s|$)/g);
  return matches ? matches.length : 0;
}

function validateBatch(batchObject) {
  const keys = Object.keys(batchObject);
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
  const loreSet = new Set();

  if (JSON.stringify(keys) !== JSON.stringify(sortedKeys)) {
    throw new Error("Top-level keys are not sorted alphabetically.");
  }

  const serialized = JSON.stringify(batchObject, null, 2);
  JSON.parse(serialized);

  for (const genus of keys) {
    const entry = batchObject[genus];
    const expectedKeys = [
      "genus",
      "common",
      "family",
      "badge",
      "fieldMarks",
      "thumbUrl",
      "lore",
      "facts",
      "notableMembers",
      "notes"
    ];
    if (JSON.stringify(Object.keys(entry)) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Schema mismatch for ${genus}.`);
    }
    if (entry.genus !== genus) {
      throw new Error(`Genus mismatch for ${genus}.`);
    }
    if (!Array.isArray(entry.lore) || entry.lore.length !== 3) {
      throw new Error(`Lore count failed for ${genus}.`);
    }
    for (const sentence of entry.lore) {
      if (countSentences(sentence) !== 1) {
        throw new Error(`Lore sentence count failed for ${genus}.`);
      }
      if (loreSet.has(sentence)) {
        throw new Error(`Duplicate lore sentence found in batch: ${sentence}`);
      }
      loreSet.add(sentence);
    }
    if (!Array.isArray(entry.facts) || entry.facts.length < 8) {
      throw new Error(`Fact count failed for ${genus}.`);
    }
    if (!Array.isArray(entry.fieldMarks) || entry.fieldMarks.some((mark) => !FIELD_MARKS_ALLOWED.has(mark))) {
      throw new Error(`Unsupported field mark found for ${genus}.`);
    }
    if (entry.thumbUrl !== "") {
      throw new Error(`thumbUrl must be empty for ${genus}.`);
    }
    if (!Array.isArray(entry.notableMembers)) {
      throw new Error(`notableMembers must be an array for ${genus}.`);
    }
  }
}

function formatBatchFileName(index) {
  return `genus-codex-batch-${String(index).padStart(3, "0")}.json`;
}

function main() {
  const options = parseArgs();
  const byGenus = readSourceData();

  const genera = [...byGenus.keys()].sort((a, b) => a.localeCompare(b));
  const selectedGenera = options.limit === null ? genera : genera.slice(0, options.limit);

  const reviewFlags = [];
  const batchReports = [];

  let batchNumber = 1;
  for (let offset = 0; offset < selectedGenera.length; offset += options.batchSize) {
    const batchGenera = selectedGenera.slice(offset, offset + options.batchSize);
    const batchObject = {};

    for (const genus of batchGenera) {
      const lineageEntries = [...byGenus.get(genus).values()];
      const primary = choosePrimaryLineage(lineageEntries);
      const meaningfulLineages = lineageEntries.filter(isMeaningfulLineage);
      const reviewNeeded = genus === "Unknown" || meaningfulLineages.length > 1;
      const category = classify(primary);
      const entry = buildEntry(primary, category, reviewNeeded, batchNumber);
      batchObject[genus] = entry;

      if (reviewNeeded) {
        reviewFlags.push(buildReviewFlag(genus, meaningfulLineages, primary));
      }
    }

    const sortedBatchObject = {};
    for (const genus of Object.keys(batchObject).sort((a, b) => a.localeCompare(b))) {
      sortedBatchObject[genus] = batchObject[genus];
    }

    validateBatch(sortedBatchObject);

    const fileName = formatBatchFileName(batchNumber);
    const outputPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(outputPath, JSON.stringify(sortedBatchObject, null, 2));

    batchReports.push({
      batch: batchNumber,
      file: outputPath,
      genusCount: batchGenera.length,
      validationPassed: true
    });
    batchNumber += 1;
  }

  const manifestPath = path.join(OUTPUT_DIR, "genus-codex-manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        sourceDir: SOURCE_DIR,
        totalGeneraProcessed: selectedGenera.length,
        batchSize: options.batchSize,
        batchCount: batchReports.length,
        validationPassed: true,
        reviewFlagCount: reviewFlags.length,
        batchFiles: batchReports
      },
      null,
      2
    )
  );

  const reviewPath = path.join(OUTPUT_DIR, "genus-codex-review-flags.json");
  fs.writeFileSync(reviewPath, JSON.stringify(reviewFlags, null, 2));

  console.log(
    JSON.stringify(
      {
        totalGeneraProcessed: selectedGenera.length,
        batchCount: batchReports.length,
        validationPassed: true,
        manifestPath,
        reviewPath
      },
      null,
      2
    )
  );
}

main();
