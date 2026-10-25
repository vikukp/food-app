import { cleanText, toInt } from "@/lib/validation";

// The AI ordering assistant is off until AI_API_KEY is set. AI_ROUTER says
// where its requests go: to Anthropic, or through a router or gateway that
// takes the same Messages API format (README, AI ordering assistant).

export const ROUTERS = ["anthropic", "openrouter", "vercel", "litellm", "cloudflare", "portkey", "custom"] as const;
export type Router = (typeof ROUTERS)[number];

// Longest message a person can send the assistant.
export const MAX_MESSAGE_LENGTH = 500;

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

type Preset = {
  // Where the router lives; null when each install has its own (AI_BASE_URL).
  baseURL: string | null;
  // sdk: the Anthropic SDK's own way (for Anthropic itself); bearer: Authorization;
  // x-api-key: that header alone, as Anthropic-format gateways document it.
  auth: "sdk" | "bearer" | "x-api-key";
  // Requests reach Anthropic unchanged, so Claude-only fields (prompt caching,
  // effort, refusal fallbacks) can be sent. AI_CLAUDE_FEATURES overrides it.
  claudeFeatures: boolean;
  // Routers name models their own way, so only Anthropic gets a default.
  defaultModel: string | null;
  // A header that carries the key as well (Portkey reads its own).
  keyHeader?: string;
};

const PRESETS: Record<Router, Preset> = {
  anthropic: { baseURL: "", auth: "sdk", claudeFeatures: true, defaultModel: "claude-opus-5-5" },
  openrouter: { baseURL: "https://openrouter.ai/api", auth: "bearer", claudeFeatures: false, defaultModel: null },
  vercel: { baseURL: "https://ai-gateway.vercel.sh", auth: "bearer", claudeFeatures: false, defaultModel: null },
  litellm: { baseURL: null, auth: "bearer", claudeFeatures: false, defaultModel: null },
  cloudflare: { baseURL: null, auth: "x-api-key", claudeFeatures: false, defaultModel: "claude-opus-5-5" },
  portkey: {
    baseURL: "https://api.portkey.ai",
    auth: "sdk",
    claudeFeatures: false,
    defaultModel: null,
    keyHeader: "x-portkey-api-key",
  },
  custom: { baseURL: null, auth: "x-api-key", claudeFeatures: false, defaultModel: null },
};

export type AssistantConfig = {
  router: Router;
  model: string;
  // Undefined: the Anthropic API (or ANTHROPIC_BASE_URL, if set).
  baseURL?: string;
  apiKey: string | null;
  authToken: string | null;
  // A null value drops that header from requests.
  headers: Record<string, string | null>;
  claudeFeatures: boolean;
  effort: Effort | null;
  // Messages per person per rolling day, and across everyone.
  dailyLimit: number;
  totalDailyLimit: number;
};

type Env = Record<string, string | undefined>;

const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[assistant] ${message}`);
}

function limit(value: string | undefined, fallback: number, max: number) {
  const n = toInt(cleanText(value, 10));
  return n === null || n < 1 ? fallback : Math.min(n, max);
}

function extraHeaders(raw: string | undefined): Record<string, string> | null {
  const text = cleanText(raw, 4000);
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed);
      if (entries.every(([name, value]) => /^[a-z0-9-]{1,64}$/i.test(name) && typeof value === "string")) {
        return Object.fromEntries(entries) as Record<string, string>;
      }
    }
  } catch {}
  return null;
}

// Null when the assistant is off: no key, or settings that cannot work (named once in the log).
export function assistantConfig(env: Env = process.env): AssistantConfig | null {
  const key = cleanText(env.AI_API_KEY, 500);
  if (!key) return null;

  const router = (cleanText(env.AI_ROUTER, 20) || "anthropic").toLowerCase();
  if (!(ROUTERS as readonly string[]).includes(router)) {
    warnOnce(`AI_ROUTER="${env.AI_ROUTER}" is not one of ${ROUTERS.join(", ")}; the assistant is off.`);
    return null;
  }
  const preset = PRESETS[router as Router];

  const baseURL = cleanText(env.AI_BASE_URL, 500) || preset.baseURL;
  if (baseURL === null) {
    warnOnce(`AI_ROUTER=${router} needs AI_BASE_URL, the address of your ${router} endpoint; the assistant is off.`);
    return null;
  }
  if (baseURL) {
    let protocol = "";
    try {
      protocol = new URL(baseURL).protocol;
    } catch {}
    if (protocol !== "https:" && protocol !== "http:") {
      warnOnce(`AI_BASE_URL="${baseURL}" is not an http(s) address; the assistant is off.`);
      return null;
    }
  }

  const model = cleanText(env.AI_MODEL, 200) || preset.defaultModel;
  if (!model) {
    warnOnce(`AI_ROUTER=${router} needs AI_MODEL, a model name from your router's list; the assistant is off.`);
    return null;
  }

  const headers = extraHeaders(env.AI_HEADERS);
  if (!headers) {
    warnOnce('AI_HEADERS must be a JSON object of header names and text values, like {"cf-aig-authorization": "Bearer ..."}; it is ignored.');
  }

  const features = cleanText(env.AI_CLAUDE_FEATURES, 5).toLowerCase();
  const effortSetting = (cleanText(env.AI_EFFORT, 10) || "low").toLowerCase();
  if (effortSetting !== "off" && !(EFFORTS as readonly string[]).includes(effortSetting)) {
    warnOnce(`AI_EFFORT="${env.AI_EFFORT}" is not one of ${EFFORTS.join(", ")} or off; using low.`);
  }

  return {
    router: router as Router,
    model,
    baseURL: baseURL || undefined,
    // A key passed in code also keeps the SDK from looking for credentials elsewhere on the server.
    apiKey: preset.auth === "bearer" ? null : key,
    authToken: preset.auth === "bearer" ? key : null,
    headers: {
      ...(preset.auth === "x-api-key" ? { "x-api-key": key, authorization: null } : {}),
      ...(preset.keyHeader ? { [preset.keyHeader]: key } : {}),
      ...(headers ?? {}),
    },
    claudeFeatures: features === "on" ? true : features === "off" ? false : preset.claudeFeatures,
    effort:
      effortSetting === "off"
        ? null
        : (EFFORTS as readonly string[]).includes(effortSetting)
          ? (effortSetting as Effort)
          : "low",
    dailyLimit: limit(env.AI_DAILY_LIMIT, 30, 1000),
    totalDailyLimit: limit(env.AI_TOTAL_DAILY_LIMIT, 2000, 1_000_000),
  };
}
