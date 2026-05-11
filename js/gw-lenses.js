window.GWLenses = (function(){

function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

function scale(v,max){
  return clamp01((v || 0) / max);
}

function logScale(v,max){
  return clamp01(Math.log1p(v || 0) / Math.log1p(max));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateMs(value){
  if (!value) return 0;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function observedMs(metrics, field, msField){
  return Number(metrics?.[msField]) || parseDateMs(metrics?.[field]);
}

function ageDays(metrics, field, msField){
  const ms = observedMs(metrics, field, msField);
  if (!ms) return null;
  return Math.max(0, (Date.now() - ms) / DAY_MS);
}

function freshnessScore(days, horizonDays = 365 * 8){
  if (!Number.isFinite(days)) return 0;
  return clamp01(1 - (days / horizonDays));
}

function lastFreshness(metrics){
  return freshnessScore(ageDays(metrics, "last_observed", "last_observed_ms"));
}

function medianFreshness(metrics){
  return freshnessScore(ageDays(metrics, "median_last10_observed", "median_last10_observed_ms"));
}

function recencyGapDays(metrics){
  const last = observedMs(metrics, "last_observed", "last_observed_ms");
  const median = observedMs(metrics, "median_last10_observed", "median_last10_observed_ms");
  if (!last || !median) return 0;
  return Math.max(0, (last - median) / DAY_MS);
}

function monthDistance(a, b){
  const d = Math.abs(Number(a) - Number(b));
  return Math.min(d, 12 - d);
}

function lastObservedMonth(metrics){
  const ms = observedMs(metrics, "last_observed", "last_observed_ms");
  return ms ? new Date(ms).getUTCMonth() + 1 : 0;
}


window.GWLegendCopy = {

classic: {
title: "Explorer",
subtitle: "Balanced biodiversity overview.",
lines: [
"Hue = more observers",
"Vividness = richer biodiversity",
"Opacity = more observations"
]
},

richness: {
title: "Biodiversity",
subtitle: "Highlights species-rich squares.",
lines: [
"Hue = richness",
"Vividness = confidence",
"Opacity = total observations"
]
},

rare: {
title: "Rare Finds",
subtitle: "Unexpected richness relative to traffic.",
lines: [
"Hue = rarity signal",
"Vividness = biodiversity",
"Opacity = confidence"
]
},

underexplored: {
title: "Frontier",
subtitle: "Promising places with low effort.",
lines: [
"Hue = unexplored potential",
"Vividness = promise",
"Opacity = payoff confidence"
]
},

observers: {
title: "Busy World",
subtitle: "Human observer presence.",
lines: [
"Hue = more observers",
"Vividness = observer diversity",
"Opacity = activity"
]
},

cultivated: {
title: "Gardenworld",
subtitle: "Cultivated and planted life.",
lines: [
"Hue = cultivated share",
"Vividness = plant richness",
"Opacity = confidence"
]
},

wildbalance: {
title: "Wild Balance",
subtitle: "Wild nature versus cultivated influence.",
lines: [
"Green = wild",
"Amber = mixed",
"Rose = cultivated",
"Opacity = signal strength"
]
},

night: {
title: "Night Gold",
subtitle: "Warm nocturnal scanner.",
lines: [
"Hue = activity",
"Glow = richness",
"Opacity = confidence"
]
},

emerald: {
title: "Emerald",
subtitle: "High-contrast richness scanner.",
lines: [
"Brighter green = richer life",
"Opacity = observations"
]
},

treasure: {
title: "Treasure",
subtitle: "Reward zones for discovery.",
lines: [
"Gold intensity = hidden value",
"Opacity = confidence"
]
},

dominantlife: {
title: "Dominant Life",
subtitle: "Color by leading lifeform.",
lines: [
"Green = plants",
"Blue = birds",
"Red = insects",
"Purple = fungi",
"Gold = mammals"
]
},

seasonalpulse: {
title: "Season Pulse",
subtitle: "When life peaks here.",
lines: [
"Hue wheel = Jan → Dec",
"Opacity = seasonal strength"
]
},

stability: {
title: "Stability",
subtitle: "Steady year-round vs bursty.",
lines: [
"Cool = stable",
"Warm = short surges",
"Opacity = support"
]
},

breadth: {
title: "Breadth",
subtitle: "How many major life groups coexist.",
lines: [
"Brighter = broader ecosystem",
"Opacity = records"
]
},

treasure2: {
title: "Hidden Treasure",
subtitle: "Quiet places with strong diversity.",
lines: [
"Gold glow = reward potential",
"Opacity = confidence"
]
},

freshness: {
title: "Freshness",
subtitle: "How current the latest square evidence is.",
lines: [
"Green = recently observed",
"Amber = aging evidence",
"Rose = stale records",
"Opacity = observations"
]
},

wildtime: {
title: "Wildtime",
subtitle: "Depth of recent evidence across the last 10 records.",
lines: [
"Blue-green = broadly fresh",
"Violet = older recent set",
"Opacity = recency support"
]
},

timeconfidence: {
title: "Recency Strength",
subtitle: "Separates durable freshness from one-off updates.",
lines: [
"Green = consistently fresh",
"Gold = thin fresh signal",
"Rose = stale",
"Opacity = confidence"
]
},

revisit: {
title: "Revisit",
subtitle: "Rich squares whose evidence is aging.",
lines: [
"Gold = high revisit priority",
"Darker = older evidence",
"Opacity = payoff"
]
},

reactivated: {
title: "Reactivated",
subtitle: "New activity after a quiet stretch.",
lines: [
"Cyan = recent return",
"Violet = deeper gap",
"Opacity = comeback signal"
]
},

seasonalnow: {
title: "Season Watch",
subtitle: "Squares recently supported in this part of the year.",
lines: [
"Green = same-season evidence",
"Blue = off-season",
"Opacity = freshness"
]
}

};

const recipes = {

classic(metrics){
  const obs = logScale(metrics.count,30);
  const spp = logScale(metrics.species,20);
  const users = scale(metrics.observers,6);

  return {
    hue: 200 + (20-200)*users,
    sat: 40 + 50*spp,
    light: 65 - 20*obs,
    alpha: 0.15 + 0.65*obs
  };
},

richness(metrics){
  const spp = logScale(metrics.species,25);
  const obs = logScale(metrics.count,30);

  return {
    hue: 120,
    sat: 30 + 60*spp,
    light: 70 - 25*spp,
    alpha: 0.10 + 0.70*obs
  };
},

underexplored(metrics){
  const lowUsers = 1 - scale(metrics.observers,8);
  const spp = logScale(metrics.species,20);

  return {
    hue: 50 + 70*lowUsers,
    sat: 30 + 50*spp,
    light: 72 - 22*spp,
    alpha: 0.18 + 0.55*spp
  };
},

rare(metrics){
  const rarity =
    metrics.species > 0
      ? clamp01(metrics.species / Math.max(metrics.count,1))
      : 0;

  const obs = logScale(metrics.count,30);

  return {
    hue: 300 - 120*rarity,
    sat: 40 + 55*rarity,
    light: 70 - 25*rarity,
    alpha: 0.12 + 0.65*obs
  };
},

observers(metrics){
 const u = Math.min(metrics.observers||0,10)/10;
 const obs = Math.min(metrics.count||0,40)/40;

 return {
   hue: 210,
   sat: 25 + 60*u,
   light: 72 - 30*u,
   alpha: 0.18 + 0.65*obs
 };
},

night(metrics){
 const spp = Math.min(metrics.species||0,20)/20;

 return {
   hue: 42,
   sat: 55 + 35*spp,
   light: 52 - 12*spp,
   alpha: 0.20 + 0.55*spp
 };
},
emerald(metrics){
 const spp = Math.min(metrics.species||0,25)/25;

 return {
   hue: 135,
   sat: 35 + 60*spp,
   light: 70 - 28*spp,
   alpha: 0.18 + 0.60*spp
 };
},
treasure(metrics){
 const sparse = 1 - Math.min(metrics.observers||0,8)/8;
 const spp = Math.min(metrics.species||0,20)/20;

 return {
   hue: 20 + 55*sparse,
   sat: 40 + 45*spp,
   light: 72 - 22*spp,
   alpha: 0.20 + 0.55*spp
 };
},

cultivated(metrics){

  const captive = metrics.n_captive || 0;
  const count   = metrics.count || 0;
  const species = metrics.species || 0;

  const pct  = captive / Math.max(count,1);
  const rich = Math.min(species,20) / 20;
  const vol  = Math.min(captive,20) / 20;

  return {
    hue: 34 + 12*pct,          // amber / gold
    sat: 28 + 55*rich,
    light: 76 - 24*pct,
    alpha: 0.15 + 0.65*vol
  };
},

wildbalance(metrics){

  const captive = metrics.n_captive || 0;
  const count   = metrics.count || 0;

  const pctCult = captive / Math.max(count,1);   // 0 wild, 1 cultivated
  const vol = Math.min(count,30) / 30;

  return {
    hue: 120 - 80*pctCult,    // green -> yellow/orange
    sat: 35 + 45*Math.abs(0.5 - pctCult)*2,
    light: 68 - 18*vol,
    alpha: 0.18 + 0.62*vol
  };
},




dominantlife(metrics){

  const dom = metrics.dominant_iconic || "Unknown";
  const vol = logScale(metrics.count,30);

  let hue = 0;

  if (dom === "Plantae") hue = 120;
  else if (dom === "Aves") hue = 210;
  else if (dom === "Insecta") hue = 10;
  else if (dom === "Fungi") hue = 285;
  else if (dom === "Mammalia") hue = 42;
  else hue = 0;

  return {
    hue,
    sat: 58,
    light: 68 - 20*vol,
    alpha: 0.18 + 0.60*vol
  };
},

seasonalpulse(metrics){

  const month = metrics.peak_month || 1;
  const strength = metrics.seasonal_strength || 0;

  const hue = ((month-1) / 12) * 360;

  return {
    hue,
    sat: 30 + 55*strength,
    light: 72 - 20*strength,
    alpha: 0.18 + 0.62*strength
  };
},

stability(metrics){

  const e = clamp01((metrics.month_entropy || 0) / 3.6);
  const vol = logScale(metrics.count,30);

  return {
    hue: 220 - 170*e,
    sat: 35 + 40*e,
    light: 72 - 20*vol,
    alpha: 0.16 + 0.60*vol
  };
},

breadth(metrics){

  const n = scale(metrics.iconic_n || 1,6);
  const vol = logScale(metrics.count,30);

  return {
    hue: 160,
    sat: 20 + 65*n,
    light: 74 - 22*n,
    alpha: 0.15 + 0.60*vol
  };
},

treasure2(metrics){

  const rich = logScale(metrics.species,20);
  const sparse = 1 - scale(metrics.nActiveSquares || 1,9);

  return {
    hue: 35 + 25*sparse,
    sat: 38 + 50*rich,
    light: 74 - 24*rich,
    alpha: 0.18 + 0.58*(rich*sparse)
  };
},

freshness(metrics){
  const f = lastFreshness(metrics);
  const obs = logScale(metrics.count,30);

  return {
    hue: 345 - 225*f,
    sat: 42 + 40*f,
    light: 72 - 22*obs,
    alpha: 0.12 + 0.68*Math.max(obs, f * 0.65)
  };
},

wildtime(metrics){
  const f = medianFreshness(metrics);
  const obs = logScale(metrics.count,30);

  return {
    hue: 275 - 115*f,
    sat: 38 + 42*f,
    light: 74 - 24*Math.max(obs, f),
    alpha: 0.12 + 0.68*Math.max(obs * 0.65, f)
  };
},

timeconfidence(metrics){
  const last = lastFreshness(metrics);
  const median = medianFreshness(metrics);
  const gap = clamp01(recencyGapDays(metrics) / (365 * 5));
  const sturdy = Math.min(last, median);
  const thinFresh = Math.max(0, last - median) * gap;
  const stale = 1 - last;
  const obs = logScale(metrics.count,30);

  return {
    hue: thinFresh > sturdy && thinFresh > stale ? 44 : 345 - 225*sturdy,
    sat: 40 + 45*Math.max(sturdy, thinFresh, stale * 0.45),
    light: 74 - 24*Math.max(sturdy, thinFresh, obs * 0.7),
    alpha: 0.14 + 0.66*Math.max(obs * 0.7, sturdy, thinFresh)
  };
},

revisit(metrics){
  const stale = 1 - lastFreshness(metrics);
  const rich = logScale(metrics.species,25);
  const obs = logScale(metrics.count,30);
  const priority = stale * (0.35 + 0.65*rich);

  return {
    hue: 48 - 22*stale,
    sat: 34 + 55*priority,
    light: 78 - 30*priority,
    alpha: 0.10 + 0.72*priority*Math.max(0.45, obs)
  };
},

reactivated(metrics){
  const last = lastFreshness(metrics);
  const median = medianFreshness(metrics);
  const gap = clamp01(recencyGapDays(metrics) / (365 * 4));
  const comeback = clamp01(last * (1 - median) * (0.35 + 0.65*gap));
  const obs = logScale(metrics.count,30);

  return {
    hue: 190 + 72*gap,
    sat: 42 + 48*comeback,
    light: 76 - 30*comeback,
    alpha: 0.08 + 0.74*Math.max(comeback, obs * 0.25)
  };
},

seasonalnow(metrics){
  const month = lastObservedMonth(metrics);
  const nowMonth = new Date().getMonth() + 1;
  const seasonalFit = month ? 1 - monthDistance(month, nowMonth) / 6 : 0;
  const fresh = lastFreshness(metrics);
  const signal = clamp01(0.35*fresh + 0.65*seasonalFit);
  const obs = logScale(metrics.count,30);

  return {
    hue: 210 - 90*signal,
    sat: 34 + 48*signal,
    light: 75 - 24*Math.max(signal, obs * 0.7),
    alpha: 0.10 + 0.68*Math.max(fresh, signal * 0.8)
  };
},


};

function compose(metrics){
  if(!metrics || (metrics.count||0)<=0) return null;

  const lens = window.__gwState?.activeLens || "classic";
  const fn = recipes[lens] || recipes.classic;

  const c = fn(metrics);

  return {
    fillColor:
      `hsl(${c.hue.toFixed(1)},${c.sat.toFixed(1)}%,${c.light.toFixed(1)}%)`,
    fillOpacity: c.alpha
  };
}


return {
  recipes,
  compose
};

})();
