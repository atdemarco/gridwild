// js/gw-inat-auth.js
(function () {
  const TOKEN_KEY = "gw_inat_jwt_token";
  const USER_KEY = "gw_inat_username";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function isConnected() {
    return !!getToken();
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, String(token || "").trim());
    window.dispatchEvent(new CustomEvent("gwINatAuthChanged"));
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent("gwINatAuthChanged"));
  }

  async function testToken() {
    const token = getToken();
    if (!token) throw new Error("No iNaturalist token saved.");

    const resp = await fetch("https://api.inaturalist.org/v1/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resp.ok) throw new Error(`Token test failed: HTTP ${resp.status}`);
    return resp.json();
  }

  window.GridWildINatAuth = {
    getToken,
    setToken,
    disconnect,
    isConnected,
    testToken,
    getUsername: () => localStorage.getItem(USER_KEY) || window.__gwUser?.username || "",
    setUsername: username => {
      const clean = String(username || "").trim().replace(/^@+/, "");
      localStorage.setItem(USER_KEY, clean);
      window.__gwUser = window.__gwUser || {};
      window.__gwUser.username = clean;
      window.dispatchEvent(new CustomEvent("gwINatAuthChanged"));
    }
  };
})();