import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import { toMessages, type ChatTurn, type ModelChat } from "@/lib/assistant/agent";
import type { AssistantConfig } from "@/lib/assistant/config";
import { TOOLS } from "@/lib/assistant/tools";

// The assistant's chats over OpenAI's Responses API: OpenAI's newest models
// take tools only there, not through Chat Completions.

type Params = OpenAI.Responses.ResponseCreateParamsNonStreaming;
type Reply = OpenAI.Responses.Response;
type InputItem = OpenAI.Responses.ResponseInputItem;
type OutputItem = OpenAI.Responses.ResponseOutputItem;
export type CreateResponse = (params: Params) => Promise<Reply>;

// The menu tools as functions. Not strict: strict mode would make every
// optional field required.
const FUNCTIONS: OpenAI.Responses.FunctionTool[] = TOOLS.map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description ?? null,
  parameters: tool.input_schema,
  strict: false,
}));

// What goes back with the tool results: the model's messages, its calls and
// its reasoning, which OpenAI asks to be returned with the calls.
const KEPT = new Set<OutputItem["type"]>(["message", "function_call", "reasoning"]);

export function responseParams(config: AssistantConfig, instructions: string, input: InputItem[]): Params {
  return {
    model: config.model,
    instructions,
    input,
    tools: FUNCTIONS,
    // OpenAI's advice for reasoning models: leave at least 25,000 tokens for the reasoning and the answer.
    max_output_tokens: 25_000,
    // Nothing is kept at OpenAI: each call sends the whole chat, with the
    // model's reasoning as it came back, encrypted.
    store: false,
    ...(config.effort ? { reasoning: { effort: config.effort } } : {}),
  };
}

export function responseCaller(config: AssistantConfig): CreateResponse {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.headers,
    timeout: 45_000,
    maxRetries: 1,
  });
  return (params) => client.responses.create(params);
}

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function openaiChat(config: AssistantConfig, system: string, turns: ChatTurn[], call = responseCaller(config)): ModelChat {
  const input: InputItem[] = toMessages(turns);
  return async (answers) => {
    for (const answer of answers) input.push({ type: "function_call_output", call_id: answer.id, output: answer.content });
    const response = await call(responseParams(config, system, input));
    if (response.status === "failed" || response.status === "cancelled") {
      throw new Error(`OpenAI response ${response.status}: ${response.error?.message ?? "no details"}`);
    }
    const cacheRead = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    const cacheWrite = response.usage?.input_tokens_details?.cache_write_tokens ?? 0;
    const usage = {
      // Counted like Anthropic's: input read from or written to the cache is apart.
      input: Math.max(0, (response.usage?.input_tokens ?? 0) - cacheRead - cacheWrite),
      output: response.usage?.output_tokens ?? 0,
      cacheRead,
      cacheWrite,
    };

    const parts = response.output.flatMap((item) => (item.type === "message" ? item.content : []));
    if (response.incomplete_details?.reason === "content_filter" || parts.some((part) => part.type === "refusal")) {
      return { type: "refused", usage };
    }
    const calls = response.output.filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call");
    // A call cut off at max_output_tokens may carry partial arguments: never run it.
    if (response.status === "incomplete" || !calls.length) {
      const text = parts
        .map((part) => (part.type === "output_text" ? part.text : ""))
        .join("\n")
        .trim();
      return { type: "reply", text, usage };
    }
    input.push(...toResponseInputItems(response.output.filter((item) => KEPT.has(item.type))));
    return {
      type: "tools",
      calls: calls.map((item) => ({ id: item.call_id, name: item.name, input: parseArguments(item.arguments) })),
      usage,
    };
  };
}
