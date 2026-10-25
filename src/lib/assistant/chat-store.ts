// The chat with the assistant is kept in the browser tab (sessionStorage), so
// moving between stall pages keeps it. Half an hour after its last message it
// is stale and starts over: an old conversation never comes back the next
// time someone orders, or goes to the model again.

export type ChatTurn = { role: "user" | "assistant"; text: string; failed?: boolean };
// at: when the last message was said (ms since epoch).
export type StoredChat = { at: number; turns: ChatTurn[] };

export const CHAT_IDLE_MS = 30 * 60_000;
export const KEPT_TURNS = 20;
export const EMPTY_CHAT: StoredChat = { at: 0, turns: [] };

function isTurn(value: unknown): value is ChatTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string";
}

export function isStale(chat: StoredChat, now = Date.now()) {
  return chat.turns.length > 0 && now - chat.at > CHAT_IDLE_MS;
}

// The chat saved in this tab; empty when there is none, it can't be read or it is stale.
export function readChat(raw: string | null, now = Date.now()): StoredChat {
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return EMPTY_CHAT;
    const { at, turns } = saved as Record<string, unknown>;
    if (typeof at !== "number" || !Array.isArray(turns)) return EMPTY_CHAT;
    const chat = { at, turns: turns.filter(isTurn).slice(-KEPT_TURNS) };
    return isStale(chat, now) ? EMPTY_CHAT : chat;
  } catch {
    return EMPTY_CHAT;
  }
}
