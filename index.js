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

// -----------------------------------------
// FIXED "CURRENTLY WEARING" ENDPOINT (2025)
// -----------------------------------------
app.get("/wearing/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        const url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${COOKIE}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
                "Referer": "https://www.roblox.com/",
                "Origin": "https://www.roblox.com",
                "X-CSRF-TOKEN": "",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();
        const assets = data.assets || [];

        // Convert to the format your game expects
        const formatted = assets.map(asset => ({
            id: asset.id,
            name: asset.name || "Unknown",
            image: asset.thumbnailUrl || "",
            isLimited: false
        }));

        return res.json({
            success: true,
            wearing: formatted
        });

    } catch (err) {
        res.json({ success: false, error: err.toString() });
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
