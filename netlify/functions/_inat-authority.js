const { httpError } = require("./_gridwild-player-session");

const INAT_API = "https://api.inaturalist.org/v1";
const INAT_WEB = "https://www.inaturalist.org";

function cleanNumericId(value, label = "iNaturalist ID") {
  const text = String(value || "").trim();
  if (!/^[1-9][0-9]{0,18}$/.test(text)) {
    throw httpError(400, `${label} must be a numeric iNaturalist ID.`);
  }
  return text;
}

function headerValue(event, name) {
  const headers = event?.headers || {};
  const wanted = String(name || "").toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  return key ? String(headers[key] || "").trim() : "";
}

function cookieValue(event, name) {
  const cookie = headerValue(event, "cookie");
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function responseJson(response, label) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error || data?.errors?.[0]?.message || `${label} failed with HTTP ${response.status}.`;
    const statusCode = response.status === 401 ? 401 : response.status === 404 ? 404 : 502;
    throw httpError(statusCode, message);
  }

  return data;
}

async function inatApiTokenForRequest(event) {
  const directToken = headerValue(event, "x-gridwild-inat-token");
  if (directToken && !directToken.startsWith("mock:")) {
    return directToken;
  }

  const oauthToken = cookieValue(event, "inat_oauth");
  if (!oauthToken) {
    throw httpError(401, "Connect iNaturalist before submitting reward-bearing evidence.");
  }

  const response = await fetch(`${INAT_WEB}/users/api_token`, {
    headers: { Authorization: `Bearer ${oauthToken}` }
  });
  const data = await responseJson(response, "iNaturalist token exchange");
  if (!data?.api_token) {
    throw httpError(401, "iNaturalist did not return a usable API token.");
  }
  return data.api_token;
}

async function inatGet(path, apiToken) {
  const response = await fetch(`${INAT_API}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` }
  });
  return responseJson(response, "iNaturalist verification");
}

function firstResult(data) {
  return Array.isArray(data?.results) ? data.results[0] || null : data || null;
}

async function requireLinkedINatUser(supabase, event, playerId) {
  const apiToken = await inatApiTokenForRequest(event);
  const user = firstResult(await inatGet("/users/me", apiToken));
  const inatUserId = Number(user?.id);

  if (!Number.isSafeInteger(inatUserId) || inatUserId <= 0) {
    throw httpError(401, "Could not verify the connected iNaturalist account.");
  }

  const { data: playerLink, error: playerLinkError } = await supabase
    .from("gridwild_player_inat_accounts")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (playerLinkError) throw playerLinkError;

  if (playerLink && Number(playerLink.inat_user_id) !== inatUserId) {
    throw httpError(
      409,
      "This GridWild explorer is already linked to a different iNaturalist account."
    );
  }

  const { data: inatLink, error: inatLinkError } = await supabase
    .from("gridwild_player_inat_accounts")
    .select("*")
    .eq("inat_user_id", inatUserId)
    .maybeSingle();

  if (inatLinkError) throw inatLinkError;
  if (inatLink && String(inatLink.player_id) !== String(playerId)) {
    throw httpError(
      409,
      "This iNaturalist account is already linked to another GridWild explorer."
    );
  }

  const now = new Date().toISOString();
  const linkMutation = playerLink
    ? supabase
        .from("gridwild_player_inat_accounts")
        .update({
          inat_login: String(user?.login || ""),
          verified_at: now,
          updated_at: now
        })
        .eq("player_id", playerId)
        .eq("inat_user_id", inatUserId)
    : supabase.from("gridwild_player_inat_accounts").insert({
        player_id: playerId,
        inat_user_id: inatUserId,
        inat_login: String(user?.login || ""),
        verified_at: now,
        updated_at: now
      });
  const { data: link, error: linkError } = await linkMutation.select("*").single();

  if (linkError) throw linkError;
  return { apiToken, user, link };
}

async function fetchINatObservation(apiToken, observationId) {
  const id = cleanNumericId(observationId, "obs_id");
  const observation = firstResult(await inatGet(`/observations/${id}`, apiToken));
  if (!observation) throw httpError(404, "iNaturalist observation not found.");
  return observation;
}

async function fetchINatTaxonContext(apiToken, observation) {
  const taxon = observation?.taxon || null;
  if (!taxon?.id) return taxon;
  if (Array.isArray(taxon.ancestors) && taxon.ancestors.length) return taxon;

  try {
    const detailed = firstResult(
      await inatGet(`/taxa/${cleanNumericId(taxon.id, "taxon_id")}`, apiToken)
    );
    return detailed || taxon;
  } catch {
    return taxon;
  }
}

function observationCoordinates(observation) {
  const geojson = observation?.private_geojson || observation?.geojson || null;
  const coordinates = geojson?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function observationDate(observation) {
  const raw =
    observation?.time_observed_at ||
    observation?.observed_on_string ||
    observation?.observed_on ||
    null;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function observationLocalHour(observation) {
  const raw = String(observation?.time_observed_at || observation?.observed_on_string || "");
  const match = raw.match(/T([0-2][0-9]):/);
  return match ? Number(match[1]) : null;
}

function taxonomyText(observation, taxonContext = null) {
  const taxon = taxonContext || observation?.taxon || {};
  const ancestors = Array.isArray(taxon?.ancestors) ? taxon.ancestors : [];
  return [
    observation?.species_guess,
    observation?.taxon?.name,
    observation?.taxon?.preferred_common_name,
    observation?.taxon?.iconic_taxon_name,
    taxon?.name,
    taxon?.preferred_common_name,
    taxon?.iconic_taxon_name,
    ...ancestors.flatMap((ancestor) => [
      ancestor?.name,
      ancestor?.preferred_common_name,
      ancestor?.rank
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);
}

function assertOwnedObservation(observation, inatUser) {
  if (Number(observation?.user?.id) !== Number(inatUser?.id)) {
    throw httpError(
      403,
      "Reward-bearing observation evidence must belong to the linked iNaturalist account."
    );
  }
}

function verifyINatIdentification(observation, inatUser, externalId, requestedTaxonId) {
  const identificationId = cleanNumericId(externalId, "external_identification_id");
  const identification = (observation?.identifications || []).find(
    (row) =>
      String(row?.id) === identificationId &&
      Number(row?.user?.id) === Number(inatUser?.id) &&
      row?.current !== false
  );

  if (!identification) {
    throw httpError(422, "The linked iNaturalist account has not submitted that identification.");
  }

  if (
    requestedTaxonId !== undefined &&
    requestedTaxonId !== null &&
    Number(identification?.taxon?.id) !== Number(requestedTaxonId)
  ) {
    throw httpError(422, "The submitted iNaturalist identification uses a different taxon.");
  }

  return identification;
}

module.exports = {
  assertOwnedObservation,
  cleanNumericId,
  fetchINatObservation,
  fetchINatTaxonContext,
  observationCoordinates,
  observationDate,
  observationLocalHour,
  requireLinkedINatUser,
  taxonomyText,
  verifyINatIdentification
};
