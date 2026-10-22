/**
 * ZYRAXON provider client — the user's own OpenAI-compatible provider.
 * Public endpoints, no key required. Called from the browser (CORS is open).
 */
export const ZYRAXON_BASE = "https://zyraxonai.lovable.app/api/public/zyraxon/v1";
export const ZYRAXON_TTS_URL = "https://zyraxonai.lovable.app/api/public/tts";
export const ZYRAXON_STT_URL = "https://zyraxonai.lovable.app/api/public/stt";

export type ZyraxonModel = {
  id: string;
  name: string;
  description: string;
  input_modalities: string[];
  context_window: number;
  max_output_tokens: number;
};

/** Default: the only full-modality model (text+image+audio+video) that is also fast. */
export const DEFAULT_MODEL = "zyraxon-cyber";
export const DEFAULT_TTS_VOICE = "bn-BD-NabanitaNeural";

/** Fastest-first ordering for the model selector. */
export const SPEED_ORDER = [
  "zyraxon-pulse",
  "zyraxon-cyber",
  "zyraxon-titan",
  "zyraxon-visionary",
  "zyraxon-quantum",
  "zyraxon-matrix",
  "zyraxon-neural",
  "zyraxon-codex",
  "zyraxon-genesis",
  "zyraxon-apex",
];

export const FALLBACK_MODELS: ZyraxonModel[] = [
  { id: "zyraxon-apex", name: "ZYRAXON Apex", description: "Flagship reasoning · 1M context", input_modalities: ["text"], context_window: 1048576, max_output_tokens: 131072 },
  { id: "zyraxon-matrix", name: "ZYRAXON Matrix", description: "Vision + text · 1M context", input_modalities: ["text", "image"], context_window: 1048576, max_output_tokens: 131072 },
  { id: "zyraxon-pulse", name: "ZYRAXON Pulse", description: "Low latency · 262K context", input_modalities: ["text"], context_window: 262144, max_output_tokens: 262144 },
  { id: "zyraxon-titan", name: "ZYRAXON Titan", description: "Image + video · 512K output", input_modalities: ["text", "image", "video"], context_window: 1000000, max_output_tokens: 512000 },
  { id: "zyraxon-neural", name: "ZYRAXON Neural", description: "Balanced · 200K context", input_modalities: ["text"], context_window: 200000, max_output_tokens: 32000 },
  { id: "zyraxon-codex", name: "ZYRAXON Codex", description: "Code + vision · 200K context", input_modalities: ["text", "image"], context_window: 200000, max_output_tokens: 32000 },
  { id: "zyraxon-visionary", name: "ZYRAXON Visionary", description: "Image + video + PDF · 200K", input_modalities: ["text", "image", "video", "pdf"], context_window: 200000, max_output_tokens: 32000 },
  { id: "zyraxon-cyber", name: "ZYRAXON Cyber", description: "Text + image + audio + video · 1M context", input_modalities: ["text", "image", "video"], context_window: 1000000, max_output_tokens: 512000 },
  { id: "zyraxon-quantum", name: "ZYRAXON Quantum", description: "1M context · vision · 131K output", input_modalities: ["text", "image", "video"], context_window: 1000000, max_output_tokens: 512000 },
  { id: "zyraxon-genesis", name: "ZYRAXON Genesis", description: "Experimental · every modality", input_modalities: ["text", "image", "video"], context_window: 1000000, max_output_tokens: 512000 },
];

export async function fetchZyraxonModels(): Promise<ZyraxonModel[]> {
  try {
    const res = await fetch(`${ZYRAXON_BASE}/models`);
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const items = json.data ?? [];
    const models: ZyraxonModel[] = items.map((m) => {
      const id = String(m["id"] ?? "");
      const name = String(m["display_name"] ?? m["name"] ?? id);
      const desc = String(m["description"] ?? "");
      const modalities = Array.isArray(m["input_modalities"])
        ? (m["input_modalities"] as string[])
        : ["text"];
      const cw = Number(m["context_window"] ?? 0);
      const mot = Number(m["max_output_tokens"] ?? 0);
      return {
        id,
        name,
        description: desc,
        input_modalities: modalities,
        context_window: cw,
        max_output_tokens: mot,
      };
    });
    return models.length ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

export function sortModelsBySpeed(models: ZyraxonModel[]): ZyraxonModel[] {
  return [...models].sort(
    (a, b) => SPEED_ORDER.indexOf(a.id) - SPEED_ORDER.indexOf(b.id),
  );
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Stream a chat completion, yielding content deltas. */
export async function* streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const res = await fetch(`${ZYRAXON_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      max_tokens: opts.maxTokens ?? 16384,
    }),
    signal: opts.signal ?? null,
  });
  if (!res.ok || !res.body) {
    throw new Error(`ZYRAXON chat failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        if (data === "[DONE]") return;
        continue;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore partial/non-JSON lines
      }
    }
  }
}

/** Text-to-speech via the provider; returns MP3 audio bytes. */
export async function ttsToBlob(
  text: string,
  opts?: { voice?: string; locale?: string },
): Promise<Blob> {
  const body: Record<string, string> = { text: text.slice(0, 5000) };
  if (opts && typeof opts["voice"] === "string") {
    body["voice"] = opts["voice"];
  } else {
    body["locale"] = (opts && typeof opts["locale"] === "string") ? opts["locale"] : "bn";
  }
  const res = await fetch(ZYRAXON_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  return await res.blob();
}

/** Batch speech-to-text; the recogniser needs an explicit language. */
export async function sttTranscribe(
  file: Blob,
  language: string,
  filename = "audio.webm",
): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("language", language);
  const res = await fetch(ZYRAXON_STT_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`STT failed: ${res.status}`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}
