/**
 * Preview playback.
 *
 * The preview drives the same `renderFrame` the exporter uses, so what the user
 * sees is what gets encoded. Media elements live in the pool: video elements are
 * seeked to follow the clock, audio elements are played directly and their
 * volume follows the clip's gain envelope. Both are re-synced whenever they
 * drift, which keeps picture and sound together through scrubbing and looping.
 */
import { renderFrame, audibleClips, type AnimationItemLike } from "./compositor";
import { MediaPool } from "./media-pool";
import { type Clip, type MediaItem, type ProjectSettings, type Track, timelineEnd } from "./model";

const DRIFT_LIMIT = 0.14;

export type PlaybackSources = {
  project: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  media: MediaItem[];
  pool: MediaPool;
  animations: Map<string, AnimationItemLike>;
};

type MediaEntry = { el: HTMLMediaElement; clip: Clip };

export class PreviewPlayer {
  private raf = 0;
  private last = 0;
  private sources: PlaybackSources;
  private ctx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement;
  private active = new Map<string, MediaEntry>();
  private time = 0;
  private playing = false;

  constructor(ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, sources: PlaybackSources) {
    this.ctx = ctx;
    this.scratch = scratch;
    this.sources = sources;
  }

  update(sources: PlaybackSources): void {
    this.sources = sources;
  }

  get currentTime(): number {
    return this.time;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Draw one frame without advancing the clock. */
  async paint(time: number): Promise<void> {
    this.time = time;
    await this.syncMedia(time, false);
    await renderFrame({
      ctx: this.ctx,
      scratch: this.scratch,
      project: this.sources.project,
      tracks: this.sources.tracks,
      clips: this.sources.clips,
      media: this.sources.media,
      pool: this.sources.pool,
      animations: this.sources.animations,
      time,
    });
  }

  async play(from: number, onTick: (time: number) => void, onEnd: () => void): Promise<void> {
    this.stop();
    this.playing = true;
    this.time = from;
    this.last = performance.now();
    const end = timelineEnd(this.sources.clips);
    await this.syncMedia(from, true);

    const loop = async (): Promise<void> => {
      if (!this.playing) return;
      const now = performance.now();
      const delta = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.time += delta;
      if (this.time >= end) {
        this.stop();
        onTick(end);
        onEnd();
        return;
      }
      await this.syncMedia(this.time, true);
      await renderFrame({
        ctx: this.ctx,
        scratch: this.scratch,
        project: this.sources.project,
        tracks: this.sources.tracks,
        clips: this.sources.clips,
        media: this.sources.media,
        pool: this.sources.pool,
        animations: this.sources.animations,
        time: this.time,
      });
      onTick(this.time);
      this.raf = requestAnimationFrame(() => {
        void loop();
      });
    };
    this.raf = requestAnimationFrame(() => {
      void loop();
    });
  }

  stop(): void {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const entry of this.active.values()) {
      try {
        entry.el.pause();
      } catch {
        // element may already be detached
      }
    }
    this.active.clear();
  }

  /** Point every element at the right source time, and start or stop it as needed. */
  private async syncMedia(time: number, wantPlaying: boolean): Promise<void> {
    const visible = this.sources.clips.filter((c) => {
      if (!c.mediaId) return false;
      const media = this.sources.media.find((m) => m.id === c.mediaId);
      if (!media) return false;
      if (media.kind === "image") return false;
      return time >= c.start - 0.02 && time < c.start + c.duration;
    });

    const wanted = new Map<string, MediaEntry>();
    for (const clip of visible) {
      const entry = this.sources.pool.get(clip.mediaId ?? "");
      if (!entry) continue;
      wanted.set(clip.id, { el: entry.el as HTMLMediaElement, clip });
    }

    // release elements whose clip left the playhead
    for (const [clipId, entry] of this.active) {
      if (wanted.has(clipId)) continue;
      try {
        entry.el.pause();
      } catch {
        // ignore
      }
      this.active.delete(clipId);
    }

    const gains = new Map(audibleClips(this.sources.clips, this.sources.tracks, time).map((a) => [a.clip.id, a.gain]));
    const trackMuted = new Map(this.sources.tracks.map((t) => [t.id, t.muted]));
    const trackHidden = new Map(this.sources.tracks.map((t) => [t.id, t.hidden]));

    for (const [clipId, entry] of wanted) {
      const { el, clip } = entry;
      const isAudio = el instanceof HTMLAudioElement;
      const isVideo = el instanceof HTMLVideoElement;
      const hidden = trackHidden.get(clip.trackId) === true;
      const muted = trackMuted.get(clip.trackId) === true || clip.muted;
      const target = Math.max(0, clip.in + (time - clip.start) * clip.speed);

      if (isVideo) {
        try {
          el.playbackRate = Math.min(4, Math.max(0.1, clip.speed));
        } catch {
          // some browsers reject out-of-range rates
        }
      }
      if (Math.abs(el.currentTime - target) > DRIFT_LIMIT) {
        try {
          el.currentTime = target;
        } catch {
          // seek can fail on a not-yet-seekable element
        }
      }
      const gain = gains.get(clipId) ?? 0;
      el.volume = muted ? 0 : Math.min(1, Math.max(0, gain));
      if (isAudio && !muted) el.muted = false;
      if (isVideo) el.muted = true; // video sound comes from the audio element of the same clip when present

      if (wantPlaying && !hidden) {
        if (el.paused) {
          try {
            await el.play();
          } catch {
            // autoplay can be refused until the user interacts
          }
        }
      } else if (!el.paused) {
        el.pause();
      }
      this.active.set(clipId, entry);
    }
  }
}
