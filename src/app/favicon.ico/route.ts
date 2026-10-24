import { brandLogo } from "@/lib/brand";
import { drawBrandIcon } from "@/lib/brand-icons";

// For browsers and tools that ask for /favicon.ico instead of the icons pages link to.
export async function GET() {
  return new Response(await drawBrandIcon(brandLogo(), "icon-32.png"), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
  });
}
