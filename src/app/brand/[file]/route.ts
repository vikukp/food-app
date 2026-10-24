import { BRAND_ICONS, brandLogo, logoFile, type BrandIcon } from "@/lib/brand";
import { drawBrandIcon } from "@/lib/brand-icons";

// The logo from the brand settings (src/lib/brand.ts) and the icons drawn from
// it. Pages link here with ?v=<version>: the current version can be cached for
// good, anything else is checked again next time.
export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const logo = brandLogo();
  const current = new URL(request.url).searchParams.get("v") === logo.version;
  const headers: Record<string, string> = {
    "Cache-Control": current ? "public, max-age=31536000, immutable" : "no-cache",
  };
  if (file === logoFile(logo)) {
    headers["Content-Type"] = logo.type;
    // Opened on its own an SVG is a document: no scripts, nothing fetched.
    if (logo.type === "image/svg+xml") {
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    return new Response(new Uint8Array(logo.bytes), { headers });
  }
  if (!Object.hasOwn(BRAND_ICONS, file)) return new Response("Not found", { status: 404 });
  headers["Content-Type"] = "image/png";
  return new Response(await drawBrandIcon(logo, file as BrandIcon), { headers });
}
