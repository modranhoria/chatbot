import fs from "fs/promises";
import path from "path";

const HISTORY_DIR = path.join(process.cwd(), "history");

export interface StoredMessage {
  role: string;
  content: string;
  timestamp: string;
}

export async function appendHistory(
  userId: string,
  messages: StoredMessage[],
) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  const filename = path.join(
    HISTORY_DIR,
    sanitize(userId) + ".json"
  );

  let existing: StoredMessage[][] = [];

  try {
    const raw = await fs.readFile(filename, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // dacă nu există fișierul, pornim de la zero
    existing = [];
  }

  existing.push(messages);

  await fs.writeFile(filename, JSON.stringify(existing, null, 2));
}

export async function getLatestHistory(
  userId: string,
): Promise<StoredMessage[] | null> {
  const filename = path.join(HISTORY_DIR, sanitize(userId) + ".json");
  try {
    const raw = await fs.readFile(filename, "utf-8");
    const existing = JSON.parse(raw) as StoredMessage[][];
    if (!Array.isArray(existing) || existing.length === 0) return null;
    return existing[existing.length - 1] || null;
  } catch {
    return null;
  }
}

function sanitize(str: string) {
  return str.replace(/[^a-zA-Z0-9-_]/g, "_");
}
