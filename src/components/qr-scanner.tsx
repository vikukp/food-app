"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ticketTextIn } from "@/lib/qr-format";

// Chrome on Android, macOS and ChromeOS ships a native QR reader. Everywhere
// else (Safari on an iPad, Firefox, Chrome on Windows) the camera frames are
// read with jsQR, loaded only once the camera is opened. The camera itself
// needs HTTPS (or localhost); without it the counter types the token instead.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = (new (options: { formats: string[] }) => Detector) & {
  getSupportedFormats?: () => Promise<string[]>;
};

// Frames are scaled down to this many pixels on the longer side before jsQR
// reads them: a ticket held up to the camera fills much of the frame.
const MAX_SIDE = 720;

function detectorClass(): DetectorClass | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector
    : null;
}

// A scanner gun (USB or Bluetooth, set up as a keyboard) types what it reads
// far faster than anyone types, then usually Enter or Tab. This picks such a
// burst up wherever the focus is (on a button just tapped, or nowhere) and
// keeps its Enter from pressing that button. Text fields take what is typed
// into them themselves (the Find box reads a ticket typed into it).
const GUN_GAP_MS = 100; // longest pause between a gun's keys
const GUN_MIN_CHARS = 8; // shorter than this is someone typing
const GUN_IDLE_MS = 200; // for guns that send nothing after the code

export function useScannerGun(onRead: (text: string) => void) {
  useEffect(() => {
    let typed = "";
    let last = 0;
    let readAt = -Infinity;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const read = (at: number) => {
      readAt = at;
      onRead(typed);
      typed = "";
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as Element | null)?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const end = event.key === "Enter" || event.key === "Tab";
      // Shift and the like come with capitals and "|": not a break in the burst.
      if (!end && event.key.length !== 1) return;
      // One clock for the gaps and for when a code was read.
      const now = performance.now();
      const gap = now - last;
      last = now;
      clearTimeout(idle);
      if (end) {
        if (typed.length >= GUN_MIN_CHARS && gap <= GUN_IDLE_MS) {
          event.preventDefault();
          read(now);
        } else if (now - readAt < 1000) {
          // The Enter after a code already read once the typing stopped.
          event.preventDefault();
        }
        typed = "";
        return;
      }
      if (gap > GUN_GAP_MS) typed = "";
      typed += event.key;
      idle = setTimeout(() => {
        if (ticketTextIn(typed)) read(performance.now());
        typed = "";
      }, GUN_IDLE_MS);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(idle);
    };
  }, [onRead]);
}

export function useCanScan() {
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    // Feature detection has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);
  return canScan;
}

// What a QR code in the video's current frame says, or null.
type Reader = (video: HTMLVideoElement) => Promise<string | null>;

async function qrReader(): Promise<Reader> {
  const Detector = detectorClass();
  const native = Detector && (await Detector.getSupportedFormats?.().catch((): string[] => []))?.includes("qr_code");
  if (Detector && native) {
    const detector = new Detector({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue || null;
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

export function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    (async () => {
      try {
        // The reader first: if it cannot load, the camera is never turned on.
        const read = await qrReader();
        const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        // Closed while the camera was still opening: turn it straight off again.
        if (stopped || !video.current) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const value = await read(video.current);
          if (value) {
            onResult(value);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        if (!stopped) setError("Could not open the camera. Allow camera access, or type the token instead.");
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onResult]);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Point the camera at the ticket QR</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : (
        <video ref={video} muted playsInline className="mt-2 aspect-square w-full max-w-xs rounded-lg bg-black object-cover" />
      )}
    </div>
  );
}
