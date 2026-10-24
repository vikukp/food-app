import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { Toaster } from "@/components/ui/sonner";
import { brandAssetUrl, brandLogo, brandNames, logoFile } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Every page renders per request so the CSP nonce from src/proxy.ts is applied.
export const dynamic = "force-dynamic";

// Name and icons come from the brand settings (src/lib/brand.ts); app/manifest.ts links itself.
export function generateMetadata(): Metadata {
  const { name, shortName } = brandNames();
  const logo = brandLogo();
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: `Skip the afternoon line at ${name}. Order from 20 stalls, pick a pickup time, pay, and show a QR token at the counter.`,
    applicationName: name,
    appleWebApp: {
      capable: true,
      title: shortName,
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: brandAssetUrl(logo, "icon-32.png"), sizes: "32x32", type: "image/png" },
        ...(logo.type === "image/svg+xml" ? [{ url: brandAssetUrl(logo, logoFile(logo)), type: "image/svg+xml" }] : []),
      ],
      apple: { url: brandAssetUrl(logo, "apple-icon.png"), sizes: "180x180", type: "image/png" },
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b3d32",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        {/* Below the 56px header, so a toast never hides the bag count it is about. */}
        <Toaster position="top-center" offset={72} mobileOffset={72} />
        <ServiceWorker />
      </body>
    </html>
  );
}
