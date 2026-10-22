/**
 * Editor agent.
 *
 * The agent talks to the provider through one endpoint only - /chat/completions -
 * and drives the editor with two tool families:
 *
 *   1. editor tools, which mutate the timeline (they mirror `Op`);
 *   2. capability tools, which reach outside the browser: searching the asset
 *      libraries, resolving a YouTube video, rendering media on the server,
 *      and reading files.
 *
 * Anything the model sends back as a ```json fenced block is also accepted as
 * ops, so an older or chattier model still drives the editor correctly.
 */
import { EFFECTS } from "./effects";
import type { Op } from "./ops";
import { describeTimeline, type TimelineState } from "./ops";
import { SEED_ANIMATIONS } from "./animations";

export type ToolResult = { ok: boolean; data?: unknown; error?: string };

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** runs in the browser; may be async */
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult> | ToolResult;
};

export type AgentContext = {
  state: TimelineState;
  /** apply ops to the live timeline */
  dispatch: (ops: Op[]) => Promise<{ notes: string[]; createdClipId?: string; createdMediaId?: string }>;
  /** server-side media rendering */
  render: (args: { script: string; output?: string }) => Promise<{ ok: boolean; url?: string; log?: string; error?: string }>;
  /** asset search */
  searchAssets: (query: string, kind?: string) => Promise<unknown[]>;
  /** resolve a YouTube URL into a playable stream */
  resolveYouTube: (input: string) => Promise<unknown>;
  /** import a URL into the media pool */
  importUrl: (url: string, kind: "video" | "audio" | "image", name?: string) => Promise<{ mediaId: string; name: string; duration: number }>;
  /** fetch a Lottie JSON and register it, returning the animation id */
  loadAnimation: (url: string, name?: string) => Promise<string>;
};

const str = (args: Record<string, unknown>, key: string, fallback = ""): string => {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
};

const numOr = (args: Record<string, unknown>, key: string, fallback: number): number => {
  const value = args[key];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const strArray = (args: Record<string, unknown>, key: string): string[] => {
  const value = args[key];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === "string" ? [v] : []));
  return typeof value === "string" && value ? [value] : [];
};

/** Resolve a clip the model referred to: by id, by 1-based index, or by label. */
function resolveClip(state: TimelineState, args: Record<string, unknown>): string | undefined {
  const id = str(args, "clipId");
  if (id && state.clips.some((c) => c.id === id)) return id;
  if (id) {
    const match = state.clips.find((c) => c.id.startsWith(id) || c.label.toLowerCase() === id.toLowerCase());
    if (match) return match.id;
  }
  const label = str(args, "clip") || str(args, "label");
  if (label) {
    const exact = state.clips.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (exact) return exact.id;
    const partial = state.clips.find((c) => c.label.toLowerCase().includes(label.toLowerCase()));
    if (partial) return partial.id;
  }
  const index = args["clipIndex"] ?? args["index"];
  const n = typeof index === "number" ? index : Number(index);
  if (Number.isFinite(n) && n > 0) {
    const sorted = [...state.clips].sort((a, b) => a.start - b.start);
    return sorted[n - 1]?.id;
  }
  return undefined;
}

/** Resolve a media item by id, name or 1-based index. */
function resolveMedia(state: TimelineState, args: Record<string, unknown>): string | undefined {
  const id = str(args, "mediaId");
  if (id && state.media.some((m) => m.id === id)) return id;
  if (id) {
    const match = state.media.find((m) => m.id.startsWith(id) || m.name.toLowerCase() === id.toLowerCase());
    if (match) return match.id;
  }
  const name = str(args, "media") || str(args, "name");
  if (name) {
    const exact = state.media.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    const partial = state.media.find((m) => m.name.toLowerCase().includes(name.toLowerCase()));
    if (partial) return partial.id;
  }
  const index = args["mediaIndex"];
  const n = typeof index === "number" ? index : Number(index);
  if (Number.isFinite(n) && n > 0) return [...state.media][n - 1]?.id;
  return undefined;
}

function resolveTrack(state: TimelineState, args: Record<string, unknown>): string | undefined {
  const id = str(args, "trackId");
  if (id && state.tracks.some((t) => t.id === id)) return id;
  const name = str(args, "track");
  if (name) {
    const match = state.tracks.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
  }
  const index = args["trackIndex"];
  const n = typeof index === "number" ? index : Number(index);
  if (Number.isFinite(n) && n > 0) return state.tracks[n - 1]?.id;
  return undefined;
}

const clipRef = {
  clipId: { type: "string", description: "Clip id (preferred)" },
  clip: { type: "string", description: "Clip label, or part of it, if the id is unknown" },
  clipIndex: { type: "number", description: "1-based position of the clip in the timeline" },
};

const timeParams = {
  start: { type: "number", description: "Start time in seconds on the timeline" },
  duration: { type: "number", description: "Length in seconds" },
};

export const TOOLS: AgentTool[] = [
  {
    name: "list_timeline",
    description: "Read the current project: media pool, tracks and clips with their ids, times, effects and keyframes.",
    parameters: { type: "object", properties: {} },
    run: (_args, ctx) => ({ ok: true, data: { text: describeTimeline(ctx.state), clips: ctx.state.clips.length } }),
  },
  {
    name: "import_media",
    description:
      "Add media to the pool from a URL (direct mp4/mp3/wav/png URL, a YouTube watch URL, or an asset search result url). Returns the mediaId to place on the timeline.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Direct media URL or a YouTube watch URL" },
        kind: { type: "string", enum: ["video", "audio", "image"], description: "Media kind; omit to detect from the URL" },
        name: { type: "string", description: "Display name" },
      },
      required: ["url"],
    },
    async run(args, ctx) {
      const url = str(args, "url");
      if (!url) return { ok: false, error: "url is required" };
      const kindArg = str(args, "kind");
      const kind = kindArg === "audio" || kindArg === "image" || kindArg === "video" ? kindArg : undefined;
      try {
        const imported = await ctx.importUrl(url, kind ?? "video", str(args, "name") || undefined);
        return { ok: true, data: imported };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
  {
    name: "add_clip",
    description: "Place a media item, text layer, shape or animation on the timeline.",
    parameters: {
      type: "object",
      properties: {
        mediaId: { type: "string", description: "Media id from import_media or list_timeline" },
        media: { type: "string", description: "Media name if the id is unknown" },
        kind: { type: "string", enum: ["video", "audio", "image", "text", "shape", "effect"] },
        text: { type: "string", description: "Text content when kind is text" },
        trackId: { type: "string" },
        track: { type: "string", description: "Track name such as V1 or A1" },
        ...timeParams,
        in: { type: "number", description: "Offset inside the source media, seconds" },
        volume: { type: "number" },
        speed: { type: "number" },
      },
    },
    async run(args, ctx) {
      const kindArg = str(args, "kind") || "video";
      const kind = (["video", "audio", "image", "text", "shape", "effect"] as const).includes(kindArg as never)
        ? (kindArg as "video" | "audio" | "image" | "text" | "shape" | "effect")
        : "video";
      const mediaId = resolveMedia(ctx.state, args);
      const trackId = resolveTrack(ctx.state, args);
      const clip: Record<string, unknown> = { kind };
      if (mediaId) clip["mediaId"] = mediaId;
      if (trackId) clip["trackId"] = trackId;
      if (args["start"] !== undefined) clip["start"] = numOr(args, "start", 0);
      if (args["duration"] !== undefined) clip["duration"] = numOr(args, "duration", 5);
      if (args["in"] !== undefined) clip["in"] = numOr(args, "in", 0);
      if (args["volume"] !== undefined) clip["volume"] = numOr(args, "volume", 1);
      if (args["speed"] !== undefined) clip["speed"] = numOr(args, "speed", 1);
      const text = str(args, "text");
      if (kind === "text") clip["text"] = { content: text || "Text" };
      if (kind !== "text" && !mediaId && kind !== "shape" && kind !== "effect") {
        return { ok: false, error: "no media matched; call import_media first or pass a valid mediaId" };
      }
      const result = await ctx.dispatch([{ op: "add_clip", clip } as Op]);
      return { ok: true, data: { notes: result.notes, createdClipId: result.createdClipId } };
    },
  },
  {
    name: "update_clip",
    description:
      "Change a clip: timing, speed, volume, transform (x, y, scale, rotation, opacity), flips, blend mode, chroma key, mute or lock. Also used to set filter/grade values.",
    parameters: {
      type: "object",
      properties: {
        ...clipRef,
        start: { type: "number" },
        duration: { type: "number" },
        in: { type: "number" },
        speed: { type: "number" },
        volume: { type: "number" },
        x: { type: "number", description: "0..1 horizontal centre" },
        y: { type: "number", description: "0..1 vertical centre" },
        scale: { type: "number" },
        rotation: { type: "number", description: "Degrees" },
        opacity: { type: "number", description: "0..1" },
        flipH: { type: "boolean" },
        flipV: { type: "boolean" },
        blendMode: { type: "string", description: "source-over, screen, multiply, overlay, lighten, darken, color-dodge, hard-light, soft-light, difference" },
        muted: { type: "boolean" },
        locked: { type: "boolean" },
        fadeIn: { type: "number" },
        fadeOut: { type: "number" },
        trackId: { type: "string", description: "Move the clip to this track" },
        chroma: {
          type: "object",
          description: "Green-screen key",
          properties: {
            enabled: { type: "boolean" },
            color: { type: "string" },
            similarity: { type: "number" },
            smoothness: { type: "number" },
          },
        },
        filter: {
          type: "object",
          description: "Grade values: brightness/contrast/saturate as percentages, blur px, grayscale/sepia/invert as percentages, hue degrees",
          properties: {
            brightness: { type: "number" },
            contrast: { type: "number" },
            saturate: { type: "number" },
            blur: { type: "number" },
            grayscale: { type: "number" },
            sepia: { type: "number" },
            hue: { type: "number" },
            invert: { type: "number" },
          },
        },
      },
    },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const ops: Op[] = [];
      const patch: Record<string, unknown> = {};
      for (const key of ["start", "duration", "in", "speed", "volume", "x", "y", "scale", "rotation", "opacity", "flipH", "flipV", "blendMode", "muted", "locked", "fadeIn", "fadeOut"]) {
        if (args[key] !== undefined) patch[key] = args[key];
      }
      const trackId = resolveTrack(ctx.state, args);
      if (trackId) patch["trackId"] = trackId;
      const chroma = args["chroma"];
      if (chroma && typeof chroma === "object") patch["chroma"] = { enabled: true, color: "#00ff00", similarity: 0.35, smoothness: 0.15, ...(chroma as object) };
      if (Object.keys(patch).length) ops.push({ op: "set_clip", clipId, patch } as Op);
      const filter = args["filter"];
      if (filter && typeof filter === "object") ops.push({ op: "set_filter", clipId, filter: filter as never });
      if (ops.length === 0) return { ok: false, error: "nothing to update" };
      const result = await ctx.dispatch(ops);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "split_clip",
    description: "Cut a clip at a time on the timeline, producing two clips.",
    parameters: { type: "object", properties: { ...clipRef, time: { type: "number", description: "Timeline time in seconds" } }, required: ["time"] },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const result = await ctx.dispatch([{ op: "split_clip", clipId, time: numOr(args, "time", 0) }]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "remove_clip",
    description: "Delete a clip from the timeline.",
    parameters: { type: "object", properties: { ...clipRef } },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const result = await ctx.dispatch([{ op: "remove_clip", clipId }]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "apply_effect",
    description:
      "Apply one of the built-in effects to a clip, with optional parameter values. Effects stack in the order applied.",
    parameters: {
      type: "object",
      properties: {
        ...clipRef,
        effect: { type: "string", description: "Effect id, for example glitch, vhs, old-film, neon, confetti, film-grain, kaleidoscope, wave, zoom-pulse, letterbox" },
        values: { type: "object", description: "Parameter overrides, for example { amount: 0.6 }" },
      },
      required: ["effect"],
    },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const effect = str(args, "effect");
      if (!effect) return { ok: false, error: "effect is required" };
      const values = args["values"] && typeof args["values"] === "object" ? (args["values"] as Record<string, number | string | boolean>) : {};
      const result = await ctx.dispatch([{ op: "add_effect", clipId, effectId: effect, values }]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "remove_effect",
    description: "Remove an effect from a clip.",
    parameters: { type: "object", properties: { ...clipRef, effect: { type: "string" } }, required: ["effect"] },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const result = await ctx.dispatch([{ op: "remove_effect", clipId, effectId: str(args, "effect") }]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "list_effects",
    description: "List every available effect id with its category and default parameters.",
    parameters: { type: "object", properties: { category: { type: "string" } } },
    run(args) {
      const category = str(args, "category");
      const list = category ? EFFECTS.filter((e) => e.category === category) : EFFECTS;
      return {
        ok: true,
        data: list.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          description: e.description,
          params: Object.fromEntries(e.params.map((p) => [p.key, p.def])),
        })),
      };
    },
  },
  {
    name: "animate_clip",
    description:
      "Add keyframes so a clip moves, scales, rotates or fades over time. Times are relative to the clip start. A simple zoom-in is [{t:0,scale:1},{t:2,scale:1.25}].",
    parameters: {
      type: "object",
      properties: {
        ...clipRef,
        keyframes: {
          type: "array",
          description: "Keyframes in order",
          items: {
            type: "object",
            properties: {
              t: { type: "number", description: "Seconds from the clip start" },
              x: { type: "number" },
              y: { type: "number" },
              scale: { type: "number" },
              rotation: { type: "number" },
              opacity: { type: "number" },
            },
            required: ["t"],
          },
        },
        clear: { type: "boolean", description: "Remove existing keyframes first" },
      },
      required: ["keyframes"],
    },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const raw = args["keyframes"];
      if (!Array.isArray(raw)) return { ok: false, error: "keyframes must be an array" };
      const keyframes = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const frame = entry as Record<string, unknown>;
        const t = typeof frame["t"] === "number" ? frame["t"] : Number(frame["t"]);
        if (!Number.isFinite(t)) return [];
        const out: Record<string, number> = { t };
        for (const key of ["x", "y", "scale", "rotation", "opacity"]) {
          const value = frame[key];
          if (typeof value === "number") out[key] = value;
        }
        return [out];
      });
      if (keyframes.length === 0) return { ok: false, error: "no valid keyframes" };
      const ops: Op[] = [];
      if (args["clear"] === true) ops.push({ op: "clear_keyframes", clipId });
      ops.push({ op: "add_keyframes", clipId, keyframes } as Op);
      const result = await ctx.dispatch(ops);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "set_transition",
    description: "Add an entrance transition to a clip: none, fade, dissolve, slide, wipe, zoom, spin or glitch.",
    parameters: {
      type: "object",
      properties: {
        ...clipRef,
        kind: { type: "string", enum: ["none", "fade", "dissolve", "slide", "wipe", "zoom", "spin", "glitch"] },
        duration: { type: "number", description: "Seconds, typically 0.3 to 1.5" },
        direction: { type: "string", enum: ["left", "right", "up", "down"], description: "For slide and wipe" },
      },
      required: ["kind"],
    },
    async run(args, ctx) {
      const clipId = resolveClip(ctx.state, args);
      if (!clipId) return { ok: false, error: "clip not found" };
      const kind = str(args, "kind", "fade") as "none" | "fade" | "dissolve" | "slide" | "wipe" | "zoom" | "spin" | "glitch";
      const op: Record<string, unknown> = { op: "set_transition", clipId, kind };
      if (args["duration"] !== undefined) op["duration"] = numOr(args, "duration", 0.6);
      const direction = str(args, "direction");
      if (direction) op["direction"] = direction;
      const result = await ctx.dispatch([op as Op]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "add_text",
    description:
      "Add a text overlay (title, caption, lower third) with font size, colour, position, animation and optional background box.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Text to show; \\n starts a new line" },
        start: { type: "number" },
        duration: { type: "number" },
        x: { type: "number", description: "0..1" },
        y: { type: "number", description: "0..1, 0.85 is lower third" },
        size: { type: "number", description: "Font size in project pixels" },
        color: { type: "string" },
        weight: { type: "number" },
        align: { type: "string", enum: ["left", "center", "right"] },
        background: { type: "string", description: "CSS colour for a box behind the text" },
        stroke: { type: "boolean" },
        strokeColor: { type: "string" },
        animation: { type: "string", enum: ["none", "typewriter", "fade-in", "pop", "slide-up", "slide-left", "karaoke", "bounce", "shake"] },
        trackId: { type: "string" },
      },
      required: ["content"],
    },
    async run(args, ctx) {
      const content = str(args, "content", "Text");
      const text: Record<string, unknown> = { content };
      for (const key of ["x", "y", "size", "color", "weight", "align", "background", "stroke", "strokeColor", "animation"]) {
        if (args[key] !== undefined) text[key] = args[key];
      }
      const clip: Record<string, unknown> = { kind: "text", text };
      if (args["start"] !== undefined) clip["start"] = numOr(args, "start", 0);
      if (args["duration"] !== undefined) clip["duration"] = numOr(args, "duration", 3);
      const trackId = resolveTrack(ctx.state, args);
      if (trackId) clip["trackId"] = trackId;
      const result = await ctx.dispatch([{ op: "add_clip", clip } as Op]);
      return { ok: true, data: { notes: result.notes, createdClipId: result.createdClipId } };
    },
  },
  {
    name: "set_captions",
    description:
      "Lay a list of timed captions onto a text track, one clip per line. Use this whenever the user supplies a transcript or wants subtitles.",
    parameters: {
      type: "object",
      properties: {
        captions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: { type: "number", description: "Timeline seconds" },
              end: { type: "number" },
              text: { type: "string" },
            },
            required: ["start", "end", "text"],
          },
        },
        y: { type: "number", description: "Vertical position, 0.86 default" },
        size: { type: "number" },
        color: { type: "string" },
        background: { type: "string" },
      },
      required: ["captions"],
    },
    async run(args, ctx) {
      const raw = args["captions"];
      if (!Array.isArray(raw)) return { ok: false, error: "captions must be an array" };
      const captions = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        const start = typeof item["start"] === "number" ? item["start"] : Number(item["start"]);
        const end = typeof item["end"] === "number" ? item["end"] : Number(item["end"]);
        const text = typeof item["text"] === "string" ? item["text"] : "";
        if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return [];
        return [{ start, end, text }];
      });
      if (captions.length === 0) return { ok: false, error: "no valid captions" };
      const style: Record<string, unknown> = {};
      for (const key of ["y", "size", "color", "background"]) if (args[key] !== undefined) style[key] = args[key];
      const result = await ctx.dispatch([{ op: "captions", captions, style } as Op]);
      return { ok: true, data: { notes: result.notes, createdClipId: result.createdClipId } };
    },
  },
  {
    name: "arrange_clips",
    description: "Lay clips out automatically: sequence (end to end, per track), stack (all at 0s) or ripple (one after another).",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["sequence", "stack", "ripple"] },
        trackId: { type: "string" },
      },
      required: ["mode"],
    },
    async run(args, ctx) {
      const mode = str(args, "mode", "sequence") as "sequence" | "stack" | "ripple";
      const trackId = resolveTrack(ctx.state, args);
      const result = await ctx.dispatch([{ op: "arrange", mode, ...(trackId ? { trackId } : {}) } as Op]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "manage_track",
    description: "Add a track, or change a track's name, volume, mute, hide or lock state. Use action remove to delete a track.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "update", "remove"] },
        trackId: { type: "string" },
        track: { type: "string" },
        kind: { type: "string", enum: ["video", "audio", "text", "effect"] },
        name: { type: "string" },
        volume: { type: "number" },
        muted: { type: "boolean" },
        hidden: { type: "boolean" },
        locked: { type: "boolean" },
      },
      required: ["action"],
    },
    async run(args, ctx) {
      const action = str(args, "action", "add");
      if (action === "add") {
        const kind = str(args, "kind", "video") as "video" | "audio" | "text" | "effect";
        const result = await ctx.dispatch([{ op: "add_track", kind, ...(str(args, "name") ? { name: str(args, "name") } : {}) }]);
        return { ok: true, data: { notes: result.notes } };
      }
      const trackId = resolveTrack(ctx.state, args);
      if (!trackId) return { ok: false, error: "track not found" };
      if (action === "remove") {
        const result = await ctx.dispatch([{ op: "remove_track", trackId }]);
        return { ok: true, data: { notes: result.notes } };
      }
      const patch: Record<string, unknown> = {};
      for (const key of ["name", "volume", "muted", "hidden", "locked"]) if (args[key] !== undefined) patch[key] = args[key];
      const result = await ctx.dispatch([{ op: "set_track", trackId, patch } as Op]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "set_project",
    description: "Set project resolution, frame rate or background colour.",
    parameters: {
      type: "object",
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        fps: { type: "number" },
        background: { type: "string" },
        name: { type: "string" },
      },
    },
    async run(args, ctx) {
      const patch: Record<string, unknown> = {};
      for (const key of ["width", "height", "fps", "background", "name"]) if (args[key] !== undefined) patch[key] = args[key];
      if (Object.keys(patch).length === 0) return { ok: false, error: "nothing to set" };
      const result = await ctx.dispatch([{ op: "set_project", patch } as Op]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "search_assets",
    description:
      "Search the open media libraries for stock video, images, music, sound effects, icons, or YouTube videos. Results include a direct url you can pass to import_media.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, for example 'explosion', 'rain on window', 'lofi beat'" },
        kind: { type: "string", enum: ["video", "audio", "image", "icon", "youtube", "all"], description: "all searches every source" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    async run(args, ctx) {
      const query = str(args, "query");
      if (!query) return { ok: false, error: "query is required" };
      const results = await ctx.searchAssets(query, str(args, "kind", "all"));
      const limit = Math.max(1, Math.min(40, numOr(args, "limit", 20)));
      return { ok: true, data: results.slice(0, limit) };
    },
  },
  {
    name: "youtube",
    description:
      "Resolve a YouTube video (URL or 11-character id) into a direct, playable stream plus metadata. Feed the returned url straight into import_media.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "YouTube watch URL, youtu.be link, shorts link, or bare video id" },
        quality: { type: "string", enum: ["best", "audio"], description: "best gives picture+sound, audio gives a soundtrack only" },
      },
      required: ["url"],
    },
    async run(args, ctx) {
      const input = str(args, "url");
      if (!input) return { ok: false, error: "url is required" };
      try {
        const resolved = await ctx.resolveYouTube(input);
        return { ok: true, data: resolved };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
  {
    name: "run_media_command",
    description:
      "Run a shell command on the media worker to make or inspect media. ffmpeg, ffprobe, ImageMagick (convert), and python3 are installed. Use it to generate test clips, transcode, extract audio, make a waveform, or probe a file. Anything you create in the working directory comes back as a playable url.",
    parameters: {
      type: "object",
      properties: {
        script: { type: "string", description: "Shell script. Example: ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30:duration=5 out.mp4" },
        output: { type: "string", description: "Filename to return as a playable url, for example out.mp4" },
      },
      required: ["script"],
    },
    async run(args, ctx) {
      const script = str(args, "script");
      if (!script) return { ok: false, error: "script is required" };
      const result = await ctx.render({ script, output: str(args, "output") });
      if (!result.ok) return { ok: false, error: result.error ?? "command failed", data: { log: result.log } };
      return { ok: true, data: { url: result.url, log: (result.log ?? "").slice(-1500) } };
    },
  },
  {
    name: "list_animations",
    description: "List the Lottie animations already in the library, with their ids and durations. Add one with add_animation.",
    parameters: { type: "object", properties: { query: { type: "string" } } },
    run(args, ctx) {
      const query = str(args, "query").toLowerCase();
      const registered = ctx.state.media.filter((m) => m.kind === "video" && m.source === "library");
      return {
        ok: true,
        data: {
          loaded: registered.map((m) => ({ id: m.id, name: m.name })),
          seedLibrary: SEED_ANIMATIONS.map((a) => ({ name: a.name, tags: a.tags, url: a.url })),
          query,
        },
      };
    },
  },
  {
    name: "add_animation",
    description:
      "Place a Lottie animation as an overlay on top of the video. Pass animationId for a loaded animation, or url to fetch a Lottie JSON directly (for example from lottiefiles). The overlay is composited above the picture and never moves the clip underneath.",
    parameters: {
      type: "object",
      properties: {
        animationId: { type: "string" },
        url: { type: "string", description: "Lottie JSON URL" },
        name: { type: "string" },
        start: { type: "number" },
        duration: { type: "number" },
        scale: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    async run(args, ctx) {
      const animationId = str(args, "animationId");
      const url = str(args, "url");
      if (!animationId && !url) return { ok: false, error: "pass animationId or url" };
      let id = animationId;
      if (!id && url) {
        try {
          id = await ctx.loadAnimation(url, str(args, "name") || undefined);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
      const op: Record<string, unknown> = { op: "add_animation", animationId: id };
      for (const key of ["start", "duration", "scale", "x", "y"]) if (args[key] !== undefined) op[key] = args[key];
      const result = await ctx.dispatch([op as Op]);
      return { ok: true, data: { notes: result.notes, createdClipId: result.createdClipId } };
    },
  },
  {
    name: "beat_cut",
    description:
      "Cut clips on the beats of a music track. Pass the beat source as mediaId (the track that has beats=N in list_timeline) and the picture to cut as targetMediaId or clipId; if you omit the target, video clips are cut. Use this for beat-synced edits instead of splitting by hand.",
    parameters: {
      type: "object",
      properties: {
        mediaId: { type: "string", description: "the beat source, e.g. the music track" },
        media: { type: "string", description: "the beat source by name" },
        targetMediaId: { type: "string", description: "media whose clips should be cut, e.g. the video" },
        clipId: { type: "string", description: "cut only this clip" },
      },
      required: [],
    },
    async run(args, ctx) {
      const mediaId = resolveMedia(ctx.state, args);
      if (!mediaId) return { ok: false, error: "media not found" };
      const targetArg = typeof args["targetMediaId"] === "string" ? (args["targetMediaId"] as string) : "";
      const clipArg = typeof args["clipId"] === "string" ? (args["clipId"] as string) : "";
      const targetMediaId = targetArg ? resolveMedia(ctx.state, { media: targetArg }) : undefined;
      const clipId = clipArg || undefined;
      const result = await ctx.dispatch([{ op: "beat_cut", mediaId, ...(targetMediaId ? { targetMediaId } : {}), ...(clipId ? { clipId } : {}) }]);
      return { ok: true, data: { notes: result.notes } };
    },
  },
  {
    name: "finish",
    description:
      "Call once the requested edit is complete. Summarise what you changed in one short paragraph. The user reads this, so keep it plain.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "What you did, in the user's language" },
      },
      required: ["summary"],
    },
    run(args) {
      return { ok: true, data: { summary: str(args, "summary", "done") } };
    },
  },
];

export const TOOL_BY_NAME: Map<string, AgentTool> = new Map(TOOLS.map((t) => [t.name, t]));
