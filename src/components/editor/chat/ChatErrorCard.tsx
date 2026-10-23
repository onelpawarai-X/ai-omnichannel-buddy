import type { JSX } from "react";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { CircleAlert, X } from "@/icons/lucide-compat";

export type ChatErrorAction = "ai-editor" | "new-chat" | null;

export interface ChatErrorPresentation {
  readonly title: string;
  readonly message: string;
  readonly action: ChatErrorAction;
  readonly actionLabel?: string;
  readonly details?: string;
}

function messageFromPayload(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || value === null) return null;
  const payload = value as Record<string, unknown>;
  return (
    messageFromPayload(payload.message) ??
    messageFromPayload(payload.detail) ??
    messageFromPayload(payload.error)
  );
}

function extractUpstreamMessage(raw: string): string | null {
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    return messageFromPayload(JSON.parse(raw.slice(jsonStart)));
  } catch {
    return null;
  }
}

export function formatChatError(rawError: string): ChatErrorPresentation {
  const raw = rawError.trim() || "The AI request failed.";
  const upstream = extractUpstreamMessage(raw);
  const status = Number(raw.match(/\b([45]\d{2})\b/)?.[1] ?? 0);
  const searchable = `${raw} ${upstream ?? ""}`.toLowerCase();
  const details = upstream && upstream !== raw ? raw : undefined;

  if (
    status === 401 ||
    status === 403 ||
    /unauthori[sz]ed|forbidden|invalid api key|authentication|incorrect api key/.test(
      searchable,
    )
  ) {
    return {
      title: "গেটওয়ে অনুরোধটি গ্রহণ করেনি",
      message:
        upstream ??
        "চ্যাট বক্স থেকে অন্য মডেল বেছে নিয়ে আবার চেষ্টা করুন।",
      action: "ai-editor",
      actionLabel: "মডেল বাছুন",
      details,
    };
  }

  if (status === 429 || /rate limit|too many requests|quota/.test(searchable)) {
    return {
      title: "অনুরোধের সীমা শেষ",
      message:
        upstream ??
        "গেটওয়েতে এখন অনেক অনুরোধ যাচ্ছে। একটু পরে আবার চেষ্টা করুন।",
      action: null,
      details,
    };
  }

  if (
    /cors|failed to fetch|network error|could not reach|যোগাযোগ করা যায়নি|connection refused|load failed/.test(
      searchable,
    )
  ) {
    return {
      title: "গেটওয়ের সাথে যোগাযোগ করা যায়নি",
      message:
        "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন। সম্পাদনার অনুরোধ আমাদের নিজের সার্ভার হয়ে গেটওয়েতে যায়, তাই এটি সাধারণত সংযোগের সমস্যা।",
      action: null,
      details: raw,
    };
  }

  if (
    /context length|context window|maximum context|prompt is too long|token limit/.test(
      searchable,
    )
  ) {
    return {
      title: "আলাপ অনেক লম্বা হয়ে গেছে",
      message:
        upstream ??
        "এই মডেলটি পুরো আলাপ ধরতে পারছে না। নতুন চ্যাট শুরু করে সেখানে চালিয়ে যান।",
      action: "new-chat",
      actionLabel: "নতুন চ্যাট",
      details,
    };
  }

  if (status === 404 || /model.+not found|unknown model|does not exist/.test(searchable)) {
    return {
      title: "মডেল বা রুট পাওয়া যায়নি",
      message: upstream ?? "চ্যাট বক্স থেকে অন্য মডেল বেছে নিন।",
      action: "ai-editor",
      actionLabel: "মডেল বাছুন",
      details,
    };
  }

  if (
    /api format|model id|base url|api key|compatible api|endpoint url|secure storage|unlock/.test(
      searchable,
    )
  ) {
    return {
      title: "মডেল বাছাই দরকার",
      message: upstream ?? raw,
      action: "ai-editor",
      actionLabel: "মডেল বাছুন",
      details,
    };
  }

  return {
    title: "এআই অনুরোধ ব্যর্থ হয়েছে",
    message: upstream ?? raw,
    action: null,
    details,
  };
}

export function ChatErrorCard({
  error,
  onDismiss,
  onOpenSettings,
  onNewChat,
}: {
  readonly error: string;
  readonly onDismiss: () => void;
  readonly onOpenSettings: (tab: "ai-editor") => void;
  readonly onNewChat: () => void;
}): JSX.Element {
  const presentation = formatChatError(error);

  return (
    <div
      role="alert"
      className="rounded-xl border border-status-error/35 bg-bg-1 p-3 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-error/10 text-status-error">
          <CircleAlert size={15} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-fg">
            {presentation.title}
          </div>
          <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fg-2">
            {presentation.message}
          </div>
        </div>
        <IconButton
          label="Dismiss error"
          icon={<X size={13} aria-hidden />}
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="-mr-1 -mt-1 shrink-0 text-fg-muted transition-colors hover:text-fg"
        />
      </div>

      {presentation.details && (
        <details className="group mt-2 rounded-lg bg-bg-2/70 px-2.5 py-2">
          <summary className="cursor-pointer select-none text-[10px] font-medium text-fg-muted hover:text-fg-2">
            Technical details
          </summary>
          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-fg-muted">
            {presentation.details}
          </pre>
        </details>
      )}

      {presentation.action && (
        <Button
          label={presentation.actionLabel ?? "Fix issue"}
          variant="secondary"
          size="sm"
          onClick={() => {
            const action = presentation.action;
            if (action === "new-chat") onNewChat();
            else if (action) onOpenSettings(action);
          }}
          className="mt-2.5 w-full"
        />
      )}
    </div>
  );
}
