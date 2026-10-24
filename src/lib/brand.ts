import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cleanText } from "@/lib/validation";

// What one company's copy is called and looks like. Each company runs its own
// copy and sets these in its environment (README, Branding). They are read on
// every request, so a restart applies new values without a rebuild.

const DEFAULT_NAME = "Campus Food Court";
const DEFAULT_SHORT_NAME = "Food Court";
const DEFAULT_LOGO = "brand/logo.svg";
const DEFAULT_LOGO_BACKGROUND = "#0b3d32";
const MAX_LOGO_BYTES = 1024 * 1024;
// Goes into every icon's version, so cached icons are replaced when they are drawn differently.
const ICON_STYLE = "1";

const LOGO_TYPES: Record<string, "image/svg+xml" | "image/png"> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

type Env = Record<string, string | undefined>;

export type BrandNames = {
  // Page titles, receipts, the sign-in SMS, the counter display.
  name: string;
  // Under the icon on a phone's home screen.
  shortName: string;
  // The header's two lines, "Campus" over "Food Court"; one line when top is null.
  headerTop: string | null;
  headerMain: string;
};

export type BrandLogo = {
  bytes: Buffer;
  type: "image/svg+xml" | "image/png";
  // Fills the space around the logo where an icon cannot be transparent.
  background: string;
  // Changes with the file and the background, so the URLs below can be cached for good.
  version: string;
};

export function brandNames(env: Env = process.env): BrandNames {
  const name = cleanText(env.BRAND_NAME, 60) || DEFAULT_NAME;
  const shortName = cleanText(env.BRAND_SHORT_NAME, 30) || (name === DEFAULT_NAME ? DEFAULT_SHORT_NAME : name);
  const split = name !== shortName && name.endsWith(` ${shortName}`);
  return {
    name,
    shortName,
    headerTop: split ? name.slice(0, -shortName.length - 1) : null,
    headerMain: split ? shortName : name,
  };
}

const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[brand] ${message}`);
}

let cached: { key: string; logo: BrandLogo } | null = null;

function readLogo(file: string, background: string): BrandLogo | string {
  const type = LOGO_TYPES[path.extname(file).toLowerCase()];
  if (!type) return "is not an .svg or .png file";
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return "was not found";
  }
  if (!stat.isFile()) return "is not a file";
  if (stat.size > MAX_LOGO_BYTES) return "is larger than 1 MB";
  const key = `${file}|${stat.size}|${stat.mtimeMs}|${background}`;
  if (cached?.key === key) return cached.logo;
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return "could not be read";
  }
  const valid =
    type === "image/png" ? bytes.subarray(0, 8).equals(PNG_SIGNATURE) : bytes.subarray(0, 4096).toString("utf8").includes("<svg");
  if (!valid) return `does not look like ${type === "image/png" ? "a PNG" : "an SVG"} image`;
  const version = createHash("sha256").update(`${ICON_STYLE}|${background}|`).update(bytes).digest("hex").slice(0, 12);
  const logo = { bytes, type, background, version };
  cached = { key, logo };
  return logo;
}

// BRAND_LOGO, or the built-in logo if it is unset or unusable (with a warning in the log).
export function brandLogo(env: Env = process.env): BrandLogo {
  let background = cleanText(env.BRAND_LOGO_BACKGROUND, 20) || DEFAULT_LOGO_BACKGROUND;
  if (!HEX_COLOR.test(background)) {
    warnOnce(`BRAND_LOGO_BACKGROUND="${env.BRAND_LOGO_BACKGROUND}" is not a colour like #0b3d32; using ${DEFAULT_LOGO_BACKGROUND}.`);
    background = DEFAULT_LOGO_BACKGROUND;
  }
  const configured = cleanText(env.BRAND_LOGO, 500);
  if (configured) {
    // Any file on the server, chosen at runtime: not one for the build to bundle.
    const logo = readLogo(path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured), background);
    if (typeof logo !== "string") return logo;
    warnOnce(`BRAND_LOGO="${configured}" ${logo}; using the built-in logo.`);
  }
  const logo = readLogo(path.resolve(process.cwd(), DEFAULT_LOGO), background);
  if (typeof logo === "string") throw new Error(`The built-in logo ${DEFAULT_LOGO} ${logo}.`);
  return logo;
}

// Where the routes in src/app/brand serve the logo and the icons drawn from it.
export function brandAssetUrl(logo: BrandLogo, file: BrandFile) {
  return `/brand/${file}?v=${logo.version}`;
}

export function logoFile(logo: BrandLogo) {
  return logo.type === "image/svg+xml" ? "logo.svg" : "logo.png";
}

export type BrandFile = "logo.svg" | "logo.png" | BrandIcon;

export const BRAND_ICONS = {
  "icon-32.png": { size: 32, fill: false, scale: 1 },
  "icon-192.png": { size: 192, fill: false, scale: 1 },
  "icon-512.png": { size: 512, fill: false, scale: 1 },
  // iOS shows a transparent home-screen icon on black, so it gets the background.
  "apple-icon.png": { size: 180, fill: true, scale: 1 },
  // Android crops maskable icons to its own shape, up to the outer tenth on each side.
  "icon-maskable.png": { size: 512, fill: true, scale: 0.8 },
} as const;

export type BrandIcon = keyof typeof BRAND_ICONS;
