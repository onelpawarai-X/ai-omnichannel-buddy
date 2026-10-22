/**
 * Editor store.
 *
 * One zustand store holds everything the UI needs: the timeline document, the
 * media pool, playback, selection, the agent transcript and the export job.
 * Every mutation goes through `dispatch`, which runs ops from `engine/ops`, so
 * the UI and the agent share one implementation of every editing behaviour.
 */
import { create } from "zustand";

import { MediaPool, detectScenes, probeAudio, probeImage, probeVideo, grabFrames, guessKind } from "./engine/media-pool";
import { analyseAudio } from "./engine/analysis";
import { spectrogramOf } from "./engine/spectrogram";
import { destroyPlayer, loadAnimationFromUrl, loadSeedAnimations, createPlayer, type AnimationEntry } from "./engine/animations";
import type { AnimationItemLike } from "./engine/compositor";
import { exportTimeline, downloadBlob } from "./engine/export";
import { applyOp, applyOps, emptyState, type Op, type TimelineState } from "./engine/ops";
import { runAgent, type AgentAttachment, type AgentEvent } from "./engine/agent";
import { type AssetResult } from "./engine/assets";
import { DEFAULT_MODEL, type ChatMessage } from "./zyraxon";
import { type Clip, type MediaItem, type MediaKind, type Track, timelineEnd, uid } from "./engine/model";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant" | "tool" | "error" | "system";
  text: string;
  attachments?: Array<{ name: string; kind: string; url: string }>;
  toolName?: string;
  ok?: boolean;
  at: number;
};

export type ExportState = {
  running: boolean;
  progress: number;
  message: string;
};

export type PanelId = "media" | "effects" | "assets" | "animations" | "text" | "captions" | "inspector" | "export" | "youtube";

export type EditorState = {
  timeline: TimelineState;
  pool: MediaPool;
  animations: AnimationEntry[];
  players: Map<string, AnimationItemLike>;

  // playback
  playing: boolean;
  time: number;
  zoom: number;
  snapping: boolean;

  // selection + ui
  selectedClipId: string | undefined;
  selectedTrackId: string | undefined;
  panel: PanelId;
  showChat: boolean;
  toast: { id: string; text: string; kind: "info" | "error" | "success" } | undefined;

  // agent
  chat: ChatEntry[];
  history: ChatMessage[];
  agentBusy: boolean;
  agentModel: string;
  agentStep: string | undefined;
  attachments: AgentAttachment[];
  micRecording: boolean;
  micLevel: number;
  /** last finished dictation, consumed by the chat composer */
  dictation: string;

  // assets
  assetQuery: string;
  assetKind: string;
  assetResults: AssetResult[];
  assetLoading: boolean;

  // history
  past: TimelineState[];
  future: TimelineState[];

  exportState: ExportState;
};

export type EditorActions = {
  dispatch: (ops: Op[]) => { notes: string[]; createdClipId?: string; createdMediaId?: string };
  undo: () => void;
  redo: () => void;
  addFiles: (files: File[]) => Promise<MediaItem[]>;
  addUrl: (url: string, kind?: MediaKind, name?: string) => Promise<MediaItem>;
  removeMedia: (mediaId: string) => void;
  attach: (attachment: AgentAttachment) => void;
  clearAttachments: () => void;
  consumeDictation: () => string;
  send: (prompt: string) => Promise<void>;
  stopAgent: () => void;
  setPanel: (panel: PanelId) => void;
  toggleChat: () => void;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  select: (clipId?: string) => void;
  setAgentModel: (model: string) => void;
  setAssetQuery: (query: string) => void;
  setAssetKind: (kind: string) => void;
  runAssetSearch: (query?: string, kind?: string) => Promise<void>;
  loadAnimation: (url: string, name?: string) => Promise<string>;
  importAsset: (asset: AssetResult) => Promise<void>;
  importYouTube: (input: string, mode: "video" | "audio") => Promise<void>;
  startMic: () => Promise<void>;
  stopMic: () => void;
  startExport: (options?: { from?: number; to?: number; scale?: number }) => Promise<void>;
  notify: (text: string, kind?: "info" | "error" | "success") => void;
  dismissToast: () => void;
  reset: () => void;
};

const pool = new MediaPool();


/** Off-screen host for lottie players: they render to their own canvas, which the compositor copies. */
function detachedContainer(): HTMLElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-10000px";
  el.style.width = "512px";
  el.style.height = "512px";
  document.body.appendChild(el);
  return el;
}

let micStream: MediaStream | null = null;
let micChunks: BlobPart[] | null = null;
let micRecorder: MediaRecorder | null = null;
let agentAbort: AbortController | null = null;
let speakRecognition: { stop: () => void } | null = null;

/** Probe a source URL and register it in the pool. */
async function registerMedia(
  get: () => EditorState & EditorActions,
  input: { url: string; name: string; kind?: MediaKind; source?: MediaItem["source"]; thumb?: string; attribution?: string },
): Promise<MediaItem> {
  const kind = input.kind ?? guessKind("", input.url) ?? "video";
  const probe =
    kind === "video" ? await probeVideo(input.url) : kind === "audio" ? await probeAudio(input.url) : await probeImage(input.url);

  const item: MediaItem = {
    id: uid("media"),
    name: input.name || input.url.split("/").pop() || "media",
    kind,
    url: input.url,
    duration: probe.duration,
  };
  if (probe.width) item.width = probe.width;
  if (probe.height) item.height = probe.height;
  const thumb = input.thumb ?? probe.thumb;
  if (thumb) item.thumb = thumb;
  if (input.source) item.source = input.source;
  if (input.attribution) item.attribution = input.attribution;

  if (kind === "video") {
    const frames = await grabFrames(input.url, 6).catch(() => []);
    if (frames.length) item.frames = frames;
    const scenes = await detectScenes(input.url).catch(() => []);
    if (scenes.length) item.scenes = scenes;
  }
  if (kind === "audio") {
    const analysis = await analyseAudio(input.url).catch(() => null);
    if (analysis?.spectrogram) item.spectrogram = analysis.spectrogram;
    if (analysis) {
      item.waveform = analysis.waveform;
      item.beats = analysis.beats;
    }
  }

  const result = get().dispatch([{ op: "add_media", media: item }]);
  const created = result.createdMediaId ?? item.id;
  return { ...item, id: created };
}

/** Everything the store can do. */
export const useEditor = create<EditorState & EditorActions>((set, get) => ({
  timeline: emptyState(),
  pool,
  animations: [],
  players: new Map(),

  playing: false,
  time: 0,
  zoom: 60,
  snapping: true,

  panel: "media",
  showChat: true,
  selectedClipId: undefined,
  selectedTrackId: undefined,
  toast: undefined,

  chat: [],
  history: [],
  agentBusy: false,
  agentModel: DEFAULT_MODEL,
  agentStep: undefined,
  attachments: [],
  micRecording: false,
  micLevel: 0,
  dictation: "",

  assetQuery: "",
  assetKind: "all",
  assetResults: [],
  assetLoading: false,

  past: [],
  future: [],

  exportState: { running: false, progress: 0, message: "" },

  notify(text, kind = "info") {
    set({ toast: { id: uid("toast"), text, kind } });
  },

  dismissToast() {
    set({ toast: undefined });
  },

  dispatch(ops) {
    const state = get();
    const result = applyOps(state.timeline, ops);
    set({
      timeline: result.state,
      past: [...state.past.slice(-40), state.timeline],
      future: [],
    });
    const out: { notes: string[]; createdClipId?: string; createdMediaId?: string } = { notes: result.notes };
    if (result.createdClipId) out.createdClipId = result.createdClipId;
    if (result.createdMediaId) out.createdMediaId = result.createdMediaId;
    return out;
  },

  undo() {
    const { past, timeline, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ timeline: previous, past: past.slice(0, -1), future: [timeline, ...future].slice(0, 40) });
  },

  redo() {
    const { past, timeline, future } = get();
    const next = future[0];
    if (!next) return;
    set({ timeline: next, future: future.slice(1), past: [...past, timeline] });
  },

  setPanel(panel) {
    set({ panel });
  },

  toggleChat() {
    set({ showChat: !get().showChat });
  },

  setTime(time) {
    set({ time: Math.max(0, time) });
  },

  setPlaying(playing) {
    set({ playing });
  },

  setZoom(zoom) {
    set({ zoom: Math.min(400, Math.max(8, zoom)) });
  },

  select(clipId) {
    const state = get();
    const clip = clipId ? state.timeline.clips.find((c) => c.id === clipId) : undefined;
    set({ selectedClipId: clipId ?? undefined, selectedTrackId: clip?.trackId ?? state.selectedTrackId });
  },

  setAgentModel(model) {
    set({ agentModel: model });
  },

  setAssetQuery(query) {
    set({ assetQuery: query });
  },

  setAssetKind(kind) {
    set({ assetKind: kind });
  },


  async addFiles(files) {
    const created: MediaItem[] = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const kind = guessKind(file.type, file.name) ?? "image";
      const item = await registerMedia(get, { url, name: file.name, kind, source: "upload" });
      created.push(item);
    }
    if (created.length) get().notify(`${created.length} file(s) added to the pool`, "success");
    return created;
  },

  async addUrl(url, kind, name) {
    const item = await registerMedia(get, { url, name: name ?? url.split("/").pop() ?? "media", ...(kind ? { kind } : {}) });
    get().notify(`"${item.name}" added`, "success");
    return item;
  },

  removeMedia(mediaId) {
    const media = get().timeline.media.find((m) => m.id === mediaId);
    get().dispatch([{ op: "remove_media", mediaId }]);
    for (const clip of get().timeline.clips) {
      if (clip.mediaId === mediaId) get().players.delete(clip.id);
    }
    if (media) get().notify(`removed "${media.name}"`);
  },

  attach(attachment) {
    const existing = get().attachments;
    if (existing.length >= 8) {
      get().notify("up to 8 attachments per message", "error");
      return;
    }
    set({ attachments: [...existing, attachment] });
  },

  clearAttachments() {
    set({ attachments: [] });
  },

  stopAgent() {
    agentAbort?.abort();
    agentAbort = null;
    set({ agentBusy: false, agentStep: undefined });
  },

  async runAssetSearch(query, kind) {
    const q = (query ?? get().assetQuery).trim();
    const k = kind ?? get().assetKind;
    if (!q) {
      set({ assetResults: [] });
      return;
    }
    set({ assetLoading: true, assetQuery: q, assetKind: k });
    try {
      const response = await fetch(`/api/assets?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(k)}&limit=32`);
      const json = (await response.json()) as { results?: AssetResult[] };
      set({ assetResults: json.results ?? [], assetLoading: false });
    } catch {
      set({ assetLoading: false });
      get().notify("asset search failed", "error");
    }
  },

  async loadAnimation(url, name) {
    const entry = await loadAnimationFromUrl(url, { ...(name ? { name } : {}) });
    const player = createPlayer(entry, detachedContainer());
    const players = new Map(get().players);
    players.set(entry.id, player);
    set({ animations: [...get().animations, entry], players });
    get().notify(`অ্যানিমেশন "${entry.name}" লোড হয়েছে`, "success");
    return entry.id;
  },

  async importAsset(asset) {
    try {
      if (asset.kind === "youtube") {
        await get().importYouTube(asset.url, "video");
        return;
      }
      if (asset.kind === "icon") {
        const item = await registerMedia(get, { url: asset.url, name: asset.title, kind: "image", source: "library" });
        get().dispatch([
          { op: "add_clip", clip: { kind: "image", mediaId: item.id, label: item.name, duration: 4, blendMode: "screen" } },
        ]);
        get().notify(`"${item.name}" placed on the timeline`, "success");
        return;
      }
      const item = await registerMedia(get, {
        url: asset.url,
        name: asset.title,
        kind: asset.kind === "audio" ? "audio" : asset.kind === "video" ? "video" : "image",
        source: "library",
        ...(asset.thumb ? { thumb: asset.thumb } : {}),
        ...(asset.license ? { attribution: `${asset.source} · ${asset.license}` } : {}),
      });
      const clip = get().dispatch([{ op: "add_clip", clip: { kind: item.kind, mediaId: item.id, label: item.name, duration: item.duration } }]);
      if (clip.createdClipId) get().select(clip.createdClipId);
      get().notify(`"${item.name}" added to the timeline`, "success");
    } catch (error) {
      get().notify(error instanceof Error ? error.message : "import failed", "error");
    }
  },

  async importYouTube(input, mode) {
    const response = await fetch(`/api/youtube?url=${encodeURIComponent(input)}`);
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(detail.error ?? `youtube resolve failed (${response.status})`);
    }
    const info = (await response.json()) as {
      id: string;
      title: string;
      author: string;
      duration: number;
      thumb?: string;
      video?: { url: string; quality: string } | null;
      audio?: { url: string } | null;
    };
    if (mode === "audio") {
      const stream = info.audio ?? info.video;
      if (!stream) throw new Error("no audio stream available");
      const item = await registerMedia(get, {
        url: stream.url,
        name: `${info.title} (audio)`,
        kind: "audio",
        source: "youtube",
        ...(info.thumb ? { thumb: info.thumb } : {}),
        attribution: `YouTube · ${info.author}`,
      });
      const result = get().dispatch([{ op: "add_clip", clip: { kind: "audio", mediaId: item.id, label: item.name, duration: item.duration } }]);
      if (result.createdClipId) get().select(result.createdClipId);
      get().notify(`YouTube audio "${info.title}" added`, "success");
      return;
    }
    if (!info.video) throw new Error("no video stream available");
    const item = await registerMedia(get, {
      url: info.video.url,
      name: info.title,
      kind: "video",
      source: "youtube",
      ...(info.thumb ? { thumb: info.thumb } : {}),
      attribution: `YouTube · ${info.author}`,
    });
    const result = get().dispatch([
      { op: "add_clip", clip: { kind: "video", mediaId: item.id, label: item.name, duration: item.duration || 10 } },
    ]);
    if (result.createdClipId) get().select(result.createdClipId);
    get().notify(`YouTube video "${info.title}" added (${info.video.quality})`, "success");
  },

  async startMic() {
    if (get().micRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream = stream;
      const analyser = new AudioContext();
      const source = analyser.createMediaStreamSource(stream);
      const meter = analyser.createAnalyser();
      meter.fftSize = 512;
      source.connect(meter);
      const data = new Uint8Array(meter.frequencyBinCount);
      const tick = (): void => {
        if (!get().micRecording) return;
        meter.getByteFrequencyData(data);
        const level = data.reduce((sum, v) => sum + v, 0) / (data.length * 255);
        set({ micLevel: level });
        requestAnimationFrame(tick);
      };
      set({ micRecording: true, micLevel: 0 });
      requestAnimationFrame(tick);

      // Record the take as well as dictating it: when the mic stops, the audio
      // is attached to the next message as a spectrogram, so the agent can read
      // the voice note it could not otherwise hear.
      const chunks: BlobPart[] = [];
      micChunks = chunks;
      micRecorder = new MediaRecorder(stream);
      micRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      micRecorder.start(500);

      // live dictation into the prompt box, when the browser supports it
      const Recognition =
        (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
      if (Recognition) {
        const recogniser = new Recognition() as {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
          onerror: (() => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
        recogniser.lang = "bn-BD";
        recogniser.continuous = true;
        recogniser.interimResults = true;
        recogniser.onresult = (event) => {
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const entry = event.results[i];
            if (entry?.[0] && entry.isFinal) final += entry[0].transcript;
          }
          if (final) set({ dictation: final.trim() });
        };
        recogniser.onerror = () => undefined;
        recogniser.onend = () => undefined;
        recogniser.start();
        speakRecognition = recogniser;
      }
      get().notify("microphone on — speak, and it types into the prompt", "success");
    } catch {
      get().notify("microphone permission denied", "error");
    }
  },

  async stopMic() {
    speakRecognition?.stop();
    speakRecognition = null;
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    set({ micRecording: false, micLevel: 0 });

    const recorder = micRecorder;
    const chunks = micChunks;
    micRecorder = null;
    micChunks = null;
    if (!recorder || !chunks || chunks.length === 0) return;

    // MediaRecorder only flushes on stop, so wait for it before reading the take.
    await new Promise<void>((done) => {
      recorder.addEventListener("stop", () => done(), { once: true });
      recorder.addEventListener("error", () => done(), { once: true });
      if (recorder.state === "inactive") done();
      else recorder.stop();
    });
    if (chunks.length === 0) return;

    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    if (blob.size < 2048) return;
    const url = URL.createObjectURL(blob);
    const spectrogram = await spectrogramOf(url).catch(() => null);
    get().attach({ kind: "audio", name: `voice-note-${new Date().toISOString().slice(11, 19)}.webm`, url, ...(spectrogram ? { spectrogram } : {}) });
    get().notify("voice note attached — the agent can read its spectrogram", "success");
  },

  consumeDictation() {
    const text = get().dictation;
    if (text) set({ dictation: "" });
    return text;
  },

  async startExport(options) {
    const state = get();
    if (state.exportState.running) return;
    const clips = state.timeline.clips;
    if (clips.length === 0) {
      get().notify("nothing on the timeline to export", "error");
      return;
    }
    const from = options?.from ?? 0;
    const to = options?.to ?? timelineEnd(clips);
    set({ exportState: { running: true, progress: 0, message: "preparing" } });
    try {
      const result = await exportTimeline({
        project: state.timeline.project,
        tracks: state.timeline.tracks,
        clips,
        media: state.timeline.media,
        pool: state.pool,
        animations: state.players,
        from,
        to,
        ...(options?.scale ? { scale: options.scale } : {}),
        onProgress: (progress) =>
          set({ exportState: { running: true, progress, message: `rendering ${Math.round(progress * 100)}%` } }),
      });
      const name = `zyraxon-${Date.now()}.webm`;
      downloadBlob(result.blob, name);
      set({
        exportState: {
          running: false,
          progress: 1,
          message: `done — ${result.duration.toFixed(1)}s, ${(result.blob.size / 1048576).toFixed(1)} MB`,
        },
      });
      get().notify("export finished and downloaded", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "export failed";
      set({ exportState: { running: false, progress: 0, message } });
      get().notify(message, "error");
    }
  },

  reset() {
    for (const player of get().players.values()) destroyPlayer(player as never);
    set({
      timeline: emptyState(),
      players: new Map(),
      chat: [],
      history: [],
      past: [],
      future: [],
      time: 0,
      playing: false,
      selectedClipId: undefined,
      attachments: [],
      exportState: { running: false, progress: 0, message: "" },
    });
  },

  async send(prompt) {
    const state = get();
    if (state.agentBusy) return;
    const text = prompt.trim();
    if (!text && state.attachments.length === 0) return;

    const userEntry: ChatEntry = {
      id: uid("chat"),
      role: "user",
      text: text || "(attachment only)",
      attachments: state.attachments.map((a) => ({ name: a.name, kind: a.kind, url: a.url })),
      at: Date.now(),
    };
    set({ chat: [...state.chat, userEntry], agentBusy: true, agentStep: "thinking", attachments: [] });

    const controller = new AbortController();
    agentAbort = controller;

    const pushEntry = (entry: ChatEntry): void => set({ chat: [...get().chat, entry] });

    const ctx = {
      get state() {
        return get().timeline;
      },
      async dispatch(ops: Op[]) {
        const result = get().dispatch(ops);
        if (ops.length) {
          pushEntry({ id: uid("chat"), role: "system", text: result.notes.join("\n") || `${ops.length} op(s) applied`, at: Date.now() });
        }
        return result;
      },
      async render(args: { script: string; output?: string }) {
        const response = await fetch("/api/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        const json = (await response.json()) as { ok: boolean; url?: string; log?: string; error?: string };
        return json;
      },
      async searchAssets(query: string, kind?: string) {
        const response = await fetch(`/api/assets?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind ?? "all")}&limit=20`);
        const json = (await response.json()) as { results?: AssetResult[] };
        return json.results ?? [];
      },
      async resolveYouTube(input: string) {
        const response = await fetch(`/api/youtube?url=${encodeURIComponent(input)}`);
        if (!response.ok) throw new Error("youtube resolve failed");
        return response.json();
      },
      async importUrl(url: string, kind: MediaKind, name?: string) {
        const item = await get().addUrl(url, kind, name);
        return { mediaId: item.id, name: item.name, duration: item.duration };
      },
      async loadAnimation(url: string, name?: string) {
        const entry = await loadAnimationFromUrl(url, { ...(name ? { name } : {}) });
        const player = createPlayer(entry, detachedContainer());
        const players = new Map(get().players);
        players.set(entry.id, player);
        set({ animations: [...get().animations, entry], players });
        return entry.id;
      },
    };

    let pendingDelta = "";
    const flushDelta = (): void => {
      if (!pendingDelta) return;
      const delta = pendingDelta;
      pendingDelta = "";
      const chat = get().chat;
      const last = chat[chat.length - 1];
      if (last?.role === "assistant" && last.id.startsWith("stream")) {
        set({ chat: [...chat.slice(0, -1), { ...last, text: last.text + delta }] });
      } else {
        set({ chat: [...chat, { id: `stream-${uid("c")}`, role: "assistant", text: delta, at: Date.now() }] });
      }
    };

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case "round":
          set({ agentStep: `round ${event.index}/${event.max}` });
          break;
        case "assistant_delta":
          pendingDelta += event.text;
          flushDelta();
          break;
        case "assistant_text":
          set({ agentStep: undefined });
          break;
        case "tool":
          set({ agentStep: event.name });
          pushEntry({
            id: uid("chat"),
            role: "tool",
            toolName: event.name,
            ok: event.ok,
            text: event.ok ? `${event.name} ok` : `${event.name} failed: ${event.error ?? ""}`,
            at: Date.now(),
          });
          break;
        case "ops":
          pushEntry({ id: uid("chat"), role: "system", text: event.notes.join("\n"), at: Date.now() });
          break;
        case "error":
          pushEntry({ id: uid("chat"), role: "error", text: event.message, at: Date.now() });
          break;
        case "done":
          break;
      }
    };

    try {
      const result = await runAgent({
        prompt: text,
        attachments: state.attachments,
        history: state.history,
        state: get().timeline,
        ctx,
        model: state.agentModel,
        signal: controller.signal,
        onEvent,
      });
      set({
        history: [...state.history, ...result.messages].slice(-60),
        agentBusy: false,
        agentStep: undefined,
      });
      if (result.summary) {
        pushEntry({ id: uid("chat"), role: "assistant", text: result.summary, at: Date.now() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "agent failed";
      pushEntry({ id: uid("chat"), role: "error", text: message, at: Date.now() });
      set({ agentBusy: false, agentStep: undefined });
    } finally {
      agentAbort = null;
    }
  },
}));

/** Load the seed Lottie library once, in the background. */
export async function bootstrapAnimations(): Promise<void> {
  const entries = await loadSeedAnimations();
  if (entries.length === 0) return;
  const store = useEditor.getState();
  const players = new Map(store.players);
  for (const entry of entries) {
    if (!players.has(entry.id)) players.set(entry.id, createPlayer(entry, detachedContainer()));
  }
  useEditor.setState({ animations: [...store.animations, ...entries], players });
}

/** Convenience selectors. */
export const useTimeline = (): TimelineState => useEditor((s) => s.timeline);
export const useClip = (clipId?: string): Clip | undefined =>
  useEditor((s) => (clipId ? s.timeline.clips.find((c) => c.id === clipId) : undefined));
export const useTrack = (trackId?: string): Track | undefined =>
  useEditor((s) => (trackId ? s.timeline.tracks.find((t) => t.id === trackId) : undefined));
export const useAnimationList = (): AnimationEntry[] => useEditor((s) => s.animations);
