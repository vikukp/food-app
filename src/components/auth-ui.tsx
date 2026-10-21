import { cn } from "@/lib/utils";

export const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      {children}
    </p>
  );
}

export function DemoSmsBanner({
  title = "Demo SMS mode",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <p className="font-medium">{title}</p>
      <div className="mt-0.5 text-amber-900/90">{children}</div>
    </div>
  );
}

export const linkClass = "font-medium text-emerald-800 underline-offset-4 hover:underline";

export function PhoneField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor="phone" className="text-sm font-medium">
        Mobile number
      </label>
      <div className="flex">
        <span className="inline-flex h-10 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
          +91
        </span>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          maxLength={16}
          pattern="[0-9 +\-]{10,16}"
          title="10-digit mobile number"
          placeholder="98450 12345"
          defaultValue={defaultValue}
          className={cn(fieldClass, "rounded-l-none")}
        />
      </div>
    </div>
  );
}

export function PinField({
  id,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  hint?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        required
        pattern="[0-9]{4,6}"
        minLength={4}
        maxLength={6}
        title="4 to 6 digits"
        className={cn(fieldClass, "tracking-[0.3em]")}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
