"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chime, soundIsOn, turnOnSound } from "@/lib/ready-alert";

// What a stall's tablet needs from the counter page: a screen that stays on,
// sound that is on, and an app to install. Each is best effort and needs
// HTTPS (or localhost), as the camera does.

// Keeps the screen on while the counter is showing, taking the lock again when
// the page comes back into view (the browser lets it go when it is hidden).
export function useScreenAwake() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let asking = false;
    let gone = false;
    const keepAwake = async () => {
      if (gone || lock || asking || document.visibilityState !== "visible") return;
      asking = true;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => {
          lock = null;
        });
        if (gone) await lock.release();
      } catch {
        // Refused (battery saver, or the browser wants a tap first): try again on the next tap.
      } finally {
        asking = false;
      }
    };
    void keepAwake();
    document.addEventListener("visibilitychange", keepAwake);
    document.addEventListener("pointerup", keepAwake);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", keepAwake);
      document.removeEventListener("pointerup", keepAwake);
      void lock?.release();
    };
  }, []);
}

// Browsers keep sound off until the page has been touched. Any tap turns it
// on; until then this asks for one, as the counter's alerts are sounds.
export function SoundPrompt() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const check = () => setOn(soundIsOn());
    const onTap = () => {
      if (!soundIsOn()) void turnOnSound().then(check);
    };
    check();
    document.addEventListener("pointerup", onTap);
    // The tablet can take sound away again (another app, the screen locking).
    const timer = setInterval(check, 5000);
    return () => {
      document.removeEventListener("pointerup", onTap);
      clearInterval(timer);
    };
  }, []);
  if (on) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p>Sound is off. Turn it on to hear when an order is due to start.</p>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          if (await turnOnSound()) chime();
          setOn(soundIsOn());
        }}
      >
        <BellRing aria-hidden />
        Turn on sound
      </Button>
    </div>
  );
}

// Chrome and Edge offer to install a page as an app (here, the counter's own
// manifest): this puts that offer on the page. Safari installs from Share >
// Add to Home Screen instead, so there it shows nothing.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallCounterApp() {
  const [offer, setOffer] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const offered = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallPrompt);
    };
    const installed = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!offer) return null;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        await offer.prompt();
        await offer.userChoice;
        // An offer can be used once.
        setOffer(null);
      }}
    >
      Install as an app
    </Button>
  );
}
