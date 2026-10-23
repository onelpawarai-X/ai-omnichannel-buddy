/**
 * Provider catalogue for the AI editor connection.
 *
 * There is exactly one provider: the public ZYRAXON gateway. It speaks the
 * OpenAI chat-completions wire format and needs no key, so the transport never
 * has to choose an adapter and the UI never has to ask for a credential.
 *
 * Two media are used, and each one is wired to a different ZYRAXON surface:
 * the chat medium drives the editing model, and the speech medium drives
 * dictation and narration. Both are permanent — the user picks a model from
 * the chat box, never an endpoint or a key.
 */

export type AIProviderId = "zyraxon";

/** ZYRAXON speaks OpenAI chat-completions; this stays for transport parity. */
export type AIWireFormat = "openai";

/** Input kinds a model can accept. Mirrors the provider's own modality names. */
export type AIModality = "text" | "image" | "video" | "audio" | "pdf";

export interface AIModelOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities: readonly AIModality[];
  /** Modalities the gateway actually routes for this model right now. */
  readonly routedModalities: readonly AIModality[];
  readonly reasoning?: boolean;
}

export interface AIProviderPreset {
  readonly id: AIProviderId;
  readonly label: string;
  readonly wire: AIWireFormat;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly models: readonly AIModelOption[];
  /** No credential required: sending an empty key is valid. */
  readonly keyless: boolean;
  readonly note?: string;
}

/** The one public gateway. */
export const ZYRAXON_BASE_URL =
  "https://zyraxonai.lovable.app/api/public/zyraxon/v1";

const text = ["text"] as const;
const textImage = ["text", "image"] as const;
const textImageVideoPdf = ["text", "image", "video", "pdf"] as const;

/**
 * The ten ZYRAXON models. `inputModalities` is what the model accepts and
 * `routedModalities` is what the serving pool routes today; the picker prints
 * the routed list, which is the honest one for an editing turn.
 */
export const ZYRAXON_MODELS: readonly AIModelOption[] = [
  {
    id: "zyraxon-apex",
    label: "ZYRAXON Apex",
    description: "Flagship reasoning · 1M context · 131K output",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: ["text", "image", "video", "pdf"],
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-matrix",
    label: "ZYRAXON Matrix",
    description: "Vision + text · 1M context · deep reasoning",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: ["text", "image"],
    routedModalities: textImage,
    reasoning: true,
  },
  {
    id: "zyraxon-pulse",
    label: "ZYRAXON Pulse",
    description: "Lowest latency · 262K context · 262K output",
    contextWindow: 262144,
    maxOutputTokens: 262144,
    inputModalities: text,
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-titan",
    label: "ZYRAXON Titan",
    description: "Long-output workhorse · 1M context · 131K output",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: ["text", "image", "video"],
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-neural",
    label: "ZYRAXON Neural",
    description: "Balanced general intelligence · 200K context",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputModalities: text,
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-codex",
    label: "ZYRAXON Codex",
    description: "Writes and repairs code · code + vision",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputModalities: textImage,
    routedModalities: textImage,
    reasoning: true,
  },
  {
    id: "zyraxon-visionary",
    label: "ZYRAXON Visionary",
    description: "Reads frames, video and documents · 200K context",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputModalities: textImageVideoPdf,
    routedModalities: textImageVideoPdf,
    reasoning: true,
  },
  {
    id: "zyraxon-cyber",
    label: "ZYRAXON Cyber",
    description: "Every input modality in one model · 1M context",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: ["text", "image", "video", "audio", "pdf"],
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-quantum",
    label: "ZYRAXON Quantum",
    description: "High-throughput reasoning · 1M context",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: text,
    routedModalities: text,
    reasoning: true,
  },
  {
    id: "zyraxon-genesis",
    label: "ZYRAXON Genesis",
    description: "Creative generation · 1M context",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputModalities: text,
    routedModalities: text,
    reasoning: true,
  },
];

/**
 * The editing agent reads extracted frames and video stills, so the default
 * model is the one whose routed modalities include image and video. A text-only
 * model would silently answer "I cannot see the frame".
 */
export function pickDefaultModel(): string {
  const vision = ZYRAXON_MODELS.find(
    (m) => m.routedModalities.includes("image") && m.routedModalities.includes("video"),
  );
  return vision?.id ?? ZYRAXON_MODELS[0].id;
}

const ZYRAXON_PRESET: AIProviderPreset = {
  id: "zyraxon",
  label: "ZYRAXON",
  wire: "openai",
  baseUrl: ZYRAXON_BASE_URL,
  defaultModel: pickDefaultModel(),
  models: ZYRAXON_MODELS,
  keyless: true,
  note: "Permanent public gateway — no key, no endpoint to configure. Visionary reads frames and video; the chat box switches model at any time.",
};

export const AI_PROVIDER_PRESETS: readonly AIProviderPreset[] = [ZYRAXON_PRESET];

const BY_ID = new Map(AI_PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function providerPreset(id: AIProviderId): AIProviderPreset {
  return BY_ID.get(id) ?? ZYRAXON_PRESET;
}

export function wireFormatFor(id: AIProviderId): AIWireFormat {
  return providerPreset(id).wire;
}

/** ZYRAXON is the only provider, so every id resolves to the OpenAI wire. */
export function resolveWire(_provider: string): AIWireFormat {
  return "openai";
}

export function isKeyless(_id: AIProviderId): boolean {
  return true;
}

export function modelsForProvider(_id: AIProviderId): readonly AIModelOption[] {
  return ZYRAXON_MODELS;
}

/** Modalities a model declares, looked up by model id. */
export function modalitiesFor(
  _id: AIProviderId,
  model: string,
): readonly AIModality[] {
  const known = ZYRAXON_MODELS.find((m) => m.id === model);
  return known?.inputModalities ?? ["text"];
}

/** True when the provider id is the one this catalogue knows. */
export function isKnownProviderId(value: unknown): value is AIProviderId {
  return value === "zyraxon";
}

/** Backwards-compatible defaults map (provider id → baseUrl + default model). */
export const AI_PROVIDER_DEFAULTS: Record<
  string,
  { baseUrl: string; model: string }
> = {
  zyraxon: { baseUrl: ZYRAXON_BASE_URL, model: ZYRAXON_PRESET.defaultModel },
};
