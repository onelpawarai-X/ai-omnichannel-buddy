/**
 * Editor domain model.
 *
 * A project is a list of tracks; each track holds clips placed in seconds on
 * the global timeline. Everything the agent can change lives in this document,
 * so the whole project stays serialisable, diffable and undoable.
 */
import type { EffectValues } from "./effects";

export type MediaKind = "video" | "audio" | "image";
export type ClipKind = MediaKind | "text" | "shape" | "effect";

export type Keyframe = {
  /** seconds from the clip's own start */
  t: number;
  /** normalised 0..1 transform space */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type TransitionKind = "none" | "fade" | "dissolve" | "slide" | "wipe" | "zoom" | "spin" | "glitch";

export const TRANSITION_KINDS: TransitionKind[] = ["none", "fade", "dissolve", "slide", "wipe", "zoom", "spin", "glitch"];

export type Transition = {
  kind: TransitionKind;
  /** seconds of overlap at the clip head */
  duration: number;
  direction: "left" | "right" | "up" | "down";
};

export type ClipFilter = {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  grayscale: number;
  sepia: number;
  hue: number;
  invert: number;
  vignette: number;
};

export const DEFAULT_FILTER: ClipFilter = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hue: 0,
  invert: 0,
  vignette: 0,
};

export type TextAnimation = "none" | "typewriter" | "fade-in" | "pop" | "slide-up" | "slide-left" | "karaoke" | "bounce" | "shake";

export const TEXT_ANIMATIONS: TextAnimation[] = [
  "none",
  "typewriter",
  "fade-in",
  "pop",
  "slide-up",
  "slide-left",
  "karaoke",
  "bounce",
  "shake",
];

export type TextProps = {
  content: string;
  x: number;
  y: number;
  size: number;
  color: string;
  weight: number;
  align: "left" | "center" | "right";
  shadow: boolean;
  stroke: boolean;
  strokeColor: string;
  background: string | null;
  fontFamily: string;
  animation: TextAnimation;
};

export const DEFAULT_TEXT: TextProps = {
  content: "Text",
  x: 0.5,
  y: 0.85,
  size: 64,
  color: "#ffffff",
  weight: 700,
  align: "center",
  shadow: true,
  stroke: false,
  strokeColor: "#000000",
  background: null,
  fontFamily: "Inter",
  animation: "fade-in",
};

export type ShapeProps = {
  kind: "rect" | "ellipse" | "line" | "arrow";
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
};

export type ChromaKey = {
  enabled: boolean;
  color: string;
  similarity: number;
  smoothness: number;
};

export type Clip = {
  id: string;
  kind: ClipKind;
  trackId: string;
  mediaId?: string;
  label: string;
  /** seconds on the global timeline */
  start: number;
  duration: number;
  /** offset inside the source media */
  in: number;
  speed: number;
  volume: number;
  muted: boolean;
  filter: ClipFilter;
  opacity: number;
  scale: number;
  rotation: number;
  x: number;
  y: number;
  flipH: boolean;
  flipV: boolean;
  chroma: ChromaKey | null;
  blendMode: GlobalCompositeOperation;
  transition: Transition;
  keyframes: Keyframe[];
  /** ids of effects applied in order */
  effects: string[];
  /** parameter overrides per effect id */
  effectValues: Record<string, EffectValues>;
  text?: TextProps;
  shape?: ShapeProps;
  /** lottie / animated overlay payload id registered in the animation library */
  animationId?: string;
  /** audio fade in/out seconds */
  fadeIn: number;
  fadeOut: number;
  locked: boolean;
};

export type TrackKind = "video" | "audio" | "text" | "effect";

export type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  /** 0..1 */
  volume: number;
  height: number;
};

export type Caption = { start: number; end: number; text: string };

export type MediaSource = "upload" | "url" | "generated" | "console" | "youtube" | "library" | "ffmpeg";

export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  thumb?: string;
  /** keyframes attached to agent messages, as data URLs */
  frames?: string[];
  transcript?: string;
  captions?: Caption[];
  source?: MediaSource;
  attribution?: string;
  blob?: Blob;
  /** audio loudness envelope for waveform drawing, 0..1 */
  waveform?: number[];
  /** detected cut points in seconds (video) */
  scenes?: number[];
  /** beat grid in seconds (audio) */
  beats?: number[];
  /**
   * Labelled spectrogram of an audio file as a PNG data URL. The provider reads
   * pictures but drops `input_audio`, so this is how sound reaches the model.
   */
  spectrogram?: string;
};

export type ProjectSettings = {
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
};

export const DEFAULT_PROJECT: ProjectSettings = {
  name: "Untitled project",
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
};

let counter = 0;
export const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createTrack(kind: TrackKind, name?: string): Track {
  return {
    id: uid("trk"),
    kind,
    name: name ?? kind.toUpperCase(),
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    height: kind === "video" ? 64 : 48,
  };
}

export function createClip(patch: Partial<Clip> & { kind: ClipKind; trackId: string; label: string }): Clip {
  const clip: Clip = {
    id: patch.id ?? uid("clip"),
    kind: patch.kind,
    trackId: patch.trackId,
    label: patch.label,
    start: patch.start ?? 0,
    duration: patch.duration ?? 5,
    in: patch.in ?? 0,
    speed: patch.speed ?? 1,
    volume: patch.volume ?? 1,
    muted: patch.muted ?? false,
    filter: patch.filter ? { ...DEFAULT_FILTER, ...patch.filter } : { ...DEFAULT_FILTER },
    opacity: patch.opacity ?? 1,
    scale: patch.scale ?? 1,
    rotation: patch.rotation ?? 0,
    x: patch.x ?? 0.5,
    y: patch.y ?? 0.5,
    flipH: patch.flipH ?? false,
    flipV: patch.flipV ?? false,
    chroma: patch.chroma ?? null,
    blendMode: patch.blendMode ?? "source-over",
    transition: patch.transition ?? { kind: "none", duration: 0, direction: "left" },
    keyframes: patch.keyframes ?? [],
    effects: patch.effects ?? [],
    effectValues: patch.effectValues ?? {},
    fadeIn: patch.fadeIn ?? 0,
    fadeOut: patch.fadeOut ?? 0,
    locked: patch.locked ?? false,
  };
  if (patch.mediaId !== undefined) clip.mediaId = patch.mediaId;
  if (patch.text) clip.text = { ...DEFAULT_TEXT, ...patch.text };
  if (patch.shape) clip.shape = patch.shape;
  if (patch.animationId !== undefined) clip.animationId = patch.animationId;
  return clip;
}

export const timelineEnd = (clips: Clip[]): number =>
  clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);

/** Value of the animated transform at a time measured from the clip start. */
export function sampleKeyframes(
  clip: Clip,
  localTime: number,
): { x: number; y: number; scale: number; rotation: number; opacity: number } {
  const base = { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation, opacity: clip.opacity };
  const frames = clip.keyframes;
  if (frames.length === 0) return base;
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (localTime <= first.t) return { x: first.x, y: first.y, scale: first.scale, rotation: first.rotation, opacity: first.opacity };
  if (localTime >= last.t) return { x: last.x, y: last.y, scale: last.scale, rotation: last.rotation, opacity: last.opacity };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (localTime >= a.t && localTime <= b.t) {
      const span = b.t - a.t || 1;
      const p = (localTime - a.t) / span;
      const mix = (u: number, v: number) => u + (v - u) * p;
      return {
        x: mix(a.x, b.x),
        y: mix(a.y, b.y),
        scale: mix(a.scale, b.scale),
        rotation: mix(a.rotation, b.rotation),
        opacity: mix(a.opacity, b.opacity),
      };
    }
  }
  return base;
}

/** Linear gain envelope for a clip at a timeline time, honouring fade in/out. */
export function clipGain(clip: Clip, time: number): number {
  if (clip.muted) return 0;
  const local = time - clip.start;
  let gain = clip.volume;
  if (clip.fadeIn > 0 && local < clip.fadeIn) gain *= Math.max(0, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    gain *= Math.max(0, (clip.duration - local) / clip.fadeOut);
  }
  return Math.min(1, Math.max(0, gain));
}

/** Easing for transitions: 0 at the head, 1 at the tail. */
export function easeInOut(p: number): number {
  const t = Math.min(1, Math.max(0, p));
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Progress 0..1 of a clip's transition at a timeline time; 1 when it is done. */
export function transitionProgress(clip: Clip, time: number): number {
  if (clip.transition.kind === "none" || clip.transition.duration <= 0) return 1;
  return Math.min(1, Math.max(0, (time - clip.start) / clip.transition.duration));
}

export const clipsAt = (clips: Clip[], time: number): Clip[] =>
  clips.filter((c) => time >= c.start && time < c.start + c.duration);

export const topmostAt = (clips: Clip[], time: number, kind?: ClipKind): Clip | undefined =>
  clipsAt(clips, time)
    .filter((c) => (kind ? c.kind === kind : true))
    .sort((a, b) => a.start - b.start)
    .pop();

export function snapTime(time: number, candidates: number[], tolerance = 0.08): number {
  let best = time;
  let bestDelta = tolerance;
  for (const candidate of candidates) {
    const delta = Math.abs(candidate - time);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}
