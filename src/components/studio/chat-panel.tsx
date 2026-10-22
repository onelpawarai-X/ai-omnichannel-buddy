/**
 * Agent chat: the prompt box, attachments, streaming answer and the tool log.
 *
 * The microphone button turns speech into prompt text in the browser, and the
 * same box also accepts dropped or pasted media, so a single message can carry
 * a video, an image and a written instruction together.
 */
import { useEffect, useRef, useState } from "react";
import {
  AudioLines as AudioIcon,
  Bot,
  Check,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Square,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { sortModelsBySpeed, type ZyraxonModel } from "@/lib/zyraxon";
import { describeCapability, pickDefaultModel, toCapability } from "@/lib/engine/routing";
import { ChatBubble } from "./chat-bubble";

export function ChatPanel({ models }: { models: ZyraxonModel[] }): React.ReactElement {
  const chat = useEditor((s) => s.chat);
  const busy = useEditor((s) => s.agentBusy);
  const step = useEditor((s) => s.agentStep);
  const send = useEditor((s) => s.send);
  const stop = useEditor((s) => s.stopAgent);
  const attach = useEditor((s) => s.attach);
  const clearAttachments = useEditor((s) => s.clearAttachments);
  const attachments = useEditor((s) => s.attachments);
  const micRecording = useEditor((s) => s.micRecording);
  const micLevel = useEditor((s) => s.micLevel);
  const startMic = useEditor((s) => s.startMic);
  const stopMic = useEditor((s) => s.stopMic);
  const dictation = useEditor((s) => s.dictation);
  const consumeDictation = useEditor((s) => s.consumeDictation);
  const agentModel = useEditor((s) => s.agentModel);
  const setAgentModel = useEditor((s) => s.setAgentModel);
  const notify = useEditor((s) => s.notify);

  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // dictation lands in the prompt box as it is recognised
  useEffect(() => {
    if (!dictation) return;
    const spoken = consumeDictation();
    if (spoken) setText((current) => `${current}${current ? " " : ""}${spoken}`);
  }, [dictation, consumeDictation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  // Files dropped here go into the media pool as well as onto the message, so
  // the user sees them in the pool and on the preview and the agent has
  // something real to edit.
  const attachFiles = (files: File[]): Promise<void> => useEditor.getState().attachMedia(files);

  const submit = async (): Promise<void> => {
    const prompt = text.trim();
    if (!prompt && attachments.length === 0) return;
    setText("");
    await send(prompt);
  };

  const ordered = sortModelsBySpeed(models);
  // The star marks the model the editor starts on: the fastest all-rounder.
  const defaultModel = pickDefaultModel(models);

  return (
    <div
      data-testid="chat-drop"
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void attachFiles([...event.dataTransfer.files]);
      }}
    >
      <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">এডিট এজেন্ট</span>
        <span className="chip !text-[9px]">{chat.length} মেসেজ</span>
        <div className="flex-1" />
        <select
          value={agentModel}
          onChange={(event) => setAgentModel(event.target.value)}
          className="max-w-[45%] rounded border border-border bg-panel-2 px-1 py-0.5 text-[10px] text-foreground outline-none"
          title="এজেন্ট মডেল"
        >
          {(ordered.length ? ordered : [{ id: agentModel, name: agentModel } as unknown as ZyraxonModel]).map((model) => (
            <option key={model.id} value={model.id} title={describeCapability(toCapability(model))}>
              {model.id === defaultModel ? "★ " : ""}
              {model.name} — {describeCapability(toCapability(model))}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {chat.length === 0 && (
          <div className="space-y-2 rounded-md border border-border bg-panel-2 p-2">
            <p className="text-[11px] font-medium text-foreground">কীভাবে শুরু করবেন</p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              শুধু ভিডিও দিন — বাকিটা এজেন্ট করবে। অথবা লিখুন: “এই ভিডিওগুলো দিয়ে ৩০ সেকেন্ডের একটা রিল বানাও, বিটে কাট,
              জুম ট্রানজিশন দাও, বাংলা ক্যাপশন বসাও।”
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                "এই ক্লিপগুলোর সিন-চেঞ্জে কাট দাও",
                "মিউজিকের বিটে কাট আর জুম দাও",
                "বাংলা ক্যাপশন বসাও",
                "সিনেমাটিক গ্রেড দাও",
                "একটা ইন্ট্রো টাইটেল বানাও",
              ].map((idea) => (
                <button
                  key={idea}
                  type="button"
                  className="chip hover:text-foreground"
                  onClick={() => setText(idea)}
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((entry) => (
          <ChatBubble key={entry.id} entry={entry} />
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {step ?? "চিন্তা করছে"}…
          </p>
        )}
      </div>

      <div className="border-t border-border p-2">
        {attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((attachment, index) => (
              <span key={`${attachment.name}-${index}`} className="chip !gap-1">
                {attachment.kind === "image" ? <ImageIcon className="h-3 w-3" /> : attachment.kind === "audio" ? <AudioIcon className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
                <span className="max-w-[120px] truncate">{attachment.name}</span>
                {attachment.kind === "audio" && attachment.spectrogram ? (
                  <img src={attachment.spectrogram} alt="" className="h-3 w-8 rounded-sm object-cover" />
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    useEditor.setState({
                      attachments: attachments.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button type="button" className="chip hover:text-foreground" onClick={clearAttachments}>
              <Trash2 className="h-3 w-3" /> সব সরান
            </button>
          </div>
        )}

        <div
          className={`flex items-end gap-1.5 rounded-md border bg-panel-2 p-1.5 transition-colors ${
            dragging ? "border-primary" : "border-border"
          }`}
        >
          <button
            type="button"
            className="btn-ghost h-7 w-7 shrink-0"
            title="ফাইল সংযুক্ত করুন"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileRef}
            id="agent-files"
            type="file"
            accept="video/*,audio/*,image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void attachFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className={`h-7 w-7 shrink-0 rounded-md transition-colors ${
              micRecording ? "bg-destructive text-destructive-foreground" : "btn-ghost"
            }`}
            title={micRecording ? "মাইক বন্ধ করুন" : "মাইক অন করুন — বললেই লেখা হবে"}
            onClick={() => (micRecording ? void stopMic() : void startMic())}
            style={micRecording ? { boxShadow: `0 0 0 ${Math.round(2 + micLevel * 12)}px oklch(0.62 0.22 25 / 0.18)` } : undefined}
          >
            {micRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
          <textarea
            id="agent-prompt"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder="কী বানাতে চান লিখুন… (Shift+Enter = নতুন লাইন)"
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <button type="button" className="btn-ghost h-7 w-7 shrink-0" title="থামান" onClick={stop}>
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="btn-accent h-7 w-7 shrink-0"
              title="পাঠান"
              onClick={() => void submit()}
              disabled={!text.trim() && attachments.length === 0}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          ফাইল ড্র্যাগ করুন, মাইক চেপে বলুন, বা লিখুন — সব একসাথে পাঠানো যায়।
        </p>
      </div>
    </div>
  );
}
