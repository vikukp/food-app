"use client";

import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonVariants({ variant }), "h-10 w-full", className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
