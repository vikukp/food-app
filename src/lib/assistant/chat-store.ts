// The chat with the assistant lasts while the app is open (the chat component
// keeps it in memory): moving between pages keeps it, a reload or a later
// visit starts a new one. Half an hour after its last message it is stale
// and starts over too, so an old conversation never goes to the model again.

export type ChatTurn = { role: "user" | "assistant"; text: string; failed?: boolean };
// at: when the last message was said (ms since epoch).
export type StoredChat = { at: number; turns: ChatTurn[] };

export const CHAT_IDLE_MS = 30 * 60_000;
export const KEPT_TURNS = 20;
export const EMPTY_CHAT: StoredChat = { at: 0, turns: [] };

export function isStale(chat: StoredChat, now = Date.now()) {
  return chat.turns.length > 0 && now - chat.at > CHAT_IDLE_MS;
}
