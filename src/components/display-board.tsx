"use client";

import { useEffect, useState } from "react";
import type { DisplayBoard } from "@/lib/display-board";

export function DisplayBoardView({
  stall,
  initial,
}: {
  stall: { id: string; name: string; location: string };
  initial: DisplayBoard;
}) {
  const [board, setBoard] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/display/${stall.id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        setBoard((await res.json()) as DisplayBoard);
        setStale(false);
      } catch {
        setStale(true);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [stall.id]);

  return (
    <main className="flex min-h-screen flex-col bg-[#0b3d32] p-6 text-white sm:p-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{stall.name}</h1>
          <p className="mt-1 text-emerald-100/80 sm:text-xl">{stall.location}</p>
        </div>
        {stale ? <p className="text-sm text-amber-200">Reconnecting…</p> : null}
      </header>
      <div className="mt-8 grid flex-1 gap-6 md:grid-cols-2">
        <section aria-label="Ready for pickup" className="rounded-2xl bg-white p-6 text-[#0b3d32]">
          <h2 className="text-xl font-semibold uppercase tracking-widest sm:text-2xl">Ready for pickup</h2>
          <ul className="mt-4 flex flex-wrap gap-3" aria-live="polite">
            {board.ready.length ? (
              board.ready.map((token) => (
                <li key={token} className="rounded-xl bg-emerald-600 px-4 py-2 font-mono text-3xl font-semibold text-white sm:text-5xl">
                  {token.replace("T-", "")}
                </li>
              ))
            ) : (
              <li className="text-lg text-emerald-900/60">Nothing waiting.</li>
            )}
          </ul>
        </section>
        <section aria-label="Preparing" className="rounded-2xl bg-white/10 p-6">
          <h2 className="text-xl font-semibold uppercase tracking-widest sm:text-2xl">Preparing</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {board.preparing.length ? (
              board.preparing.map((token) => (
                <li key={token} className="rounded-xl bg-white/15 px-4 py-2 font-mono text-2xl sm:text-4xl">
                  {token.replace("T-", "")}
                </li>
              ))
            ) : (
              <li className="text-lg text-emerald-100/70">No orders in the kitchen.</li>
            )}
          </ul>
        </section>
      </div>
      <p className="mt-6 text-center text-emerald-100/80 sm:text-lg">
        Show your token or QR at the counter. Order ahead on the Campus Food Court app.
      </p>
    </main>
  );
}
