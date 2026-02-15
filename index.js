// index.js
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Load cookie
const COOKIE = process.env.ROBLOSECURITY;

console.log("Loaded ROBLOSECURITY:", COOKIE ? "YES" : "NO");
console.log("Cookie length:", COOKIE ? COOKIE.length : 0);

if (!COOKIE) {
  console.log("⚠️ No ROBLOSECURITY cookie found! Limited/off-sale details may not load.");
}

/* ============================================================
   DETAILS THROTTLE + CACHE (backend)
   - prevents 429 spam from economy.roblox.com
   ============================================================ */
const detailsCache = new Map(); // assetId -> { t, data }
const DETAILS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let detailsQueue = Promise.resolve(); // serialize /details calls
let lastDetailsFetchAt = 0;

// ✅ stronger spacing to avoid 429
const MIN_DETAILS_GAP_MS = 800;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEconomyDetailsThrottled(assetId) {
  // serialize all /details calls through one chain
  detailsQueue = detailsQueue.then(async () => {
    const now = Date.now();
    const wait = MIN_DETAILS_GAP_MS - (now - lastDetailsFetchAt);
    if (wait > 0) await sleep(wait);

    // try up to 3 times on 429
    for (let attempt = 1; attempt <= 3; attempt++) {
      lastDetailsFetchAt = Date.now();

      const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Cookie: `.ROBLOSECURITY=${COOKIE}`,
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          Origin: "https://www.roblox.com",
          Referer: "https://www.roblox.com",
        },
      });

      // success
      if (resp.ok) {
        const json = await resp.json();
        return { ok: true, status: resp.status, json };
      }

      // rate limit
      if (resp.status === 429) {
        console.log("[DETAILS] upstream 429 assetId=", assetId, "attempt=", attempt);

        const ra = resp.headers.get("retry-after");
        // ✅ stronger backoff
        const retryMs = ra
          ? Math.ceil(Number(ra) * 1000)
          : 2500 + attempt * 1500;

        await sleep(retryMs);
        continue;
      }

      // other errors
      return { ok: false, status: resp.status, json: null };
    }

    return { ok: false, status: 429, json: null };
  });

  return detailsQueue;
}

/* ============================================================
   1️⃣ GET USER COLLECTIBLES (LIMITEDS)
   ============================================================ */
app.get("/inventory/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
    });

    if (!response.ok) return res.json({ success: false, error: response.status });

    const data = await response.json();

    const items = (data.data || []).map((item) => ({
      id: item.assetId,
      name: item.name,
      rap: item.recentAveragePrice || 0,
      image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`,
    }));

    res.json({ success: true, items });
  } catch (err) {
    res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   2️⃣ FULL AVATAR ENDPOINT
   ============================================================ */
app.get("/avatar/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://avatar.roblox.com/v1/users/${userId}/avatar`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/json",
        Origin: "https://www.roblox.com",
        Referer: "https://www.roblox.com",
      },
    });

    if (!response.ok) return res.json({ success: false, error: response.status });

    const data = await response.json();
    res.json({ success: true, avatar: data });
  } catch (err) {
    res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   3️⃣ /WEARING (uses avatar endpoint)
   ============================================================ */
app.get("/wearing/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://avatar.roblox.com/v1/users/${userId}/avatar`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Origin: "https://www.roblox.com",
        Referer: "https://www.roblox.com",
      },
    });

    if (!response.ok) return res.json({ success: false, error: response.status });

    const data = await response.json();
    const assets = data.assets || [];

    const wearing = assets.map((a) => ({
      id: a.id,
      name: a.name || "Unknown",
      assetType: a.assetType?.name,
      image: `https://www.roblox.com/asset-thumbnail/image?assetId=${a.id}&width=150&height=150&format=png`,
    }));

    res.json({ success: true, wearing });
  } catch (err) {
    res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   4️⃣ /DETAILS (THROTTLED + CACHED + LOGGED)
   ============================================================ */
app.get("/details/:assetId", async (req, res) => {
  try {
    const assetId = String(req.params.assetId);

    // ✅ proof logs (so you know which build is live)
    console.log("[DETAILS] request assetId=", assetId);

    // cache hit
    const cached = detailsCache.get(assetId);
    if (cached && (Date.now() - cached.t) < DETAILS_TTL_MS) {
      console.log("[DETAILS] cache HIT assetId=", assetId);
      return res.json({ success: true, details: cached.data, cached: true });
    }

    console.log("[DETAILS] cache MISS assetId=", assetId);

    const result = await fetchEconomyDetailsThrottled(assetId);

    // if rate limited BUT we have stale cache, return it
    if (!result.ok && result.status === 429 && cached?.data) {
      console.log("[DETAILS] serving STALE cache due to 429 assetId=", assetId);
      return res.json({ success: true, details: cached.data, cached: true, stale: true });
    }

    if (!result.ok) {
      console.log("[DETAILS] FAILED assetId=", assetId, "status=", result.status);
      return res.json({ success: false, error: result.status });
    }

    detailsCache.set(assetId, { t: Date.now(), data: result.json });
    return res.json({ success: true, details: result.json });
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   6️⃣ /VALUES (unchanged)
   ============================================================ */
app.post("/values", async (req, res) => {
  try {
    const { userId, assetIds } = req.body || {};
    if (!userId || !Array.isArray(assetIds)) {
      return res.status(400).json({ success: false, error: "Missing userId or assetIds[]" });
    }

    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
    });

    if (!response.ok) return res.json({ success: false, error: response.status });

    const data = await response.json();
    const items = data.data || [];

    const rapMap = new Map();
    for (const it of items) {
      rapMap.set(it.assetId, it.recentAveragePrice || 0);
    }

    let total = 0;
    const perItem = {};

    for (const id of assetIds) {
      const n = Number(id);
      const rap = rapMap.get(n) || 0;
      perItem[n] = rap;
      total += rap;
    }

    res.json({ success: true, total, perItem });
  } catch (err) {
    res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   TEST ROUTE
   ============================================================ */
app.get("/", (req, res) => {
  res.send("Roblox Inventory Proxy Running");
});

/* ============================================================
   SERVER START
   ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
