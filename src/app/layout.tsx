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
    default: "Campus Food Court",
    template: "%s · Campus Food Court",
  },
  description:
    "Skip the afternoon line at the campus food court. Order from 20 stalls, pick a pickup time, pay, and show a QR token at the counter.",
  applicationName: "Campus Food Court",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Food Court",
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
        {/* Below the 56px header, so a toast never hides the bag count it is about. */}
        <Toaster position="top-center" offset={72} mobileOffset={72} />
        <ServiceWorker />
      </body>
    </html>
  );
}
