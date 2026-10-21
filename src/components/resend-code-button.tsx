"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The countdown is a courtesy; the server enforces the same cooldown.
export function ResendCodeButton({ waitSeconds }: { waitSeconds: number }) {
  const [secondsLeft, setSecondsLeft] = useState(waitSeconds);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const waiting = secondsLeft > 0;
  return (
    <button
      type="submit"
      disabled={waiting || pending}
      className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}
    >
      {pending ? "Sending…" : waiting ? `Resend code in ${secondsLeft}s` : "Resend code"}
    </button>
  );
}
