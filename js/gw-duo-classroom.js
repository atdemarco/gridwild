// -----------------------------------------------------------------------------
// GridWild Duo Classroom
// A child-facing, map-world learning path for broad fieldmark recognition.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_duo_classroom_progress_v1";

  const TIER_THRESHOLDS = [
    { key: "bronze", label: "Bronze", correct: 10, accuracy: 0.7 },
    { key: "silver", label: "Silver", correct: 25, accuracy: 0.8 },
    { key: "gold", label: "Gold", correct: 50, accuracy: 0.9 },
    { key: "field_ready", label: "Field Ready", correct: 65, accuracy: 0.9, fieldReady: true }
  ];

  const VISUAL_LABELS = {
    plant: "Plant",
    fungus: "Fungus",
    insect: "Insect",
    arachnid: "Arachnid",
    bird: "Bird",
    mammal: "Mammal",
    herp: "Herp",
    habitat: "Habitat",
    whole: "Whole",
    close: "Close",
    underside: "Underside",
    side: "Side",
    base: "Base",
    cap_mushroom: "Cap",
    shelf_fungus: "Shelf",
    puffball: "Puff",
    coral_fungus: "Coral",
    jelly_fungus: "Jelly",
    cup_fungus: "Cup",
    gills: "Pages",
    pores: "Holes",
    teeth: "Teeth",
    folds: "Wrinkles",
    smooth: "Smooth",
    beetle: "Beetle",
    fly: "Fly",
    butterfly: "Moth",
    bee_wasp_ant: "Bee",
    true_bug: "Bug",
    grasshopper: "Hopper",
    dragonfly: "Dragon",
    hard_wings: "Hard wings",
    scaly_wings: "Scales",
    one_pair_wings: "One pair",
    clear_wings: "Clear",
    half_hard_wings: "Half-hard",
    spider: "Spider",
    harvestman: "Harvestman",
    tick_mite: "Tick",
    scorpion_like: "Scorpion",
    two_blobs: "Two blobs",
    one_blob: "One blob",
    eight_legs: "Eight legs",
    six_legs: "Six legs",
    no_antennae: "No antennae",
    tree: "Tree",
    shrub: "Shrub",
    vine: "Vine",
    wildflower: "Flower",
    grass: "Grass",
    fern: "Fern",
    moss: "Moss",
    opposite_leaves: "Leaf pairs",
    alternate_leaves: "Taking turns",
    whorled_leaves: "Whorl",
    basal_rosette: "Rosette",
    next_photo: "Photo clue"
  };

  function c(id, label, visual, sub = "") {
    return { id, label, visual, sub };
  }

  const TRACKS = [
    {
      id: "universal",
      name: "Universal Explorer",
      shortName: "Universal",
      region: "Trailhead clearing",
      accent: "#79e38e",
      summary: "Start with the whole living thing, where it is, and what photo helps next.",
      lessons: [
        {
          id: "shape_spotter",
          title: "Shape Spotter",
          achievementId: "shape_spotter",
          achievementName: "Shape Spotter",
          fieldmarkFamily: "broad shapes",
          hiddenSkills: [
            "universal.shape.plant_vs_fungus",
            "universal.shape.insect_vs_arachnid",
            "universal.shape.bird_mammal_herp"
          ],
          concept: "Look at the whole body first.",
          childPhrase: "What kind of living thing is this?",
          fieldPhrase: "Broad taxon recognition",
          explanation: "Before naming anything, sort the big shape: leaves, cap, wings, fur, feathers, or many legs.",
          photoPrompt: "Start with one clear whole-organism photo.",
          reward: 8,
          exemplar: { visual: "plant", label: "Whole body first" },
          items: [
            {
              id: "shape_plant",
              skill: "universal.shape.plant_vs_fungus",
              question: "Which one is the plant?",
              choices: [
                c("plant", "Leaves and stems", "plant", "It grows from a stem."),
                c("fungus", "Cap on a stalk", "fungus", "This is fungus-shaped."),
                c("insect", "Six tiny legs", "insect", "This is animal-shaped.")
              ],
              answer: "plant",
              feedback: "Plants usually show leaves, stems, or grass-like blades. Start with the whole plant."
            },
            {
              id: "shape_fungus",
              skill: "universal.shape.plant_vs_fungus",
              question: "Which one is the fungus?",
              choices: [
                c("tree", "Woody trunk", "tree", "This is plant form."),
                c("fungus", "Cap or soft fruiting body", "fungus", "Fungi often pop from wood or soil."),
                c("bird", "Feathers and beak", "bird", "This is a bird.")
              ],
              answer: "fungus",
              feedback: "A fungus often has a cap, shelf, puffball, jelly blob, or other fruiting body instead of leaves."
            },
            {
              id: "shape_insect",
              skill: "universal.shape.insect_vs_arachnid",
              question: "Which one is probably an insect?",
              choices: [
                c("insect", "Six legs", "six_legs", "Most adult insects have six legs."),
                c("arachnid", "Eight legs", "eight_legs", "This points to arachnids."),
                c("mammal", "Fur and four legs", "mammal", "This is mammal-shaped.")
              ],
              answer: "insect",
              feedback: "Insects are six-leg scouts. If you can count six legs, you are already close."
            },
            {
              id: "shape_arachnid",
              skill: "universal.shape.insect_vs_arachnid",
              question: "Which one is probably an arachnid?",
              choices: [
                c("fly", "One pair of wings", "fly", "This is an insect clue."),
                c("arachnid", "Eight legs, no antennae", "arachnid", "Spiders and harvestmen live here."),
                c("plant", "Leaves", "plant", "This is plant form.")
              ],
              answer: "arachnid",
              feedback: "Arachnids usually have eight legs and no antennae. That is the first big clue."
            },
            {
              id: "shape_bird",
              skill: "universal.shape.bird_mammal_herp",
              question: "Which one is the bird?",
              choices: [
                c("bird", "Feathers and beak", "bird", "Feathers are the big clue."),
                c("mammal", "Fur", "mammal", "Fur points another way."),
                c("herp", "Scales or smooth skin", "herp", "This is reptile or amphibian style.")
              ],
              answer: "bird",
              feedback: "For birds, look for feathers, beak, wings, and body posture before worrying about species."
            }
          ]
        },
        {
          id: "photo_helper",
          title: "Photo Helper",
          achievementId: "photo_helper",
          achievementName: "Photo Helper",
          fieldmarkFamily: "helpful photos",
          hiddenSkills: [
            "universal.photo.whole_body",
            "universal.photo.close_detail",
            "universal.photo.underside_base"
          ],
          concept: "A good next photo answers a fieldmark question.",
          childPhrase: "What should you photograph next?",
          fieldPhrase: "Observation evidence",
          explanation: "A whole photo shows the organism. A close-up shows the clue. A side, underside, or base photo can unlock the next step.",
          photoPrompt: "Take the photo that shows the missing clue.",
          reward: 8,
          exemplar: { visual: "next_photo", label: "Choose the next clue" },
          items: [
            {
              id: "photo_whole",
              skill: "universal.photo.whole_body",
              question: "You found a mystery plant. What photo helps first?",
              choices: [
                c("whole", "Whole plant", "whole", "Shape and size matter."),
                c("sky", "Sky above it", "habitat", "Pretty, but not the plant."),
                c("shoe", "Your shoe", "base", "Scale can help later.")
              ],
              answer: "whole",
              feedback: "Start with the whole organism so helpers can see growth form."
            },
            {
              id: "photo_mushroom",
              skill: "universal.photo.underside_base",
              question: "You photographed the top of a mushroom cap. What helps next?",
              choices: [
                c("underside", "Underside", "underside", "Pages, holes, teeth, or smooth."),
                c("bird", "Nearby bird", "bird", "Not evidence for the fungus."),
                c("far", "Far-away path", "habitat", "Habitat can help, but underside is stronger.")
              ],
              answer: "underside",
              feedback: "Mushroom undersides are huge clues: gills, pores, teeth, folds, or smooth."
            },
            {
              id: "photo_insect",
              skill: "universal.photo.close_detail",
              question: "You can see an insect, but the wings are blurry. What photo helps?",
              choices: [
                c("close", "Close top view", "close", "Show the wing clue."),
                c("base", "Tree roots", "base", "Not the insect clue."),
                c("habitat", "Whole meadow only", "habitat", "Good context, weak ID clue.")
              ],
              answer: "close",
              feedback: "A close top view can show hard wings, scaly wings, or one pair of wings."
            },
            {
              id: "photo_leaf",
              skill: "universal.photo.close_detail",
              question: "You want to show whether leaves are paired or taking turns. What photo helps?",
              choices: [
                c("close", "Where leaves meet the stem", "opposite_leaves", "The arrangement is visible there."),
                c("flower", "Only one petal", "wildflower", "Not the leaf clue."),
                c("ground", "Dirt nearby", "habitat", "Context, not arrangement.")
              ],
              answer: "close",
              feedback: "Photograph the stem with several leaves attached so the leaf pattern is visible."
            },
            {
              id: "photo_spider",
              skill: "universal.photo.whole_body",
              question: "For a tiny spider-like animal, what photo helps most first?",
              choices: [
                c("whole", "Whole body with legs", "whole", "Count legs and body blobs."),
                c("underside", "Mushroom underside", "underside", "Wrong organism."),
                c("sky", "Only the sky", "habitat", "No body clue.")
              ],
              answer: "whole",
              feedback: "For arachnids, a whole body photo helps count legs and see one body blob or two."
            }
          ]
        }
      ]
    },
    {
      id: "fungi",
      name: "Fungi",
      shortName: "Fungi",
      region: "Shady log grove",
      accent: "#f0c36b",
      summary: "Sort fruiting-body shapes and learn which underside clue to photograph.",
      lessons: [
        {
          id: "mushroom_shape_sorter",
          title: "Mushroom Shape Sorter",
          achievementId: "mushroom_shape_sorter",
          achievementName: "Mushroom Shape Sorter",
          fieldmarkFamily: "fungus shapes",
          hiddenSkills: [
            "fungi.shape.cap",
            "fungi.shape.shelf",
            "fungi.shape.puffball",
            "fungi.shape.coral_jelly_cup"
          ],
          concept: "Fungi come in different fruiting-body shapes.",
          childPhrase: "What fungus shape is this?",
          fieldPhrase: "Fungus growth form",
          explanation: "Do not start with species. First ask if it is a cap mushroom, shelf, puffball, coral, jelly, or cup.",
          photoPrompt: "Show the whole fungus and where it is growing.",
          reward: 10,
          exemplar: { visual: "cap_mushroom", label: "Cap mushroom" },
          items: [
            {
              id: "shape_cap",
              skill: "fungi.shape.cap",
              question: "Which one is a cap mushroom?",
              choices: [
                c("cap", "Cap on a stalk", "cap_mushroom", "Umbrella shape."),
                c("shelf", "Shelf on wood", "shelf_fungus", "Shelf shape."),
                c("puff", "Round puffball", "puffball", "Ball shape.")
              ],
              answer: "cap",
              feedback: "A cap mushroom has a cap, often with a stalk. Next, photograph the underside."
            },
            {
              id: "shape_shelf",
              skill: "fungi.shape.shelf",
              question: "Which fungus looks like a shelf on wood?",
              choices: [
                c("coral", "Branchy coral", "coral_fungus", "Branch shape."),
                c("shelf", "Layer on a log", "shelf_fungus", "Shelf shape."),
                c("cup", "Little cup", "cup_fungus", "Cup shape.")
              ],
              answer: "shelf",
              feedback: "Shelf fungi grow like ledges from wood or trees. A side photo helps."
            },
            {
              id: "shape_puff",
              skill: "fungi.shape.puffball",
              question: "Which one is the puffball?",
              choices: [
                c("puff", "Round ball fungus", "puffball", "No cap or shelf."),
                c("gills", "Paper pages", "gills", "Underside clue."),
                c("plant", "Leafy plant", "plant", "Not a fungus shape.")
              ],
              answer: "puff",
              feedback: "A puffball is more like a round ball than a cap with pages under it."
            },
            {
              id: "shape_coral",
              skill: "fungi.shape.coral_jelly_cup",
              question: "Which one is branchy like underwater coral?",
              choices: [
                c("coral", "Branchy fingers", "coral_fungus", "Coral fungus style."),
                c("jelly", "Jelly blob", "jelly_fungus", "Soft blob style."),
                c("shelf", "Wood shelf", "shelf_fungus", "Shelf style.")
              ],
              answer: "coral",
              feedback: "Coral fungi look branchy. You can describe the shape without knowing a species."
            },
            {
              id: "shape_cup",
              skill: "fungi.shape.coral_jelly_cup",
              question: "Which one looks like a tiny cup?",
              choices: [
                c("cup", "Cup fungus", "cup_fungus", "Bowl shape."),
                c("fly", "Fly", "fly", "Animal clue."),
                c("tree", "Tree", "tree", "Plant clue.")
              ],
              answer: "cup",
              feedback: "Cup fungi are bowl-shaped. A side and top photo can both help."
            }
          ]
        },
        {
          id: "underside_explorer",
          title: "Underside Explorer",
          achievementId: "underside_explorer",
          achievementName: "Underside Explorer",
          fieldmarkFamily: "fungus undersides",
          hiddenSkills: [
            "fungi.underside.gills",
            "fungi.underside.pores",
            "fungi.underside.teeth",
            "fungi.underside.folds_smooth"
          ],
          concept: "The underside is a clue shelf.",
          childPhrase: "What is under the cap?",
          fieldPhrase: "Hymenium surface",
          explanation: "Beginners can call them paper pages, tiny sponge holes, little teeth, wrinkles, or smooth.",
          photoPrompt: "Take one top photo and one underside photo. Never eat from app ID.",
          reward: 10,
          exemplar: { visual: "gills", label: "Paper pages under the cap" },
          items: [
            {
              id: "under_gills",
              skill: "fungi.underside.gills",
              question: "Which underside has paper pages?",
              choices: [
                c("gills", "Paper pages", "gills", "Real term: gills."),
                c("pores", "Tiny holes", "pores", "Real term: pores."),
                c("teeth", "Dangling teeth", "teeth", "Real term: teeth.")
              ],
              answer: "gills",
              feedback: "Gills look like paper pages under the cap."
            },
            {
              id: "under_pores",
              skill: "fungi.underside.pores",
              question: "Which underside has tiny sponge holes?",
              choices: [
                c("pores", "Tiny holes", "pores", "Sponge-like."),
                c("folds", "Wrinkles", "folds", "Folded surface."),
                c("smooth", "Smooth", "smooth", "No obvious holes.")
              ],
              answer: "pores",
              feedback: "Pores look like many tiny holes, almost like a sponge."
            },
            {
              id: "under_teeth",
              skill: "fungi.underside.teeth",
              question: "Which underside has little dangling teeth?",
              choices: [
                c("gills", "Paper pages", "gills", "Flat plates."),
                c("teeth", "Dangling teeth", "teeth", "Little spines."),
                c("puff", "Round ball", "puffball", "No cap underside.")
              ],
              answer: "teeth",
              feedback: "Toothed fungi have little spines or teeth hanging down."
            },
            {
              id: "under_folds",
              skill: "fungi.underside.folds_smooth",
              question: "Which underside looks wrinkly instead of like paper pages?",
              choices: [
                c("folds", "Wrinkles", "folds", "Folds can be blunt and wavy."),
                c("gills", "Paper pages", "gills", "Thin pages."),
                c("beetle", "Hard wings", "beetle", "Not fungus.")
              ],
              answer: "folds",
              feedback: "Folds are like wrinkles. They are not thin paper pages."
            },
            {
              id: "under_photo",
              skill: "fungi.underside.gills",
              question: "You see only the top of a cap mushroom. What photo helps most?",
              choices: [
                c("underside", "Underside photo", "underside", "Shows pages, holes, teeth, or smooth."),
                c("sky", "Sky photo", "habitat", "No fungus clue."),
                c("leaf", "One leaf nearby", "plant", "Not the mushroom clue.")
              ],
              answer: "underside",
              feedback: "For cap mushrooms, the underside photo is often the most helpful next clue."
            }
          ]
        }
      ]
    },
    {
      id: "insects",
      name: "Insects",
      shortName: "Insects",
      region: "Meadow station",
      accent: "#91d2f4",
      summary: "Count legs first, then use wings, antennae, and body clues.",
      lessons: [
        {
          id: "six_leg_scout",
          title: "Six-Leg Scout",
          achievementId: "six_leg_scout",
          achievementName: "Six-Leg Scout",
          fieldmarkFamily: "insect body plan",
          hiddenSkills: [
            "insects.body.six_legs",
            "insects.body.three_parts",
            "insects.body.antennae"
          ],
          concept: "Adult insects usually have six legs.",
          childPhrase: "Can you count six legs?",
          fieldPhrase: "Insect body plan",
          explanation: "Six legs and three body parts are the beginner clues. Wings may or may not be visible.",
          photoPrompt: "Try for a top or side view that shows legs and wings.",
          reward: 10,
          exemplar: { visual: "six_legs", label: "Six legs" },
          items: [
            {
              id: "six_legs",
              skill: "insects.body.six_legs",
              question: "Which clue points to insect?",
              choices: [
                c("six", "Six legs", "six_legs", "Insect clue."),
                c("eight", "Eight legs", "eight_legs", "Arachnid clue."),
                c("leaves", "Leaves", "plant", "Plant clue.")
              ],
              answer: "six",
              feedback: "Six legs is the first insect clue."
            },
            {
              id: "not_insect",
              skill: "insects.body.six_legs",
              question: "Which one is not an insect clue?",
              choices: [
                c("antennae", "Antennae", "insect", "Many insects have them."),
                c("eight", "Eight legs", "eight_legs", "This points to arachnids."),
                c("wings", "Wings", "clear_wings", "Many insects have wings.")
              ],
              answer: "eight",
              feedback: "Eight legs points away from insects and toward arachnids."
            },
            {
              id: "three_parts",
              skill: "insects.body.three_parts",
              question: "Which body clue helps with insects?",
              choices: [
                c("three", "Head, middle, back", "insect", "Three body parts."),
                c("one", "One round blob", "one_blob", "Harvestman style."),
                c("cap", "Cap and stalk", "cap_mushroom", "Fungus style.")
              ],
              answer: "three",
              feedback: "Insects often show head, thorax, and abdomen: three main body parts."
            },
            {
              id: "antennae",
              skill: "insects.body.antennae",
              question: "Which clue can separate insects from spiders?",
              choices: [
                c("antennae", "Antennae", "insect", "Spiders do not have antennae."),
                c("gills", "Paper pages", "gills", "Fungus clue."),
                c("fur", "Fur", "mammal", "Mammal clue.")
              ],
              answer: "antennae",
              feedback: "Antennae are useful. Spiders and other arachnids do not have them."
            },
            {
              id: "insect_photo",
              skill: "insects.body.six_legs",
              question: "What photo helps for a tiny insect?",
              choices: [
                c("side", "Side or top view", "side", "Shows legs and body shape."),
                c("underside", "Mushroom underside", "underside", "Wrong clue."),
                c("base", "Plant base only", "base", "Not the insect.")
              ],
              answer: "side",
              feedback: "A side or top view can show leg count, wings, and body parts."
            }
          ]
        },
        {
          id: "wing_detective",
          title: "Wing Detective",
          achievementId: "wing_detective",
          achievementName: "Wing Detective",
          fieldmarkFamily: "insect wings",
          hiddenSkills: [
            "insects.wings.hard_forewings",
            "insects.wings.scaly_wings",
            "insects.wings.one_pair",
            "insects.wings.half_leathery",
            "insects.wings.clear_folded"
          ],
          concept: "Wings tell big insect stories.",
          childPhrase: "What are the wings like?",
          fieldPhrase: "Wing texture and wing count",
          explanation: "Look for hard backpack wings, dusty scaly wings, one wing pair, half-hard wings, or clear folded wings.",
          photoPrompt: "Try to get a top view showing the wings.",
          reward: 10,
          exemplar: { visual: "hard_wings", label: "Hard backpack wings" },
          items: [
            {
              id: "wing_beetle",
              skill: "insects.wings.hard_forewings",
              question: "Which wing clue points to beetle?",
              choices: [
                c("hard", "Hard backpack wings", "hard_wings", "Beetle style."),
                c("scaly", "Dusty scaly wings", "scaly_wings", "Butterfly or moth style."),
                c("one", "One wing pair", "one_pair_wings", "Fly style.")
              ],
              answer: "hard",
              feedback: "Beetles have hard front wings like a tiny backpack shell."
            },
            {
              id: "wing_moth",
              skill: "insects.wings.scaly_wings",
              question: "Which clue points to butterfly or moth?",
              choices: [
                c("scaly", "Dusty or scaly wings", "scaly_wings", "Butterfly or moth style."),
                c("half", "Half-hard wings", "half_hard_wings", "True bug style."),
                c("pores", "Tiny holes", "pores", "Fungus clue.")
              ],
              answer: "scaly",
              feedback: "Butterflies and moths often have powdery-looking, scaly wings."
            },
            {
              id: "wing_fly",
              skill: "insects.wings.one_pair",
              question: "Which clue points to a true fly?",
              choices: [
                c("one", "One pair of wings", "one_pair_wings", "Fly style."),
                c("hard", "Hard backpack wings", "hard_wings", "Beetle style."),
                c("eight", "Eight legs", "eight_legs", "Arachnid clue.")
              ],
              answer: "one",
              feedback: "True flies have one visible wing pair. Tiny knobs behind the wings are called halteres."
            },
            {
              id: "wing_bug",
              skill: "insects.wings.half_leathery",
              question: "Which clue can point to a true bug?",
              choices: [
                c("half", "Half-hard front wings", "half_hard_wings", "True bug style."),
                c("jelly", "Jelly blob", "jelly_fungus", "Fungus clue."),
                c("leaf", "Leaf pairs", "opposite_leaves", "Plant clue.")
              ],
              answer: "half",
              feedback: "Many true bugs have front wings that are leathery near the body and softer near the tips."
            },
            {
              id: "wing_photo",
              skill: "insects.wings.clear_folded",
              question: "What photo helps most for Wing Detective?",
              choices: [
                c("close", "Top view of wings", "close", "Shows shape and texture."),
                c("base", "Soil at plant base", "base", "Wrong clue."),
                c("sky", "Only sky", "habitat", "No wing clue.")
              ],
              answer: "close",
              feedback: "A close top view can show whether wings are hard, scaly, clear, one pair, or half-hard."
            }
          ]
        }
      ]
    },
    {
      id: "arachnids",
      name: "Arachnids",
      shortName: "Arachnids",
      region: "Rock and web trail",
      accent: "#ffb38f",
      summary: "Count eight legs, check for antennae, then compare one body blob or two.",
      lessons: [
        {
          id: "eight_leg_scout",
          title: "Eight-Leg Scout",
          achievementId: "eight_leg_scout",
          achievementName: "Eight-Leg Scout",
          fieldmarkFamily: "arachnid body plan",
          hiddenSkills: [
            "arachnids.body.eight_legs",
            "arachnids.body.no_antennae",
            "arachnids.body.not_insect"
          ],
          concept: "Arachnids usually have eight legs and no antennae.",
          childPhrase: "Can you count eight legs?",
          fieldPhrase: "Arachnid body plan",
          explanation: "Spiders, harvestmen, ticks, mites, and scorpion-like animals are not insects.",
          photoPrompt: "Use a whole body photo so legs are visible.",
          reward: 10,
          exemplar: { visual: "eight_legs", label: "Eight legs" },
          items: [
            {
              id: "eight_legs",
              skill: "arachnids.body.eight_legs",
              question: "Which clue points to arachnid?",
              choices: [
                c("eight", "Eight legs", "eight_legs", "Arachnid clue."),
                c("six", "Six legs", "six_legs", "Insect clue."),
                c("leaves", "Leaves", "plant", "Plant clue.")
              ],
              answer: "eight",
              feedback: "Eight legs is the first arachnid clue."
            },
            {
              id: "no_antennae",
              skill: "arachnids.body.no_antennae",
              question: "Which clue fits spiders better than insects?",
              choices: [
                c("none", "No antennae", "no_antennae", "Spider clue."),
                c("antennae", "Long antennae", "insect", "Insect clue."),
                c("gills", "Paper pages", "gills", "Fungus clue.")
              ],
              answer: "none",
              feedback: "Spiders and other arachnids do not have antennae."
            },
            {
              id: "not_insect",
              skill: "arachnids.body.not_insect",
              question: "Eight legs means you should not call it a...",
              choices: [
                c("insect", "Insect", "insect", "Insects have six legs."),
                c("arachnid", "Arachnid", "arachnid", "This is the likely lane."),
                c("spider", "Spider-like animal", "spider", "Could be possible.")
              ],
              answer: "insect",
              feedback: "Eight legs points away from insects. Say arachnid or spider-like first."
            },
            {
              id: "tick_mite",
              skill: "arachnids.body.eight_legs",
              question: "Which tiny animal belongs in the arachnid lane?",
              choices: [
                c("tick", "Tick or mite", "tick_mite", "Arachnid lane."),
                c("beetle", "Beetle", "beetle", "Insect lane."),
                c("moss", "Moss", "moss", "Plant-ish lane.")
              ],
              answer: "tick",
              feedback: "Ticks and mites are arachnids too, even when they do not look like classic spiders."
            },
            {
              id: "arachnid_photo",
              skill: "arachnids.body.eight_legs",
              question: "What photo helps most for an arachnid clue?",
              choices: [
                c("whole", "Whole body and legs", "whole", "Lets helpers count legs."),
                c("flower", "Only a flower", "wildflower", "Wrong clue."),
                c("cap", "Mushroom cap", "cap_mushroom", "Wrong organism.")
              ],
              answer: "whole",
              feedback: "A whole body photo helps count legs and compare body blobs."
            }
          ]
        },
        {
          id: "body_blob_detective",
          title: "Body Blob Detective",
          achievementId: "body_blob_detective",
          achievementName: "Body Blob Detective",
          fieldmarkFamily: "arachnid body shape",
          hiddenSkills: [
            "arachnids.body.spider_two_blobs",
            "arachnids.body.harvestman_one_blob",
            "arachnids.body.tick_mite_blob"
          ],
          concept: "Body blobs separate spider-like animals.",
          childPhrase: "One body blob or two?",
          fieldPhrase: "Arachnid tagma shape",
          explanation: "Spiders usually show two body blobs. Harvestmen look more like one round body blob.",
          photoPrompt: "Use a clear top view if you can.",
          reward: 10,
          exemplar: { visual: "two_blobs", label: "Two body blobs" },
          items: [
            {
              id: "spider_two",
              skill: "arachnids.body.spider_two_blobs",
              question: "Which clue points to spider?",
              choices: [
                c("two", "Two body blobs", "two_blobs", "Spider style."),
                c("one", "One round body blob", "one_blob", "Harvestman style."),
                c("hard", "Hard backpack wings", "hard_wings", "Beetle style.")
              ],
              answer: "two",
              feedback: "Most spiders show two body sections: a front blob and a back blob."
            },
            {
              id: "harvestman_one",
              skill: "arachnids.body.harvestman_one_blob",
              question: "Which clue points to harvestman?",
              choices: [
                c("one", "One round body blob", "one_blob", "Harvestman style."),
                c("two", "Two body blobs", "two_blobs", "Spider style."),
                c("gills", "Paper pages", "gills", "Fungus clue.")
              ],
              answer: "one",
              feedback: "Harvestmen often look like one round body blob with long legs."
            },
            {
              id: "tick_blob",
              skill: "arachnids.body.tick_mite_blob",
              question: "Which animal can be tiny and round but still arachnid?",
              choices: [
                c("tick", "Tick or mite", "tick_mite", "Tiny arachnid style."),
                c("fly", "Fly", "fly", "Insect style."),
                c("grass", "Grass", "grass", "Plant style.")
              ],
              answer: "tick",
              feedback: "Ticks and mites are arachnids. Size alone does not make something an insect."
            },
            {
              id: "blob_photo",
              skill: "arachnids.body.spider_two_blobs",
              question: "What photo helps compare body blobs?",
              choices: [
                c("top", "Clear top view", "close", "Shows body shape."),
                c("far", "Far-away habitat only", "habitat", "Too little body detail."),
                c("underside", "Mushroom underside", "underside", "Wrong clue.")
              ],
              answer: "top",
              feedback: "A clear top view helps helpers see whether there is one body blob or two."
            },
            {
              id: "blob_not_species",
              skill: "arachnids.body.harvestman_one_blob",
              question: "After seeing one body blob and long legs, what should you say first?",
              choices: [
                c("harvestman", "Harvestman direction", "harvestman", "Broad group first."),
                c("species", "Exact species", "spider", "Too specific for beginners."),
                c("plant", "Plant", "plant", "Wrong living thing.")
              ],
              answer: "harvestman",
              feedback: "Great beginner move: stop at a broad group when the fieldmark only supports that."
            }
          ]
        }
      ]
    },
    {
      id: "plants",
      name: "Plants",
      shortName: "Plants",
      region: "Garden forest edge",
      accent: "#a6e36f",
      summary: "Start with plant form, then look where leaves meet the stem.",
      lessons: [
        {
          id: "plant_form_finder",
          title: "Plant Form Finder",
          achievementId: "plant_form_finder",
          achievementName: "Plant Form Finder",
          fieldmarkFamily: "plant form",
          hiddenSkills: [
            "plants.form.tree",
            "plants.form.shrub_vine",
            "plants.form.grass_fern_moss",
            "plants.form.wildflower"
          ],
          concept: "Whole-plant shape comes first.",
          childPhrase: "What plant shape is this?",
          fieldPhrase: "Growth form",
          explanation: "Tree, shrub, vine, wildflower, grass, fern, and moss are useful beginner buckets.",
          photoPrompt: "Take a whole-plant photo before a close-up.",
          reward: 10,
          exemplar: { visual: "tree", label: "Whole plant form" },
          items: [
            {
              id: "form_tree",
              skill: "plants.form.tree",
              question: "Which one is a tree?",
              choices: [
                c("tree", "One woody trunk", "tree", "Tree style."),
                c("grass", "Thin blades", "grass", "Grass style."),
                c("moss", "Tiny mat", "moss", "Moss style.")
              ],
              answer: "tree",
              feedback: "A tree usually has a woody trunk and grows taller than a shrub."
            },
            {
              id: "form_vine",
              skill: "plants.form.shrub_vine",
              question: "Which one is a vine?",
              choices: [
                c("vine", "Climbing or trailing", "vine", "Vine style."),
                c("tree", "Tall trunk", "tree", "Tree style."),
                c("fern", "Fronds", "fern", "Fern style.")
              ],
              answer: "vine",
              feedback: "A vine climbs, twines, or trails instead of standing up like a tree."
            },
            {
              id: "form_grass",
              skill: "plants.form.grass_fern_moss",
              question: "Which one is grass-like?",
              choices: [
                c("grass", "Narrow blades", "grass", "Grass style."),
                c("flower", "Showy bloom", "wildflower", "Wildflower style."),
                c("puff", "Puffball", "puffball", "Fungus style.")
              ],
              answer: "grass",
              feedback: "Grass-like plants often have narrow blades and a clumping or lawn-like form."
            },
            {
              id: "form_fern",
              skill: "plants.form.grass_fern_moss",
              question: "Which plant has fern-like fronds?",
              choices: [
                c("fern", "Feathery fronds", "fern", "Fern style."),
                c("beetle", "Hard wings", "beetle", "Insect style."),
                c("shelf", "Shelf on wood", "shelf_fungus", "Fungus style.")
              ],
              answer: "fern",
              feedback: "Ferns often have fronds instead of ordinary woody stems with flowers."
            },
            {
              id: "form_photo",
              skill: "plants.form.wildflower",
              question: "What photo helps first for an unknown plant?",
              choices: [
                c("whole", "Whole plant", "whole", "Shows growth form."),
                c("petal", "Only one tiny petal", "close", "Too narrow first."),
                c("sky", "Sky", "habitat", "No plant clue.")
              ],
              answer: "whole",
              feedback: "Whole-plant form tells helpers whether to think tree, shrub, vine, flower, grass, fern, or moss."
            }
          ]
        },
        {
          id: "leaf_pair_spotter",
          title: "Leaf Pair Spotter",
          achievementId: "leaf_pair_spotter",
          achievementName: "Leaf Pair Spotter",
          fieldmarkFamily: "leaf arrangement",
          hiddenSkills: [
            "plants.leaves.opposite",
            "plants.leaves.alternate",
            "plants.leaves.whorled",
            "plants.leaves.basal"
          ],
          concept: "Look where leaves meet the stem.",
          childPhrase: "Leaf pairs or leaves taking turns?",
          fieldPhrase: "Leaf arrangement",
          explanation: "Opposite leaves are pairs. Alternate leaves take turns up the stem. Whorled leaves make a circle.",
          photoPrompt: "Photograph a stretch of stem with several leaves attached.",
          reward: 10,
          exemplar: { visual: "opposite_leaves", label: "Leaf pairs" },
          items: [
            {
              id: "leaf_opposite",
              skill: "plants.leaves.opposite",
              question: "Which clue means opposite leaves?",
              choices: [
                c("opposite", "Leaf pairs", "opposite_leaves", "Two leaves at one spot."),
                c("alternate", "Taking turns", "alternate_leaves", "One leaf per step."),
                c("gills", "Paper pages", "gills", "Fungus clue.")
              ],
              answer: "opposite",
              feedback: "Opposite leaves are paired across the stem."
            },
            {
              id: "leaf_alternate",
              skill: "plants.leaves.alternate",
              question: "Which clue means alternate leaves?",
              choices: [
                c("alternate", "Leaves taking turns", "alternate_leaves", "One side, then the other."),
                c("opposite", "Leaf pairs", "opposite_leaves", "Pair clue."),
                c("hard", "Hard wings", "hard_wings", "Insect clue.")
              ],
              answer: "alternate",
              feedback: "Alternate leaves take turns up the stem instead of making pairs."
            },
            {
              id: "leaf_whorled",
              skill: "plants.leaves.whorled",
              question: "Which clue means whorled leaves?",
              choices: [
                c("whorled", "Several leaves in a circle", "whorled_leaves", "Whorl clue."),
                c("puff", "Round puffball", "puffball", "Fungus clue."),
                c("fly", "One wing pair", "fly", "Insect clue.")
              ],
              answer: "whorled",
              feedback: "Whorled leaves make a ring or circle around the stem."
            },
            {
              id: "leaf_rosette",
              skill: "plants.leaves.basal",
              question: "Which clue means basal rosette?",
              choices: [
                c("rosette", "Leaves low in a ground circle", "basal_rosette", "Rosette clue."),
                c("tree", "Woody trunk", "tree", "Tree form clue."),
                c("teeth", "Dangling teeth", "teeth", "Fungus clue.")
              ],
              answer: "rosette",
              feedback: "A basal rosette is a low circle of leaves near the ground."
            },
            {
              id: "leaf_photo",
              skill: "plants.leaves.opposite",
              question: "What photo helps for leaf arrangement?",
              choices: [
                c("stem", "Stem with several leaves", "opposite_leaves", "Shows the pattern."),
                c("flower", "Only flower color", "wildflower", "Useful later, not this clue."),
                c("ground", "Bare dirt", "habitat", "No leaf arrangement.")
              ],
              answer: "stem",
              feedback: "Photograph where leaves meet the stem so helpers can see pairs, turns, whorls, or rosettes."
            }
          ]
        }
      ]
    }
  ];

  const EXTRA_LESSONS = {
    universal: [
      {
        id: "habitat_clue_finder",
        title: "Habitat Clue Finder",
        achievementId: "habitat_clue_finder",
        achievementName: "Habitat Clue Finder",
        fieldmarkFamily: "habitat and substrate",
        hiddenSkills: [
          "universal.habitat.wood_soil_water",
          "universal.habitat.host_surface",
          "universal.habitat.context_photo"
        ],
        concept: "Where something grows or rests can be evidence.",
        childPhrase: "Where did you find it?",
        fieldPhrase: "Habitat clue",
        explanation: "Habitat is not a final ID, but wood, soil, water, bark, flowers, and leaf litter can steer the first question.",
        photoPrompt: "Take one close photo and one wider habitat photo when it helps.",
        reward: 8,
        exemplar: { visual: "habitat", label: "Place clue" },
        items: [
          {
            id: "habitat_fungus_wood",
            skill: "universal.habitat.wood_soil_water",
            question: "A fungus is growing from a log. What clue should you record?",
            choices: [
              c("wood", "Growing on wood", "shelf_fungus", "Logs and trunks matter."),
              c("sky", "Cloud shape", "habitat", "Pretty, but weak evidence."),
              c("fur", "Fur color", "mammal", "Wrong organism.")
            ],
            answer: "wood",
            feedback: "For fungi, wood vs soil vs leaf litter is a useful first clue."
          },
          {
            id: "habitat_water",
            skill: "universal.habitat.wood_soil_water",
            question: "A plant is rooted in shallow water. What should you notice?",
            choices: [
              c("water", "Aquatic or emergent", "habitat", "Water is part of the clue."),
              c("wings", "Wing texture", "hard_wings", "Not a plant clue."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "water",
            feedback: "Water, mud, bark, rock, and soil can all be useful context clues."
          },
          {
            id: "habitat_leaf_mine",
            skill: "universal.habitat.host_surface",
            question: "You see a pale squiggly trail inside a leaf. What clue is that?",
            choices: [
              c("leaf_mine", "Leaf-mining trail", "plant", "A tiny insect made a tunnel."),
              c("volva", "Cup at base", "base", "Fungus base clue."),
              c("feather", "Feather", "bird", "Bird clue.")
            ],
            answer: "leaf_mine",
            feedback: "Some insect clues are on the plant they use, like mines or galls."
          },
          {
            id: "habitat_wide_photo",
            skill: "universal.habitat.context_photo",
            question: "When does a wider habitat photo help?",
            choices: [
              c("context", "After the close clue", "habitat", "Show the setting too."),
              c("only_far", "Instead of the organism", "whole", "Too far away alone."),
              c("never", "Never", "close", "Context can help.")
            ],
            answer: "context",
            feedback: "Close evidence comes first, but a wider photo can show wood, water, host plant, or habitat."
          },
          {
            id: "habitat_bark",
            skill: "universal.habitat.host_surface",
            question: "A lichen-like patch is on tree bark. What should the note include?",
            choices: [
              c("bark", "Growing on bark", "tree", "Surface matters."),
              c("wings", "One pair of wings", "one_pair_wings", "Insect clue."),
              c("petals", "Petal number", "wildflower", "Flower clue.")
            ],
            answer: "bark",
            feedback: "For small patches and fungi, the surface they grow on can be a real clue."
          }
        ]
      },
      {
        id: "side_view_scout",
        title: "Side View Scout",
        achievementId: "side_view_scout",
        achievementName: "Side View Scout",
        fieldmarkFamily: "useful angles",
        hiddenSkills: [
          "universal.photo.side_view",
          "universal.photo.base_view",
          "universal.photo.scale_view"
        ],
        concept: "Some clues hide from the top.",
        childPhrase: "Which angle helps?",
        fieldPhrase: "Photo angle",
        explanation: "Top, side, underside, and base views answer different questions. Beginners can choose the angle that reveals the hidden clue.",
        photoPrompt: "Move gently and safely; do not damage the organism for a photo.",
        reward: 8,
        exemplar: { visual: "side", label: "Side view" },
        items: [
          {
            id: "side_mushroom_stem",
            skill: "universal.photo.side_view",
            question: "You need to show a mushroom stalk. Which angle helps?",
            choices: [
              c("side", "Side view", "side", "Shows stalk and cap."),
              c("top", "Top only", "cap_mushroom", "Cap only can miss the stalk."),
              c("sky", "Sky", "habitat", "No clue.")
            ],
            answer: "side",
            feedback: "A side view can show cap, stalk, ring, and base position."
          },
          {
            id: "side_base",
            skill: "universal.photo.base_view",
            question: "A mushroom might have a cup at the base. What photo helps?",
            choices: [
              c("base", "Whole base", "base", "Show the bottom of the stalk."),
              c("petal", "Flower petal", "wildflower", "Wrong organism."),
              c("wing", "Wing close-up", "hard_wings", "Insect clue.")
            ],
            answer: "base",
            feedback: "For mushrooms, the base can hold important clues like a bulb or cup."
          },
          {
            id: "side_insect",
            skill: "universal.photo.side_view",
            question: "An insect jumps away quickly. Which photo angle is still useful?",
            choices: [
              c("side", "Side view with legs", "side", "Shows leg shape."),
              c("dirt", "Bare dirt only", "habitat", "Weak without the insect."),
              c("leaf", "Different leaf", "plant", "Not the insect.")
            ],
            answer: "side",
            feedback: "A side view can show jumping legs, grabbing legs, or long stilt-like legs."
          },
          {
            id: "side_scale",
            skill: "universal.photo.scale_view",
            question: "How can you help show size without covering the organism?",
            choices: [
              c("nearby", "A safe nearby object", "whole", "Scale beside it can help."),
              c("touch", "Press it flat", "base", "Do not damage it."),
              c("none", "No whole photo", "close", "Whole view still helps.")
            ],
            answer: "nearby",
            feedback: "A safe nearby object can give scale, but do not crush or move the organism for a beginner lesson."
          },
          {
            id: "side_leaf_node",
            skill: "universal.photo.side_view",
            question: "You want leaf pairs vs taking turns. Which photo helps?",
            choices: [
              c("node", "Side of the stem", "opposite_leaves", "Shows attachment points."),
              c("single", "One loose leaf", "wildflower", "Might hide arrangement."),
              c("cap", "Mushroom cap", "cap_mushroom", "Wrong lane.")
            ],
            answer: "node",
            feedback: "A stem view with several leaf nodes shows arrangement better than one isolated leaf."
          }
        ]
      },
      {
        id: "tiny_details_detective",
        title: "Tiny Details Detective",
        achievementId: "tiny_details_detective",
        achievementName: "Tiny Details Detective",
        fieldmarkFamily: "close details",
        hiddenSkills: [
          "universal.details.edge_surface",
          "universal.details.body_part",
          "universal.details.do_not_guess"
        ],
        concept: "Small details are evidence, not decorations.",
        childPhrase: "Which tiny clue matters?",
        fieldPhrase: "Detail evidence",
        explanation: "After the whole view, zoom in on one useful detail: leaf edge, wings, antennae, underside, stem, or body shape.",
        photoPrompt: "Choose one detail photo that answers a fieldmark question.",
        reward: 8,
        exemplar: { visual: "close", label: "Tiny clue" },
        items: [
          {
            id: "detail_leaf_edge",
            skill: "universal.details.edge_surface",
            question: "Which tiny plant detail can help?",
            choices: [
              c("edge", "Leaf edge", "wildflower", "Smooth, toothed, wavy, or lobed."),
              c("cloud", "Clouds", "habitat", "Not a plant detail."),
              c("beak", "Bug beak", "true_bug", "Insect detail.")
            ],
            answer: "edge",
            feedback: "Leaf edges can be smooth, toothed, wavy, lobed, or spiny."
          },
          {
            id: "detail_antenna",
            skill: "universal.details.body_part",
            question: "Which tiny insect detail can help?",
            choices: [
              c("antenna", "Antenna shape", "insect", "Clubbed, elbowed, feathery, or long."),
              c("moss", "Moss cushion", "moss", "Different lane."),
              c("berry", "Berry", "wildflower", "Plant fruit clue.")
            ],
            answer: "antenna",
            feedback: "Antennae can separate broad insect groups when the photo is clear."
          },
          {
            id: "detail_underside",
            skill: "universal.details.body_part",
            question: "Which tiny fungus detail is useful?",
            choices: [
              c("underside", "Underside surface", "underside", "Pages, holes, teeth, wrinkles, or smooth."),
              c("fur", "Fur", "mammal", "Mammal clue."),
              c("feather", "Feather", "bird", "Bird clue.")
            ],
            answer: "underside",
            feedback: "For many fungi, the underside is the detail that unlocks the next question."
          },
          {
            id: "detail_not_guess",
            skill: "universal.details.do_not_guess",
            question: "If the tiny clue is hidden, what should you do?",
            choices: [
              c("broad", "Stay broad", "whole", "Use only what you can see."),
              c("species", "Guess species", "close", "Too specific."),
              c("ignore", "Ignore the whole organism", "habitat", "Whole view still matters.")
            ],
            answer: "broad",
            feedback: "Good naturalists stay broad when the evidence is not visible."
          },
          {
            id: "detail_photo",
            skill: "universal.details.edge_surface",
            question: "What makes a good detail photo?",
            choices: [
              c("answer", "It answers one clue question", "close", "Focused and useful."),
              c("random", "It is random", "habitat", "Less useful."),
              c("blurry", "It is very blurry", "whole", "Hard to read.")
            ],
            answer: "answer",
            feedback: "A strong detail photo asks one clear question: edge, underside, wing, stem, antenna, or body."
          }
        ]
      }
    ],
    fungi: [
      {
        id: "wood_or_ground",
        title: "Wood or Ground?",
        achievementId: "wood_or_ground",
        achievementName: "Wood or Ground?",
        fieldmarkFamily: "fungus substrate",
        hiddenSkills: [
          "fungi.ecology.wood",
          "fungi.ecology.soil",
          "fungi.ecology.leaf_litter",
          "fungi.ecology.clustered"
        ],
        concept: "What a fungus grows from is a fieldmark.",
        childPhrase: "Wood, soil, or leaf litter?",
        fieldPhrase: "Fungus substrate",
        explanation: "Fungi can fruit from wood, soil, leaf litter, mulch, or buried roots. A wider context photo can help.",
        photoPrompt: "Show the fungus and what it is growing from.",
        reward: 10,
        exemplar: { visual: "shelf_fungus", label: "Growing on wood" },
        items: [
          {
            id: "wood_log",
            skill: "fungi.ecology.wood",
            question: "A shelf fungus grows from a log. What clue is strongest?",
            choices: [
              c("wood", "Growing on wood", "shelf_fungus", "Log or tree clue."),
              c("soil", "Bare soil", "habitat", "Not this one."),
              c("petals", "Flower color", "wildflower", "Plant clue.")
            ],
            answer: "wood",
            feedback: "Wood matters for fungi. Record logs, stumps, trunks, or buried wood when visible."
          },
          {
            id: "soil_cap",
            skill: "fungi.ecology.soil",
            question: "A cap mushroom pops from bare ground. What should you note?",
            choices: [
              c("soil", "Growing from soil", "cap_mushroom", "Ground clue."),
              c("elytra", "Hard wing covers", "hard_wings", "Insect clue."),
              c("leaf_pairs", "Leaf pairs", "opposite_leaves", "Plant clue.")
            ],
            answer: "soil",
            feedback: "Soil vs wood is a beginner fungus clue. Photograph the base and nearby ground."
          },
          {
            id: "leaf_litter",
            skill: "fungi.ecology.leaf_litter",
            question: "Tiny fungi are coming through dead leaves. What is the clue?",
            choices: [
              c("litter", "Leaf litter", "habitat", "Dead leaves are substrate."),
              c("scales", "Scaly wings", "scaly_wings", "Insect wing clue."),
              c("rosette", "Basal rosette", "basal_rosette", "Plant form clue.")
            ],
            answer: "litter",
            feedback: "Leaf litter and mulch can be useful fungus context."
          },
          {
            id: "clustered",
            skill: "fungi.ecology.clustered",
            question: "Many mushrooms fruit from one spot together. What should you record?",
            choices: [
              c("cluster", "Clustered fruiting", "cap_mushroom", "Group pattern clue."),
              c("single", "Only one if many are visible", "whole", "Do not hide the pattern."),
              c("bird", "Bird feathers", "bird", "Wrong lane.")
            ],
            answer: "cluster",
            feedback: "Clustered vs solitary fruiting can be a real fungus clue."
          },
          {
            id: "wood_photo",
            skill: "fungi.ecology.wood",
            question: "What photo helps with wood-or-ground?",
            choices: [
              c("context", "Fungus plus surface", "habitat", "Show what it grows from."),
              c("only_top", "Only cap top", "cap_mushroom", "Might miss substrate."),
              c("antenna", "Antenna close-up", "insect", "Wrong organism.")
            ],
            answer: "context",
            feedback: "Show both the fungus and the surface: wood, soil, litter, mulch, or tree."
          }
        ]
      },
      {
        id: "stem_clue_finder",
        title: "Stem Clue Finder",
        achievementId: "stem_clue_finder",
        achievementName: "Stem Clue Finder",
        fieldmarkFamily: "fungus stalk and base",
        hiddenSkills: [
          "fungi.stem.stalk_present",
          "fungi.stem.ring",
          "fungi.stem.volva",
          "fungi.stem.bulbous_base"
        ],
        concept: "The stalk and base can hide important clues.",
        childPhrase: "What is on the stem?",
        fieldPhrase: "Stalk, ring, and base",
        explanation: "Look for a stalk, skirt ring, cup at the base, bulb, or no stem at all.",
        photoPrompt: "Photograph the full stalk and base in place when possible.",
        reward: 10,
        exemplar: { visual: "base", label: "Full base" },
        items: [
          {
            id: "stalk_present",
            skill: "fungi.stem.stalk_present",
            question: "Which clue means the fungus has a stalk?",
            choices: [
              c("stalk", "Cap held on a stem", "cap_mushroom", "Stalk present."),
              c("shelf", "Flat shelf on wood", "shelf_fungus", "Often no central stalk."),
              c("wings", "Clear wings", "clear_wings", "Insect clue.")
            ],
            answer: "stalk",
            feedback: "Stalk present vs absent is a simple fungus body-form clue."
          },
          {
            id: "ring",
            skill: "fungi.stem.ring",
            question: "What is a ring on a mushroom stalk like?",
            choices: [
              c("ring", "A skirt or band", "base", "Left by a veil."),
              c("pores", "Tiny holes", "pores", "Underside clue."),
              c("leaf", "Leaf edge", "wildflower", "Plant clue.")
            ],
            answer: "ring",
            feedback: "A ring is a skirt-like band around the stalk."
          },
          {
            id: "volva",
            skill: "fungi.stem.volva",
            question: "Where do you look for a cup or volva?",
            choices: [
              c("base", "At the stalk base", "base", "The bottom matters."),
              c("wing", "On the wing", "hard_wings", "Insect clue."),
              c("petal", "Inside a flower", "wildflower", "Plant clue.")
            ],
            answer: "base",
            feedback: "A volva or cup is at the base. A photo that cuts off the base can miss it."
          },
          {
            id: "bulbous",
            skill: "fungi.stem.bulbous_base",
            question: "A stalk base is swollen like a bulb. What should you record?",
            choices: [
              c("bulb", "Bulbous base", "base", "Swollen bottom."),
              c("galls", "Leaf gall", "plant", "Plant/insect clue."),
              c("antenna", "Clubbed antennae", "insect", "Insect clue.")
            ],
            answer: "bulb",
            feedback: "A bulbous base is useful fungus evidence; show the full base if safe."
          },
          {
            id: "stem_photo",
            skill: "fungi.stem.volva",
            question: "What is the best stem-clue photo?",
            choices: [
              c("full", "Whole stem plus base", "side", "Shows ring, stalk, and base."),
              c("top", "Top only", "cap_mushroom", "Misses stem clues."),
              c("leaf", "Leaf node", "opposite_leaves", "Plant clue.")
            ],
            answer: "full",
            feedback: "For stem clues, include the whole stalk and the base, not just the cap."
          }
        ]
      },
      {
        id: "safety_scout",
        title: "Safety Scout",
        achievementId: "safety_scout",
        achievementName: "Safety Scout",
        fieldmarkFamily: "fungus safety",
        hiddenSkills: [
          "fungi.safety.no_eating",
          "fungi.safety.photo_only",
          "fungi.safety.broad_id"
        ],
        concept: "Fungus lessons are for looking and photographing, not eating.",
        childPhrase: "What is the safe move?",
        fieldPhrase: "Fungus safety",
        explanation: "A fieldmark can help identify a fungus, but no app classroom should decide whether it is safe to eat.",
        photoPrompt: "Look, photograph, and leave safety decisions outside the app.",
        reward: 10,
        exemplar: { visual: "fungus", label: "Look only" },
        items: [
          {
            id: "safety_never_eat",
            skill: "fungi.safety.no_eating",
            question: "The app suggests a fungus group. What should you never do from that alone?",
            choices: [
              c("eat", "Eat it", "fungus", "Never from app ID."),
              c("photo", "Take better photos", "close", "Safe learning move."),
              c("broad", "Stay broad", "whole", "Good if unsure.")
            ],
            answer: "eat",
            feedback: "Never eat a fungus because an app or lesson suggests an ID."
          },
          {
            id: "safety_touch",
            skill: "fungi.safety.photo_only",
            question: "What is the beginner-safe classroom job?",
            choices: [
              c("look", "Look and photograph", "close", "Safe evidence."),
              c("taste", "Taste it", "fungus", "No."),
              c("cook", "Cook it", "fungus", "No.")
            ],
            answer: "look",
            feedback: "The classroom job is to observe and photograph fieldmarks."
          },
          {
            id: "safety_broad",
            skill: "fungi.safety.broad_id",
            question: "You can see pores but not enough for more. What should you say?",
            choices: [
              c("broad", "Pore fungus direction", "pores", "Evidence supports broad."),
              c("species", "Exact edible species", "fungus", "Too risky and too specific."),
              c("bird", "Bird", "bird", "Wrong organism.")
            ],
            answer: "broad",
            feedback: "Stopping at a broad rank is a good field skill."
          },
          {
            id: "safety_kids",
            skill: "fungi.safety.no_eating",
            question: "Which classroom sentence is best?",
            choices: [
              c("safe", "Look, photograph, do not eat", "fungus", "Clear and safe."),
              c("taste", "Taste to check", "fungus", "Unsafe."),
              c("smell_only", "Smell means safe", "close", "Smell is not safety.")
            ],
            answer: "safe",
            feedback: "Look and photograph. Edibility is not a classroom game."
          },
          {
            id: "safety_photo",
            skill: "fungi.safety.photo_only",
            question: "Which photo set is best for learning fungi?",
            choices: [
              c("set", "Top, side, underside, base", "underside", "Good evidence set."),
              c("bite", "Bite mark", "fungus", "No."),
              c("none", "No photos", "habitat", "No evidence.")
            ],
            answer: "set",
            feedback: "Good fungus evidence is a photo set, not a taste test."
          }
        ]
      }
    ],
    insects: [
      {
        id: "antenna_spotter",
        title: "Antenna Spotter",
        achievementId: "antenna_spotter",
        achievementName: "Antenna Spotter",
        fieldmarkFamily: "insect antennae",
        hiddenSkills: [
          "insects.antennae.clubbed",
          "insects.antennae.elbowed",
          "insects.antennae.feathery",
          "insects.antennae.long_short"
        ],
        concept: "Antennae are clue feelers.",
        childPhrase: "What shape are the antennae?",
        fieldPhrase: "Antenna form",
        explanation: "Antennae may be clubbed, elbowed, feathery, threadlike, long, short, or hard to see.",
        photoPrompt: "Try for a clear head photo if the insect is still.",
        reward: 10,
        exemplar: { visual: "insect", label: "Antennae" },
        items: [
          {
            id: "clubbed",
            skill: "insects.antennae.clubbed",
            question: "Which antenna looks clubbed?",
            choices: [
              c("club", "Thicker knob at the end", "insect", "Clubbed antennae."),
              c("feather", "Feathery branches", "butterfly", "Feathery clue."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "club",
            feedback: "Clubbed antennae end in a thicker knob or club."
          },
          {
            id: "elbowed",
            skill: "insects.antennae.elbowed",
            question: "Which antenna looks elbowed?",
            choices: [
              c("elbow", "Bent like an arm", "insect", "Common in ants."),
              c("straight", "No bend at all", "fly", "Not elbowed."),
              c("leaf", "Leaf pairs", "opposite_leaves", "Plant clue.")
            ],
            answer: "elbow",
            feedback: "Elbowed antennae bend sharply, like a tiny arm."
          },
          {
            id: "feathery",
            skill: "insects.antennae.feathery",
            question: "Which antenna looks feathery?",
            choices: [
              c("feathery", "Many fine side branches", "butterfly", "Feathery antennae."),
              c("pores", "Tiny holes", "pores", "Fungus clue."),
              c("moss", "Tiny mat", "moss", "Plant-ish clue.")
            ],
            answer: "feathery",
            feedback: "Feathery antennae look comb-like or plume-like."
          },
          {
            id: "long_short",
            skill: "insects.antennae.long_short",
            question: "What should you do if antennae are hidden?",
            choices: [
              c("unknown", "Mark unknown", "insect", "Do not invent a clue."),
              c("guess", "Guess long", "side", "Guessing is weak."),
              c("species", "Name species", "beetle", "Too specific.")
            ],
            answer: "unknown",
            feedback: "If the antennae are hidden, say unknown and use another visible clue."
          },
          {
            id: "antenna_photo",
            skill: "insects.antennae.long_short",
            question: "What photo helps with antennae?",
            choices: [
              c("head", "Head close-up", "close", "Shows antennae."),
              c("underside", "Mushroom underside", "underside", "Wrong lane."),
              c("seed", "Seed pod", "wildflower", "Plant clue.")
            ],
            answer: "head",
            feedback: "A head close-up can show antenna length, bend, club, or feathering."
          }
        ]
      },
      {
        id: "leg_job_detective",
        title: "Leg Job Detective",
        achievementId: "leg_job_detective",
        achievementName: "Leg Job Detective",
        fieldmarkFamily: "insect legs",
        hiddenSkills: [
          "insects.legs.jumping",
          "insects.legs.grabbing",
          "insects.legs.swimming",
          "insects.legs.pollen"
        ],
        concept: "Legs are tools.",
        childPhrase: "What job do the legs do?",
        fieldPhrase: "Leg form and behavior",
        explanation: "Insect legs can be built for jumping, grabbing, swimming, carrying pollen, digging, or walking.",
        photoPrompt: "A side view often shows leg shape better than a top view.",
        reward: 10,
        exemplar: { visual: "side", label: "Leg shape" },
        items: [
          {
            id: "jumping",
            skill: "insects.legs.jumping",
            question: "Which legs suggest grasshopper or cricket direction?",
            choices: [
              c("jump", "Big jumping hind legs", "grasshopper", "Built like springs."),
              c("pollen", "Pollen baskets", "bee_wasp_ant", "Bee clue."),
              c("pores", "Tiny holes", "pores", "Fungus clue.")
            ],
            answer: "jump",
            feedback: "Big rear legs often mean jumping insects like grasshoppers, crickets, or katydids."
          },
          {
            id: "grabbing",
            skill: "insects.legs.grabbing",
            question: "Which legs look built for grabbing prey?",
            choices: [
              c("grab", "Folded grabbing forelegs", "insect", "Raptorial legs."),
              c("leaf", "Leaf pairs", "opposite_leaves", "Plant clue."),
              c("cup", "Cup fungus", "cup_fungus", "Fungus clue.")
            ],
            answer: "grab",
            feedback: "Raptorial forelegs fold and grab, like tiny hooked arms."
          },
          {
            id: "swimming",
            skill: "insects.legs.swimming",
            question: "Which legs suggest a swimming insect?",
            choices: [
              c("swim", "Paddle-like legs", "insect", "Water movement clue."),
              c("hard", "Hard wing covers", "hard_wings", "Wing clue."),
              c("tree", "Woody trunk", "tree", "Plant clue.")
            ],
            answer: "swim",
            feedback: "Swimming legs can look flattened or paddle-like."
          },
          {
            id: "pollen",
            skill: "insects.legs.pollen",
            question: "Packed yellow blobs on back legs suggest...",
            choices: [
              c("pollen", "Pollen baskets", "bee_wasp_ant", "Bee direction."),
              c("gills", "Paper pages", "gills", "Fungus clue."),
              c("berries", "Berry-like fruit", "wildflower", "Plant fruit clue.")
            ],
            answer: "pollen",
            feedback: "Pollen baskets on hind legs can point toward bees."
          },
          {
            id: "leg_photo",
            skill: "insects.legs.jumping",
            question: "What photo helps Leg Job Detective?",
            choices: [
              c("side", "Side view of legs", "side", "Shows leg shape."),
              c("sky", "Sky", "habitat", "No leg clue."),
              c("base", "Mushroom base", "base", "Wrong lane.")
            ],
            answer: "side",
            feedback: "A side view can show whether legs jump, grab, swim, or carry pollen."
          }
        ]
      },
      {
        id: "bug_beak_finder",
        title: "Bug Beak Finder",
        achievementId: "bug_beak_finder",
        achievementName: "Bug Beak Finder",
        fieldmarkFamily: "insect mouthparts",
        hiddenSkills: [
          "insects.mouthparts.piercing_beak",
          "insects.mouthparts.chewing",
          "insects.mouthparts.sponge",
          "insects.mouthparts.proboscis"
        ],
        concept: "Mouthparts hint at broad insect groups.",
        childPhrase: "What kind of mouth does it have?",
        fieldPhrase: "Mouthparts",
        explanation: "Some insects chew. Some have a piercing beak. Flies may have sponge-like mouthparts, and butterflies/moths have a long straw.",
        photoPrompt: "Only use mouthparts when the head is clear; otherwise stay broad.",
        reward: 10,
        exemplar: { visual: "true_bug", label: "Piercing beak" },
        items: [
          {
            id: "piercing",
            skill: "insects.mouthparts.piercing_beak",
            question: "Which mouthpart points toward true bug?",
            choices: [
              c("beak", "Piercing straw beak", "true_bug", "Bug beak clue."),
              c("gills", "Paper pages", "gills", "Fungus clue."),
              c("leaf", "Leaf edge", "wildflower", "Plant clue.")
            ],
            answer: "beak",
            feedback: "True bugs often have a straw-like beak for piercing and sucking."
          },
          {
            id: "chewing",
            skill: "insects.mouthparts.chewing",
            question: "Which mouthpart sounds like chewing jaws?",
            choices: [
              c("jaws", "Biting jaws", "beetle", "Chewing mouthparts."),
              c("pores", "Tiny holes", "pores", "Fungus clue."),
              c("moss", "Moss cushion", "moss", "Plant-ish clue.")
            ],
            answer: "jaws",
            feedback: "Chewing jaws are useful but should be paired with other visible body clues."
          },
          {
            id: "sponge",
            skill: "insects.mouthparts.sponge",
            question: "Sponge-like mouthparts can point toward...",
            choices: [
              c("fly", "True fly", "fly", "Fly mouth clue."),
              c("beetle", "Beetle", "hard_wings", "Wing cover clue."),
              c("fern", "Fern", "fern", "Plant-ish clue.")
            ],
            answer: "fly",
            feedback: "Some flies have sponge-like mouthparts instead of chewing jaws."
          },
          {
            id: "proboscis",
            skill: "insects.mouthparts.proboscis",
            question: "A long coiled straw often points toward...",
            choices: [
              c("moth", "Butterfly or moth", "butterfly", "Proboscis clue."),
              c("spider", "Spider", "spider", "Arachnid lane."),
              c("cup", "Cup fungus", "cup_fungus", "Fungus clue.")
            ],
            answer: "moth",
            feedback: "Butterflies and moths often use a long proboscis like a nectar straw."
          },
          {
            id: "mouth_unknown",
            skill: "insects.mouthparts.piercing_beak",
            question: "The head is blurry. What is the best move?",
            choices: [
              c("unknown", "Mouthparts unknown", "close", "Use another clue."),
              c("guess", "Guess exact mouth", "insect", "Too much."),
              c("species", "Name species", "true_bug", "Too specific.")
            ],
            answer: "unknown",
            feedback: "If the head is blurry, do not invent mouthparts. Use wings, legs, or body shape instead."
          }
        ]
      }
    ],
    arachnids: [
      {
        id: "web_reader",
        title: "Web Reader",
        achievementId: "web_reader",
        achievementName: "Web Reader",
        fieldmarkFamily: "web clues",
        hiddenSkills: [
          "arachnids.web.orb",
          "arachnids.web.messy_sheet_funnel",
          "arachnids.web.no_web"
        ],
        concept: "A web can be a habitat clue, not a species answer.",
        childPhrase: "What kind of web is nearby?",
        fieldPhrase: "Web form",
        explanation: "Orb webs, messy webs, sheet webs, funnels, or no web can guide broad spider thinking.",
        photoPrompt: "Photograph the spider and web only if both are clearly connected.",
        reward: 10,
        exemplar: { visual: "spider", label: "Web clue" },
        items: [
          {
            id: "orb",
            skill: "arachnids.web.orb",
            question: "Which web looks like a wheel?",
            choices: [
              c("orb", "Round orb web", "spider", "Wheel-shaped web."),
              c("sheet", "Flat sheet web", "side", "Sheet clue."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "orb",
            feedback: "Orb webs look like round wheels or spirals."
          },
          {
            id: "messy",
            skill: "arachnids.web.messy_sheet_funnel",
            question: "Which web clue sounds messy?",
            choices: [
              c("messy", "Tangled messy web", "spider", "Tangle clue."),
              c("leaf", "Leaf pairs", "opposite_leaves", "Plant clue."),
              c("elytra", "Hard wing covers", "hard_wings", "Insect clue.")
            ],
            answer: "messy",
            feedback: "Messy webs are tangle-like rather than neat wheel shapes."
          },
          {
            id: "funnel",
            skill: "arachnids.web.messy_sheet_funnel",
            question: "Which web has a little tunnel retreat?",
            choices: [
              c("funnel", "Funnel web", "spider", "Sheet with a tunnel."),
              c("puff", "Puffball", "puffball", "Fungus clue."),
              c("grass", "Grass blade", "grass", "Plant clue.")
            ],
            answer: "funnel",
            feedback: "A funnel web often has a sheet leading into a tunnel-like retreat."
          },
          {
            id: "no_web",
            skill: "arachnids.web.no_web",
            question: "If there is no web visible, what should you do?",
            choices: [
              c("record", "Say no web seen", "spider", "Visible evidence only."),
              c("invent", "Invent an orb web", "spider", "Do not guess."),
              c("fungus", "Call it fungus", "fungus", "Wrong lane.")
            ],
            answer: "record",
            feedback: "No web seen is a valid note. It does not prove the animal never uses webs."
          },
          {
            id: "web_photo",
            skill: "arachnids.web.orb",
            question: "What photo helps with web clues?",
            choices: [
              c("both", "Spider plus web", "whole", "Shows connection."),
              c("web_only", "Only any web far away", "habitat", "Might not belong to it."),
              c("leaf", "Leaf edge", "wildflower", "Plant clue.")
            ],
            answer: "both",
            feedback: "Photograph the spider and web together when possible, so the web clue belongs to that animal."
          }
        ]
      },
      {
        id: "leg_pose_spotter",
        title: "Leg Pose Spotter",
        achievementId: "leg_pose_spotter",
        achievementName: "Leg Pose Spotter",
        fieldmarkFamily: "arachnid leg posture",
        hiddenSkills: [
          "arachnids.legs.crablike",
          "arachnids.legs.jumping",
          "arachnids.legs.long_legged",
          "arachnids.legs.ground_running"
        ],
        concept: "Leg pose can hint at broad spider shape.",
        childPhrase: "How are the legs held?",
        fieldPhrase: "Leg posture",
        explanation: "Crablike sideways legs, jumping stance, long delicate legs, and ground-running posture are beginner shape clues.",
        photoPrompt: "Use a clear top or side photo that shows leg posture.",
        reward: 10,
        exemplar: { visual: "spider", label: "Leg pose" },
        items: [
          {
            id: "crablike",
            skill: "arachnids.legs.crablike",
            question: "Which pose is crablike?",
            choices: [
              c("crab", "Legs held sideways", "spider", "Crab spider style."),
              c("jump", "Compact jumper", "spider", "Jumping style."),
              c("pore", "Tiny holes", "pores", "Fungus clue.")
            ],
            answer: "crab",
            feedback: "Crablike spiders often hold front legs out to the sides."
          },
          {
            id: "jumping_spider",
            skill: "arachnids.legs.jumping",
            question: "Which shape suggests a jumping spider direction?",
            choices: [
              c("jump", "Compact body, strong front", "spider", "Jumping style."),
              c("harvestman", "One blob, very long legs", "harvestman", "Harvestman style."),
              c("grass", "Narrow blades", "grass", "Plant clue.")
            ],
            answer: "jump",
            feedback: "Jumping spiders often look compact and alert, but still use broad clues first."
          },
          {
            id: "long_legged",
            skill: "arachnids.legs.long_legged",
            question: "Which clue means long-legged spider-like animal?",
            choices: [
              c("long", "Very long thin legs", "harvestman", "Long-leg clue."),
              c("hard", "Hard wings", "hard_wings", "Beetle clue."),
              c("samara", "Winged seed", "wildflower", "Plant fruit clue.")
            ],
            answer: "long",
            feedback: "Very long thin legs can point to harvestmen, cellar spiders, or other long-legged arachnids."
          },
          {
            id: "ground_running",
            skill: "arachnids.legs.ground_running",
            question: "A spider runs on the ground with no web nearby. What broad clue fits?",
            choices: [
              c("runner", "Ground-running posture", "spider", "Movement clue."),
              c("orb", "Orb web only", "spider", "No web visible."),
              c("flower", "Flower shape", "wildflower", "Plant clue.")
            ],
            answer: "runner",
            feedback: "Ground-running posture is a clue. Do not force every spider into a web category."
          },
          {
            id: "leg_pose_photo",
            skill: "arachnids.legs.crablike",
            question: "What photo helps Leg Pose Spotter?",
            choices: [
              c("top", "Top view of whole body", "whole", "Shows leg posture."),
              c("underside", "Mushroom underside", "underside", "Wrong lane."),
              c("fruit", "Fruit close-up", "wildflower", "Plant clue.")
            ],
            answer: "top",
            feedback: "A whole top view helps compare crablike, jumping, long-legged, and running postures."
          }
        ]
      },
      {
        id: "spider_shape_sorter",
        title: "Spider Shape Sorter",
        achievementId: "spider_shape_sorter",
        achievementName: "Spider Shape Sorter",
        fieldmarkFamily: "spider broad forms",
        hiddenSkills: [
          "arachnids.shape.jumping_spider",
          "arachnids.shape.orbweaver",
          "arachnids.shape.crab_wolf_cellar",
          "arachnids.shape.harvestman"
        ],
        concept: "Begin with spider shapes, not spider species.",
        childPhrase: "What broad spider shape is this?",
        fieldPhrase: "Broad arachnid form",
        explanation: "Jumping spider, orbweaver, crab spider, wolf spider, cellar spider, and harvestman are broad beginner directions.",
        photoPrompt: "Use whole-body shape plus web or behavior when visible.",
        reward: 10,
        exemplar: { visual: "spider", label: "Spider shape" },
        items: [
          {
            id: "shape_jumper",
            skill: "arachnids.shape.jumping_spider",
            question: "Which broad shape is compact and alert?",
            choices: [
              c("jumper", "Jumping spider direction", "spider", "Compact form."),
              c("shelf", "Shelf fungus", "shelf_fungus", "Fungus clue."),
              c("beetle", "Hard wings", "hard_wings", "Insect clue.")
            ],
            answer: "jumper",
            feedback: "Jumping spider is a broad shape direction, not a species guess."
          },
          {
            id: "shape_orbweaver",
            skill: "arachnids.shape.orbweaver",
            question: "Round web plus round-bodied spider suggests...",
            choices: [
              c("orbweaver", "Orbweaver direction", "spider", "Web plus body clue."),
              c("fly", "True fly", "fly", "Insect lane."),
              c("fern", "Fern", "fern", "Plant-ish lane.")
            ],
            answer: "orbweaver",
            feedback: "Orbweaver direction comes from web shape and spider shape together."
          },
          {
            id: "shape_crab",
            skill: "arachnids.shape.crab_wolf_cellar",
            question: "Sideways legs on a flower suggest...",
            choices: [
              c("crab", "Crab spider direction", "spider", "Sideways posture."),
              c("puff", "Puffball", "puffball", "Fungus clue."),
              c("grass", "Grass", "grass", "Plant clue.")
            ],
            answer: "crab",
            feedback: "Crab spider direction is a broad form clue based on posture and body shape."
          },
          {
            id: "shape_cellar",
            skill: "arachnids.shape.crab_wolf_cellar",
            question: "Very long delicate legs in a corner web suggest...",
            choices: [
              c("cellar", "Cellar spider direction", "spider", "Long delicate legs."),
              c("true_bug", "True bug", "true_bug", "Insect lane."),
              c("cone", "Cone", "tree", "Plant clue.")
            ],
            answer: "cellar",
            feedback: "Long delicate legs and corner webs can point toward cellar spider direction."
          },
          {
            id: "shape_harvestman",
            skill: "arachnids.shape.harvestman",
            question: "One round body blob with very long legs suggests...",
            choices: [
              c("harvestman", "Harvestman direction", "harvestman", "One blob clue."),
              c("spider_species", "Exact spider species", "spider", "Too specific."),
              c("mushroom", "Mushroom", "cap_mushroom", "Wrong lane.")
            ],
            answer: "harvestman",
            feedback: "Harvestman direction uses the one-body-blob clue and stays broad."
          }
        ]
      }
    ],
    plants: [
      {
        id: "leaf_shape_scout",
        title: "Leaf Shape Scout",
        achievementId: "leaf_shape_scout",
        achievementName: "Leaf Shape Scout",
        fieldmarkFamily: "leaf shape",
        hiddenSkills: [
          "plants.leaf.simple_compound",
          "plants.leaf.lobed",
          "plants.leaf.needle_grass",
          "plants.leaf.leaflet"
        ],
        concept: "Leaf shape is read after leaf arrangement.",
        childPhrase: "What shape is the leaf?",
        fieldPhrase: "Leaf blade shape",
        explanation: "Beginner leaf shapes include simple, compound, lobed, needle-like, grass-like, heart-shaped, round, and divided.",
        photoPrompt: "Photograph a typical mature leaf still attached if possible.",
        reward: 10,
        exemplar: { visual: "wildflower", label: "Leaf shape" },
        items: [
          {
            id: "simple",
            skill: "plants.leaf.simple_compound",
            question: "Which leaf is simple?",
            choices: [
              c("simple", "One blade", "wildflower", "Simple leaf."),
              c("compound", "Many leaflets", "vine", "Compound leaf."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "simple",
            feedback: "A simple leaf has one blade, even if that blade has lobes."
          },
          {
            id: "compound",
            skill: "plants.leaf.simple_compound",
            question: "Which leaf is compound?",
            choices: [
              c("compound", "Separate leaflets", "vine", "Many pieces on one leaf stalk."),
              c("simple", "One blade", "wildflower", "Simple leaf."),
              c("wings", "Hard wings", "hard_wings", "Insect clue.")
            ],
            answer: "compound",
            feedback: "A compound leaf is divided into leaflets. Look for the bud to find the true leaf base."
          },
          {
            id: "lobed",
            skill: "plants.leaf.lobed",
            question: "Which leaf has lobes?",
            choices: [
              c("lobed", "Rounded or pointed sections", "tree", "Lobed blade."),
              c("needle", "Needles", "tree", "Needle-like leaf."),
              c("pores", "Tiny holes", "pores", "Fungus clue.")
            ],
            answer: "lobed",
            feedback: "Lobed leaves have big in-and-out sections along the edge."
          },
          {
            id: "needle",
            skill: "plants.leaf.needle_grass",
            question: "Which leaf is needle-like?",
            choices: [
              c("needle", "Thin needles", "tree", "Conifer-style clue."),
              c("grass", "Flat grass blade", "grass", "Grass-like clue."),
              c("fly", "One wing pair", "fly", "Insect clue.")
            ],
            answer: "needle",
            feedback: "Needle-like leaves are narrow, stiff, and often conifer-style."
          },
          {
            id: "leaf_photo_shape",
            skill: "plants.leaf.leaflet",
            question: "What photo helps with leaf shape?",
            choices: [
              c("attached", "A whole attached leaf", "wildflower", "Shows blade and stalk."),
              c("loose_piece", "One torn piece", "close", "May hide the full shape."),
              c("mushroom", "Mushroom underside", "underside", "Wrong lane.")
            ],
            answer: "attached",
            feedback: "A whole attached leaf helps separate simple leaves from compound leaves and leaflets."
          }
        ]
      },
      {
        id: "edge_detective",
        title: "Edge Detective",
        achievementId: "edge_detective",
        achievementName: "Edge Detective",
        fieldmarkFamily: "leaf edges",
        hiddenSkills: [
          "plants.edge.smooth",
          "plants.edge.toothed",
          "plants.edge.wavy_lobed",
          "plants.edge.spiny"
        ],
        concept: "The edge of a leaf can be a clue.",
        childPhrase: "What is the leaf edge doing?",
        fieldPhrase: "Leaf margin",
        explanation: "Leaf edges can be smooth, toothed like a saw, wavy, lobed, or spiny.",
        photoPrompt: "A close, flat leaf-edge photo can help.",
        reward: 10,
        exemplar: { visual: "close", label: "Leaf edge" },
        items: [
          {
            id: "smooth_edge",
            skill: "plants.edge.smooth",
            question: "Which edge is smooth?",
            choices: [
              c("smooth", "No teeth", "wildflower", "Smooth margin."),
              c("toothed", "Tiny saw teeth", "wildflower", "Toothed margin."),
              c("teeth", "Fungus teeth", "teeth", "Fungus clue.")
            ],
            answer: "smooth",
            feedback: "A smooth margin has no obvious teeth or lobes."
          },
          {
            id: "toothed_edge",
            skill: "plants.edge.toothed",
            question: "Which edge is toothed?",
            choices: [
              c("toothed", "Saw-like teeth", "wildflower", "Serrated margin."),
              c("smooth", "No teeth", "wildflower", "Smooth margin."),
              c("hard", "Hard wings", "hard_wings", "Insect clue.")
            ],
            answer: "toothed",
            feedback: "Toothed or serrated margins look like tiny saw teeth."
          },
          {
            id: "wavy_edge",
            skill: "plants.edge.wavy_lobed",
            question: "Which edge is wavy?",
            choices: [
              c("wavy", "Soft waves", "wildflower", "Wavy margin."),
              c("straight", "Perfectly smooth", "wildflower", "Smooth clue."),
              c("pores", "Tiny holes", "pores", "Fungus clue.")
            ],
            answer: "wavy",
            feedback: "A wavy margin has soft waves, not sharp teeth."
          },
          {
            id: "spiny_edge",
            skill: "plants.edge.spiny",
            question: "Which edge is spiny?",
            choices: [
              c("spiny", "Sharp points", "wildflower", "Spiny margin."),
              c("club", "Clubbed antennae", "insect", "Insect clue."),
              c("jelly", "Jelly fungus", "jelly_fungus", "Fungus clue.")
            ],
            answer: "spiny",
            feedback: "Spiny margins have sharp points. Handle plants gently and safely."
          },
          {
            id: "edge_photo",
            skill: "plants.edge.toothed",
            question: "What photo helps Edge Detective?",
            choices: [
              c("edge", "Close leaf edge", "close", "Shows teeth or smoothness."),
              c("whole_only", "Only far-away plant", "whole", "May be too far."),
              c("wing", "Wing close-up", "hard_wings", "Insect clue.")
            ],
            answer: "edge",
            feedback: "A close edge photo can show smooth, toothed, wavy, lobed, or spiny margins."
          }
        ]
      },
      {
        id: "flower_shape_finder",
        title: "Flower Shape Finder",
        achievementId: "flower_shape_finder",
        achievementName: "Flower Shape Finder",
        fieldmarkFamily: "flower shapes",
        hiddenSkills: [
          "plants.flower.daisy_bell_tube",
          "plants.flower.pea",
          "plants.flower.umbel_spike",
          "plants.flower.symmetry"
        ],
        concept: "Flower shape can be a family-level clue.",
        childPhrase: "What shape is the flower?",
        fieldPhrase: "Flower form",
        explanation: "Beginner flower shapes include daisy heads, bells, tubes, pea flowers, umbrella clusters, and spikes.",
        photoPrompt: "Photograph one flower and the whole flower cluster.",
        reward: 10,
        exemplar: { visual: "wildflower", label: "Flower shape" },
        items: [
          {
            id: "daisy",
            skill: "plants.flower.daisy_bell_tube",
            question: "Which flower looks like a daisy head?",
            choices: [
              c("daisy", "Daisy-like head", "wildflower", "Composite style."),
              c("bell", "Hanging bell", "wildflower", "Bell style."),
              c("fly", "One wing pair", "fly", "Insect clue.")
            ],
            answer: "daisy",
            feedback: "Daisy-like heads are made of many tiny flowers packed together."
          },
          {
            id: "bell",
            skill: "plants.flower.daisy_bell_tube",
            question: "Which flower is bell-shaped?",
            choices: [
              c("bell", "Bell or cup shape", "wildflower", "Bell clue."),
              c("spike", "Tall spike cluster", "wildflower", "Cluster clue."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "bell",
            feedback: "Bell-shaped flowers hang or flare like a little bell."
          },
          {
            id: "pea",
            skill: "plants.flower.pea",
            question: "Which flower has pea-flower shape?",
            choices: [
              c("pea", "Banner and wings", "wildflower", "Pea-family style."),
              c("tube", "Long tube", "wildflower", "Tube clue."),
              c("beetle", "Hard wing covers", "hard_wings", "Insect clue.")
            ],
            answer: "pea",
            feedback: "Pea flowers have a distinctive banner, wings, and keel shape."
          },
          {
            id: "umbel",
            skill: "plants.flower.umbel_spike",
            question: "Which cluster looks like umbrella ribs?",
            choices: [
              c("umbel", "Umbel cluster", "wildflower", "Stalks from one point."),
              c("spike", "Flowers along a spike", "wildflower", "Spike clue."),
              c("puff", "Puffball", "puffball", "Fungus clue.")
            ],
            answer: "umbel",
            feedback: "An umbel has flower stalks radiating from one point like umbrella ribs."
          },
          {
            id: "flower_photo",
            skill: "plants.flower.symmetry",
            question: "What photo helps Flower Shape Finder?",
            choices: [
              c("both", "One flower plus cluster", "close", "Shows shape and arrangement."),
              c("leaf_only", "Only leaf edge", "wildflower", "Useful later, not flower shape."),
              c("spider", "Spider body", "spider", "Wrong lane.")
            ],
            answer: "both",
            feedback: "For flowers, show both the individual flower and how flowers are arranged."
          }
        ]
      },
      {
        id: "seed_seeker",
        title: "Seed Seeker",
        achievementId: "seed_seeker",
        achievementName: "Seed Seeker",
        fieldmarkFamily: "fruits and seeds",
        hiddenSkills: [
          "plants.seed.berry_pod",
          "plants.seed.cone_samara",
          "plants.seed.burr_capsule",
          "plants.seed.fruit_position"
        ],
        concept: "Fruits and seeds keep clues after flowers fade.",
        childPhrase: "What seed or fruit clue do you see?",
        fieldPhrase: "Fruit and seed form",
        explanation: "Look for berries, pods, cones, winged seeds, burrs, capsules, nuts, and seed heads.",
        photoPrompt: "Photograph fruits or seeds attached to the plant when possible.",
        reward: 10,
        exemplar: { visual: "wildflower", label: "Fruit clue" },
        items: [
          {
            id: "berry",
            skill: "plants.seed.berry_pod",
            question: "Which fruit is berry-like?",
            choices: [
              c("berry", "Fleshy fruit with seeds", "wildflower", "Berry clue."),
              c("pod", "Dry pod", "vine", "Pod clue."),
              c("gills", "Paper pages", "gills", "Fungus clue.")
            ],
            answer: "berry",
            feedback: "Berry-like fruits are fleshy with seeds inside."
          },
          {
            id: "pod",
            skill: "plants.seed.berry_pod",
            question: "Which fruit is a pod?",
            choices: [
              c("pod", "Dry pod or legume", "vine", "Pod clue."),
              c("samara", "Winged seed", "tree", "Wing clue."),
              c("fly", "True fly", "fly", "Insect clue.")
            ],
            answer: "pod",
            feedback: "Pods are dry fruits that often split open along seams."
          },
          {
            id: "samara",
            skill: "plants.seed.cone_samara",
            question: "Which seed has a papery wing?",
            choices: [
              c("samara", "Winged seed", "tree", "Wind flyer."),
              c("cone", "Cone", "tree", "Cone clue."),
              c("teeth", "Dangling teeth", "teeth", "Fungus clue.")
            ],
            answer: "samara",
            feedback: "A samara is a winged seed or fruit built for wind."
          },
          {
            id: "burr",
            skill: "plants.seed.burr_capsule",
            question: "Which fruit grabs onto fur or clothes?",
            choices: [
              c("burr", "Burr with hooks", "wildflower", "Hooked fruit."),
              c("capsule", "Dry capsule", "wildflower", "Capsule clue."),
              c("antenna", "Feathery antennae", "insect", "Insect clue.")
            ],
            answer: "burr",
            feedback: "Burrs use hooks to hitchhike on animals or clothing."
          },
          {
            id: "seed_photo",
            skill: "plants.seed.fruit_position",
            question: "What photo helps Seed Seeker?",
            choices: [
              c("attached", "Fruit attached to plant", "whole", "Shows position and plant."),
              c("loose", "One loose mystery seed only", "close", "Less context."),
              c("web", "Spider web", "spider", "Wrong lane.")
            ],
            answer: "attached",
            feedback: "Attached fruits show position, cluster, stem, and the plant they came from."
          }
        ]
      }
    ]
  };

  const GENERATED_LANE_MODULES = {
    universal: [
      {
        id: "living_thing_sorter",
        title: "Living Thing Sorter",
        fieldmarkFamily: "broad life forms",
        concept: "Sort the big living-thing bucket before naming details.",
        childPhrase: "Plant, fungus, animal, or not enough?",
        fieldPhrase: "Broad recognition",
        explanation: "A beginner can do useful science by sorting the big shape first and saying when the photo is not enough.",
        photoPrompt: "Use a whole-organism photo before close details.",
        exemplar: { visual: "whole", label: "Big bucket" },
        targets: [
          {
            key: "plant",
            label: "Plant",
            visual: "plant",
            sub: "Leaves, stems, blades, or fronds.",
            skill: "universal.sort.plant",
            feedback: "Plant is a broad bucket. Leaves, stems, grass blades, fronds, flowers, or fruits can support it."
          },
          {
            key: "fungus",
            label: "Fungus",
            visual: "fungus",
            sub: "Cap, shelf, puffball, jelly, or coral shape.",
            skill: "universal.sort.fungus",
            feedback: "Fungus is a broad bucket. Look for a fruiting body and what it grows from."
          },
          {
            key: "animal",
            label: "Animal",
            visual: "insect",
            sub: "Legs, wings, fur, feathers, or body parts.",
            skill: "universal.sort.animal",
            feedback: "Animal is the bucket when you see a body, legs, wings, fur, feathers, scales, or movement."
          },
          {
            key: "unknown",
            label: "Not enough",
            visual: "habitat",
            sub: "The photo lacks the organism.",
            skill: "universal.sort.unknown",
            feedback: "Not enough is a valid beginner answer. Ask for a whole-organism photo."
          }
        ],
        photo: {
          label: "Whole organism",
          visual: "whole",
          feedback: "A whole-organism photo lets the learner sort the broad bucket before details."
        }
      },
      {
        id: "whole_detail_builder",
        title: "Whole + Detail Builder",
        fieldmarkFamily: "photo sequence",
        concept: "Good observations often need both whole view and detail view.",
        childPhrase: "Whole first, detail next?",
        fieldPhrase: "Observation photo set",
        explanation: "The whole view says what kind of organism it is. The detail view shows the fieldmark.",
        photoPrompt: "Pair one whole view with one focused fieldmark photo.",
        exemplar: { visual: "close", label: "Photo pair" },
        targets: [
          {
            key: "whole",
            label: "Whole view",
            visual: "whole",
            sub: "Shows the whole organism.",
            skill: "universal.photo.whole_sequence",
            feedback: "The whole view gives shape, size, posture, and growth form."
          },
          {
            key: "detail",
            label: "Detail view",
            visual: "close",
            sub: "Shows one useful clue.",
            skill: "universal.photo.detail_sequence",
            feedback: "A detail view should answer one fieldmark question."
          },
          {
            key: "context",
            label: "Context view",
            visual: "habitat",
            sub: "Shows where it lives.",
            skill: "universal.photo.context_sequence",
            feedback: "Context can show wood, water, bark, soil, host plant, or habitat."
          },
          {
            key: "missing",
            label: "Missing clue",
            visual: "next_photo",
            sub: "Ask for the view that is absent.",
            skill: "universal.photo.missing_clue",
            feedback: "When a clue is missing, name the next photo instead of guessing."
          }
        ],
        photo: {
          label: "Whole plus detail",
          visual: "next_photo",
          feedback: "A strong beginner observation often has a whole photo and one clue photo."
        }
      },
      {
        id: "broad_rank_gate",
        title: "Broad Rank Gate",
        fieldmarkFamily: "stop at supported rank",
        concept: "Stop where the evidence stops.",
        childPhrase: "How specific can you be?",
        fieldPhrase: "Evidence rank",
        explanation: "If the clue only supports insect, fungus, plant, or spider-like animal, that is the right stopping point.",
        photoPrompt: "Ask for more fieldmarks before going more specific.",
        exemplar: { visual: "whole", label: "Stay broad" },
        targets: [
          {
            key: "kind",
            label: "Kind of thing",
            visual: "whole",
            sub: "Plant, fungus, insect, arachnid.",
            skill: "universal.rank.kind",
            feedback: "The kind of thing is a useful rank for beginners."
          },
          {
            key: "group",
            label: "Broad group",
            visual: "insect",
            sub: "Beetle, fly, mushroom, tree.",
            skill: "universal.rank.group",
            feedback: "A broad group is good when the visible fieldmark supports it."
          },
          {
            key: "species_no",
            label: "Not species yet",
            visual: "close",
            sub: "Need stronger evidence first.",
            skill: "universal.rank.not_species",
            feedback: "Species is not the beginner goal. Fieldmarks come first."
          },
          {
            key: "ask_more",
            label: "Ask for a clue",
            visual: "next_photo",
            sub: "Underside, stem, wings, or leaf node.",
            skill: "universal.rank.ask_more",
            feedback: "Asking for a better clue is often smarter than naming too specifically."
          }
        ],
        photo: {
          label: "Missing fieldmark",
          visual: "next_photo",
          feedback: "The next photo should support the next rank, not a species guess."
        }
      },
      {
        id: "two_clue_checker",
        title: "Two-Clue Checker",
        fieldmarkFamily: "evidence agreement",
        concept: "One clue is good. Two agreeing clues are better.",
        childPhrase: "Do the clues agree?",
        fieldPhrase: "Evidence agreement",
        explanation: "Leg count plus wings, leaf arrangement plus leaf shape, or cap plus underside gives stronger beginner evidence.",
        photoPrompt: "Add a second clue photo when the first clue is weak.",
        exemplar: { visual: "close", label: "Two clues" },
        targets: [
          {
            key: "leg_wing",
            label: "Legs plus wings",
            visual: "insect",
            sub: "Insect evidence pair.",
            skill: "universal.evidence.legs_wings",
            feedback: "Six legs plus wing clues can support an insect group."
          },
          {
            key: "leaf_pair_shape",
            label: "Leaf pattern plus shape",
            visual: "opposite_leaves",
            sub: "Plant evidence pair.",
            skill: "universal.evidence.leaf_pair_shape",
            feedback: "Leaf arrangement gets stronger when paired with leaf shape or edge."
          },
          {
            key: "cap_under",
            label: "Cap plus underside",
            visual: "underside",
            sub: "Fungus evidence pair.",
            skill: "universal.evidence.cap_underside",
            feedback: "Top and underside together make a stronger fungus observation."
          },
          {
            key: "body_web",
            label: "Body plus web",
            visual: "spider",
            sub: "Arachnid evidence pair.",
            skill: "universal.evidence.body_web",
            feedback: "Spider body shape plus web form can support a broad direction."
          }
        ],
        photo: {
          label: "Second clue",
          visual: "close",
          feedback: "A second clue should agree with the first or help keep the ID broad."
        }
      },
      {
        id: "not_a_species_tutor",
        title: "Not a Species Tutor",
        fieldmarkFamily: "beginner scope",
        concept: "Classroom teaches fieldmark thinking, not species naming.",
        childPhrase: "What is the safer answer?",
        fieldPhrase: "Scope control",
        explanation: "Children and super-beginners should learn broad groups, visible clues, and helpful photos before species labels.",
        photoPrompt: "Use species names only when the evidence is far stronger than this classroom requires.",
        exemplar: { visual: "whole", label: "Broad first" },
        targets: [
          {
            key: "broad_first",
            label: "Broad first",
            visual: "whole",
            sub: "Name the kind of thing.",
            skill: "universal.scope.broad_first",
            feedback: "Broad first is the Classroom rule: kind of organism, visible clue, next photo."
          },
          {
            key: "fieldmark",
            label: "Fieldmark",
            visual: "close",
            sub: "Say what you can see.",
            skill: "universal.scope.fieldmark",
            feedback: "A fieldmark is visible evidence, not a guess."
          },
          {
            key: "photo_help",
            label: "Photo help",
            visual: "next_photo",
            sub: "Ask for the missing view.",
            skill: "universal.scope.photo_help",
            feedback: "A next-photo prompt is part of the learning loop."
          },
          {
            key: "no_species",
            label: "Do not force species",
            visual: "habitat",
            sub: "Stop at the supported level.",
            skill: "universal.scope.no_species",
            feedback: "Not forcing species is a skill, especially for beginners."
          }
        ],
        photo: {
          label: "Evidence photo",
          visual: "close",
          feedback: "The goal is an evidence photo, not a species answer."
        }
      },
      {
        id: "field_sign_reader",
        title: "Field Sign Reader",
        fieldmarkFamily: "indirect signs",
        concept: "Some clues are signs left by living things.",
        childPhrase: "Is this a body or a sign?",
        fieldPhrase: "Direct vs indirect evidence",
        explanation: "A leaf mine, gall, web, track, fruit, or chew mark may be evidence, but it is not always the organism itself.",
        photoPrompt: "Photograph the sign and the plant or surface it is on.",
        exemplar: { visual: "plant", label: "Field sign" },
        targets: [
          {
            key: "mine",
            label: "Leaf mine",
            visual: "plant",
            sub: "A trail inside a leaf.",
            skill: "universal.sign.leaf_mine",
            feedback: "A leaf mine is a sign of an insect larva, not the insect body."
          },
          {
            key: "gall",
            label: "Gall",
            visual: "plant",
            sub: "A bump made by another organism.",
            skill: "universal.sign.gall",
            feedback: "A gall is a plant growth triggered by another organism."
          },
          {
            key: "web",
            label: "Web",
            visual: "spider",
            sub: "A silk structure.",
            skill: "universal.sign.web",
            feedback: "A web can be evidence, but connect it to the spider if possible."
          },
          {
            key: "chew",
            label: "Chew marks",
            visual: "wildflower",
            sub: "Feeding sign.",
            skill: "universal.sign.chew",
            feedback: "Chew marks show activity, but the chewer may be gone."
          }
        ],
        photo: {
          label: "Sign plus host",
          visual: "habitat",
          feedback: "Show the sign and what it is attached to."
        }
      },
      {
        id: "size_scale_scout",
        title: "Size Scale Scout",
        fieldmarkFamily: "size and scale",
        concept: "Size helps, but size alone is not an ID.",
        childPhrase: "How big is it?",
        fieldPhrase: "Scale evidence",
        explanation: "A safe scale clue can help helpers understand whether something is tiny, small, hand-sized, or large.",
        photoPrompt: "Use safe nearby scale, never harm the organism.",
        exemplar: { visual: "whole", label: "Scale" },
        targets: [
          {
            key: "tiny",
            label: "Tiny",
            visual: "tick_mite",
            sub: "Needs close detail.",
            skill: "universal.scale.tiny",
            feedback: "Tiny organisms need close, sharp photos and often a whole-body view too."
          },
          {
            key: "small",
            label: "Small",
            visual: "insect",
            sub: "Handheld distance.",
            skill: "universal.scale.small",
            feedback: "Small organisms often need one whole view and one body-part detail."
          },
          {
            key: "large",
            label: "Large",
            visual: "tree",
            sub: "Step back.",
            skill: "universal.scale.large",
            feedback: "Large organisms need a step-back view, then a clue close-up."
          },
          {
            key: "safe_scale",
            label: "Safe scale",
            visual: "whole",
            sub: "Nearby object, not touching.",
            skill: "universal.scale.safe",
            feedback: "Scale should help without moving, squashing, or collecting the organism."
          }
        ],
        photo: {
          label: "Safe scale view",
          visual: "whole",
          feedback: "A safe scale view keeps the organism intact and readable."
        }
      },
      {
        id: "season_clue_watch",
        title: "Season Clue Watch",
        fieldmarkFamily: "time and season",
        concept: "Some clues appear only at certain times.",
        childPhrase: "What time clue matters?",
        fieldPhrase: "Seasonal evidence",
        explanation: "Flowers, fruits, fungus flushes, insect life stages, and leaf-out can change through the year.",
        photoPrompt: "Record the observation date and the visible life stage.",
        exemplar: { visual: "wildflower", label: "Season clue" },
        targets: [
          {
            key: "flowering",
            label: "Flowering",
            visual: "wildflower",
            sub: "Flower stage.",
            skill: "universal.season.flowering",
            feedback: "Flowering is a seasonal clue; the plant may look different later."
          },
          {
            key: "fruiting",
            label: "Fruiting",
            visual: "wildflower",
            sub: "Fruit or seed stage.",
            skill: "universal.season.fruiting",
            feedback: "Fruits and seeds can remain after flowers fade."
          },
          {
            key: "fungus_flush",
            label: "Fungus fruiting",
            visual: "fungus",
            sub: "Mushroom appears.",
            skill: "universal.season.fungus",
            feedback: "Fungi may fruit briefly after rain or in certain seasons."
          },
          {
            key: "life_stage",
            label: "Life stage",
            visual: "insect",
            sub: "Larva, adult, flower, fruit.",
            skill: "universal.season.stage",
            feedback: "Life stage can change the visible clues, so record what you see now."
          }
        ],
        photo: {
          label: "Current stage",
          visual: "close",
          feedback: "Photograph the stage that is visible today."
        }
      },
      {
        id: "ethical_explorer",
        title: "Ethical Explorer",
        fieldmarkFamily: "careful observation",
        concept: "Good fieldmark learning is gentle.",
        childPhrase: "What is the careful move?",
        fieldPhrase: "Ethical observation",
        explanation: "Look closely, photograph carefully, avoid harm, and stay broad when evidence is missing.",
        photoPrompt: "Keep organisms and habitats intact while gathering visible clues.",
        exemplar: { visual: "whole", label: "Careful" },
        targets: [
          {
            key: "leave",
            label: "Leave it in place",
            visual: "habitat",
            sub: "Observe without damage.",
            skill: "universal.ethics.leave_place",
            feedback: "Leaving the organism in place protects both the organism and the habitat."
          },
          {
            key: "no_taste",
            label: "Never taste",
            visual: "fungus",
            sub: "Especially fungi and plants.",
            skill: "universal.ethics.no_taste",
            feedback: "Never taste unknown organisms as part of app-based learning."
          },
          {
            key: "gentle",
            label: "Gentle photos",
            visual: "close",
            sub: "Move yourself, not the organism.",
            skill: "universal.ethics.gentle_photos",
            feedback: "Good photos do not require damaging the organism."
          },
          {
            key: "broad",
            label: "Stay broad",
            visual: "whole",
            sub: "Do not overclaim.",
            skill: "universal.ethics.stay_broad",
            feedback: "Staying broad is more honest than guessing."
          }
        ],
        photo: {
          label: "Careful photo",
          visual: "close",
          feedback: "A careful photo gets evidence without harm."
        }
      },
      {
        id: "lookalike_guard",
        title: "Lookalike Guard",
        fieldmarkFamily: "confusable clues",
        concept: "Similar-looking things can belong to different lanes.",
        childPhrase: "What could this be confused with?",
        fieldPhrase: "Lookalike separation",
        explanation: "A moth is not a fly, a harvestman is not an insect, and moss is not always a tiny seed plant.",
        photoPrompt: "Use the clue that separates the lookalikes.",
        exemplar: { visual: "next_photo", label: "Separate" },
        targets: [
          {
            key: "fly_moth",
            label: "Fly vs moth",
            visual: "one_pair_wings",
            sub: "Wing count and wing texture.",
            skill: "universal.lookalike.fly_moth",
            feedback: "Fly vs moth often starts with one wing pair vs scaly wings."
          },
          {
            key: "spider_insect",
            label: "Spider vs insect",
            visual: "eight_legs",
            sub: "Eight legs vs six legs.",
            skill: "universal.lookalike.spider_insect",
            feedback: "Eight legs vs six legs is a simple lookalike guard."
          },
          {
            key: "moss_seedling",
            label: "Moss vs seedling",
            visual: "moss",
            sub: "Tiny mat vs vascular plant.",
            skill: "universal.lookalike.moss_seedling",
            feedback: "Moss-like mats and tiny seedlings need close views and growth form."
          },
          {
            key: "fungus_plant",
            label: "Fungus vs plant",
            visual: "fungus",
            sub: "No leaves, fruiting body shape.",
            skill: "universal.lookalike.fungus_plant",
            feedback: "Fungi do not show ordinary leaves or stems like plants do."
          }
        ],
        photo: {
          label: "Separating clue",
          visual: "close",
          feedback: "For lookalikes, take the photo that shows the separating clue."
        }
      },
      {
        id: "field_note_builder",
        title: "Field Note Builder",
        fieldmarkFamily: "plain-language notes",
        concept: "A good note says what you saw in plain words.",
        childPhrase: "What note helps a helper?",
        fieldPhrase: "Field note",
        explanation: "Beginner notes can be simple: where it grew, what body part was visible, what clue was missing, and what photo helps.",
        photoPrompt: "Pair a plain note with a clear photo.",
        exemplar: { visual: "habitat", label: "Note" },
        targets: [
          {
            key: "where",
            label: "Where it was",
            visual: "habitat",
            sub: "On wood, soil, leaf, bark, water.",
            skill: "universal.note.where",
            feedback: "Where it was found can help connect the clue to the organism."
          },
          {
            key: "what",
            label: "What you saw",
            visual: "close",
            sub: "Six legs, gills, leaf pairs.",
            skill: "universal.note.what",
            feedback: "A note should say the visible clue, not just the guessed name."
          },
          {
            key: "missing",
            label: "What is missing",
            visual: "next_photo",
            sub: "Underside, base, wing, stem.",
            skill: "universal.note.missing",
            feedback: "Naming the missing clue tells you what photo to take next."
          },
          {
            key: "broad",
            label: "Broad direction",
            visual: "whole",
            sub: "Plant, fungus, insect, arachnid.",
            skill: "universal.note.broad",
            feedback: "A helpful beginner note can stop at a broad direction."
          }
        ],
        photo: {
          label: "Photo plus note",
          visual: "next_photo",
          feedback: "A clear photo and a plain field note are a strong beginner pair."
        }
      }
    ],
    fungi: [
      {
        id: "cap_surface_scout",
        title: "Cap Surface Scout",
        fieldmarkFamily: "fungus cap surface",
        concept: "The top of a fungus can hold visible clues.",
        childPhrase: "What is on the cap?",
        fieldPhrase: "Cap surface",
        explanation: "Cap shape, dry or slimy surface, scales, warts, and bruising can all be beginner fieldmarks.",
        photoPrompt: "Take a top photo and a side photo so the cap and stalk both show.",
        exemplar: { visual: "cap_mushroom", label: "Cap top" },
        targets: [
          {
            key: "slimy",
            label: "Slimy cap",
            visual: "cap_mushroom",
            sub: "Wet-looking surface.",
            skill: "fungi.cap.slimy",
            feedback: "Slimy vs dry cap surface can matter, but it changes with weather."
          },
          {
            key: "dry",
            label: "Dry cap",
            visual: "cap_mushroom",
            sub: "Not wet or sticky.",
            skill: "fungi.cap.dry",
            feedback: "Dry cap is a surface clue; pair it with underside and base clues."
          },
          {
            key: "scales",
            label: "Scales or warts",
            visual: "cap_mushroom",
            sub: "Bits on the cap.",
            skill: "fungi.cap.scales_warts",
            feedback: "Scales or warts on a cap are visible cap-surface clues."
          },
          {
            key: "bruise",
            label: "Bruising color",
            visual: "cap_mushroom",
            sub: "Color change after handling or damage.",
            skill: "fungi.cap.bruising",
            feedback: "Bruising or staining can be useful, but observe gently and do not taste."
          }
        ],
        photo: {
          label: "Top and side",
          visual: "side",
          feedback: "A top photo shows cap surface; a side photo shows shape and stalk."
        }
      },
      {
        id: "gill_attachment_lab",
        title: "Gill Attachment Lab",
        fieldmarkFamily: "gill attachment",
        concept: "Gills can meet the stalk in different ways.",
        childPhrase: "How do the pages meet the stem?",
        fieldPhrase: "Gill attachment",
        explanation: "Gills may be free from the stalk, attached to it, or run down it. Beginners can notice the pattern without naming species.",
        photoPrompt: "Photograph the underside from the side so the stalk connection is visible.",
        exemplar: { visual: "gills", label: "Gill connection" },
        targets: [
          {
            key: "free",
            label: "Free gills",
            visual: "gills",
            sub: "Pages stop before the stalk.",
            skill: "fungi.gills.free",
            feedback: "Free gills stop before they reach the stalk."
          },
          {
            key: "attached",
            label: "Attached gills",
            visual: "gills",
            sub: "Pages meet the stalk.",
            skill: "fungi.gills.attached",
            feedback: "Attached gills connect to the stalk."
          },
          {
            key: "decurrent",
            label: "Running-down gills",
            visual: "gills",
            sub: "Pages run down the stalk.",
            skill: "fungi.gills.decurrent",
            feedback: "Decurrent gills run down the stalk instead of stopping at it."
          },
          {
            key: "color",
            label: "Gill color",
            visual: "gills",
            sub: "The pages have a visible color.",
            skill: "fungi.gills.color",
            feedback: "Gill color is a clue, especially when paired with spore color and cap shape."
          }
        ],
        photo: {
          label: "Side underside",
          visual: "underside",
          feedback: "A side underside photo can show whether gills are free, attached, or running down."
        }
      },
      {
        id: "spore_color_station",
        title: "Spore Color Station",
        fieldmarkFamily: "spore color",
        concept: "Spores can have different colors.",
        childPhrase: "What color are the spores?",
        fieldPhrase: "Spore print color",
        explanation: "Spore color can be useful, but Classroom only teaches the idea. It is not an eating-safety test.",
        photoPrompt: "If a spore print exists, photograph it with the mushroom, but do not rely on it alone.",
        exemplar: { visual: "gills", label: "Spore color" },
        targets: [
          {
            key: "white",
            label: "White spores",
            visual: "gills",
            sub: "Pale print.",
            skill: "fungi.spores.white",
            feedback: "White spore print is one possible spore clue, not a final ID."
          },
          {
            key: "brown",
            label: "Brown spores",
            visual: "gills",
            sub: "Brown print.",
            skill: "fungi.spores.brown",
            feedback: "Brown spore color can help separate broad groups."
          },
          {
            key: "black",
            label: "Black spores",
            visual: "gills",
            sub: "Dark print.",
            skill: "fungi.spores.black",
            feedback: "Dark spore color is a clue to record if visible."
          },
          {
            key: "rust",
            label: "Rusty spores",
            visual: "gills",
            sub: "Orange-brown print.",
            skill: "fungi.spores.rust",
            feedback: "Rusty spore color can matter, but it must agree with other fieldmarks."
          }
        ],
        photo: {
          label: "Spore print with fungus",
          visual: "close",
          feedback: "A spore print is most useful when connected to the mushroom it came from."
        }
      },
      {
        id: "fungus_cluster_counter",
        title: "Fungus Cluster Counter",
        fieldmarkFamily: "fruiting pattern",
        concept: "Fungi can fruit alone, scattered, clustered, or in rings.",
        childPhrase: "How are they growing together?",
        fieldPhrase: "Fruiting pattern",
        explanation: "Clustered vs solitary fruiting is a broad pattern that beginners can photograph and describe.",
        photoPrompt: "Step back enough to show whether there is one fungus or many.",
        exemplar: { visual: "cap_mushroom", label: "Cluster" },
        targets: [
          {
            key: "solitary",
            label: "Solitary",
            visual: "cap_mushroom",
            sub: "One fruiting body.",
            skill: "fungi.pattern.solitary",
            feedback: "Solitary means one fruiting body is visible."
          },
          {
            key: "clustered",
            label: "Clustered",
            visual: "cap_mushroom",
            sub: "Many from one spot.",
            skill: "fungi.pattern.clustered",
            feedback: "Clustered fruiting means many fruiting bodies grow close together."
          },
          {
            key: "scattered",
            label: "Scattered",
            visual: "habitat",
            sub: "Spread across an area.",
            skill: "fungi.pattern.scattered",
            feedback: "Scattered means multiple fruiting bodies spread across the habitat."
          },
          {
            key: "ring",
            label: "Ring or arc",
            visual: "habitat",
            sub: "A curved pattern.",
            skill: "fungi.pattern.ring",
            feedback: "Some fungi appear in arcs or rings; photograph the pattern if visible."
          }
        ],
        photo: {
          label: "Step-back pattern",
          visual: "habitat",
          feedback: "A step-back view can show solitary, clustered, scattered, or ring patterns."
        }
      },
      {
        id: "bracket_shelf_builder",
        title: "Bracket Shelf Builder",
        fieldmarkFamily: "shelf fungi",
        concept: "Shelf fungi often grow like ledges on wood.",
        childPhrase: "Is it a shelf on wood?",
        fieldPhrase: "Bracket fungus form",
        explanation: "Shelf or bracket fungi are often attached to wood and may have pores, bands, or a tough shelf shape.",
        photoPrompt: "Photograph the side, top, underside, and wood attachment.",
        exemplar: { visual: "shelf_fungus", label: "Wood shelf" },
        targets: [
          {
            key: "shelf",
            label: "Shelf shape",
            visual: "shelf_fungus",
            sub: "A ledge from wood.",
            skill: "fungi.shelf.shape",
            feedback: "Shelf shape is a broad fungus form, especially when growing from wood."
          },
          {
            key: "bracket",
            label: "Bracket on trunk",
            visual: "shelf_fungus",
            sub: "Attached to a tree or log.",
            skill: "fungi.shelf.bracket",
            feedback: "Bracket fungi attach to wood like shelves or ledges."
          },
          {
            key: "bands",
            label: "Color bands",
            visual: "shelf_fungus",
            sub: "Zones on the top.",
            skill: "fungi.shelf.bands",
            feedback: "Color bands can be a shelf-fungus surface clue."
          },
          {
            key: "pores",
            label: "Pore underside",
            visual: "pores",
            sub: "Tiny holes underneath.",
            skill: "fungi.shelf.pores",
            feedback: "Many shelf fungi have a pore surface underneath."
          }
        ],
        photo: {
          label: "Shelf plus wood",
          visual: "shelf_fungus",
          feedback: "Show the shelf and the wood it grows from."
        }
      },
      {
        id: "puffball_patrol",
        title: "Puffball Patrol",
        fieldmarkFamily: "puffball clues",
        concept: "Puffballs are round fungi without gills.",
        childPhrase: "Is it a puffball shape?",
        fieldPhrase: "Puffball form",
        explanation: "A puffball is more ball-like than cap-and-stalk-like. Beginners should look for round form and no gilled underside.",
        photoPrompt: "Photograph the whole ball shape and where it grows.",
        exemplar: { visual: "puffball", label: "Puffball" },
        targets: [
          {
            key: "round",
            label: "Round ball",
            visual: "puffball",
            sub: "Ball-like fruiting body.",
            skill: "fungi.puffball.round",
            feedback: "Puffballs are round or pear-shaped rather than cap-and-stalk mushrooms."
          },
          {
            key: "no_gills",
            label: "No gills",
            visual: "puffball",
            sub: "No paper pages under a cap.",
            skill: "fungi.puffball.no_gills",
            feedback: "Puffballs do not have a normal cap underside with gills."
          },
          {
            key: "surface",
            label: "Outer surface",
            visual: "puffball",
            sub: "Smooth, bumpy, or cracked.",
            skill: "fungi.puffball.surface",
            feedback: "The outside surface can be smooth, bumpy, spiny, or cracked."
          },
          {
            key: "ground",
            label: "Growing place",
            visual: "habitat",
            sub: "Soil, wood, or litter.",
            skill: "fungi.puffball.substrate",
            feedback: "Even puffballs need a note about where they grow."
          }
        ],
        photo: {
          label: "Whole puffball",
          visual: "puffball",
          feedback: "Show the whole puffball and its growing place."
        }
      },
      {
        id: "jelly_coral_corner",
        title: "Jelly and Coral Corner",
        fieldmarkFamily: "unusual fungus forms",
        concept: "Not every fungus has a cap.",
        childPhrase: "Blob, branch, cup, or crust?",
        fieldPhrase: "Non-cap fungus form",
        explanation: "Jelly, coral, cup, crust, and bracket forms teach beginners that fungi have many shapes.",
        photoPrompt: "Photograph the whole shape and the surface it grows from.",
        exemplar: { visual: "jelly_fungus", label: "Jelly blob" },
        targets: [
          {
            key: "jelly",
            label: "Jelly blob",
            visual: "jelly_fungus",
            sub: "Soft blob shape.",
            skill: "fungi.unusual.jelly",
            feedback: "Jelly fungi can look like soft blobs or folds."
          },
          {
            key: "coral",
            label: "Coral branches",
            visual: "coral_fungus",
            sub: "Branching fingers.",
            skill: "fungi.unusual.coral",
            feedback: "Coral fungi look branchy, like underwater coral."
          },
          {
            key: "cup",
            label: "Cup shape",
            visual: "cup_fungus",
            sub: "Bowl or cup.",
            skill: "fungi.unusual.cup",
            feedback: "Cup fungi look like tiny bowls or cups."
          },
          {
            key: "crust",
            label: "Crust on surface",
            visual: "shelf_fungus",
            sub: "Flat growth on wood or bark.",
            skill: "fungi.unusual.crust",
            feedback: "Some fungi spread as crusts on wood or bark."
          }
        ],
        photo: {
          label: "Whole unusual form",
          visual: "whole",
          feedback: "For unusual fungi, show the whole shape and what it is attached to."
        }
      },
      {
        id: "odor_bruise_watch",
        title: "Odor and Bruise Watch",
        fieldmarkFamily: "odor and staining",
        concept: "Some fungi smell or change color, but safety comes first.",
        childPhrase: "What changed or smelled?",
        fieldPhrase: "Odor and bruising",
        explanation: "Odor and bruising are notes for careful observers. They are never eating-safety proof.",
        photoPrompt: "Record visible color changes; do not taste unknown fungi.",
        exemplar: { visual: "cap_mushroom", label: "Color change" },
        targets: [
          {
            key: "odor",
            label: "Odor note",
            visual: "cap_mushroom",
            sub: "Smell described in plain words.",
            skill: "fungi.odor.note",
            feedback: "Odor can be noted in plain words, but never by tasting."
          },
          {
            key: "bruising",
            label: "Bruising color",
            visual: "cap_mushroom",
            sub: "Color change after damage.",
            skill: "fungi.odor.bruising",
            feedback: "Bruising or staining is a visible color-change clue."
          },
          {
            key: "staining",
            label: "Staining",
            visual: "cap_mushroom",
            sub: "Color appears where touched or cut.",
            skill: "fungi.odor.staining",
            feedback: "Staining should be recorded carefully and paired with other clues."
          },
          {
            key: "no_taste",
            label: "Do not taste",
            visual: "fungus",
            sub: "Safety rule.",
            skill: "fungi.odor.no_taste",
            feedback: "Taste is not part of beginner fungus learning."
          }
        ],
        photo: {
          label: "Visible color change",
          visual: "close",
          feedback: "Photograph the visible change; do not taste or use it for edibility."
        }
      },
      {
        id: "tree_partner_clue",
        title: "Tree Partner Clue",
        fieldmarkFamily: "nearby tree association",
        concept: "Nearby trees can be context for some fungi.",
        childPhrase: "What trees are nearby?",
        fieldPhrase: "Tree association",
        explanation: "Some fungi grow with certain trees or on certain wood. Beginners can record nearby trees without overclaiming.",
        photoPrompt: "Add a habitat photo showing the nearby tree or wood when useful.",
        exemplar: { visual: "tree", label: "Tree partner" },
        targets: [
          {
            key: "oak",
            label: "Oak-like leaves or acorns",
            visual: "tree",
            sub: "Nearby broadleaf clue.",
            skill: "fungi.tree.oak_like",
            feedback: "Nearby trees can be useful context, especially when visible and identifiable broadly."
          },
          {
            key: "pine",
            label: "Needles or cones",
            visual: "tree",
            sub: "Conifer context.",
            skill: "fungi.tree.conifer",
            feedback: "Conifers nearby can be useful fungus context."
          },
          {
            key: "deadwood",
            label: "Dead wood",
            visual: "shelf_fungus",
            sub: "Log, stump, or snag.",
            skill: "fungi.tree.deadwood",
            feedback: "Dead wood is often more important than the exact tree name for beginners."
          },
          {
            key: "unknown_tree",
            label: "Tree unknown",
            visual: "habitat",
            sub: "Record broadly.",
            skill: "fungi.tree.unknown",
            feedback: "If the tree is unknown, record what you can see without guessing."
          }
        ],
        photo: {
          label: "Fungus plus tree",
          visual: "habitat",
          feedback: "A habitat photo can show tree partner or wood substrate."
        }
      },
      {
        id: "fungus_weather_watch",
        title: "Fungus Weather Watch",
        fieldmarkFamily: "condition and age",
        concept: "Weather and age can change fungus clues.",
        childPhrase: "Fresh, dry, old, or wet?",
        fieldPhrase: "Condition",
        explanation: "Slimy caps dry out, colors fade, and old mushrooms break down. Condition helps explain why clues look strange.",
        photoPrompt: "Photograph the freshest example if several are present.",
        exemplar: { visual: "cap_mushroom", label: "Condition" },
        targets: [
          {
            key: "fresh",
            label: "Fresh",
            visual: "cap_mushroom",
            sub: "Firm and clear.",
            skill: "fungi.condition.fresh",
            feedback: "Fresh fruiting bodies usually show fieldmarks best."
          },
          {
            key: "old",
            label: "Old or decaying",
            visual: "fungus",
            sub: "Breaking down.",
            skill: "fungi.condition.old",
            feedback: "Old fungi can lose clear shape, color, and underside clues."
          },
          {
            key: "wet",
            label: "Wet",
            visual: "cap_mushroom",
            sub: "Rain may change texture.",
            skill: "fungi.condition.wet",
            feedback: "Rain can make surfaces look slimy or darker."
          },
          {
            key: "dry",
            label: "Dry",
            visual: "cap_mushroom",
            sub: "Sun can crack or fade.",
            skill: "fungi.condition.dry",
            feedback: "Dry weather can fade color or crack surfaces."
          }
        ],
        photo: {
          label: "Fresh example",
          visual: "whole",
          feedback: "If several are present, photograph a fresh one plus the group pattern."
        }
      },
      {
        id: "fungus_photo_set_review",
        title: "Fungus Photo Set Review",
        fieldmarkFamily: "fungus photo set",
        concept: "A fungus lesson often needs a photo set.",
        childPhrase: "Which fungus photos help most?",
        fieldPhrase: "Fungus evidence set",
        explanation: "Top, side, underside, base, and substrate photos answer different fungus questions.",
        photoPrompt: "Build a safe photo set without tasting or damaging habitat.",
        exemplar: { visual: "underside", label: "Photo set" },
        targets: [
          {
            key: "top",
            label: "Top",
            visual: "cap_mushroom",
            sub: "Cap shape and surface.",
            skill: "fungi.photos.top",
            feedback: "Top photos show cap color, shape, scales, or warts."
          },
          {
            key: "underside",
            label: "Underside",
            visual: "underside",
            sub: "Gills, pores, teeth, folds, smooth.",
            skill: "fungi.photos.underside",
            feedback: "Underside photos answer one of the biggest fungus questions."
          },
          {
            key: "base",
            label: "Base",
            visual: "base",
            sub: "Stalk base, cup, bulb.",
            skill: "fungi.photos.base",
            feedback: "Base photos can show cup, bulb, or whether there is a stalk."
          },
          {
            key: "substrate",
            label: "Substrate",
            visual: "habitat",
            sub: "Wood, soil, leaf litter.",
            skill: "fungi.photos.substrate",
            feedback: "Substrate photos show what the fungus grows from."
          }
        ],
        photo: {
          label: "Top, side, underside, base",
          visual: "next_photo",
          feedback: "A good fungus set answers several fieldmark questions."
        }
      }
    ],
    insects: [
      {
        id: "beetle_backpack_lab",
        title: "Beetle Backpack Lab",
        fieldmarkFamily: "beetle wing covers",
        concept: "Beetles often have hard front wings like a backpack shell.",
        childPhrase: "Do you see hard backpack wings?",
        fieldPhrase: "Elytra",
        explanation: "Hard wing covers meeting in a straight line are a strong beetle direction.",
        photoPrompt: "A top view can show the hard wing covers.",
        exemplar: { visual: "hard_wings", label: "Backpack wings" },
        targets: [
          {
            key: "elytra",
            label: "Hard wing covers",
            visual: "hard_wings",
            sub: "Beetle backpack.",
            skill: "insects.beetle.elytra",
            feedback: "Hard wing covers are called elytra and strongly suggest beetles."
          },
          {
            key: "seam",
            label: "Straight center line",
            visual: "hard_wings",
            sub: "Where covers meet.",
            skill: "insects.beetle.seam",
            feedback: "The straight line down the back is where beetle wing covers meet."
          },
          {
            key: "chew",
            label: "Chewing jaws",
            visual: "beetle",
            sub: "Often visible on beetles.",
            skill: "insects.beetle.chewing",
            feedback: "Chewing jaws can support beetle direction when paired with wing covers."
          },
          {
            key: "not_moth",
            label: "Not dusty wings",
            visual: "hard_wings",
            sub: "Hard, not scaly.",
            skill: "insects.beetle.not_moth",
            feedback: "Beetle wing covers are hard, not powdery or scaly like moth wings."
          }
        ],
        photo: {
          label: "Top of back",
          visual: "close",
          feedback: "A top photo shows the hard covers and center line."
        }
      },
      {
        id: "fly_haltere_lab",
        title: "Fly Haltere Lab",
        fieldmarkFamily: "fly clues",
        concept: "True flies have one visible wing pair and tiny balance knobs.",
        childPhrase: "One wing pair or two?",
        fieldPhrase: "Dipteran wing clues",
        explanation: "One pair of wings points toward true flies. Tiny knobs behind the wings are halteres.",
        photoPrompt: "Use a side or top view that shows the wing base.",
        exemplar: { visual: "one_pair_wings", label: "One pair" },
        targets: [
          {
            key: "one_pair",
            label: "One wing pair",
            visual: "one_pair_wings",
            sub: "True fly direction.",
            skill: "insects.fly.one_pair",
            feedback: "True flies have one visible pair of wings."
          },
          {
            key: "halteres",
            label: "Tiny balance knobs",
            visual: "fly",
            sub: "Behind the wings.",
            skill: "insects.fly.halteres",
            feedback: "Halteres are tiny knobbed balancing organs behind a fly's wings."
          },
          {
            key: "big_eyes",
            label: "Big eyes",
            visual: "fly",
            sub: "Often large compound eyes.",
            skill: "insects.fly.eyes",
            feedback: "Many flies have large compound eyes, but use wing clues too."
          },
          {
            key: "sponge",
            label: "Sponge mouth",
            visual: "fly",
            sub: "Mouthpart clue.",
            skill: "insects.fly.sponge_mouth",
            feedback: "Some flies have sponge-like mouthparts."
          }
        ],
        photo: {
          label: "Wing base",
          visual: "side",
          feedback: "A side or top view can show one wing pair and halteres."
        }
      },
      {
        id: "moth_rest_stop",
        title: "Moth Rest Stop",
        fieldmarkFamily: "butterfly and moth clues",
        concept: "Butterflies and moths often have scaly wings.",
        childPhrase: "Dusty wings or clear wings?",
        fieldPhrase: "Lepidoptera clues",
        explanation: "Scaly, powdery wings and resting posture can point toward butterfly or moth direction.",
        photoPrompt: "Photograph the wings at rest from above if possible.",
        exemplar: { visual: "scaly_wings", label: "Scaly wings" },
        targets: [
          {
            key: "scales",
            label: "Scaly wings",
            visual: "scaly_wings",
            sub: "Dusty-looking surface.",
            skill: "insects.moth.scales",
            feedback: "Butterflies and moths have scales on their wings."
          },
          {
            key: "resting",
            label: "Resting posture",
            visual: "butterfly",
            sub: "Wings open, closed, or roofed.",
            skill: "insects.moth.resting",
            feedback: "Resting posture can help, but it is not enough alone."
          },
          {
            key: "proboscis",
            label: "Long straw",
            visual: "butterfly",
            sub: "Nectar mouthpart.",
            skill: "insects.moth.proboscis",
            feedback: "A long coiled proboscis can support butterfly or moth direction."
          },
          {
            key: "caterpillar",
            label: "Caterpillar body",
            visual: "insect",
            sub: "Larval stage.",
            skill: "insects.moth.caterpillar",
            feedback: "Caterpillars are larval insects; broad stage matters."
          }
        ],
        photo: {
          label: "Resting wings",
          visual: "close",
          feedback: "A clear view of resting wings helps compare scaly wing clues."
        }
      },
      {
        id: "true_bug_x_gate",
        title: "True Bug X Gate",
        fieldmarkFamily: "true bug clues",
        concept: "True bugs often have half-hard wings and a piercing beak.",
        childPhrase: "Do you see the X wings?",
        fieldPhrase: "Hemelytra and beak",
        explanation: "An X-like wing pattern plus a piercing beak can point toward true bugs.",
        photoPrompt: "Use a top view for wing pattern and a side view for the beak.",
        exemplar: { visual: "half_hard_wings", label: "X wings" },
        targets: [
          {
            key: "x_pattern",
            label: "X wing pattern",
            visual: "half_hard_wings",
            sub: "Overlapping forewings.",
            skill: "insects.true_bug.x_pattern",
            feedback: "Many true bugs show an X-like pattern across the folded wings."
          },
          {
            key: "beak",
            label: "Piercing beak",
            visual: "true_bug",
            sub: "Straw-like mouthpart.",
            skill: "insects.true_bug.beak",
            feedback: "A piercing beak supports true bug direction."
          },
          {
            key: "half_hard",
            label: "Half-hard wings",
            visual: "half_hard_wings",
            sub: "Leathery near body, softer at tips.",
            skill: "insects.true_bug.half_hard",
            feedback: "Hemelytra are partly leathery and partly membranous."
          },
          {
            key: "shield",
            label: "Shield-like body",
            visual: "true_bug",
            sub: "Some true bugs are shield-shaped.",
            skill: "insects.true_bug.body",
            feedback: "Shield shape can help, but pair it with wing and beak clues."
          }
        ],
        photo: {
          label: "Top and side",
          visual: "side",
          feedback: "Top view shows X pattern; side view can show the beak."
        }
      },
      {
        id: "dragonfly_dock",
        title: "Dragonfly Dock",
        fieldmarkFamily: "dragonfly and damselfly clues",
        concept: "Odonates have long bodies, big eyes, and special wing posture.",
        childPhrase: "Dragonfly or damselfly direction?",
        fieldPhrase: "Odonate clues",
        explanation: "Dragonflies often hold wings open. Damselflies often hold wings closed. Use broad direction first.",
        photoPrompt: "A top view of resting wings and body is helpful.",
        exemplar: { visual: "dragonfly", label: "Long body" },
        targets: [
          {
            key: "open",
            label: "Wings held open",
            visual: "dragonfly",
            sub: "Dragonfly direction.",
            skill: "insects.odonate.open_wings",
            feedback: "Dragonflies often rest with wings held open."
          },
          {
            key: "closed",
            label: "Wings held closed",
            visual: "clear_wings",
            sub: "Damselfly direction.",
            skill: "insects.odonate.closed_wings",
            feedback: "Damselflies often rest with wings held together or closed."
          },
          {
            key: "eyes",
            label: "Huge eyes",
            visual: "dragonfly",
            sub: "Large compound eyes.",
            skill: "insects.odonate.eyes",
            feedback: "Large eyes are useful, but wing posture and body shape help too."
          },
          {
            key: "long_body",
            label: "Long abdomen",
            visual: "dragonfly",
            sub: "Long narrow body.",
            skill: "insects.odonate.long_body",
            feedback: "Odonates often have long, narrow abdomens."
          }
        ],
        photo: {
          label: "Resting top view",
          visual: "whole",
          feedback: "A resting top view can show wing posture, eyes, and long body."
        }
      },
      {
        id: "bee_wasp_ant_station",
        title: "Bee Wasp Ant Station",
        fieldmarkFamily: "bee, wasp, and ant clues",
        concept: "Bees, wasps, and ants share a family of body-plan clues.",
        childPhrase: "Fuzzy, narrow waist, or elbowed antennae?",
        fieldPhrase: "Hymenopteran clues",
        explanation: "Fuzzy bodies, pollen baskets, narrow waists, and elbowed antennae can point to bee, wasp, or ant directions.",
        photoPrompt: "Use side or top views that show body shape and antennae.",
        exemplar: { visual: "bee_wasp_ant", label: "Bee/wasp/ant" },
        targets: [
          {
            key: "pollen",
            label: "Pollen baskets",
            visual: "bee_wasp_ant",
            sub: "Packed pollen on hind legs.",
            skill: "insects.hymenoptera.pollen",
            feedback: "Pollen baskets can point toward bees."
          },
          {
            key: "fuzzy",
            label: "Fuzzy body",
            visual: "bee_wasp_ant",
            sub: "Hairy body clue.",
            skill: "insects.hymenoptera.fuzzy",
            feedback: "Fuzzy body can support bee direction when paired with other clues."
          },
          {
            key: "waist",
            label: "Narrow waist",
            visual: "bee_wasp_ant",
            sub: "Pinched middle.",
            skill: "insects.hymenoptera.waist",
            feedback: "A narrow waist can support wasp or ant direction."
          },
          {
            key: "elbow",
            label: "Elbowed antennae",
            visual: "insect",
            sub: "Bent antennae.",
            skill: "insects.hymenoptera.elbow_antennae",
            feedback: "Elbowed antennae are especially useful in ants."
          }
        ],
        photo: {
          label: "Body and antennae",
          visual: "side",
          feedback: "A side or top view can show waist, pollen, fuzz, and antennae."
        }
      },
      {
        id: "larva_detective",
        title: "Larva Detective",
        fieldmarkFamily: "insect larvae",
        concept: "Young insects may look nothing like adults.",
        childPhrase: "Larva, case, mine, or gall?",
        fieldPhrase: "Larval clues",
        explanation: "Caterpillars, cases, leaf mines, and galls can be beginner insect evidence.",
        photoPrompt: "Photograph the larva or sign and the host plant surface.",
        exemplar: { visual: "plant", label: "Larval sign" },
        targets: [
          {
            key: "caterpillar",
            label: "Caterpillar",
            visual: "insect",
            sub: "Soft larva with prolegs.",
            skill: "insects.larva.caterpillar",
            feedback: "Caterpillars are larvae, often with prolegs and chewing marks."
          },
          {
            key: "case",
            label: "Case-bearing larva",
            visual: "insect",
            sub: "Carries or lives in a case.",
            skill: "insects.larva.case",
            feedback: "Some larvae carry or live inside cases."
          },
          {
            key: "mine",
            label: "Leaf mine",
            visual: "plant",
            sub: "Trail inside leaf.",
            skill: "insects.larva.leaf_mine",
            feedback: "A leaf mine is a feeding trail made inside a leaf."
          },
          {
            key: "gall",
            label: "Gall",
            visual: "plant",
            sub: "Bump on plant.",
            skill: "insects.larva.gall",
            feedback: "A gall can be a sign of insects or other organisms using the plant."
          }
        ],
        photo: {
          label: "Larva plus host",
          visual: "habitat",
          feedback: "Show the larva or sign and the plant it is on."
        }
      },
      {
        id: "warning_camouflage_lab",
        title: "Warning and Camouflage Lab",
        fieldmarkFamily: "color and shape signals",
        concept: "Color can be a clue, but color alone is weak.",
        childPhrase: "Warning color or hiding shape?",
        fieldPhrase: "Color pattern and camouflage",
        explanation: "Warning colors, camouflage shape, stripes, spots, and mimicry are observations, not final IDs.",
        photoPrompt: "Photograph color pattern together with body shape.",
        exemplar: { visual: "insect", label: "Color pattern" },
        targets: [
          {
            key: "warning",
            label: "Warning colors",
            visual: "insect",
            sub: "Bright high-contrast colors.",
            skill: "insects.color.warning",
            feedback: "Warning colors can be useful, but many lookalikes share them."
          },
          {
            key: "camouflage",
            label: "Camouflage shape",
            visual: "insect",
            sub: "Looks like leaf, bark, or twig.",
            skill: "insects.color.camouflage",
            feedback: "Camouflage shape can show how the insect hides."
          },
          {
            key: "spots",
            label: "Spots or bands",
            visual: "insect",
            sub: "Pattern clue.",
            skill: "insects.color.pattern",
            feedback: "Spots and bands can help, but body parts matter more."
          },
          {
            key: "not_alone",
            label: "Color is not enough",
            visual: "close",
            sub: "Use body clues too.",
            skill: "insects.color.not_alone",
            feedback: "Color alone is weak. Pair it with wings, legs, antennae, or body shape."
          }
        ],
        photo: {
          label: "Color plus body",
          visual: "whole",
          feedback: "A good color photo also shows body shape and key parts."
        }
      },
      {
        id: "wingless_adult_check",
        title: "Wingless Adult Check",
        fieldmarkFamily: "wingless insects",
        concept: "Some adult insects have no visible wings.",
        childPhrase: "No wings, still insect?",
        fieldPhrase: "Winged vs wingless",
        explanation: "Ant workers, some beetles, young stages, and other insects may be wingless. Leg count and antennae still matter.",
        photoPrompt: "Show legs, antennae, and body regions when wings are absent.",
        exemplar: { visual: "insect", label: "Wingless" },
        targets: [
          {
            key: "wingless",
            label: "Wingless adult",
            visual: "insect",
            sub: "No visible wings.",
            skill: "insects.wingless.adult",
            feedback: "No visible wings does not automatically mean not an insect."
          },
          {
            key: "six",
            label: "Six legs still count",
            visual: "six_legs",
            sub: "Body-plan clue.",
            skill: "insects.wingless.six_legs",
            feedback: "Six legs can support insect even when wings are absent."
          },
          {
            key: "antennae",
            label: "Antennae visible",
            visual: "insect",
            sub: "Head clue.",
            skill: "insects.wingless.antennae",
            feedback: "Antennae help separate wingless insects from spiders."
          },
          {
            key: "juvenile",
            label: "Young stage",
            visual: "insect",
            sub: "May lack adult wings.",
            skill: "insects.wingless.juvenile",
            feedback: "Young insects may not show adult wings yet."
          }
        ],
        photo: {
          label: "Legs and antennae",
          visual: "side",
          feedback: "When wings are absent, show legs, antennae, and body regions."
        }
      },
      {
        id: "eye_head_scout",
        title: "Eye and Head Scout",
        fieldmarkFamily: "insect head clues",
        concept: "Head details can help when the photo is sharp.",
        childPhrase: "What does the head show?",
        fieldPhrase: "Head and eye clues",
        explanation: "Big eyes, eyes meeting, long snout, face markings, and head width are useful only when visible.",
        photoPrompt: "Use a close head photo if the insect is calm enough.",
        exemplar: { visual: "insect", label: "Head clue" },
        targets: [
          {
            key: "big_eyes",
            label: "Big compound eyes",
            visual: "fly",
            sub: "Large eye clue.",
            skill: "insects.head.big_eyes",
            feedback: "Big compound eyes are common in many flies and other insects."
          },
          {
            key: "eyes_meet",
            label: "Eyes meeting",
            visual: "dragonfly",
            sub: "Top-of-head clue.",
            skill: "insects.head.eyes_meet",
            feedback: "Eyes meeting on top can be a useful clue in some groups."
          },
          {
            key: "snout",
            label: "Long snout",
            visual: "beetle",
            sub: "Rostrum clue.",
            skill: "insects.head.snout",
            feedback: "A long snout or rostrum can point toward weevil-like beetles."
          },
          {
            key: "face",
            label: "Face markings",
            visual: "insect",
            sub: "Pattern on the head.",
            skill: "insects.head.face_markings",
            feedback: "Face markings can help, but should not replace bigger body clues."
          }
        ],
        photo: {
          label: "Sharp head",
          visual: "close",
          feedback: "Head clues work only when the head is sharp and visible."
        }
      },
      {
        id: "plant_insect_interaction",
        title: "Plant-Insect Interaction",
        fieldmarkFamily: "insect behavior",
        concept: "What an insect is doing can be evidence.",
        childPhrase: "What is it doing on the plant?",
        fieldPhrase: "Behavior and host",
        explanation: "Feeding, pollinating, mining, making galls, or carrying pollen can be useful beginner behavior clues.",
        photoPrompt: "Show the insect and the plant part it is using.",
        exemplar: { visual: "bee_wasp_ant", label: "On plant" },
        targets: [
          {
            key: "pollinating",
            label: "Visiting flowers",
            visual: "bee_wasp_ant",
            sub: "Pollinator behavior.",
            skill: "insects.behavior.pollinating",
            feedback: "Flower visits and pollen can be behavior clues."
          },
          {
            key: "feeding",
            label: "Chewing leaves",
            visual: "plant",
            sub: "Feeding sign.",
            skill: "insects.behavior.feeding",
            feedback: "Chewing on leaves is a behavior clue, but not a species ID."
          },
          {
            key: "mining",
            label: "Mining inside leaves",
            visual: "plant",
            sub: "Leaf mine sign.",
            skill: "insects.behavior.mining",
            feedback: "Leaf mines can point to insect larvae using the plant."
          },
          {
            key: "host",
            label: "Host plant",
            visual: "wildflower",
            sub: "The plant it uses.",
            skill: "insects.behavior.host",
            feedback: "Host plant can be useful context when the interaction is clear."
          }
        ],
        photo: {
          label: "Insect plus plant part",
          visual: "habitat",
          feedback: "Show both the insect and the plant part involved."
        }
      }
    ],
    arachnids: [
      {
        id: "spider_insect_gate",
        title: "Spider-Insect Gate",
        fieldmarkFamily: "arachnid vs insect",
        concept: "Eight legs and no antennae point away from insects.",
        childPhrase: "Spider-like or insect-like?",
        fieldPhrase: "Arachnid separation",
        explanation: "Count legs, check antennae, and look for body blobs before calling something an insect.",
        photoPrompt: "Use a whole body photo that shows legs and head area.",
        exemplar: { visual: "eight_legs", label: "Eight legs" },
        targets: [
          {
            key: "eight",
            label: "Eight legs",
            visual: "eight_legs",
            sub: "Arachnid clue.",
            skill: "arachnids.gate.eight_legs",
            feedback: "Eight legs points away from insects."
          },
          {
            key: "no_antennae",
            label: "No antennae",
            visual: "no_antennae",
            sub: "Spider-like clue.",
            skill: "arachnids.gate.no_antennae",
            feedback: "Arachnids do not have antennae like insects do."
          },
          {
            key: "body_blobs",
            label: "Body blobs",
            visual: "two_blobs",
            sub: "One or two sections.",
            skill: "arachnids.gate.body_blobs",
            feedback: "Body blobs help separate spiders, harvestmen, ticks, and mites."
          },
          {
            key: "not_insect",
            label: "Not insect",
            visual: "arachnid",
            sub: "Do not use six-leg lane.",
            skill: "arachnids.gate.not_insect",
            feedback: "If the arachnid clues are visible, do not call it an insect."
          }
        ],
        photo: {
          label: "Whole body",
          visual: "whole",
          feedback: "The whole body photo should show legs, antennae area, and body sections."
        }
      },
      {
        id: "harvestman_circle",
        title: "Harvestman Circle",
        fieldmarkFamily: "harvestman clues",
        concept: "Harvestmen look like one body blob with long legs.",
        childPhrase: "One round blob?",
        fieldPhrase: "Harvestman body form",
        explanation: "Harvestmen are arachnids, not insects. One body blob and long legs are beginner clues.",
        photoPrompt: "Take a top view showing the body and all legs.",
        exemplar: { visual: "one_blob", label: "One blob" },
        targets: [
          {
            key: "one_blob",
            label: "One round body blob",
            visual: "one_blob",
            sub: "Harvestman clue.",
            skill: "arachnids.harvestman.one_blob",
            feedback: "Harvestmen often look like one round body blob."
          },
          {
            key: "long_legs",
            label: "Very long legs",
            visual: "harvestman",
            sub: "Long-leg clue.",
            skill: "arachnids.harvestman.long_legs",
            feedback: "Long thin legs support harvestman direction when paired with one body blob."
          },
          {
            key: "no_web",
            label: "No web needed",
            visual: "harvestman",
            sub: "Not all spider-like animals use webs.",
            skill: "arachnids.harvestman.no_web",
            feedback: "Harvestmen do not need an orb web clue."
          },
          {
            key: "not_spider_species",
            label: "Not exact spider species",
            visual: "harvestman",
            sub: "Stay broad.",
            skill: "arachnids.harvestman.stay_broad",
            feedback: "Harvestman direction is a broad beginner answer."
          }
        ],
        photo: {
          label: "Top body and legs",
          visual: "whole",
          feedback: "A top view helps show one body blob and long legs."
        }
      },
      {
        id: "tick_mite_tiny_scout",
        title: "Tick-Mite Tiny Scout",
        fieldmarkFamily: "ticks and mites",
        concept: "Tiny round arachnids can still be arachnids.",
        childPhrase: "Tiny but eight-legged?",
        fieldPhrase: "Tick and mite direction",
        explanation: "Ticks and mites may be tiny and round. Size does not make something an insect.",
        photoPrompt: "Use safe distance and do not handle ticks for classroom learning.",
        exemplar: { visual: "tick_mite", label: "Tiny arachnid" },
        targets: [
          {
            key: "tiny",
            label: "Tiny round body",
            visual: "tick_mite",
            sub: "Tick or mite style.",
            skill: "arachnids.tick_mite.tiny",
            feedback: "Ticks and mites can be tiny and round."
          },
          {
            key: "eight",
            label: "Eight legs when visible",
            visual: "eight_legs",
            sub: "Arachnid clue.",
            skill: "arachnids.tick_mite.eight_legs",
            feedback: "Leg count can still matter, even on tiny arachnids."
          },
          {
            key: "safe",
            label: "Observe safely",
            visual: "whole",
            sub: "Do not handle.",
            skill: "arachnids.tick_mite.safe",
            feedback: "Ticks should not be handled for a classroom ID game."
          },
          {
            key: "broad",
            label: "Tick or mite direction",
            visual: "tick_mite",
            sub: "Broad answer.",
            skill: "arachnids.tick_mite.broad",
            feedback: "Tick or mite direction is broad enough for beginner practice."
          }
        ],
        photo: {
          label: "Safe close view",
          visual: "close",
          feedback: "Use a safe close photo, not handling."
        }
      },
      {
        id: "scorpion_shape_watch",
        title: "Scorpion Shape Watch",
        fieldmarkFamily: "scorpion-like forms",
        concept: "Some arachnids are scorpion-like.",
        childPhrase: "Does it have claws or a tail?",
        fieldPhrase: "Scorpion-like body form",
        explanation: "Large claws, a tail-like end, and a long body can point toward scorpion-like arachnids or lookalikes.",
        photoPrompt: "Photograph the whole body from a safe distance.",
        exemplar: { visual: "scorpion_like", label: "Scorpion-like" },
        targets: [
          {
            key: "claws",
            label: "Large claws",
            visual: "scorpion_like",
            sub: "Pincer clue.",
            skill: "arachnids.scorpion.claws",
            feedback: "Large pincers are a scorpion-like clue."
          },
          {
            key: "tail",
            label: "Tail-like end",
            visual: "scorpion_like",
            sub: "Rear body clue.",
            skill: "arachnids.scorpion.tail",
            feedback: "A tail-like rear end can be a scorpion-like clue."
          },
          {
            key: "whole",
            label: "Whole body",
            visual: "whole",
            sub: "Do not crop off the tail or claws.",
            skill: "arachnids.scorpion.whole",
            feedback: "Whole-body photos matter for scorpion-like shapes."
          },
          {
            key: "safe_distance",
            label: "Safe distance",
            visual: "habitat",
            sub: "Observe without touching.",
            skill: "arachnids.scorpion.safe",
            feedback: "Observe scorpion-like animals from a safe distance."
          }
        ],
        photo: {
          label: "Safe whole body",
          visual: "whole",
          feedback: "Show the whole body from a safe distance."
        }
      },
      {
        id: "spinneret_silk_station",
        title: "Spinneret Silk Station",
        fieldmarkFamily: "silk and spinnerets",
        concept: "Silk signs can be clues, but not every spider is in a web.",
        childPhrase: "Do you see silk?",
        fieldPhrase: "Silk evidence",
        explanation: "Webs, draglines, egg sacs, retreats, and silk sheets can be arachnid evidence when linked to the animal.",
        photoPrompt: "Show the animal and the silk sign together if possible.",
        exemplar: { visual: "spider", label: "Silk sign" },
        targets: [
          {
            key: "web",
            label: "Web",
            visual: "spider",
            sub: "Silk structure.",
            skill: "arachnids.silk.web",
            feedback: "A web is a silk sign, but connect it to the spider if possible."
          },
          {
            key: "dragline",
            label: "Dragline",
            visual: "spider",
            sub: "Single silk thread.",
            skill: "arachnids.silk.dragline",
            feedback: "A dragline is a silk thread a spider may leave while moving."
          },
          {
            key: "retreat",
            label: "Silk retreat",
            visual: "spider",
            sub: "Hiding place.",
            skill: "arachnids.silk.retreat",
            feedback: "A silk retreat can be a spider home clue."
          },
          {
            key: "egg_sac",
            label: "Egg sac",
            visual: "spider",
            sub: "Silk nursery.",
            skill: "arachnids.silk.egg_sac",
            feedback: "Egg sacs are silk structures to observe gently and leave alone."
          }
        ],
        photo: {
          label: "Spider plus silk",
          visual: "whole",
          feedback: "A photo is strongest when it shows the animal and its silk sign together."
        }
      },
      {
        id: "eye_pattern_caution",
        title: "Eye Pattern Caution",
        fieldmarkFamily: "eye clues",
        concept: "Eye patterns can help experts, but beginners should be careful.",
        childPhrase: "Are the eyes clear enough?",
        fieldPhrase: "Eye pattern caution",
        explanation: "Spider eye patterns can be useful, but they need a sharp close photo and should not replace broad body clues.",
        photoPrompt: "Use eye clues only when the head is clear and sharp.",
        exemplar: { visual: "spider", label: "Eyes" },
        targets: [
          {
            key: "sharp",
            label: "Sharp eyes",
            visual: "close",
            sub: "Only if visible.",
            skill: "arachnids.eyes.sharp",
            feedback: "Eye clues only work when the eyes are sharp and visible."
          },
          {
            key: "big_front",
            label: "Big front eyes",
            visual: "spider",
            sub: "Jumping spider style clue.",
            skill: "arachnids.eyes.big_front",
            feedback: "Big front eyes can point toward jumping spider direction."
          },
          {
            key: "not_clear",
            label: "Eyes not clear",
            visual: "habitat",
            sub: "Use body shape instead.",
            skill: "arachnids.eyes.not_clear",
            feedback: "If eyes are not clear, use body shape, legs, web, or behavior."
          },
          {
            key: "not_species",
            label: "Not species alone",
            visual: "spider",
            sub: "Do not overclaim.",
            skill: "arachnids.eyes.not_species",
            feedback: "Eye pattern alone should not become a beginner species guess."
          }
        ],
        photo: {
          label: "Sharp face",
          visual: "close",
          feedback: "Use eye clues only with a sharp face photo."
        }
      },
      {
        id: "spider_home_clues",
        title: "Spider Home Clues",
        fieldmarkFamily: "microhabitat",
        concept: "Where the spider sits can help describe it.",
        childPhrase: "Where is the spider living?",
        fieldPhrase: "Arachnid microhabitat",
        explanation: "Flowers, bark, leaf litter, water edges, webs, and ground surfaces can describe the spider's place.",
        photoPrompt: "Show the spider and its immediate surface or home.",
        exemplar: { visual: "habitat", label: "Spider home" },
        targets: [
          {
            key: "flower",
            label: "On flowers",
            visual: "wildflower",
            sub: "Flower hunting clue.",
            skill: "arachnids.home.flower",
            feedback: "Some spiders hunt on flowers; the flower is context, not the ID."
          },
          {
            key: "bark",
            label: "On bark",
            visual: "tree",
            sub: "Tree surface clue.",
            skill: "arachnids.home.bark",
            feedback: "Bark or trunk surfaces are useful microhabitat notes."
          },
          {
            key: "ground",
            label: "On ground",
            visual: "habitat",
            sub: "Ground-running clue.",
            skill: "arachnids.home.ground",
            feedback: "Ground surface can support ground-running spider direction."
          },
          {
            key: "web",
            label: "In web",
            visual: "spider",
            sub: "Web habitat clue.",
            skill: "arachnids.home.web",
            feedback: "If the spider is in its web, show both together."
          }
        ],
        photo: {
          label: "Spider plus surface",
          visual: "habitat",
          feedback: "Show the spider and the surface or web it is using."
        }
      },
      {
        id: "egg_sac_nursery",
        title: "Egg Sac Nursery",
        fieldmarkFamily: "egg sac clues",
        concept: "Egg sacs are observe-only clues.",
        childPhrase: "What is the safe egg-sac move?",
        fieldPhrase: "Egg sac observation",
        explanation: "Egg sacs can be a spider clue, but they should be left in place and not opened or moved.",
        photoPrompt: "Photograph the egg sac and nearby spider if present, without touching.",
        exemplar: { visual: "spider", label: "Egg sac" },
        targets: [
          {
            key: "round_sac",
            label: "Round silk sac",
            visual: "spider",
            sub: "Nursery clue.",
            skill: "arachnids.eggs.round_sac",
            feedback: "A round silk sac can be a spider nursery clue."
          },
          {
            key: "attached",
            label: "Attached to web or surface",
            visual: "spider",
            sub: "Placement clue.",
            skill: "arachnids.eggs.attached",
            feedback: "Where the egg sac is attached can be useful context."
          },
          {
            key: "guarded",
            label: "Spider nearby",
            visual: "spider",
            sub: "Possible guarding behavior.",
            skill: "arachnids.eggs.guarded",
            feedback: "A nearby spider may be guarding, but do not disturb it."
          },
          {
            key: "leave",
            label: "Leave it alone",
            visual: "habitat",
            sub: "Safety and ethics.",
            skill: "arachnids.eggs.leave",
            feedback: "Egg sacs should be observed and left alone."
          }
        ],
        photo: {
          label: "Egg sac in place",
          visual: "whole",
          feedback: "Photograph it in place without touching or opening it."
        }
      },
      {
        id: "water_spider_watch",
        title: "Water Edge Watch",
        fieldmarkFamily: "water-edge arachnids",
        concept: "Some spiders live near water or on wet edges.",
        childPhrase: "Is water part of the clue?",
        fieldPhrase: "Wet-edge context",
        explanation: "Water edge, wet rocks, floating plants, and shoreline posture can be useful context for spider-like animals.",
        photoPrompt: "Show the animal and the water-edge surface when safe.",
        exemplar: { visual: "habitat", label: "Water edge" },
        targets: [
          {
            key: "water_edge",
            label: "Water edge",
            visual: "habitat",
            sub: "Shoreline clue.",
            skill: "arachnids.water.edge",
            feedback: "Water edge can be a microhabitat clue for some spiders."
          },
          {
            key: "wet_rock",
            label: "Wet rock",
            visual: "habitat",
            sub: "Surface clue.",
            skill: "arachnids.water.rock",
            feedback: "Wet rock or shoreline surface can describe where the animal was found."
          },
          {
            key: "floating_plant",
            label: "Floating plant",
            visual: "plant",
            sub: "Water plant surface.",
            skill: "arachnids.water.plant",
            feedback: "Floating plants can be the surface a spider-like animal uses."
          },
          {
            key: "safe",
            label: "Safe distance",
            visual: "whole",
            sub: "Do not enter unsafe water.",
            skill: "arachnids.water.safe",
            feedback: "Never risk water safety for a classroom photo."
          }
        ],
        photo: {
          label: "Animal plus water edge",
          visual: "habitat",
          feedback: "Show the animal and water-edge context from a safe spot."
        }
      },
      {
        id: "arachnid_molt_clue",
        title: "Molt Clue",
        fieldmarkFamily: "shed skins",
        concept: "A shed skin is a sign, not the animal.",
        childPhrase: "Body or shed skin?",
        fieldPhrase: "Molt evidence",
        explanation: "Arachnids may leave shed skins. They can show body shape, but the live animal may be gone.",
        photoPrompt: "Photograph the shed skin and where it was found.",
        exemplar: { visual: "spider", label: "Shed skin" },
        targets: [
          {
            key: "molt",
            label: "Shed skin",
            visual: "spider",
            sub: "Empty old outer layer.",
            skill: "arachnids.molt.skin",
            feedback: "A molt is a shed outer layer, not necessarily the live animal."
          },
          {
            key: "empty",
            label: "Empty shell",
            visual: "whole",
            sub: "No animal inside.",
            skill: "arachnids.molt.empty",
            feedback: "An empty molt can preserve shape but not behavior."
          },
          {
            key: "place",
            label: "Where it was found",
            visual: "habitat",
            sub: "Web, bark, wall, plant.",
            skill: "arachnids.molt.place",
            feedback: "Where the molt was found can be useful context."
          },
          {
            key: "broad",
            label: "Stay broad",
            visual: "spider",
            sub: "Sign, not species.",
            skill: "arachnids.molt.broad",
            feedback: "A shed skin is a sign and usually supports only a broad direction."
          }
        ],
        photo: {
          label: "Molt plus place",
          visual: "habitat",
          feedback: "Photograph the shed skin and where it was attached or found."
        }
      },
      {
        id: "safe_arachnid_observer",
        title: "Safe Arachnid Observer",
        fieldmarkFamily: "careful arachnid observation",
        concept: "Observe arachnids without touching or teasing them.",
        childPhrase: "What is the safe move?",
        fieldPhrase: "Arachnid safety",
        explanation: "Count legs, photograph body shape, and leave the animal alone. Safety and respect are part of the skill.",
        photoPrompt: "Use zoom or distance rather than handling.",
        exemplar: { visual: "arachnid", label: "Safe observe" },
        targets: [
          {
            key: "no_touch",
            label: "Do not handle",
            visual: "whole",
            sub: "Safe observation.",
            skill: "arachnids.safe.no_touch",
            feedback: "Do not handle arachnids for classroom practice."
          },
          {
            key: "distance",
            label: "Use distance",
            visual: "side",
            sub: "Zoom or step back.",
            skill: "arachnids.safe.distance",
            feedback: "Use distance or zoom instead of bothering the animal."
          },
          {
            key: "leave_web",
            label: "Do not break web",
            visual: "spider",
            sub: "Respect the home.",
            skill: "arachnids.safe.web",
            feedback: "A web is the animal's structure. Do not break it for a photo."
          },
          {
            key: "broad",
            label: "Broad ID is fine",
            visual: "arachnid",
            sub: "Spider-like animal.",
            skill: "arachnids.safe.broad",
            feedback: "A broad arachnid answer is enough when safety or photo quality limits detail."
          }
        ],
        photo: {
          label: "Safe whole-body photo",
          visual: "whole",
          feedback: "Get a safe whole-body photo without handling or disturbing the animal."
        }
      }
    ],
    plants: [
      {
        id: "woody_stem_station",
        title: "Woody Stem Station",
        fieldmarkFamily: "stems and woodiness",
        concept: "Stems tell you tree, shrub, herb, or vine direction.",
        childPhrase: "Woody or soft?",
        fieldPhrase: "Stem texture and growth form",
        explanation: "Woody stems persist like twigs or trunks. Non-woody stems are softer and seasonal.",
        photoPrompt: "Photograph the base and stems, not only leaves.",
        exemplar: { visual: "tree", label: "Stem" },
        targets: [
          {
            key: "woody",
            label: "Woody stem",
            visual: "tree",
            sub: "Hard, twiggy, or barky.",
            skill: "plants.stem.woody",
            feedback: "Woody stems persist year to year and can show bark or twig structure."
          },
          {
            key: "soft",
            label: "Soft green stem",
            visual: "wildflower",
            sub: "Non-woody herb.",
            skill: "plants.stem.soft",
            feedback: "Soft green stems point toward herb-like plant form."
          },
          {
            key: "vine",
            label: "Climbing stem",
            visual: "vine",
            sub: "Needs support.",
            skill: "plants.stem.vine",
            feedback: "Vines climb, twine, trail, or grab support instead of standing alone."
          },
          {
            key: "base",
            label: "Plant base",
            visual: "base",
            sub: "Where stems arise.",
            skill: "plants.stem.base",
            feedback: "The base shows whether stems are single, clumped, woody, or trailing."
          }
        ],
        photo: {
          label: "Base and stems",
          visual: "base",
          feedback: "A base-and-stem photo helps sort tree, shrub, herb, vine, or clump."
        }
      },
      {
        id: "grass_sedge_rush_lab",
        title: "Grass-Sedge-Rush Lab",
        fieldmarkFamily: "grass-like plants",
        concept: "Grass-like plants need stem and seed-head clues.",
        childPhrase: "Blade, edge, or rush stem?",
        fieldPhrase: "Graminoid clues",
        explanation: "Grasses, sedges, and rushes can look similar. Stem shape, joints, sheaths, ligules, and spikelets help.",
        photoPrompt: "Photograph the stem, sheath, and seed head if visible.",
        exemplar: { visual: "grass", label: "Grass-like" },
        targets: [
          {
            key: "grass",
            label: "Jointed grass stem",
            visual: "grass",
            sub: "Nodes along the stem.",
            skill: "plants.graminoid.grass",
            feedback: "Grasses often have jointed stems with nodes."
          },
          {
            key: "sedge",
            label: "Sedge edges",
            visual: "grass",
            sub: "Triangular stem.",
            skill: "plants.graminoid.sedge",
            feedback: "Many sedges have triangular stems: sedges have edges."
          },
          {
            key: "rush",
            label: "Round rush stem",
            visual: "grass",
            sub: "Round stem.",
            skill: "plants.graminoid.rush",
            feedback: "Rushes often have round stems."
          },
          {
            key: "spikelet",
            label: "Spikelets",
            visual: "grass",
            sub: "Tiny grass flower units.",
            skill: "plants.graminoid.spikelet",
            feedback: "Spikelets and seed heads are important grass-like plant clues."
          }
        ],
        photo: {
          label: "Stem plus seed head",
          visual: "close",
          feedback: "Grass-like plants need close stem and seed-head photos."
        }
      },
      {
        id: "fern_frond_lab",
        title: "Fern Frond Lab",
        fieldmarkFamily: "fern fronds",
        concept: "Ferns use fronds and sori instead of flowers.",
        childPhrase: "What kind of frond?",
        fieldPhrase: "Fern form",
        explanation: "Fern clues include frond division, fiddleheads, fertile fronds, and sori on the underside.",
        photoPrompt: "Photograph one whole frond and the underside if sori are present.",
        exemplar: { visual: "fern", label: "Fern frond" },
        targets: [
          {
            key: "once",
            label: "Once-divided frond",
            visual: "fern",
            sub: "One level of leaflets.",
            skill: "plants.fern.once_divided",
            feedback: "Frond division is a basic fern clue."
          },
          {
            key: "twice",
            label: "Twice-divided frond",
            visual: "fern",
            sub: "More finely divided.",
            skill: "plants.fern.twice_divided",
            feedback: "Some fern fronds are divided more than once."
          },
          {
            key: "sori",
            label: "Sori spots",
            visual: "fern",
            sub: "Spore patches underneath.",
            skill: "plants.fern.sori",
            feedback: "Sori are spore patches, often on the underside of fern fronds."
          },
          {
            key: "fiddlehead",
            label: "Fiddlehead",
            visual: "fern",
            sub: "Curled young frond.",
            skill: "plants.fern.fiddlehead",
            feedback: "Fiddleheads are young coiled fern fronds."
          }
        ],
        photo: {
          label: "Whole frond and underside",
          visual: "whole",
          feedback: "Show the whole frond, then the underside if sori are visible."
        }
      },
      {
        id: "moss_lichen_mini_garden",
        title: "Moss-Lichen Mini Garden",
        fieldmarkFamily: "tiny plant-like forms",
        concept: "Tiny mats, cushions, crusts, and leaf-like patches need close views.",
        childPhrase: "Moss mat or lichen patch?",
        fieldPhrase: "Cryptogam form",
        explanation: "Mosses and lichens are small and easy to blur. Growth form and surface matter more than color alone.",
        photoPrompt: "Photograph close detail plus the bark, rock, or soil surface.",
        exemplar: { visual: "moss", label: "Mini garden" },
        targets: [
          {
            key: "moss_cushion",
            label: "Moss cushion",
            visual: "moss",
            sub: "Soft green mound.",
            skill: "plants.cryptogam.moss_cushion",
            feedback: "Moss can grow as cushions or carpets."
          },
          {
            key: "moss_carpet",
            label: "Moss carpet",
            visual: "moss",
            sub: "Low mat.",
            skill: "plants.cryptogam.moss_carpet",
            feedback: "Moss carpets form low green mats across a surface."
          },
          {
            key: "lichen_crust",
            label: "Lichen crust",
            visual: "habitat",
            sub: "Flat crust on surface.",
            skill: "plants.cryptogam.lichen_crust",
            feedback: "Crustose lichens are flat crust-like patches."
          },
          {
            key: "lichen_leafy",
            label: "Leafy lichen",
            visual: "plant",
            sub: "Leaf-like lobes.",
            skill: "plants.cryptogam.lichen_leafy",
            feedback: "Foliose lichens have leaf-like lobes."
          }
        ],
        photo: {
          label: "Close patch plus surface",
          visual: "close",
          feedback: "For mosses and lichens, show close texture and the surface they grow on."
        }
      },
      {
        id: "flower_cluster_builder",
        title: "Flower Cluster Builder",
        fieldmarkFamily: "inflorescences",
        concept: "Flowers can be arranged in different cluster shapes.",
        childPhrase: "How are the flowers grouped?",
        fieldPhrase: "Flower cluster form",
        explanation: "Umbels, spikes, racemes, panicles, heads, and solitary flowers are useful beginner cluster clues.",
        photoPrompt: "Step back enough to show the whole flower cluster.",
        exemplar: { visual: "wildflower", label: "Cluster" },
        targets: [
          {
            key: "umbel",
            label: "Umbel",
            visual: "wildflower",
            sub: "Umbrella ribs.",
            skill: "plants.cluster.umbel",
            feedback: "Umbels have flower stalks radiating from one point."
          },
          {
            key: "spike",
            label: "Spike",
            visual: "wildflower",
            sub: "Flowers along a tall axis.",
            skill: "plants.cluster.spike",
            feedback: "A spike has flowers arranged along a central stalk."
          },
          {
            key: "raceme",
            label: "Raceme",
            visual: "wildflower",
            sub: "Stalked flowers along an axis.",
            skill: "plants.cluster.raceme",
            feedback: "A raceme has stalked flowers along a central axis."
          },
          {
            key: "head",
            label: "Flower head",
            visual: "wildflower",
            sub: "Many tiny flowers packed together.",
            skill: "plants.cluster.head",
            feedback: "A flower head can look like one flower but contain many tiny flowers."
          }
        ],
        photo: {
          label: "Whole flower cluster",
          visual: "whole",
          feedback: "Show the whole cluster, not just one petal."
        }
      },
      {
        id: "petal_symmetry_lab",
        title: "Petal Symmetry Lab",
        fieldmarkFamily: "flower symmetry",
        concept: "Flower symmetry and petal number are broad clues.",
        childPhrase: "Round star or one special side?",
        fieldPhrase: "Flower symmetry",
        explanation: "Radial flowers match many ways around. Bilateral flowers have one main mirror line.",
        photoPrompt: "Photograph the flower face-on if safe and possible.",
        exemplar: { visual: "wildflower", label: "Symmetry" },
        targets: [
          {
            key: "radial",
            label: "Radial symmetry",
            visual: "wildflower",
            sub: "Many matching directions.",
            skill: "plants.flower.radial",
            feedback: "Radial flowers can be divided into matching parts several ways."
          },
          {
            key: "bilateral",
            label: "Bilateral symmetry",
            visual: "wildflower",
            sub: "One mirror line.",
            skill: "plants.flower.bilateral",
            feedback: "Bilateral flowers have one main mirror line."
          },
          {
            key: "petal_count",
            label: "Petal number",
            visual: "wildflower",
            sub: "Count visible petals.",
            skill: "plants.flower.petal_count",
            feedback: "Petal number can be useful when the flower is fresh and clear."
          },
          {
            key: "fused",
            label: "Fused petals",
            visual: "wildflower",
            sub: "Petals joined into a tube or bell.",
            skill: "plants.flower.fused",
            feedback: "Fused petals can make tubes, bells, or lips."
          }
        ],
        photo: {
          label: "Face-on flower",
          visual: "close",
          feedback: "A face-on flower photo helps show symmetry and petal number."
        }
      },
      {
        id: "leaf_surface_lab",
        title: "Leaf Surface Lab",
        fieldmarkFamily: "leaf surfaces",
        concept: "Leaf surfaces can be hairy, smooth, waxy, rough, or fuzzy underneath.",
        childPhrase: "What does the leaf surface look like?",
        fieldPhrase: "Leaf surface texture",
        explanation: "Texture is a visible clue. Use photos and safe touch only when appropriate.",
        photoPrompt: "Photograph both upper and lower leaf surfaces if helpful.",
        exemplar: { visual: "wildflower", label: "Leaf surface" },
        targets: [
          {
            key: "hairy",
            label: "Hairy leaf",
            visual: "wildflower",
            sub: "Visible hairs.",
            skill: "plants.surface.hairy",
            feedback: "Hairy leaf surfaces can be an important clue."
          },
          {
            key: "smooth",
            label: "Smooth leaf",
            visual: "wildflower",
            sub: "No obvious hairs.",
            skill: "plants.surface.smooth",
            feedback: "Smooth or glabrous means no obvious hairs."
          },
          {
            key: "waxy",
            label: "Waxy or glossy",
            visual: "wildflower",
            sub: "Shiny surface.",
            skill: "plants.surface.waxy",
            feedback: "Waxy or glossy leaves reflect light and can help separate groups."
          },
          {
            key: "fuzzy_under",
            label: "Fuzzy underside",
            visual: "wildflower",
            sub: "Hairy lower surface.",
            skill: "plants.surface.underside",
            feedback: "Leaf undersides can show fuzz, veins, or color that the top hides."
          }
        ],
        photo: {
          label: "Top and underside",
          visual: "close",
          feedback: "Leaf surface clues often need a close photo of both sides."
        }
      },
      {
        id: "vein_map_scout",
        title: "Vein Map Scout",
        fieldmarkFamily: "leaf veins",
        concept: "Leaf veins make patterns.",
        childPhrase: "What vein map do you see?",
        fieldPhrase: "Leaf venation",
        explanation: "Parallel, net-like, palmate, pinnate, and raised veins can all be useful plant clues.",
        photoPrompt: "Use light that shows veins without glare.",
        exemplar: { visual: "wildflower", label: "Veins" },
        targets: [
          {
            key: "parallel",
            label: "Parallel veins",
            visual: "grass",
            sub: "Lines run side by side.",
            skill: "plants.veins.parallel",
            feedback: "Parallel veins are common in grasses and many monocots."
          },
          {
            key: "net",
            label: "Net-like veins",
            visual: "wildflower",
            sub: "Branching network.",
            skill: "plants.veins.net",
            feedback: "Net-like veins form a branching network."
          },
          {
            key: "palmate",
            label: "Palmate veins",
            visual: "wildflower",
            sub: "Several main veins from one point.",
            skill: "plants.veins.palmate",
            feedback: "Palmate veins spread from one point like fingers from a hand."
          },
          {
            key: "pinnate",
            label: "Pinnate veins",
            visual: "wildflower",
            sub: "Side veins from a midrib.",
            skill: "plants.veins.pinnate",
            feedback: "Pinnate veins branch from a central midrib."
          }
        ],
        photo: {
          label: "Flat leaf in good light",
          visual: "close",
          feedback: "A flat leaf photo in good light can show vein patterns."
        }
      },
      {
        id: "stem_smell_scout",
        title: "Stem and Smell Scout",
        fieldmarkFamily: "stem shape and odor",
        concept: "Stem shape and leaf smell can be strong plant clues.",
        childPhrase: "Square, round, aromatic, or milky?",
        fieldPhrase: "Stem and sap clues",
        explanation: "Square stems, round stems, aromatic crushed leaves, and milky sap are beginner clues when observed safely.",
        photoPrompt: "Photograph the stem; note odor only if safe and allowed.",
        exemplar: { visual: "wildflower", label: "Stem clue" },
        targets: [
          {
            key: "square",
            label: "Square stem",
            visual: "wildflower",
            sub: "Four-sided stem.",
            skill: "plants.stem.square",
            feedback: "Square stems can point toward mint-like plants when paired with other clues."
          },
          {
            key: "round",
            label: "Round stem",
            visual: "wildflower",
            sub: "Cylindrical stem.",
            skill: "plants.stem.round",
            feedback: "Round stem is a contrasting stem-shape clue."
          },
          {
            key: "aromatic",
            label: "Aromatic leaf",
            visual: "wildflower",
            sub: "Strong smell when crushed gently.",
            skill: "plants.stem.aromatic",
            feedback: "Aromatic crushed leaves can be useful if checking is safe and allowed."
          },
          {
            key: "milky",
            label: "Milky sap",
            visual: "wildflower",
            sub: "White latex-like fluid.",
            skill: "plants.stem.milky_sap",
            feedback: "Milky sap is a clue, but avoid unsafe handling and do not taste."
          }
        ],
        photo: {
          label: "Stem close-up",
          visual: "close",
          feedback: "A stem close-up can show square vs round and where leaves attach."
        }
      },
      {
        id: "cone_needle_station",
        title: "Cone Needle Station",
        fieldmarkFamily: "conifer clues",
        concept: "Conifers often use needles, scale-like leaves, and cones.",
        childPhrase: "Needles or cones?",
        fieldPhrase: "Conifer fieldmarks",
        explanation: "Needle bundles, scale-like leaves, cone shape, and cone scales are broad conifer clues.",
        photoPrompt: "Photograph needles or scale-like leaves and cones if present.",
        exemplar: { visual: "tree", label: "Conifer" },
        targets: [
          {
            key: "needles",
            label: "Needle-like leaves",
            visual: "tree",
            sub: "Thin stiff leaves.",
            skill: "plants.conifer.needles",
            feedback: "Needle-like leaves are a basic conifer clue."
          },
          {
            key: "bundle",
            label: "Needle bundle number",
            visual: "tree",
            sub: "Count needles in a bundle.",
            skill: "plants.conifer.bundle",
            feedback: "Needle bundle number can help with pine-like trees."
          },
          {
            key: "scale",
            label: "Scale-like leaves",
            visual: "tree",
            sub: "Tiny overlapping leaves.",
            skill: "plants.conifer.scale_leaves",
            feedback: "Scale-like leaves overlap like tiny shingles."
          },
          {
            key: "cone",
            label: "Cone",
            visual: "tree",
            sub: "Seed structure.",
            skill: "plants.conifer.cone",
            feedback: "Cones and cone scales are useful conifer clues."
          }
        ],
        photo: {
          label: "Needles plus cone",
          visual: "close",
          feedback: "Show needles or scale-like leaves and cones when available."
        }
      },
      {
        id: "plant_habitat_mapper",
        title: "Plant Habitat Mapper",
        fieldmarkFamily: "plant habitat",
        concept: "Plant habitat helps explain growth form.",
        childPhrase: "Wet, dry, climbing, or open?",
        fieldPhrase: "Plant habitat context",
        explanation: "Aquatic, emergent, woodland, meadow, rocky, and climbing contexts can help describe a plant.",
        photoPrompt: "Pair the plant photo with a wider habitat view when useful.",
        exemplar: { visual: "habitat", label: "Plant place" },
        targets: [
          {
            key: "aquatic",
            label: "Aquatic",
            visual: "habitat",
            sub: "Growing in water.",
            skill: "plants.habitat.aquatic",
            feedback: "Aquatic plants grow in water."
          },
          {
            key: "emergent",
            label: "Emergent",
            visual: "grass",
            sub: "Rooted in water, rising above.",
            skill: "plants.habitat.emergent",
            feedback: "Emergent plants rise above water while rooted in wet places."
          },
          {
            key: "woodland",
            label: "Woodland",
            visual: "tree",
            sub: "Forest edge or shade.",
            skill: "plants.habitat.woodland",
            feedback: "Woodland context can explain shade plants and forest-edge growth."
          },
          {
            key: "climbing",
            label: "Climbing support",
            visual: "vine",
            sub: "Using another plant or fence.",
            skill: "plants.habitat.climbing",
            feedback: "A climbing support is part of vine context."
          }
        ],
        photo: {
          label: "Plant plus habitat",
          visual: "habitat",
          feedback: "A habitat view can show water, shade, meadow, rock, or support."
        }
      },
      {
        id: "plant_photo_set_review",
        title: "Plant Photo Set Review",
        fieldmarkFamily: "plant photo set",
        concept: "Plant IDs need whole form plus parts.",
        childPhrase: "Which plant photos help most?",
        fieldPhrase: "Plant evidence set",
        explanation: "Whole plant, leaves on stem, flower or fruit, bark or base, and habitat can all help.",
        photoPrompt: "Build a plant photo set without picking or damaging the plant.",
        exemplar: { visual: "whole", label: "Plant set" },
        targets: [
          {
            key: "whole",
            label: "Whole plant",
            visual: "whole",
            sub: "Growth form.",
            skill: "plants.photos.whole",
            feedback: "Whole plant photos show tree, shrub, vine, grass, fern, moss, or wildflower form."
          },
          {
            key: "leaf_node",
            label: "Leaves on stem",
            visual: "opposite_leaves",
            sub: "Arrangement clue.",
            skill: "plants.photos.leaf_node",
            feedback: "Leaves on the stem show opposite, alternate, whorled, or rosette arrangement."
          },
          {
            key: "flower_fruit",
            label: "Flower or fruit",
            visual: "wildflower",
            sub: "Reproductive clue.",
            skill: "plants.photos.flower_fruit",
            feedback: "Flowers and fruits are strong plant clues when present."
          },
          {
            key: "base_habitat",
            label: "Base and habitat",
            visual: "base",
            sub: "Where and how it grows.",
            skill: "plants.photos.base_habitat",
            feedback: "Base and habitat photos show growth pattern and context."
          }
        ],
        photo: {
          label: "Whole, leaf, flower/fruit, base",
          visual: "next_photo",
          feedback: "A plant photo set teaches form, arrangement, reproductive clues, and context."
        }
      }
    ]
  };

  const TRACK_DISTRACTORS = {
    universal: [
      c("species_guess", "Exact species guess", "close", "Too specific for this lesson."),
      c("random_photo", "Random pretty photo", "habitat", "Not targeted evidence.")
    ],
    fungi: [
      c("leaf_pair", "Leaf pairs", "opposite_leaves", "Plant clue."),
      c("hard_wings", "Hard wings", "hard_wings", "Insect clue.")
    ],
    insects: [
      c("gills", "Paper pages", "gills", "Fungus clue."),
      c("leaf_edge", "Leaf edge", "wildflower", "Plant clue.")
    ],
    arachnids: [
      c("six_legs", "Six legs", "six_legs", "Insect clue."),
      c("pores", "Tiny sponge holes", "pores", "Fungus clue.")
    ],
    plants: [
      c("one_wing_pair", "One wing pair", "one_pair_wings", "Insect clue."),
      c("mushroom_cap", "Mushroom cap", "cap_mushroom", "Fungus clue.")
    ]
  };

  function makeGeneratedLesson(trackId, spec) {
    return {
      id: spec.id,
      title: spec.title,
      achievementId: spec.id,
      achievementName: spec.title,
      fieldmarkFamily: spec.fieldmarkFamily,
      hiddenSkills: spec.targets.map((target) => target.skill),
      concept: spec.concept,
      childPhrase: spec.childPhrase,
      fieldPhrase: spec.fieldPhrase,
      explanation: spec.explanation,
      photoPrompt: spec.photoPrompt,
      reward: spec.reward || 10,
      exemplar: spec.exemplar,
      items: makeGeneratedItems(trackId, spec)
    };
  }

  function makeGeneratedItems(trackId, spec) {
    const defaultDistractors = TRACK_DISTRACTORS[trackId] || TRACK_DISTRACTORS.universal;
    const targetItems = spec.targets.slice(0, 4).map((target, index) => {
      const sibling = spec.targets[(index + 1) % spec.targets.length];
      const fallback = defaultDistractors[index % defaultDistractors.length];
      return {
        id: `${spec.id}_${target.key}`,
        skill: target.skill,
        question: target.question || `Which clue shows ${target.label.toLowerCase()}?`,
        choices: [
          c(target.key, target.label, target.visual, target.sub),
          c(sibling.key, sibling.label, sibling.visual, sibling.sub),
          fallback
        ],
        answer: target.key,
        feedback: target.feedback
      };
    });

    targetItems.push({
      id: `${spec.id}_photo`,
      skill: `${trackId}.${spec.id}.photo`,
      question: spec.photo?.question || "What photo helps this fieldmark lesson most?",
      choices: [
        c("photo", spec.photo?.label || "Helpful fieldmark photo", spec.photo?.visual || "close", "Shows the clue."),
        c("too_specific", "Exact species guess", "close", "Not the classroom goal."),
        c("missing_body", "Photo without the organism", "habitat", "Too little evidence.")
      ],
      answer: "photo",
      feedback: spec.photo?.feedback || spec.photoPrompt
    });

    return targetItems;
  }

  function generatedLessonsFor(trackId) {
    return (GENERATED_LANE_MODULES[trackId] || []).slice(0, 10).map((spec) =>
      makeGeneratedLesson(trackId, spec)
    );
  }

  TRACKS.forEach((track) => {
    track.lessons.push(...(EXTRA_LESSONS[track.id] || []), ...generatedLessonsFor(track.id));
  });

  const LESSONS = TRACKS.flatMap((track) =>
    track.lessons.map((lesson) => ({ ...lesson, trackId: track.id }))
  );
  const TRACK_BY_ID = Object.fromEntries(TRACKS.map((track) => [track.id, track]));
  const LESSON_BY_ID = Object.fromEntries(LESSONS.map((lesson) => [lesson.id, lesson]));

  const state = {
    screen: "map",
    selectedTrackId: TRACKS[0].id,
    activeLessonId: "",
    itemIndex: 0,
    lessonAnswers: [],
    feedback: null,
    toast: "",
    recentAwards: []
  };

  let activeRoot = null;
  let progress = loadProgress();

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pct(numerator, denominator) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
  }

  function defaultProgress() {
    return {
      version: 1,
      completedLessons: {},
      lessonStats: {},
      skills: {},
      achievements: {},
      classroomWildpoints: 0,
      totalCorrect: 0,
      totalAttempts: 0,
      weakSkills: {},
      fieldHints: [],
      currentTrackId: TRACKS[0].id,
      lastLessonId: ""
    };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...defaultProgress(), ...parsed };
    } catch {
      return defaultProgress();
    }
  }

  function saveProgress() {
    progress.currentTrackId = state.selectedTrackId || progress.currentTrackId;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Progress is helpful but not essential for the current lesson run.
    }
  }

  function injectStyles() {
    if (document.getElementById("gwDuoClassroomStyles")) return;
    const style = document.createElement("style");
    style.id = "gwDuoClassroomStyles";
    style.textContent = `
      .gw-duo-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100001;
        display: grid;
        place-items: center;
        padding: 12px;
        box-sizing: border-box;
        background: rgba(7, 10, 10, 0.76);
        color: #20301f;
        font: 13px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
      }

      .gw-duo-shell {
        width: min(1180px, 98vw);
        height: min(780px, 94vh);
        min-height: 560px;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        overflow: hidden;
        border: 2px solid rgba(255,255,255,0.58);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(243,250,222,0.99), rgba(202,234,190,0.98) 46%, rgba(126,190,172,0.98));
        box-shadow: 0 28px 90px rgba(0,0,0,0.55);
      }

      .gw-duo-head,
      .gw-duo-track-tabs,
      .gw-duo-status-row,
      .gw-duo-actions,
      .gw-duo-feedback,
      .gw-duo-result-stats {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .gw-duo-head {
        justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 2px solid rgba(80,120,80,0.18);
        background: rgba(255,255,255,0.64);
      }

      .gw-duo-kicker {
        color: #2d7f72;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .gw-duo-title {
        margin-top: 2px;
        color: #21301f;
        font-size: 24px;
        font-weight: 950;
        line-height: 1.08;
      }

      .gw-duo-close,
      .gw-duo-btn,
      .gw-duo-track-tab,
      .gw-duo-node,
      .gw-duo-choice,
      .gw-duo-mini {
        border: 2px solid rgba(35,72,54,0.2);
        border-radius: 12px;
        background: #ffffff;
        color: #21301f;
        box-shadow: inset 0 -4px 0 rgba(0,0,0,0.08);
        font-weight: 950;
        cursor: pointer;
      }

      .gw-duo-close {
        width: 38px;
        height: 38px;
        font-size: 18px;
      }

      .gw-duo-body {
        min-height: 0;
        overflow: auto;
        padding: 14px;
      }

      .gw-duo-status-row {
        flex-wrap: wrap;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .gw-duo-pill {
        min-height: 30px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        color: #21301f;
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(35,72,54,0.14);
        font-size: 11px;
        font-weight: 950;
      }

      .gw-duo-track-tabs {
        flex-wrap: wrap;
      }

      .gw-duo-track-tab {
        min-height: 44px;
        padding: 7px 10px;
        text-align: left;
        min-width: 130px;
      }

      .gw-duo-track-tab.is-active {
        background: var(--track-accent, #79e38e);
        border-color: rgba(255,255,255,0.78);
      }

      .gw-duo-track-tab b,
      .gw-duo-track-tab span {
        display: block;
      }

      .gw-duo-track-tab span {
        margin-top: 2px;
        font-size: 10px;
        opacity: 0.72;
      }

      .gw-duo-map-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
        gap: 14px;
        align-items: stretch;
      }

      .gw-duo-region,
      .gw-duo-side,
      .gw-duo-lesson-card,
      .gw-duo-result-card {
        min-width: 0;
        border: 2px solid rgba(255,255,255,0.58);
        border-radius: 18px;
        background: rgba(255,255,255,0.68);
        box-shadow: 0 14px 40px rgba(36,66,44,0.18);
      }

      .gw-duo-region {
        min-height: 540px;
        position: relative;
        overflow: hidden;
        padding: 16px;
      }

      .gw-duo-region::before {
        content: "";
        position: absolute;
        inset: 74px 0 28px;
        left: 50%;
        width: 12px;
        transform: translateX(-50%);
        border-radius: 999px;
        background:
          repeating-linear-gradient(180deg, rgba(64,95,56,0.28) 0 18px, transparent 18px 30px);
      }

      .gw-duo-region-head {
        position: relative;
        z-index: 1;
        max-width: 680px;
      }

      .gw-duo-region-title {
        color: #21301f;
        font-size: 22px;
        font-weight: 950;
      }

      .gw-duo-region-sub,
      .gw-duo-small {
        color: rgba(32,48,31,0.72);
        font-size: 12px;
      }

      .gw-duo-path {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 16px;
        margin-top: 20px;
      }

      .gw-duo-path-row {
        display: flex;
      }

      .gw-duo-path-row:nth-child(odd) {
        justify-content: flex-start;
        padding-left: 9%;
      }

      .gw-duo-path-row:nth-child(even) {
        justify-content: flex-end;
        padding-right: 9%;
      }

      .gw-duo-node {
        width: min(360px, 88%);
        min-height: 86px;
        display: grid;
        grid-template-columns: 62px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 10px;
        text-align: left;
      }

      .gw-duo-node.is-current {
        background: var(--track-accent, #79e38e);
        border-color: rgba(255,255,255,0.92);
        transform: translateY(-2px);
        box-shadow:
          0 12px 28px rgba(44,91,56,0.24),
          inset 0 -5px 0 rgba(0,0,0,0.11);
      }

      .gw-duo-node.is-complete {
        background: #fff7c9;
      }

      .gw-duo-node.is-locked {
        opacity: 0.54;
        cursor: default;
      }

      .gw-duo-node-medal {
        width: 56px;
        height: 56px;
        display: grid;
        place-items: center;
        margin-top: 0;
        border-radius: 50%;
        color: #21301f;
        background: rgba(255,255,255,0.76);
        border: 2px solid rgba(35,72,54,0.14);
        font-size: 18px;
        font-weight: 950;
        line-height: 1;
        text-align: center;
      }

      .gw-duo-node b,
      .gw-duo-choice b,
      .gw-duo-badge b {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-duo-node > span:not(.gw-duo-node-medal):not(.gw-duo-pill) {
        display: block;
        margin-top: 3px;
        color: rgba(32,48,31,0.68);
        font-size: 11px;
      }

      .gw-duo-side {
        padding: 14px;
        display: grid;
        align-content: start;
        gap: 12px;
      }

      .gw-duo-section-title {
        color: #21301f;
        font-size: 15px;
        font-weight: 950;
      }

      .gw-duo-visual {
        min-height: 112px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        border: 2px solid rgba(35,72,54,0.14);
        background:
          linear-gradient(160deg, rgba(255,255,255,0.84), rgba(255,255,255,0.42)),
          var(--visual-bg, #bfeec7);
        box-shadow: inset 0 -8px 0 rgba(0,0,0,0.08);
        overflow: hidden;
      }

      .gw-duo-visual-shape {
        width: 76px;
        height: 76px;
        display: grid;
        place-items: center;
        border-radius: 22px 22px 28px 28px;
        color: rgba(0,0,0,0.58);
        background: rgba(255,255,255,0.62);
        border: 3px solid rgba(35,72,54,0.18);
        font-size: 12px;
        font-weight: 950;
        text-align: center;
      }

      .gw-duo-visual[data-kind*="fungus"],
      .gw-duo-visual[data-kind="gills"],
      .gw-duo-visual[data-kind="pores"],
      .gw-duo-visual[data-kind="teeth"],
      .gw-duo-visual[data-kind="folds"],
      .gw-duo-visual[data-kind="smooth"],
      .gw-duo-visual[data-kind="underside"],
      .gw-duo-visual[data-kind="cap_mushroom"],
      .gw-duo-visual[data-kind="puffball"] {
        --visual-bg: #f6d58c;
      }

      .gw-duo-visual[data-kind="insect"],
      .gw-duo-visual[data-kind="six_legs"],
      .gw-duo-visual[data-kind="beetle"],
      .gw-duo-visual[data-kind="fly"],
      .gw-duo-visual[data-kind*="wings"],
      .gw-duo-visual[data-kind="butterfly"] {
        --visual-bg: #a9dcff;
      }

      .gw-duo-visual[data-kind="arachnid"],
      .gw-duo-visual[data-kind="eight_legs"],
      .gw-duo-visual[data-kind="spider"],
      .gw-duo-visual[data-kind="harvestman"],
      .gw-duo-visual[data-kind*="blob"] {
        --visual-bg: #ffcfb3;
      }

      .gw-duo-visual[data-kind="plant"],
      .gw-duo-visual[data-kind="tree"],
      .gw-duo-visual[data-kind="grass"],
      .gw-duo-visual[data-kind="fern"],
      .gw-duo-visual[data-kind="moss"],
      .gw-duo-visual[data-kind*="leaves"],
      .gw-duo-visual[data-kind="wildflower"],
      .gw-duo-visual[data-kind="vine"] {
        --visual-bg: #b8eb8f;
      }

      .gw-duo-lesson-card,
      .gw-duo-result-card {
        padding: 16px;
      }

      .gw-duo-lesson-layout {
        display: grid;
        grid-template-columns: minmax(240px, 0.36fr) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
      }

      .gw-duo-question-card {
        min-width: 0;
      }

      .gw-duo-progress {
        height: 10px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(35,72,54,0.14);
      }

      .gw-duo-progress span {
        display: block;
        height: 100%;
        width: var(--pct, 0%);
        border-radius: inherit;
        background: #2bb86e;
      }

      .gw-duo-question {
        margin-top: 12px;
        color: #21301f;
        font-size: 24px;
        font-weight: 950;
        line-height: 1.1;
      }

      .gw-duo-choice-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .gw-duo-choice {
        min-width: 0;
        min-height: 176px;
        display: grid;
        grid-template-rows: 104px auto;
        gap: 8px;
        padding: 9px;
        text-align: left;
      }

      .gw-duo-choice.is-correct {
        background: #caffcf;
        border-color: #2bb86e;
      }

      .gw-duo-choice.is-wrong {
        background: #ffd6cf;
        border-color: #d65b4a;
      }

      .gw-duo-choice span {
        display: block;
        color: rgba(32,48,31,0.66);
        font-size: 11px;
      }

      .gw-duo-feedback {
        align-items: flex-start;
        margin-top: 12px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255,255,255,0.78);
        border: 2px solid rgba(35,72,54,0.12);
      }

      .gw-duo-feedback.is-correct {
        border-color: rgba(43,184,110,0.46);
      }

      .gw-duo-feedback.is-wrong {
        border-color: rgba(214,91,74,0.42);
      }

      .gw-duo-feedback-mark {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        border-radius: 50%;
        color: #fff;
        background: #2bb86e;
        font-weight: 950;
      }

      .gw-duo-feedback.is-wrong .gw-duo-feedback-mark {
        background: #d65b4a;
      }

      .gw-duo-actions {
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .gw-duo-btn,
      .gw-duo-mini {
        min-height: 40px;
        padding: 8px 12px;
      }

      .gw-duo-btn.primary {
        color: #12301d;
        background: #79e38e;
        border-color: rgba(255,255,255,0.82);
      }

      .gw-duo-btn.secondary {
        background: rgba(255,255,255,0.72);
      }

      .gw-duo-badge-grid,
      .gw-duo-hint-list {
        display: grid;
        gap: 8px;
      }

      .gw-duo-badge {
        padding: 9px;
        border-radius: 12px;
        background: rgba(255,255,255,0.66);
        border: 1px solid rgba(35,72,54,0.12);
      }

      .gw-duo-badge span,
      .gw-duo-hint {
        display: block;
        margin-top: 3px;
        color: rgba(32,48,31,0.66);
        font-size: 11px;
      }

      .gw-duo-toast {
        position: fixed;
        left: 18px;
        right: 18px;
        top: calc(max(12px, env(safe-area-inset-top)) + 52px);
        z-index: 100003;
        padding: 12px 14px;
        border-radius: 18px;
        color: #21301f;
        background: linear-gradient(180deg, #fff3a6, #f2c766);
        box-shadow: 0 16px 44px rgba(0,0,0,0.35);
        font-weight: 950;
        animation: gwDuoToastPop 220ms ease-out;
      }

      @keyframes gwDuoToastPop {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      @media (max-width: 920px) {
        .gw-duo-shell {
          height: min(860px, 96vh);
        }

        .gw-duo-map-grid,
        .gw-duo-lesson-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .gw-duo-region {
          min-height: 460px;
        }
      }

      @media (max-width: 540px) {
        .gw-duo-backdrop {
          padding: 0;
        }

        .gw-duo-shell {
          width: 100vw;
          height: 100dvh;
          min-height: 100dvh;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
        }

        .gw-duo-title,
        .gw-duo-question {
          font-size: 20px;
        }

        .gw-duo-body {
          padding: 10px;
        }

        .gw-duo-lesson-card,
        .gw-duo-result-card {
          padding: 12px;
        }

        .gw-duo-lesson-layout {
          gap: 10px;
        }

        .gw-duo-question {
          margin-top: 8px;
          line-height: 1.08;
        }

        .gw-duo-choice-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .gw-duo-track-tab {
          min-width: 118px;
        }

        .gw-duo-choice {
          min-height: 124px;
          grid-template-rows: 74px minmax(0, auto);
          gap: 6px;
          padding: 7px;
        }

        .gw-duo-choice .gw-duo-visual {
          min-height: 74px;
          border-radius: 12px;
          box-shadow: inset 0 -5px 0 rgba(0,0,0,0.07);
        }

        .gw-duo-choice .gw-duo-visual-shape {
          width: 52px;
          height: 52px;
          border-width: 2px;
          border-radius: 16px 16px 20px 20px;
          font-size: 10px;
        }

        .gw-duo-choice b {
          font-size: 12px;
          line-height: 1.12;
        }

        .gw-duo-choice span {
          font-size: 10px;
          line-height: 1.18;
        }

        .gw-duo-lesson-card.is-answered {
          padding-top: 10px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-status-row {
          margin-bottom: 7px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-lesson-layout {
          gap: 8px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-lesson-layout > aside .gw-duo-region-title,
        .gw-duo-lesson-card.is-answered .gw-duo-lesson-layout > aside .gw-duo-visual,
        .gw-duo-lesson-card.is-answered .gw-duo-lesson-layout > aside p {
          display: none;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-question {
          margin-top: 6px;
          font-size: 18px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-choice {
          min-height: 112px;
          grid-template-rows: 62px minmax(0, auto);
        }

        .gw-duo-lesson-card.is-answered .gw-duo-choice .gw-duo-visual {
          min-height: 62px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-choice .gw-duo-visual-shape {
          width: 44px;
          height: 44px;
          font-size: 9px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-feedback {
          gap: 7px;
          margin-top: 8px;
          padding: 8px;
          border-radius: 12px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-feedback-mark {
          width: 24px;
          height: 24px;
          font-size: 10px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-feedback .gw-duo-small {
          font-size: 10px;
          line-height: 1.2;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-actions {
          margin-top: 8px;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-actions .gw-duo-small {
          display: none;
        }

        .gw-duo-lesson-card.is-answered .gw-duo-btn {
          min-height: 34px;
          padding: 6px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function open(options = {}) {
    injectStyles();
    close();
    progress = loadProgress();
    const requestedTrack = options.trackId || progress.currentTrackId || TRACKS[0].id;
    state.selectedTrackId = TRACK_BY_ID[requestedTrack] ? requestedTrack : TRACKS[0].id;
    state.screen = "map";
    state.activeLessonId = "";
    state.itemIndex = 0;
    state.lessonAnswers = [];
    state.feedback = null;
    state.recentAwards = [];
    activeRoot = document.createElement("div");
    activeRoot.className = "gw-duo-backdrop";
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

  function completedCount(track) {
    return track.lessons.filter((lesson) => progress.completedLessons[lesson.id]).length;
  }

  function isLessonUnlocked(track, lesson) {
    const index = track.lessons.findIndex((item) => item.id === lesson.id);
    if (index <= 0) return true;
    return !!progress.completedLessons[track.lessons[index - 1].id];
  }

  function nextLesson(track) {
    return track.lessons.find((lesson) => !progress.completedLessons[lesson.id]) || track.lessons[0];
  }

  function lessonStatus(track, lesson) {
    if (progress.completedLessons[lesson.id]) return "complete";
    if (!isLessonUnlocked(track, lesson)) return "locked";
    if (nextLesson(track)?.id === lesson.id) return "current";
    return "open";
  }

  function achievementKey(trackId, achievementId) {
    return `${trackId}.${achievementId}`;
  }

  function achievementFor(trackId, lesson) {
    const key = achievementKey(trackId, lesson.achievementId);
    return (
      progress.achievements[key] || {
        trackId,
        achievementId: lesson.achievementId,
        displayName: lesson.achievementName || lesson.title,
        fieldmarkFamily: lesson.fieldmarkFamily || "",
        correct: 0,
        attempts: 0,
        tier: "",
        completedLessons: [],
        hiddenSkills: lesson.hiddenSkills || []
      }
    );
  }

  function tierFor(achievement) {
    let best = "";
    const accuracy = achievement.attempts ? achievement.correct / achievement.attempts : 0;
    TIER_THRESHOLDS.forEach((tier) => {
      if (tier.fieldReady && !achievement.fieldReady) return;
      if (achievement.correct >= tier.correct && accuracy >= tier.accuracy) best = tier.key;
    });
    return best;
  }

  function tierLabel(key) {
    return TIER_THRESHOLDS.find((tier) => tier.key === key)?.label || "Practice";
  }

  function trackBadges(track) {
    return Object.values(progress.achievements || {}).filter(
      (achievement) => achievement.trackId === track.id && achievement.tier
    );
  }

  function render() {
    if (!activeRoot) return;
    const track = TRACK_BY_ID[state.selectedTrackId] || TRACKS[0];
    activeRoot.innerHTML = `
      <div class="gw-duo-shell">
        ${renderHead()}
        <div class="gw-duo-body">
          ${state.screen === "lesson" ? renderLesson() : state.screen === "results" ? renderResults() : renderMap(track)}
        </div>
      </div>
    `;
    bind(activeRoot);
    if (state.toast) showToast(state.toast);
  }

  function renderHead() {
    return `
      <div class="gw-duo-head">
        <div>
          <div class="gw-duo-kicker">Wildlab Classroom</div>
          <div class="gw-duo-title">Duo Classroom</div>
        </div>
        <button class="gw-duo-close" type="button" data-gw-duo-close aria-label="Close Duo Classroom">x</button>
      </div>
    `;
  }

  function renderStatus() {
    const totalLessons = LESSONS.length;
    const doneLessons = Object.keys(progress.completedLessons || {}).length;
    const accuracy = pct(progress.totalCorrect, progress.totalAttempts);
    return `
      <div class="gw-duo-status-row">
        <div class="gw-duo-track-tabs">
          ${TRACKS.map((track) => {
            const done = completedCount(track);
            return `
              <button class="gw-duo-track-tab ${track.id === state.selectedTrackId ? "is-active" : ""}" style="--track-accent:${esc(track.accent)}" type="button" data-gw-duo-track="${esc(track.id)}">
                <b>${esc(track.shortName)}</b>
                <span>${done} / ${track.lessons.length} nodes</span>
              </button>
            `;
          }).join("")}
        </div>
        <div>
          <span class="gw-duo-pill">${doneLessons} / ${totalLessons} lessons</span>
          <span class="gw-duo-pill">${Number(progress.classroomWildpoints || 0).toLocaleString()} Wildpoints</span>
          <span class="gw-duo-pill">${accuracy}% accuracy</span>
        </div>
      </div>
    `;
  }

  function renderMap(track) {
    const current = nextLesson(track);
    const badges = trackBadges(track);
    return `
      ${renderStatus()}
      <div class="gw-duo-map-grid">
        <section class="gw-duo-region" style="--track-accent:${esc(track.accent)}">
          <div class="gw-duo-region-head">
            <div class="gw-duo-kicker">${esc(track.region)}</div>
            <div class="gw-duo-region-title">${esc(track.name)}</div>
            <div class="gw-duo-region-sub">${esc(track.summary)}</div>
          </div>
          <div class="gw-duo-path">
            ${track.lessons.map((lesson, index) => renderPathNode(track, lesson, index)).join("")}
          </div>
        </section>
        <aside class="gw-duo-side">
          ${renderLessonPreview(track, current)}
          ${renderBadgeCabinet(track, badges)}
          ${renderWeakSkills()}
          ${renderFieldHints()}
        </aside>
      </div>
    `;
  }

  function renderPathNode(track, lesson, index) {
    const status = lessonStatus(track, lesson);
    const label = status === "complete" ? "Done" : status === "locked" ? "Locked" : status === "current" ? "Next" : "Open";
    const symbol = status === "complete" ? "OK" : status === "locked" ? String(index + 1) : "Go";
    return `
      <div class="gw-duo-path-row">
        <button class="gw-duo-node is-${esc(status)}" type="button" data-gw-duo-lesson="${esc(lesson.id)}" ${status === "locked" ? "disabled" : ""}>
          <span class="gw-duo-node-medal">${esc(symbol)}</span>
          <span>
            <b>${esc(lesson.title)}</b>
            <span>${esc(lesson.childPhrase)}</span>
          </span>
          <span class="gw-duo-pill">${esc(label)}</span>
        </button>
      </div>
    `;
  }

  function renderLessonPreview(track, lesson) {
    if (!lesson) return "";
    const status = lessonStatus(track, lesson);
    return `
      <div>
        <div class="gw-duo-section-title">${esc(lesson.title)}</div>
        <p class="gw-duo-small">${esc(lesson.explanation)}</p>
        ${renderVisual(lesson.exemplar?.visual || "whole", lesson.exemplar?.label || lesson.title)}
        <div class="gw-duo-actions">
          <button class="gw-duo-btn primary" type="button" data-gw-duo-start="${esc(lesson.id)}" ${status === "locked" ? "disabled" : ""}>
            ${progress.completedLessons[lesson.id] ? "Practice again" : "Start lesson"}
          </button>
          <button class="gw-duo-btn secondary" type="button" data-gw-duo-open-identify>Open Identify</button>
        </div>
      </div>
    `;
  }

  function renderBadgeCabinet(track, badges) {
    const lessonBadges = track.lessons.map((lesson) => achievementFor(track.id, lesson));
    return `
      <div>
        <div class="gw-duo-section-title">${esc(track.shortName)} badges</div>
        <div class="gw-duo-badge-grid">
          ${lessonBadges
            .map((badge) => {
              const accuracy = pct(badge.correct, badge.attempts);
              return `
                <div class="gw-duo-badge">
                  <b>${esc(badge.displayName)}</b>
                  <span>${esc(tierLabel(badge.tier))} - ${badge.correct} correct - ${accuracy}%</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderWeakSkills() {
    const weak = Object.entries(progress.weakSkills || {})
      .filter(([, count]) => Number(count) >= 2)
      .slice(0, 3);
    if (!weak.length) return "";
    return `
      <div>
        <div class="gw-duo-section-title">Review trail</div>
        <div class="gw-duo-hint-list">
          ${weak.map(([skill, count]) => `<span class="gw-duo-hint">${esc(shortSkill(skill))}: ${Number(count)} misses</span>`).join("")}
        </div>
      </div>
    `;
  }

  function renderFieldHints() {
    const hints = (progress.fieldHints || []).slice(-3);
    if (!hints.length) return "";
    return `
      <div>
        <div class="gw-duo-section-title">Field hints unlocked</div>
        <div class="gw-duo-hint-list">
          ${hints.map((hint) => `<span class="gw-duo-hint">${esc(hint)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function renderLesson() {
    const lesson = LESSON_BY_ID[state.activeLessonId];
    if (!lesson) return renderMap(TRACK_BY_ID[state.selectedTrackId] || TRACKS[0]);
    const item = lesson.items[state.itemIndex] || lesson.items[0];
    const itemPct = pct(state.itemIndex, lesson.items.length);
    const answeredClass = state.feedback ? " is-answered" : "";
    return `
      <div class="gw-duo-lesson-card${answeredClass}">
        <div class="gw-duo-status-row">
          <button class="gw-duo-btn secondary" type="button" data-gw-duo-back>Back to path</button>
          <span class="gw-duo-pill">${state.itemIndex + 1} / ${lesson.items.length}</span>
        </div>
        <div class="gw-duo-progress" aria-label="Lesson progress"><span style="--pct:${itemPct}%"></span></div>
        <div class="gw-duo-lesson-layout">
          <aside>
            <div class="gw-duo-kicker">${esc(lesson.fieldPhrase)}</div>
            <div class="gw-duo-region-title">${esc(lesson.childPhrase)}</div>
            <p class="gw-duo-small">${esc(lesson.concept)}</p>
            ${renderVisual(lesson.exemplar?.visual || "whole", lesson.exemplar?.label || lesson.title)}
            <p class="gw-duo-small">${esc(lesson.photoPrompt)}</p>
          </aside>
          <section class="gw-duo-question-card">
            <div class="gw-duo-question">${esc(item.question)}</div>
            <div class="gw-duo-choice-grid">
              ${item.choices.map((choice) => renderChoice(item, choice)).join("")}
            </div>
            ${renderFeedback(item)}
            <div class="gw-duo-actions">
              ${
                state.feedback
                  ? `<button class="gw-duo-btn primary" type="button" data-gw-duo-next>${state.itemIndex + 1 >= lesson.items.length ? "Finish lesson" : "Next question"}</button>`
                  : `<span class="gw-duo-small">Choose the best fieldmark clue.</span>`
              }
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderChoice(item, choice) {
    const answered = !!state.feedback;
    const isSelected = state.feedback?.choiceId === choice.id;
    const isCorrect = answered && choice.id === item.answer;
    const isWrong = answered && isSelected && choice.id !== item.answer;
    const cls = isCorrect ? "is-correct" : isWrong ? "is-wrong" : "";
    return `
      <button class="gw-duo-choice ${cls}" type="button" data-gw-duo-choice="${esc(choice.id)}" ${answered ? "disabled" : ""}>
        ${renderVisual(choice.visual || "whole", VISUAL_LABELS[choice.visual] || choice.label)}
        <span>
          <b>${esc(choice.label)}</b>
          <span>${esc(choice.sub || "")}</span>
        </span>
      </button>
    `;
  }

  function renderVisual(kind, label) {
    return `
      <div class="gw-duo-visual" data-kind="${esc(kind || "whole")}" aria-label="${esc(label || VISUAL_LABELS[kind] || "fieldmark diagram")}">
        <div class="gw-duo-visual-shape">${esc(label || VISUAL_LABELS[kind] || "Clue")}</div>
      </div>
    `;
  }

  function renderFeedback(item) {
    if (!state.feedback) return "";
    const correct = state.feedback.correct;
    return `
      <div class="gw-duo-feedback ${correct ? "is-correct" : "is-wrong"}">
        <div class="gw-duo-feedback-mark">${correct ? "OK" : "Try"}</div>
        <div>
          <b>${correct ? "Nice fieldmark." : "Not quite."}</b>
          <div class="gw-duo-small">${esc(correct ? item.feedback : state.feedback.wrongText)}</div>
          <div class="gw-duo-small">+${Number(state.feedback.points || 0)} Wildpoints</div>
        </div>
      </div>
    `;
  }

  function renderResults() {
    const lesson = LESSON_BY_ID[state.activeLessonId];
    if (!lesson) return renderMap(TRACK_BY_ID[state.selectedTrackId] || TRACKS[0]);
    const correct = state.lessonAnswers.filter((answer) => answer.correct).length;
    const total = state.lessonAnswers.length || lesson.items.length;
    const track = TRACK_BY_ID[lesson.trackId] || TRACKS[0];
    const next = nextLesson(track);
    return `
      <div class="gw-duo-result-card">
        <div class="gw-duo-kicker">${esc(track.region)}</div>
        <div class="gw-duo-title">${esc(lesson.title)} complete</div>
        <p class="gw-duo-small">${esc(lesson.photoPrompt)}</p>
        <div class="gw-duo-result-stats">
          <span class="gw-duo-pill">${correct} / ${total} correct</span>
          <span class="gw-duo-pill">${pct(correct, total)}% lesson accuracy</span>
          <span class="gw-duo-pill">${Number(progress.classroomWildpoints || 0).toLocaleString()} Wildpoints</span>
        </div>
        ${
          state.recentAwards.length
            ? `<div class="gw-duo-badge-grid" style="margin-top:14px;">${state.recentAwards
                .map(
                  (award) => `
                <div class="gw-duo-badge">
                  <b>${esc(award.name)}</b>
                  <span>${esc(award.tier)} badge progress unlocked.</span>
                </div>
              `
                )
                .join("")}</div>`
            : ""
        }
        <div class="gw-duo-actions">
          <button class="gw-duo-btn primary" type="button" data-gw-duo-map>${next?.id && next.id !== lesson.id ? "Next node" : "Back to path"}</button>
          <button class="gw-duo-btn secondary" type="button" data-gw-duo-start="${esc(lesson.id)}">Practice again</button>
          <button class="gw-duo-btn secondary" type="button" data-gw-duo-open-identify>Open Identify</button>
        </div>
      </div>
    `;
  }

  function bind(root) {
    root.querySelector("[data-gw-duo-close]")?.addEventListener("click", close);
    root.querySelector("[data-gw-duo-back]")?.addEventListener("click", () => {
      state.screen = "map";
      state.feedback = null;
      saveProgress();
      render();
    });
    root.querySelector("[data-gw-duo-map]")?.addEventListener("click", () => {
      state.screen = "map";
      state.feedback = null;
      render();
    });
    root.querySelectorAll("[data-gw-duo-track]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedTrackId = btn.dataset.gwDuoTrack || TRACKS[0].id;
        state.screen = "map";
        saveProgress();
        render();
      });
    });
    root.querySelectorAll("[data-gw-duo-lesson]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lesson = LESSON_BY_ID[btn.dataset.gwDuoLesson];
        const track = lesson && TRACK_BY_ID[lesson.trackId];
        if (!lesson || !track || !isLessonUnlocked(track, lesson)) return;
        startLesson(lesson.id);
      });
    });
    root.querySelectorAll("[data-gw-duo-start]").forEach((btn) => {
      btn.addEventListener("click", () => startLesson(btn.dataset.gwDuoStart));
    });
    root.querySelectorAll("[data-gw-duo-choice]").forEach((btn) => {
      btn.addEventListener("click", () => recordAnswer(btn.dataset.gwDuoChoice || ""));
    });
    root.querySelector("[data-gw-duo-next]")?.addEventListener("click", nextQuestion);
    root.querySelectorAll("[data-gw-duo-open-identify]").forEach((btn) => {
      btn.addEventListener("click", () => {
        close();
        window.GridWildIdentify?.openIdentifyDialog?.();
      });
    });
  }

  function startLesson(lessonId) {
    const lesson = LESSON_BY_ID[lessonId];
    if (!lesson) return;
    const track = TRACK_BY_ID[lesson.trackId] || TRACKS[0];
    if (!isLessonUnlocked(track, lesson)) return;
    state.selectedTrackId = track.id;
    state.screen = "lesson";
    state.activeLessonId = lesson.id;
    state.itemIndex = 0;
    state.lessonAnswers = [];
    state.feedback = null;
    state.recentAwards = [];
    progress.lastLessonId = lesson.id;
    saveProgress();
    render();
  }

  function recordAnswer(choiceId) {
    if (state.feedback) return;
    const lesson = LESSON_BY_ID[state.activeLessonId];
    const item = lesson?.items?.[state.itemIndex];
    if (!lesson || !item) return;
    const correct = choiceId === item.answer;
    const points = correct ? 2 : 0;
    state.lessonAnswers.push({ itemId: item.id, choiceId, correct });
    state.feedback = {
      choiceId,
      correct,
      points,
      wrongText: `${item.feedback} Keep going; the next clue is another chance.`
    };
    updateProgressForAnswer(lesson, item, correct, points);
    saveProgress();
    render();
  }

  function updateProgressForAnswer(lesson, item, correct, points) {
    const skillId = item.skill || lesson.hiddenSkills?.[0] || `${lesson.trackId}.${lesson.id}`;
    const skill = progress.skills[skillId] || { attempts: 0, correct: 0, mastery: 0.25 };
    skill.attempts += 1;
    if (correct) skill.correct += 1;
    skill.mastery = correct ? skill.mastery * 0.82 + 0.18 : skill.mastery * 0.88;
    progress.skills[skillId] = skill;

    progress.totalAttempts += 1;
    if (correct) progress.totalCorrect += 1;
    if (correct) progress.weakSkills[skillId] = Math.max(0, Number(progress.weakSkills[skillId] || 0) - 1);
    else progress.weakSkills[skillId] = Number(progress.weakSkills[skillId] || 0) + 1;

    const trackId = lesson.trackId;
    const key = achievementKey(trackId, lesson.achievementId);
    const achievement = achievementFor(trackId, lesson);
    const oldTier = achievement.tier || "";
    achievement.attempts += 1;
    if (correct) achievement.correct += 1;
    achievement.hiddenSkills = Array.from(new Set([...(achievement.hiddenSkills || []), skillId]));
    achievement.tier = tierFor(achievement);
    progress.achievements[key] = achievement;

    if (points) awardWildpoints(points);

    if (achievement.tier && achievement.tier !== oldTier) {
      state.recentAwards.push({
        name: achievement.displayName,
        tier: tierLabel(achievement.tier)
      });
      addFieldHint(lesson);
      state.toast = `${achievement.displayName}: ${tierLabel(achievement.tier)}`;
    }
  }

  function addFieldHint(lesson) {
    const hint = hintForLesson(lesson);
    if (!hint) return;
    progress.fieldHints = Array.from(new Set([...(progress.fieldHints || []), hint])).slice(-12);
  }

  function hintForLesson(lesson) {
    if (lesson.id === "underside_explorer") {
      return "You learned mushroom undersides. Try one top photo and one underside photo.";
    }
    if (lesson.id === "leaf_pair_spotter") {
      return "You learned leaf arrangement. Photograph where leaves meet the stem.";
    }
    if (lesson.id === "wing_detective") {
      return "You learned wing clues. Try a top view showing the wings.";
    }
    if (lesson.id === "photo_helper") {
      return "You learned helpful photos. Start whole, then move to the missing clue.";
    }
    return `${lesson.achievementName || lesson.title}: bring that clue into your next observation.`;
  }

  function nextQuestion() {
    const lesson = LESSON_BY_ID[state.activeLessonId];
    if (!lesson) return;
    if (state.itemIndex + 1 >= lesson.items.length) {
      completeLesson(lesson);
      return;
    }
    state.itemIndex += 1;
    state.feedback = null;
    state.toast = "";
    render();
  }

  function completeLesson(lesson) {
    const firstCompletion = !progress.completedLessons[lesson.id];
    const correct = state.lessonAnswers.filter((answer) => answer.correct).length;
    const attempts = state.lessonAnswers.length || lesson.items.length;
    progress.completedLessons[lesson.id] = {
      completedAt: new Date().toISOString(),
      bestCorrect: Math.max(correct, Number(progress.completedLessons[lesson.id]?.bestCorrect || 0)),
      attempts
    };
    progress.lessonStats[lesson.id] = {
      attempts: Number(progress.lessonStats[lesson.id]?.attempts || 0) + attempts,
      correct: Number(progress.lessonStats[lesson.id]?.correct || 0) + correct,
      lastAt: new Date().toISOString()
    };
    if (firstCompletion) {
      awardWildpoints(lesson.reward || 0, { toast: true });
    }
    const achievement = achievementFor(lesson.trackId, lesson);
    if (!achievement.completedLessons.includes(lesson.id)) {
      achievement.completedLessons.push(lesson.id);
    }
    progress.achievements[achievementKey(lesson.trackId, lesson.achievementId)] = achievement;
    window.GridWildAchievements?.evaluateCurrent?.({ source: "duo_classroom", announce: false });
    saveProgress();
    state.screen = "results";
    state.feedback = null;
    state.toast = firstCompletion ? `Lesson complete: +${lesson.reward || 0} Wildpoints` : "";
    render();
  }

  function awardWildpoints(amount, options = {}) {
    const points = Number(amount || 0);
    if (!Number.isFinite(points) || points <= 0) return;
    progress.classroomWildpoints += points;

    try {
      const economy = window.GridWildEconomy;
      const hasServerBalance = window.__gwState?.player?.wildpoints !== undefined && window.__gwState?.player?.wildpoints !== null;
      if (!hasServerBalance && economy?.load && economy?.save) {
        const local = economy.load();
        economy.save({
          ...local,
          wildPoints: Number(local.wildPoints || 0) + points
        });
      } else {
        economy?.refreshHud?.();
      }
      if (options.toast) economy?.showRewardToast?.(points, "reward");
    } catch {
      // Classroom progress still records the earned points even if the HUD is unavailable.
    }
  }

  function showToast(message) {
    if (!message) return;
    document.querySelectorAll(".gw-duo-toast").forEach((el) => el.remove());
    const toast = document.createElement("div");
    toast.className = "gw-duo-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
    state.toast = "";
  }

  function shortSkill(skill) {
    return String(skill || "")
      .split(".")
      .slice(-2)
      .join(" ")
      .replace(/_/g, " ");
  }

  function getProgress() {
    return JSON.parse(JSON.stringify(progress));
  }

  function getFieldHints() {
    return (progress.fieldHints || []).slice();
  }

  document.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-gw-duo-classroom-open]");
    if (!btn) return;
    evt.preventDefault();
    evt.stopPropagation();
    open();
  });

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && activeRoot?.isConnected) close();
  });

  window.GridWildDuoClassroom = {
    open,
    close,
    getProgress,
    getFieldHints,
    tracks: () => TRACKS.map((track) => ({ ...track, lessons: track.lessons.slice() }))
  };
})();
