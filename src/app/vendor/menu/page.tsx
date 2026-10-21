import { redirect } from "next/navigation";
import { CatalogueEditor } from "@/components/catalogue-editor";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { changeVendorPin } from "@/lib/catalogue-actions";
import { CATALOGUE_ERRORS, CATALOGUE_OK } from "@/lib/catalogue-messages";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/session";

export const metadata = { title: "Menu and prices" };

const field =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function VendorMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const stall = await prisma.stall.findUnique({
    where: { id: session.stallId },
    include: { items: { orderBy: [{ category: "asc" }, { name: "asc" }] } },
  });
  if (!stall) redirect("/vendor/login");

  const { ok, error } = await searchParams;
  const okMessage = ok ? CATALOGUE_OK[ok] ?? null : null;
  const errorMessage = error ? CATALOGUE_ERRORS[error] ?? null : null;
  const onSale = stall.items.filter((item) => !item.archived && item.available).length;
  const soldOut = stall.items.filter((item) => !item.archived && !item.available).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="vendor" stallName={stall.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Menu and prices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stall.name} · {onSale} on sale{soldOut ? `, ${soldOut} sold out` : ""}. Changes show to employees right away.
        </p>

        {okMessage ? (
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            {okMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6">
          <CatalogueEditor items={stall.items} />
        </div>

        <section className="mt-10 rounded-xl border bg-card p-4">
          <h2 className="font-medium">Counter PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every seeded stall starts with the demo PIN. Set your own so only your staff can open this queue.
          </p>
          <form action={changeVendorPin} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="currentPin">
                Current PIN
              </label>
              <input
                id="currentPin"
                name="currentPin"
                type="password"
                required
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                autoComplete="current-password"
                className={field}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="newPin">
                New PIN (4–8 digits)
              </label>
              <input
                id="newPin"
                name="newPin"
                type="password"
                required
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                autoComplete="new-password"
                className={field}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirmPin">
                Confirm new PIN
              </label>
              <input
                id="confirmPin"
                name="confirmPin"
                type="password"
                required
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                autoComplete="new-password"
                className={field}
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Change PIN
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
