import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { Toaster } from "@/components/ui/sonner";
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

export const metadata: Metadata = {
  title: {
    default: "HPE IWF Food Court",
    template: "%s · HPE IWF Food Court",
  },
  description:
    "Skip the afternoon line at HPE IWF Campus. Order from 20 stalls, pick a pickup time, pay, and show a QR token at the counter.",
  applicationName: "HPE IWF Food Court",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "IWF Food",
    statusBarStyle: "default",
  },
};

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
        <Toaster position="top-center" />
        <ServiceWorker />
      </body>
    </html>
  );
}
