const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Load cookie
const COOKIE = process.env.ROBLOSECURITY;

if (!COOKIE) {
    console.log("⚠️ No ROBLOSECURITY cookie found! Offsale details will not load.");
}

// ---------------------------
// GET USER COLLECTIBLES (LIMITEDS)
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
// CURRENTLY WEARING (ALL OUTFIT ITEMS)
// -----------------------------------------
app.get("/fullinventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        const url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;

        const response = await fetch(url, {
            method: "GET",
            headers: { "Cookie": `.ROBLOSECURITY=${COOKIE}` }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();

        // Convert Roblox avatar response into a clean, consistent format
        const items = (data.assets || []).map(asset => ({
            id: asset.id,
            name: asset.name || "Unknown",
            image: asset.thumbnailUrl || "",
            rap: 0 // Offsale items have no RAP
        }));

        return res.json({
            success: true,
            wearing: items
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
// ASSET DETAILS (for offsale detection)
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

// Test route
app.get("/", (req, res) => {
    res.send("Roblox Inventory Proxy Running");
});

// Listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
