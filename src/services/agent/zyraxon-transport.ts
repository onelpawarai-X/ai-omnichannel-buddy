/**
 * The LLM client the editing agent talks to.
 *
 * ZYRAXON is the only provider, it is keyless, and its host sends permissive
 * CORS, so the browser posts straight to `/chat/completions`. There is no
 * adapter choice, no key, and no same-origin proxy in the path — the endpoint
 * is a permanent constant, which is why nothing here reads user settings.
 */
import {
  makeClientFromSend,
  withRetry,
  LLMHttpError,
  parseRetryAfterMs,
  type LLMClient,
} from "@openreel/agent";
import { ZYRAXON_BASE_URL } from "../../stores/ai-provider-catalog";

/** Any non-empty string satisfies a client that insists on a key. */
const KEYLESS_PLACEHOLDER = "zyraxon";

export interface ZyraxonClientOptions {
  readonly model: string;
  readonly signal?: AbortSignal;
  /** Ceiling for one completion. The turn loop also enforces a step budget. */
  readonly maxTokens?: number;
}

export function makeZyraxonClient(options: ZyraxonClientOptions): LLMClient {
  const model = options.model.trim();
  if (!model) throw new Error("Pick a ZYRAXON model in the chat box.");

  const send = withRetry(
    async (body: unknown): Promise<unknown> => {
      options.signal?.throwIfAborted();
      let response: Response;
      try {
        response = await fetch(`${ZYRAXON_BASE_URL}/chat/completions`, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${KEYLESS_PLACEHOLDER}`,
          },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new Error(
          "Could not reach the ZYRAXON gateway. Check the network connection.",
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
