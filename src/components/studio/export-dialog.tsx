/**
 * Export dialog: range, resolution, live progress and the download link.
 *
 * Rendering runs in the browser on the same compositor the preview uses, so the
 * file matches the timeline exactly. Frame timings come from the project's fps.
 */
import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { timelineEnd } from "@/lib/engine/model";
import { formatTime } from "@/lib/media";

export function ExportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const timeline = useEditor((s) => s.timeline);
  const exportState = useEditor((s) => s.exportState);
  const startExport = useEditor((s) => s.startExport);
  const duration = timelineEnd(timeline.clips);

  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(duration);
  const [scale, setScale] = useState(1);

  useEffect(() => setTo(duration), [duration]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-panel p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">এক্সপোর্ট</h2>
          <button type="button" className="btn-ghost h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-muted-foreground">শুরু</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={Number(from.toFixed(2))}
              onChange={(event) => setFrom(Number(event.target.value))}
              className="h-8 rounded border border-border bg-panel-2 px-2 text-xs text-foreground outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-muted-foreground">শেষ</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={Number(to.toFixed(2))}
              onChange={(event) => setTo(Number(event.target.value))}
              className="h-8 rounded border border-border bg-panel-2 px-2 text-xs text-foreground outline-none"
            />
          </label>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase text-muted-foreground">রেজল্যুশন</span>
          <div className="flex gap-1.5">
            {[
              { label: "50%", value: 0.5 },
              { label: "75%", value: 0.75 },
              { label: "100%", value: 1 },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setScale(option.value)}
                className={`h-7 flex-1 rounded text-[11px] ${
                  scale === option.value ? "bg-primary text-primary-foreground" : "bg-panel-2 text-muted-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-border bg-panel-2 p-2 text-[11px] text-muted-foreground">
          <p>
            {Math.round(timeline.project.width * scale)}×{Math.round(timeline.project.height * scale)} ·{" "}
            {timeline.project.fps}fps · WebM (VP9 + Opus)
          </p>
          <p className="mt-0.5">
            দৈর্ঘ্য {formatTime(Math.max(0, to - from))} · {timeline.clips.length} ক্লিপ
          </p>
        </div>

        {exportState.running && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-panel-3">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${exportState.progress * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">{exportState.message}</p>
          </div>
        )}

        {!exportState.running && exportState.message && (
          <p className="text-[11px] text-foreground">{exportState.message}</p>
        )}

        <button
          type="button"
          className="btn-accent h-9 w-full text-xs"
          disabled={exportState.running || timeline.clips.length === 0}
          onClick={() => void startExport({ from, to, scale })}
        >
          {exportState.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exportState.running ? "রেন্ডার হচ্ছে…" : "রেন্ডার ও ডাউনলোড"}
        </button>
        <p className="text-[10px] text-muted-foreground">
          রেন্ডার আপনার ব্রাউজারেই হয় — ফাইল কোথাও আপলোড হয় না। লম্বা টাইমলাইনে ট্যাব খোলা রাখুন।
        </p>
      </div>
    </div>
  );
}
