// IndexedDB-backed cache for compact iNaturalist observation records.
(function () {
  const DB_NAME = "gridwild-observations";
  const DB_VERSION = 3;
  const OBS_STORE = "observations";

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available."));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OBS_STORE)) {
          const store = db.createObjectStore(OBS_STORE, { keyPath: "id" });
          store.createIndex("username", "username", { unique: false });
          store.createIndex("observed_on", "observed_on", { unique: false });
        } else {
          const store = req.transaction.objectStore(OBS_STORE);
          if (!store.indexNames.contains("username")) {
            store.createIndex("username", "username", { unique: false });
          }
          if (!store.indexNames.contains("observed_on")) {
            store.createIndex("observed_on", "observed_on", { unique: false });
          }
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open observation cache."));
      req.onblocked = () => reject(new Error("Observation cache upgrade is blocked by another tab."));
    });

    return dbPromise;
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Observation cache transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Observation cache transaction aborted."));
    });
  }

  async function putMany(observations, options = {}) {
    if (!Array.isArray(observations) || !observations.length) return 0;

    const db = await openDb();
    const tx = db.transaction(OBS_STORE, "readwrite");
    const store = tx.objectStore(OBS_STORE);

    let count = 0;
    for (const obs of observations) {
      if (!obs?.id) continue;
      store.put({
        ...obs,
        id: String(obs.id)
      });
      count++;
    }

    await txDone(tx);
    return count;
  }

  async function replaceForUser(username, observations) {
    const db = await openDb();
    const clearTx = db.transaction(OBS_STORE, "readwrite");
    const store = clearTx.objectStore(OBS_STORE);
    store.clear();
    await txDone(clearTx);
    return putMany(observations || []);
  }

  function getAllFromSource(source, query = null) {
    return new Promise((resolve, reject) => {
      const req = query ? source.getAll(query) : source.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("Could not read cached observations."));
    });
  }

  async function getAll(username = "") {
    const db = await openDb();
    const tx = db.transaction(OBS_STORE, "readonly");
    const store = tx.objectStore(OBS_STORE);
    const key = String(username || "");
    let rows = [];

    if (key) {
      if (store.indexNames.contains("username")) {
        rows = rows.concat(await getAllFromSource(store.index("username"), IDBKeyRange.only(key)));
      }
      if (!rows.length) {
        rows = await getAllFromSource(store);
      }
    } else {
      rows = await getAllFromSource(store);
    }

    await txDone(tx);
    const seen = new Set();
    return rows.filter(row => {
      const id = String(row?.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  async function clear(username = "") {
    const db = await openDb();
    const tx = db.transaction(OBS_STORE, "readwrite");
    const store = tx.objectStore(OBS_STORE);

    if (!username) {
      store.clear();
      await txDone(tx);
      return;
    }

    async function clearByIndex(indexName) {
      if (!store.indexNames.contains(indexName)) return;

      await new Promise((resolve, reject) => {
        const req = store.index(indexName).openCursor(IDBKeyRange.only(String(username)));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          cursor.delete();
          cursor.continue();
        };
        req.onerror = () => reject(req.error || new Error("Could not clear cached observations."));
      });
    }

    await clearByIndex("username");

    await txDone(tx);
  }

  window.GridWildObservationStore = {
    putMany,
    replaceForUser,
    getAll,
    clear
  };
})();
