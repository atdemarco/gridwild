exports.handler = async () => {
  const params = new URLSearchParams({
    client_id: process.env.INAT_CLIENT_ID,
    redirect_uri: process.env.INAT_REDIRECT_URI,
    response_type: "code",
    scope: "write"
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://www.inaturalist.org/oauth/authorize?${params.toString()}`
    }
  };
};
