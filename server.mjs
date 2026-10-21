// Production server: `next start` plus the one thing it cannot do, which is
// decide which client address to trust. Rate limits key on the first
// X-Forwarded-For entry, and `next start` passes a client-supplied header
// through untouched, so anyone could pick their own address per request.
//
// TRUST_PROXY_HOPS is how many reverse proxies sit in front of this server
// (0 when browsers connect directly). The address that many hops back from
// the socket is the client; anything further left was typed by the client.
import { createServer } from "node:http";
import nextEnv from "@next/env";
import { clientAddress } from "./scripts/client-address.mjs";

process.env.NODE_ENV ??= "production";
// Load .env* now, as `next start` would, so TRUST_PROXY_HOPS, PORT and HOST
// set there are seen before they are read below.
nextEnv.loadEnvConfig(process.cwd(), false);
const { default: next } = await import("next");

const port = Number.parseInt(process.env.PORT ?? "43123", 10);
const host = process.env.HOST ?? "0.0.0.0";
const hops = Math.max(0, Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10) || 0);

const app = next({ dev: false, hostname: host, port });
const handle = app.getRequestHandler();
await app.prepare();

createServer((req, res) => {
  req.headers["x-forwarded-for"] = clientAddress(req.headers["x-forwarded-for"], req.socket.remoteAddress, hops);
  delete req.headers["x-real-ip"];
  // With no proxy in front, the scheme comes from the socket, not from the client.
  if (hops === 0) delete req.headers["x-forwarded-proto"];
  handle(req, res);
}).listen(port, host, () => {
  console.log(`> Ready on http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port} (trusting ${hops} proxy hop(s))`);
});
