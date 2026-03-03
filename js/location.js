    function setUserLocation(lat, lng, accuracyMeters) {
      const latlng = [lat, lng];

      if (!userMarker) {
        userMarker = L.marker(latlng).addTo(map).bindPopup("You are here");
      } else {
        userMarker.setLatLng(latlng);
      }

      if (!accuracyCircle) {
        accuracyCircle = L.circle(latlng, {
          radius: Math.max(accuracyMeters || 0, 5)
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(latlng);
        accuracyCircle.setRadius(Math.max(accuracyMeters || 0, 5));
      }

      hud.textContent =
        `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracyMeters)} m)`;
    }

    // Geolocation
    let lastFix = null;

    function requestLocationOnce() {
      if (!("geolocation" in navigator)) {
        hud.textContent = "Geolocation not supported in this browser.";
        return;
      }

      hud.textContent = "Requesting location permission…";

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          lastFix = { latitude, longitude, accuracy };
          setUserLocation(latitude, longitude, accuracy);
          map.setView([latitude, longitude], 18);

		// 🔥 Run after map finishes moving
		map.once("moveend", () => {
		  fetchINatObservationsNearCenter();
		
			/// BEGN NEW		
			if (typeof window.scheduleOSMVectorOverlayUpdate === "function") {
			window.scheduleOSMVectorOverlayUpdate();
			}
			// END NEW		  
			  
		});

		map.on("moveend", fetchINatObservationsNearCenter);

        },
        (err) => {
          // Common causes: permission denied, not https, no GPS, timeout
          hud.textContent = `Location error: ${err.message}`;
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      );
    }

    // Live tracking (optional but usually what you want on a phone)
    function startWatchingLocation() {
      if (!("geolocation" in navigator)) return null;

      return navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          lastFix = { latitude, longitude, accuracy };
          setUserLocation(latitude, longitude, accuracy);
        },
        (err) => {
          hud.textContent = `Location error: ${err.message}`;
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000
        }
      );
    }