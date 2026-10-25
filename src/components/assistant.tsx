"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LoaderCircleIcon, SendHorizontalIcon, SparklesIcon } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/config";
import type { BagChange } from "@/lib/assistant/tools";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string; failed?: boolean };

const SUGGESTIONS = ["2 masala dosas and a filter coffee", "Something veg under ₹150 that's quick", "What's open right now?"];
const KEPT_TURNS = 20;

function isTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string";
}

// The chat lasts for this tab, so moving between stall pages keeps it; signing
// out clears it with the rest of the site's storage.
function readTurns(key: string): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? saved.filter(isTurn).slice(-KEPT_TURNS) : [];
  } catch {
    return [];
  }
}

// Ask the AI assistant: it searches the menus and fills the bag, and the
// person checks the bag and pays as usual (see /api/assistant).
export function Assistant({ owner }: { owner: string }) {
  const { cart, count, total, hydrated, addItem, setQty } = useCart();
  const key = `fc-assistant-v1:${owner}`;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => readTurns(key));
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const busy = status !== null;

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(turns.slice(-KEPT_TURNS)));
    } catch {}
  }, [key, turns]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, status, open]);

  const say = (turn: Turn) => setTurns((current) => [...current, turn]);

  // The server worked on a copy of the bag; make the same changes to the real one.
  function apply(changes: BagChange[]) {
    const inBag = new Set(cart.stalls.flatMap((stall) => stall.items.map((line) => line.menuItemId)));
    for (const change of changes) {
      const id = change.item.menuItemId;
      if (change.qty > 0 && !inBag.has(id) && !addItem(change.stall, change.item)) continue;
      setQty(id, change.qty);
    }
  }

  async function send(text: string) {
    const message = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message || busy) return;
    const history = [...turns.filter((turn) => !turn.failed), { role: "user" as const, text: message }];
    say({ role: "user", text: message });
    setDraft("");
    setStatus("Thinking…");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), bag: cart }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        say({ role: "assistant", text: body?.error ?? "The assistant is not available right now.", failed: true });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; text?: string; changes?: BagChange[] };
          if (event.type === "status" && event.text) setStatus(event.text);
          if (event.type === "reply") {
            apply(event.changes ?? []);
            say({ role: "assistant", text: event.text ?? "" });
            answered = true;
          }
          if (event.type === "error") {
            say({ role: "assistant", text: event.text ?? "Something went wrong.", failed: true });
            answered = true;
          }
        }
        if (done) break;
      }
      if (!answered) say({ role: "assistant", text: "The answer was cut off. Please try again.", failed: true });
    } catch {
      say({ role: "assistant", text: "The assistant could not be reached. Check your connection and try again.", failed: true });
    } finally {
      setStatus(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            className={cn(
              "fixed right-4 z-40 h-12 rounded-full px-5 shadow-lg shadow-emerald-950/20",
              hydrated && count > 0 ? "bottom-24" : "bottom-6",
            )}
          />
        }
      >
        <SparklesIcon aria-hidden />
        Ask AI
      </SheetTrigger>
      <SheetContent side="right" className="w-full bg-background data-[side=right]:w-full sm:data-[side=right]:max-w-md">
        <SheetHeader>
          <SheetTitle>Order with AI</SheetTitle>
          <SheetDescription>Say what you&apos;d like. It fills your bag; you check the bag and pay.</SheetDescription>
        </SheetHeader>
        <div ref={log} role="log" aria-label="Chat with the ordering assistant" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {turns.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">Try one of these, or type your own:</p>
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 text-left whitespace-normal"
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          ) : (
            turns.map((turn, index) => (
              <p
                key={index}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line",
                  turn.role === "user"
                    ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                    : turn.failed
                      ? "self-start rounded-bl-sm bg-amber-50 text-amber-950"
                      : "self-start rounded-bl-sm bg-muted",
                )}
              >
                <span className="sr-only">{turn.role === "user" ? "You: " : "Assistant: "}</span>
                {turn.text}
              </p>
            ))
          )}
          {status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              {status}
            </p>
          ) : null}
        </div>
        <SheetFooter className="border-t">
          {hydrated && count > 0 ? (
            <Button render={<Link href="/checkout" />} className="justify-between">
              <span>Choose pickup times</span>
              <span>
                {count} item{count === 1 ? "" : "s"} · {formatInr(total)}
              </span>
            </Button>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <Input
              aria-label="Message the assistant"
              placeholder="e.g. 2 masala dosas and a coffee"
              autoComplete="off"
              maxLength={MAX_MESSAGE_LENGTH}
              className="h-10"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" className="h-10" disabled={busy || !draft.trim()} aria-label="Send">
              <SendHorizontalIcon aria-hidden />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">The assistant can make mistakes. Check your bag before you pay.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
