// -----------------------------------------------------------------------------
// GridWild Store Catalog
// -----------------------------------------------------------------------------

(function () {
  window.GridWildStoreCatalog = {
    items: [
      // Hats
      { id: "explorer_cap", name: "Explorer Cap", category: "hat", slot: "hat", rarity: "common", price: 100, currency: "wildPoints", icon: "🧢", featured: true, description: "A practical cap for new field wanderers." },
      { id: "fern_crown", name: "Fern Crown", category: "hat", slot: "hat", rarity: "rare", price: 500, currency: "wildPoints", icon: "🌿", featured: true, description: "A crown for explorers who keep noticing plants." },
      { id: "moth_hood", name: "Moth Hood", category: "hat", slot: "hat", rarity: "epic", price: 950, currency: "wildPoints", icon: "🌙", description: "A soft hood for nocturnal observers." },
      { id: "rain_hat", name: "Rain Hat", category: "hat", slot: "hat", rarity: "common", price: 180, currency: "wildPoints", icon: "🌧️", description: "For fieldwork when the weather gets interesting." },
      { id: "professor_hat", name: "Professor Hat", category: "hat", slot: "hat", rarity: "rare", price: 650, currency: "wildPoints", icon: "🎓", description: "For the scholar-naturalist aesthetic." },

      // Titles
      { id: "trail_scout_title", name: "Title: Trail Scout", category: "title", slot: "title", rarity: "common", price: 150, currency: "wildPoints", icon: "🥾", featured: true, description: "Display Trail Scout beneath your GridWild name." },
      { id: "fly_lord_title", name: "Title: Fly Lord", category: "title", slot: "title", rarity: "rare", price: 700, currency: "wildPoints", icon: "🪰", requiresAchievement: "fly_obs_25", description: "For observers who have truly entered Diptera consciousness." },
      { id: "fern_master_title", name: "Title: Fern Master", category: "title", slot: "title", rarity: "rare", price: 700, currency: "wildPoints", icon: "🌿", requiresAchievement: "fern_obs_25", description: "For serious fern people." },
      { id: "night_explorer_title", name: "Title: Night Explorer", category: "title", slot: "title", rarity: "rare", price: 600, currency: "wildPoints", icon: "🌙", requiresAchievement: "night_10", description: "For those who survey after dark." },
      { id: "the_lichened_one_title", name: "Title: The Lichened One", category: "title", slot: "title", rarity: "legendary", price: 1500, currency: "wildPoints", icon: "🪨", requiresAchievement: "lichen_obs_25", description: "Ancient. Crustose. Unbothered." },

      // Frames
      { id: "brass_field_frame", name: "Brass Field Frame", category: "frame", slot: "frame", rarity: "common", price: 200, currency: "wildPoints", icon: "🖼️", description: "A brass museum-label border for your profile." },
      { id: "fern_border", name: "Fern Border", category: "frame", slot: "frame", rarity: "rare", price: 520, currency: "wildPoints", icon: "🌿", description: "A leafy frame for botanical obsessives." },
      { id: "beetle_carapace_frame", name: "Beetle Carapace Frame", category: "frame", slot: "frame", rarity: "epic", price: 950, currency: "wildPoints", icon: "🪲", requiresAchievement: "beetle_obs_25", description: "Glossy, armored, and slightly intimidating." },
      { id: "museum_label_frame", name: "Museum Label Frame", category: "frame", slot: "frame", rarity: "rare", price: 600, currency: "wildPoints", icon: "🏷️", description: "Looks like your profile belongs in a specimen drawer." },

      // Trails
      { id: "firefly_trail", name: "Firefly Trail", category: "trail", slot: "trail", rarity: "rare", price: 800, currency: "wildPoints", icon: "✨", featured: true, description: "A faint trail of fireflies follows your map presence." },
      { id: "falling_leaves", name: "Falling Leaves", category: "trail", slot: "trail", rarity: "common", price: 350, currency: "wildPoints", icon: "🍂", description: "A soft seasonal drift behind your explorer." },
      { id: "spore_drift", name: "Spore Drift", category: "trail", slot: "trail", rarity: "rare", price: 700, currency: "wildPoints", icon: "🍄", description: "A drifting spore effect for fungus-minded explorers." },
      { id: "pollen_drift", name: "Pollen Drift", category: "trail", slot: "trail", rarity: "rare", price: 650, currency: "wildPoints", icon: "🌼", description: "For pollinator season maximalists." },
      { id: "moth_dust", name: "Moth Dust", category: "trail", slot: "trail", rarity: "epic", price: 1100, currency: "wildPoints", icon: "🦋", requiresAchievement: "night_10", description: "A shimmering nocturnal powder trail." },

      // Companions
      { id: "chickadee_companion", name: "Chickadee Companion", category: "companion", slot: "companion", rarity: "common", price: 450, currency: "wildPoints", icon: "🐦", description: "A tiny companion with enormous confidence." },
      { id: "luna_moth_companion", name: "Luna Moth Companion", category: "companion", slot: "companion", rarity: "epic", price: 1200, currency: "wildPoints", icon: "🦋", featured: true, description: "A gentle moth companion for night observers." },
      { id: "jumping_spider_companion", name: "Jumping Spider Companion", category: "companion", slot: "companion", rarity: "rare", price: 750, currency: "wildPoints", icon: "🕷️", description: "Small, observant, and weirdly charismatic." },
      { id: "salamander_companion", name: "Salamander Companion", category: "companion", slot: "companion", rarity: "rare", price: 850, currency: "wildPoints", icon: "🦎", description: "Best seen after rain." },
      { id: "fox_companion", name: "Fox Companion", category: "companion", slot: "companion", rarity: "epic", price: 1400, currency: "wildPoints", icon: "🦊", description: "A sly companion for city-edge wanderers." },

      // Seasonal
      { id: "winter_owl_pin", name: "Winter Owl Pin", category: "seasonal", slot: "frame", rarity: "seasonal", price: 600, currency: "wildPoints", icon: "🦉", featured: true, description: "A limited winter field badge." },
      { id: "spring_ephemeral_cape", name: "Spring Ephemeral Cape", category: "seasonal", slot: "hat", rarity: "seasonal", price: 900, currency: "wildPoints", icon: "🌸", description: "For the short bloom window." },
      { id: "october_moth_lantern", name: "October Moth Lantern", category: "seasonal", slot: "companion", rarity: "seasonal", price: 1300, currency: "wildPoints", icon: "🏮", requiresAchievement: "night_10", description: "A glowing lantern for autumn moth nights." },
      { id: "summer_cicada_badge", name: "Summer Cicada Badge", category: "seasonal", slot: "frame", rarity: "seasonal", price: 650, currency: "wildPoints", icon: "🎶", description: "Loud, seasonal, unavoidable." }
    ]
  };
})();