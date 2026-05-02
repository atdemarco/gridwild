exports.handler = async (event) => {
  const cookie = event.headers.cookie || "";
  const match = cookie.match(/inat_oauth=([^;]+)/);

  if (!match) {
    return { statusCode: 401, body: "Not connected to iNaturalist" };
  }

  const oauthToken = match[1];

  const resp = await fetch("https://www.inaturalist.org/users/api_token", {
    headers: {
      Authorization: `Bearer ${oauthToken}`
    }
  });

  const data = await resp.json();

  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
};