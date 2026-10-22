/**
 * Editor state: media library, timeline clips, playhead, agent conversation.
 * The AI agent mutates the timeline exclusively through applyOp().
 */
import { create } from "zustand";
import { guessKindFromType, probeAudio, probeImage, probeVideo } from "./media";
import { sttTranscribe, ttsToBlob, DEFAULT_TTS_VOICE } from "./zyraxon";

export type MediaKind = "video" | "audio" | "image";
export type ClipKind = "video" | "audio" | "image" | "text";

export type VideoFilter = {
  brightness: number; // %
  contrast: number; // %
  saturate: number; // %
  blur: number; // px
  grayscale: number; // %
  sepia: number; // %
  hue: number; // deg
};

export const DEFAULT_FILTER: VideoFilter = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hue: 0,
};

export type TextProps = {
  content: string;
  x: number; // 0..1
  y: number; // 0..1
  size: number; // px at 1080p canvas height
  color: string;
  weight: number;
  align: "left" | "center" | "right";
  shadow: boolean;
};

export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  thumb?: string;
  frames?: string[];
  transcript?: string;
  source?: "upload" | "url" | "generated" | "tts" | "console";
  blob?: Blob;
};

export type Clip = {
  id: string;
  kind: ClipKind;
  mediaId?: string;
  label: string;
  start: number;
  duration: number;
  in: number; // offset into the media
  speed: number;
  volume: number; // 0..1
  muted: boolean;
  filter: VideoFilter;
  text?: TextProps;
};

export type AgentOp = { op: string; args: Record<string, unknown>; result: string; ok: boolean };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "note";
  content: string;
  ops?: AgentOp[];
  streaming?: boolean;
};

export type Op = { op: string } & Record<string, unknown>;

let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

type Snapshot = { clips: Clip[] };

type EditorState = {
  media: MediaItem[];
  clips: Clip[];
  playhead: number;
  playing: boolean;
  selectedClipId: string | null;
  pxPerSec: number;
  sttLanguage: string;
  ttsVoice: string;
  messages: AgentMessage[];
  agentBusy: boolean;
  past: Snapshot[];
  // actions
  addMediaFromFile: (file: File) => Promise<MediaItem>;
  addMediaFromUrl: (
    url: string,
    name?: string,
    source?: MediaItem["source"],
    forceKind?: MediaKind,
    blob?: Blob,
  ) => Promise<MediaItem>;
  addGeneratedImage: (dataUrl: string, name: string) => MediaItem;
  addTtsAudio: (text: string, opts?: { voice?: string; locale?: string }) => Promise<MediaItem>;
  transcribeMedia: (mediaId: string) => Promise<string>;
  removeMedia: (mediaId: string) => void;
  addClipForMedia: (mediaId: string, atTime?: number) => Clip | null;
  addTextClip: (props: Partial<TextProps> & { start?: number; duration?: number }) => Clip;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  splitClipAt: (clipId: string, time: number) => boolean;
  deleteClip: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setPxPerSec: (pps: number) => void;
  setSttLanguage: (lang: string) => void;
  setTtsVoice: (voice: string) => void;
  pushMessage: (msg: AgentMessage) => string;
  patchMessage: (id: string, patch: Partial<AgentMessage>) => void;
  setAgentBusy: (busy: boolean) => void;
  pushUndo: () => void;
  undo: () => void;
  totalDuration: () => number;
  clipAtPlayhead: (kind?: "video" | "audio") => Clip | undefined;
  applyOp: (op: Op) => Promise<string>;
};

const timelineEnd = (clips: Clip[]) => clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);

const filterCss = (f: VideoFilter): string => {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  return parts.length ? parts.join(" ") : "none";
};
export { filterCss };

export const useEditorStore = create<EditorState>((set, get) => ({
  media: [],
  clips: [],
  playhead: 0,
  playing: false,
  selectedClipId: null,
  pxPerSec: 60,
  sttLanguage: "bn",
  ttsVoice: DEFAULT_TTS_VOICE,
  messages: [
    {
      id: "welcome",
      role: "note",
      content:
        "ZYRAXON এডিটর এজেন্ট রেডি। মিডিয়া আপলোড করুন বা নিচে লিখে বলুন কী করতে হবে — কাট, ট্রিম, টেক্সট, ইফেক্ট, ভয়েসওভার, ইমেজ জেনারেট সব সে নিজে করবে।",
    },
  ],
  agentBusy: false,
  past: [],

  addMediaFromFile: async (file) => {
    const url = URL.createObjectURL(file);
    const kind = guessKindFromType(file.type, file.name) ?? "video";
    return await get().addMediaFromUrl(url, file.name, "upload", kind, file);
  },

  addMediaFromUrl: async (url, name, source = "url", forceKind, blob) => {
    const id = uid("m");
    const kind: MediaKind =
      forceKind ??
      (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)
        ? "audio"
        : /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)
          ? "image"
          : "video");
    const item: MediaItem = {
      id,
      name: name ?? url.split("/").pop()?.slice(0, 60) ?? "media",
      kind,
      url,
      duration: 0,
      source,
    };
    if (blob) item.blob = blob;

    set((s) => ({ media: [...s.media, item] }));
    try {
      const probe = kind === "video" ? await probeVideo(url) : kind === "audio" ? await probeAudio(url) : await probeImage(url);
      const updated: MediaItem = { ...item, ...probe };
      set((s) => ({ media: s.media.map((m) => (m.id === id ? updated : m)) }));
      return updated;
    } catch {
      return item;
    }
  },

  addGeneratedImage: (dataUrl, name) => {
    const id = uid("m");
    const item: MediaItem = { id, name, kind: "image", url: dataUrl, duration: 4, source: "generated" };
    set((s) => ({ media: [...s.media, item] }));
    probeImage(dataUrl).then((probe) => {
      set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...probe } : m)) }));
    });
    return item;
  },

  addTtsAudio: async (text, opts) => {
    const blob = await ttsToBlob(text, opts ?? { voice: get().ttsVoice });
    const url = URL.createObjectURL(blob);
    const id = uid("m");
    const item: MediaItem = {
      id,
      name: `voice: ${text.slice(0, 24)}`,
      kind: "audio",
      url,
      duration: 0,
      source: "tts",
      blob,
    };
    set((s) => ({ media: [...s.media, item] }));
    const probe = await probeAudio(url);
    const updated = { ...item, ...probe };
    set((s) => ({ media: s.media.map((m) => (m.id === id ? updated : m)) }));
    return updated;
  },

  transcribeMedia: async (mediaId) => {
    const item = get().media.find((m) => m.id === mediaId);
    if (!item) return "";
    let source: Blob | null = item.blob ?? null;
    if (!source && item.url.startsWith("blob:") && item.kind !== "image") {
      try {
        source = await (await fetch(item.url)).blob();
      } catch {
        source = null;
      }
    }
    if (!source) return "";
    try {
      const text = await sttTranscribe(source, get().sttLanguage, `audio.${item.kind === "video" ? "webm" : "mp3"}`);
      if (text) set((s) => ({ media: s.media.map((m) => (m.id === mediaId ? { ...m, transcript: text } : m)) }));
      return text;
    } catch {
      return "";
    }
  },

  removeMedia: (mediaId) =>
    set((s) => ({
      media: s.media.filter((m) => m.id !== mediaId),
      clips: s.clips.filter((c) => c.mediaId !== mediaId),
    })),

  addClipForMedia: (mediaId, atTime) => {
    const item = get().media.find((m) => m.id === mediaId);
    if (!item) return null;
    const kind: ClipKind = item.kind === "audio" ? "audio" : item.kind;
    const start = atTime ?? timelineEnd(get().clips.filter((c) => (item.kind === "audio" ? c.kind === "audio" : c.kind !== "audio")));
    const duration = item.kind === "image" ? 4 : item.duration || 5;
    get().pushUndo();
    const clip: Clip = {
      id: uid("c"),
      kind,
      mediaId,
      label: item.name,
      start: Math.max(0, start),
      duration,
      in: 0,
      speed: 1,
      volume: 1,
      muted: false,
      filter: { ...DEFAULT_FILTER },
    };
    set((s) => ({ clips: [...s.clips, clip], selectedClipId: clip.id }));
    return clip;
  },

  addTextClip: (props) => {
    get().pushUndo();
    const clip: Clip = {
      id: uid("t"),
      kind: "text",
      label: (props.content ?? "Text").slice(0, 24),
      start: props.start ?? get().playhead,
      duration: props.duration ?? 3,
      in: 0,
      speed: 1,
      volume: 1,
      muted: false,
      filter: { ...DEFAULT_FILTER },
      text: {
        content: props.content ?? "Text",
        x: props.x ?? 0.5,
        y: props.y ?? 0.85,
        size: props.size ?? 64,
        color: props.color ?? "#ffffff",
        weight: props.weight ?? 700,
        align: props.align ?? "center",
        shadow: props.shadow ?? true,
      },
    };
    set((s) => ({ clips: [...s.clips, clip], selectedClipId: clip.id }));
    return clip;
  },

  updateClip: (clipId, patch) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) })),

  splitClipAt: (clipId, time) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip) return false;
    if (time <= clip.start + 0.05 || time >= clip.start + clip.duration - 0.05) return false;
    get().pushUndo();
    const leftDur = time - clip.start;
    const rightDur = clip.duration - leftDur;
    const right: Clip = {
      ...clip,
      id: uid("c"),
      start: time,
      duration: rightDur,
      in: clip.in + leftDur * clip.speed,
      filter: { ...clip.filter },
      ...(clip.text ? { text: { ...clip.text } } : {}),
    };
    set((s) => ({
      clips: [...s.clips.map((c) => (c.id === clipId ? { ...c, duration: leftDur } : c)), right],
      selectedClipId: right.id,
    }));
    return true;
  },

  deleteClip: (clipId) => {
    get().pushUndo();
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== clipId),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }));
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  seek: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setPxPerSec: (pps) => set({ pxPerSec: Math.min(300, Math.max(8, pps)) }),
  setSttLanguage: (lang) => set({ sttLanguage: lang }),
  setTtsVoice: (voice) => set({ ttsVoice: voice }),
  pushMessage: (msg) => {
    const id = msg.id || uid("msg");
    set((s) => ({ messages: [...s.messages, { ...msg, id }] }));
    return id;
  },
  patchMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  setAgentBusy: (busy) => set({ agentBusy: busy }),
  pushUndo: () =>
    set((s) => ({
      past: [...s.past.slice(-49), { clips: s.clips.map((c) => ({ ...c, filter: { ...c.filter } })) }],
    })),
  undo: () =>
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (!last) return {};
      return { clips: last.clips, past: s.past.slice(0, -1) };
    }),

  totalDuration: () => timelineEnd(get().clips),
  clipAtPlayhead: (kind) => {
    const t = get().playhead;
    return get()
      .clips.filter(
        (c) => (kind ? c.kind === kind : c.kind !== "audio" && c.kind !== "text") && t >= c.start && t < c.start + c.duration,
      )
      .sort((a, b) => a.start - b.start)
      .pop();
  },

  // ---- Agent op executor -------------------------------------------------
  applyOp: async (rawOp) => {
    const state = get();
    const op = rawOp as { [key: string]: unknown };
    const arg = <T,>(key: string): T | undefined => (op[key] === undefined ? undefined : (op[key] as T));
    const num = (key: string): number | undefined => {
      const v = arg<unknown>(key);
      return v === undefined ? undefined : Number(v);
    };
    const str = (key: string): string | undefined => {
      const v = arg<unknown>(key);
      return v === undefined ? undefined : String(v);
    };
    const resolveClip = (): Clip | undefined => {
      const id = str("clipId");
      if (id) return state.clips.find((c) => c.id === id);
      if (state.selectedClipId) return state.clips.find((c) => c.id === state.selectedClipId);
      return state.clipAtPlayhead();
    };

    switch (str("op") ?? "") {
      case "seek": {
        const t = num("time") ?? 0;
        get().seek(t);
        return `Playhead moved to ${t.toFixed(2)}s`;
      }
      case "play":
        get().setPlaying(true);
        return "Playing";
      case "pause":
        get().setPlaying(false);
        return "Paused";
      case "split_clip": {
        const at = num("at") ?? get().playhead;
        const clip = str("clipId") ? state.clips.find((c) => c.id === str("clipId")) : get().clipAtPlayhead();
        if (!clip) return "ERROR: no clip at that time";
        const ok = get().splitClipAt(clip.id, at);
        return ok ? `Split "${clip.label}" at ${at.toFixed(2)}s` : "ERROR: split point too close to clip edge";
      }
      case "trim_clip": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        const inV = num("in") ?? clip.in;
        const dur = num("duration") ?? clip.duration;
        get().pushUndo();
        get().updateClip(clip.id, { in: Math.max(0, inV), duration: Math.max(0.1, dur) });
        return `Trimmed "${clip.label}" (in=${inV.toFixed(2)}s, duration=${dur.toFixed(2)}s)`;
      }
      case "move_clip": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        const start = Math.max(0, num("start") ?? clip.start);
        get().pushUndo();
        get().updateClip(clip.id, { start });
        return `"${clip.label}" moved to ${start.toFixed(2)}s`;
      }
      case "delete_clip": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        get().deleteClip(clip.id);
        return `Deleted "${clip.label}"`;
      }
      case "duplicate_clip": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        get().pushUndo();
        const copy: Clip = {
          ...clip,
          id: uid("c"),
          start: clip.start + clip.duration,
          filter: { ...clip.filter },
          ...(clip.text ? { text: { ...clip.text } } : {}),
        };
        set((s) => ({ clips: [...s.clips, copy] }));
        return `Duplicated "${clip.label}"`;
      }
      case "set_speed": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        const speed = Math.min(4, Math.max(0.25, num("speed") ?? 1));
        const oldDur = clip.duration;
        get().pushUndo();
        get().updateClip(clip.id, { speed, duration: (oldDur * clip.speed) / speed });
        return `"${clip.label}" speed set to ${speed}x`;
      }
      case "set_volume": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found";
        const volume = Math.min(1, Math.max(0, num("volume") ?? 1));
        const mute = arg<boolean>("mute") === true;
        get().pushUndo();
        get().updateClip(clip.id, { volume, muted: mute });
        return `"${clip.label}" volume ${mute ? "muted" : `set to ${Math.round(volume * 100)}%`}`;
      }
      case "set_filter": {
        const clip = resolveClip();
        if (!clip) return "ERROR: no clip found (filters apply to video/image clips)";
        if (clip.kind === "audio" || clip.kind === "text") return "ERROR: filters only apply to video/image clips";
        const presets: Record<string, Partial<VideoFilter>> = {
          none: { ...DEFAULT_FILTER },
          grayscale: { grayscale: 100 },
          warm: { saturate: 130, hue: -10, brightness: 105 },
          cool: { saturate: 110, hue: 15 },
          vintage: { sepia: 45, contrast: 90, saturate: 80 },
          dreamy: { blur: 1.5, brightness: 110, saturate: 115 },
          bw_contrast: { grayscale: 100, contrast: 130 },
        };
        const presetName = str("preset");
        const preset = presetName ? presets[presetName] : undefined;
        const patch = (arg<Partial<VideoFilter>>("filter") ?? {}) as Partial<VideoFilter>;
        get().pushUndo();
        get().updateClip(clip.id, { filter: { ...clip.filter, ...(preset ?? patch) } });
        return `Filter applied to "${clip.label}"`;
      }
      case "add_text": {
        const textProps: Partial<TextProps> & { start?: number; duration?: number } = {};
        const contentVal = str("content");
        if (contentVal !== undefined) textProps.content = contentVal;
        const startVal = num("start");
        if (startVal !== undefined) textProps.start = startVal;
        const durationVal = num("duration");
        if (durationVal !== undefined) textProps.duration = durationVal;
        const xVal = num("x");
        if (xVal !== undefined) textProps.x = xVal;
        const yVal = num("y");
        if (yVal !== undefined) textProps.y = yVal;
        const sizeVal = num("size");
        if (sizeVal !== undefined) textProps.size = sizeVal;
        const colorVal = str("color");
        if (colorVal !== undefined) textProps.color = colorVal;
        const weightVal = num("weight");
        if (weightVal !== undefined) textProps.weight = weightVal;
        const clip = get().addTextClip(textProps);
        return `Text added: "${clip.text?.content}" at ${clip.start.toFixed(2)}s for ${clip.duration.toFixed(1)}s`;
      }
      case "update_text": {
        const clip = resolveClip();
        if (!clip || !clip.text) return "ERROR: no text clip found";
        const t = { ...clip.text };
        const contentVal = str("content");
        if (contentVal !== undefined) t.content = contentVal;
        const xVal = num("x");
        if (xVal !== undefined) t.x = Math.min(1, Math.max(0, xVal));
        const yVal = num("y");
        if (yVal !== undefined) t.y = Math.min(1, Math.max(0, yVal));
        const sizeVal = num("size");
        if (sizeVal !== undefined) t.size = Math.max(8, sizeVal);
        const colorVal = str("color");
        if (colorVal !== undefined) t.color = colorVal;
        const weightVal = num("weight");
        if (weightVal !== undefined) t.weight = weightVal;
        get().pushUndo();
        get().updateClip(clip.id, { text: t, label: t.content.slice(0, 24) });
        return `Text updated: "${t.content}"`;
      }
      case "add_media": {
        const url = str("url") ?? "";
        if (!/^https?:\/\//i.test(url)) return "ERROR: url must be http(s)";
        const item = await get().addMediaFromUrl(
          `/api/public/fetch-media?url=${encodeURIComponent(url)}`,
          str("name"),
          "url",
        );
        const clip = get().addClipForMedia(item.id, num("start"));
        return clip
          ? `Media added and placed at ${clip.start.toFixed(2)}s (${item.kind}, ${item.duration.toFixed(1)}s)`
          : "ERROR: could not place media";
      }
      case "generate_image": {
        const prompt = (str("prompt") ?? "").slice(0, 1000);
        if (!prompt) return "ERROR: prompt required";
        const { streamImage } = await import("./stream-image");
        let final = "";
        await streamImage("/api/public/gen-image", { prompt }, (dataUrl, isFinal) => {
          if (isFinal) final = dataUrl;
        });
        if (!final) return "ERROR: image generation returned nothing";
        const item = get().addGeneratedImage(final, `gen: ${prompt.slice(0, 24)}`);
        const clip = get().addClipForMedia(item.id, num("start"));
        const dur = num("duration");
        if (clip && dur !== undefined) get().updateClip(clip.id, { duration: Math.max(0.5, dur) });
        return `Image generated from prompt and placed at ${clip?.start.toFixed(2) ?? "0"}s`;
      }
      case "tts": {
        const text = (str("text") ?? "").slice(0, 5000);
        if (!text) return "ERROR: text required";
        const ttsOpts: { voice?: string; locale?: string } = {};
        const voiceVal = str("voice");
        if (voiceVal !== undefined) ttsOpts.voice = voiceVal;
        const localeVal = str("locale");
        if (localeVal !== undefined) ttsOpts.locale = localeVal;

        const item = await get().addTtsAudio(text, ttsOpts);
        const clip = get().addClipForMedia(item.id, num("start"));
        return clip
          ? `Voiceover added at ${clip.start.toFixed(2)}s (${item.duration.toFixed(1)}s): "${text.slice(0, 40)}"`
          : "ERROR: could not place voiceover";
      }
      case "transcribe": {
        const clip = resolveClip();
        if (!clip || !clip.mediaId) return "ERROR: no media clip found";
        const text = await get().transcribeMedia(clip.mediaId);
        return text ? `Transcript: ${text.slice(0, 800)}` : "ERROR: transcription failed or no audio";
      }
      case "list_state": {
        const s = get();
        return JSON.stringify({
          playhead: Number(s.playhead.toFixed(2)),
          duration: Number(timelineEnd(s.clips).toFixed(2)),
          clips: s.clips.map((c) => ({
            id: c.id,
            kind: c.kind,
            label: c.label.slice(0, 24),
            start: Number(c.start.toFixed(2)),
            duration: Number(c.duration.toFixed(2)),
          })),
        });
      }
      default:
        return `ERROR: unknown op "${str("op") ?? ""}"`;
    }
  },
}));
