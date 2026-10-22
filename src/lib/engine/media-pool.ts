/**
 * Media pool: one DOM element per library item, kept warm so the compositor can
 * draw frames synchronously, plus probing that fills duration, dimensions,
 * thumbnails, waveform, scene cuts and the audio beat grid.
 */
import type { MediaItem } from "./model";

type Pooled = {
  kind: "video" | "audio" | "image";
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  ready: boolean;
  url: string;
};

export class MediaPool {
  private items = new Map<string, Pooled>();

  get(id: string): Pooled | undefined {
    return this.items.get(id);
  }

  /** Element for a library item, created and warmed on first use. */
  acquire(item: MediaItem): Pooled | undefined {
    const existing = this.items.get(item.id);
    if (existing && existing.url === item.url) return existing;
    if (existing) this.release(item.id);

    if (item.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const entry: Pooled = { kind: "image", el: img, ready: false, url: item.url };
      img.onload = () => {
        entry.ready = true;
      };
      img.src = item.url;
      this.items.set(item.id, entry);
      return entry;
    }

    const el = document.createElement(item.kind === "video" ? "video" : "audio");
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.src = item.url;
    const entry: Pooled = { kind: item.kind, el, ready: false, url: item.url };
    el.addEventListener("loadeddata", () => {
      entry.ready = true;
    });
    this.items.set(item.id, entry);
    return entry;
  }

  release(id: string): void {
    const entry = this.items.get(id);
    if (!entry) return;
    if (entry.kind !== "image") (entry.el as HTMLMediaElement).src = "";
    this.items.delete(id);
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.release(id);
  }

  /** Wait until every active video element can draw a frame at its target time. */
  async settle(): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const entry of this.items.values()) {
      if (entry.kind === "image" || entry.ready) continue;
      const el = entry.el as HTMLVideoElement;
      waits.push(
        new Promise((resolve) => {
          const done = () => {
            el.removeEventListener("loadeddata", done);
            el.removeEventListener("error", done);
            resolve();
          };
          el.addEventListener("loadeddata", done);
          el.addEventListener("error", done);
          window.setTimeout(done, 8000);
        }),
      );
    }
    await Promise.all(waits);
  }
}

export function videoElement(pool: MediaPool, mediaId: string): HTMLVideoElement | undefined {
  const entry = pool.get(mediaId);
  return entry && entry.kind === "video" ? (entry.el as HTMLVideoElement) : undefined;
}

export function imageElement(pool: MediaPool, mediaId: string): HTMLImageElement | undefined {
  const entry = pool.get(mediaId);
  return entry && entry.kind === "image" ? (entry.el as HTMLImageElement) : undefined;
}

/** Seek a video element and resolve once the frame is actually available. */
export function seekVideo(el: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Number.isFinite(time) ? time : 0);
  if (Math.abs(el.currentTime - target) < 0.02 && el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("seeked", done);
      resolve();
    };
    el.addEventListener("seeked", done);
    window.setTimeout(done, 2500);
    try {
      el.currentTime = target;
    } catch {
      done();
    }
  });
}

export function guessKind(type: string, name: string): MediaItem["kind"] | null {
  if (type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)) return "audio";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) return "image";
  return null;
}

function loadMediaElement(url: string, kind: "video" | "audio"): Promise<HTMLMediaElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "auto";
    el.muted = true;
    el.crossOrigin = "anonymous";
    el.src = url;
    const timer = window.setTimeout(() => reject(new Error("media load timed out")), 30000);
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(el);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("media failed to load"));
    };
  });
}

/** Draw the current frame of a media element into a JPEG data URL. */
export function captureFrame(el: HTMLVideoElement | HTMLImageElement, maxW = 320): string {
  try {
    const naturalW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const naturalH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    const scale = Math.min(1, maxW / (naturalW || maxW));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((naturalW || 320) * scale));
    canvas.height = Math.max(1, Math.round((naturalH || 180) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.62);
  } catch {
    return "";
  }
}

/** Grab evenly spaced frames of a video, for the multimodal agent message. */
export async function grabFrames(url: string, count = 4): Promise<string[]> {
  const video = (await loadMediaElement(url, "video")) as HTMLVideoElement;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration > 1 ? (duration * (i + 0.5)) / count : 0;
    await seekVideo(video, t);
    const frame = captureFrame(video, 224);
    if (frame) frames.push(frame);
  }
  video.src = "";
  return frames;
}

export type ProbeResult = {
  duration: number;
  width?: number;
  height?: number;
  thumb?: string;
  frames?: string[];
};

export async function probeVideo(url: string): Promise<ProbeResult> {
  const video = (await loadMediaElement(url, "video")) as HTMLVideoElement;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  await seekVideo(video, Math.min(0.5, duration / 2));
  const thumb = captureFrame(video, 320);
  const frames = await grabFramesFrom(video, duration, Math.min(4, Math.max(1, Math.round(duration / 5))));
  const result: ProbeResult = { duration, width: video.videoWidth, height: video.videoHeight };
  if (thumb) result.thumb = thumb;
  if (frames.length) result.frames = frames;
  video.src = "";
  return result;
}

async function grabFramesFrom(video: HTMLVideoElement, duration: number, count: number): Promise<string[]> {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration > 1 ? (duration * i) / count : 0;
    await seekVideo(video, t);
    const frame = captureFrame(video, 224);
    if (frame) frames.push(frame);
  }
  return frames;
}

export async function probeImage(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const thumb = captureFrame(img, 320);
      const result: ProbeResult = { duration: 4, width: img.naturalWidth, height: img.naturalHeight };
      if (thumb) result.thumb = thumb;
      resolve(result);
    };
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

export async function probeAudio(url: string): Promise<ProbeResult> {
  const audio = await loadMediaElement(url, "audio");
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  audio.src = "";
  return { duration };
}

/** Decode a media URL to an AudioBuffer, for waveform and beat analysis. */
export async function decodeAudio(url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const buffer = await ctx.decodeAudioData(bytes);
    void ctx.close();
    return buffer;
  } catch {
    return null;
  }
}

/** Loudness envelope 0..1 with `buckets` samples, for waveform drawing. */
export function waveformFrom(buffer: AudioBuffer, buckets = 600): number[] {
  const channel = buffer.getChannelData(0);
  const perBucket = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < buckets; i++) {
    const start = i * perBucket;
    let peak = 0;
    for (let j = 0; j < perBucket && start + j < channel.length; j++) {
      const value = Math.abs(channel[start + j] ?? 0);
      if (value > peak) peak = value;
    }
    if (peak > max) max = peak;
    peaks.push(peak);
  }
  return peaks.map((p) => Math.min(1, p / max));
}

/**
 * Onset envelope: energy per 10 ms frame across the whole track. Beats are the
 * frames that rise well above the local average, then thinned to a minimum gap.
 */
export function beatGrid(buffer: AudioBuffer, minGap = 0.28): number[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frame = Math.max(1, Math.round(sampleRate * 0.01));
  const frames: number[] = [];
  for (let i = 0; i + frame <= data.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const v = data[i + j] ?? 0;
      sum += v * v;
    }
    frames.push(Math.sqrt(sum / frame));
  }
  if (frames.length < 8) return [];

  const window = 16;
  const beats: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < frames.length - 1; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(frames.length, i + window);
    let sum = 0;
    for (let j = from; j < to; j++) sum += frames[j] ?? 0;
    const local = sum / (to - from);
    const value = frames[i] ?? 0;
    const time = (i * frame) / sampleRate;
    if (value > local * 1.45 && value > 0.02 && time - last >= minGap) {
      beats.push(Number(time.toFixed(3)));
      last = time;
    }
  }
  return beats;
}

/** Loudness curve sampled at a fixed interval, used for automatic ducking. */
export function loudnessCurve(buffer: AudioBuffer, step = 0.05): number[] {
  const data = buffer.getChannelData(0);
  const perStep = Math.max(1, Math.round(buffer.sampleRate * step));
  const curve: number[] = [];
  for (let i = 0; i + perStep <= data.length; i += perStep) {
    let sum = 0;
    for (let j = 0; j < perStep; j++) {
      const v = data[i + j] ?? 0;
      sum += v * v;
    }
    curve.push(Math.sqrt(sum / perStep));
  }
  const max = curve.reduce((m, v) => Math.max(m, v), 0.0001);
  return curve.map((v) => Number((v / max).toFixed(4)));
}

/** Mean absolute difference between two RGBA buffers, 0..1. */
function frameDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const step = 4 * 16;
  let count = 0;
  for (let i = 0; i < a.length; i += step) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0)) + Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) + Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    count += 3;
  }
  return count ? sum / count / 255 : 0;
}

/**
 * Scene cuts: sample the video at a fixed rate and mark frames whose colour
 * distribution jumps sharply. Returns cut times in seconds.
 */
export async function detectScenes(url: string, threshold = 0.28): Promise<number[]> {
  const video = (await loadMediaElement(url, "video")) as HTMLVideoElement;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0.5) {
    video.src = "";
    return [];
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    video.src = "";
    return [];
  }
  const step = Math.max(0.2, duration / 240);
  let previous: Uint8ClampedArray | null = null;
  const cuts: number[] = [];
  for (let t = 0; t < duration; t += step) {
    await seekVideo(video, t);
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      break;
    }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (previous && frameDelta(previous, data) > threshold) cuts.push(Number(t.toFixed(2)));
    previous = new Uint8ClampedArray(data);
  }
  video.src = "";
  return cuts;
}
