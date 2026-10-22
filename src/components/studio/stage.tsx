/**
 * Preview stage: the canvas the compositor draws into, plus the transport.
 *
 * The canvas keeps its own render loop through `PreviewPlayer`, which is fed the
 * live timeline on every store change. Scrubbing, play and pause all go through
 * the same player, so the preview always matches what an export would produce.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
} from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { PreviewPlayer } from "@/lib/engine/preview";
import { timelineEnd } from "@/lib/engine/model";
import { formatTime } from "@/lib/media";

export function Stage(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const [loop, setLoop] = useState(false);

  const timeline = useEditor((s) => s.timeline);
  const players = useEditor((s) => s.players);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const pool = useEditor((s) => s.pool);
  const setTime = useEditor((s) => s.setTime);
  const setPlaying = useEditor((s) => s.setPlaying);

  const duration = useMemo(() => Math.max(1, timelineEnd(timeline.clips)), [timeline.clips]);
  const muted = timeline.tracks.length > 0 && timeline.tracks.every((t) => t.muted);
  const [silent, setSilent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const notify = useEditor((s) => s.notify);

  // create the player once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const scratch = document.createElement("canvas");
    scratchRef.current = scratch;
    playerRef.current = new PreviewPlayer(ctx, scratch, {
      project: timeline.project,
      tracks: timeline.tracks,
      clips: timeline.clips,
      media: timeline.media,
      pool,
      animations: players,
    });
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  // keep the player's view of the document current
  useEffect(() => {
    playerRef.current?.update({
      project: timeline.project,
      tracks: timeline.tracks,
      clips: timeline.clips,
      media: timeline.media,
      pool,
      animations: players,
    });
  }, [timeline, players, pool]);

  // repaint whenever the document, the playhead or the canvas size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const player = playerRef.current;
    if (!canvas || !player) return;
    canvas.width = timeline.project.width;
    canvas.height = timeline.project.height;
    void player.paint(time);
  }, [timeline, players, time]);

  // drive playback
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      void player.play(time, (t) => setTime(t), () => {
        if (loop) {
          setTime(0);
          setPlaying(true);
        } else {
          setPlaying(false);
        }
      });
    } else {
      player.stop();
      void player.paint(time);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, loop]);

  const togglePlay = (): void => {
    setPlaying(!playing);
  };

  const step = (delta: number): void => {
    setPlaying(false);
    setTime(Math.min(duration, Math.max(0, time + delta)));
  };

  const toggleMute = (): void => {
    const next = !silent;
    setSilent(next);
    for (const track of timeline.tracks) {
      useEditor.getState().dispatch([{ op: "set_track", trackId: track.id, patch: { muted: next } }]);
    }
  };

  const fitScreen = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen?.();
  };

  const dropFiles = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const created = await useEditor.getState().addFiles(files);
    if (created.length) notify(`${created.length} ফাইল পুলে যোগ হয়েছে`, "success");
  };

  return (
    <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 transition-colors ${
          dragging ? "bg-primary/5" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void dropFiles(event)}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_10%,oklch(0.82_0.16_195/0.14),transparent_45%),radial-gradient(circle_at_85%_80%,oklch(0.62_0.2_300/0.12),transparent_50%)]" />
        <canvas
          ref={canvasRef}
          width={timeline.project.width}
          height={timeline.project.height}
          className="relative max-h-full w-auto max-w-full rounded-lg border border-border/70 shadow-[0_20px_70px_-20px_rgba(0,0,0,0.9)]"
          onClick={togglePlay}
        />
        {timeline.clips.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground/80">
              {dragging ? "এখানে ছেড়ে দিন" : "স্টুডিও খালি"}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              ভিডিও, অডিও বা ছবি এখানে টেনে আনুন, মিডিয়া প্যানেল থেকে যোগ করুন — অথবা চ্যাটে লিখে এজেন্টকে বলুন কী বানাতে হবে।
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-white/5 px-4 py-2.5">
        <button type="button" className="btn-ghost h-8 w-8" onClick={() => step(-1 / timeline.project.fps)} title="এক ফ্রেম পিছনে">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" className="btn-accent h-9 w-9" onClick={togglePlay} title={playing ? "থামান" : "চালান"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" className="btn-ghost h-8 w-8" onClick={() => step(1 / timeline.project.fps)} title="এক ফ্রেম সামনে">
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`btn-ghost h-8 w-8 ${loop ? "text-primary" : ""}`}
          onClick={() => setLoop(!loop)}
          title="লুপ"
        >
          <Repeat className="h-4 w-4" />
        </button>
        <div className="ml-1 rounded-md bg-panel-2 px-2 py-1 font-mono text-xs tabular-nums text-foreground">
          {formatTime(time, true, timeline.project.fps)}
          <span className="text-muted-foreground"> / {formatTime(duration)}</span>
        </div>
        <div className="flex-1" />
        <span className="chip hidden sm:inline-flex">
          {timeline.project.width}×{timeline.project.height} · {timeline.project.fps}fps
        </span>
        <button type="button" className="btn-ghost h-8 w-8" onClick={toggleMute} title="সব ট্র্যাক নীরব">
          {muted || silent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button type="button" className="btn-ghost h-8 w-8" onClick={fitScreen} title="ফুল স্ক্রিন">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
