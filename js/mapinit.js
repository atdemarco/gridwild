    // Map init
    const map = L.map("map", {
      zoomControl: true,
      attributionControl: true
    });

    // OSM tiles (fine for prototyping; for heavy use, use a proper tile provider)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 21,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Default view (in case location fails)
    map.setView([38.9072, -77.0369], 13); // DC fallback

    const hud = document.getElementById("status");

    // User location marker + accuracy circle
    let userMarker = null;
    let accuracyCircle = null;