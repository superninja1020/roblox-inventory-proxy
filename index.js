import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const COOKIE = process.env.ROBLOSECURITY;

if (!COOKIE) {
  console.log("❌ ERROR: ROBLOSECURITY cookie not set in environment variables!");
}

app.get("/", (req, res) => {
  res.send("Roblox Limiteds Proxy is running");
});

app.get("/inventory/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const response = await fetch(
      `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc`,
      {
        headers: {
          Cookie: `.ROBLOSECURITY=${COOKIE};`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (!response.ok) {
      return res.json({
        success: false,
        error: response.status,
        message: "Roblox request blocked or unauthorized",
      });
    }

    const json = await response.json();

    const items = (json.data || []).map((item) => ({
      id: item.assetId,
      name: item.name,
      rap: item.recentAveragePrice || 0,
      image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`,
    }));

    return res.json({ success: true, items });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Proxy running on port " + PORT));
