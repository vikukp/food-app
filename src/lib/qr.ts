import { QR_PREFIX, QR_SIG_CHARS } from "@/lib/qr-format";
import { sessionSecret } from "@/lib/secret";
import { hmacHex } from "@/lib/signed-token";

async function signature(token: string, orderId: string) {
  return (await hmacHex(sessionSecret(), `${token}|${orderId}`)).slice(0, QR_SIG_CHARS);
}

// Payload printed into the pickup QR. The signature lets a counter scanner
// reject fabricated or edited codes before touching the database.
export async function buildQrPayload(token: string, orderId: string) {
  return `${QR_PREFIX}|${token}|${orderId}|${await signature(token, orderId)}`;
}

export async function verifyQrPayload(payload: string) {
  const parts = payload.split("|");
  if (parts.length !== 4 || parts[0] !== QR_PREFIX) return null;
  const [, token, orderId, sig] = parts;
  if (!/^T-\d{4}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(orderId)) return null;
  const expected = await signature(token, orderId);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { token, orderId } : null;
}
