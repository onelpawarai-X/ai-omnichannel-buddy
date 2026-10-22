/**
 * Server-side helpers for the media routes.
 *
 * Browsers cannot fetch several of the sources the editor uses: YouTube CDN
 * links are IP-locked, some stock hosts omit CORS headers, and video seeking
 * needs HTTP range requests. These helpers run on the server, where none of
 * those restrictions apply, and stream the bytes back unchanged.
 */

const FORWARD_HEADERS = ["range", "if-range", "accept", "accept-language", "user-agent"];

export function upstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("user-agent")) headers.set("user-agent", "Mozilla/5.0 (compatible; ZyraxonStudio/1.0)");
  return headers;
}

/** Headers worth passing back to the browser, plus permissive CORS. */
export function downstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", "content-range, content-length, accept-ranges");
  headers.set("cache-control", "public, max-age=3600");
  return headers;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "[::1]") return true;
  // private IPv4 ranges
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export type ProxyResult = { ok: true; response: Response } | { ok: false; status: number; message: string };

/**
 * Fetch an upstream media URL and return a streamable response. Range headers
 * are forwarded so `<video>` seeking works through the proxy.
 */
export async function proxyMedia(rawUrl: string, request: Request): Promise<ProxyResult> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, message: "invalid url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, status: 400, message: "only http(s) is proxied" };
  }
  if (isBlockedHost(target.hostname)) {
    return { ok: false, status: 403, message: "host not allowed" };
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders(request),
      redirect: "follow",
    });
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "upstream failed" };
  }

  if (!upstream.ok && upstream.status !== 206) {
    return { ok: false, status: upstream.status, message: `upstream ${upstream.status}` };
  }
  return {
    ok: true,
    response: new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: downstreamHeaders(upstream.headers),
    }),
  };
}
