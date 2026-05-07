// -----------------------------------------------------------------------------
// GridWild Player UI bridge
// Reads canonical player state from window.__gwState.player
// -----------------------------------------------------------------------------

(function () {
  function getWildpoints() {
    return Number(window.__gwState?.player?.wildpoints || 0);
  }

  function refreshPlayerUI() {
    const wildpoints = getWildpoints();

    const topPill = document.getElementById("gwWildPointsValue");
    if (topPill) {
      topPill.textContent = wildpoints.toLocaleString();
    }

    const profileWallet = document.getElementById("gwProfileWildpointsValue");
    if (profileWallet) {
      profileWallet.textContent = `🍃 ${wildpoints.toLocaleString()}`;
    }
  }

  window.GridWildPlayerUI = {
    getWildpoints,
    refreshPlayerUI
  };
})();