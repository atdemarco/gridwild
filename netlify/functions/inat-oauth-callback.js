exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;

  if (!code) {
    return { statusCode: 400, body: "Missing OAuth code" };
  }

  const tokenResp = await fetch("https://www.inaturalist.org/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.INAT_CLIENT_ID,
      client_secret: process.env.INAT_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.INAT_REDIRECT_URI
    })
  });

  const tokenData = await tokenResp.json();

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": `inat_oauth=${tokenData.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      Location: "/?inat=connected"
    }
  };
};
