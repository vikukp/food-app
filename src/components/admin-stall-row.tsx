"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminResetStallPin, adminSetPaused } from "@/lib/admin-actions";
import { formatInr } from "@/lib/money";
import type { VendorDaySummary } from "@/lib/vendor-orders";

type Stall = {
  id: string;
  name: string;
  location: string;
  hours: string;
  paused: boolean;
  open: boolean;
  waiting: number;
  summary: VendorDaySummary;
  rating: { average: number; count: number } | null;
};

export function AdminStallRow({ stall }: { stall: Stall }) {
  const [paused, setPaused] = useState(stall.paused);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);

  function togglePause() {
    startTransition(async () => {
      const result = await adminSetPaused(stall.id, !paused);
      if (!result.ok) return void toast.error(result.error);
      setPaused(!paused);
      toast.success(`${stall.name} ${paused ? "is taking orders again" : "paused"}`);
    });
  }

  function resetPin() {
    setConfirmReset(false);
    startTransition(async () => {
      const result = await adminResetStallPin(stall.id);
      if (!result.ok) return void toast.error(result.error);
      setNewPin(result.pin);
    });
  }

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{stall.name}</h2>
          <p className="text-xs text-muted-foreground">
            {stall.location} · {stall.hours}
          </p>
        </div>
        <Badge variant={paused ? "secondary" : stall.open ? "default" : "outline"}>
          {paused ? "Paused" : stall.open ? "Open" : "Closed"}
        </Badge>
      </div>
      <p className="mt-2 text-sm">
        {stall.summary.orders} orders · {formatInr(stall.summary.revenueInr)} · {stall.waiting} waiting
        {stall.summary.cancelled ? ` · ${stall.summary.cancelled} cancelled` : ""}
        {stall.rating ? ` · ★ ${stall.rating.average.toFixed(1)} from ${stall.rating.count} (30 days)` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={togglePause}>
          {paused ? "Resume orders" : "Pause orders"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending || confirmReset} onClick={() => setConfirmReset(true)}>
          Reset counter PIN
        </Button>
      </div>
      {confirmReset ? (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p>Give {stall.name} a new counter PIN? Every tablet signed in to it is signed out.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" disabled={pending} onClick={resetPin}>
              Yes, reset the PIN
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Keep the current PIN
            </Button>
          </div>
        </div>
      ) : null}
      {newPin ? (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          New counter PIN for {stall.name}: <span className="font-mono text-base font-semibold">{newPin}</span>. It is
          shown only now; give it to the stall and ask them to change it under Menu.
        </p>
      ) : null}
    </li>
  );
}
