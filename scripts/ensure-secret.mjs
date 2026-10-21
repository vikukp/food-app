// Writes a random SESSION_SECRET to .env.local if none is configured, so the
// app never boots with a predictable signing key.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");

if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
  process.exit(0);
}

const existing = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
if (/^\s*SESSION_SECRET\s*=\s*\S{32,}/m.test(existing)) {
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
appendFileSync(envLocal, `${prefix}# Signs employee and vendor sessions and QR payloads. Rotate to log everyone out.\nSESSION_SECRET=${secret}\n`);
console.log("Generated SESSION_SECRET in .env.local");
