"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { busyCopy, hoursLabel } from "@/lib/hours";

export type StallCardData = {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  location: string;
  vegOnly: boolean;
  busyLevel: string;
  accent: string;
  open: boolean;
  paused: boolean;
  openTime: string;
  closeTime: string;
};

export function StallGrid({ stalls }: { stalls: StallCardData[] }) {
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [openNow, setOpenNow] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stalls.filter((stall) => {
      if (vegOnly && !stall.vegOnly) return false;
      if (openNow && !stall.open) return false;
      if (!q) return true;
      return (
        stall.name.toLowerCase().includes(q) ||
        stall.cuisine.toLowerCase().includes(q) ||
        stall.description.toLowerCase().includes(q)
      );
    });
  }, [openNow, query, stalls, vegOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dosa, biryani, rolls…"
            className="h-10 pl-8"
            aria-label="Search stalls"
          />
        </label>
        <div className="flex gap-2">
          <FilterChip active={vegOnly} onClick={() => setVegOnly((v) => !v)} label="Veg only" />
          <FilterChip active={openNow} onClick={() => setOpenNow((v) => !v)} label="Open now" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <p className="font-medium">No stalls match that filter.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear search or turn off veg / open-now to see the full court.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((stall) => (
            <Link key={stall.id} href={`/stalls/${stall.id}`} className="group block">
              <Card className="h-full py-0 transition-shadow group-hover:shadow-md">
                <div className="h-1.5" style={{ backgroundColor: stall.accent }} />
                <CardHeader className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{stall.name}</CardTitle>
                    <Badge variant={stall.open ? "default" : "secondary"}>
                      {stall.paused ? "Paused" : stall.open ? "Open" : "Closed"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {stall.cuisine} · {stall.location}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="line-clamp-2 text-sm text-muted-foreground">{stall.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stall.vegOnly ? <Badge variant="outline">Pure veg</Badge> : null}
                    <Badge variant="outline">{busyCopy(stall.busyLevel)}</Badge>
                    <Badge variant="outline">{hoursLabel(stall.openTime, stall.closeTime)}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-lg border px-3 text-sm font-medium ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
