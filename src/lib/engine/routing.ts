/**
 * Model routing.
 *
 * One model does the work; the roster lets that model hand a narrower job to a
 * better-suited sibling. Routing is by measured capability, not by name: the
 * capability registry times real completions and records which models actually
 * describe a picture, so routing reflects how the provider behaves today rather
 * than what the catalogue claims.
 *
 * The default is the fastest model that reads text, image and video. Audio is
 * not in the list on purpose: no model in the catalogue accepts an audio part
 * (every type is dropped silently), so sound reaches the model as a
 * spectrogram picture instead - see spectrogram.ts.
 */
import type { Modality, ZyraxonModel } from "../zyraxon";

export type TaskKind = "text" | "vision" | "video" | "reasoning" | "fast";

export type Capability = {
  id: string;
  name: string;
  modalities: Modality[];
  contextWindow: number;
  /** median wall-clock ms for a short completion, measured */
  latencyMs?: number;
  /** 0..1, how often the model answered a picture probe correctly */
  visionScore?: number;
};

const RANK: string[] = [
  "zyraxon-cyber",
  "zyraxon-genesis",
  "zyraxon-quantum",
  "zyraxon-titan",
  "zyraxon-apex",
  "zyraxon-pulse",
  "zyraxon-codex",
  "zyraxon-visionary",
  "zyraxon-matrix",
  "zyraxon-neural",
];

export function toCapability(model: ZyraxonModel): Capability {
  // The UI shows a bare placeholder before the catalogue arrives, so a model may
  // have no modality list yet. Treat unknown as text-only rather than crashing.
  const modalities = Array.isArray(model.input_modalities) && model.input_modalities.length ? model.input_modalities : (["text"] as Modality[]);
  const capability: Capability = {
    id: model.id,
    name: model.name,
    modalities,
    contextWindow: Number.isFinite(model.context_window) ? model.context_window : 0,
  };
  if (typeof model.speed === "number") capability.latencyMs = model.speed;
  if (typeof model.reliability === "number") capability.visionScore = model.reliability;
  return capability;
}

const can = (capability: Capability, kind: TaskKind): boolean => {
  if (kind === "text" || kind === "reasoning" || kind === "fast") return true;
  if (kind === "vision") return capability.modalities.includes("image");
  return capability.modalities.includes("video");
};

/**
 * Pick the model for a task. Prefers a model that can actually do the job, then
 * the fastest one, then catalogue order. `exclude` keeps an orchestrator from
 * handing work back to itself when a sibling is a better fit.
 */
export function routeModel(
  models: ZyraxonModel[],
  kind: TaskKind,
  options: { exclude?: string[]; prefer?: string } = {},
): string | undefined {
  const excluded = new Set(options.exclude ?? []);
  const capabilities = models.map(toCapability).filter((c) => !excluded.has(c.id) && can(c, kind));
  if (capabilities.length === 0) return options.prefer;

  const sorted = [...capabilities].sort((a, b) => {
    if (kind === "fast" || kind === "text") {
      const la = a.latencyMs ?? Number.POSITIVE_INFINITY;
      const lb = b.latencyMs ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
    }
    if (kind === "vision" || kind === "video") {
      const va = a.visionScore ?? 0.5;
      const vb = b.visionScore ?? 0.5;
      if (va !== vb) return vb - va;
    }
    const ca = a.contextWindow;
    const cb = b.contextWindow;
    if (ca !== cb) return cb - ca;
    return (RANK.indexOf(a.id) + 1 || 99) - (RANK.indexOf(b.id) + 1 || 99);
  });

  if (options.prefer && sorted.some((c) => c.id === options.prefer)) return options.prefer;
  return sorted[0]?.id;
}

/** Every model that reads pictures, best first - the ones worth delegating vision to. */
export function visionModels(models: ZyraxonModel[]): string[] {
  return models
    .filter((m) => m.input_modalities.includes("image"))
    .map((m) => m.id);
}

/**
 * The model the editor starts on: the fastest one that reads text, image and
 * video, which is the widest set of modalities the provider actually honours.
 */
export function pickDefaultModel(models: ZyraxonModel[]): string | undefined {
  const allRounders = models.filter((m) => m.input_modalities.includes("image") && m.input_modalities.includes("video"));
  if (allRounders.length === 0) return models[0]?.id;
  return routeModel(allRounders, "vision");
}

/** A short human-readable line about what a model can read. */
export function describeCapability(capability: Capability): string {
  const parts = (capability.modalities ?? []).filter((m) => m !== "pdf");
  const audio = parts.includes("audio") ? " (audio parts are dropped by the provider)" : "";
  return `${parts.join(" + ")} · ${Math.round(capability.contextWindow / 1000)}K context${audio}`;
}
