import Anthropic from "@anthropic-ai/sdk";
import { toMessages, type ChatTurn, type ModelChat } from "@/lib/assistant/agent";
import type { AssistantConfig } from "@/lib/assistant/config";
import { TOOLS } from "@/lib/assistant/tools";

// The assistant's chats over Anthropic's Messages API: Claude directly, or a
// router or gateway that takes the same format.

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Reply = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type CallModel = (params: Params) => Promise<Reply>;

// Models that accept server-side refusal fallbacks in their "default" form.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

// Claude-only fields go only where requests reach Anthropic unchanged: a
// router that translates for other models may refuse fields it doesn't know.
export function requestParams(config: AssistantConfig, system: string, messages: MessageParam[]): Params {
  const params: Params = {
    model: config.model,
    max_tokens: 16000,
    system,
    tools: TOOLS as Params["tools"],
    messages,
  };
  if (!config.claudeFeatures) return params;
  return {
    ...params,
    cache_control: { type: "ephemeral" },
    ...(config.effort ? { output_config: { effort: config.effort } } : {}),
    ...(FALLBACK_MODELS.has(config.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

// A manual loop rather than the SDK's tool runner: the runner calls the beta
// endpoint, which routers that only translate the Messages API may not serve.
export function modelCaller(config: AssistantConfig): CallModel {
  const client = new Anthropic({
    apiKey: config.apiKey,
    authToken: config.authToken,
    baseURL: config.baseURL,
    defaultHeaders: config.headers,
    timeout: 45_000,
    maxRetries: 1,
  });
  return (params) =>
    params.betas?.length
      ? client.beta.messages.create(params)
      : (client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming) as unknown as Promise<Reply>);
}

export function anthropicChat(config: AssistantConfig, system: string, turns: ChatTurn[], call = modelCaller(config)): ModelChat {
  const messages: MessageParam[] = toMessages(turns);
  return async (answers) => {
    if (answers.length) {
      messages.push({
        role: "user",
        content: answers.map((answer) => ({
          type: "tool_result",
          tool_use_id: answer.id,
          content: answer.content,
          ...(answer.isError ? { is_error: true } : {}),
        })),
      });
    }
    const response = await call(requestParams(config, system, messages));
    const usage = {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
      cacheRead: response.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage?.cache_creation_input_tokens ?? 0,
    };

    if (response.stop_reason === "refusal") return { type: "refused", usage };
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      return { type: "again", usage };
    }
    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use",
    );
    // A tool call cut off at max_tokens may carry a partial input: never run it.
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const text = response.content
        .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { type: "reply", text, usage };
    }
    messages.push({ role: "assistant", content: response.content });
    return { type: "tools", calls: toolUses.map(({ id, name, input }) => ({ id, name, input })), usage };
  };
}
