import { ImageResponse } from "next/og";
import { BRAND_ICONS, type BrandIcon, type BrandLogo } from "@/lib/brand";

const drawn = new Map<string, ArrayBuffer>();

// One icon size drawn from the logo, centred on the brand background for the
// icons that cannot be transparent. Kept in memory per logo version.
export async function drawBrandIcon(logo: BrandLogo, icon: BrandIcon) {
  const key = `${logo.version}/${icon}`;
  const kept = drawn.get(key);
  if (kept) return kept;
  const { size, fill, scale } = BRAND_ICONS[icon];
  const side = Math.round(size * scale);
  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: fill ? logo.background : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:${logo.type};base64,${logo.bytes.toString("base64")}`}
          alt=""
          width={side}
          height={side}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: size, height: size },
  );
  const png = await image.arrayBuffer();
  // A new logo or background is a new version; the old version's icons are not asked for again.
  if (drawn.size >= 20) drawn.clear();
  drawn.set(key, png);
  return png;
}
