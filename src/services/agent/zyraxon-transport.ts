/**
 * The LLM client the editing agent talks to.
 *
 * ZYRAXON is the only provider and it is keyless, so there is no adapter
 * choice and nothing here reads user settings. The request goes to the
 * same-origin `/api/zyraxon` route rather than to the gateway host: a direct
 * cross-origin post is blocked by the browser as soon as the body carries
 * `tools`, so plain chat appeared to work while every edit failed.
 */
import {
  makeClientFromSend,
  withRetry,
  LLMHttpError,
  parseRetryAfterMs,
  type LLMClient,
} from "@openreel/agent";
import { zyraxonEndpoint } from "../../stores/ai-provider-catalog";

export interface ZyraxonClientOptions {
  readonly model: string;
  readonly signal?: AbortSignal;
  /** Ceiling for one completion. The turn loop also enforces a step budget. */
  readonly maxTokens?: number;
  /**
   * Absolute base URL for the gateway. Defaults to the same-origin proxy path,
   * which is what the browser needs. A Node harness has no page origin to
   * resolve that path against, so it passes the gateway host explicitly.
   */
  readonly baseUrl?: string;
}

export function makeZyraxonClient(options: ZyraxonClientOptions): LLMClient {
  const model = options.model.trim();
  const baseUrl = options.baseUrl ?? zyraxonEndpoint("");
  if (!model) throw new Error("Pick a ZYRAXON model in the chat box.");

  const send = withRetry(
    async (body: unknown): Promise<unknown> => {
      options.signal?.throwIfAborted();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          // Only a simple header, so the call needs no CORS preflight.
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new Error(
          "গেটওয়ের সাথে যোগাযোগ করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।",
        );
      }
      // Never surface the upstream body: a gateway may echo the request back.
      if (!response.ok) {
        throw new LLMHttpError(
          `ZYRAXON returned HTTP ${response.status}. Try another model or send the edit again.`,
          response.status,
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
      }
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new Error("ZYRAXON returned a response that was not JSON.");
      }
      if (!raw || typeof raw !== "object" || !("choices" in raw)) {
        throw new Error(
          "ZYRAXON returned an unsupported response. Choose another model and retry.",
        );
      }
      return raw;
    },
    { signal: options.signal, retries: 2 },
  );

  return makeClientFromSend({
    provider: "openai",
    model,
    maxTokens: options.maxTokens,
    omitMaxTokens: options.maxTokens === undefined,
    send,
  });
}
