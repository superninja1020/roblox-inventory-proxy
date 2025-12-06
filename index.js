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

// ---------------------------
// GET USER COLLECTIBLES (LIMITEDS) — used by your RAP leaderboard
// ---------------------------
app.get("/inventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

        const response = await fetch(url, {
            method: "GET",
            headers: { "Cookie": `.ROBLOSECURITY=${COOKIE}` }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();

        const items = (data.data || []).map(item => ({
            id: item.assetId,
            name: item.name,
            rap: item.recentAveragePrice || 0,
            image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`
        }));

        return res.json({ success: true, items });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
// CURRENTLY WEARING — this is what your Lua script actually uses
// ---------------------------
app.get("/wearing/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        const url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${COOKIE}`,
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();
        const wearing = data.assets || [];

        // Format for ROBLOX server script
        const formatted = wearing.map(asset => ({
            id: asset.id,
            name: asset.name,
            thumbnailUrl: asset.thumbnailUrl || null,
            isLimited: asset.isLimited || asset.isLimitedUnique || false
        }));

        return res.json({
            success: true,
            wearing: formatted
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
// ASSET DETAILS — used by Roblox script to get names/images for offsale items
// ---------------------------
app.get("/details/:assetId", async (req, res) => {
    try {
        const assetId = req.params.assetId;

        const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;

        const response = await fetch(url, {
            method: "GET",
            headers: { "Cookie": `.ROBLOSECURITY=${COOKIE}` }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const details = await response.json();

        return res.json({
            success: true,
            details
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
// Test route
// ---------------------------
app.get("/", (req, res) => {
    res.send("Roblox Inventory Proxy Running");
});

// Listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
