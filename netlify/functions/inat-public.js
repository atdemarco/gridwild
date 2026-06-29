const API_ORIGIN = "https://api.inaturalist.org";
const WEB_ORIGIN = "https://www.inaturalist.org";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=600"
};

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...JSON_HEADERS,
      ...headers
    },
    body
  };
}

function error(statusCode, message, headers = {}) {
  return response(statusCode, JSON.stringify({ error: message }), {
    "Cache-Control": "no-store",
    ...headers
  });
}

function isAllowedApiPath(pathname) {
  return (
    pathname === "/v1/projects" ||
    /^\/v1\/projects\/[^/]+$/.test(pathname) ||
    pathname === "/v1/places/nearby" ||
    /^\/v1\/places\/[0-9]+$/.test(pathname)
  );
}

function isAllowedWebPath(pathname) {
  return /^\/places\/geometry\/[0-9]+\.kml$/.test(pathname);
}

function normalizeINatUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    throw Object.assign(new Error("Invalid iNaturalist URL."), { statusCode: 400 });
  }

  if (url.origin === API_ORIGIN && isAllowedApiPath(url.pathname)) return url;
  if (url.origin === WEB_ORIGIN && isAllowedWebPath(url.pathname)) return url;

  throw Object.assign(new Error("Unsupported iNaturalist public endpoint."), { statusCode: 400 });
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
  }

  if (event.httpMethod !== "GET") {
    return error(405, "Method not allowed.");
  }

  let targetUrl;
  try {
    targetUrl = normalizeINatUrl(event.queryStringParameters?.url);
  } catch (err) {
    return error(err.statusCode || 400, err.message || "Invalid iNaturalist request.");
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Accept: targetUrl.pathname.endsWith(".kml")
          ? "application/vnd.google-earth.kml+xml,text/xml;q=0.9,*/*;q=0.8"
          : "application/json",
        "User-Agent": "GridWild/1.0 (https://gridwild.com)"
      }
    });
    const contentType =
      upstream.headers.get("content-type") ||
      (targetUrl.pathname.endsWith(".kml")
        ? "application/xml; charset=utf-8"
        : JSON_HEADERS["Content-Type"]);
    const body = await upstream.text();
    const retryAfter = upstream.headers.get("retry-after");

    return response(upstream.status, body, {
      "Content-Type": contentType,
      "Cache-Control": upstream.ok ? JSON_HEADERS["Cache-Control"] : "no-store",
      ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      "Access-Control-Allow-Origin": "*"
    });
  } catch (err) {
    return error(502, err?.message || "Could not reach iNaturalist.");
  }
};
