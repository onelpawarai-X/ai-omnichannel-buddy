/**
 * The ZYRAXON public gateway client.
 *
 * One host serves the editing model and the speech medium. Every route is
 * public and sends `access-control-allow-origin: *`, so the browser calls it
 * directly: no proxy, no key, no server round-trip of our own.
 *
 * Speech-to-text is deliberately absent. Dictation runs in the browser's own
 * recogniser (see `useDictation`), because the gateway refuses the audio
 * containers a browser recording produces. Text-to-speech does go through the
 * gateway, since it returns a plain audio/mpeg stream.
 */
import { zyraxonEndpoint, zyraxonSpeechEndpoint } from "../stores/ai-provider-catalog";

/**
 * Speech lives beside the model API, not under the `/v1` prefix. It goes
 * through the same same-origin route as chat, so the browser never has to
 * cross origins for the gateway.
 */
export const ZYRAXON_SPEECH = {
  tts: "/tts",
  voices: "/tts/voices",
} as const;

const REQUEST_TIMEOUT_MS = 120_000;

export class ZyraxonError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ZyraxonError";
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
          ? parsed.message
          : null;
    if (message) return message;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.slice(0, 200);
}

/** A fetch against the gateway with a timeout that also honours the caller's signal. */
export async function zyraxonFetch(
  url: string,
  init: globalThis.RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: combined });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ZyraxonError("ZYRAXON did not answer in time.");
    }
    throw new ZyraxonError(
      "Could not reach the ZYRAXON gateway. Check the network connection.",
    );
  }
  if (!response.ok) {
    throw new ZyraxonError(await readError(response), response.status);
  }
  return response;
}

// ---- Model catalogue --------------------------------------------------------

export interface ZyraxonModelRecord {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities: readonly string[];
  readonly routedModalities: readonly string[];
}

/**
 * Read the live catalogue. The provider rotates its pool, so the routed
 * modality list here is the truth for the current moment; the bundled
 * catalogue is only a fallback for an offline first paint.
 */
export async function listModels(signal?: AbortSignal): Promise<ZyraxonModelRecord[]> {
  const response = await zyraxonFetch(zyraxonEndpoint("/models"), { method: "GET" }, signal);
  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  return (payload.data ?? [])
    .map((entry) => ({
      id: String(entry.id ?? ""),
      displayName: String(entry.display_name ?? entry.name ?? entry.id ?? ""),
      description:
        typeof entry.description === "string" ? entry.description : undefined,
      contextWindow:
        typeof entry.context_window === "number" ? entry.context_window : undefined,
      maxOutputTokens:
        typeof entry.max_output_tokens === "number" ? entry.max_output_tokens : undefined,
      inputModalities: Array.isArray(entry.input_modalities)
        ? entry.input_modalities.map(String)
        : [],
      routedModalities: Array.isArray(entry.routed_modalities)
        ? entry.routed_modalities.map(String)
        : [],
    }))
    .filter((model) => model.id !== "");
}

export interface ZyraxonProviderStatus {
  readonly fleet?: unknown;
  readonly concurrency?: unknown;
  readonly modalities?: unknown;
  readonly models?: Array<Record<string, unknown>>;
}

/** Live pool status: which models are serving and at what concurrency. */
export async function providerStatus(
  signal?: AbortSignal,
): Promise<ZyraxonProviderStatus> {
  const response = await zyraxonFetch(
    zyraxonEndpoint("/provider"),
    { method: "GET" },
    signal,
  );
  return (await response.json()) as ZyraxonProviderStatus;
}

// ---- Text to speech ---------------------------------------------------------

export interface ZyraxonVoice {
  readonly name: string;
  readonly locale: string;
  readonly gender: string;
  readonly friendly: string;
}

interface VoicesPayload {
  readonly data?: Array<Record<string, unknown>>;
  readonly languages?: string[];
  readonly locales?: string[];
}

/** The 322 gateway voices, grouped by locale. */
export async function listVoices(signal?: AbortSignal): Promise<{
  voices: ZyraxonVoice[];
  languages: string[];
  locales: string[];
}> {
  const response = await zyraxonFetch(zyraxonSpeechEndpoint(ZYRAXON_SPEECH.voices), { method: "GET" }, signal);
  const payload = (await response.json()) as VoicesPayload;
  const voices = (payload.data ?? [])
    .map((entry) => ({
      name: String(entry.name ?? ""),
      locale: String(entry.locale ?? ""),
      gender: String(entry.gender ?? ""),
      friendly: String(entry.friendly ?? entry.name ?? ""),
    }))
    .filter((voice) => voice.name !== "");
  return {
    voices,
    languages: Array.isArray(payload.languages) ? payload.languages.map(String) : [],
    locales: Array.isArray(payload.locales) ? payload.locales.map(String) : [],
  };
}

export interface SpeakOptions {
  readonly voice: string;
  readonly signal?: AbortSignal;
}

/** Synthesise speech and return the audio bytes. */
export async function speak(
  text: string,
  options: SpeakOptions,
): Promise<Blob> {
  const trimmed = text.trim();
  if (!trimmed) throw new ZyraxonError("There is no text to speak.");
  const response = await zyraxonFetch(
    zyraxonSpeechEndpoint(ZYRAXON_SPEECH.tts),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, voice: options.voice }),
    },
    options.signal,
  );
  const blob = await response.blob();
  if (!blob.size) throw new ZyraxonError("The gateway returned an empty audio stream.");
  return blob;
}
