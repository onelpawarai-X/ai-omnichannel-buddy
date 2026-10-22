/**
 * Media panel: upload files, paste a URL, and manage the pool.
 *
 * Uploads stay local (object URLs). Everything else goes through the same
 * `addUrl` path the agent uses, so a clip added here behaves identically.
 */
import { useRef, useState } from "react";
import { FilePlus2, Link2, Music, Trash2, Video, ImageIcon, Plus, Loader2 } from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { formatTime } from "@/lib/media";
import type { MediaItem } from "@/lib/engine/model";

export function MediaPanel(): React.ReactElement {
  const media = useEditor((s) => s.timeline.media);
  const addFiles = useEditor((s) => s.addFiles);
  const addUrl = useEditor((s) => s.addUrl);
  const removeMedia = useEditor((s) => s.removeMedia);
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const notify = useEditor((s) => s.notify);

  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    setBusy(true);
    try {
      await addFiles([...files]);
    } catch {
      notify("ফাইল লোড করা যায়নি", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const importUrl = async (): Promise<void> => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await addUrl(url.trim());
      setUrl("");
    } catch {
      notify("এই লিংক থেকে মিডিয়া আনা যায়নি", "error");
    } finally {
      setBusy(false);
    }
  };

  const place = (item: MediaItem): void => {
    const result = dispatch([
      {
        op: "add_clip",
        clip: {
          kind: item.kind,
          mediaId: item.id,
          label: item.name,
          duration: item.kind === "image" ? 4 : item.duration,
          ...(item.kind === "video" || item.kind === "audio" ? { in: 0 } : {}),
        },
      },
    ]);
    if (result.createdClipId) select(result.createdClipId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-accent h-9 text-xs" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
          আপলোড
        </button>
        <button
          type="button"
          className="btn-ghost h-9 border border-border text-xs"
          onClick={() => {
            const generated = "ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30:duration=5 -f lavfi -i sine=frequency=440:duration=5 -c:v libx264 -pix_fmt yuv420p -c:a aac test-pattern.mp4";
            void useEditor.getState().send(`এই কমান্ড চালিয়ে একটা টেস্ট ভিডিও বানাও এবং টাইমলাইনে বসাও: ${generated}`);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          টেস্ট ক্লিপ
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        className="hidden"
        onChange={(event) => void upload(event.target.files)}
      />

      <div className="flex items-center gap-2 rounded-md border border-border bg-panel-2 p-1.5">
        <Link2 className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void importUrl();
          }}
          placeholder="ভিডিও/অডিও/ছবির লিংক বা ইউটিউব URL"
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button type="button" className="btn-ghost h-6 px-2 text-xs" onClick={() => void importUrl()} disabled={busy}>
          আনো
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {media.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            এখনো কিছু নেই। ফাইল আপলোড করুন, লিংক দিন, বা লাইব্রেরি ট্যাব থেকে বিনামূল্যের ক্লিপ আনুন।
          </p>
        )}
        {media.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded-md border border-border/70 bg-panel-2 p-1.5">
            <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded bg-panel-3">
              {item.spectrogram ? (
                // Audio tiles show the spectrogram the agent actually reads.
                <img src={item.spectrogram} alt={`spectrogram of ${item.name}`} className="h-full w-full object-cover" />
              ) : item.thumb ? (
                <img src={item.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  {item.kind === "video" ? <Video className="h-4 w-4" /> : item.kind === "audio" ? <Music className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground" title={item.name}>
                {item.name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {item.kind} · {formatTime(item.duration)}
                {item.width ? ` · ${item.width}×${item.height}` : ""}
                {item.beats?.length ? ` · ${item.beats.length} beat` : ""}
                {item.spectrogram ? " · spectrogram" : ""}
              </p>
            </div>
            <button type="button" className="btn-ghost h-7 w-7" title="টাইমলাইনে বসান" onClick={() => place(item)}>
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn-ghost h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
              title="পুল থেকে মুছুন"
              onClick={() => removeMedia(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {media.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {media.length} আইটেম পুলে · মোট দৈর্ঘ্য {formatTime(media.reduce((sum, m) => sum + m.duration, 0))}
        </p>
      )}
    </div>
  );
}
