/**
 * Local media analysis.
 *
 * The provider reads pictures but not sound, so audio has to be described in
 * words before the agent can time an edit to it. Everything here runs in the
 * browser on the decoded samples: duration, loudness curve, silence spans and a
 * beat grid. Video is described from its frame grabs and scene cuts.
 */
import { type MediaItem } from "./model";
import { decodeAudio, loudnessCurve, waveformFrom, beatGrid, detectScenes } from "./media-pool";
import { spectrogramDataUrl } from "./spectrogram";

export type AudioAnalysis = {
  duration: number;
  /** loudness 0..1 sampled every 50 ms */
  curve: number[];
  /** 0..1 peak envelope for the waveform strip */
  waveform: number[];
  beats: number[];
  silences: Array<{ start: number; end: number }>;
  /** labelled spectrogram PNG, rendered from the same decoded buffer */
  spectrogram?: string;
};

export async function analyseAudio(url: string): Promise<AudioAnalysis | null> {
  const buffer = await decodeAudio(url);
  if (!buffer) return null;
  const curve = loudnessCurve(buffer);
  const beats = beatGrid(buffer);
  const silences: Array<{ start: number; end: number }> = [];
  let open: number | null = null;
  curve.forEach((value, index) => {
    const t = index * 0.05;
    if (value < 0.06) {
      if (open === null) open = t;
    } else if (open !== null) {
      if (t - open > 0.35) silences.push({ start: Number(open.toFixed(2)), end: Number(t.toFixed(2)) });
      open = null;
    }
  });
  if (open !== null && buffer.duration - open > 0.35) {
    const from = open as number;
    silences.push({ start: Number(from.toFixed(2)), end: Number(buffer.duration.toFixed(2)) });
  }
  const spectrogram = spectrogramDataUrl(buffer) ?? undefined;
  return {
    duration: buffer.duration,
    curve,
    waveform: waveformFrom(buffer, 900),
    beats,
    silences: silences.slice(0, 40),
    ...(spectrogram ? { spectrogram } : {}),
  };
}

/** A short written description of an audio file for the agent prompt. */
export function describeAudio(item: MediaItem, analysis: AudioAnalysis): string {
  const lines: string[] = [];
  lines.push(`duration ${analysis.duration.toFixed(2)}s`);
  const peak = analysis.curve.reduce((m, v) => Math.max(m, v), 0);
  const average = analysis.curve.length ? analysis.curve.reduce((s, v) => s + v, 0) / analysis.curve.length : 0;
  lines.push(`peak loudness ${peak.toFixed(2)}, average ${average.toFixed(2)} (0..1)`);
  if (analysis.beats.length) {
    lines.push(
      `detected ${analysis.beats.length} beats, first 24: ${analysis.beats.slice(0, 24).map((b) => b.toFixed(2)).join(", ")}`,
    );
  } else {
    lines.push("no clear beat grid detected");
  }
  if (analysis.silences.length) {
    lines.push(
      `silence spans: ${analysis.silences
        .slice(0, 12)
        .map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}s`)
        .join(", ")}`,
    );
  }
  if (analysis.spectrogram) {
    lines.push(
      "A labelled spectrogram of this file is attached above: time runs left to right in seconds, frequency runs bottom to top in kHz.",
    );
    lines.push("Read it for content and timing: speech shows harmonic stacks with syllable gaps, music shows a steady beat grid and sustained low-frequency energy.");
  }
  lines.push(`use these times to align cuts and overlays to "${item.name}"`);
  return lines.join("\n");
}

/** A short written description of a video file for the agent prompt. */
export function describeVideo(item: MediaItem, scenes: number[]): string {
  const lines: string[] = [`duration ${item.duration.toFixed(2)}s`];
  if (item.width && item.height) lines.push(`resolution ${item.width}x${item.height}`);
  if (scenes.length) {
    lines.push(`scene changes detected at: ${scenes.slice(0, 30).map((s) => s.toFixed(2)).join(", ")}s`);
    lines.push("cut on these points for clean edits");
  } else {
    lines.push("no hard cuts detected");
  }
  if (item.frames?.length) lines.push(`${item.frames.length} still frames from across the clip are attached above`);
  return lines.join("\n");
}

/** Fill in the analysis fields on a media item, once. */
export async function enrichMedia(item: MediaItem): Promise<Partial<MediaItem>> {
  if (item.kind === "audio") {
    const analysis = await analyseAudio(item.url);
    if (!analysis) return {};
    return { waveform: analysis.waveform, beats: analysis.beats };
  }
  if (item.kind === "video") {
    try {
      const scenes = await detectScenes(item.url);
      return { scenes };
    } catch {
      return {};
    }
  }
  return {};
}
