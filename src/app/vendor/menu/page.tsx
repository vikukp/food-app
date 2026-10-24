import { redirect } from "next/navigation";
import { CatalogueEditor } from "@/components/catalogue-editor";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import {
  changeVendorPin,
  setStallPaused,
  updateStallCapacity,
  updateStallGstin,
  updateStallHours,
} from "@/lib/catalogue-actions";
import { crossesMidnight, hoursLabel, isAllDay } from "@/lib/hours";
import { CATALOGUE_ERRORS, CATALOGUE_OK } from "@/lib/catalogue-messages";
import { prisma } from "@/lib/prisma";
import { ratingCopy, recentFeedback, stallRatings } from "@/lib/ratings";
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

  const [feedback, ratings] = await Promise.all([recentFeedback(stall.id), stallRatings([stall.id])]);
  const rating = ratings.get(stall.id);
  const { ok, error } = await searchParams;
  const okMessage = ok ? CATALOGUE_OK[ok] ?? null : null;
  const errorMessage = error ? CATALOGUE_ERRORS[error] ?? null : null;
  const onSale = stall.items.filter((item) => !item.archived && item.available).length;
  const soldOut = stall.items.filter((item) => !item.archived && !item.available).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="vendor" stallName={stall.name} current="menu" />
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
          <h2 className="font-medium">Feedback</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {rating
              ? `Last 30 days: ${rating.average.toFixed(1)} out of 5 from ${rating.count} ratings. ${
                  ratingCopy(rating) ? "Employees see it on your stall." : "Employees see it once 5 people have rated."
                }`
              : "No ratings yet. Employees can rate an order after collecting it."}
          </p>
          {feedback.length ? (
            <ul className="mt-3 divide-y text-sm">
              {feedback.map((f) => (
                <li key={`${f.token}-${f.ratedAt?.toISOString()}`} className="flex gap-3 py-2">
                  <span className={`w-14 shrink-0 font-medium ${(f.rating ?? 0) <= 2 ? "text-destructive" : ""}`}>
                    {"★".repeat(f.rating ?? 0)}
                  </span>
                  <span className="min-w-0 flex-1">{f.ratingComment ?? <span className="text-muted-foreground">No comment</span>}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{f.token}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section id="counter-hours" className="mt-6 scroll-mt-20 rounded-xl border bg-card p-4">
          <h2 className="font-medium">Counter hours</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Now {hoursLabel(stall.openTime, stall.closeTime)} (IST)
            {crossesMidnight(stall.openTime, stall.closeTime) ? ", past midnight" : ""}. Employees can book pickup
            slots inside these hours. A closing time earlier than the opening time runs past midnight.
          </p>
          <form action={updateStallHours} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="openTime">
                Opens
              </label>
              <input id="openTime" name="openTime" type="time" defaultValue={stall.openTime} className={field} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="closeTime">
                Closes
              </label>
              <input id="closeTime" name="closeTime" type="time" defaultValue={stall.closeTime} className={field} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                name="allDay"
                value="1"
                defaultChecked={isAllDay(stall.openTime, stall.closeTime)}
                className="size-4"
              />
              Open 24 hours
            </label>
            <div className="sm:col-span-3 flex justify-end">
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Save hours
              </button>
            </div>
          </form>
          <form action={updateStallCapacity} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="slotCapacity">
                Orders per 15-minute slot
              </label>
              <input
                id="slotCapacity"
                name="slotCapacity"
                type="number"
                min={1}
                max={100}
                defaultValue={stall.slotCapacity}
                className={field}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="prepMinutes">
                Usual prep time (minutes)
              </label>
              <input
                id="prepMinutes"
                name="prepMinutes"
                type="number"
                min={2}
                max={90}
                defaultValue={stall.prepMinutes}
                className={field}
              />
            </div>
            <div className="flex items-end justify-end">
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Save
              </button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              A full slot is not offered at checkout, so orders do not pile up at one time. The wait shown to
              employees, and the earliest pickup slot, grow with your queue: about one prep time per three
              orders waiting.
            </p>
          </form>
          <form action={setStallPaused} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm">
              {stall.paused
                ? "New orders are paused. Employees see the stall as paused."
                : "Too busy, or out of something? Pause new orders for a while."}
            </p>
            <input type="hidden" name="paused" value={stall.paused ? "0" : "1"} />
            <button type="submit" className={buttonVariants({ variant: stall.paused ? "default" : "outline" })}>
              {stall.paused ? "Resume orders" : "Pause new orders"}
            </button>
          </form>
        </section>

        <section id="gstin" className="mt-6 scroll-mt-20 rounded-xl border bg-card p-4">
          <h2 className="font-medium">GSTIN for receipts</h2>
          <form action={updateStallGstin} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="gstin">
                GSTIN (leave empty if you do not have one)
              </label>
              <input
                id="gstin"
                name="gstin"
                maxLength={15}
                defaultValue={stall.gstin ?? ""}
                placeholder="29ABCDE1234F1Z5"
                className={`${field} font-mono uppercase`}
              />
            </div>
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Save
            </button>
          </form>
        </section>

        <section id="counter-pin" className="mt-6 scroll-mt-20 rounded-xl border bg-card p-4">
          <h2 className="font-medium">Counter PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your own PIN so only your staff can open this queue. Changing it signs out every other tablet.
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
