import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { runAssistant, systemPrompt, type ChatTurn } from "@/lib/assistant/agent";
import { anthropicChat } from "@/lib/assistant/anthropic";
import { loadCatalogue } from "@/lib/assistant/catalogue";
import { MAX_MESSAGE_LENGTH, assistantConfig } from "@/lib/assistant/config";
import { openaiChat } from "@/lib/assistant/openai";
import { brandNames } from "@/lib/brand";
import { parseStoredCart } from "@/lib/cart";
import { consume } from "@/lib/rate-limit";
import { sameSite } from "@/lib/same-site";
import { getEmployeeSession } from "@/lib/session";
import { cleanText, isRecord } from "@/lib/validation";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 12;
const MAX_BODY_BYTES = 100_000;

// { messages: [{ role, text }], bag }: the chat so far, ending with the
// person's new message, and their bag as the page holds it.
function parseInput(raw: unknown) {
  if (!isRecord(raw) || !Array.isArray(raw.messages) || !raw.messages.length || raw.messages.length > 40) return null;
  const turns: ChatTurn[] = [];
  for (const message of raw.messages.slice(-MAX_TURNS)) {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) return null;
    const text = cleanText(message.text, message.role === "user" ? MAX_MESSAGE_LENGTH : 2000);
    if (text) turns.push({ role: message.role, text });
  }
  if (turns.at(-1)?.role !== "user") return null;
  return { turns, bag: parseStoredCart(JSON.stringify(raw.bag ?? null)) };
}

const NOT_AVAILABLE = "The assistant is not available right now. You can still add dishes from the menus.";

function failure(error: unknown) {
  // OpenAI also answers 429 when the account is out of credit, which waiting won't fix.
  if (error instanceof OpenAI.RateLimitError && error.code === "insufficient_quota") return NOT_AVAILABLE;
  if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) {
    return "The assistant is busy right now. Try again in a minute.";
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
    return "The assistant could not be reached. Try again in a moment.";
  }
  return NOT_AVAILABLE;
}

// Chat with the ordering assistant. The answer streams one JSON object per
// line: { type: "status", text } while it works, then { type: "reply", text,
// changes } or { type: "error", text }. It never places or pays for an order.
export async function POST(request: Request) {
  const config = assistantConfig();
  if (!config) return NextResponse.json({ error: "The assistant is not set up." }, { status: 404 });
  if (!sameSite(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const session = await getEmployeeSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  // A chat and a bag are a few kilobytes; don't read a body far bigger than that.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That message is too long." }, { status: 413 });
  }
  const body = await request.text().catch(() => "");
  let input = null;
  try {
    input = body.length <= MAX_BODY_BYTES ? parseInput(JSON.parse(body)) : null;
  } catch {}
  if (!input) return NextResponse.json({ error: "That message could not be read." }, { status: 400 });

  // Each message costs money: a few a minute and a daily allowance per person, and a cap for everyone.
  if (!consume(`assistant:minute:${session.uid}`, 8, 60_000).ok) {
    return NextResponse.json({ error: "Slow down a little: try again in a minute." }, { status: 429 });
  }
  if (!consume(`assistant:day:${session.uid}`, config.dailyLimit, DAY_MS).ok) {
    return NextResponse.json(
      { error: `That's today's ${config.dailyLimit} messages to the assistant. You can still add dishes from the menus.` },
      { status: 429 },
    );
  }
  if (!consume("assistant:day:all", config.totalDailyLimit, DAY_MS).ok) {
    console.warn(`[assistant] AI_TOTAL_DAILY_LIMIT (${config.totalDailyLimit}) reached; refusing messages until the window ends.`);
    return NextResponse.json({ error: "The assistant has reached its limit for today. You can still add dishes from the menus." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const started = Date.now();
      try {
        const system = systemPrompt(brandNames().name);
        const chat = config.api === "openai" ? openaiChat(config, system, input.turns) : anthropicChat(config, system, input.turns);
        const result = await runAssistant({
          chat,
          catalogue: await loadCatalogue(),
          bag: input.bag,
          onStatus: (text) => send({ type: "status", text }),
        });
        const { usage } = result;
        console.info(
          `[assistant] ${config.router} ${config.model} steps=${result.steps} in=${usage.input} out=${usage.output} ` +
            `cache_read=${usage.cacheRead} cache_write=${usage.cacheWrite} changes=${result.changes.length} ms=${Date.now() - started}`,
        );
        send({ type: "reply", text: result.reply, changes: result.changes });
      } catch (error) {
        const detail =
          error instanceof Anthropic.APIError || error instanceof OpenAI.APIError
            ? `${error.status ?? "-"} ${error.name}: ${error.message}`
            : String(error);
        console.error(`[assistant] ${config.router} ${config.model} failed: ${detail}`);
        send({ type: "error", text: failure(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform keeps compression from holding back the progress lines.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
