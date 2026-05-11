window.GWMetrics = (() => {

function num(x){ return Number(x)||0; }

function parseDateMs(value){
  if (!value) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function dateIsoFromMs(ms){
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

function monthName(n){
  const i = Number(n) - 1;
  return MONTH_NAMES[i] || "?";
}

function sum(arr){
  return (arr||[]).reduce((a,b)=>a+num(b),0);
}

function entropy(arr){
  const t = sum(arr);
  if (!t) return 0;

  let h = 0;

  for (const v of arr){
    const p = num(v)/t;
    if (p>0) h -= p*Math.log2(p);
  }
  return h;
}

function squareRows(square){
  if (!square) return [];
  if (Array.isArray(square.genera)) return square.genera;
  if (square.genera) return [square.genera];
  return [];
}

function buildSquareMetrics(square){

  const rows = squareRows(square);

  const months = Array(12).fill(0);
  const iconic = {};
  const genera = new Set();

  let count = 0;
  let lastObservedMs = parseDateMs(square?.last_observed);
  let medianLast10ObservedMs = parseDateMs(square?.median_last10_observed);

  for (const r of rows){

    const c = num(r.count);
    count += c;

    if (r.genus_name) genera.add(r.genus_name);

    const icon = r.iconic_taxon_name || "Unknown";
    iconic[icon] = (iconic[icon]||0) + c;

    (r.month_counts || []).forEach((v,i)=>{
      months[i] += num(v);
    });

    const rowLast = parseDateMs(r.last_observed);
    const rowMedian = parseDateMs(r.median_last10_observed);

    if (rowLast && (!lastObservedMs || rowLast > lastObservedMs)) {
      lastObservedMs = rowLast;
    }

    if (rowMedian && (!medianLast10ObservedMs || rowMedian > medianLast10ObservedMs)) {
      medianLast10ObservedMs = rowMedian;
    }
  }

  const peak = Math.max(...months);
  const total = sum(months);

  const dominant =
    Object.entries(iconic)
      .sort((a,b)=>b[1]-a[1])[0]?.[0] || "Unknown";

  return {
    count,
    species: genera.size,
    genera: genera.size,

    iconic_counts: iconic,
    dominant_iconic: dominant,
    iconic_n: Object.keys(iconic).length,

    month_totals: months,
    peak_month: months.indexOf(peak)+1,
    seasonal_strength: total ? peak/total : 0,
    month_entropy: entropy(months),

    last_observed: square?.last_observed || dateIsoFromMs(lastObservedMs),
    median_last10_observed: square?.median_last10_observed || dateIsoFromMs(medianLast10ObservedMs),
    last_observed_ms: lastObservedMs || 0,
    median_last10_observed_ms: medianLast10ObservedMs || 0,

    activity_score:
      Math.log1p(count) * (1 + genera.size*0.05)
  };
}

function buildChunkMetrics(chunk){

  const vals = Object.values(chunk.squares || {});
  const arr = vals.map(buildSquareMetrics);

  const counts = arr.map(x=>x.count).sort((a,b)=>a-b);
  const spp    = arr.map(x=>x.species).sort((a,b)=>a-b);

  const pct = (v,p)=>
    v[Math.floor((v.length-1)*p)] || 0;

  return {
    nSquares: arr.length,
    p90Count: pct(counts,0.90),
    p90Species: pct(spp,0.90),
    maxCount: counts.at(-1)||0,
    maxSpecies: spp.at(-1)||0
  };
}

function mergeSquareMetrics(records){

  const merged = {
    count: 0,
    species: 0,
    genera: 0,

    iconic_counts: {},
    month_totals: Array(12).fill(0),

    nSquares: 0,
    nActiveSquares: 0,

    last_observed: null,
    median_last10_observed: null,
    last_observed_ms: 0,
    median_last10_observed_ms: 0
  };

  const genusSet = new Set();

  for (const rec of records){

    if (!rec) continue;

    merged.nSquares++;

    const m = rec.__metrics || buildSquareMetrics(rec);

    merged.count += m.count || 0;

    if ((m.count || 0) > 0) {
      merged.nActiveSquares++;
    }

    const lastMs = Number(m.last_observed_ms) || parseDateMs(m.last_observed) || 0;
    const medianMs = Number(m.median_last10_observed_ms) || parseDateMs(m.median_last10_observed) || 0;

    if (lastMs > merged.last_observed_ms) {
      merged.last_observed_ms = lastMs;
      merged.last_observed = dateIsoFromMs(lastMs);
    }

    if (medianMs > merged.median_last10_observed_ms) {
      merged.median_last10_observed_ms = medianMs;
      merged.median_last10_observed = dateIsoFromMs(medianMs);
    }

    // iconic counts
    for (const [k,v] of Object.entries(m.iconic_counts || {})) {
      merged.iconic_counts[k] =
        (merged.iconic_counts[k] || 0) + (v || 0);
    }

    // month totals
    (m.month_totals || []).forEach((v,i)=>{
      merged.month_totals[i] += Number(v) || 0;
    });

    // genus richness
    const rows = squareRows(rec);
    for (const r of rows){
      if (r.genus_name) genusSet.add(r.genus_name);
    }
  }

  merged.species = genusSet.size;
  merged.genera  = genusSet.size;

  const peak = Math.max(...merged.month_totals);
  const total = merged.month_totals.reduce((a,b)=>a+b,0);

  merged.peak_month =
    merged.month_totals.indexOf(peak) + 1;

  merged.seasonal_strength =
    total ? peak / total : 0;

    const dom =
  Object.entries(merged.iconic_counts)
    .sort((a,b)=>b[1]-a[1])[0];

    merged.dominant_iconic =
    dom ? dom[0] : "Unknown";

  return merged;
}

function enrichChunk(chunk){

  if (!chunk || !chunk.squares) return chunk;

  for (const sq of Object.values(chunk.squares)){
    sq.__metrics = buildSquareMetrics(sq);
  }

  chunk.__metrics = buildChunkMetrics(chunk);

  return chunk;
}

return {
  enrichChunk,
  buildSquareMetrics,
  buildChunkMetrics,
  mergeSquareMetrics,
  monthName
};

})();
