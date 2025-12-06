const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const COOKIE = process.env.ROBLOSECURITY;

// Simple validation to avoid running without cookie
if (!COOKIE) {
    console.log("⚠️ WARNING: No .ROBLOSECURITY cookie found in environment variables!");
}

// ---------------------------
// LIMITEDS (Collectibles)
// ---------------------------
app.get("/inventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = 100;

        const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=${limit}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${COOKIE}`
            }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();

        // Convert Roblox collectibles format → simple list for your game
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
// FULL INVENTORY (ALL ITEMS)
// ---------------------------
app.get("/fullinventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        const url = `https://inventory.roblox.com/v1/users/${userId}/inventory?limit=100`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${COOKIE}`
            }
        });

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const json = await response.json();

        return res.json({
            success: true,
            items: json.data || []
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
// ASSET DETAILS (Economy API)
// ---------------------------
app.get("/details/:assetId", async (req, res) => {
    try {
        const assetId = req.params.assetId;

        const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${COOKIE}`
            }
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

// ===================================================================
// NEW ENDPOINT (REQUIRED) — CATALOG DETAILS
// Roblox cannot POST to catalog.roblox.com directly, so we do it here.
// ===================================================================
app.get("/catalog/:assetId", async (req, res) => {
    try {
        const assetId = Number(req.params.assetId);

        const response = await fetch(
            "https://catalog.roblox.com/v1/catalog/items/details",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `.ROBLOSECURITY=${COOKIE}`
                },
                body: JSON.stringify({
                    items: [
                        {
                            itemType: "Asset",
                            id: assetId
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        return res.json({
            success: true,
            data: data.data?.[0] || null
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// ---------------------------
app.get("/", (req, res) => {
    res.send("Roblox Inventory Proxy Running");
});

// Render requires PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
