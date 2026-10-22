/**
 * Compositor: turns the timeline document into pixels.
 *
 * The preview canvas and the export renderer both call `renderFrame`, so the
 * picture on screen is exactly the picture that gets encoded. Layers are drawn
 * bottom-up per track; every clip contributes a transform (base values, then
 * keyframes, then motion effects), a filter chain (clip grade + effect filters),
 * a chroma key pass and a blend mode.
 */
import {
  type AppliedEffect,
  type EffectFrame,
  effectsFilter,
  motionTransform,
  paintEffects,
} from "./effects";
import {
  type Clip,
  type MediaItem,
  type ProjectSettings,
  type Track,
  clipGain,
  easeInOut,
  sampleKeyframes,
  transitionProgress,
} from "./model";
import { MediaPool, imageElement, seekVideo, videoElement } from "./media-pool";

export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  project: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  media: MediaItem[];
  pool: MediaPool;
  time: number;
  /** canvas used for per-pixel passes such as chroma key */
  scratch: HTMLCanvasElement;
  /** decoded lottie animations, keyed by animation id */
  animations: Map<string, AnimationItemLike>;
};

/** Minimal surface of the lottie player the compositor needs. */
export type AnimationItemLike = {
  goToAndStop: (value: number, isFrame?: boolean) => void;
  renderFrame?: () => void;
  animationData?: unknown;
  destroy?: () => void;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Convert a clip's stored grade into a CSS/canvas filter fragment. */
export function gradeFilter(clip: Clip): string {
  const f = clip.filter;
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.invert > 0) parts.push(`invert(${f.invert}%)`);
  return parts.join(" ");
}

function appliedOf(clip: Clip): AppliedEffect[] {
  return clip.effects.map((id) => ({ id, values: clip.effectValues[id] ?? {}, enabled: true }));
}

/** Pick the media layer that should be visible at a time on the visual tracks. */
function activeVisualClip(ctx: RenderContext, trackId: string): Clip | undefined {
  return ctx.clips
    .filter((c) => c.trackId === trackId && ctx.time >= c.start && ctx.time < c.start + c.duration)
    .sort((a, b) => a.start - b.start)
    .pop();
}

type LayerFrame = {
  clip: Clip;
  width: number;
  height: number;
  local: number;
  progress: number;
};

function effectFrame(layer: LayerFrame, ctx: RenderContext): EffectFrame {
  return {
    width: layer.width,
    height: layer.height,
    time: ctx.time,
    local: layer.local,
    progress: layer.progress,
  };
}

/** Source time inside a clip's media, honouring speed and the in-point. */
function sourceTime(clip: Clip, time: number): number {
  return clip.in + (time - clip.start) * clip.speed;
}

/** Chroma key: knock the chosen colour out of the layer into transparency. */
function applyChromaKey(ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, clip: Clip, width: number, height: number): void {
  const chroma = clip.chroma;
  if (!chroma?.enabled) return;
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext("2d");
  if (!sctx) return;
  sctx.clearRect(0, 0, width, height);
  sctx.drawImage(ctx.canvas, 0, 0, width, height);
  const image = sctx.getImageData(0, 0, width, height);
  const data = image.data;
  const target = hexToRgb(chroma.color);
  const similarity = Math.max(0.01, chroma.similarity) * 441.67295593;
  const smoothness = Math.max(1, chroma.smoothness * 200);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const distance = Math.hypot(r - target.r, g - target.g, b - target.b);
    if (distance < similarity) {
      data[i + 3] = 0;
    } else if (distance < similarity + smoothness) {
      data[i + 3] = Math.round(((distance - similarity) / smoothness) * 255);
    }
  }
  sctx.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(scratch, 0, 0, width, height);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full.slice(0, 6) || "00ff00", 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Transition transform at the head of a clip: translate, scale or rotate in. */
function transitionTransform(clip: Clip, progress: number): { dx: number; dy: number; scale: number; rotate: number; alpha: number } {
  if (progress >= 1) return { dx: 0, dy: 0, scale: 1, rotate: 0, alpha: 1 };
  const p = easeInOut(progress);
  const amount = 1 - p;
  switch (clip.transition.kind) {
    case "fade":
    case "dissolve":
      return { dx: 0, dy: 0, scale: 1, rotate: 0, alpha: p };
    case "slide": {
      const dx = clip.transition.direction === "left" ? -amount : clip.transition.direction === "right" ? amount : 0;
      const dy = clip.transition.direction === "up" ? -amount : clip.transition.direction === "down" ? amount : 0;
      return { dx, dy, scale: 1, rotate: 0, alpha: 1 };
    }
    case "wipe":
      return { dx: 0, dy: 0, scale: 1, rotate: 0, alpha: 1 };
    case "zoom":
      return { dx: 0, dy: 0, scale: 0.6 + 0.4 * p, rotate: 0, alpha: p };
    case "spin":
      return { dx: 0, dy: 0, scale: 0.8 + 0.2 * p, rotate: amount * Math.PI, alpha: p };
    case "glitch":
      return { dx: amount * 0.06 * (progress % 0.2 < 0.1 ? -1 : 1), dy: 0, scale: 1, rotate: 0, alpha: p };
    default:
      return { dx: 0, dy: 0, scale: 1, rotate: 0, alpha: 1 };
  }
}

/** Draw one media clip (video or image) with transform, grade, effects, chroma. */
async function drawMediaClip(ctx: RenderContext, clip: Clip, width: number, height: number): Promise<void> {
  const media = ctx.media.find((m) => m.id === clip.mediaId);
  if (!media) return;
  const local = ctx.time - clip.start;
  const progress = clip.duration > 0 ? clamp01(local / clip.duration) : 0;
  const layer: LayerFrame = { clip, width, height, local, progress };
  const frame = effectFrame(layer, ctx);
  const effects = appliedOf(clip);

  let source: CanvasImageSource | null = null;
  if (media.kind === "video") {
    const el = videoElement(ctx.pool, media.id) ?? (ctx.pool.acquire(media)?.el as HTMLVideoElement | undefined);
    if (!el) return;
    await seekVideo(el, sourceTime(clip, ctx.time));
    source = el;
  } else if (media.kind === "image") {
    const el = imageElement(ctx.pool, media.id) ?? (ctx.pool.acquire(media)?.el as HTMLImageElement | undefined);
    if (!el) return;
    source = el;
  } else {
    return;
  }

  const sample = sampleKeyframes(clip, local);
  const motion = motionTransform(effects, frame);
  const transition = transitionTransform(clip, transitionProgress(clip, ctx.time));
  const alpha = clamp01(sample.opacity * transition.alpha * (clip.muted ? 1 : 1));

  const naturalW = media.width ?? (source instanceof HTMLVideoElement ? source.videoWidth : width);
  const naturalH = media.height ?? (source instanceof HTMLVideoElement ? source.videoHeight : height);
  const fit = Math.min(width / (naturalW || width), height / (naturalH || height));
  const drawW = (naturalW || width) * fit;
  const drawH = (naturalH || height) * fit;
  const scale = sample.scale * motion.scale * transition.scale;
  const cx = (sample.x + transition.dx) * width;
  const cy = (sample.y + transition.dy) * height;

  const filter = [gradeFilter(clip), effectsFilter(effects, frame)].filter(Boolean).join(" ");
  ctx.ctx.save();
  ctx.ctx.globalAlpha = alpha;
  ctx.ctx.globalCompositeOperation = clip.blendMode;
  ctx.ctx.filter = filter || "none";
  ctx.ctx.translate(cx + motion.dx, cy + motion.dy);
  ctx.ctx.rotate(((sample.rotation + (motion.rotate * 180) / Math.PI) * Math.PI) / 180);
  ctx.ctx.scale((clip.flipH ? -1 : 1) * scale, (clip.flipV ? -1 : 1) * scale);
  try {
    ctx.ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  } catch {
    // tainted or not-yet-ready source: skip this layer rather than break the frame
  }
  ctx.ctx.restore();

  if (clip.chroma?.enabled) applyChromaKey(ctx.ctx, ctx.scratch, clip, width, height);
  paintEffects(ctx.ctx, effects, frame);
}

/** Draw a text overlay, including its entrance animation. */
function drawTextClip(ctx: RenderContext, clip: Clip, width: number, height: number): void {
  const text = clip.text;
  if (!text) return;
  const local = ctx.time - clip.start;
  const progress = clip.duration > 0 ? clamp01(local / clip.duration) : 0;
  const transition = transitionTransform(clip, transitionProgress(clip, ctx.time));
  const animation = textAnimation(text.animation, local, clip.duration);
  const size = Math.max(8, (text.size / 1080) * height);
  ctx.ctx.save();
  ctx.ctx.globalAlpha = clamp01(transition.alpha * animation.alpha);
  ctx.ctx.font = `${text.weight} ${size}px ${text.fontFamily}, Inter, sans-serif`;
  ctx.ctx.textAlign = text.align;
  ctx.ctx.textBaseline = "middle";
  const x = (text.x + transition.dx) * width + animation.dx;
  const y = (text.y + transition.dy) * height + animation.dy;
  const lines = text.content.split("\n");
  const lineHeight = size * 1.2;
  const totalHeight = lineHeight * lines.length;
  lines.forEach((line, index) => {
    const lineY = y - totalHeight / 2 + lineHeight * (index + 0.5);
    const shown = animation.visibleChars === null ? line : line.slice(0, Math.max(0, animation.visibleChars - index * 1000));
    if (!shown) return;
    if (text.background) {
      const metrics = ctx.ctx.measureText(shown);
      const padX = size * 0.3;
      const padY = size * 0.15;
      const boxX = text.align === "left" ? x - padX : text.align === "right" ? x - metrics.width - padX : x - metrics.width / 2 - padX;
      ctx.ctx.save();
      ctx.ctx.globalAlpha = clamp01(transition.alpha) * 0.65;
      ctx.ctx.fillStyle = text.background;
      ctx.ctx.fillRect(boxX, lineY - lineHeight / 2 - padY * 0.2, metrics.width + padX * 2, lineHeight + padY);
      ctx.ctx.restore();
    }
    if (text.stroke) {
      ctx.ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.ctx.strokeStyle = text.strokeColor;
      ctx.ctx.strokeText(shown, x, lineY);
    }
    if (text.shadow) {
      ctx.ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.ctx.shadowBlur = size * 0.18;
      ctx.ctx.shadowOffsetY = size * 0.05;
    }
    ctx.ctx.fillStyle = text.color;
    ctx.ctx.fillText(shown, x, lineY);
    ctx.ctx.shadowColor = "transparent";
    ctx.ctx.shadowBlur = 0;
  });
  ctx.ctx.restore();
}

function textAnimation(kind: string, local: number, duration: number): { alpha: number; dx: number; dy: number; visibleChars: number | null } {
  const inTime = Math.min(0.5, Math.max(0.15, duration * 0.12));
  const p = clamp01(local / inTime);
  switch (kind) {
    case "typewriter":
      return { alpha: 1, dx: 0, dy: 0, visibleChars: Math.max(0, Math.floor(p * 60)) };
    case "fade-in":
      return { alpha: p, dx: 0, dy: 0, visibleChars: null };
    case "pop":
      return { alpha: p, dx: 0, dy: 0, visibleChars: null };
    case "slide-up":
      return { alpha: p, dx: 0, dy: (1 - p) * 40, visibleChars: null };
    case "slide-left":
      return { alpha: p, dx: (1 - p) * 80, dy: 0, visibleChars: null };
    case "bounce":
      return { alpha: p, dx: 0, dy: -Math.abs(Math.sin(p * Math.PI)) * 30, visibleChars: null };
    case "shake":
      return { alpha: 1, dx: Math.sin(local * 40) * 4, dy: 0, visibleChars: null };
    case "karaoke":
      return { alpha: 1, dx: 0, dy: 0, visibleChars: null };
    default:
      return { alpha: 1, dx: 0, dy: 0, visibleChars: null };
  }
}

/** Draw a vector shape clip. */
function drawShapeClip(ctx: RenderContext, clip: Clip, width: number, height: number): void {
  const shape = clip.shape;
  if (!shape) return;
  const local = ctx.time - clip.start;
  const sample = sampleKeyframes(clip, local);
  const transition = transitionTransform(clip, transitionProgress(clip, ctx.time));
  const effects = appliedOf(clip);
  const frame = effectFrame({ clip, width, height, local, progress: clip.duration ? local / clip.duration : 0 }, ctx);
  ctx.ctx.save();
  ctx.ctx.globalAlpha = clamp01(sample.opacity * transition.alpha);
  ctx.ctx.globalCompositeOperation = clip.blendMode;
  ctx.ctx.filter = [gradeFilter(clip), effectsFilter(effects, frame)].filter(Boolean).join(" ") || "none";
  ctx.ctx.translate((sample.x + transition.dx) * width, (sample.y + transition.dy) * height);
  ctx.ctx.rotate((sample.rotation * Math.PI) / 180);
  ctx.ctx.scale(sample.scale * (clip.flipH ? -1 : 1), sample.scale * (clip.flipV ? -1 : 1));
  ctx.ctx.fillStyle = shape.fill;
  ctx.ctx.strokeStyle = shape.stroke;
  ctx.ctx.lineWidth = shape.strokeWidth;
  const w = width * 0.5;
  const h = height * 0.3;
  if (shape.kind === "rect") ctx.ctx.fillRect(-w / 2, -h / 2, w, h);
  else if (shape.kind === "ellipse") {
    ctx.ctx.beginPath();
    ctx.ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.ctx.fill();
  } else if (shape.kind === "line") {
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(-w / 2, 0);
    ctx.ctx.lineTo(w / 2, 0);
    ctx.ctx.stroke();
  } else {
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(-w / 2, -h / 4);
    ctx.ctx.lineTo(w / 2, 0);
    ctx.ctx.lineTo(-w / 2, h / 4);
    ctx.ctx.closePath();
    ctx.ctx.fill();
  }
  ctx.ctx.restore();
  paintEffects(ctx.ctx, effects, frame);
}

/** Draw the lottie animation attached to a clip, scaled to the frame. */
function drawAnimationClip(ctx: RenderContext, clip: Clip, width: number, height: number): void {
  const item = clip.animationId ? ctx.animations.get(clip.animationId) : undefined;
  if (!item) return;
  const local = ctx.time - clip.start;
  const sample = sampleKeyframes(clip, local);
  const transition = transitionTransform(clip, transitionProgress(clip, ctx.time));
  const effects = appliedOf(clip);
  const frame = effectFrame({ clip, width, height, local, progress: clip.duration ? local / clip.duration : 0 }, ctx);
  ctx.ctx.save();
  ctx.ctx.globalAlpha = clamp01(sample.opacity * transition.alpha);
  ctx.ctx.globalCompositeOperation = clip.blendMode;
  ctx.ctx.filter = effectsFilter(effects, frame) || "none";
  ctx.ctx.translate((sample.x + transition.dx) * width, (sample.y + transition.dy) * height);
  ctx.ctx.rotate((sample.rotation * Math.PI) / 180);
  ctx.ctx.scale(sample.scale, sample.scale);
  item.goToAndStop(Math.max(0, local) * 1000, false);
  ctx.ctx.restore();
  paintEffects(ctx.ctx, effects, frame);
}

/** Render the whole frame: background, then every visual track bottom-up. */
export async function renderFrame(ctx: RenderContext): Promise<void> {
  const { width, height } = ctx.project;
  ctx.ctx.save();
  ctx.ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.ctx.globalAlpha = 1;
  ctx.ctx.globalCompositeOperation = "source-over";
  ctx.ctx.filter = "none";
  ctx.ctx.fillStyle = ctx.project.background;
  ctx.ctx.fillRect(0, 0, width, height);
  ctx.ctx.restore();

  const visualTracks = ctx.tracks.filter((t) => t.kind !== "audio" && !t.hidden);
  for (const track of visualTracks) {
    const clip = activeVisualClip(ctx, track.id);
    if (!clip || clip.locked) continue;
    if (clip.kind === "video" || clip.kind === "image") await drawMediaClip(ctx, clip, width, height);
    else if (clip.kind === "text") drawTextClip(ctx, clip, width, height);
    else if (clip.kind === "shape") drawShapeClip(ctx, clip, width, height);
    else if (clip.kind === "effect") drawAnimationClip(ctx, clip, width, height);
  }
}

/** Audio clips audible at a time, with their gain envelopes. */
export function audibleClips(clips: Clip[], tracks: Track[], time: number): Array<{ clip: Clip; gain: number }> {
  const audioTrackIds = new Set(tracks.filter((t) => t.kind !== "text" && t.kind !== "effect").map((t) => t.id));
  const trackVolume = new Map(tracks.map((t) => [t.id, t.muted ? 0 : t.volume]));
  return clips
    .filter((c) => audioTrackIds.has(c.trackId) && c.kind !== "text" && c.kind !== "shape" && c.kind !== "effect")
    .filter((c) => time >= c.start && time < c.start + c.duration)
    .map((clip) => ({ clip, gain: clipGain(clip, time) * (trackVolume.get(clip.trackId) ?? 1) }))
    .filter((entry) => entry.gain > 0.0005);
}
