import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startAiStub } from "../../e2e/ai-stub.mjs";
import { MAX_STEPS, runAssistant, systemPrompt, toMessages } from "@/lib/assistant/agent";
import { anthropicChat, requestParams, type CallModel } from "@/lib/assistant/anthropic";
import type { Catalogue, CatalogueStall, Dish } from "@/lib/assistant/catalogue";
import { CHAT_IDLE_MS, EMPTY_CHAT, isStale } from "@/lib/assistant/chat-store";
import { agoText, rankFavorites, usualText, type Favorite } from "@/lib/assistant/habits";
import { assistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { openaiChat, responseParams, type CreateResponse } from "@/lib/assistant/openai";
import { TOOLS, runTool, type ToolContext } from "@/lib/assistant/tools";
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
    queue: 0,
    waitMinutes: 10,
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
      waitMinutes: null,
      wait: null,
    }),
    stall("rolls", "Roll Corner", [
      dish("rolls", "egg-roll", "Egg roll", 70, { veg: false, egg: true }),
      dish("rolls", "paneer-roll", "Paneer roll", 90, { jain: true, allergens: ["Milk"] }),
    ]),
    stall("juice", "Juice Bar", [dish("juice", "mango", "Mango smoothie", 90, { category: "Juices" })], {
      paused: true,
      open: false,
      waitMinutes: null,
      wait: null,
    }),
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

  it("take OpenAI's own API, with GPT-6.1 Sol unless AI_MODEL names another", () => {
    const openai = assistantConfig({ AI_API_KEY: "sk-proj", AI_ROUTER: "openai", AI_CLAUDE_FEATURES: "on" })!;
    assert.equal(openai.api, "openai");
    assert.equal(openai.model, "gpt-6.1-sol");
    assert.equal(openai.baseURL, "https://api.openai.com/v1");
    assert.equal(openai.apiKey, "sk-proj");
    assert.deepEqual(openai.headers, {});
    // Claude-only fields never go to OpenAI.
    assert.equal(openai.claudeFeatures, false);
    assert.equal(openai.effort, "low");
    assert.equal(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "openai", AI_MODEL: "gpt-6-luna" })!.model, "gpt-6-luna");
    assert.equal(assistantConfig({ AI_API_KEY: "k" })!.api, "anthropic");
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

describe("assistant and the queues", () => {
  // A fake queue: the Dosa Counter is mobbed, Punjab Grill has a moderate wait,
  // Idli & Filter Coffee and Jain Kitchen are quiet, and one thali counter is closed.
  const queues: Catalogue = {
    stalls: [
      stall(
        "dosa",
        "Dosa Counter",
        [dish("dosa", "masala", "Masala dosa", 90), dish("dosa", "filter", "Filter coffee", 35, { category: "Drinks" })],
        { queue: 11, waitMinutes: 40, wait: "Busy · ~40 min" },
      ),
      stall(
        "idli",
        "Idli & Filter Coffee",
        [dish("idli", "filter", "Filter coffee", 30, { category: "Drinks" }), dish("idli", "combo", "Idli vada combo", 80)],
        { queue: 1 },
      ),
      stall(
        "punjab",
        "Punjab Grill",
        [
          dish("punjab", "veg-thali", "Veg thali", 140, { category: "Thali" }),
          dish("punjab", "chicken-thali", "Chicken thali", 190, { category: "Thali", veg: false }),
          dish("punjab", "rice-combo", "Rice + rajma combo", 120),
        ],
        { queue: 5, waitMinutes: 20, wait: "Moderate · ~20 min" },
      ),
      stall("jain", "Jain Kitchen", [dish("jain", "thali", "Jain thali", 150, { category: "Thali", jain: true })], { queue: 2 }),
      stall("late", "Late Thali", [dish("late", "thali", "Night thali", 120, { category: "Thali" })], {
        open: false,
        opensLaterToday: true,
        openTime: "20:00",
        waitMinutes: null,
        wait: null,
      }),
    ],
  };
  const run = (name: string, input: object, c: ToolContext = { catalogue: queues, bag: EMPTY_CART, changes: new Map() }) =>
    json(runTool(name, input, c).content);
  type Seen = { dish: string; stall: string; wait_minutes?: number; orders_in_queue?: number };

  it("show each stall's live queue, and put the shorter wait first among equal matches", () => {
    const thalis: Seen[] = run("search_menu", { query: "thali" }).dishes;
    assert.deepEqual(
      thalis.map((d) => [d.dish, d.wait_minutes, d.orders_in_queue]),
      [
        ["Jain thali", 10, 2],
        ["Veg thali", 20, 5],
        ["Chicken thali", 20, 5],
      ],
    );
    const coffee: Seen[] = run("search_menu", { query: "filter coffee" }).dishes;
    assert.deepEqual(coffee.map((d) => d.stall), ["Idli & Filter Coffee", "Dosa Counter"]);
    // A closed stall has no wait to compare.
    const late = run("search_menu", { query: "night thali", include_closed: true }).dishes[0];
    assert.equal(late.dish, "Night thali");
    assert.equal("wait_minutes" in late, false);
  });

  it("find the quickest food first when asked to", () => {
    const quick: Seen[] = run("search_menu", { veg: true, sort: "quickest" }).dishes;
    const waits = quick.map((d) => d.wait_minutes!);
    assert.deepEqual(waits, [...waits].sort((a, b) => a - b));
    assert.equal(waits[0], 10);
    assert.equal(quick.at(-1)!.stall, "Dosa Counter");
  });

  it("list open stalls quickest first, and closed ones last without a wait", () => {
    const stalls = run("list_stalls", {}) as { stall: string; wait_minutes?: number; orders_in_queue?: number }[];
    assert.deepEqual(
      stalls.map((s) => s.stall),
      ["Idli & Filter Coffee", "Jain Kitchen", "Punjab Grill", "Dosa Counter", "Late Thali"],
    );
    assert.deepEqual([stalls[3].wait_minutes, stalls[3].orders_in_queue], [40, 11]);
    assert.equal("wait_minutes" in stalls[4], false);
  });

  it("offer the same kind of dish where the queue is much shorter, keeping the diet", () => {
    const coffee = run("add_to_bag", { item_id: "dosa-filter" });
    assert.equal(coffee.wait_minutes, 40);
    assert.deepEqual(coffee.quicker_elsewhere, [
      { item_id: "idli-filter", dish: "Filter coffee", stall: "Idli & Filter Coffee", price: 30, wait_minutes: 10 },
    ]);
    // A veg thali gets the Jain thali, never the chicken one, the closed counter's or its own stall's.
    const thali = run("add_to_bag", { item_id: "punjab-veg-thali" });
    assert.deepEqual(
      thali.quicker_elsewhere.map((o: Seen) => [o.dish, o.stall]),
      [["Jain thali", "Jain Kitchen"]],
    );
    assert.equal(run("add_to_bag", { item_id: "punjab-chicken-thali" }).quicker_elsewhere, undefined);
  });

  it("offer nothing when the wait is short, or for a serving like a combo", () => {
    const quick = run("add_to_bag", { item_id: "jain-thali" });
    assert.equal(quick.wait_minutes, 10);
    assert.equal(quick.quicker_elsewhere, undefined);
    // "Rice + rajma combo" and "Idli vada combo" are not the same dish.
    assert.equal(run("add_to_bag", { item_id: "punjab-rice-combo" }).quicker_elsewhere, undefined);
  });

  it("tell the model to use the waits, and never to swap a dish by itself", () => {
    const prompt = systemPrompt("Acme Food Court");
    assert.match(prompt, /wait_minutes/);
    assert.match(prompt, /quicker_elsewhere/);
    assert.match(prompt, /Never swap a dish without asking/);
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

  const ask = (call: CallModel) =>
    runAssistant({ chat: anthropicChat(config, systemPrompt("B"), [{ role: "user", text: "x" }], call), catalogue, bag: EMPTY_CART });

  it("searches, adds, and answers, sending tool results back", async () => {
    const { call, seen } = scripted(
      { stop: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_menu", input: { query: "masala dosa" } }] },
      { stop: "tool_use", content: [{ type: "tool_use", id: "t2", name: "add_to_bag", input: { item_id: "dosa-masala-dosa", quantity: 2 } }] },
      { stop: "end_turn", content: [{ type: "text", text: "Added 2 masala dosas. Your bag is ₹180." }] },
    );
    const statuses: string[] = [];
    const result = await runAssistant({
      chat: anthropicChat(config, systemPrompt("Acme Food Court"), [{ role: "user", text: "2 masala dosa" }], call),
      catalogue,
      bag: EMPTY_CART,
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
    assert.match((await ask(refused.call)).reply, /can't help/);

    const looping = scripted({ stop: "tool_use", content: [{ type: "tool_use", id: "t", name: "add_to_bag", input: { item_id: "dosa-filter-coffee" } }] });
    const r2 = await ask(looping.call);
    assert.equal(r2.steps, MAX_STEPS);
    assert.match(r2.reply, /couldn't finish/);

    const truncated = scripted({ stop: "max_tokens", content: [{ type: "tool_use", id: "t", name: "add_to_bag", input: { item_id: "dosa-masala" } }] });
    assert.equal((await ask(truncated.call)).changes.length, 0);
  });

  it("asks again after a paused turn, keeping what came so far", async () => {
    const { call, seen } = scripted(
      { stop: "pause_turn", content: [{ type: "text", text: "Looking…" }] },
      { stop: "end_turn", content: [{ type: "text", text: "Here you go." }] },
    );
    const result = await ask(call);
    assert.equal(result.reply, "Here you go.");
    assert.equal(result.steps, 2);
    assert.deepEqual(seen[1].messages.at(-1), { role: "assistant", content: [{ type: "text", text: "Looking…" }] });
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

describe("assistant over OpenAI", () => {
  const config = assistantConfig({ AI_API_KEY: "sk-test", AI_ROUTER: "openai" })!;

  type Item = Record<string, unknown>;
  const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 }, output_tokens: 20 };
  function scripted(...replies: Item[]) {
    const seen: Parameters<CreateResponse>[0][] = [];
    const call: CreateResponse = async (params) => {
      seen.push(structuredClone(params));
      const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
      return { id: `resp_${seen.length}`, status: "completed", usage, ...reply } as unknown as Awaited<ReturnType<CreateResponse>>;
    };
    return { call, seen };
  }
  const reasoning = (id: string): Item => ({ type: "reasoning", id: `rs_${id}`, summary: [], encrypted_content: `sealed-${id}` });
  const functionCall = (id: string, name: string, args: string): Item => ({
    type: "function_call",
    id: `fc_${id}`,
    call_id: id,
    name,
    arguments: args,
    status: "completed",
  });
  const said = (part: Item): Item => ({ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [part] });
  const text = (value: string) => said({ type: "output_text", text: value, annotations: [] });
  const ask = (call: CreateResponse, message = "x") =>
    runAssistant({ chat: openaiChat(config, systemPrompt("Acme Food Court"), [{ role: "user", text: message }], call), catalogue, bag: EMPTY_CART });

  it("searches, adds and answers, sending the reasoning and tool results back", async () => {
    const { call, seen } = scripted(
      { output: [reasoning("c1"), functionCall("c1", "search_menu", '{"query":"masala dosa"}')] },
      { output: [reasoning("c2"), functionCall("c2", "add_to_bag", '{"item_id":"dosa-masala-dosa","quantity":2}')] },
      { output: [text("Added 2 masala dosas. Your bag is ₹180.")] },
    );
    const result = await ask(call, "2 masala dosa");
    assert.equal(result.reply, "Added 2 masala dosas. Your bag is ₹180.");
    assert.deepEqual(result.changes.map((c) => [c.item.menuItemId, c.qty]), [["dosa-masala-dosa", 2]]);
    // OpenAI's input count includes cache reads and writes; the log counts them apart, as for Claude.
    assert.deepEqual(result.usage, { input: 90, output: 60, cacheRead: 180, cacheWrite: 30 });

    const [first, , last] = seen;
    assert.match(String(first.instructions), /ordering assistant of Acme Food Court/);
    assert.equal(first.store, false);
    assert.deepEqual(first.reasoning, { effort: "low" });
    assert.deepEqual(first.input, [{ role: "user", content: "2 masala dosa" }]);
    const tools = first.tools as { type: string; name: string; strict: boolean; parameters: unknown }[];
    assert.deepEqual(tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
    assert.ok(tools.every((tool) => tool.type === "function" && tool.strict === false));
    assert.deepEqual(tools[0].parameters, TOOLS[0].input_schema);
    for (const field of ["cache_control", "output_config", "betas", "system", "messages"]) assert.equal(field in first, false, field);

    const input = last.input as unknown as Item[];
    assert.deepEqual(input.map((item) => item.type ?? item.role), [
      "user",
      "reasoning",
      "function_call",
      "function_call_output",
      "reasoning",
      "function_call",
      "function_call_output",
    ]);
    assert.equal(input[1].encrypted_content, "sealed-c1");
    assert.equal(input[6].call_id, "c2");
    assert.equal(JSON.parse(String(input[6].output)).now_in_bag, 2);
  });

  it("stops at refusals, never runs a call cut off mid-way, and reports failed responses", async () => {
    const refused = scripted({ output: [said({ type: "refusal", refusal: "No." })] });
    assert.match((await ask(refused.call)).reply, /can't help/);
    const filtered = scripted({ output: [], status: "incomplete", incomplete_details: { reason: "content_filter" } });
    assert.match((await ask(filtered.call)).reply, /can't help/);
    const cut = scripted({
      output: [reasoning("c"), functionCall("c", "add_to_bag", '{"item_id":"dosa-mas')],
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    const r3 = await ask(cut.call);
    assert.equal(r3.changes.length, 0);
    assert.equal(r3.steps, 1);
    const failed = scripted({ output: [], status: "failed", error: { code: "server_error", message: "boom" } });
    await assert.rejects(ask(failed.call), /OpenAI response failed: boom/);
  });

  it("answers a call whose arguments are not JSON with a tool error", async () => {
    const { call, seen } = scripted({ output: [reasoning("c"), functionCall("c", "add_to_bag", "{not json")] }, { output: [text("Which dish?")] });
    const result = await ask(call);
    assert.equal(result.reply, "Which dish?");
    assert.equal(result.changes.length, 0);
    const sent = (seen[1].input as unknown as Item[]).at(-1)!;
    assert.equal(sent.type, "function_call_output");
    assert.ok("error" in JSON.parse(String(sent.output)));
  });

  it("sends no reasoning settings with AI_EFFORT=off, for models without reasoning", () => {
    const params = responseParams(assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "openai", AI_MODEL: "gpt-4.1-mini", AI_EFFORT: "off" })!, "s", []);
    assert.equal(params.model, "gpt-4.1-mini");
    assert.equal("reasoning" in params, false);
  });

  it("works end to end through the OpenAI SDK against a stand-in server", async () => {
    const stub = startAiStub(0);
    const port = await stub.listening;
    try {
      const local = assistantConfig({ AI_API_KEY: "sk-local", AI_ROUTER: "openai", AI_BASE_URL: `http://127.0.0.1:${port}/v1` })!;
      const result = await runAssistant({
        chat: openaiChat(local, systemPrompt("Acme Food Court"), [{ role: "user", text: "2 masala dosa" }]),
        catalogue,
        bag: EMPTY_CART,
      });
      assert.equal(result.reply, "Added 2 Masala dosa from Dosa Counter. Your bag is now ₹180.");
      assert.deepEqual(result.changes.map((c) => [c.item.menuItemId, c.qty]), [["dosa-masala-dosa", 2]]);
      assert.equal(stub.requests.length, 3);
      for (const { path, headers, body } of stub.requests) {
        assert.equal(path, "/v1/responses");
        assert.equal(headers.authorization, "Bearer sk-local");
        assert.equal(body.store, false);
      }
    } finally {
      stub.close();
    }
  });
});

describe("assistant chat", () => {
  const now = Date.parse("2026-10-25T13:00:00+05:30");
  const turns = [
    { role: "user" as const, text: "2 masala dosa" },
    { role: "assistant" as const, text: "Added 2 Masala dosa." },
  ];
  const chatFrom = (minutesAgo: number) => ({ at: now - minutesAgo * 60_000, turns });

  it("stays fresh for half an hour after the last message, then starts over", () => {
    assert.equal(CHAT_IDLE_MS, 30 * 60_000);
    assert.equal(isStale(chatFrom(5), now), false);
    assert.equal(isStale(chatFrom(29), now), false);
    assert.equal(isStale(chatFrom(31), now), true);
    // Nothing said yet is never stale.
    assert.equal(isStale(EMPTY_CHAT, now), false);
  });
});

describe("assistant and habits", () => {
  const at = (when: string) => new Date(`${when}+05:30`);
  const order = (when: string, ...items: [string, number][]) => ({
    createdAt: at(when),
    items: items.map(([menuItemId, qty]) => ({ menuItemId, qty })),
  });
  // Dosa and coffee every morning, a thali most lunchtimes, juice once.
  const history = [
    order("2026-10-24T08:30", ["dosa-masala-dosa", 2], ["dosa-filter-coffee", 1]),
    order("2026-10-23T08:40", ["dosa-masala-dosa", 2], ["dosa-filter-coffee", 1]),
    order("2026-10-22T08:20", ["dosa-masala-dosa", 1], ["dosa-masala-dosa", 1]),
    order("2026-10-21T08:35", ["dosa-masala-dosa", 2]),
    order("2026-10-24T12:45", ["punjab-veg-thali", 1]),
    order("2026-10-20T13:30", ["punjab-veg-thali", 2]),
    order("2026-10-18T13:10", ["punjab-veg-thali", 1]),
    order("2026-10-10T16:00", ["juice-mango", 1]),
  ];

  it("rank what someone orders most, putting what they have around this time first", () => {
    const lunch = rankFavorites(history, at("2026-10-25T13:00"));
    assert.deepEqual(
      lunch.map((f) => [f.menuItemId, f.orders, f.aroundNow, f.usualQty, f.daysAgo]),
      [
        ["punjab-veg-thali", 3, 3, 1, 1],
        ["dosa-masala-dosa", 4, 0, 2, 1],
        ["dosa-filter-coffee", 2, 0, 1, 1],
        ["juice-mango", 1, 0, 1, 15],
      ],
    );
    // In the morning the dosa leads; a dosa on two lines of one order is one order of 2.
    const breakfast = rankFavorites(history, at("2026-10-25T08:00"));
    assert.deepEqual(breakfast.slice(0, 2).map((f) => [f.menuItemId, f.aroundNow]), [
      ["dosa-masala-dosa", 4],
      ["dosa-filter-coffee", 2],
    ]);
  });

  it("count late orders around midnight as the same time of day", () => {
    const late = rankFavorites([order("2026-10-24T23:40", ["juice-mango", 1])], at("2026-10-26T00:30"));
    assert.equal(late[0].aroundNow, 1);
  });

  it("word the usual from habits that can be ordered now", () => {
    const favorite = (menuItemId: string, aroundNow: number, usualQty = 1): Favorite => ({
      menuItemId,
      orders: aroundNow + 1,
      aroundNow,
      usualQty,
      daysAgo: 1,
    });
    const names = new Map([
      ["a", "Masala dosa"],
      ["b", "Filter coffee"],
      ["c", "Medu vada"],
      ["d", "Kesari bath"],
    ]);
    assert.equal(usualText([favorite("a", 3, 2), favorite("b", 2)], names), "2 Masala dosa and 1 Filter coffee");
    assert.equal(
      usualText([favorite("a", 4, 2), favorite("b", 3), favorite("c", 2), favorite("d", 2)], names),
      "2 Masala dosa, 1 Filter coffee and 1 Medu vada",
    );
    // Once around this time is no habit, and a dish that can't be ordered now is left out.
    assert.equal(usualText([favorite("a", 1), favorite("x", 5)], names), null);
    assert.deepEqual([agoText(0), agoText(1), agoText(6)], ["today", "yesterday", "6 days ago"]);
  });

  const favorites: Favorite[] = [
    { menuItemId: "dosa-masala-dosa", orders: 5, aroundNow: 4, usualQty: 2, daysAgo: 1 },
    { menuItemId: "gone-dish", orders: 3, aroundNow: 0, usualQty: 1, daysAgo: 9 },
    { menuItemId: "biryani-chicken", orders: 2, aroundNow: 0, usualQty: 1, daysAgo: 3 },
  ];

  it("list favourites with today's menu, stall and queue, leaving out dishes gone from the menus", () => {
    const listed = json(runTool("my_favorites", {}, { ...ctx(), favorites }).content).favorites;
    assert.deepEqual(
      listed.map((f: Record<string, unknown>) => [f.dish, f.times_ordered, f.times_around_now, f.usual_quantity, f.last_ordered]),
      [
        ["Masala dosa", 5, 4, 2, "yesterday"],
        ["Chicken biryani", 2, 0, 1, "3 days ago"],
      ],
    );
    assert.equal(listed[0].wait_minutes, 10);
    assert.match(listed[1].stall_status, /closed, opens at 12:00/);
    assert.match(json(runTool("my_favorites", {}, ctx()).content).note, /No orders/);
  });

  it("reach the model through the chat", async () => {
    const config = assistantConfig({ AI_API_KEY: "k", AI_ROUTER: "custom", AI_BASE_URL: "http://127.0.0.1:1", AI_MODEL: "m" })!;
    const seen: Parameters<CallModel>[0][] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "f1", name: "my_favorites", input: {} }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Your usual is 2 masala dosas." }] },
    ];
    const call: CallModel = async (params) => {
      seen.push(structuredClone(params));
      return { ...replies[seen.length - 1], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Awaited<ReturnType<CallModel>>;
    };
    const result = await runAssistant({
      chat: anthropicChat(config, systemPrompt("B"), [{ role: "user", text: "my usual" }], call),
      catalogue,
      favorites,
      bag: EMPTY_CART,
    });
    assert.equal(result.reply, "Your usual is 2 masala dosas.");
    const [sent] = seen[1].messages.at(-1)!.content as unknown as { content: string }[];
    assert.equal(JSON.parse(sent.content).favorites[0].dish, "Masala dosa");
    assert.match(systemPrompt("B"), /my_favorites/);
  });
});
