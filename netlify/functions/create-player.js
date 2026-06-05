exports.handler = async function () {
  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Not found." })
  };
};
