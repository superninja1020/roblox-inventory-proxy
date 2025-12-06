const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const COOKIE = process.env.ROBLOSECURITY;

// Warn if cookie missing
if (!COOKIE) {
    console.log("⚠️ WARNING: Missing .ROBLOSECURITY in environment!");
}

// Helper fetch wrapper
async function robloxFetch(url) {
    return await fetch(url, {
        method: "GET",
        headers: {
            "Cookie": `.ROBLOSECURITY=${COOKIE}`,
            "User-Agent": "RobloxProxy/1.0"
        }
    });
}

// =========================================================
// 1. LIMITEDS (Collectibles)
// =========================================================
app.get("/inventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

        const response = await robloxFetch(url);

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

// =========================================================
// 2. FULL INVENTORY (ALL ITEMS INCLUDING OFFSALE)
// =========================================================
app.get("/fullinventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const url = `https://inventory.roblox.com/v1/users/${userId}/inventory?limit=100`;

        const response = await robloxFetch(url);

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const data = await response.json();

        return res.json({
            success: true,
            items: data.data || []
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// =========================================================
// 3. UNIVERSAL CATALOG DETAILS (Fixes Unknown Offsale Items)
// =========================================================
app.get("/catalog/:assetId", async (req, res) => {
    try {
        const assetId = req.params.assetId;
        const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;

        const response = await robloxFetch(url);

        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const json = await response.json();

        // Convert to the format your Roblox RAP script uses
        return res.json({
            success: true,
            data: {
                id: json.AssetId,
                name: json.Name,
                collectible: json.IsLimited,
                limited: json.IsLimited,
                limitedUnique: json.IsLimitedUnique,
                recentAveragePrice: json.RecentAveragePrice || 0,
                thumbnailImageUrl: json.ThumbnailUrl || ""
            }
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

// =========================================================
// TEST ROUTE
// =========================================================
app.get("/", (req, res) => {
    res.send("Roblox Inventory Proxy Running ✔");
});

// =========================================================
// START SERVER
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
