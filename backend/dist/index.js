var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

// src/controllers/chat.controller.ts
import { OpenAIStream, streamToResponse } from "ai";
import OpenAI from "openai";

// src/controllers/engine/index.ts
import fs from "fs/promises";
import path from "path";
import { pipeline } from "@xenova/transformers";

// src/controllers/engine/constants.mjs
var STORAGE_CACHE_DIR = "./cache";

// src/controllers/engine/index.ts
var chunksPromise = null;
var extractorPromise = null;
function loadChunks() {
  return __async(this, null, function* () {
    if (!chunksPromise) {
      chunksPromise = (() => __async(this, null, function* () {
        try {
          const filePath = path.join(
            process.cwd(),
            STORAGE_CACHE_DIR,
            "embeddings.json"
          );
          const raw = yield fs.readFile(filePath, "utf-8");
          const data = JSON.parse(raw);
          console.log(
            `[RAG] Loaded ${data.length} embedded chunks from ${filePath}`
          );
          return data;
        } catch (err) {
          console.error(
            "[RAG] Failed to load embeddings.json. Did you run `npm run generate`?",
            err
          );
          return [];
        }
      }))();
    }
    return chunksPromise;
  });
}
function getExtractor() {
  return __async(this, null, function* () {
    if (!extractorPromise) {
      const embeddingModel = process.env.HF_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
      extractorPromise = pipeline("feature-extraction", embeddingModel);
    }
    return extractorPromise;
  });
}
function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0)
    return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function embedQuestion(question) {
  return __async(this, null, function* () {
    const extractor = yield getExtractor();
    const normalizedQuestion = question.normalize("NFKC").toLowerCase();
    const output = yield extractor(normalizedQuestion, {
      pooling: "mean",
      normalize: true
    });
    const vec = Array.from(output.data);
    return vec;
  });
}
function getRagContext(question) {
  return __async(this, null, function* () {
    var _a, _b;
    const chunks = yield loadChunks();
    if (!chunks.length) {
      console.warn("[RAG] No chunks loaded; returning empty context.");
      return { context: "", images: [] };
    }
    const qEmb = yield embedQuestion(question);
    if (!qEmb)
      return { context: "", images: [] };
    const questionTokens = new Set(
      question.toLowerCase().normalize("NFKC").split(/\W+/).filter((t) => t.length >= 3)
    );
    const scored = chunks.map((chunk) => {
      const sim = cosineSim(qEmb, chunk.embedding);
      const chunkTokens = new Set(
        chunk.text.toLowerCase().normalize("NFKC").split(/\W+/).filter((t) => t.length >= 3)
      );
      let overlap = 0;
      questionTokens.forEach((t) => {
        if (chunkTokens.has(t))
          overlap += 1;
      });
      const keywordScore = questionTokens.size > 0 ? overlap / questionTokens.size : 0;
      const blended = sim * 0.7 + keywordScore * 0.3;
      return {
        chunk,
        score: blended,
        sim,
        keywordScore
      };
    });
    scored.sort((a, b) => b.score - a.score);
    const topK = 6;
    const best = scored.slice(0, topK);
    const bestScore = (_b = (_a = best[0]) == null ? void 0 : _a.score) != null ? _b : 0;
    const minScore = Math.max(0.1, bestScore * 0.45);
    const filtered = best.filter((b) => b.score >= minScore);
    console.log(
      `[RAG] Top ${best.length} chunks scores:`,
      best.map((b) => `${b.score.toFixed(3)} (sim:${b.sim.toFixed(3)}, kw:${b.keywordScore.toFixed(3)})`)
    );
    console.log(
      `[RAG] Using ${filtered.length} chunks with minScore ${minScore.toFixed(3)}`
    );
    const selected = filtered.length ? filtered : best.slice(0, 1);
    const maxContextChars = 4e3;
    const context = selected.map((b) => b.chunk.text).join("\n\n").slice(0, maxContextChars);
    return { context, images: [] };
  });
}

// src/controllers/historyStore.ts
import fs2 from "fs/promises";
import path2 from "path";
var HISTORY_DIR = path2.join(process.cwd(), "history");
function appendHistory(userId, messages) {
  return __async(this, null, function* () {
    yield fs2.mkdir(HISTORY_DIR, { recursive: true });
    const filename = path2.join(
      HISTORY_DIR,
      sanitize(userId) + ".json"
    );
    let existing = [];
    try {
      const raw = yield fs2.readFile(filename, "utf-8");
      existing = JSON.parse(raw);
    } catch (e) {
      existing = [];
    }
    existing.push(messages);
    yield fs2.writeFile(filename, JSON.stringify(existing, null, 2));
  });
}
function getLatestHistory(userId) {
  return __async(this, null, function* () {
    const filename = path2.join(HISTORY_DIR, sanitize(userId) + ".json");
    try {
      const raw = yield fs2.readFile(filename, "utf-8");
      const existing = JSON.parse(raw);
      if (!Array.isArray(existing) || existing.length === 0)
        return null;
      return existing[existing.length - 1] || null;
    } catch (e) {
      return null;
    }
  });
}
function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, "_");
}

// src/controllers/chat.controller.ts
var chat = (req, res) => __async(void 0, null, function* () {
  try {
    const {
      messages,
      data,
      userId
    } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId \u2014 login required!" });
    }
    if (!messages || messages.length === 0) {
      return res.status(400).json({
        error: "messages are required in the request body"
      });
    }
    const last = messages[messages.length - 1];
    if (last.role !== "user") {
      return res.status(400).json({
        error: "the last message must be from the user"
      });
    }
    if (!process.env.MISTRAL_API_KEY) {
      return res.status(500).json({
        error: "MISTRAL_API_KEY is not set"
      });
    }
    const question = last.content;
    const rag = yield getRagContext(question);
    const { context } = rag;
    const systemPrompt = `You are an assistant that must answer in the same language as the user's question (default to English if unclear). Use ONLY the provided CONTEXT. If the answer is not in the context, reply: "I cannot find this information in the uploaded documents." Be concise (2-3 sentences). Do not fabricate or add external information.`;
    const contextMessage = context ? `CONTEXT START
${context}
CONTEXT END` : "Nu exista context relevant din documente pentru intrebarea de mai sus.";
    const mistralMessages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: contextMessage },
      ...messages.slice(0, -1),
      last
    ];
    const mistral = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1"
    });
    const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
    console.log("[Mistral chat] model:", model);
    const completion = yield mistral.chat.completions.create({
      model,
      messages: mistralMessages,
      stream: true
    });
    let finalAnswer = "";
    const stream = OpenAIStream(completion, {
      experimental_streamData: true,
      onToken: (t) => finalAnswer += t,
      onFinal: () => __async(void 0, null, function* () {
        var _a;
        yield appendHistory(userId, [
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          })),
          {
            role: "assistant",
            content: finalAnswer,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]);
        return {
          imageUrl: (_a = data == null ? void 0 : data.imageUrl) != null ? _a : null,
          usedRag: !!context
        };
      })
    });
    return streamToResponse(stream, res, {
      headers: {
        "X-Experimental-Stream-Data": "true",
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Expose-Headers": "X-Experimental-Stream-Data"
      }
    });
  } catch (error) {
    console.error("[Mistral chat controller]", error);
    return res.status(500).json({
      error: error.message
    });
  }
});

// index.ts
var app = express();
app.use(cors());
app.use(express.json());
app.post("/api/chat", chat);
app.get("/api/history", (req, res) => __async(void 0, null, function* () {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    const history = yield getLatestHistory(userId);
    const withIds = (history == null ? void 0 : history.map((m, idx) => ({
      id: `${m.timestamp || idx}-${idx}`,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp
    }))) || [];
    return res.json({ history: withIds });
  } catch (err) {
    console.error("[History] Failed to read history", err);
    return res.status(500).json({ error: "Failed to read history" });
  }
}));
var PORT = process.env.PORT || 8e3;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
