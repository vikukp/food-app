// Picks the client address out of X-Forwarded-For plus the socket address,
// trusting only the last `trustedHops` proxies. Used by server.mjs.
export function clientAddress(forwardedFor, socketAddress, trustedHops) {
  const chain = String(forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  chain.push(socketAddress || "unknown");
  return chain[Math.max(0, chain.length - 1 - trustedHops)];
}
