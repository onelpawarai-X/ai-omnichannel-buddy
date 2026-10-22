/**
 * Provider catalogue for the AI editor connection.
 *
 * Every provider here speaks one of two wire formats — OpenAI chat completions
 * or Anthropic messages — so the transport only needs the format, not a new
 * adapter per vendor. `keyless` providers accept an empty key, which is how the
 * public ZYRAXON gateway and local runtimes work.
 */

export type AIProviderId =
  | "openai"
  | "anthropic"
  | "zyraxon"
  | "gemini"
  | "groq"
  | "openrouter"
  | "deepseek"
  | "xai"
  | "mistral"
  | "compatible";

export type AIWireFormat = "openai" | "anthropic";

/** Input kinds a model can accept. Mirrors the provider's own modality names. */
export type AIModality = "text" | "image" | "video" | "audio" | "pdf";

export interface AIModelOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities: readonly AIModality[];
}

export interface AIProviderPreset {
  readonly id: AIProviderId;
  readonly label: string;
  readonly wire: AIWireFormat;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly models: readonly AIModelOption[];
  /** No credential required: sending an empty key is valid. */
  readonly keyless?: boolean;
  /** Where the user creates a key. */
  readonly keyUrl?: string;
  readonly note?: string;
}

const text = ["text"] as const;
const textImage = ["text", "image"] as const;

/** ZYRAXON's public gateway: no key, and its own ten-model catalogue. */
const ZYRAXON_MODELS: readonly AIModelOption[] = [
  { id: "zyraxon-apex", label: "ZYRAXON Apex", description: "Flagship reasoning · 1M context · 131K output", contextWindow: 1048576, maxOutputTokens: 131072, inputModalities: text },
  { id: "zyraxon-matrix", label: "ZYRAXON Matrix", description: "Vision + text · 1M context · deep reasoning", contextWindow: 1048576, maxOutputTokens: 131072, inputModalities: textImage },
  { id: "zyraxon-pulse", label: "ZYRAXON Pulse", description: "Low latency · 262K context · 262K output", contextWindow: 262144, maxOutputTokens: 262144, inputModalities: text },
  { id: "zyraxon-titan", label: "ZYRAXON Titan", description: "Long-output workhorse · 1M context · image + video", contextWindow: 1048576, maxOutputTokens: 131072, inputModalities: ["text", "image", "video"] },
  { id: "zyraxon-neural", label: "ZYRAXON Neural", description: "Balanced general intelligence · 200K context", contextWindow: 200000, maxOutputTokens: 32000, inputModalities: text },
  { id: "zyraxon-codex", label: "ZYRAXON Codex", description: "Writes and repairs code · code + vision", contextWindow: 200000, maxOutputTokens: 32000, inputModalities: textImage },
  { id: "zyraxon-visionary", label: "ZYRAXON Visionary", description: "Reads images, video and documents · 200K context", contextWindow: 200000, maxOutputTokens: 32000, inputModalities: ["text", "image", "video", "pdf"] },
  { id: "zyraxon-cyber", label: "ZYRAXON Cyber", description: "Every input modality in one model", contextWindow: 200000, maxOutputTokens: 131072, inputModalities: ["text", "image", "video", "audio", "pdf"] },
  { id: "zyraxon-quantum", label: "ZYRAXON Quantum", description: "High-throughput reasoning · 1M context", contextWindow: 1048576, maxOutputTokens: 131072, inputModalities: text },
  { id: "zyraxon-genesis", label: "ZYRAXON Genesis", description: "Creative generation · 1M context", contextWindow: 1048576, maxOutputTokens: 131072, inputModalities: text },
];

export const AI_PROVIDER_PRESETS: readonly AIProviderPreset[] = [
  {
    id: "zyraxon",
    label: "ZYRAXON",
    wire: "openai",
    baseUrl: "https://zyraxonai.lovable.app/api/public/zyraxon/v1",
    defaultModel: "zyraxon-apex",
    models: ZYRAXON_MODELS,
    keyless: true,
    note: "Public gateway — no key needed. Visionary, Titan and Cyber also read images and video.",
  },
  {
    id: "openai",
    label: "OpenAI",
    wire: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o", description: "Text + image input", inputModalities: textImage },
      { id: "gpt-4o-mini", label: "GPT-4o mini", description: "Faster, cheaper", inputModalities: textImage },
      { id: "gpt-4.1", label: "GPT-4.1", inputModalities: textImage },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", inputModalities: textImage },
      { id: "o3", label: "o3", description: "Deep reasoning", inputModalities: textImage },
      { id: "o4-mini", label: "o4-mini", description: "Reasoning, fast", inputModalities: textImage },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", inputModalities: textImage },
      { id: "claude-opus-4-1", label: "Claude Opus 4.1", inputModalities: textImage },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fastest", inputModalities: textImage },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    wire: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputModalities: ["text", "image", "video", "audio"] },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputModalities: ["text", "image", "video", "audio"] },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", inputModalities: ["text", "image", "video", "audio"] },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    wire: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", inputModalities: text },
      { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2", inputModalities: text },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout", inputModalities: textImage },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    wire: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keyUrl: "https://openrouter.ai/keys",
    note: "One key, hundreds of models — press Load models to list them.",
    models: [
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", inputModalities: textImage },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", inputModalities: textImage },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", inputModalities: ["text", "image", "video"] },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", inputModalities: text },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", inputModalities: text },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", inputModalities: text },
    ],
  },
  {
    id: "xai",
    label: "xAI Grok",
    wire: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    keyUrl: "https://console.x.ai",
    models: [
      { id: "grok-4", label: "Grok 4", inputModalities: textImage },
      { id: "grok-3-mini", label: "Grok 3 mini", inputModalities: textImage },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    wire: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large", inputModalities: text },
      { id: "pixtral-large-latest", label: "Pixtral Large", description: "Vision", inputModalities: textImage },
    ],
  },
  {
    id: "compatible",
    label: "Custom / local (OpenAI-compatible)",
    wire: "openai",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    keyless: true,
    note: "Any OpenAI-compatible server: LM Studio, Ollama, vLLM, a gateway.",
    models: [],
  },
];

const BY_ID = new Map(AI_PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function providerPreset(id: AIProviderId): AIProviderPreset {
  return BY_ID.get(id) ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1];
}

export function wireFormatFor(id: AIProviderId): AIWireFormat {
  return providerPreset(id).wire;
}

/** Wire format for a provider id, tolerating the two legacy format names. */
export function resolveWire(provider: string): AIWireFormat {
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai") return "openai";
  return isKnownProviderId(provider) ? wireFormatFor(provider) : "openai";
}

export function isKeyless(id: AIProviderId): boolean {
  return providerPreset(id).keyless === true;
}

export function modelsForProvider(id: AIProviderId): readonly AIModelOption[] {
  return providerPreset(id).models;
}

/** Modalities a model declares, looked up by provider + model id. */
export function modalitiesFor(
  id: AIProviderId,
  model: string,
): readonly AIModality[] {
  const known = providerPreset(id).models.find((m) => m.id === model);
  return known?.inputModalities ?? ["text"];
}

/** True when the provider id is one this catalogue knows. */
export function isKnownProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && BY_ID.has(value as AIProviderId);
}

/** Backwards-compatible defaults map (provider id → baseUrl + default model). */
export const AI_PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> =
  Object.fromEntries(
    AI_PROVIDER_PRESETS.map((preset) => [
      preset.id,
      { baseUrl: preset.baseUrl, model: preset.defaultModel },
    ]),
  );
