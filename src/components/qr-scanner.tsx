"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

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
