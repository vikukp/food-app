import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

// Fixed-window counter kept in process memory. Good enough for a single-node
// campus deployment; move to Redis if the app is ever scaled horizontally.
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consume(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clearBucket(key: string) {
  buckets.delete(key);
}

// server.mjs rewrites X-Forwarded-For to the one address it trusts (see
// TRUST_PROXY_HOPS), so the first entry is the client. Under `next dev` the
// header is passed through as sent, which is fine for local work only.
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return h.get("x-real-ip")?.slice(0, 64) ?? "local";
}
