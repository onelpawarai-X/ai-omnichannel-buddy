import type { JSX } from "react";
import { useState, useCallback, useRef, type KeyboardEvent, type ClipboardEvent, type DragEvent } from "react";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { ToolcraftTextAreaControl } from "@openreel/ui";
import { Send, Square, Mic, Plus, X, Loader2, Paperclip } from "@/icons/lucide-compat";
import { useChatStore } from "../../../stores/chat-store";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { modalitiesFor, providerPreset, type AIModality } from "../../../stores/ai-provider-catalog";
import { useDictation } from "../../../hooks/useDictation";
import {
  classifyFile,
  filesFromDataTransfer,
  splitDataUrl,
  stageFiles,
  type PendingAttachment,
} from "../../../services/agent/attachments";
import type { LoopUserAttachment } from "@openreel/agent";

const KIND_LABEL: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
};

export function ChatComposer(): JSX.Element {
  const status = useChatStore((s) => s.status);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const provider = useAIConnectionStore((s) => s.provider);
  const model = useAIConnectionStore((s) => s.model);

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = status === "running" || status === "awaiting_confirm";

  const allowed = modalitiesFor(provider, model);

  const appendTranscript = useCallback((chunk: string) => {
    setText((current) => (current ? `${current} ${chunk}` : chunk));
  }, []);
  const dictation = useDictation(appendTranscript);

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      if (!files.length) return;
      setReading(true);
      try {
        const kindOf = (file: File): AIModality | null => classifyFile(file);
        const accepted = files.filter((file) => {
          const kind = kindOf(file);
          return kind !== null && allowed.includes(kind);
        });
        const rejected = files.filter((file) => {
          const kind = kindOf(file);
          return kind === null || !allowed.includes(kind);
        });
        const { staged, rejected: unreadable } = await stageFiles(accepted);
        const problems = [...rejected, ...unreadable];
        if (problems.length) {
          const names = problems.map((f) => (typeof f === "string" ? f : f.name)).join(", ");
          const label = providerPreset(provider).label;
          setNotice(
            `${label} · ${model || "this model"} cannot read: ${names}. Allowed: ${allowed.join(", ")}.`,
          );
        } else {
          setNotice(null);
        }
        if (staged.length) {
          setAttachments((current) => [...current, ...staged]);
        }
      } finally {
        setReading(false);
      }
    },
    [allowed, model, provider],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }, []);

  const submit = useCallback(() => {
    const value = text.trim();
    if ((!value && !attachments.length) || busy) return;
    const payload: LoopUserAttachment[] = attachments.map((item) => {
      const { mediaType, data } = splitDataUrl(item.dataUrl);
      return { kind: item.kind as LoopUserAttachment["kind"], mediaType, data, name: item.file.name };
    });
    setText("");
    setAttachments([]);
    setNotice(null);
    void send(value, payload);
  }, [text, attachments, busy, send]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const files = filesFromDataTransfer(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const files = filesFromDataTransfer(e.dataTransfer);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !busy;

  return (
    <div
      className={`border-t border-border p-2 transition-colors ${dragging ? "bg-accent/5" : ""}`}
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="chat-composer"
    >
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {attachments.map((item) => (
            <span
              key={item.id}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-bg-2 px-2 py-1 text-[10px] text-fg-2"
            >
              {item.kind === "image" ? (
                <img src={item.dataUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
              ) : (
                <Paperclip size={11} aria-hidden />
              )}
              <span className="truncate" title={item.file.name}>
                <span className="text-fg-muted">{KIND_LABEL[item.kind] ?? item.kind} · </span>
                {item.file.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.file.name}`}
                onClick={() => removeAttachment(item.id)}
                className="grid h-4 w-4 place-items-center rounded text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {(notice || dictation.error) && (
        <p role="status" className="mb-1.5 px-1 text-[10px] leading-relaxed text-status-error">
          {notice ?? dictation.error}
        </p>
      )}

      <div className="relative rounded-lg border border-border bg-bg-2 transition-colors focus-within:border-accent">
        <ToolcraftTextAreaControl
          label="AI edit request"
          isLabelHidden
          value={text}
          onChange={setText}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={dictation.listening ? "Listening… speak now" : "Ask the AI to edit your video…"}
          inputClassName="block w-full resize-none bg-transparent px-3 py-2 pr-24 text-[13px] text-fg outline-none placeholder:text-fg-muted"
        />
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          <IconButton
            label={reading ? "Reading files" : "Attach video, audio or image"}
            icon={reading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />}
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            isDisabled={busy || reading}
            className="grid h-7 w-7 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
          />
          <IconButton
            label={dictation.listening ? "Stop dictation" : "Dictate with the microphone"}
            icon={<Mic size={13} className={dictation.listening ? "text-status-error" : ""} aria-hidden />}
            size="sm"
            variant={dictation.listening ? "destructive" : "ghost"}
            onClick={dictation.toggle}
            isDisabled={busy || !dictation.supported}
            aria-pressed={dictation.listening}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors disabled:opacity-40 ${dictation.listening ? "animate-pulse bg-status-error/15 text-status-error" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
          />
          {busy ? (
            <IconButton
              label="Stop"
              icon={<Square size={12} className="fill-current" aria-hidden />}
              size="sm"
              variant="destructive"
              onClick={stop}
              className="grid h-7 w-7 place-items-center rounded-md bg-status-error/15 text-status-error transition-colors hover:bg-status-error/25"
            />
          ) : (
            <IconButton
              label="Send"
              icon={<Send size={12} aria-hidden />}
              size="sm"
              variant="primary"
              onClick={submit}
              isDisabled={!canSend}
              className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-40"
            />
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        aria-label="Attach files"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />

      <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[10px] text-fg-muted">
        <span>Enter to send · Shift+Enter for a new line</span>
        <span className="truncate" title={allowed.join(", ")}>
          {model ? `${model} · ${allowed.join("/")}` : "Pick a model in Settings"}
        </span>
      </div>
    </div>
  );
}
