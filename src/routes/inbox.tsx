import { createFileRoute } from "@tanstack/react-router";
import { Send, Sparkle } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  channels,
  conversations as demoConversations,
  demoReply,
  type ChannelId,
  type Conversation,
} from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Unified inbox — every channel in one place" },
      {
        name: "description",
        content:
          "Read and reply to Messenger, Instagram, WhatsApp, Telegram and website chat conversations from a single shared inbox.",
      },
      { property: "og:title", content: "Unified inbox — every channel in one place" },
      {
        property: "og:description",
        content: "All customer conversations from every channel in one list.",
      },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const { t } = useI18n();
  const [list, setList] = useState<Conversation[]>(demoConversations);
  const [activeId, setActiveId] = useState(demoConversations[0].id);
  const [filter, setFilter] = useState<ChannelId | "all">("all");
  const [draft, setDraft] = useState("");

  const filtered = useMemo(
    () => (filter === "all" ? list : list.filter((c) => c.channel === filter)),
    [list, filter],
  );
  const active = list.find((c) => c.id === activeId) ?? filtered[0] ?? list[0];

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setList((s) =>
      s.map((c) =>
        c.id === active.id
          ? { ...c, unread: 0, messages: [...c.messages, { from: "agent", text, time: "now" }] }
          : c,
      ),
    );
  };

  const aiSuggest = () => {
    const last = [...active.messages].reverse().find((m) => m.from === "customer");
    setDraft(demoReply(last?.text ?? "hello"));
  };

  return (
    <div>
      <PageHeader title={t("in_title")} subtitle={t("in_sub")} />

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          {t("in_all")}
        </FilterChip>
        {channels.map((c) => (
          <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
            <span className="size-2 rounded-full" style={{ background: c.accent }} />
            {c.name}
          </FilterChip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto border-border/70 bg-card/80 p-2">
          {filtered.map((c) => {
            const ch = channels.find((x) => x.id === c.channel);
            const last = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setList((s) => s.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
                }}
                className={cn(
                  "w-full rounded-xl px-3 py-3 text-left transition-colors",
                  active?.id === c.id ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: ch?.accent }} />
                  <span className="truncate text-sm font-semibold">{c.name}</span>
                  {c.unread > 0 && (
                    <Badge className="ml-auto h-5 px-1.5 text-[10px]">{c.unread}</Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{last.text}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">{ch?.name}</p>
              </button>
            );
          })}
        </Card>

        <Card className="flex max-h-[70vh] flex-col border-border/70 bg-card/80">
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold">{active?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {channels.find((c) => c.id === active?.channel)?.name}
              </p>
            </div>
            {active?.aiHandled && (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Sparkle className="size-3" />
                {t("in_ai_on")}
              </Badge>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {active?.messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.from === "agent" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                    m.from === "agent"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted",
                  )}
                >
                  {m.text}
                  <span
                    className={cn(
                      "mt-1 block text-[10px]",
                      m.from === "agent" ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {m.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border/70 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Button type="button" variant="outline" size="icon" onClick={aiSuggest} aria-label="AI">
              <Sparkle className="size-4" />
            </Button>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("in_reply")}
              className="h-10"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0" aria-label={t("sim_send")}>
              <Send className="size-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
