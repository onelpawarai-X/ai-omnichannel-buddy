/**
 * Export: renders the timeline to a WebM file.
 *
 * The renderer runs in real time so audio and video stay in step: media
 * elements play while the compositor draws each frame, and the audio graph
 * mixes every audible clip into the recorded stream. The same `renderFrame`
 * used by the preview draws the exported picture.
 */
import { renderFrame, type RenderContext } from "./compositor";
import { MediaPool, seekVideo } from "./media-pool";
import { type Clip, type MediaItem, type ProjectSettings, type Track, clipGain, timelineEnd } from "./model";

export type ExportOptions = {
  project: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  media: MediaItem[];
  pool: MediaPool;
  animations: RenderContext["animations"];
  onProgress?: (progress: number) => void;
  /** stop early when this returns true */
  shouldCancel?: () => boolean;
  /** record only this many seconds from `from` */
  from?: number;
  to?: number;
  scale?: number;
  fps?: number;
};

export type ExportResult = {
  blob: Blob;
  duration: number;
  mimeType: string;
};

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

/** Decode an audio media item once, cached by media id. */
async function decodeItem(url: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const buffer = await ctx.decodeAudioData(bytes);
    void ctx.close();
    return buffer;
  } catch {
    return null;
  }
}

type AudioPlan = {
  buffers: Map<string, AudioBuffer>;
  sources: AudioBufferSourceNode[];
  gainNodes: GainNode[];
};

/** Schedule every audible audio buffer into the export graph. */
function scheduleAudio(
  ctx: AudioContext,
  destination: AudioNode,
  buffers: Map<string, AudioBuffer>,
  options: ExportOptions,
  from: number,
  to: number,
): AudioPlan {
  const plan: AudioPlan = { buffers, sources: [], gainNodes: [] };
  const trackVolume = new Map(options.tracks.map((t) => [t.id, t.muted ? 0 : t.volume]));
  for (const clip of options.clips) {
    if (!clip.mediaId) continue;
    if (clip.kind === "text" || clip.kind === "shape" || clip.kind === "effect") continue;
    const media = options.media.find((m) => m.id === clip.mediaId);
    if (!media || media.kind === "image") continue;
    const buffer = plan.buffers.get(media.id);
    if (!buffer) continue;
    const clipEnd = clip.start + clip.duration;
    const playFrom = Math.max(clip.start, from);
    const playTo = Math.min(clipEnd, to);
    if (playTo <= playFrom) continue;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.05, clip.speed);
    const gain = ctx.createGain();
    const base = clip.volume * (trackVolume.get(clip.trackId) ?? 1);
    gain.gain.setValueAtTime(clip.muted ? 0 : base, 0);
    const headLocal = playFrom - clip.start;
    if (clip.fadeIn > 0 && headLocal < clip.fadeIn) {
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(clip.muted ? 0 : base, Math.max(0.001, clip.fadeIn - headLocal));
    }
    if (clip.fadeOut > 0) {
      const fadeStart = clipEnd - clip.fadeOut;
      if (fadeStart > playFrom) {
        gain.gain.setValueAtTime(clip.muted ? 0 : base, fadeStart - from);
        gain.gain.linearRampToValueAtTime(0, clipEnd - from);
      } else {
        const remaining = clipEnd - playFrom;
        gain.gain.setValueAtTime(clip.muted ? 0 : base * (remaining / clip.fadeOut), 0);
        gain.gain.linearRampToValueAtTime(0, remaining);
      }
    }
    source.connect(gain);
    gain.connect(destination);
    const offset = Math.max(0, clip.in + headLocal * clip.speed);
    source.start(playFrom - from, offset, Math.min(playTo - playFrom, buffer.duration - offset));
    plan.sources.push(source);
    plan.gainNodes.push(gain);
  }
  return plan;
}
/** Export the timeline (or a range of it) to a WebM blob. */
export async function exportTimeline(options: ExportOptions): Promise<ExportResult> {
  const from = Math.max(0, options.from ?? 0);
  const end = options.to ?? timelineEnd(options.clips);
  const to = Math.max(from + 0.05, end);
  const duration = to - from;
  const scale = options.scale ?? 1;
  const fps = options.fps ?? options.project.fps;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(options.project.width * scale));
  canvas.height = Math.max(2, Math.round(options.project.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const scratch = document.createElement("canvas");

  // warm every media element the range needs before the clock starts
  for (const clip of options.clips) {
    if (!clip.mediaId) continue;
    const media = options.media.find((m) => m.id === clip.mediaId);
    if (!media || media.kind === "audio") continue;
    if (clip.start + clip.duration < from || clip.start > to) continue;
    options.pool.acquire(media);
  }
  await options.pool.settle();

  // prepare the audio graph
  const buffers = new Map<string, AudioBuffer>();
  for (const clip of options.clips) {
    if (!clip.mediaId || clip.kind === "text" || clip.kind === "shape" || clip.kind === "effect") continue;
    const media = options.media.find((m) => m.id === clip.mediaId);
    if (!media || media.kind === "image") continue;
    if (clip.start + clip.duration < from || clip.start > to) continue;
    if (buffers.has(media.id)) continue;
    const buffer = await decodeItem(media.url);
    if (buffer) buffers.set(media.id, buffer);
  }

  const audioCtx = new AudioContext({ sampleRate: 48000 });
  const destination = audioCtx.createMediaStreamDestination();

  const stream = canvas.captureStream(fps);
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  // start the audio graph a hair in the future so scheduling is not late
  await audioCtx.resume();
  const plan = scheduleAudio(audioCtx, destination, buffers, options, from, to);

  recorder.start(250);

  // drive the render loop in real time
  const project = { ...options.project, width: canvas.width, height: canvas.height };
  const renderCtx: RenderContext = {
    ctx,
    project,
    tracks: options.tracks,
    clips: options.clips,
    media: options.media,
    pool: options.pool,
    time: from,
    scratch,
    animations: options.animations,
  };

  await new Promise<void>((resolve) => {
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const time = from + elapsed;
      if (time >= to || options.shouldCancel?.()) {
        resolve();
        return;
      }
      renderCtx.time = time;
      void renderFrame(renderCtx).then(() => {
        options.onProgress?.(Math.min(1, elapsed / duration));
        requestAnimationFrame(tick);
      });
    };
    requestAnimationFrame(tick);
  });

  for (const source of plan.sources) {
    try {
      source.stop();
    } catch {
      // already finished
    }
  }
  recorder.stop();
  const blob = await done;
  await audioCtx.close();
  return { blob, duration, mimeType };
}

/** Download a blob under a friendly filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
