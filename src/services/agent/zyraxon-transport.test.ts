import { afterEach, describe, expect, it, vi } from "vitest";
import { makeZyraxonClient } from "./zyraxon-transport";
import { ZYRAXON_BASE_URL } from "../../stores/ai-provider-catalog";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

function installFetch(impl: (url: string, init: globalThis.RequestInit) => Promise<Response>) {
  const mock = vi.fn((input: unknown, init?: unknown) =>
    impl(String(input), (init ?? {}) as globalThis.RequestInit),
  );
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

const reply = (content: string, toolCalls?: unknown[]) => ({
  choices: [{ message: { content, tool_calls: toolCalls }, finish_reason: toolCalls ? "tool_calls" : "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
});

describe("ZYRAXON transport", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("posts the OpenAI wire format to the same-origin gateway route, keyless", async () => {
    const fetchMock = installFetch(async () => jsonResponse(reply("ঠিক আছে")));
    const client = makeZyraxonClient({ model: "zyraxon-apex" });

    const result = await client.complete({
      system: "be helpful",
      messages: [{ role: "user", content: "হ্যালো" }],
      tools: [],
    });

    expect(result.text).toBe("ঠিক আছে");
    expect(result.stopReason).toBe("end_turn");

    const [url, init] = fetchMock.mock.calls[0] as [string, globalThis.RequestInit];
    expect(url).toBe(`${ZYRAXON_BASE_URL}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("zyraxon-apex");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "হ্যালো" });
    // Same-origin relative path: the browser must not cross origins, and no
    // credential is sent because the gateway is public.
    expect(url.startsWith("/api/zyraxon/")).toBe(true);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("surfaces a tool call as a tool use the loop can act on", async () => {
    installFetch(async () =>
      jsonResponse(
        reply("", [
          {
            id: "call_1",
            type: "function",
            function: { name: "search_stock", arguments: '{"source":"mixkit","query":"fire"}' },
          },
        ]),
      ),
    );
    const client = makeZyraxonClient({ model: "zyraxon-apex" });

    const result = await client.complete({ messages: [{ role: "user", content: "fire" }], tools: [] });

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolUses).toEqual([
      { id: "call_1", name: "search_stock", input: { source: "mixkit", query: "fire" } },
    ]);
  });

  it("asks for another model when the gateway rejects the request", async () => {
    installFetch(async () => jsonResponse({ error: "nope" }, { ok: false, status: 503 }));
    const client = makeZyraxonClient({ model: "zyraxon-apex" });

    await expect(
      client.complete({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("never echoes an upstream body back to the user", async () => {
    installFetch(async () => jsonResponse({ secret: "leaked-token" }, { ok: false, status: 401 }));
    const client = makeZyraxonClient({ model: "zyraxon-apex" });

    await expect(
      client.complete({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    ).rejects.not.toThrow(/leaked-token/);
  });

  it("reports an unreachable gateway in plain language", async () => {
    installFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = makeZyraxonClient({ model: "zyraxon-apex" });

    await expect(
      client.complete({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    ).rejects.toThrow(/যোগাযোগ করা যায়নি/);
  });

  it("rejects a non-JSON or shapeless reply instead of pretending it worked", async () => {
    installFetch(async () =>
      ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error("bad"); } }) as unknown as Response,
    );
    const client = makeZyraxonClient({ model: "zyraxon-apex" });
    await expect(
      client.complete({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    ).rejects.toThrow(/not JSON/);

    installFetch(async () => jsonResponse({ nonsense: true }));
    const client2 = makeZyraxonClient({ model: "zyraxon-apex" });
    await expect(
      client2.complete({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    ).rejects.toThrow(/unsupported response/);
  });

  it("refuses to run without a model chosen in the chat box", () => {
    expect(() => makeZyraxonClient({ model: "   " })).toThrow(/Pick a ZYRAXON model/);
  });
});
