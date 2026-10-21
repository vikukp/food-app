// Writes a random SESSION_SECRET to .env.local if none is configured, so the
// app never boots with a predictable signing key. With --dev (npm run dev) it
// also turns on DEMO_MODE in .env.local unless DEMO_MODE is set somewhere, so
// a fresh checkout is a working demo while `build`/`start` stay fail-closed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");

// npm scripts do not load dotenv files, so look in every file Next would read;
// otherwise a secret set in .env.production is silently overridden by .env.local.
const read = (name) => {
  const file = resolve(process.cwd(), name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
const envFiles = [".env", ".env.production", ".env.production.local", ".env.development", ".env.development.local"];
let existing = read(".env.local");
const allEnv = () => [existing, ...envFiles.map(read)];

function append(comment, line) {
  const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
  const text = `${prefix}# ${comment}\n${line}\n`;
  appendFileSync(envLocal, text);
  existing += text;
}

const hasSecret = (text) => /^\s*SESSION_SECRET\s*=\s*["']?[^\s"'#]{32,}/m.test(text);
if (!(process.env.SESSION_SECRET?.length >= 32) && !allEnv().some(hasSecret)) {
  append(
    "Signs employee and vendor sessions and QR payloads. Rotate to log everyone out.",
    `SESSION_SECRET=${randomBytes(48).toString("base64url")}`,
  );
  console.log("Generated SESSION_SECRET in .env.local");
}

const mentionsDemo = (text) => /^\s*DEMO_MODE\s*=/m.test(text);
if (process.argv.includes("--dev") && process.env.DEMO_MODE === undefined && !allEnv().some(mentionsDemo)) {
  append(
    "Demo conveniences: sign-in codes on screen, shared counter PIN, demo employee. Never in production.",
    "DEMO_MODE=1",
  );
  console.log("Turned on DEMO_MODE in .env.local for local development");
}
