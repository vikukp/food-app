"use client";

import { useEffect } from "react";
import { claimDevice } from "@/lib/offline-tickets";

// Rendered ahead of the page so it runs before a ticket saves itself.
export function DeviceOwner({ owner }: { owner: string }) {
  useEffect(() => claimDevice(owner), [owner]);
  return null;
}
