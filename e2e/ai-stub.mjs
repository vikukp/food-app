// A stand-in for the model behind the AI ordering assistant, so tests need no
// real key. It speaks Anthropic's Messages API and OpenAI's Responses API:
// asked for "2 masala dosa", it searches the menus, adds two of the first dish
// found and says so. Point the app at it with AI_ROUTER=custom (or openai,
// with /v1 on the address) and AI_BASE_URL.
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

// The same over the Responses API: each tool call comes with encrypted
// reasoning, and like OpenAI the stub refuses a call sent back without it.
function response(output) {
  return {
    id: "resp_stub",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "stub",
    output,
    usage: {
      input_tokens: 3,
      input_tokens_details: { cached_tokens: 1, cache_write_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 4,
    },
  };
}

const callTool = (id, name, input) => [
  { type: "reasoning", id: `rs_${id}`, summary: [], encrypted_content: `sealed-${id}` },
  { type: "function_call", id: `fc_${id}`, call_id: id, name, arguments: JSON.stringify(input), status: "completed" },
];

const say = (text) => [
  { type: "message", id: "msg_stub", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] },
];

function answerResponse(request) {
  const { input } = request;
  for (const [index, item] of input.entries()) {
    if (item.type === "function_call" && input[index - 1]?.encrypted_content !== `sealed-${item.call_id}`) {
      const error = `Item '${item.id}' of type 'function_call' was provided without its required 'reasoning' item.`;
      return [400, { error: { message: error, type: "invalid_request_error" } }];
    }
  }
  const last = input.at(-1);
  if (last.role === "user") {
    const [, count = "1", query] = last.content.match(/^(\d+)?\s*(.*)$/s);
    return [200, response(callTool(`call_search_${count}`, "search_menu", { query }))];
  }
  const asked = input.find((item) => item.type === "function_call" && item.call_id === last.call_id);
  const result = JSON.parse(last.output);
  if (asked.name === "search_menu") {
    const dish = result.dishes?.[0];
    if (!dish) return [200, response(say("I couldn't find that on any open menu."))];
    const quantity = Number(asked.call_id.split("_").at(-1));
    return [200, response(callTool("call_add", "add_to_bag", { item_id: dish.item_id, quantity }))];
  }
  if (result.error) return [200, response(say(`I couldn't add that: ${result.error}`))];
  return [200, response(say(`Added ${result.added} ${result.dish} from ${result.stall}. Your bag is now ₹${result.bag.total}.`))];
}

// Port 0 picks a free one: await `listening` for it.
export function startAiStub(port) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const path = req.url.split("?")[0];
      if (req.method !== "POST" || (path !== "/v1/messages" && path !== "/v1/responses")) {
        res.writeHead(404).end();
        return;
      }
      const request = JSON.parse(body);
      requests.push({ path, headers: req.headers, body: request });
      const [status, reply] = path === "/v1/responses" ? answerResponse(request) : [200, answer(request)];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  const listening = new Promise((resolve) => server.once("listening", () => resolve(server.address().port)));
  server.listen(port, "127.0.0.1");
  server.unref();
  return { requests, listening, close: () => server.close() };
}
