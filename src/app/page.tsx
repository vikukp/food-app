import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="public" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:py-12">
        <p className="text-sm font-medium tracking-[0.18em] text-emerald-800 uppercase">
          HPE IWF Campus
        </p>
        <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
          Skip the afternoon food-court line.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Twenty stalls. Order from your desk, pick a pickup slot, pay with Pluxee, UPI, or card
          (mock), then show a QR token at the counter. The stall sees your items and cooks them
          before you walk over.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Order food</CardTitle>
              <CardDescription>
                For employees. Sign in with your mobile number, bag items, choose a time, pay,
                collect with QR.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/enter" className={cn(buttonVariants(), "h-10 w-full sm:w-auto")}>
                Continue as employee
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stall counter</CardTitle>
              <CardDescription>
                For stall staff. Open the kitchen queue, start preparing, mark ready for pickup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/vendor/login"
                className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full sm:w-auto")}
              >
                Open stall counter
              </Link>
            </CardContent>
          </Card>
        </div>

        <ol className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
          <li className="rounded-xl border bg-card p-4">
            <p className="font-semibold">1. Order</p>
            <p className="mt-1 text-muted-foreground">
              Pick a stall and items. One stall per bag, same as a real counter order.
            </p>
          </li>
          <li className="rounded-xl border bg-card p-4">
            <p className="font-semibold">2. Slot and pay</p>
            <p className="mt-1 text-muted-foreground">
              15-minute pickup windows while the stall is open; a few counters run 24x7. Mock
              Pluxee, UPI, or card.
            </p>
          </li>
          <li className="rounded-xl border bg-card p-4">
            <p className="font-semibold">3. Show token</p>
            <p className="mt-1 text-muted-foreground">
              When status flips to ready, walk up with IWF-xxxx. No standing in the order line.
            </p>
          </li>
        </ol>
      </main>
    </div>
  );
}
