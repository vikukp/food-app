import type { MetadataRoute } from "next";
import { brandAssetUrl, brandLogo, brandNames, logoFile } from "@/lib/brand";

// From the brand settings at request time, not frozen at build.
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const { name, shortName } = brandNames();
  const logo = brandLogo();
  return {
    name,
    short_name: shortName,
    description: `Skip the afternoon line at ${name}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#0b3d32",
    icons: [
      ...(logo.type === "image/svg+xml"
        ? [{ src: brandAssetUrl(logo, logoFile(logo)), sizes: "any", type: "image/svg+xml" }]
        : []),
      { src: brandAssetUrl(logo, "icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: brandAssetUrl(logo, "icon-512.png"), sizes: "512x512", type: "image/png" },
      { src: brandAssetUrl(logo, "icon-maskable.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
