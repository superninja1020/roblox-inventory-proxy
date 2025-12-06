import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const COOKIE = process.env.ROBLOSECURITY;

if (!COOKIE) {
  console.error("❌ Missing ROBLOSECURITY environment variable!");
}

//
// Reusable Roblox-request function
//
async function robloxRequest(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "Cookie": `.ROBLOSECURITY=${COOKIE}`,
        "User-Agent": "Mozilla/5.0"
      }
    });

    const data = await res.json().catch(() => null);

    return {
      status: res.status,
      data
    };
  } catch (err) {
    return { status: 500, data: null };
  }
}

//
// 🔥 Endpoint 1: Limited items
//
app.get("/inventory/:userId", async (req, res) => {
  const userId = req.params.userId;

  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc`;

  const response = await robloxRequest(url);

  if (!response.data || response.status !== 200) {
    return res.json({ success: false, error: response.status });
  }

  const items = [];

  for (const item of response.data.data ?? []) {
    items.push({
      id: item.assetId,
      name: item.name,
      rap: item.recentAveragePrice || 0,
      image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`
    });
  }

  res.json({
    success: true,
    items
  });
});


//
// 🔥 NEW ENDPOINT 2: GET ASSET DETAILS (OFFSALE DETECTION)
//
app.get("/asset/:assetId", async (req, res) => {
  const assetId = req.params.assetId;

  const url = `https://economy.roblox.com/v2/assets/${assetId}/details`;

  const response = await robloxRequest(url);

  if (!response.data) {
    return res.json({
      success: false,
      error: response.status
    });
  }

  res.json({
    success: true,
    details: response.data
  });
});


//
// Health check
//
app.get("/", (req, res) => res.send("Proxy OK"));
app.get("/status", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Proxy running on port " + PORT);
});

// FULL INVENTORY (returns ALL items, not just limiteds)
app.get("/fullinventory/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = 100;

        const url = `https://inventory.roblox.com/v1/users/${userId}/inventory?limit=${limit}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`
            }
        });

        // If inventory is private or another API error
        if (!response.ok) {
            return res.json({ success: false, error: response.status });
        }

        const body = await response.json();

        // Roblox returns { data: [...] }
        return res.json({
            success: true,
            items: body.data || []
        });

    } catch (err) {
        return res.json({ success: false, error: err.toString() });
    }
});

