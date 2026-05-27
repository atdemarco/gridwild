const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const MAX_POINTS = 100;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 120;
const MIN_UPSTREAM_INTERVAL_MS = 1000 * 20;
const DEFAULT_RATE_LIMIT_MS = 1000 * 60 * 10;
const elevationCache = new Map();
let upstreamDisabledUntil = 0;
let lastUpstreamFetchAt = 0;

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function parsePoints(body) {
  const points = Array.isArray(body?.points) ? body.points : [];
  return points.slice(0, MAX_POINTS).map((point, index) => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    const key = String(point?.key || `${lat.toFixed(5)},${lng.toFixed(5)}`);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Point ${index + 1} has an invalid latitude.`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`Point ${index + 1} has an invalid longitude.`);
    }
    return { key, lat, lng };
  });
}

function cacheKey(point) {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function cachedElevation(point) {
  const entry = elevationCache.get(cacheKey(point));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    elevationCache.delete(cacheKey(point));
    return null;
  }
  return entry.elevationM;
}

function parseRetryAfterMs(value) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  const dateMs = Date.parse(value || "");
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());

  return 0;
}

function rateLimited(retryMs) {
  const retrySeconds = Math.max(1, Math.ceil(retryMs / 1000));
  return json(429, {
    error: "Elevation lookup is cooling down.",
    retry_after_ms: retryMs
  }, {
    "Retry-After": String(retrySeconds),
    "cache-control": "no-store"
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." }, { allow: "POST" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const points = parsePoints(body);
    if (!points.length) {
      return json(400, { error: "At least one elevation point is required." });
    }

    const now = Date.now();
    const missing = points.filter(point => !Number.isFinite(cachedElevation(point)));
    if (!missing.length) {
      return json(200, {
        points: points.map(point => ({
          key: point.key,
          lat: point.lat,
          lng: point.lng,
          elevation_m: cachedElevation(point)
        })),
        source: "Open-Meteo Elevation API",
        attribution: "Copernicus DEM GLO-90 via Open-Meteo",
        cache: "hit"
      }, {
        "cache-control": "public, max-age=86400"
      });
    }

    if (now < upstreamDisabledUntil) {
      return rateLimited(upstreamDisabledUntil - now);
    }

    if (now - lastUpstreamFetchAt < MIN_UPSTREAM_INTERVAL_MS) {
      return rateLimited(MIN_UPSTREAM_INTERVAL_MS - (now - lastUpstreamFetchAt));
    }

    const url = new URL(OPEN_METEO_ELEVATION_URL);
    url.searchParams.set("latitude", missing.map(point => point.lat.toFixed(5)).join(","));
    url.searchParams.set("longitude", missing.map(point => point.lng.toFixed(5)).join(","));

    lastUpstreamFetchAt = now;
    const resp = await fetch(url, {
      headers: { accept: "application/json" }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 429) {
        const retryMs = Math.max(parseRetryAfterMs(resp.headers.get("Retry-After")), DEFAULT_RATE_LIMIT_MS);
        upstreamDisabledUntil = Date.now() + retryMs;
        return rateLimited(retryMs);
      }
      return json(resp.status, {
        error: `Elevation lookup failed (${resp.status}).`,
        detail: text.slice(0, 300)
      });
    }

    const data = await resp.json();
    const elevations = Array.isArray(data?.elevation) ? data.elevation : [];
    missing.forEach((point, index) => {
      const elevationM = Number(elevations[index]);
      if (!Number.isFinite(elevationM)) return;
      elevationCache.set(cacheKey(point), {
        elevationM,
        fetchedAt: Date.now()
      });
    });

    const results = points.map((point, index) => {
      const elevationM = cachedElevation(point);
      return {
        key: point.key,
        lat: point.lat,
        lng: point.lng,
        elevation_m: Number.isFinite(elevationM) ? elevationM : null
      };
    });

    return json(200, {
      points: results,
      source: "Open-Meteo Elevation API",
      attribution: "Copernicus DEM GLO-90 via Open-Meteo"
    }, {
      "cache-control": "public, max-age=86400"
    });
  } catch (err) {
    return json(400, { error: err.message || "Elevation lookup failed." });
  }
};
