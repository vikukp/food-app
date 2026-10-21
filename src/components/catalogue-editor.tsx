import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  createMenuItem,
  setItemArchived,
  setItemAvailability,
  updateMenuItem,
} from "@/lib/catalogue-actions";
import { formatInr } from "@/lib/money";
import { hasOffer, offerPercent } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type CatalogueItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  priceInr: number;
  offerPriceInr: number | null;
  offerLabel: string | null;
  veg: boolean;
  available: boolean;
  archived: boolean;
};

const field =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const label = "text-xs font-medium text-muted-foreground";

function ItemFields({ item, categories }: { item?: CatalogueItem; categories: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label className={label} htmlFor={`${item?.id ?? "new"}-name`}>
          Name
        </label>
        <input
          id={`${item?.id ?? "new"}-name`}
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={item?.name}
          className={field}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label className={label} htmlFor={`${item?.id ?? "new"}-description`}>
          Description
        </label>
        <input
          id={`${item?.id ?? "new"}-description`}
          name="description"
          maxLength={160}
          defaultValue={item?.description}
          placeholder="What is in it, portion size"
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label className={label} htmlFor={`${item?.id ?? "new"}-category`}>
          Category
        </label>
        <input
          id={`${item?.id ?? "new"}-category`}
          name="category"
          required
          minLength={2}
          maxLength={30}
          defaultValue={item?.category}
          list="catalogue-categories"
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label className={label} htmlFor={`${item?.id ?? "new"}-price`}>
          Price (₹)
        </label>
        <input
          id={`${item?.id ?? "new"}-price`}
          name="priceInr"
          type="number"
          required
          min={1}
          max={5000}
          step={1}
          inputMode="numeric"
          defaultValue={item?.priceInr}
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label className={label} htmlFor={`${item?.id ?? "new"}-offer`}>
          Offer price (₹, optional)
        </label>
        <input
          id={`${item?.id ?? "new"}-offer`}
          name="offerPriceInr"
          type="number"
          min={1}
          max={5000}
          step={1}
          inputMode="numeric"
          defaultValue={item?.offerPriceInr ?? ""}
          placeholder="Leave blank for no offer"
          className={field}
        />
      </div>
      <div className="space-y-1">
        <label className={label} htmlFor={`${item?.id ?? "new"}-offer-label`}>
          Offer label
        </label>
        <input
          id={`${item?.id ?? "new"}-offer-label`}
          name="offerLabel"
          maxLength={40}
          defaultValue={item?.offerLabel ?? ""}
          placeholder="Lunch combo, Happy hour…"
          className={field}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="veg" defaultChecked={item ? item.veg : true} className="size-4 accent-emerald-700" />
        Vegetarian
      </label>
      {categories.length ? (
        <datalist id="catalogue-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function ItemCard({ item, categories }: { item: CatalogueItem; categories: string[] }) {
  return (
    <li className={cn("rounded-xl border bg-card p-4", item.archived && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <VegDot veg={item.veg} />
            <span className="truncate">{item.name}</span>
          </p>
          <p className="mt-1 text-sm">
            {hasOffer(item) ? (
              <>
                <span className="font-semibold">{formatInr(item.offerPriceInr as number)}</span>{" "}
                <span className="text-muted-foreground line-through">{formatInr(item.priceInr)}</span>{" "}
                <span className="text-xs font-medium text-emerald-800">
                  {item.offerLabel ? `${item.offerLabel} · ` : ""}−{offerPercent(item)}%
                </span>
              </>
            ) : (
              <span className="font-semibold">{formatInr(item.priceInr)}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.archived ? <Badge variant="secondary">Hidden</Badge> : null}
          {!item.available ? <Badge variant="destructive">Sold out</Badge> : null}
          {item.available && !item.archived ? <Badge variant="outline">On sale</Badge> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={setItemAvailability}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="available" value={item.available ? "0" : "1"} />
          <button
            type="submit"
            className={buttonVariants({ variant: item.available ? "outline" : "default", size: "sm" })}
          >
            {item.available ? "Mark sold out" : "Back on sale"}
          </button>
        </form>
        <form action={setItemArchived}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="archived" value={item.archived ? "0" : "1"} />
          <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {item.archived ? "Show on menu" : "Hide from menu"}
          </button>
        </form>
      </div>

      <details className="mt-3 rounded-lg border border-dashed">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Edit price, details, or offer</summary>
        <form action={updateMenuItem} className="space-y-3 border-t p-3">
          <input type="hidden" name="itemId" value={item.id} />
          <ItemFields item={item} categories={categories} />
          <div className="flex justify-end">
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Save changes
            </button>
          </div>
        </form>
      </details>
    </li>
  );
}

export function CatalogueEditor({ items }: { items: CatalogueItem[] }) {
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const live = items.filter((item) => !item.archived);
  const hidden = items.filter((item) => item.archived);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-medium">Add an item</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New items go live immediately. Employees browsing your stall see them on their next refresh.
        </p>
        <form action={createMenuItem} className="mt-3 space-y-3">
          <ItemFields categories={categories} />
          <div className="flex justify-end">
            <button type="submit" className={buttonVariants()}>
              Add to menu
            </button>
          </div>
        </form>
      </section>

      {categories
        .filter((category) => live.some((item) => item.category === category))
        .map((category) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {category}
            </h2>
            <ul className="space-y-3">
              {live
                .filter((item) => item.category === category)
                .map((item) => (
                  <ItemCard key={item.id} item={item} categories={categories} />
                ))}
            </ul>
          </section>
        ))}

      {hidden.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Hidden from menu
          </h2>
          <ul className="space-y-3">
            {hidden.map((item) => (
              <ItemCard key={item.id} item={item} categories={categories} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
