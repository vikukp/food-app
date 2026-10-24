import { brandLogo } from "@/lib/brand";
import { drawBrandIcon } from "@/lib/brand-icons";

// Drawn per request from the brand settings; otherwise the build would keep the default logo's.
export const dynamic = "force-dynamic";

// For browsers and tools that ask for /favicon.ico instead of the icons pages link to.
export async function GET() {
  return new Response(await drawBrandIcon(brandLogo(), "icon-32.png"), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
  });
}
