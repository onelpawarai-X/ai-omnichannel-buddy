import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ZYRAXON_PROXY_PREFIX,
  zyraxonMethodAllowed,
  zyraxonProxyResponse,
  zyraxonUpstreamUrl,
} from "./zyraxon";

const realFetch = globalThis.fetch;
const ORIGIN = "http://localhost:5199";

const post = (path: string, body: unknown = { model: "zyraxon-apex" }) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("ZYRAXON same-origin proxy", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("maps chat and speech routes onto the public gateway paths", () => {
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/v1/chat/completions`)).toBe(
      "https://zyraxonai.lovable.app/api/public/zyraxon/v1/chat/completions",
    );
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/v1/models`)).toBe(
      "https://zyraxonai.lovable.app/api/public/zyraxon/v1/models",
    );
    // Speech sits beside the model API, not under /v1.
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/tts`)).toBe(
      "https://zyraxonai.lovable.app/api/public/tts",
    );
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/tts/voices`)).toBe(
      "https://zyraxonai.lovable.app/api/public/tts/voices",
    );
  });

  it("keeps the query string and refuses anything it does not serve", () => {
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/tts/voices`, "?locale=bn")).toBe(
      "https://zyraxonai.lovable.app/api/public/tts/voices?locale=bn",
    );
    expect(zyraxonUpstreamUrl(`${ZYRAXON_PROXY_PREFIX}/v1/unknown`)).toBeNull();
    expect(zyraxonUpstreamUrl("/api/stock")).toBeNull();
  });

  it("allows only the method each route needs, so it is not a general proxy", () => {
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/v1/chat/completions`, "POST")).toBe(true);
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/v1/chat/completions`, "GET")).toBe(false);
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/v1/models`, "GET")).toBe(true);
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/v1/models`, "DELETE")).toBe(false);
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/tts`, "POST")).toBe(true);
    expect(zyraxonMethodAllowed(`${ZYRAXON_PROXY_PREFIX}/tts/voices`, "GET")).toBe(true);
  });

  it("forwards a tool-enabled body untouched and streams the reply back", async () => {
    const upstream = { choices: [{ message: { content: "ঠিক আছে" } }] };
    let seenUrl = "";
    let seenBody = "";
    let seenAuth: string | null = "unset";
    globalThis.fetch = vi.fn(async (input: unknown, init?: globalThis.RequestInit) => {
      seenUrl = String(input);
      seenBody = new TextDecoder().decode(init?.body as ArrayBuffer);
      seenAuth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify(upstream), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const tools = [{ type: "function", function: { name: "add_track" } }];
    const response = await zyraxonProxyResponse(
      post(`${ZYRAXON_PROXY_PREFIX}/v1/chat/completions`, { model: "zyraxon-apex", tools }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(upstream);
    expect(seenUrl).toBe(
      "https://zyraxonai.lovable.app/api/public/zyraxon/v1/chat/completions",
    );
    expect(JSON.parse(seenBody).tools).toEqual(tools);
    // The gateway is public: no credential is invented or forwarded.
    expect(seenAuth).toBeNull();
  });

  it("returns 405 for a method the route does not take and 404 for an unknown path", async () => {
    const wrongMethod = await zyraxonProxyResponse(
      new Request(`${ORIGIN}${ZYRAXON_PROXY_PREFIX}/v1/models`, { method: "POST" }),
    );
    expect(wrongMethod.status).toBe(405);

    const unknown = await zyraxonProxyResponse(post(`${ZYRAXON_PROXY_PREFIX}/v1/nope`));
    expect(unknown.status).toBe(404);
  });

  it("reports an unreachable gateway as a 502 instead of throwing", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const response = await zyraxonProxyResponse(
      post(`${ZYRAXON_PROXY_PREFIX}/v1/chat/completions`),
    );
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/gateway/);
  });
});
