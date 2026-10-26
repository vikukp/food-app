import type { Metadata } from "next";

// Counter pages link the counter's own manifest, so a tablet that installs the
// counter gets an app that opens on the kitchen queue.
export const metadata: Metadata = {
  manifest: "/vendor/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Counter", statusBarStyle: "default" },
};

export default function VendorLayout({ children }: LayoutProps<"/vendor">) {
  return children;
}
