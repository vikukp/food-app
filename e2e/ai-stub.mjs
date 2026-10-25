// A stand-in for the model behind the AI ordering assistant, speaking the
// Anthropic Messages API, so the browser suite needs no real key: asked for
// "2 masala dosa", it searches the menus, adds two of the first dish found and
// says so. Point the app at it with AI_ROUTER=custom and AI_BASE_URL.
import { createServer } from "node:http";

function message(content, stopReason) {
  return {
    id: "msg_stub",
    type: "message",
    role: "assistant",
    model: "stub",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function answer(request) {
  const last = request.messages.at(-1);
  if (typeof last.content === "string") {
    const [, count = "1", query] = last.content.match(/^(\d+)?\s*(.*)$/s);
    return message(
      [{ type: "tool_use", id: `toolu_search_${count}`, name: "search_menu", input: { query } }],
      "tool_use",
    );
  }
  const asked = request.messages.at(-2).content.find((block) => block.type === "tool_use");
  const result = JSON.parse(last.content[0].content);
  if (asked.name === "search_menu") {
    const dish = result.dishes?.[0];
    if (!dish) return message([{ type: "text", text: "I couldn't find that on any open menu." }], "end_turn");
    const quantity = Number(asked.id.split("_").at(-1));
    return message(
      [{ type: "tool_use", id: "toolu_add", name: "add_to_bag", input: { item_id: dish.item_id, quantity } }],
      "tool_use",
    );
  }
  if (result.error) return message([{ type: "text", text: `I couldn't add that: ${result.error}` }], "end_turn");
  return message(
    [{ type: "text", text: `Added ${result.added} ${result.dish} from ${result.stall}. Your bag is now ₹${result.bag.total}.` }],
    "end_turn",
  );
}

export function startAiStub(port) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const request = JSON.parse(body);
      requests.push({ headers: req.headers, body: request });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer(request)));
    });
  });
  server.listen(port, "127.0.0.1");
  server.unref();
  return { requests, close: () => server.close() };
}
