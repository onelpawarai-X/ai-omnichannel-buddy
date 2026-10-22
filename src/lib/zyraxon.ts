/**
 * ZYRAXON provider client.
 *
 * One endpoint only: /chat/completions. There is no speech and no image
 * endpoint. Multimodal models read images, video and audio straight out of the
 * message content and answer with edit instructions, so every modality the
 * editor accepts travels through this one call.
 *
 * Verified against the live provider:
 *   image_url  data:URL or http(s)  -> read
 *   video_url  data:URL or http(s)  -> read
 *   input_audio / audio_url / file  -> accepted, then dropped (no model hears it)
 *
 * Because audio never arrives, the editor sends sound as a labelled
 * spectrogram image. See engine/spectrogram.ts for the measurement notes.
 * Native OpenAI `tools` are accepted, but the models frequently answer in prose
 * instead, so the editor also parses fenced ```tool blocks out of the text.
 * Both paths are supported and both are fed back to the model.
 */
export const ZYRAXON_BASE = "https://zyraxonai.lovable.app/api/public/zyraxon/v1";

export type Modality = "text" | "image" | "video" | "audio" | "pdf";

export type ZyraxonModel = {
  id: string;
  name: string;
  description: string;
  input_modalities: Modality[];
  context_window: number;
  max_output_tokens: number;
  reasoning: boolean;
  /** measured wall-clock latency in ms, filled in by the capability registry */
  speed?: number;
  /** measured tool-call reliability 0..1 */
  reliability?: number;
};

export const FALLBACK_MODELS: ZyraxonModel[] = [
  { id: "zyraxon-cyber", name: "ZYRAXON Cyber", description: "All-rounder · image + video · 1M context", input_modalities: ["text", "image", "video", "audio"], context_window: 1000000, max_output_tokens: 512000, reasoning: true },
  { id: "zyraxon-genesis", name: "ZYRAXON Genesis", description: "Experimental · every modality", input_modalities: ["text", "image", "video", "audio"], context_window: 1000000, max_output_tokens: 512000, reasoning: true },
  { id: "zyraxon-titan", name: "ZYRAXON Titan", description: "Long output workhorse · 1M", input_modalities: ["text", "image", "video", "audio"], context_window: 1000000, max_output_tokens: 512000, reasoning: true },
  { id: "zyraxon-quantum", name: "ZYRAXON Quantum", description: "1M context · vision", input_modalities: ["text", "image", "video", "audio"], context_window: 1000000, max_output_tokens: 512000, reasoning: true },
  { id: "zyraxon-visionary", name: "ZYRAXON Visionary", description: "Image + video + PDF · 200K", input_modalities: ["text", "image", "video", "pdf"], context_window: 200000, max_output_tokens: 32000, reasoning: true },
  { id: "zyraxon-matrix", name: "ZYRAXON Matrix", description: "Vision + text · 1M context", input_modalities: ["text", "image"], context_window: 1048576, max_output_tokens: 131072, reasoning: true },
  { id: "zyraxon-codex", name: "ZYRAXON Codex", description: "Code + vision · 200K", input_modalities: ["text", "image"], context_window: 200000, max_output_tokens: 32000, reasoning: true },
  { id: "zyraxon-pulse", name: "ZYRAXON Pulse", description: "Low latency · 262K context", input_modalities: ["text"], context_window: 262144, max_output_tokens: 262144, reasoning: true },
  { id: "zyraxon-neural", name: "ZYRAXON Neural", description: "Balanced · 200K context", input_modalities: ["text"], context_window: 200000, max_output_tokens: 32000, reasoning: true },
  { id: "zyraxon-apex", name: "ZYRAXON Apex", description: "Flagship reasoning · 1M context", input_modalities: ["text"], context_window: 1048576, max_output_tokens: 131072, reasoning: true },
];

/** All-rounder default: reads text, image, video and audio with a 1M context window. */
export const DEFAULT_MODEL = "zyraxon-cyber";

/** Ordered roster the orchestration panel prefers when routing a job. */
export const AGENT_ROSTER = [
  "zyraxon-cyber",
  "zyraxon-genesis",
  "zyraxon-titan",
  "zyraxon-quantum",
  "zyraxon-visionary",
  "zyraxon-matrix",
  "zyraxon-pulse",
  "zyraxon-apex",
];

// ---------------------------------------------------------------------------
// Message + tool shapes (OpenAI-compatible, as the provider implements them)
// ---------------------------------------------------------------------------

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ChatUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  model: string;
  usage?: ChatUsage | undefined;
  reasoning?: string;
};

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Model catalogue + capability routing
// ---------------------------------------------------------------------------

export async function fetchZyraxonModels(): Promise<ZyraxonModel[]> {
  try {
    const res = await fetch(`${ZYRAXON_BASE}/models`);
    if (!res.ok) throw new ProviderError(`models ${res.status}`, res.status);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const models: ZyraxonModel[] = (json.data ?? []).map((m) => ({
      id: String(m["id"] ?? ""),
      name: String(m["display_name"] ?? m["name"] ?? m["id"] ?? ""),
      description: String(m["description"] ?? ""),
      input_modalities: (Array.isArray(m["input_modalities"]) ? m["input_modalities"] : ["text"]) as Modality[],
      context_window: Number(m["context_window"] ?? 0),
      max_output_tokens: Number(m["max_output_tokens"] ?? 0),
      reasoning: m["reasoning"] === true,
    }));
    return models.length ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

/**
 * Whether a model can read a modality, judged by what the provider honours
 * rather than what the catalogue advertises.
 *
 * Measured against the live provider: `image_url` and `video_url` work on the
 * models that advertise them. Audio does not work on any model - every audio
 * part type (`input_audio`, `audio_url`, `file`) is accepted with a 200 and
 * then silently dropped, and the model answers that it hears nothing. Sound
 * therefore travels to the model as a spectrogram picture; see
 * engine/spectrogram.ts.
 */
export function canHandle(model: ZyraxonModel | undefined, kind: Modality): boolean {
  if (!model) return true;
  if (kind === "text") return true;
  if (kind === "audio") return false;
  const mods = model.input_modalities;
  if (mods.includes(kind)) return true;
  if (kind === "video") return mods.includes("image");
  return false;
}

export function modelsForKind(models: ZyraxonModel[], kind: Modality): ZyraxonModel[] {
  const capable = models.filter((m) => canHandle(m, kind));
  return capable.length ? capable : models;
}

/** All-rounders first: image + video, then measured speed, then context, then roster order. */
export function sortModelsBySpeed(models: ZyraxonModel[]): ZyraxonModel[] {
  const rank = new Map(AGENT_ROSTER.map((id, index) => [id, index]));
  const breadth = (m: ZyraxonModel) => m.input_modalities.filter((k) => k === "image" || k === "video").length;
  return [...models].sort((a, b) => {
    const ba = breadth(b);
    const bb = breadth(a);
    if (ba !== bb) return ba - bb;
    const sa = a.speed ?? Number.POSITIVE_INFINITY;
    const sb = b.speed ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    if (a.context_window !== b.context_window) return b.context_window - a.context_window;
    return (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99);
  });
}

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

type RawMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{ id?: string; index?: number; function?: { name?: string; arguments?: string } }>;
};

type RawChoice = { message?: RawMessage; delta?: RawMessage; finish_reason?: string | null };
type RawResponse = { model?: string; choices?: RawChoice[]; usage?: ChatUsage };

function buildBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream };
  if (req.tools?.length) {
    body["tools"] = req.tools;
    body["tool_choice"] = "auto";
  }
  if (typeof req.temperature === "number") body["temperature"] = req.temperature;
  if (typeof req.maxTokens === "number") body["max_tokens"] = req.maxTokens;
  return body;
}

function requestInit(req: ChatRequest, stream: boolean): RequestInit {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(req, stream)),
  };
  if (req.signal) init.signal = req.signal;
  return init;
}

function normaliseToolCalls(raw: RawMessage | undefined): ToolCall[] {
  return (raw?.tool_calls ?? []).map((call, index) => ({
    id: call.id ?? `call_${index}`,
    type: "function" as const,
    function: { name: call.function?.name ?? "", arguments: call.function?.arguments ?? "{}" },
  }));
}

/** One non-streaming completion. Used for short planning steps. */
export async function completeChat(req: ChatRequest): Promise<ChatResult> {
  const res = await fetch(`${ZYRAXON_BASE}/chat/completions`, requestInit(req, false));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(`chat ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  const json = (await res.json()) as RawResponse;
  const choice = json.choices?.[0];
  const result: ChatResult = {
    content: typeof choice?.message?.content === "string" ? choice.message.content : "",
    toolCalls: normaliseToolCalls(choice?.message),
    model: json.model ?? req.model,
  };
  if (json.usage) result.usage = json.usage;
  if (typeof choice?.message?.reasoning_content === "string") result.reasoning = choice.message.reasoning_content;
  return result;
}

// ---------------------------------------------------------------------------
// Streaming: chat/completions with server-sent events
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; result: ChatResult };

/** Accumulates OpenAI-style tool-call deltas, which arrive name-first then arguments in fragments. */
export class ToolCallAccumulator {
  private calls = new Map<number, { id: string; name: string; args: string }>();

  push(deltas: RawMessage["tool_calls"]): void {
    for (const delta of deltas ?? []) {
      const index = delta.index ?? 0;
      const entry = this.calls.get(index) ?? { id: "", name: "", args: "" };
      if (delta.id) entry.id = delta.id;
      if (delta.function?.name) entry.name = delta.function.name;
      if (delta.function?.arguments) entry.args += delta.function.arguments;
      this.calls.set(index, entry);
    }
  }

  result(): ToolCall[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, entry]) => ({
        id: entry.id || `call_${index}`,
        type: "function" as const,
        function: { name: entry.name, arguments: entry.args || "{}" },
      }));
  }
}

type DeltaRead = {
  text: string;
  reasoning: string;
  model?: string;
  usage?: ChatUsage;
};

type SseChoiceDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type SsePayload = {
  model?: string;
  usage?: ChatUsage;
  choices?: Array<{ delta?: SseChoiceDelta; message?: SseChoiceDelta }>;
};

function readDelta(payload: string, toolCalls: ToolCallAccumulator): DeltaRead {
  const out: DeltaRead = { text: "", reasoning: "" };
  let json: SsePayload;
  try {
    json = JSON.parse(payload) as SsePayload;
  } catch {
    return out;
  }
  if (json.model) out.model = json.model;
  if (json.usage) out.usage = json.usage;
  const choice = json.choices?.[0];
  const delta = choice?.delta ?? choice?.message;
  if (!delta) return out;
  if (typeof delta.content === "string") out.text = delta.content;
  const reason = delta.reasoning_content ?? delta.reasoning;
  if (typeof reason === "string") out.reasoning = reason;
  if (delta.tool_calls) toolCalls.push(delta.tool_calls);
  return out;
}

/** Split a raw SSE byte stream into `data:` payloads, keeping the tail buffered. */
export function createSseParser(): {
  feed: (chunk: string) => string[];
  flush: () => string[];
} {
  let buffer = "";
  return {
    feed(chunk) {
      buffer += chunk;
      const payloads: string[] = [];
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.startsWith("data:")) payloads.push(line.slice(5).trim());
        index = buffer.indexOf("\n");
      }
      return payloads;
    },
    flush() {
      const line = buffer.trim();
      buffer = "";
      return line.startsWith("data:") ? [line.slice(5).trim()] : [];
    },
  };
}

/**
 * Stream a chat completion as SSE. Yields text deltas as they arrive, then a
 * final `done` event carrying the assembled content and any tool calls.
 */
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${ZYRAXON_BASE}/chat/completions`, requestInit(req, true));
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(`chat ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser();
  const toolCalls = new ToolCallAccumulator();
  let content = "";
  let model = req.model;
  let usage: ChatUsage | undefined;
  let reasoning = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const payloads = done ? parser.flush() : parser.feed(value);
      for (const payload of payloads) {
        const delta = readDelta(payload, toolCalls);
        if (delta.text) {
          content += delta.text;
          yield { type: "text", delta: delta.text };
        }
        if (delta.reasoning) reasoning += delta.reasoning;
        if (delta.model) model = delta.model;
        if (delta.usage) usage = delta.usage;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const result: ChatResult = { content, toolCalls: toolCalls.result(), model };
  if (usage) result.usage = usage;
  if (reasoning) result.reasoning = reasoning;
  for (const call of result.toolCalls) yield { type: "tool_call", call };
  yield { type: "done", result };
}
