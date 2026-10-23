/**
 * Same-origin proxy for the ZYRAXON gateway.
 *
 * The browser cannot post a tool-enabled body straight to the gateway: that
 * request leaves the page cross-origin and is blocked before it is sent, while
 * a plain message and the model list happen to pass. The result looked like a
 * dead endpoint even though the gateway was healthy, which is why plain chat
 * "sometimes" worked and every edit failed.
 *
 * Routing through our own origin removes the cross-origin hop entirely. The
 * gateway is public, so the proxied request carries no credential at all —
 * only the path and body are forwarded.
 *
 * Shared by the Cloudflare Pages Function (production) and the Vite dev
 * middleware, so the two paths cannot drift.
 */

const UPSTREAM_ORIGIN = "https://zyraxonai.lovable.app";
const UPSTREAM_PUBLIC = "/api/public";

/** Browser prefix; the rest of the path selects the upstream route. */
export const ZYRAXON_PROXY_PREFIX = "/api/zyraxon";

/**
 * The complete set of routes the editor uses, each with the one method it
 * takes. An allowlist rather than a passthrough, so this can never be driven
 * as a general proxy.
 */
const ROUTES: Record<string, string> = {
  "v1/chat/completions": "POST",
  "v1/models": "GET",
  "v1/provider": "GET",
  tts: "POST",
  "tts/voices": "GET",
};

/** The route suffix after the browser prefix, or null when unrecognised. */
function routeSuffix(pathname: string): string | null {
  if (!pathname.startsWith(`${ZYRAXON_PROXY_PREFIX}/`)) return null;
  const rest = pathname.slice(ZYRAXON_PROXY_PREFIX.length + 1);
  return rest in ROUTES ? rest : null;
}

/** Upstream URL, or null when the path is not one we forward. */
export function zyraxonUpstreamUrl(pathname: string, search = ""): string | null {
  const rest = routeSuffix(pathname);
  if (!rest) return null;
  // Speech lives beside the model API, not under the `/v1` prefix.
  return rest.startsWith("v1/")
    ? `${UPSTREAM_ORIGIN}${UPSTREAM_PUBLIC}/zyraxon/${rest}${search}`
    : `${UPSTREAM_ORIGIN}${UPSTREAM_PUBLIC}/${rest}${search}`;
}

/** True when the route exists and takes this method. */
export function zyraxonMethodAllowed(pathname: string, method: string): boolean {
  if (method === "OPTIONS") return routeSuffix(pathname) !== null;
  const rest = routeSuffix(pathname);
  if (!rest) return false;
  return method === ROUTES[rest] || (method === "HEAD" && ROUTES[rest] === "GET");
}

const MAX_BODY_BYTES = 8_388_608; // 8 MB: tool catalogues are large but bounded
const UPSTREAM_TIMEOUT_MS = 120_000;

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

/**
 * Forward one browser request to the gateway. Returns a Response for every
 * outcome, so callers never have to translate an exception.
 */
export async function zyraxonProxyResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Path first, then method: an unknown route is a 404, not a 405.
  const target = zyraxonUpstreamUrl(pathname, url.search);
  if (!target) return json({ error: "Unknown ZYRAXON route" }, 404);
  if (!zyraxonMethodAllowed(pathname, request.method)) {
    return json({ error: "Method not allowed for this route" }, 405);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return json({ error: "Request body too large" }, 413);
    }
    const raw = await request.arrayBuffer().catch(() => null);
    if (raw === null) return json({ error: "Could not read the request body" }, 400);
    if (raw.byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request body too large" }, 413);
    }
    body = raw;
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The ZYRAXON gateway did not answer in time."
        : "Could not reach the ZYRAXON gateway.";
    return json({ error: message }, 502);
  }

  // Stream the body straight through: narration returns audio, chat returns JSON.
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
