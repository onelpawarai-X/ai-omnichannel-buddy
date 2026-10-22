/**
 * Timeline operations.
 *
 * Every mutation of the project - from the UI and from the agent's tools - goes
 * through `applyOp`, so there is exactly one implementation of each editing
 * behaviour. Ops are plain JSON, which makes them easy to log, replay and undo.
 */
import { EFFECT_BY_ID, appliedEffect, defaultValues, type EffectValues } from "./effects";
import {
  type Clip,
  type ClipFilter,
  type ClipKind,
  type MediaItem,
  type MediaKind,
  type ProjectSettings,
  type TextAnimation,
  type Track,
  type TrackKind,
  type TransitionKind,
  DEFAULT_PROJECT,
  DEFAULT_TEXT,
  createClip,
  createTrack,
  sampleKeyframes,
  timelineEnd,
  uid,
} from "./model";
import { getAnimation } from "./animations";

export type TimelineState = {
  project: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  media: MediaItem[];
};

export const emptyState = (): TimelineState => ({
  project: { ...DEFAULT_PROJECT },
  tracks: [createTrack("video", "V1"), createTrack("audio", "A1")],
  clips: [],
  media: [],
});

/** Keep the invariant that a visual project always has somewhere to drop clips. */
export function ensureBaselineTracks(state: TimelineState): TimelineState {
  const hasVideo = state.tracks.some((t) => t.kind === "video");
  const hasAudio = state.tracks.some((t) => t.kind === "audio");
  if (hasVideo && hasAudio) return state;
  const tracks = [...state.tracks];
  if (!hasVideo) tracks.unshift(createTrack("video", "V1"));
  if (!hasAudio) tracks.push(createTrack("audio", "A1"));
  return { ...state, tracks };
}

export type Op =
  | { op: "add_media"; media: Partial<MediaItem> & { url: string; kind: MediaKind; name?: string } }
  | { op: "remove_media"; mediaId: string }
  | { op: "add_clip"; clip: Partial<Clip> & { kind: ClipKind; mediaId?: string; trackId?: string; label?: string } }
  | { op: "remove_clip"; clipId: string }
  | { op: "move_clip"; clipId: string; start?: number; trackId?: string }
  | { op: "trim_clip"; clipId: string; start?: number; duration?: number; in?: number }
  | { op: "split_clip"; clipId: string; time: number }
  | { op: "set_clip"; clipId: string; patch: Partial<Clip> }
  | { op: "set_filter"; clipId: string; filter: Partial<ClipFilter> }
  | { op: "add_effect"; clipId: string; effectId: string; values?: EffectValues }
  | { op: "remove_effect"; clipId: string; effectId: string }
  | { op: "set_effect_values"; clipId: string; effectId: string; values: EffectValues }
  | { op: "add_keyframes"; clipId: string; keyframes: Array<Partial<Clip["keyframes"][number]> & { t: number }> }
  | { op: "clear_keyframes"; clipId: string }
  | { op: "set_transition"; clipId: string; kind: TransitionKind; duration?: number; direction?: "left" | "right" | "up" | "down" }
  | { op: "set_text"; clipId: string; patch: Partial<NonNullable<Clip["text"]>> }
  | { op: "add_track"; kind: TrackKind; name?: string }
  | { op: "set_track"; trackId: string; patch: Partial<Track> }
  | { op: "remove_track"; trackId: string }
  | { op: "set_project"; patch: Partial<ProjectSettings> }
  | { op: "add_animation"; animationId: string; trackId?: string; start?: number; duration?: number; scale?: number; x?: number; y?: number }
  | { op: "add_generated_video"; name: string; url: string; duration: number; trackId?: string; start?: number }
  | { op: "captions"; captions: Array<{ start: number; end: number; text: string }>; trackId?: string; style?: Partial<NonNullable<Clip["text"]>> }
  | { op: "beat_cut"; mediaId: string; beats?: number[]; trackId?: string; clipId?: string; targetMediaId?: string }
  | { op: "arrange"; mode: "sequence" | "stack" | "ripple"; trackId?: string }
  | { op: "snapshot"; label: string };

export type OpResult = {
  state: TimelineState;
  /** human-readable description of what changed, shown in the agent log */
  notes: string[];
  createdClipId?: string;
  createdMediaId?: string;
};

const findClip = (state: TimelineState, clipId: string): Clip | undefined => state.clips.find((c) => c.id === clipId);
const findTrack = (state: TimelineState, trackId: string): Track | undefined => state.tracks.find((t) => t.id === trackId);

function trackFor(state: TimelineState, kind: ClipKind, trackId?: string): Track {
  if (trackId) {
    const explicit = findTrack(state, trackId);
    if (explicit) return explicit;
  }
  const wanted: TrackKind = kind === "audio" ? "audio" : kind === "text" ? "text" : kind === "effect" ? "effect" : "video";
  const existing = state.tracks.find((t) => t.kind === wanted && !t.locked);
  if (existing) return existing;
  const created = createTrack(wanted);
  state.tracks.push(created);
  return created;
}

/** First free slot on a track, so agent-created clips do not overlap. */
function freeStart(state: TimelineState, trackId: string, duration: number, preferred = 0): number {
  const onTrack = state.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  let start = Math.max(0, preferred);
  for (const clip of onTrack) {
    if (start + duration <= clip.start) return start;
    if (start < clip.start + clip.duration) start = clip.start + clip.duration;
  }
  return start;
}

function defaultLabel(kind: ClipKind, media: MediaItem | undefined, fallback?: string): string {
  if (fallback) return fallback;
  if (media) return media.name;
  if (kind === "text") return "Text";
  if (kind === "effect") return "Animation";
  return kind.toUpperCase();
}

export function applyOp(state: TimelineState, op: Op): OpResult {
  const notes: string[] = [];
  const next: TimelineState = {
    project: { ...state.project },
    tracks: state.tracks.map((t) => ({ ...t })),
    clips: state.clips.map((c) => ({ ...c })),
    media: [...state.media],
  };
  let createdClipId: string | undefined;
  let createdMediaId: string | undefined;

  switch (op.op) {
    case "add_media": {
      const item: MediaItem = {
        id: op.media.id ?? uid("media"),
        name: op.media.name ?? op.media.url.split("/").pop() ?? "media",
        kind: op.media.kind,
        url: op.media.url,
        duration: op.media.duration ?? 5,
      };
      if (op.media.width !== undefined) item.width = op.media.width;
      if (op.media.height !== undefined) item.height = op.media.height;
      if (op.media.thumb !== undefined) item.thumb = op.media.thumb;
      if (op.media.frames !== undefined) item.frames = op.media.frames;
      if (op.media.source !== undefined) item.source = op.media.source;
      if (op.media.attribution !== undefined) item.attribution = op.media.attribution;
      if (op.media.waveform !== undefined) item.waveform = op.media.waveform;
      if (op.media.beats !== undefined) item.beats = op.media.beats;
      if (op.media.scenes !== undefined) item.scenes = op.media.scenes;
      if (op.media.spectrogram !== undefined) item.spectrogram = op.media.spectrogram;
      if (op.media.captions !== undefined) item.captions = op.media.captions;
      next.media.push(item);
      createdMediaId = item.id;
      notes.push(`added ${item.kind} "${item.name}" to the media pool`);
      break;
    }

    case "remove_media": {
      const media = next.media.find((m) => m.id === op.mediaId);
      next.media = next.media.filter((m) => m.id !== op.mediaId);
      const before = next.clips.length;
      next.clips = next.clips.filter((c) => c.mediaId !== op.mediaId);
      notes.push(`removed media "${media?.name ?? op.mediaId}" and ${before - next.clips.length} clip(s)`);
      break;
    }

    case "add_clip": {
      const media = op.clip.mediaId ? next.media.find((m) => m.id === op.clip.mediaId) : undefined;
      const track = trackFor(next, op.clip.kind, op.clip.trackId);
      const duration = op.clip.duration ?? media?.duration ?? (op.clip.kind === "text" ? 3 : 5);
      const start = op.clip.start ?? freeStart(next, track.id, duration);
      const clip = createClip({
        ...op.clip,
        kind: op.clip.kind,
        trackId: track.id,
        label: defaultLabel(op.clip.kind, media, op.clip.label),
        start,
        duration,
      });
      if (op.clip.mediaId) clip.mediaId = op.clip.mediaId;
      next.clips.push(clip);
      createdClipId = clip.id;
      notes.push(`added ${clip.kind} clip "${clip.label}" on ${track.name} at ${start.toFixed(2)}s for ${duration.toFixed(2)}s`);
      break;
    }

    case "remove_clip": {
      const clip = findClip(next, op.clipId);
      next.clips = next.clips.filter((c) => c.id !== op.clipId);
      notes.push(clip ? `removed clip "${clip.label}"` : `clip ${op.clipId} not found`);
      break;
    }

    case "move_clip": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      if (op.start !== undefined) clip.start = Math.max(0, op.start);
      if (op.trackId) {
        const track = findTrack(next, op.trackId);
        if (track) clip.trackId = track.id;
      }
      notes.push(`moved "${clip.label}" to ${clip.start.toFixed(2)}s`);
      break;
    }

    case "trim_clip": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      if (op.start !== undefined) clip.start = Math.max(0, op.start);
      if (op.in !== undefined) clip.in = Math.max(0, op.in);
      if (op.duration !== undefined) clip.duration = Math.max(0.05, op.duration);
      notes.push(`trimmed "${clip.label}" to ${clip.duration.toFixed(2)}s from ${clip.start.toFixed(2)}s`);
      break;
    }

    case "split_clip": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      const offset = op.time - clip.start;
      if (offset <= 0.02 || offset >= clip.duration - 0.02) {
        notes.push(`split point ${op.time.toFixed(2)}s is outside "${clip.label}"`);
        break;
      }
      const tail: Clip = {
        ...clip,
        id: uid("clip"),
        start: clip.start + offset,
        duration: clip.duration - offset,
        in: clip.in + offset * clip.speed,
        keyframes: clip.keyframes.filter((k) => k.t >= offset).map((k) => ({ ...k, t: k.t - offset })),
        effectValues: { ...clip.effectValues },
      };
      clip.duration = offset;
      clip.keyframes = clip.keyframes.filter((k) => k.t <= offset);
      next.clips.push(tail);
      createdClipId = tail.id;
      notes.push(`split "${clip.label}" at ${op.time.toFixed(2)}s`);
      break;
    }

    case "set_clip": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      const { id: _ignoredId, ...patch } = op.patch;
      Object.assign(clip, patch);
      notes.push(`updated "${clip.label}" (${Object.keys(patch).join(", ")})`);
      break;
    }

    case "set_filter": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      clip.filter = { ...clip.filter, ...op.filter };
      notes.push(`graded "${clip.label}" (${Object.keys(op.filter).join(", ")})`);
      break;
    }

    case "add_effect": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      const def = EFFECT_BY_ID.get(op.effectId);
      if (!def) {
        notes.push(`unknown effect "${op.effectId}"`);
        break;
      }
      if (!clip.effects.includes(op.effectId)) clip.effects.push(op.effectId);
      const applied = appliedEffect(op.effectId, op.values ?? {});
      clip.effectValues[op.effectId] = { ...applied.values };
      notes.push(`applied effect "${def.name}" to "${clip.label}"`);
      break;
    }

    case "remove_effect": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      clip.effects = clip.effects.filter((id) => id !== op.effectId);
      delete clip.effectValues[op.effectId];
      notes.push(`removed effect "${op.effectId}" from "${clip.label}"`);
      break;
    }

    case "set_effect_values": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      const def = EFFECT_BY_ID.get(op.effectId);
      const base = def ? defaultValues(def) : {};
      clip.effectValues[op.effectId] = { ...base, ...(clip.effectValues[op.effectId] ?? {}), ...op.values };
      if (!clip.effects.includes(op.effectId)) clip.effects.push(op.effectId);
      notes.push(`tuned effect "${op.effectId}" on "${clip.label}"`);
      break;
    }

    case "add_keyframes": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      for (const incoming of op.keyframes) {
        const frame = {
          t: Math.max(0, incoming.t),
          x: incoming.x ?? clip.x,
          y: incoming.y ?? clip.y,
          scale: incoming.scale ?? clip.scale,
          rotation: incoming.rotation ?? clip.rotation,
          opacity: incoming.opacity ?? clip.opacity,
        };
        const existing = clip.keyframes.findIndex((k) => Math.abs(k.t - frame.t) < 0.001);
        if (existing >= 0) clip.keyframes[existing] = frame;
        else clip.keyframes.push(frame);
      }
      clip.keyframes.sort((a, b) => a.t - b.t);
      notes.push(`set ${op.keyframes.length} keyframe(s) on "${clip.label}"`);
      break;
    }

    case "clear_keyframes": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      clip.keyframes = [];
      notes.push(`cleared keyframes on "${clip.label}"`);
      break;
    }

    case "set_transition": {
      const clip = findClip(next, op.clipId);
      if (!clip) {
        notes.push(`clip ${op.clipId} not found`);
        break;
      }
      clip.transition = {
        kind: op.kind,
        duration: Math.max(0, op.duration ?? (op.kind === "none" ? 0 : 0.6)),
        direction: op.direction ?? clip.transition.direction,
      };
      notes.push(`set ${op.kind} transition (${clip.transition.duration}s) on "${clip.label}"`);
      break;
    }

    case "set_text": {
      const clip = findClip(next, op.clipId);
      if (!clip?.text) {
        notes.push(`clip ${op.clipId} has no text layer`);
        break;
      }
      clip.text = { ...clip.text, ...op.patch };
      if (op.patch.content !== undefined) clip.label = op.patch.content.slice(0, 32) || clip.label;
      notes.push(`updated text "${clip.text.content.slice(0, 24)}"`);
      break;
    }

    case "add_track": {
      const track = createTrack(op.kind, op.name);
      next.tracks.push(track);
      notes.push(`added ${op.kind} track "${track.name}"`);
      break;
    }

    case "set_track": {
      const track = findTrack(next, op.trackId);
      if (!track) {
        notes.push(`track ${op.trackId} not found`);
        break;
      }
      Object.assign(track, op.patch);
      notes.push(`updated track "${track.name}"`);
      break;
    }

    case "remove_track": {
      const track = findTrack(next, op.trackId);
      const removed = next.clips.filter((c) => c.trackId === op.trackId).length;
      next.clips = next.clips.filter((c) => c.trackId !== op.trackId);
      next.tracks = next.tracks.filter((t) => t.id !== op.trackId);
      notes.push(`removed track "${track?.name ?? op.trackId}" and ${removed} clip(s)`);
      break;
    }

    case "set_project": {
      next.project = { ...next.project, ...op.patch };
      notes.push(`project set to ${next.project.width}x${next.project.height} @ ${next.project.fps}fps`);
      break;
    }

    case "add_animation": {
      const animation = getAnimation(op.animationId);
      if (!animation) {
        notes.push(`unknown animation "${op.animationId}"`);
        break;
      }
      const track = trackFor(next, "effect");
      const duration = op.duration ?? animation.duration;
      const start = op.start ?? freeStart(next, track.id, duration);
      const clip = createClip({
        kind: "effect",
        trackId: track.id,
        label: animation.name,
        start,
        duration,
        animationId: animation.id,
        scale: op.scale ?? 1,
      });
      if (op.x !== undefined) clip.x = op.x;
      if (op.y !== undefined) clip.y = op.y;
      clip.blendMode = "screen";
      next.clips.push(clip);
      createdClipId = clip.id;
      notes.push(`added animation "${animation.name}" on ${track.name} at ${start.toFixed(2)}s for ${duration.toFixed(2)}s`);
      break;
    }

    case "add_generated_video": {
      const item: MediaItem = {
        id: uid("media"),
        name: op.name,
        kind: "video",
        url: op.url,
        duration: op.duration,
        source: "generated",
      };
      next.media.push(item);
      createdMediaId = item.id;
      const track = trackFor(next, "video", op.trackId);
      const start = op.start ?? freeStart(next, track.id, op.duration);
      const clip = createClip({
        kind: "video",
        trackId: track.id,
        mediaId: item.id,
        label: op.name,
        start,
        duration: op.duration,
      });
      next.clips.push(clip);
      createdClipId = clip.id;
      notes.push(`placed generated video "${op.name}" (${op.duration.toFixed(2)}s) at ${start.toFixed(2)}s`);
      break;
    }

    case "captions": {
      const track = trackFor(next, "text", op.trackId);
      for (const caption of op.captions) {
        const duration = Math.max(0.2, caption.end - caption.start);
        const clip = createClip({
          kind: "text",
          trackId: track.id,
          label: caption.text.slice(0, 32),
          start: caption.start,
          duration,
          text: {
            ...DEFAULT_TEXT,
            content: caption.text,
            y: 0.86,
            animation: "none",
            ...op.style,
          },
        });
        next.clips.push(clip);
        if (!createdClipId) createdClipId = clip.id;
      }
      notes.push(`added ${op.captions.length} caption(s) on ${track.name}`);
      break;
    }

    case "beat_cut": {
      // mediaId names the *beat source* - usually a music track. The clips to cut
      // are chosen separately, because the whole point is to cut picture to the
      // beat of sound: when the beat source has no clips of its own, cut the
      // video instead of reporting that nothing could be done.
      const source = next.media.find((m) => m.id === op.mediaId);
      const beats = (op.beats ?? source?.beats ?? []).filter((b) => Number.isFinite(b));
      if (beats.length < 2) {
        notes.push(`beat cut needs at least 2 beats on the source (found ${beats.length})`);
        break;
      }
      // Only picture is cut. Splitting the music on its own beats just fragments
      // the track, so the beat source is normally used purely for timing.
      const isPicture = (clip: Clip): boolean => findTrack(next, clip.trackId)?.kind !== "audio";
      let targets: Clip[];
      if (op.clipId) {
        const one = findClip(next, op.clipId);
        targets = one ? [one] : [];
      } else if (op.targetMediaId) {
        targets = next.clips.filter((c) => c.mediaId === op.targetMediaId && isPicture(c));
      } else {
        const own = next.clips.filter((c) => c.mediaId === op.mediaId && isPicture(c));
        targets = own.length
          ? own
          : next.clips.filter((c) => isPicture(c) && !c.locked && (!op.trackId || c.trackId === op.trackId));
      }
      targets = targets.filter((c) => !c.locked).sort((a, b) => a.start - b.start);
      if (!targets.length) {
        notes.push("beat cut found no clip to cut");
        break;
      }
      // Two traps here. applyOp returns a new state, so each split has to be fed
      // back into `next` or the cut is lost. And a split shortens the clip it cut,
      // so splitting forwards would leave every later beat outside the clip -
      // walk the beats backwards so each split still lands inside it.
      let cuts = 0;
      for (const clip of targets) {
        const inside = beats.filter((b) => b > clip.start + 0.05 && b < clip.start + clip.duration - 0.05);
        for (const beat of [...inside].reverse()) {
          const split = applyOp(next, { op: "split_clip", clipId: clip.id, time: beat });
          next.clips = split.state.clips;
          cuts++;
        }
      }
      const label = source ? `"${source.name}"` : "the beat source";
      notes.push(`cut ${targets.length} clip(s) on ${cuts} beat(s) of ${label}`);
      break;
    }

    case "arrange": {
      const targets = next.clips
        .filter((c) => (op.trackId ? c.trackId === op.trackId : true) && !c.locked)
        .sort((a, b) => a.start - b.start);
      if (op.mode === "sequence") {
        let cursor = 0;
        const groups = new Map<string, Clip[]>();
        for (const clip of targets) {
          const list = groups.get(clip.trackId) ?? [];
          list.push(clip);
          groups.set(clip.trackId, list);
        }
        for (const list of groups.values()) {
          cursor = 0;
          for (const clip of list) {
            clip.start = cursor;
            cursor += clip.duration;
          }
        }
        notes.push(`sequenced ${targets.length} clip(s) end to end`);
      } else if (op.mode === "stack") {
        for (const clip of targets) clip.start = 0;
        notes.push(`stacked ${targets.length} clip(s) at 0s`);
      } else {
        let cursor = 0;
        for (const clip of targets) {
          clip.start = cursor;
          cursor += clip.duration;
        }
        notes.push(`rippled ${targets.length} clip(s)`);
      }
      break;
    }

    case "snapshot": {
      notes.push(op.label);
      break;
    }
  }

  return {
    state: ensureBaselineTracks(next),
    notes,
    ...(createdClipId ? { createdClipId } : {}),
    ...(createdMediaId ? { createdMediaId } : {}),
  };
}

/** Apply a batch of ops in order; stops at the first hard failure only if asked. */
export function applyOps(state: TimelineState, ops: Op[]): OpResult {
  let current = state;
  const notes: string[] = [];
  let createdClipId: string | undefined;
  let createdMediaId: string | undefined;
  for (const op of ops) {
    const result = applyOp(current, op);
    current = result.state;
    notes.push(...result.notes);
    if (result.createdClipId) createdClipId = result.createdClipId;
    if (result.createdMediaId) createdMediaId = result.createdMediaId;
  }
  return {
    state: current,
    notes,
    ...(createdClipId ? { createdClipId } : {}),
    ...(createdMediaId ? { createdMediaId } : {}),
  };
}

/** Compact timeline description for the agent prompt. */
export function describeTimeline(state: TimelineState, maxClips = 60): string {
  const lines: string[] = [];
  const end = timelineEnd(state.clips);
  lines.push(`project: ${state.project.width}x${state.project.height} @ ${state.project.fps}fps, duration ${end.toFixed(2)}s`);
  lines.push(`media (${state.media.length}):`);
  for (const item of state.media.slice(0, 40)) {
    const beats = item.beats?.length ? `, beats=${item.beats.length}` : "";
    const scenes = item.scenes?.length ? `, scenes=${item.scenes.length}` : "";
    const spectrogram = item.spectrogram ? ", spectrogram=attached" : "";
    lines.push(
      `  ${item.id} "${item.name}" ${item.kind} ${item.duration.toFixed(2)}s${item.width ? ` ${item.width}x${item.height}` : ""}${beats}${scenes}${spectrogram}`,
    );
  }
  lines.push(`tracks (${state.tracks.length}):`);
  for (const track of state.tracks) {
    const flags = [track.muted ? "muted" : "", track.hidden ? "hidden" : "", track.locked ? "locked" : ""].filter(Boolean).join(",");
    lines.push(`  ${track.id} ${track.name} [${track.kind}] vol=${track.volume.toFixed(2)}${flags ? ` (${flags})` : ""}`);
  }
  lines.push(`clips (${state.clips.length}):`);
  const clips = [...state.clips].sort((a, b) => a.start - b.start).slice(0, maxClips);
  for (const clip of clips) {
    const bits: string[] = [
      `${clip.id} ${clip.kind} "${clip.label}"`,
      `${clip.start.toFixed(2)}s->${(clip.start + clip.duration).toFixed(2)}s`,
      `track=${clip.trackId}`,
    ];
    if (clip.mediaId) bits.push(`media=${clip.mediaId}`);
    if (clip.speed !== 1) bits.push(`speed=${clip.speed}`);
    if (clip.volume !== 1) bits.push(`vol=${clip.volume}`);
    if (clip.effects.length) bits.push(`effects=${clip.effects.join("+")}`);
    if (clip.keyframes.length) bits.push(`keys=${clip.keyframes.length}`);
    if (clip.transition.kind !== "none") bits.push(`transition=${clip.transition.kind}@${clip.transition.duration}s`);
    if (clip.text) bits.push(`text="${clip.text.content.slice(0, 40)}" anim=${clip.text.animation}`);
    if (clip.chroma?.enabled) bits.push("chroma");
    lines.push(`  ${bits.join(" ")}`);
  }
  if (state.clips.length > clips.length) lines.push(`  ... ${state.clips.length - clips.length} more clip(s)`);
  return lines.join("\n");
}

/** Name of a clip's source media, or undefined. */
export function clipMediaName(state: TimelineState, clip: Clip): string | undefined {
  return clip.mediaId ? state.media.find((m) => m.id === clip.mediaId)?.name : undefined;
}

/** Current transform values at a time, for the inspector readout. */
export function clipTransformAt(clip: Clip, time: number): ReturnType<typeof sampleKeyframes> {
  return sampleKeyframes(clip, time - clip.start);
}
