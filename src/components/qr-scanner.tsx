"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Chrome on Android and desktop ship a native QR reader; others (Safari,
// Firefox) do not, and the counter types the token instead.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

function detectorClass(): DetectorClass | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector
    : null;
}

export function useCanScan() {
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    // Feature detection has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(Boolean(detectorClass() && navigator.mediaDevices?.getUserMedia));
  }, []);
  return canScan;
}

export function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Detector = detectorClass();
    if (!Detector) return;
    const detector = new Detector({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            onResult(codes[0].rawValue);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        setError("Could not open the camera. Allow camera access, or type the token instead.");
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
