// index.js (REPLACEMENT)
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const COOKIE = process.env.ROBLOSECURITY;
console.log("Loaded ROBLOSECURITY:", COOKIE ? "YES" : "NO");
console.log("Cookie length:", COOKIE ? COOKIE.length : 0);

if (!COOKIE) {
  console.log("⚠️ No ROBLOSECURITY cookie found!");
}

// --------------------
// helpers
// --------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWith429Backoff(url, opts, tries = 4) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= tries; attempt++) {
    const resp = await fetch(url, opts);
    lastStatus = resp.status;

    if (resp.ok) return { ok: true, status: resp.status, json: await resp.json(), headers: resp.headers };

    if (resp.status === 429) {
      const ra = resp.headers.get("retry-after");
      const retryMs = ra ? Math.ceil(Number(ra) * 1000) : (1500 + attempt * 1500);
      console.log("[429] backoff", retryMs, "ms url=", url);
      await sleep(retryMs);
      continue;
    }

    // non-429 error
    return { ok: false, status: resp.status, json: null, headers: resp.headers };
  }

  return { ok: false, status: lastStatus || 429, json: null, headers: null };
}

// --------------------
// inventory cache (per user)
// --------------------
const userInvCache = new Map(); // userId -> { t, data }
const INV_TTL_MS = 10 * 60 * 1000; // 10 minutes

function thumb(assetId) {
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`;
}

// Serialize inventory fetches (prevents burst 429)
let invQueue = Promise.resolve();
let lastInvFetchAt = 0;
const MIN_INV_GAP_MS = 450;

async function fetchAllCollectibles(userId) {
  // serve cache
  const cached = userInvCache.get(String(userId));
  if (cached && (Date.now() - cached.t) < INV_TTL_MS) {
    return { success: true, ...cached.data, cached: true };
  }

  // serialize to avoid spikes
  invQueue = invQueue.then(async () => {
    const now = Date.now();
    const wait = MIN_INV_GAP_MS - (now - lastInvFetchAt);
    if (wait > 0) await sleep(wait);

    lastInvFetchAt = Date.now();

    let cursor = "";
    const limitedItems = [];
    let totalRAP = 0;

    // paginate until cursor is null
    for (let page = 1; page <= 50; page++) { // hard cap safety
      const url =
        `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles` +
        `?sortOrder=Asc&limit=100` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

      const r = await fetchWith429Backoff(url, {
        method: "GET",
        headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` },
      });

      if (!r.ok) {
        // if we have old cache, serve stale
        if (cached?.data) {
          console.log("[INV] serve STALE cache due to error", r.status, "userId=", userId);
          return { success: true, ...cached.data, cached: true, stale: true };
        }
        return { success: false, error: r.status };
      }

      const data = r.json || {};
      const pageItems = data.data || [];

      for (const it of pageItems) {
        const rap = Number(it.recentAveragePrice || 0);
        totalRAP += rap;

        limitedItems.push({
          id: it.assetId,
          name: it.name,
          rap,
          image: thumb(it.assetId),
        });
      }

      cursor = data.nextPageCursor;
      if (!cursor) break;
    }

    // store cache
    const payload = { limitedItems, totalRAP };
    userInvCache.set(String(userId), { t: Date.now(), data: payload });

    return { success: true, ...payload, cached: false };
  });

  return invQueue;
}

/* ============================================================
   1) INVENTORY (OWNED LIMITEDS) - FIXED SHAPE + PAGINATION
   ============================================================ */
app.get("/inventory/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await fetchAllCollectibles(userId);
    return res.json(data);
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   2) AVATAR
   ============================================================ */
app.get("/avatar/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://avatar.roblox.com/v1/users/${userId}/avatar`;

    const r = await fetchWith429Backoff(url, {
      method: "GET",
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Origin: "https://www.roblox.com",
        Referer: "https://www.roblox.com",
      },
    });

    if (!r.ok) return res.json({ success: false, error: r.status });
    return res.json({ success: true, avatar: r.json });
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   3) WEARING
   ============================================================ */
app.get("/wearing/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://avatar.roblox.com/v1/users/${userId}/avatar`;

    const r = await fetchWith429Backoff(url, {
      method: "GET",
      headers: {
        Cookie: `.ROBLOSECURITY=${COOKIE}`,
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Origin: "https://www.roblox.com",
        Referer: "https://www.roblox.com",
      },
    });

    if (!r.ok) return res.json({ success: false, error: r.status });

    const assets = r.json.assets || [];
    const wearing = assets.map((a) => ({
      id: a.id,
      name: a.name || "Unknown",
      assetType: a.assetType?.name,
      image: thumb(a.id),
    }));

    return res.json({ success: true, wearing });
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   4) DETAILS (keep yours; it’s fine)
   ============================================================ */
const detailsCache = new Map(); // assetId -> { t, data }
const DETAILS_TTL_MS = 24 * 60 * 60 * 1000;

let detailsQueue = Promise.resolve();
let lastDetailsFetchAt = 0;
const MIN_DETAILS_GAP_MS = 800;

async function fetchEconomyDetailsThrottled(assetId) {
  detailsQueue = detailsQueue.then(async () => {
    const now = Date.now();
    const wait = MIN_DETAILS_GAP_MS - (now - lastDetailsFetchAt);
    if (wait > 0) await sleep(wait);

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

      if (resp.ok) return { ok: true, status: resp.status, json: await resp.json() };

      if (resp.status === 429) {
        const ra = resp.headers.get("retry-after");
        const retryMs = ra ? Math.ceil(Number(ra) * 1000) : 2500 + attempt * 1500;
        console.log("[DETAILS] upstream 429 assetId=", assetId, "attempt=", attempt, "sleep=", retryMs);
        await sleep(retryMs);
        continue;
      }

      return { ok: false, status: resp.status, json: null };
    }

    return { ok: false, status: 429, json: null };
  });

  return detailsQueue;
}

app.get("/details/:assetId", async (req, res) => {
  try {
    const assetId = String(req.params.assetId);
    console.log("[DETAILS] request assetId=", assetId);

    const cached = detailsCache.get(assetId);
    if (cached && (Date.now() - cached.t) < DETAILS_TTL_MS) {
      console.log("[DETAILS] cache HIT assetId=", assetId);
      return res.json({ success: true, details: cached.data, cached: true });
    }

    const result = await fetchEconomyDetailsThrottled(assetId);

    if (!result.ok && result.status === 429 && cached?.data) {
      console.log("[DETAILS] serving STALE cache due to 429 assetId=", assetId);
      return res.json({ success: true, details: cached.data, cached: true, stale: true });
    }

    if (!result.ok) return res.json({ success: false, error: result.status });

    detailsCache.set(assetId, { t: Date.now(), data: result.json });
    return res.json({ success: true, details: result.json });
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   6) VALUES (NOW uses full cached inventory)
   ============================================================ */
app.post("/values", async (req, res) => {
  try {
    const { userId, assetIds } = req.body || {};
    if (!userId || !Array.isArray(assetIds)) {
      return res.status(400).json({ success: false, error: "Missing userId or assetIds[]" });
    }

    const inv = await fetchAllCollectibles(userId);
    if (!inv.success) return res.json(inv);

    const rapMap = new Map();
    for (const it of inv.limitedItems || []) rapMap.set(Number(it.id), Number(it.rap || 0));

    const perItem = {};
    let total = 0;

    for (const id of assetIds) {
      const n = Number(id);
      const rap = rapMap.get(n) || 0;
      perItem[n] = rap;
      total += rap;
    }

    return res.json({ success: true, total, perItem });
  } catch (err) {
    return res.json({ success: false, error: err.toString() });
  }
});

app.get("/", (req, res) => res.send("Roblox Inventory Proxy Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
