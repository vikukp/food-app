import type Anthropic from "@anthropic-ai/sdk";
import type { Catalogue, CatalogueStall, Dish } from "@/lib/assistant/catalogue";
import { addBlocker, addToCart, cartCount, cartTotal, setLineQty, stallTotal, type CartLine, type CartState } from "@/lib/cart";
import { MAX_ITEMS_PER_ORDER, MAX_QTY_PER_LINE } from "@/lib/validation";

// The assistant's tools. They read the catalogue and change a copy of the
// person's bag with the same rules as the menu buttons; the page applies the
// changes afterwards. There is deliberately no tool to pay or place an order.

// One dish's new quantity in the bag (0: taken out).
export type BagChange = { stall: { id: string; name: string }; item: Omit<CartLine, "qty">; qty: number };

export type ToolContext = { catalogue: Catalogue; bag: CartState; changes: Map<string, BagChange> };

// What the model reads back, and a few words for the person while it works.
export type ToolOutcome = { status: string; content: string; isError?: boolean };

const SEARCH_LIMIT = 15;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_menu",
    description:
      "Search dishes across every stall. Call this whenever the person names a dish, ingredient, cuisine, craving or diet, before adding anything, to get item IDs, prices, diet tags and whether the stall is open now. Use English food words, as the menus are in English. Returns up to 15 dishes, best matches first; only stalls open now unless include_closed is set.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Words to find in dish names, descriptions, categories, stall names and cuisines, e.g. \"masala dosa\" or \"paneer\". Leave out to list dishes by the filters alone.",
        },
        veg: { type: "boolean", description: "Only vegetarian dishes." },
        jain: { type: "boolean", description: "Only dishes marked Jain (no onion, garlic or root vegetables)." },
        no_egg: { type: "boolean", description: "Leave out dishes with egg." },
        max_price: { type: "integer", description: "Highest price in rupees." },
        stall_id: { type: "string", description: "Only this stall's dishes." },
        include_closed: { type: "boolean", description: "Also show stalls that are closed or paused now. They cannot be ordered from now." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_stalls",
    description:
      "Every stall with its cuisine, whether it is open now, the current wait and its hours. Call this when the person asks what is open or quick, or names a stall you need the ID of.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_stall_menu",
    description: "Every dish one stall has, with item IDs, prices and diet tags. Call this when the person wants to choose from one stall's menu.",
    input_schema: {
      type: "object",
      properties: { stall_id: { type: "string", description: "A stall ID from list_stalls or search_menu." } },
      required: ["stall_id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_to_bag",
    description: `Add a dish to the person's bag, on top of any already there. Only use item IDs from search_menu or get_stall_menu. The stall must be open now. A bag holds up to 4 stalls, 15 different dishes and ${MAX_ITEMS_PER_ORDER} items per stall.`,
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        quantity: { type: "integer", description: `How many to add, 1 to ${MAX_QTY_PER_LINE}. Defaults to 1.` },
      },
      required: ["item_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_quantity",
    description:
      "Set how many of a dish is in the bag; 0 takes it out. Use this for changes like \"make it 3\" or \"remove the coffee\". Check view_bag first unless you have seen the bag since the person last wrote: they can change it themselves.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        quantity: { type: "integer", description: `The new number in the bag, 0 to ${MAX_QTY_PER_LINE}.` },
      },
      required: ["item_id", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "view_bag",
    description: "What is in the person's bag now, by stall, with item IDs, quantities and the total.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

type Input = Record<string, unknown>;

const ok = (status: string, value: unknown): ToolOutcome => ({ status, content: JSON.stringify(value) });
const fail = (status: string, error: string): ToolOutcome => ({ status, content: JSON.stringify({ error }), isError: true });

const STOP_WORDS = new Set(["and", "or", "the", "with", "for", "some", "something", "want", "like", "please", "get", "any", "me", "my", "of", "in", "on", "to", "dish", "food"]);

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// "dosas" finds "dosa", "juice" finds "juices"; short words must match whole.
function found(word: string, among: string[]) {
  return among.some(
    (other) => other === word || (Math.min(other.length, word.length) >= 3 && (other.startsWith(word) || word.startsWith(other))),
  );
}

function diet(dish: Dish) {
  if (dish.veg) return dish.jain ? "veg, Jain" : "veg";
  return dish.egg ? "egg" : "non-veg";
}

function stallStatus(stall: CatalogueStall) {
  if (stall.paused) return "paused: not taking orders now";
  if (stall.open) return stall.wait ? `open, ${stall.wait.toLowerCase()}` : "open";
  return stall.opensLaterToday ? `closed, opens at ${stall.openTime}` : `closed for today, opens at ${stall.openTime}`;
}

function dishView(dish: Dish, stall: CatalogueStall, withStall: boolean) {
  return {
    item_id: dish.id,
    dish: dish.name,
    ...(withStall ? { stall: stall.name, stall_id: stall.id, stall_status: stallStatus(stall) } : { category: dish.category }),
    price: dish.price,
    diet: diet(dish),
    allergens_listed: dish.allergens.length ? dish.allergens : "none listed",
    ...(dish.kcal ? { kcal: dish.kcal } : {}),
    about: dish.description.length > 90 ? `${dish.description.slice(0, 87)}...` : dish.description,
    ...(dish.available ? {} : { sold_out: true }),
  };
}

function findDish(catalogue: Catalogue, id: unknown) {
  if (typeof id !== "string") return null;
  for (const stall of catalogue.stalls) {
    const dish = stall.dishes.find((d) => d.id === id);
    if (dish) return { dish, stall };
  }
  return null;
}

function qtyInBag(bag: CartState, menuItemId: string) {
  for (const stall of bag.stalls) {
    const line = stall.items.find((l) => l.menuItemId === menuItemId);
    if (line) return line.qty;
  }
  return 0;
}

function stallItems(bag: CartState, stallId: string) {
  return bag.stalls.find((s) => s.id === stallId)?.items.reduce((sum, line) => sum + line.qty, 0) ?? 0;
}

// Why this dish cannot go in the bag now, or null.
function refusal(dish: Dish, stall: CatalogueStall) {
  if (!dish.available) return `${dish.name} is sold out at ${stall.name} right now.`;
  if (stall.paused) return `${stall.name} has paused new orders for a while.`;
  if (!stall.open) return `${stall.name} is ${stallStatus(stall)}.`;
  return null;
}

export function bagSummary(bag: CartState) {
  if (!bag.stalls.length) return { items: 0, total: 0, note: "The bag is empty." };
  return {
    stalls: bag.stalls.map((stall) => ({
      stall: stall.name,
      stall_id: stall.id,
      items: stall.items.map((line) => ({ item_id: line.menuItemId, dish: line.name, quantity: line.qty, price_each: line.priceInr })),
      subtotal: stallTotal(stall),
    })),
    items: cartCount(bag),
    total: cartTotal(bag),
  };
}

function int(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
}

function searchMenu(input: Input, { catalogue }: ToolContext): ToolOutcome {
  const status = "Searching the menus…";
  const query = typeof input.query === "string" ? words(input.query.slice(0, 200)) : [];
  const maxPrice = input.max_price === undefined ? null : int(input.max_price);
  const stallId = typeof input.stall_id === "string" ? input.stall_id : null;
  const includeClosed = input.include_closed === true;
  // own: some query word is in the dish's own name or description, not only its stall's.
  const hits: { dish: Dish; stall: CatalogueStall; score: number; own: boolean }[] = [];
  let closedHits = 0;
  for (const stall of catalogue.stalls) {
    if (stallId && stall.id !== stallId) continue;
    for (const dish of stall.dishes) {
      if (!dish.available) continue;
      if (input.veg === true && !dish.veg) continue;
      if (input.jain === true && !dish.jain) continue;
      if (input.no_egg === true && dish.egg) continue;
      if (maxPrice !== null && dish.price > maxPrice) continue;
      let score = 0;
      let own = !query.length;
      if (query.length) {
        const name = words(dish.name);
        const group = words(`${dish.category} ${stall.name} ${stall.cuisine}`);
        const about = words(dish.description);
        for (const word of query) {
          const points = found(word, name) ? 3 : found(word, group) ? 2 : found(word, about) ? 1 : 0;
          if (points === 3 || points === 1) own = true;
          score += points;
        }
        if (!score) continue;
      }
      if (!stall.open && !includeClosed) {
        closedHits += 1;
        continue;
      }
      hits.push({ dish, stall, score, own });
    }
  }
  // "masala dosa" should not bring back everything else at the Dosa Counter.
  if (hits.some((hit) => hit.own)) hits.splice(0, hits.length, ...hits.filter((hit) => hit.own));
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.stall.open) - Number(a.stall.open) ||
      a.dish.name.length - b.dish.name.length ||
      a.dish.price - b.dish.price,
  );
  return ok(status, {
    dishes: hits.slice(0, SEARCH_LIMIT).map((hit) => dishView(hit.dish, hit.stall, true)),
    ...(hits.length > SEARCH_LIMIT ? { more: hits.length - SEARCH_LIMIT } : {}),
    ...(closedHits ? { note: `${closedHits} more at stalls that are closed or paused now.` } : {}),
    ...(!hits.length && !closedHits ? { note: "Nothing matched. Try other words or fewer filters, or list_stalls." } : {}),
  });
}

function listStalls(_: Input, { catalogue }: ToolContext): ToolOutcome {
  return ok(
    "Checking which stalls are open…",
    catalogue.stalls.map((stall) => ({
      stall_id: stall.id,
      stall: stall.name,
      cuisine: stall.cuisine,
      location: stall.location,
      status: stallStatus(stall),
      hours: stall.hours,
      ...(stall.vegOnly ? { veg_only: true } : {}),
    })),
  );
}

function stallMenu(input: Input, { catalogue }: ToolContext): ToolOutcome {
  const stall = catalogue.stalls.find((s) => s.id === input.stall_id);
  if (!stall) return fail("Reading a menu…", "No stall has that stall_id. Use list_stalls to find it.");
  return ok(`Reading the ${stall.name} menu…`, {
    stall: stall.name,
    stall_id: stall.id,
    status: stallStatus(stall),
    dishes: stall.dishes.map((dish) => dishView(dish, stall, false)),
  });
}

function record(ctx: ToolContext, stall: { id: string; name: string }, item: Omit<CartLine, "qty">) {
  ctx.changes.set(item.menuItemId, { stall, item, qty: qtyInBag(ctx.bag, item.menuItemId) });
}

function addDish(input: Input, ctx: ToolContext): ToolOutcome {
  const hit = findDish(ctx.catalogue, input.item_id);
  if (!hit) return fail("Adding to your bag…", "No dish has that item_id. Use search_menu or get_stall_menu to find it.");
  const { dish, stall } = hit;
  const status = `Adding ${dish.name}…`;
  const quantity = input.quantity === undefined ? 1 : int(input.quantity);
  if (quantity === null || quantity < 1) return fail(status, "quantity must be a whole number from 1.");
  const refused = refusal(dish, stall);
  if (refused) return fail(status, refused);
  const blocked = addBlocker(ctx.bag, stall.id, dish.id);
  if (blocked) return fail(status, blocked);
  const before = qtyInBag(ctx.bag, dish.id);
  const adding = Math.min(quantity, MAX_QTY_PER_LINE - before);
  if (adding < 1) return fail(status, `The bag already has the most of one dish: ${MAX_QTY_PER_LINE}.`);
  if (stallItems(ctx.bag, stall.id) + adding > MAX_ITEMS_PER_ORDER) {
    return fail(status, `One stall's order can have up to ${MAX_ITEMS_PER_ORDER} items; the bag already has ${stallItems(ctx.bag, stall.id)} from ${stall.name}.`);
  }
  const line = { menuItemId: dish.id, name: dish.name, priceInr: dish.price, veg: dish.veg };
  for (let i = 0; i < adding; i += 1) ctx.bag = addToCart(ctx.bag, { id: stall.id, name: stall.name }, line);
  record(ctx, { id: stall.id, name: stall.name }, line);
  return ok(status, {
    added: adding,
    dish: dish.name,
    stall: stall.name,
    now_in_bag: qtyInBag(ctx.bag, dish.id),
    ...(adding < quantity ? { note: `Most of one dish in a bag is ${MAX_QTY_PER_LINE}.` } : {}),
    bag: bagSummary(ctx.bag),
  });
}

function setQuantity(input: Input, ctx: ToolContext): ToolOutcome {
  const quantity = int(input.quantity);
  const id = typeof input.item_id === "string" ? input.item_id : "";
  const before = qtyInBag(ctx.bag, id);
  // Something in the bag can always come out, even if its stall has since changed the menu.
  if (quantity === 0 && before > 0) {
    const stall = ctx.bag.stalls.find((s) => s.items.some((l) => l.menuItemId === id))!;
    const line = stall.items.find((l) => l.menuItemId === id)!;
    ctx.bag = setLineQty(ctx.bag, id, 0);
    record(ctx, { id: stall.id, name: stall.name }, { menuItemId: id, name: line.name, priceInr: line.priceInr, veg: line.veg });
    return ok(`Taking out ${line.name}…`, { removed: line.name, bag: bagSummary(ctx.bag) });
  }
  const hit = findDish(ctx.catalogue, id);
  if (!hit) return fail("Updating your bag…", "No dish has that item_id. Use view_bag or search_menu to find it.");
  const { dish, stall } = hit;
  const status = `Updating ${dish.name}…`;
  if (quantity === null || quantity < 0) return fail(status, "quantity must be a whole number from 0.");
  if (quantity === 0) return ok(status, { note: `${dish.name} is not in the bag.`, bag: bagSummary(ctx.bag) });
  const wanted = Math.min(quantity, MAX_QTY_PER_LINE);
  if (before === 0) {
    const refused = refusal(dish, stall);
    if (refused) return fail(status, refused);
    const blocked = addBlocker(ctx.bag, stall.id, dish.id);
    if (blocked) return fail(status, blocked);
  }
  if (stallItems(ctx.bag, stall.id) - before + wanted > MAX_ITEMS_PER_ORDER) {
    return fail(status, `One stall's order can have up to ${MAX_ITEMS_PER_ORDER} items.`);
  }
  const line = { menuItemId: dish.id, name: dish.name, priceInr: dish.price, veg: dish.veg };
  if (before === 0) ctx.bag = addToCart(ctx.bag, { id: stall.id, name: stall.name }, line);
  ctx.bag = setLineQty(ctx.bag, dish.id, wanted);
  record(ctx, { id: stall.id, name: stall.name }, line);
  return ok(status, {
    dish: dish.name,
    now_in_bag: wanted,
    ...(wanted < quantity ? { note: `Most of one dish in a bag is ${MAX_QTY_PER_LINE}.` } : {}),
    bag: bagSummary(ctx.bag),
  });
}

const RUNNERS: Record<string, (input: Input, ctx: ToolContext) => ToolOutcome> = {
  search_menu: searchMenu,
  list_stalls: listStalls,
  get_stall_menu: stallMenu,
  add_to_bag: addDish,
  set_quantity: setQuantity,
  view_bag: (_, ctx) => ok("Checking your bag…", bagSummary(ctx.bag)),
};

export function runTool(name: string, input: unknown, ctx: ToolContext): ToolOutcome {
  const run = Object.hasOwn(RUNNERS, name) ? RUNNERS[name] : null;
  if (!run) return fail("Working…", `There is no tool called ${name}.`);
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Input) : {};
  return run(args, ctx);
}
