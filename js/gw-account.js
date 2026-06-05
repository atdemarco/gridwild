// -----------------------------------------------------------------------------
// GridWild account UI + client session helpers
// -----------------------------------------------------------------------------

(function () {
  const ACCOUNT_KEY = "gwAccount";
  const SESSION_KEY = "gwAccountSession";
  const PLAYER_KEY = "gwPlayerId";
  const PLAYER_SESSION_KEY = "gwPlayerSession";

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getAccount() {
    return readJson(ACCOUNT_KEY);
  }

  function getSession() {
    return readJson(SESSION_KEY);
  }

  function isSignedIn() {
    return !!(getAccount()?.username && getSession()?.token);
  }

  function showToast(message) {
    document.querySelectorAll(".gw-account-toast").forEach(el => el.remove());

    const toast = document.createElement("div");
    toast.className = "gw-account-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3200);
  }

  function setSignedIn(payload) {
    const account = payload?.account || {};
    const session = payload?.session || {};
    const player = payload?.player || null;

    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({
      username: account.username || "",
      playerId: player?.id || account.player_id || ""
    }));

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      token: session.token || "",
      expiresAt: session.expires_at || ""
    }));

    if (player?.id) {
      localStorage.setItem(PLAYER_KEY, player.id);
      localStorage.removeItem(PLAYER_SESSION_KEY);
      window.GridWildAPI?.setPlayerId?.(player.id);
      window.GridWildAPI?.clearPlayerSession?.();
      window.__gwState = window.__gwState || {};
      window.__gwState.player = player;
    }

    window.dispatchEvent(new CustomEvent("gwAccountChanged", {
      detail: { account: getAccount(), player }
    }));
  }

  function signOut() {
    try {
      window.GridWildPresence?.markOffline?.({ keepalive: true });
    } catch {
      // Presence is best-effort during sign-out.
    }

    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PLAYER_KEY);
    localStorage.removeItem(PLAYER_SESSION_KEY);
    window.dispatchEvent(new CustomEvent("gwAccountChanged", {
      detail: { account: null, player: window.__gwState?.player || null }
    }));
  }

  async function post(path, body, timeoutMs = 18000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    }).catch(err => {
      if (err?.name === "AbortError") {
        throw new Error("Account request timed out. Check that the Netlify function is deployed/running, then try again.");
      }
      throw err;
    }).finally(() => {
      window.clearTimeout(timer);
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }

    if (!res.ok) {
      throw new Error(data?.error || text || `Request failed: HTTP ${res.status}`);
    }

    return data;
  }

  async function signUp({ username, password, displayName }) {
    const data = await post("/.netlify/functions/gridwild-account-signup", {
      username,
      password,
      display_name: displayName,
      existing_player_id: window.GridWildAPI?.getPlayerId?.() || localStorage.getItem(PLAYER_KEY) || null,
      existing_player_session_token: window.GridWildAPI?.getPlayerSessionToken?.() || null
    });

    setSignedIn(data);
    return data;
  }

  async function logIn({ username, password }) {
    const data = await post("/.netlify/functions/gridwild-account-login", {
      username,
      password
    });

    setSignedIn(data);
    return data;
  }

  function injectStyles() {
    if (document.getElementById("gwAccountStyles")) return;

    const style = document.createElement("style");
    style.id = "gwAccountStyles";
    style.textContent = `
      .gw-account-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100001;
        background: rgba(8,12,10,0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        box-sizing: border-box;
      }

      .gw-account-modal {
        width: min(500px, 96vw);
        max-height: 92vh;
        overflow: auto;
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(47,40,33,0.99), rgba(20,17,15,0.99));
        color: #efe6d3;
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        padding: 16px;
        box-sizing: border-box;
      }

      .gw-account-title {
        font-size: 22px;
        font-weight: 950;
        color: #ffe7a3;
        margin-bottom: 4px;
      }

      .gw-account-sub {
        color: rgba(239,230,211,0.72);
        font-size: 13px;
        line-height: 1.35;
        margin-bottom: 14px;
      }

      .gw-account-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }

      .gw-account-tab,
      .gw-account-btn {
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 12px;
        background: rgba(255,255,255,0.08);
        color: #fff7df;
        font-weight: 850;
        min-height: 42px;
        cursor: pointer;
      }

      .gw-account-tab.is-active,
      .gw-account-btn.primary {
        background: #ffe082;
        color: #21301f;
        border-color: rgba(255,224,130,0.95);
      }

      .gw-account-field {
        display: grid;
        gap: 5px;
        margin-bottom: 10px;
      }

      .gw-account-field label {
        font-size: 12px;
        font-weight: 850;
        color: rgba(239,230,211,0.82);
      }

      .gw-account-field input {
        width: 100%;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.07);
        color: #fff7df;
        padding: 11px 12px;
        font: inherit;
      }

      .gw-account-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 12px;
      }

      .gw-account-status {
        min-height: 18px;
        color: rgba(239,230,211,0.74);
        font-size: 12px;
        line-height: 1.35;
      }

      .gw-account-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .gw-account-toast {
        position: fixed;
        left: 50%;
        bottom: calc(86px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        z-index: 100002;
        width: min(420px, calc(100vw - 28px));
        box-sizing: border-box;
        border-radius: 14px;
        border: 1px solid rgba(255,224,130,0.64);
        background: rgba(30, 43, 27, 0.98);
        color: #fff7df;
        box-shadow: 0 16px 48px rgba(0,0,0,0.42);
        padding: 12px 14px;
        font-size: 13px;
        font-weight: 850;
        text-align: center;
      }
    `;

    document.head.appendChild(style);
  }

  function openModal(mode = "signup") {
    injectStyles();
    document.querySelectorAll(".gw-account-backdrop").forEach(el => el.remove());

    const signedIn = getAccount();
    const root = document.createElement("div");
    root.className = "gw-account-backdrop";

    if (signedIn?.username) {
      root.innerHTML = `
        <div class="gw-account-modal">
          <div class="gw-account-title">GridWild Account</div>
          <div class="gw-account-sub">
            Signed in as <b>@${esc(signedIn.username)}</b>. Your GridWild explorer progress is attached to this account.
          </div>
          <div class="gw-account-actions">
            <button class="gw-account-btn" id="gwAccountCloseBtn">Close</button>
            <button class="gw-account-btn primary" id="gwAccountSignOutBtn">Sign Out</button>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      root.querySelector("#gwAccountCloseBtn").onclick = () => root.remove();
      root.querySelector("#gwAccountSignOutBtn").onclick = () => {
        signOut();
        root.remove();
        window.initGridWildMobilePanels?.();
        showToast("Signed out of GridWild.");
        window.setTimeout(() => window.location.reload(), 900);
      };
      root.addEventListener("click", e => {
        if (e.target === root) root.remove();
      });
      return;
    }

    root.innerHTML = `
      <div class="gw-account-modal">
        <div class="gw-account-title">GridWild Account</div>
        <div class="gw-account-sub">
          Save quests, Wildpoints, inventory, parties, and your explorer identity across devices.
        </div>

        <div class="gw-account-tabs">
          <button class="gw-account-tab" id="gwAccountSignupTab" type="button">Create Account</button>
          <button class="gw-account-tab" id="gwAccountLoginTab" type="button">Log In</button>
        </div>

        <div id="gwAccountDisplayNameWrap" class="gw-account-field">
          <label for="gwAccountDisplayName">Explorer name</label>
          <input id="gwAccountDisplayName" autocomplete="nickname" value="${esc(window.__gwState?.player?.display_name || "")}">
        </div>

        <div class="gw-account-field">
          <label for="gwAccountUsername">Username</label>
          <input id="gwAccountUsername" autocapitalize="none" autocomplete="username" spellcheck="false">
        </div>

        <div class="gw-account-field">
          <label for="gwAccountPassword">Password</label>
          <input id="gwAccountPassword" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}">
        </div>

        <div class="gw-account-status" id="gwAccountStatus"></div>

        <div class="gw-account-actions">
          <button class="gw-account-btn" id="gwAccountCancelBtn">Continue as Guest</button>
          <button class="gw-account-btn primary" id="gwAccountSubmitBtn">Create Account</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const signupTab = root.querySelector("#gwAccountSignupTab");
    const loginTab = root.querySelector("#gwAccountLoginTab");
    const displayNameWrap = root.querySelector("#gwAccountDisplayNameWrap");
    const displayName = root.querySelector("#gwAccountDisplayName");
    const username = root.querySelector("#gwAccountUsername");
    const password = root.querySelector("#gwAccountPassword");
    const status = root.querySelector("#gwAccountStatus");
    const submit = root.querySelector("#gwAccountSubmitBtn");

    let currentMode = mode === "login" ? "login" : "signup";

    function renderMode() {
      signupTab.classList.toggle("is-active", currentMode === "signup");
      loginTab.classList.toggle("is-active", currentMode === "login");
      displayNameWrap.style.display = currentMode === "signup" ? "grid" : "none";
      submit.textContent = currentMode === "signup" ? "Create Account" : "Log In";
      password.autocomplete = currentMode === "login" ? "current-password" : "new-password";
      status.textContent = "";
    }

    signupTab.onclick = () => {
      currentMode = "signup";
      renderMode();
    };

    loginTab.onclick = () => {
      currentMode = "login";
      renderMode();
    };

    root.querySelector("#gwAccountCancelBtn").onclick = () => root.remove();

    submit.onclick = async () => {
      const payload = {
        username: username.value.trim(),
        password: password.value,
        displayName: displayName.value.trim()
      };

      if (!payload.username || !payload.password) {
        status.textContent = "Enter a username and password first.";
        return;
      }

      submit.disabled = true;
      signupTab.disabled = true;
      loginTab.disabled = true;
      status.textContent = currentMode === "signup" ? "Creating account..." : "Logging in...";

      try {
        if (currentMode === "signup") {
          await signUp(payload);
          status.textContent = "Account created.";
          showToast(`Created GridWild account @${payload.username}.`);
        } else {
          await logIn(payload);
          status.textContent = "Logged in.";
          showToast(`Logged in as @${payload.username}.`);
        }

        root.remove();
        window.initGridWildMobilePanels?.();
        window.GridWildPlayerUI?.refreshPlayerUI?.();
        window.GridWildCharacter?.renderSummary?.();
        window.dispatchEvent(new CustomEvent("gwBootstrapRefreshRequested"));
        window.setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        status.textContent = err.message;
      } finally {
        submit.disabled = false;
        signupTab.disabled = false;
        loginTab.disabled = false;
      }
    };

    root.addEventListener("click", e => {
      if (e.target === root) root.remove();
    });

    renderMode();
    username.focus();
  }

  function renderAccountCardHtml() {
    const account = getAccount();

    if (account?.username) {
      return `
        <div class="gw-card">
          <div class="gw-account-strip">
            <div>
              <div class="gw-card-title">GridWild Account</div>
              <div class="gw-muted" style="font-size:12px;margin-top:3px;">@${esc(account.username)}</div>
            </div>
            <button class="gw-mini-btn" id="gwOpenGridWildAccountBtn">Account</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="gw-card">
        <div class="gw-card-title">GridWild Account</div>
        <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
          You are exploring as a guest. Create an account to keep this explorer across devices.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="gw-mini-btn" id="gwCreateGridWildAccountBtn">Create Account</button>
          <button class="gw-mini-btn" id="gwLoginGridWildAccountBtn">Log In</button>
        </div>
      </div>
    `;
  }

  function bindButtons(root = document) {
    root.querySelector("#gwOpenGridWildAccountBtn")?.addEventListener("click", () => openModal("signup"));
    root.querySelector("#gwCreateGridWildAccountBtn")?.addEventListener("click", () => openModal("signup"));
    root.querySelector("#gwLoginGridWildAccountBtn")?.addEventListener("click", () => openModal("login"));
  }

  window.GridWildAccount = {
    getAccount,
    getSession,
    isSignedIn,
    openModal,
    signUp,
    logIn,
    signOut,
    renderAccountCardHtml,
    bindButtons
  };
})();
