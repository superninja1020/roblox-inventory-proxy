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
   2️⃣ FULL AVATAR ENDPOINT (ACCESSORIES + CLOTHING + BODY)
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
   3️⃣ /WEARING USES FULL AVATAR DATA (FIXED)
   - The avatar endpoint returns `assets` (NOT `accessories`)
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

    // ✅ FIX: use `assets` (this is what this endpoint returns)
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
   4️⃣ ASSET DETAILS — tells your game the true item name + offsale
   ============================================================ */
app.get("/details/:assetId", async (req, res) => {
  try {
    const assetId = req.params.assetId;
    const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;

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

    const details = await response.json();
    res.json({ success: true, details });
  } catch (err) {
    res.json({ success: false, error: err.toString() });
  }
});

/* ============================================================
   6️⃣ VALUES FOR WORN ASSET IDS (GAME SENDS IDS)
   - Uses ONLY Roblox official collectibles inventory endpoint
   - No rolimons, no roproxy in game
   ============================================================ */

app.post("/values", async (req, res) => {
  try {
    const { userId, assetIds } = req.body || {};
    if (!userId || !Array.isArray(assetIds)) {
      return res.status(400).json({ success: false, error: "Missing userId or assetIds[]" });
    }

    // fetch owned collectibles (your same logic)
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
