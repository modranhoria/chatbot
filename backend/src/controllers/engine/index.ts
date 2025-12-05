// src/controllers/engine.ts

import fs from "fs/promises";
import path from "path";
import { pipeline } from "@xenova/transformers";
import { STORAGE_CACHE_DIR } from "./constants.mjs";

export type EmbeddedChunk = {
  id: number;
  source: string;
  text: string;
  embedding: number[];
  images?: string[];
};

export type RagResult = {
  context: string;
  images: string[];
};

let chunksPromise: Promise<EmbeddedChunk[]> | null = null;
let extractorPromise: Promise<any> | null = null;

// Load embeddings.json from ./cache
async function loadChunks(): Promise<EmbeddedChunk[]> {
  if (!chunksPromise) {
    chunksPromise = (async () => {
      try {
        const filePath = path.join(
          process.cwd(),
          STORAGE_CACHE_DIR,
          "embeddings.json",
        );
        const raw = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(raw) as EmbeddedChunk[];
        console.log(
          `[RAG] Loaded ${data.length} embedded chunks from ${filePath}`,
        );
        return data;
      } catch (err) {
        console.error(
          "[RAG] Failed to load embeddings.json. Did you run `npm run generate`?",
          err,
        );
        return [];
      }
    })();
  }
  return chunksPromise;
}

async function getExtractor() {
  if (!extractorPromise) {
    const embeddingModel =
      process.env.HF_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

    extractorPromise = pipeline("feature-extraction", embeddingModel);
  }
  return extractorPromise;
}

// cosine similarity between two vectors
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// generate embedding for the question (normalized)
async function embedQuestion(question: string): Promise<number[] | null> {
  const extractor = await getExtractor();
  const normalizedQuestion = question.normalize("NFKC").toLowerCase();
  const output = await extractor(normalizedQuestion, {
    pooling: "mean",
    normalize: true,
  });
  const vec: number[] = Array.from(output.data);
  return vec;
}

// Public function: returns RAG context (text-only for now)
export async function getRagContext(question: string): Promise<RagResult> {
  const chunks = await loadChunks();
  if (!chunks.length) {
    console.warn("[RAG] No chunks loaded; returning empty context.");
    return { context: "", images: [] };
  }

  const qEmb = await embedQuestion(question);
  if (!qEmb) return { context: "", images: [] };

  const questionTokens = new Set(
    question
      .toLowerCase()
      .normalize("NFKC")
      .split(/\W+/)
      .filter((t) => t.length >= 3),
  );

  const scored = chunks.map((chunk) => {
    const sim = cosineSim(qEmb, chunk.embedding);
    const chunkTokens = new Set(
      chunk.text
        .toLowerCase()
        .normalize("NFKC")
        .split(/\W+/)
        .filter((t) => t.length >= 3),
    );
    let overlap = 0;
    questionTokens.forEach((t) => {
      if (chunkTokens.has(t)) overlap += 1;
    });
    const keywordScore =
      questionTokens.size > 0 ? overlap / questionTokens.size : 0;
    const blended = sim * 0.7 + keywordScore * 0.3;
    return {
      chunk,
      score: blended,
      sim,
      keywordScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const topK = 6;
  const best = scored.slice(0, topK);

  const bestScore = best[0]?.score ?? 0;
  const minScore = Math.max(0.1, bestScore * 0.45);
  const filtered = best.filter((b) => b.score >= minScore);

  console.log(
    `[RAG] Top ${best.length} chunks scores:`,
    best.map((b) => `${b.score.toFixed(3)} (sim:${b.sim.toFixed(3)}, kw:${b.keywordScore.toFixed(3)})`),
  );
  console.log(
    `[RAG] Using ${filtered.length} chunks with minScore ${minScore.toFixed(3)}`,
  );

  const selected = filtered.length ? filtered : best.slice(0, 1);

  const maxContextChars = 4000;
  const context = selected
    .map((b) => b.chunk.text)
    .join("\n\n")
    .slice(0, maxContextChars);

  // images are disabled for now (text-only RAG)
  return { context, images: [] };
}
