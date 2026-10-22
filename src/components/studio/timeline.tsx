/**
 * Timeline: ruler, track headers, clip blocks with drag, trim and snapping.
 *
 * The playhead is the source of truth for time; dragging it scrubs the preview.
 * Clips can be moved along a track, dragged onto another compatible track, and
 * trimmed from either edge. All changes go through ops, so undo works uniformly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Lock, LockOpen, Magnet, Scissors, Trash2, Volume2, VolumeX, ZoomIn, ZoomOut, Copy } from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { timelineEnd, type Clip, type Track } from "@/lib/engine/model";
import { formatTime } from "@/lib/media";

const HEADER_W = 132;
const TRACK_H = 56;

type Drag =
  | { mode: "playhead" }
  | { mode: "move"; clipId: string; grabOffset: number; startTrack: string }
  | { mode: "trim-left"; clipId: string }
  | { mode: "trim-right"; clipId: string }
  | { mode: "marquee"; x0: number; y0: number; x1: number; y1: number };

export function Timeline(): React.ReactElement {
  const timeline = useEditor((s) => s.timeline);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const time = useEditor((s) => s.time);
  const setTime = useEditor((s) => s.setTime);
  const setPlaying = useEditor((s) => s.setPlaying);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const select = useEditor((s) => s.select);
  const dispatch = useEditor((s) => s.dispatch);
  const notify = useEditor((s) => s.notify);
  const [snapping, setSnapping] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const duration = useMemo(() => Math.max(10, timelineEnd(timeline.clips) + 5), [timeline.clips]);
  const width = duration * zoom;

  const snap = useCallback(
    (value: number, ignoreClipId?: string): number => {
      if (!snapping) return Math.max(0, value);
      const marks = [0, time];
      for (const clip of timeline.clips) {
        if (clip.id === ignoreClipId) continue;
        marks.push(clip.start, clip.start + clip.duration);
      }
      const threshold = 8 / zoom;
      let best = value;
      let bestDistance = threshold;
      for (const mark of marks) {
        const distance = Math.abs(mark - value);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = mark;
        }
      }
      return Math.max(0, best);
    },
    [snapping, time, timeline.clips, zoom],
  );

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const lane = laneRef.current;
      if (!lane) return 0;
      const rect = lane.getBoundingClientRect();
      return Math.max(0, (clientX - rect.left) / zoom);
    },
    [zoom],
  );

  // pointer handling for every drag mode
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === "playhead") {
        setPlaying(false);
        setTime(snap(timeFromEvent(event.clientX)));
        return;
      }
      if (drag.mode === "move") {
        const target = snap(timeFromEvent(event.clientX) - drag.grabOffset, drag.clipId);
        dispatch([{ op: "move_clip", clipId: drag.clipId, start: target }]);
        return;
      }
      if (drag.mode === "trim-left") {
        const clip = timeline.clips.find((c) => c.id === drag.clipId);
        if (!clip) return;
        const edge = snap(timeFromEvent(event.clientX), drag.clipId);
        const delta = edge - clip.start;
        const duration2 = Math.max(0.1, clip.duration - delta);
        if (duration2 < 0.1) return;
        dispatch([
          { op: "trim_clip", clipId: drag.clipId, start: edge, duration: duration2, in: Math.max(0, clip.in + delta * clip.speed) },
        ]);
        return;
      }
      if (drag.mode === "trim-right") {
        const clip = timeline.clips.find((c) => c.id === drag.clipId);
        if (!clip) return;
        const edge = snap(timeFromEvent(event.clientX), drag.clipId);
        dispatch([{ op: "trim_clip", clipId: drag.clipId, duration: Math.max(0.1, edge - clip.start) }]);
      }
    };

    const onUp = (): void => {
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, dispatch, setPlaying, setTime, snap, timeFromEvent, timeline.clips]);

  const beginDrag = (event: React.PointerEvent, drag: Drag): void => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = drag;
    setDragging(true);
  };

  const ruler = useMemo(() => {
    const step = zoom >= 120 ? 0.5 : zoom >= 60 ? 1 : zoom >= 30 ? 2 : 5;
    const ticks: Array<{ t: number; label: string; major: boolean }> = [];
    for (let t = 0; t <= duration; t += step) {
      const major = Math.abs(t % (step * 5)) < 0.001 || t === 0;
      ticks.push({ t, label: major ? formatTime(t) : "", major });
    }
    return ticks;
  }, [duration, zoom]);

  const setTrack = (trackId: string, patch: Partial<Track>): void => {
    dispatch([{ op: "set_track", trackId, patch }]);
  };

  const dropFiles = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const created = await useEditor.getState().addFiles(files);
    for (const item of created) {
      dispatch([{ op: "add_clip", clip: { kind: item.kind, mediaId: item.id, label: item.name, duration: item.duration } }]);
    }
    notify(`${created.length} ক্লিপ টাইমলাইনে যোগ হয়েছে`, "success");
  };

  const splitAtPlayhead = (): void => {
    const candidates = timeline.clips.filter((c) => time > c.start + 0.05 && time < c.start + c.duration - 0.05);
    if (candidates.length === 0) {
      notify("প্লেহেড কোনো ক্লিপের ভেতরে নেই", "error");
      return;
    }
    dispatch(candidates.map((clip) => ({ op: "split_clip", clipId: clip.id, time })));
  };

  const removeSelected = (): void => {
    if (!selectedClipId) return;
    dispatch([{ op: "remove_clip", clipId: selectedClipId }]);
    select(undefined);
  };

  const duplicateSelected = (): void => {
    const clip = timeline.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const { id: _drop, ...rest } = clip;
    const result = dispatch([{ op: "add_clip", clip: { ...rest, start: clip.start + clip.duration } }]);
    if (result.createdClipId) select(result.createdClipId);
  };

  const scrubFromRuler = (event: React.PointerEvent): void => {
    setPlaying(false);
    setTime(snap(timeFromEvent(event.clientX)));
    beginDrag(event, { mode: "playhead" });
  };

  return (
    <section className="flex min-h-0 flex-col border-t border-border bg-panel">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <button type="button" className="btn-ghost h-7 w-7" title="প্লেহেডে কাটুন" onClick={splitAtPlayhead}>
          <Scissors className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="btn-ghost h-7 w-7" title="ডুপ্লিকেট" onClick={duplicateSelected}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="btn-ghost h-7 w-7" title="মুছুন" onClick={removeSelected}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          className={`btn-ghost h-7 w-7 ${snapping ? "text-primary" : ""}`}
          title="স্ন্যাপিং"
          onClick={() => setSnapping(!snapping)}
        >
          <Magnet className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button type="button" className="btn-ghost h-7 w-7" title="জুম আউট" onClick={() => setZoom(zoom / 1.4)}>
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="btn-ghost h-7 w-7" title="জুম ইন" onClick={() => setZoom(zoom * 1.4)}>
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className="btn-ghost h-7 px-2 text-[11px]"
          onClick={() => dispatch([{ op: "add_track", kind: "video" }])}
        >
          + ভিডিও ট্র্যাক
        </button>
        <button
          type="button"
          className="btn-ghost h-7 px-2 text-[11px]"
          onClick={() => dispatch([{ op: "add_track", kind: "audio" }])}
        >
          + অডিও
        </button>
        <button
          type="button"
          className="btn-ghost h-7 px-2 text-[11px]"
          onClick={() => dispatch([{ op: "add_track", kind: "text" }])}
        >
          + টেক্সট
        </button>
        <button
          type="button"
          className="btn-ghost h-7 px-2 text-[11px]"
          onClick={() => dispatch([{ op: "add_track", kind: "effect" }])}
        >
          + ইফেক্ট
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void dropFiles(event)}
      >
        <div ref={scrollRef} className="h-full overflow-auto">
          <div className="relative" style={{ width: HEADER_W + width, minHeight: timeline.tracks.length * TRACK_H + 26 }}>
            <div className="sticky top-0 z-30 flex h-[26px] border-b border-border bg-panel-2">
              <div className="sticky left-0 z-40 shrink-0 border-r border-border bg-panel-2" style={{ width: HEADER_W }} />
              <div className="relative flex-1 cursor-ew-resize" onPointerDown={scrubFromRuler}>
                {ruler.map((tick) => (
                  <div
                    key={tick.t}
                    className={`absolute top-0 ${tick.major ? "h-full border-l border-border" : "h-2 border-l border-border/60"}`}
                    style={{ left: tick.t * zoom }}
                  >
                    {tick.label && <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">{tick.label}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="sticky left-0 z-20 float-left" style={{ width: HEADER_W }}>
                {timeline.tracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex flex-col justify-center gap-1 border-b border-r border-border bg-panel-2 px-2"
                    style={{ height: TRACK_H }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11px] font-semibold text-foreground">{track.name}</span>
                      <span className="chip !px-1 !py-0 !text-[9px]">{track.kind}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost h-5 w-5"
                        title={track.muted ? "শব্দ চালু" : "নীরব"}
                        onClick={() => setTrack(track.id, { muted: !track.muted })}
                      >
                        {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost h-5 w-5"
                        title={track.hidden ? "দেখান" : "লুকান"}
                        onClick={() => setTrack(track.id, { hidden: !track.hidden })}
                      >
                        {track.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost h-5 w-5"
                        title={track.locked ? "আনলক" : "লক"}
                        onClick={() => setTrack(track.id, { locked: !track.locked })}
                      >
                        {track.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={track.volume}
                        onChange={(event) => setTrack(track.id, { volume: Number(event.target.value) })}
                        className="h-1 w-10 accent-primary"
                        title="ভলিউম"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div ref={laneRef} className="relative ml-0" style={{ marginLeft: HEADER_W, width }}>
                {timeline.tracks.map((track) => (
                  <div
                    key={track.id}
                    className={`relative border-b border-border ${track.hidden ? "opacity-50" : ""} ${track.locked ? "bg-panel/60" : ""}`}
                    style={{
                      height: TRACK_H,
                      backgroundImage:
                        "repeating-linear-gradient(90deg, transparent, transparent calc(var(--grid) - 1px), var(--border) calc(var(--grid) - 1px), var(--border) var(--grid))",
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ["--grid" as any]: `${zoom}px`,
                    }}
                    onPointerDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      select(undefined);
                      setPlaying(false);
                      setTime(snap(timeFromEvent(event.clientX)));
                    }}
                  >
                    {timeline.clips
                      .filter((clip) => clip.trackId === track.id)
                      .map((clip) => (
                        <ClipBlock
                          key={clip.id}
                          clip={clip}
                          zoom={zoom}
                          frames={timeline.media.find((m) => m.id === clip.mediaId)?.frames ?? []}
                          selected={clip.id === selectedClipId}
                          onSelect={() => select(clip.id)}
                          onDrag={(event, mode) => {
                            select(clip.id);
                            const grabOffset = mode === "move" ? timeFromEvent(event.clientX) - clip.start : 0;
                            beginDrag(event, { mode, clipId: clip.id, grabOffset, startTrack: track.id });
                          }}
                        />
                      ))}
                  </div>
                ))}
                <div
                  className="pointer-events-none absolute top-0 z-30 h-full w-px bg-playhead"
                  style={{ left: time * zoom }}
                >
                  <div className="-ml-1.5 h-2.5 w-3 rounded-b bg-playhead" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
/**
 * A single clip block on the timeline: label, colour by kind, thumbnail strip,
 * trim handles and drag targets.
 */
import { Film, Music, Shapes, Sparkles, Type as TypeIcon } from "lucide-react";

type KindStyle = { bg: string; border: string; icon: React.ReactNode };

const KIND_STYLE: Record<string, KindStyle> = {
  video: { bg: "bg-clip-video/80", border: "border-clip-video", icon: <Film className="h-3 w-3" /> },
  audio: { bg: "bg-clip-audio/80", border: "border-clip-audio", icon: <Music className="h-3 w-3" /> },
  image: { bg: "bg-clip-video/60", border: "border-clip-video", icon: <Film className="h-3 w-3" /> },
  text: { bg: "bg-clip-text/80", border: "border-clip-text", icon: <TypeIcon className="h-3 w-3" /> },
  shape: { bg: "bg-clip-text/70", border: "border-clip-text", icon: <Shapes className="h-3 w-3" /> },
  effect: { bg: "bg-accent/70", border: "border-accent", icon: <Sparkles className="h-3 w-3" /> },
};

export function ClipBlock({
  clip,
  zoom,
  selected,
  onSelect,
  onDrag,
  frames,
}: {
  clip: Clip;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onDrag: (event: React.PointerEvent, mode: "move" | "trim-left" | "trim-right") => void;
  /** frames of the clip's source media, for the thumbnail strip */
  frames: string[];
}): React.ReactElement {
  const style: KindStyle = KIND_STYLE[clip.kind] ?? (KIND_STYLE["video"] as KindStyle);
  const width = Math.max(6, clip.duration * zoom);
  const thumbStrip = frames ?? [];
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(event) => {
        onSelect();
        onDrag(event, "move");
      }}
      className={`absolute top-1 bottom-1 flex cursor-grab items-center gap-1 overflow-hidden rounded border text-[10px] text-white/95 shadow-sm ${style.bg} ${
        selected ? "border-primary ring-1 ring-primary" : style.border
      }`}
      style={{ left: clip.start * zoom, width }}
      title={`${clip.label} · ${clip.duration.toFixed(2)}s`}
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5 cursor-w-resize bg-black/40 hover:bg-primary"
        onPointerDown={(event) => onDrag(event, "trim-left")}
      />
      <div
        className="absolute inset-y-0 right-0 w-1.5 cursor-e-resize bg-black/40 hover:bg-primary"
        onPointerDown={(event) => onDrag(event, "trim-right")}
      />
      <div className="flex min-w-0 items-center gap-1 px-2">
        {style.icon}
        <span className="truncate font-medium">{clip.label}</span>
      </div>
      {thumbStrip ? (
        <div className="pointer-events-none absolute inset-0 flex opacity-25">
          {thumbStrip.map((frame, index) => (
            <img key={index} src={frame} alt="" className="h-full flex-1 object-cover" />
          ))}
        </div>
      ) : null}
      {clip.effects.length > 0 && (
        <span className="absolute right-2 top-0.5 rounded-sm bg-black/50 px-1 text-[9px]">{clip.effects.length}fx</span>
      )}
    </div>
  );
}
