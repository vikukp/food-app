// A browser POST carries Origin; it must name this site. Behind proxies
// X-Forwarded-Host may be a list (the first is what the browser used), and a
// default port may appear on one side only.
export function sameSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  try {
    const url = new URL(origin);
    const bare = (value: string) => value.replace(url.protocol === "https:" ? /:443$/ : /:80$/, "");
    return bare(url.host) === bare(host);
  } catch {
    return false;
  }
}
