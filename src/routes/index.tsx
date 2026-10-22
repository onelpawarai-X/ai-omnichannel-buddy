import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Plus,
  Send,
  Video,
  Music,
  Type,
  Sparkles,
  Layers,
  Upload,
  Sliders,
  ChevronRight,
  Bot,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useEditorStore,
  filterCss,
  type Clip,
  type MediaItem,
} from "@/lib/editor-store";
import {
  DEFAULT_MODEL,
  fetchZyraxonModels,
  sortModelsBySpeed,
  streamChat,
  type ZyraxonModel,
} from "@/lib/zyraxon";
import {
  buildSystemPrompt,
  extractToolBlocks,
  historyFromMessages,
} from "@/lib/agent-protocol";
import { formatTime } from "@/lib/media";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZYRAXON AI Cloud Video Editor | CapCut Style" },
      {
        name: "description",
        content:
          "AI-driven multi-track cloud video editor powered by Zyraxon multimodal models.",
      },
      { property: "og:title", content: "ZYRAXON Cloud Editor" },
      {
        property: "og:description",
        content: "Autonomous timeline editing with audio, video and text.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const store = useEditorStore();
  const [models, setModels] = useState<ZyraxonModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [activeTab, setActiveTab] = useState<"ai" | "media" | "inspector">("ai");
  const [chatInput, setChatInput] = useState("");
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Fetch Zyraxon models list on mount
  useEffect(() => {
    fetchZyraxonModels().then((data) => {
      const sorted = sortModelsBySpeed(data);
      setModels(sorted);
    });
  }, []);

  // Playback timer loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (store.playing) {
        const delta = (now - lastTime) / 1000;
        const total = store.totalDuration();
        const next = store.playhead + delta;
        if (total > 0 && next >= total) {
          store.seek(0);
          store.setPlaying(false);
        } else {
          store.seek(next);
        }
      }
      lastTime = now;
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [store.playing, store.playhead]);

  // Sync video element time
  const currentVideoClip = store.clipAtPlayhead("video");
  const currentMedia = store.media.find((m) => m.id === currentVideoClip?.mediaId);

  useEffect(() => {
    if (videoPlayerRef.current && currentVideoClip) {
      const offset = (store.playhead - currentVideoClip.start) * currentVideoClip.speed + currentVideoClip.in;
      if (Math.abs(videoPlayerRef.current.currentTime - offset) > 0.2) {
        videoPlayerRef.current.currentTime = Math.max(0, offset);
      }
    }
  }, [store.playhead, currentVideoClip]);

  // Handle uploading files via + icon
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      const item = await store.addMediaFromFile(file);
      store.addClipForMedia(item.id);
    }
  };

  // Run AI Agent Chat with streaming & auto tool execution
  const handleSendMessage = async () => {
    if ((!chatInput.trim() && pendingUploads.length === 0) || store.agentBusy) return;

    let userText = chatInput.trim();
    setChatInput("");

    // If files are attached in chat, add them first
    if (pendingUploads.length > 0) {
      const names: string[] = [];
      for (const file of pendingUploads) {
        const item = await store.addMediaFromFile(file);
        store.addClipForMedia(item.id);
        names.push(item.name);
      }
      userText += `\n[সংযুক্ত মিডিয়া: ${names.join(", ")}]`;
      setPendingUploads([]);
    }

    const userMsgId = store.pushMessage({
      id: `u-${Date.now()}`,
      role: "user",
      content: userText,
    });

    const assistantMsgId = store.pushMessage({
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "ভাবছি...",
      streaming: true,
    });

    store.setAgentBusy(true);

    try {
      const sysPrompt = buildSystemPrompt({
        clips: store.clips,
        media: store.media,
        playhead: store.playhead,
        duration: store.totalDuration(),
        sttLanguage: store.sttLanguage,
      });

      const history = historyFromMessages(store.messages);
      const messages = [
        { role: "system" as const, content: sysPrompt },
        ...history,
        { role: "user" as const, content: userText },
      ];

      let accumulated = "";
      const stream = streamChat({
        model: selectedModel,
        messages,
      });

      for await (const chunk of stream) {
        accumulated += chunk;
        const { visibleText } = extractToolBlocks(accumulated);
        store.patchMessage(assistantMsgId, {
          content: visibleText || "কমান্ড প্রসেস হচ্ছে...",
        });
      }

      // Execute extracted tool blocks in real-time
      const { ops, visibleText } = extractToolBlocks(accumulated);
      store.patchMessage(assistantMsgId, {
        content: visibleText || "সম্পন্ন হয়েছে!",
        streaming: false,
      });

      for (const op of ops) {
        if (typeof op["op"] === "string") {
          await store.applyOp(op as { op: string } & Record<string, unknown>);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      store.patchMessage(assistantMsgId, {
        content: `ত্রুটি হয়েছে: ${errMsg}`,
        streaming: false,
      });
    } finally {
      store.setAgentBusy(false);
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const selectedClip = store.clips.find((c) => c.id === store.selectedClipId);
  const totalDur = Math.max(10, store.totalDuration());

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100 select-none">
      {/* Top Navigation Bar */}
      <header className="flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 font-black text-white shadow-lg">
            Z
          </div>
          <span className="font-semibold tracking-wider text-sm">
            ZYRAXON <span className="text-cyan-400 font-normal">CLOUD EDITOR</span>
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            CapCut Engine
          </span>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">AI Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {models.length ? (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id === "zyraxon-cyber" ? "⚡ (All Media)" : ""}
                </option>
              ))
            ) : (
              <option value="zyraxon-cyber">zyraxon-cyber (Text + Video + Audio)</option>
            )}
          </select>

          <button
            onClick={() => store.undo()}
            className="flex items-center gap-1 rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700 active:scale-95 transition"
            title="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
            পূর্বাবস্থা
          </button>

          <button
            onClick={() => {
              setIsExporting(true);
              setTimeout(() => {
                setIsExporting(false);
                alert("আপনার ভিডিও রেন্ডার প্রস্তুত হয়েছে!");
              }, 1200);
            }}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-cyan-400 active:scale-95 transition disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            এক্সপোর্ট
          </button>
        </div>
      </header>

      {/* Main Workspace (Preview + Right Sidebar) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center / Left: Live Canvas & Controls */}
        <div className="flex flex-1 flex-col border-r border-neutral-800 bg-neutral-950">
          {/* Canvas Viewport */}
          <div className="relative flex flex-1 items-center justify-center p-4 overflow-hidden bg-neutral-900/40">
            <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-lg bg-black shadow-2xl border border-neutral-800">
              {currentMedia?.kind === "video" && (
                <video
                  ref={videoPlayerRef}
                  src={currentMedia.url}
                  className="h-full w-full object-contain"
                  style={{ filter: filterCss(currentVideoClip?.filter ?? { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0 }) }}
                  muted={currentVideoClip?.muted}
                  playsInline
                />
              )}
              {currentMedia?.kind === "image" && (
                <img
                  src={currentMedia.url}
                  alt={currentMedia.name}
                  className="h-full w-full object-contain"
                  style={{ filter: filterCss(currentVideoClip?.filter ?? { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0 }) }}
                />
              )}
              {!currentMedia && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-600">
                  <Video className="h-12 w-12 stroke-1 text-neutral-700" />
                  <p className="text-xs">টাইমলাইনে কোনো মিডিয়া নেই। নিচে প্লাস বাটন দিয়ে ফাইল যোগ করুন।</p>
                </div>
              )}

              {/* Text Overlays at current playhead */}
              {store.clips
                .filter(
                  (c) =>
                    c.kind === "text" &&
                    c.text &&
                    store.playhead >= c.start &&
                    store.playhead < c.start + c.duration,
                )
                .map((c) => (
                  <div
                    key={c.id}
                    className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 select-none"
                    style={{
                      left: `${(c.text?.x ?? 0.5) * 100}%`,
                      top: `${(c.text?.y ?? 0.85) * 100}%`,
                      color: c.text?.color ?? "#ffffff",
                      fontSize: `${Math.max(14, (c.text?.size ?? 48) * 0.4)}px`,
                      fontWeight: c.text?.weight ?? 700,
                      textShadow: c.text?.shadow ? "0 2px 8px rgba(0,0,0,0.8)" : "none",
                    }}
                  >
                    {c.text?.content}
                  </div>
                ))}
            </div>
          </div>

          {/* Transport & Control Bar */}
          <div className="flex h-11 items-center justify-between border-t border-neutral-800 bg-neutral-900/60 px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => store.setPlaying(!store.playing)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-neutral-950 hover:bg-cyan-400 active:scale-95 transition"
              >
                {store.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  const clip = store.clipAtPlayhead();
                  if (clip) store.splitClipAt(clip.id, store.playhead);
                }}
                className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
                title="Split at playhead"
              >
                <Scissors className="h-3.5 w-3.5" />
                কাটুন
              </button>

              {store.selectedClipId && (
                <button
                  onClick={() => store.deleteClip(store.selectedClipId!)}
                  className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40"
                  title="Delete selected clip"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  ডিলিট
                </button>
              )}
            </div>

            {/* Time Display */}
            <div className="font-mono text-xs text-neutral-400">
              <span className="text-neutral-100 font-semibold">{formatTime(store.playhead)}</span> /{" "}
              {formatTime(totalDur)}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <ZoomOut
                className="h-3.5 w-3.5 cursor-pointer text-neutral-400 hover:text-neutral-200"
                onClick={() => store.setPxPerSec(store.pxPerSec - 15)}
              />
              <input
                type="range"
                min="10"
                max="200"
                value={store.pxPerSec}
                onChange={(e) => store.setPxPerSec(Number(e.target.value))}
                className="h-1 w-20 cursor-pointer accent-cyan-500"
              />
              <ZoomIn
                className="h-3.5 w-3.5 cursor-pointer text-neutral-400 hover:text-neutral-200"
                onClick={() => store.setPxPerSec(store.pxPerSec + 15)}
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar: AI Chat / Assets / Inspector */}
        <div className="flex w-96 flex-col border-l border-neutral-800 bg-neutral-900/70">
          {/* Tabs */}
          <div className="flex h-10 border-b border-neutral-800">
            <button
              onClick={() => setActiveTab("ai")}
              className={`flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition ${
                activeTab === "ai"
                  ? "border-b-2 border-cyan-400 text-cyan-400 bg-neutral-800/40"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              AI কো-পাইলট
            </button>
            <button
              onClick={() => setActiveTab("media")}
              className={`flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition ${
                activeTab === "media"
                  ? "border-b-2 border-cyan-400 text-cyan-400 bg-neutral-800/40"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              মিডিয়া ({store.media.length})
            </button>
            <button
              onClick={() => setActiveTab("inspector")}
              className={`flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition ${
                activeTab === "inspector"
                  ? "border-b-2 border-cyan-400 text-cyan-400 bg-neutral-800/40"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              প্রোপার্টিজ
            </button>
          </div>

          {/* Tab 1: AI Chat Assistant with [+] Plus Attachment Button */}
          {activeTab === "ai" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {store.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col rounded-lg p-2.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "ml-6 bg-cyan-950/60 border border-cyan-800/40 text-neutral-100"
                        : msg.role === "assistant"
                          ? "mr-4 bg-neutral-800/70 border border-neutral-700/50 text-neutral-200"
                          : "bg-neutral-800/30 text-neutral-400 text-[11px]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-[10px] text-neutral-400 mb-1">
                      {msg.role === "user" ? "আপনি" : msg.role === "assistant" ? "ZYRAXON AI" : "সিস্টেম"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
                {store.agentBusy && (
                  <div className="flex items-center gap-2 text-xs text-cyan-400 italic">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    এআই রিয়েল-টাইমে এডিট করছে...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Pending Upload Chips */}
              {pendingUploads.length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 py-1 bg-neutral-900 border-t border-neutral-800">
                  {pendingUploads.map((file, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-[11px] text-cyan-300"
                    >
                      {file.name.slice(0, 18)}
                      <button
                        onClick={() => setPendingUploads(pendingUploads.filter((_, i) => i !== idx))}
                        className="text-neutral-400 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Chat Input with [+] Button */}
              <div className="p-2.5 border-t border-neutral-800 bg-neutral-900">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 focus-within:border-cyan-500">
                  {/* File Upload [+] Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept="video/*,audio/*,image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setPendingUploads([...pendingUploads, ...Array.from(e.target.files)]);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-cyan-400 active:scale-95 transition"
                    title="অডিও, ভিডিও বা ছবি যোগ করুন"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="ভিডিও ট্রিম বা টেক্সট যোগ করতে বলুন..."
                    className="flex-1 bg-transparent text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none"
                  />

                  <button
                    onClick={handleSendMessage}
                    disabled={store.agentBusy || (!chatInput.trim() && pendingUploads.length === 0)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500 text-neutral-950 hover:bg-cyan-400 disabled:opacity-40 transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Media Asset Bin */}
          {activeTab === "media" && (
            <div className="flex flex-1 flex-col overflow-y-auto p-3 space-y-2">
              <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 p-4 text-center cursor-pointer hover:border-cyan-500 hover:bg-neutral-800/30 transition">
                <Upload className="h-6 w-6 text-neutral-400 mb-1" />
                <span className="text-xs font-medium text-neutral-200">নতুন মিডিয়া আপলোড করুন</span>
                <span className="text-[10px] text-neutral-500">ভিডিও, অডিও বা ইমেজ ড্রপ করুন</span>
                <input
                  type="file"
                  multiple
                  accept="video/*,audio/*,image/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </label>

              <div className="space-y-1.5 pt-2">
                {store.media.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-800/50 p-2 hover:bg-neutral-800 transition"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {item.thumb ? (
                        <img src={item.thumb} alt={item.name} className="h-8 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-10 items-center justify-center rounded bg-neutral-900 text-neutral-500">
                          {item.kind === "audio" ? <Music className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                        </div>
                      )}
                      <div className="overflow-hidden">
                        <div className="truncate text-xs font-medium text-neutral-200">{item.name}</div>
                        <div className="text-[10px] text-neutral-500">
                          {item.kind} · {formatTime(item.duration)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => store.addClipForMedia(item.id)}
                      className="rounded bg-neutral-700 px-2 py-1 text-[10px] font-medium text-neutral-200 hover:bg-cyan-500 hover:text-neutral-950 transition"
                    >
                      + টাইমলাইনে
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Inspector / Clip Properties */}
          {activeTab === "inspector" && (
            <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-4 text-xs">
              {selectedClip ? (
                <>
                  <div className="font-semibold text-neutral-200 border-b border-neutral-800 pb-2">
                    ক্লিপ সেটিংস: {selectedClip.label}
                  </div>

                  <div className="space-y-2">
                    <label className="text-neutral-400">স্পিড: {selectedClip.speed}x</label>
                    <input
                      type="range"
                      min="0.25"
                      max="4"
                      step="0.25"
                      value={selectedClip.speed}
                      onChange={(e) => store.updateClip(selectedClip.id, { speed: Number(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-neutral-400">ভলিউম: {Math.round(selectedClip.volume * 100)}%</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedClip.volume}
                      onChange={(e) => store.updateClip(selectedClip.id, { volume: Number(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  {selectedClip.kind === "text" && selectedClip.text && (
                    <div className="space-y-2">
                      <label className="text-neutral-400">টেক্সট কন্টেন্ট:</label>
                      <input
                        type="text"
                        value={selectedClip.text.content}
                        onChange={(e) =>
                          store.updateClip(selectedClip.id, {
                            text: { ...selectedClip.text!, content: e.target.value },
                          })
                        }
                        className="w-full rounded bg-neutral-800 border border-neutral-700 p-1.5 text-neutral-100"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-neutral-500">
                  টাইমলাইন থেকে একটি ক্লিপ সিলেক্ট করুন।
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Multi-Track Timeline (CapCut Style) */}
      <div className="h-64 border-t border-neutral-800 bg-neutral-900 flex flex-col">
        {/* Timeline Header Ruler */}
        <div
          ref={timelineRef}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
            store.seek(Math.max(0, clickX / store.pxPerSec));
          }}
          className="relative h-6 border-b border-neutral-800 bg-neutral-950/60 cursor-pointer overflow-hidden"
        >
          {Array.from({ length: Math.ceil(totalDur) + 2 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${i * store.pxPerSec}px` }}
            >
              <div className="h-2 w-px bg-neutral-600" />
              <span className="text-[9px] font-mono text-neutral-500 select-none">{i}s</span>
            </div>
          ))}

          {/* Red Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none"
            style={{ left: `${store.playhead * store.pxPerSec}px` }}
          >
            <div className="h-2.5 w-2.5 -translate-x-[4px] rounded-full bg-rose-500" />
          </div>
        </div>

        {/* Multi-Track Lanes */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-2 space-y-2 relative">
          {/* Playhead vertical marker across tracks */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500/80 z-20 pointer-events-none"
            style={{ left: `${store.playhead * store.pxPerSec + 8}px` }}
          />

          {/* Track 1: Video / Visuals */}
          <div className="flex items-center gap-2">
            <span className="w-14 text-[10px] font-semibold text-neutral-500 uppercase">Video</span>
            <div className="relative h-12 flex-1 rounded bg-neutral-950/60 border border-neutral-800/80">
              {store.clips
                .filter((c) => c.kind === "video" || c.kind === "image")
                .map((clip) => (
                  <div
                    key={clip.id}
                    onClick={() => store.selectClip(clip.id)}
                    className={`absolute top-1 bottom-1 rounded border px-2 flex items-center overflow-hidden cursor-pointer transition ${
                      store.selectedClipId === clip.id
                        ? "border-cyan-400 bg-cyan-900/60 text-cyan-200 shadow-md"
                        : "border-neutral-700 bg-neutral-800 text-neutral-300"
                    }`}
                    style={{
                      left: `${clip.start * store.pxPerSec}px`,
                      width: `${clip.duration * store.pxPerSec}px`,
                    }}
                  >
                    <span className="truncate text-[11px] font-medium">{clip.label}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Track 2: Audio */}
          <div className="flex items-center gap-2">
            <span className="w-14 text-[10px] font-semibold text-neutral-500 uppercase">Audio</span>
            <div className="relative h-10 flex-1 rounded bg-neutral-950/60 border border-neutral-800/80">
              {store.clips
                .filter((c) => c.kind === "audio")
                .map((clip) => (
                  <div
                    key={clip.id}
                    onClick={() => store.selectClip(clip.id)}
                    className={`absolute top-1 bottom-1 rounded border px-2 flex items-center overflow-hidden cursor-pointer transition ${
                      store.selectedClipId === clip.id
                        ? "border-emerald-400 bg-emerald-900/60 text-emerald-200"
                        : "border-neutral-700 bg-emerald-950/40 text-neutral-300"
                    }`}
                    style={{
                      left: `${clip.start * store.pxPerSec}px`,
                      width: `${clip.duration * store.pxPerSec}px`,
                    }}
                  >
                    <Music className="h-3 w-3 mr-1 text-emerald-400" />
                    <span className="truncate text-[10px] font-medium">{clip.label}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Track 3: Text & Captions */}
          <div className="flex items-center gap-2">
            <span className="w-14 text-[10px] font-semibold text-neutral-500 uppercase">Text</span>
            <div className="relative h-10 flex-1 rounded bg-neutral-950/60 border border-neutral-800/80">
              {store.clips
                .filter((c) => c.kind === "text")
                .map((clip) => (
                  <div
                    key={clip.id}
                    onClick={() => store.selectClip(clip.id)}
                    className={`absolute top-1 bottom-1 rounded border px-2 flex items-center overflow-hidden cursor-pointer transition ${
                      store.selectedClipId === clip.id
                        ? "border-amber-400 bg-amber-900/60 text-amber-200"
                        : "border-neutral-700 bg-amber-950/40 text-neutral-300"
                    }`}
                    style={{
                      left: `${clip.start * store.pxPerSec}px`,
                      width: `${clip.duration * store.pxPerSec}px`,
                    }}
                  >
                    <Type className="h-3 w-3 mr-1 text-amber-400" />
                    <span className="truncate text-[10px] font-medium">{clip.text?.content ?? clip.label}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
