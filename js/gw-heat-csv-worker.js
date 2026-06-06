const BATCH_SIZE = 1500;

const ALLOWED_HEADERS = new Set([
  "ix,iy,count,species,observers,n_captive",
  "ix,iy,count,n_species,n_observers,n_captive",
  "ix,iy,count,species,observers",
  "ix,iy,count,n_genera,n_observers,n_captive,last_observed,median_last10_observed"
]);

function parseGridDateMs(value) {
  if (!value) return 0;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function parseColumns(header) {
  const columns = header.split(",").map((value) => value.trim());
  const col = (...names) => {
    for (const name of names) {
      const index = columns.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };

  return {
    ix: col("ix"),
    iy: col("iy"),
    count: col("count"),
    species: col("species", "n_species", "n_genera"),
    observers: col("observers", "n_observers"),
    captive: col("n_captive"),
    lastObserved: col("last_observed"),
    medianLast10: col("median_last10_observed")
  };
}

function parseHeatCsv(text) {
  let cursor = 0;
  let columns = null;
  let parsedCount = 0;
  let rows = [];

  function flush() {
    if (!rows.length) return;
    self.postMessage({ type: "chunk", rows });
    rows = [];
  }

  while (cursor < text.length) {
    const nextBreak = text.indexOf("\n", cursor);
    const end = nextBreak >= 0 ? nextBreak : text.length;
    const line = text.slice(cursor, end).replace(/\r$/, "");
    cursor = nextBreak >= 0 ? nextBreak + 1 : text.length;

    if (!line.trim()) continue;

    if (!columns) {
      const header = line.trim().toLowerCase();
      if (!ALLOWED_HEADERS.has(header)) {
        self.postMessage({
          type: "warning",
          message: `Unexpected CSV header: ${header}`
        });
      }
      columns = parseColumns(header);
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 5) continue;

    const ix = Number(parts[columns.ix]);
    const iy = Number(parts[columns.iy]);
    const count = Number(parts[columns.count]);
    const species = Number(parts[columns.species]);
    const observers = Number(parts[columns.observers]);
    const nCaptive = columns.captive >= 0 ? Number(parts[columns.captive] ?? 0) : 0;

    if (
      !Number.isFinite(ix) ||
      !Number.isFinite(iy) ||
      !Number.isFinite(count) ||
      !Number.isFinite(species) ||
      !Number.isFinite(observers) ||
      !Number.isFinite(nCaptive)
    ) {
      continue;
    }

    const lastObserved = columns.lastObserved >= 0 ? parts[columns.lastObserved] || null : null;
    const medianLast10Observed =
      columns.medianLast10 >= 0 ? parts[columns.medianLast10] || null : null;

    rows.push([
      `${ix},${iy}`,
      count,
      species,
      observers,
      nCaptive,
      lastObserved,
      medianLast10Observed,
      parseGridDateMs(lastObserved),
      parseGridDateMs(medianLast10Observed)
    ]);
    parsedCount++;

    if (rows.length >= BATCH_SIZE) flush();
  }

  flush();
  self.postMessage({ type: "done", count: parsedCount });
}

self.onmessage = async (event) => {
  const url = event.data?.url;

  try {
    if (!url) throw new Error("Static heat CSV URL is required.");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    parseHeatCsv(await response.text());
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err?.message || "Static heat CSV worker failed."
    });
  }
};
