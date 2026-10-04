// Optional durable key-value backend (Vercel KV / Upstash Redis REST). Falls back to local files when unset.
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = !!(URL && TOKEN);

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!kvEnabled) return null;
  const res = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { result?: string | null };
  if (!j.result) return null;
  try {
    return JSON.parse(j.result) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!kvEnabled) return;
  await fetch(`${URL}/set/${encodeURIComponent(key)}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(value) }).catch(() => {});
}
