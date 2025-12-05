import "dotenv/config";
import express from "express";
import cors from "cors";

import { chat } from "./src/controllers/chat.controller";
import { getLatestHistory } from "./src/controllers/historyStore";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/chat", chat);

app.get("/api/history", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    const history = await getLatestHistory(userId);
    const withIds =
      history?.map((m, idx) => ({
        id: `${m.timestamp || idx}-${idx}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })) || [];
    return res.json({ history: withIds });
  } catch (err) {
    console.error("[History] Failed to read history", err);
    return res.status(500).json({ error: "Failed to read history" });
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
