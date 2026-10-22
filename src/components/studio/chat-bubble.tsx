/**
 * One message in the agent log. Tool entries collapse to a single line, user
 * messages show their attachments, and assistant prose keeps its line breaks.
 */
import { Check, Image as ImageIcon, Video as VideoIcon, X } from "lucide-react";

import type { ChatEntry } from "@/lib/editor-store";

export function ChatBubble({ entry }: { entry: ChatEntry }): React.ReactElement {
  if (entry.role === "tool") {
    return (
      <div className="flex items-center gap-1.5 rounded border border-border/60 bg-panel-2 px-1.5 py-1 text-[10px]">
        {entry.ok ? <Check className="h-3 w-3 text-primary" /> : <X className="h-3 w-3 text-destructive" />}
        <span className="font-mono text-muted-foreground">{entry.toolName}</span>
        <span className="truncate text-muted-foreground">{entry.text}</span>
      </div>
    );
  }

  if (entry.role === "system") {
    return (
      <p className="rounded border border-dashed border-border px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
        {entry.text}
      </p>
    );
  }

  if (entry.role === "error") {
    return (
      <p className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
        {entry.text}
      </p>
    );
  }

  const isUser = entry.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] space-y-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
          isUser ? "bg-primary/15 text-foreground" : "bg-panel-2 text-foreground"
        }`}
      >
        {entry.attachments?.length ? (
          <div className="flex flex-wrap gap-1">
            {entry.attachments.map((attachment, index) => (
              <span key={index} className="chip !gap-1">
                {attachment.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
                <span className="max-w-[140px] truncate">{attachment.name}</span>
              </span>
            ))}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{entry.text}</p>
      </div>
    </div>
  );
}
