"use client";

import { useEffect } from "react";

// Registers public/sw.js (offline tickets). Production only: in dev it would
// keep stale bundles around between edits.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline tickets on this browser; everything else works the same.
    });
  }, []);
  return null;
}
