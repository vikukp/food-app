import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_STEPS, requestParams, runAssistant, toMessages, type CallModel } from "@/lib/assistant/agent";
import type { Catalogue, CatalogueStall, Dish } from "@/lib/assistant/catalogue";
import { assistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { runTool, type ToolContext } from "@/lib/assistant/tools";
import { EMPTY_CART, addToCart, type CartState } from "@/lib/cart";

function dish(stallId: string, slug: string, name: string, price: number, extra: Partial<Dish> = {}): Dish {
  return {
    id: `${stallId}-${slug}`,
    stallId,
    name,
    description: "",
    category: "Mains",
    price,
    veg: true,
    egg: false,
    jain: false,
    allergens: [],
    kcal: null,
    available: true,
    ...extra,
  };
}

function stall(id: string, name: string, dishes: Dish[], extra: Partial<CatalogueStall> = {}): CatalogueStall {
  return {
    id,
    name,
    cuisine: "Indian",
    location: "Wing A",
    vegOnly: false,
    open: true,
    paused: false,
    openTime: "07:30",
    opensLaterToday: false,
    hours: "07:30–22:00",
    wait: "Short wait · ~10 min",
    dishes,
    ...extra,
  };
}

const catalogue: Catalogue = {
  stalls: [
    stall("dosa", "Dosa Counter", [
      dish("dosa", "masala-dosa", "Masala dosa", 90, { description: "Potato masala, coconut chutney" }),
      dish("dosa", "mysore-masala-dosa", "Mysore masala dosa", 110),
      dish("dosa", "filter-coffee", "Filter coffee", 35, { category: "Drinks" }),
      dish("dosa", "ghee-roast", "Ghee roast", 100, { available: false }),
    ]),
    stall("biryani", "Biryani House", [dish("biryani", "chicken", "Chicken biryani", 180, { veg: false })], {
      open: false,
      opensLaterToday: true,
      openTime: "12:00",
      wait: null,
    }),
    stall("rolls", "Roll Corner", [
      dish("rolls", "egg-roll", "Egg roll", 70, { veg: false, egg: true }),
      dish("rolls", "paneer-roll", "Paneer roll", 90, { jain: true, allergens: ["Milk"] }),
    ]),
    stall("juice", "Juice Bar", [dish("juice", "mango", "Mango smoothie", 90, { category: "Juices" })], { paused: true, open: false }),
  ],
};

const ctx = (bag: CartState = EMPTY_CART): ToolContext => ({ catalogue, bag, changes: new Map() });
const json = (content: string) => JSON.parse(content);

describe("assistant settings", () => {
  it("are off without a key, and default to Claude Opus 5.5 on Anthropic", () => {
    assert.equal(assistantConfig({}), null);
    const config = assistantConfig({ AI_API_KEY: "sk-test" })!;
    assert.equal(config.router, "anthropic");
    assert.equal(config.model, "claude-opus-5-5");
    assert.equal(config.apiKey, "sk-test");
    assert.equal(config.authToken, null);
    assert.equal(config.baseURL, undefined);
    assert.equal(config.claudeFeatures, true);
    assert.equal(config.effort, "low");
    assert.equal(config.dailyLimit, 30);
  });

  it("fill in each router's address and how it takes the key", () => {
    const openrouter = assistantConfig({ AI_API_KEY: "or", AI_ROUTER: "openrouter", AI_MODEL: "anthropic/claude-sonnet" })!;
    assert.equal(openrouter.baseURL, "https://openrouter.ai/api");
    assert.equal(openrouter.authToken, "or");
    assert.equal(openrouter.apiKey, null);
    assert.equal(openrouter.claudeFeatures, false);
    assert.equal(assistantConfig({ AI_API_KEY: "v", AI_ROUTER: "VERCEL", AI_MODEL: "m" })!.baseURL, "https://ai-gateway.vercel.sh");
    const portkey = assistantConfig({ AI_API_KEY: "pk", AI_ROUTER: "portkey", AI_MODEL: "@anthropic/claude" })!;
    assert.equal(portkey.headers["x-portkey-api-key"], "pk");
    assert.equal(portkey.apiKey, "pk");
    const cloudflare = assistantConfig({
      AI_API_KEY: "sk",
      AI_ROUTER: "cloudflare",
      AI_BASE_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic",
      AI_HEADERS: '{"cf-aig-authorization": "Bearer gw"}',
      AI_CLAUDE_FEATURES: "on",
    })!;
    assert.equal(cloudflare.model, "claude-opus-5-5");
    assert.equal(cloudflare.headers["cf-aig-authorization"], "Bearer gw");
    // The key goes in x-api-key alone, as Cloudflare documents it.
    assert.equal(cloudflare.headers["x-api-key"], "sk");
    assert.equal(cloudflare.headers.authorization, null);
    assert.equal(cloudflare.claudeFeatures, true);
  });

  it("refuse settings that cannot work, naming them in the log", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "nope" }), null);
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "litellm", AI_MODEL: "m" }), null);
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "openrouter" }), null);
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "custom", AI_BASE_URL: "ftp://x", AI_MODEL: "m" }), null);
    const odd = assistantConfig({ AI_API_KEY: "k", AI_HEADERS: "[1]", AI_EFFORT: "turbo", AI_DAILY_LIMIT: "-4" })!;
    assert.deepEqual(odd.headers, {});
    assert.equal(odd.effort, "low");
    assert.equal(odd.dailyLimit, 30);
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_EFFORT: "off" })!.effort, null);
    assert.equal(warn.mock.callCount(), 6);
  });
});

describe("assistant tools", () => {
  it("find dishes by name, plural or not, best match first, open stalls only", () => {
    const result = json(runTool("search_menu", { query: "masala dosas" }, ctx()).content);
    assert.deepEqual(
      result.dishes.map((d: { dish: string }) => d.dish),
      ["Masala dosa", "Mysore masala dosa"],
    );
    assert.equal(result.dishes[0].item_id, "dosa-masala-dosa");
    assert.equal(result.dishes[0].stall_status, "open, short wait · ~10 min");
    const biryani = json(runTool("search_menu", { query: "biryani" }, ctx()).content);
    assert.deepEqual(biryani.dishes, []);
    assert.match(biryani.note, /1 more at stalls that are closed or paused/);
    const anyTime = json(runTool("search_menu", { query: "biryani", include_closed: true }, ctx()).content);
    assert.equal(anyTime.dishes[0].stall_status, "closed, opens at 12:00");
  });

  it("filter by diet and price, and leave sold-out dishes out", () => {
    const names = (input: object) => json(runTool("search_menu", input, ctx()).content).dishes.map((d: { dish: string }) => d.dish);
    assert.deepEqual(names({ jain: true }), ["Paneer roll"]);
    assert.ok(!names({ no_egg: true }).includes("Egg roll"));
    assert.ok(names({ max_price: 80 }).every((name: string) => ["Filter coffee", "Egg roll"].includes(name)));
    assert.ok(!names({ query: "ghee" }).includes("Ghee roast"));
    const roll = json(runTool("search_menu", { query: "paneer" }, ctx()).content).dishes[0];
    assert.equal(roll.diet, "veg, Jain");
    assert.deepEqual(roll.allergens_listed, ["Milk"]);
  });

  it("add dishes the way the menu buttons do, and record the new quantity", () => {
    const c = ctx();
    const added = runTool("add_to_bag", { item_id: "dosa-masala-dosa", quantity: 2 }, c);
    assert.equal(added.status, "Adding Masala dosa…");
    assert.equal(json(added.content).now_in_bag, 2);
    runTool("add_to_bag", { item_id: "dosa-masala-dosa" }, c);
    runTool("add_to_bag", { item_id: "rolls-paneer-roll" }, c);
    assert.deepEqual(
      [...c.changes.values()].map((change) => [change.item.name, change.qty, change.stall.name]),
      [
        ["Masala dosa", 3, "Dosa Counter"],
        ["Paneer roll", 1, "Roll Corner"],
      ],
    );
    assert.equal(c.bag.stalls[0].items[0].priceInr, 90);
    assert.equal(json(runTool("view_bag", {}, c).content).total, 360);
  });

  it("refuse closed, paused and sold-out stalls, unknown dishes and full bags", () => {
    const error = (name: string, input: object, c = ctx()) => {
      const outcome = runTool(name, input, c);
      assert.equal(outcome.isError, true, JSON.stringify(input));
      return json(outcome.content).error as string;
    };
    assert.match(error("add_to_bag", { item_id: "biryani-chicken" }), /closed, opens at 12:00/);
    assert.match(error("add_to_bag", { item_id: "juice-mango" }), /paused/);
    assert.match(error("add_to_bag", { item_id: "dosa-ghee-roast" }), /sold out/);
    assert.match(error("add_to_bag", { item_id: "made-up" }), /search_menu/);
    assert.match(error("add_to_bag", { item_id: "dosa-masala-dosa", quantity: 0 }), /from 1/);
    let full = EMPTY_CART;
    for (const id of ["a1", "b1", "c1", "d1"]) full = addToCart(full, { id, name: id }, { menuItemId: `${id}-x`, name: "x", priceInr: 1, veg: true });
    assert.match(error("add_to_bag", { item_id: "dosa-masala-dosa" }, ctx(full)), /4 stalls/);
    const crowded = ctx();
    runTool("add_to_bag", { item_id: "dosa-masala-dosa", quantity: 20 }, crowded);
    assert.match(error("add_to_bag", { item_id: "dosa-filter-coffee", quantity: 11 }, crowded), /up to 30 items/);
    assert.match(error("whatever", {}), /no tool/);
  });

  it("set quantities, take dishes out, and cap at 20", () => {
    const c = ctx();
    runTool("set_quantity", { item_id: "dosa-filter-coffee", quantity: 3 }, c);
    assert.equal(c.bag.stalls[0].items[0].qty, 3);
    const capped = json(runTool("set_quantity", { item_id: "dosa-filter-coffee", quantity: 25 }, c).content);
    assert.equal(capped.now_in_bag, 20);
    assert.match(capped.note, /20/);
    const removed = runTool("set_quantity", { item_id: "dosa-filter-coffee", quantity: 0 }, c);
    assert.equal(removed.status, "Taking out Filter coffee…");
    assert.deepEqual(c.bag, EMPTY_CART);
    assert.equal(c.changes.get("dosa-filter-coffee")!.qty, 0);
    // Something no longer on any menu can still come out of the bag.
    const stale = addToCart(EMPTY_CART, { id: "old", name: "Old" }, { menuItemId: "old-dish", name: "Old dish", priceInr: 5, veg: true });
    const out = ctx(stale);
    assert.equal(runTool("set_quantity", { item_id: "old-dish", quantity: 0 }, out).isError, undefined);
    assert.deepEqual(out.bag, EMPTY_CART);
  });
});

describe("assistant loop", () => {
  const config: AssistantConfig = assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "custom", AI_BASE_URL: "http://127.0.0.1:1", AI_MODEL: "m" })!;

  type Block = Record<string, unknown>;
  function scripted(...turns: { stop: string; content: Block[] }[]) {
    const seen: Parameters<CallModel>[0][] = [];
    const call: CallModel = async (params) => {
      seen.push(structuredClone(params));
      const turn = turns[Math.min(seen.length - 1, turns.length - 1)];
      return {
        id: `msg_${seen.length}`,
        type: "message",
        role: "assistant",
        model: "m",
        content: turn.content,
        stop_reason: turn.stop,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: null },
      } as unknown as Awaited<ReturnType<CallModel>>;
    };
    return { call, seen };
  }

  it("searches, adds, and answers, sending tool results back", async () => {
    const { call, seen } = scripted(
      { stop: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_menu", input: { query: "masala dosa" } }] },
      { stop: "tool_use", content: [{ type: "tool_use", id: "t2", name: "add_to_bag", input: { item_id: "dosa-masala-dosa", quantity: 2 } }] },
      { stop: "end_turn", content: [{ type: "text", text: "Added 2 masala dosas. Your bag is ₹180." }] },
    );
    const statuses: string[] = [];
    const result = await runAssistant({
      call,
      config,
      catalogue,
      bag: EMPTY_CART,
      turns: [{ role: "user", text: "2 masala dosa" }],
      brandName: "Acme Food Court",
      onStatus: (status) => statuses.push(status),
    });
    assert.equal(result.reply, "Added 2 masala dosas. Your bag is ₹180.");
    assert.deepEqual(statuses, ["Searching the menus…", "Adding Masala dosa…"]);
    assert.deepEqual(result.changes.map((c) => [c.item.menuItemId, c.qty]), [["dosa-masala-dosa", 2]]);
    assert.equal(result.steps, 3);
    assert.deepEqual(result.usage, { input: 30, output: 15, cacheRead: 9, cacheWrite: 0 });
    assert.match(String(seen[0].system), /ordering assistant of Acme Food Court/);
    const last = seen[2].messages;
    assert.equal(last.length, 5);
    const [sent] = last[4].content as unknown as { type: string; tool_use_id: string; content: string }[];
    assert.equal(sent.type, "tool_result");
    assert.equal(sent.tool_use_id, "t2");
    assert.equal(JSON.parse(sent.content).now_in_bag, 2);
  });

  it("stops after a refusal or too many steps, and runs no tool cut off at max_tokens", async () => {
    const refused = scripted({ stop: "refusal", content: [] });
    const r1 = await runAssistant({ call: refused.call, config, catalogue, bag: EMPTY_CART, turns: [{ role: "user", text: "x" }], brandName: "B" });
    assert.match(r1.reply, /can't help/);

    const looping = scripted({ stop: "tool_use", content: [{ type: "tool_use", id: "t", name: "add_to_bag", input: { item_id: "dosa-filter-coffee" } }] });
    const r2 = await runAssistant({ call: looping.call, config, catalogue, bag: EMPTY_CART, turns: [{ role: "user", text: "x" }], brandName: "B" });
    assert.equal(r2.steps, MAX_STEPS);
    assert.match(r2.reply, /couldn't finish/);

    const truncated = scripted({ stop: "max_tokens", content: [{ type: "tool_use", id: "t", name: "add_to_bag", input: { item_id: "dosa-masala" } }] });
    const r3 = await runAssistant({ call: truncated.call, config, catalogue, bag: EMPTY_CART, turns: [{ role: "user", text: "x" }], brandName: "B" });
    assert.equal(r3.changes.length, 0);
  });

  it("turns the chat into alternating messages that start with the person", () => {
    assert.deepEqual(
      toMessages([
        { role: "assistant", text: "Hi!" },
        { role: "user", text: "dosa" },
        { role: "user", text: " and coffee " },
        { role: "assistant", text: "Which dosa?" },
        { role: "user", text: "masala" },
      ]),
      [
        { role: "user", content: "dosa\n\nand coffee" },
        { role: "assistant", content: "Which dosa?" },
        { role: "user", content: "masala" },
      ],
    );
  });

  it("sends Claude-only fields only where requests reach Anthropic unchanged", () => {
    const direct = requestParams(assistantConfig({ AI_API_KEY: "k" })!, "s", []);
    assert.deepEqual(direct.cache_control, { type: "ephemeral" });
    assert.deepEqual(direct.output_config, { effort: "low" });
    assert.deepEqual(direct.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(direct.fallbacks, "default");
    const haiku = requestParams(assistantConfig({ AI_API_KEY: "k", AI_MODEL: "claude-haiku-5-5" })!, "s", []);
    assert.equal(haiku.betas, undefined);
    assert.deepEqual(haiku.output_config, { effort: "low" });
    const routed = requestParams(config, "s", []);
    for (const field of ["cache_control", "output_config", "betas", "fallbacks"]) assert.equal(field in routed, false, field);
    assert.equal(routed.max_tokens, 16000);
  });
});
