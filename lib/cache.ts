// Two-tier cache: in-memory Map + best-effort on-disk JSON (works on read-only hosts too).
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

const DIR = process.env.VERCEL ? path.join(os.tmpdir(), "edgeline-cache") : path.join(process.cwd(), ".cache");
const mem = new Map<string, { exp: number; v: unknown }>();

function fileFor(key: string): string {
  return path.join(DIR, crypto.createHash("md5").update(key).digest("hex") + ".json");
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const m = mem.get(key);
  if (m && m.exp > now) return m.v as T;
  try {
    const raw = await fs.readFile(fileFor(key), "utf8");
    const parsed = JSON.parse(raw) as { exp: number; v: T };
    if (parsed.exp > now) {
      mem.set(key, parsed);
      return parsed.v;
    }
  } catch {
    /* miss */
  }
  const v = await loader();
  const entry = { exp: now + ttlMs, v };
  mem.set(key, entry);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(fileFor(key), JSON.stringify(entry));
  } catch {
    /* best effort */
  }
  return v;
}

export const TTL = {
  minute: 60_000,
  fiveMin: 5 * 60_000,
  thirtyMin: 30 * 60_000,
  sixHours: 6 * 3_600_000,
  day: 24 * 3_600_000,
  month: 30 * 24 * 3_600_000,
};
