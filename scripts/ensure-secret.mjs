// Writes a random SESSION_SECRET to .env.local if none is configured, so the
// app never boots with a predictable signing key.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");

if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
  process.exit(0);
}

// npm scripts do not load dotenv files, so look in every file Next would read;
// otherwise a secret set in .env.production is silently overridden by .env.local.
const read = (name) => {
  const file = resolve(process.cwd(), name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
const hasSecret = (text) => /^\s*SESSION_SECRET\s*=\s*["']?[^\s"'#]{32,}/m.test(text);
const envFiles = [".env", ".env.production", ".env.production.local", ".env.development", ".env.development.local"];
const existing = read(".env.local");
if ([existing, ...envFiles.map(read)].some(hasSecret)) {
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
appendFileSync(envLocal, `${prefix}# Signs employee and vendor sessions and QR payloads. Rotate to log everyone out.\nSESSION_SECRET=${secret}\n`);
console.log("Generated SESSION_SECRET in .env.local");
