/**
 * ZYRAXON Studio — cloud media editor.
 *
 * Layout: media and library rail on the left, preview stage in the middle, the
 * inspector and the agent chat in the right rail, and the timeline across the
 * bottom. Every panel reads and writes the same document, so a change made by
 * hand and a change made by the agent are the same kind of change, and both go
 * through the undo history.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bot,
  Clapperboard,
  Download,
  FolderOpen,
  Keyboard,
  Loader2,
  Redo2,
  RotateCcw,
  Sliders,
  Sparkles,
  Undo2,
} from "lucide-react";

import { ChatPanel } from "@/components/studio/chat-panel";
import { ExportDialog } from "@/components/studio/export-dialog";
import { Inspector } from "@/components/studio/inspector";
import { LibraryPanel } from "@/components/studio/library-panel";
import { MediaPanel } from "@/components/studio/media-panel";
import { Stage } from "@/components/studio/stage";
import { Timeline } from "@/components/studio/timeline";
import { bootstrapAnimations, useEditor } from "@/lib/editor-store";
import { fetchZyraxonModels, type ZyraxonModel } from "@/lib/zyraxon";
import { pickDefaultModel } from "@/lib/engine/routing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZYRAXON Studio — AI Cloud Video Editor" },
      {
        name: "description",
        content:
          "Multimodal AI editing studio: hand the agent video, audio, images and a prompt, and it edits the timeline — effects, Lottie overlays, captions, YouTube import and browser export.",
      },
      { property: "og:title", content: "ZYRAXON Studio — AI Cloud Video Editor" },
      { property: "og:description", content: "Agent-driven timeline editing with effects, Lottie overlays and YouTube import." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

type LeftTab = "media" | "library";
type RightTab = "inspector" | "chat";

function StudioPage(): React.ReactElement {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const reset = useEditor((s) => s.reset);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const toast = useEditor((s) => s.toast);
  const dismissToast = useEditor((s) => s.dismissToast);
  const agentBusy = useEditor((s) => s.agentBusy);
  const agentStep = useEditor((s) => s.agentStep);
  const clipCount = useEditor((s) => s.timeline.clips.length);
  const setAgentModel = useEditor((s) => s.setAgentModel);

  const [leftTab, setLeftTab] = useState<LeftTab>("media");
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [models, setModels] = useState<ZyraxonModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    void bootstrapAnimations();
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchZyraxonModels();
        if (cancelled) return;
        setModels(list);
        const best = pickDefaultModel(list);
        if (best) setAgentModel(best);
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // global shortcuts: space plays, arrows step, delete removes the selection
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const store = useEditor.getState();
      if (event.code === "Space") {
        event.preventDefault();
        store.setPlaying(!store.playing);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setExportOpen(true);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!store.selectedClipId) return;
        event.preventDefault();
        store.dispatch([{ op: "remove_clip", clipId: store.selectedClipId }]);
        store.select(undefined);
      } else if (event.key === "ArrowLeft") {
        store.setPlaying(false);
        store.setTime(Math.max(0, store.time - (event.shiftKey ? 1 : 1 / store.timeline.project.fps)));
      } else if (event.key === "ArrowRight") {
        store.setPlaying(false);
        store.setTime(store.time + (event.shiftKey ? 1 : 1 / store.timeline.project.fps));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // expose the store for end-to-end tests and for the browser console
  useEffect(() => {
    (window as unknown as { __zyraxon?: unknown }).__zyraxon = useEditor;
  }, []);

  const modelBadge = loadingModels ? "মডেল লোড হচ্ছে…" : models.length > 0 ? `${models.length} মডেল` : "ফলব্যাক মডেল তালিকা";

  return (
    <div className="flex h-dvh w-full flex-col gap-2.5 overflow-hidden p-2.5 text-foreground">
      <header className="glass flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_var(--color-primary)]">
          <Clapperboard className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">ZYRAXON Studio</p>
          <p className="text-[10px] text-muted-foreground">{modelBadge} · এজেন্ট-চালিত ক্লাউড এডিটর</p>
        </div>

        <div className="mx-1 h-7 w-px bg-white/10" />

        <button type="button" className="btn-ghost h-8 w-8" title="আনডু (Ctrl+Z)" disabled={past === 0} onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className="btn-ghost h-8 w-8" title="রিডু (Ctrl+Shift+Z)" disabled={future === 0} onClick={redo}>
          <Redo2 className="h-4 w-4" />
        </button>
        <button type="button" className="btn-ghost h-8 w-8" title="সব মুছে নতুন করে শুরু" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {agentBusy && (
          <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> {agentStep ?? "এজেন্ট কাজ করছে"}
          </span>
        )}
        <span className="chip hidden md:inline-flex">{clipCount} ক্লিপ</span>
        <button type="button" className="btn-ghost h-8 w-8" title="শর্টকাট" onClick={() => setShowHelp(true)}>
          <Keyboard className="h-4 w-4" />
        </button>
        <button type="button" className="btn-accent h-8 gap-1.5 px-3.5 text-[11px]" onClick={() => setExportOpen(true)}>
          <Download className="h-3.5 w-3.5" /> এক্সপোর্ট
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-2.5">
        <aside className="glass flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl">
          <div className="flex shrink-0 gap-1 p-2">
            {(
              [
                { id: "media" as LeftTab, label: "মিডিয়া", icon: <FolderOpen className="h-3.5 w-3.5" /> },
                { id: "library" as LeftTab, label: "লাইব্রেরি", icon: <Sparkles className="h-3.5 w-3.5" /> },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                className={`tab-pill ${leftTab === tab.id ? "tab-pill-active" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{leftTab === "media" ? <MediaPanel /> : <LibraryPanel />}</div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Stage />
          <div className="h-[40%] min-h-[220px] shrink-0">
            <Timeline />
          </div>
        </main>

        <aside className="glass flex w-[360px] shrink-0 flex-col overflow-hidden rounded-xl">
          <div className="flex shrink-0 gap-1 p-2">
            {(
              [
                { id: "chat" as RightTab, label: "এজেন্ট", icon: <Bot className="h-3.5 w-3.5" /> },
                { id: "inspector" as RightTab, label: "প্রপার্টি", icon: <Sliders className="h-3.5 w-3.5" /> },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`tab-pill ${rightTab === tab.id ? "tab-pill-active" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {rightTab === "chat" ? <ChatPanel models={models} /> : <Inspector />}
          </div>
        </aside>
      </div>

      {toast && (
        <button
          type="button"
          onClick={dismissToast}
          className={`glass-strong fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[11px] ${
            toast.kind === "error"
              ? "text-destructive"
              : toast.kind === "success"
                ? "text-primary"
                : "text-foreground"
          }`}
        >
          {toast.text}
        </button>
      )}

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div
            className="glass-strong w-full max-w-md space-y-3 rounded-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold">শর্টকাট ও ব্যবহার</h2>
            <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>Space — প্লে/পজ</li>
              <li>← / → — এক ফ্রেম (Shift চাপলে ১ সেকেন্ড)</li>
              <li>Ctrl/Cmd + Z — আনডু · Ctrl/Cmd + Shift + Z — রিডু</li>
              <li>Ctrl/Cmd + E — এক্সপোর্ট</li>
              <li>Delete — সিলেক্টেড ক্লিপ মুছুন</li>
              <li>টাইমলাইনে ফাইল ড্র্যাগ করলে সরাসরি ক্লিপ বসে</li>
              <li>চ্যাটে ফাইল ড্র্যাগ বা মাইক চেপে বললে প্রম্পটে লেখা হয়</li>
            </ul>
            <p className="text-xs leading-relaxed text-muted-foreground">
              এজেন্টকে শুধু ভিডিও দিন — সিন-চেঞ্জ, বিট আর টাইমিং বুঝে সে নিজেই কাট, ইফেক্ট, ক্যাপশন আর সাউন্ড বানায়।
            </p>
            <button type="button" className="btn-accent h-9 w-full text-xs" onClick={() => setShowHelp(false)}>
              বুঝেছি
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
