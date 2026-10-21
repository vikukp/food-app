import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { loginVendor } from "@/lib/actions";
import { VENDOR_LOGIN_ERRORS, loginError } from "@/lib/auth-errors";
import { demoVendorPin } from "@/lib/demo";
import { demoMode } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

export const metadata = { title: "Stall sign-in" };

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function VendorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getVendorSession();
  if (session) redirect("/vendor");
  const { error: code } = await searchParams;
  const error = loginError(VENDOR_LOGIN_ERRORS, code);
  const demoPin = demoMode() ? demoVendorPin() : null;
  const stalls = await prisma.stall.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="public" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Stall counter</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to see incoming orders for your stall and mark them ready.
        </p>
        <div className="mt-6 rounded-xl border bg-card p-4">
          <form action={loginVendor} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="stallId" className="text-sm font-medium">
                Stall
              </label>
              <select id="stallId" name="stallId" required defaultValue="dosa" className={fieldClass}>
                {stalls.map((stall) => (
                  <option key={stall.id} value={stall.id}>
                    {stall.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="pin" className="text-sm font-medium">
                Counter PIN
              </label>
              <input
                id="pin"
                name="pin"
                required
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{4,8}"
                maxLength={8}
                defaultValue={demoPin ?? undefined}
                className={fieldClass}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button type="submit" className={cn(buttonVariants(), "h-10 w-full")}>
              Open kitchen queue
            </button>
            {demoPin ? (
              <p className="text-xs text-muted-foreground">Demo PIN for every stall is {demoPin}.</p>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  );
}
