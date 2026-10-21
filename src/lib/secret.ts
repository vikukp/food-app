const MIN_LENGTH = 32;

// `npm run dev|build|start` write a random SESSION_SECRET to .env.local when
// one is not already set, so a fresh checkout never runs with a known secret.
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_LENGTH) {
    throw new Error(
      `SESSION_SECRET is missing or shorter than ${MIN_LENGTH} characters. ` +
        "Run `npm run dev` or `npm run build` once to generate one in .env.local, or set it in the environment.",
    );
  }
  return secret;
}
