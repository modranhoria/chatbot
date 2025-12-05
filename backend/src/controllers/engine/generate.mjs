// src/controllers/engine/generate.mjs

import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { pipeline } from "@xenova/transformers";

import {
  STORAGE_CACHE_DIR,
  STORAGE_DIR,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
} from "./constants.mjs";

dotenv.config();

const normalizeText = (text) =>
  text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\uFFFD/g, "")
    .trim()
    .toLowerCase();

async function getRuntime(func) {
  const start = Date.now();
  await func();
  const end = Date.now();
  return end - start;
}

// extrage text per pagina
async function extractPagesFromPdf(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    const text = normalizeText(strings);
    if (!text) continue;

    pages.push({
      page: pageNum,
      text,
    });
  }

  return pages;
}

// split text in chunk-uri cu overlap
function chunkText(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;
  const len = text.length;

  while (start < len) {
    const end = Math.min(start + chunkSize, len);
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end === len) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// citeste fisierele din ./data si produce chunk-uri text (fara imagini)
async function loadChunksFromDirectory(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const allChunks = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = path.join(directoryPath, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    const baseName = path.basename(entry.name, ext); // LabVIEW_Aplicatii

    if (ext === ".pdf") {
      const buffer = await fs.readFile(fullPath);
      const pages = await extractPagesFromPdf(buffer);

      let totalChunksForFile = 0;

      for (const page of pages) {
        const pageChunks = chunkText(page.text, CHUNK_SIZE, CHUNK_OVERLAP);
        totalChunksForFile += pageChunks.length;

        const prefix = `[${baseName} - pagina ${page.page}]`;

        for (const chunk of pageChunks) {
          allChunks.push({
            source: fullPath,
            page: page.page,
            text: `${prefix} ${normalizeText(chunk)}`,
            images: [],
          });
        }
      }

      console.log(
        `File ${entry.name}: ${totalChunksForFile} chunks generated from ${pages.length} pages.`,
      );
    } else if (ext === ".txt" || ext === ".md") {
      const text = await fs.readFile(fullPath, "utf-8");
      if (!text?.trim()) {
        console.log(`No extractable text in ${fullPath}`);
        continue;
      }

      const chunks = chunkText(normalizeText(text), CHUNK_SIZE, CHUNK_OVERLAP);
      console.log(
        `File ${entry.name}: ${chunks.length} chunks generated (len=${text.length})`,
      );

      for (const chunk of chunks) {
        allChunks.push({
          source: fullPath,
          page: null,
          text: normalizeText(chunk),
          images: [],
        });
      }
    } else {
      console.log(`Skipping unsupported file: ${fullPath}`);
      continue;
    }
  }

  return allChunks;
}

async function generateEmbeddings() {
  console.log("Generating embeddings from data (local, Xenova)...");

  const embeddingModel =
    process.env.HF_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

  const extractor = await pipeline("feature-extraction", embeddingModel);

  const ms = await getRuntime(async () => {
    const chunks = await loadChunksFromDirectory(STORAGE_DIR);

    const embedded = [];

    for (let i = 0; i < chunks.length; i++) {
      const { text, source, images } = chunks[i];
      console.log(
        `Embedding chunk ${i + 1}/${chunks.length} (source: ${path.basename(
          source,
        )})`,
      );

      const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });

      const vector = Array.from(output.data);

      embedded.push({
        id: i,
        source,
        text,
        embedding: vector,
        images,
      });
    }

    await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
    const outPath = path.join(STORAGE_CACHE_DIR, "embeddings.json");
    await fs.writeFile(outPath, JSON.stringify(embedded), "utf-8");
    console.log(`Saved ${embedded.length} chunks with embeddings to ${outPath}`);
  });

  console.log(`Embeddings generated in ${ms / 1000}s.`);
}

(async () => {
  await generateEmbeddings();
  console.log("Finished generating embeddings.");
})();
