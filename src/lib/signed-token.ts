// HMAC-signed, expiring tokens built on Web Crypto so the same code runs in the
// proxy and in server actions.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacHex(secret: string, message: string) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyToken<T extends Record<string, unknown>>(
  token: string | undefined,
  secret: string,
): Promise<(T & { exp: number }) | null> {
  if (!token || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = fromBase64Url(token.slice(dot + 1));
  if (!sig) return null;

  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(body));
  if (!valid) return null;

  const raw = fromBase64Url(body);
  if (!raw) return null;
  try {
    const payload = JSON.parse(decoder.decode(raw)) as T & { exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload as T & { exp: number };
  } catch {
    return null;
  }
}
