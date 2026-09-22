import { RotateCcw, Send, Sparkle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { demoReply, suggestedPrompts } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";

type Msg = { from: "customer" | "agent"; text: string };

export function ChatSimulator({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const greeting =
    lang === "bn"
      ? "হ্যালো! আমি আপনার AI এজেন্ট। প্রোডাক্ট, দাম বা ডেলিভারি নিয়ে যা খুশি জিজ্ঞেস করুন।"
      : "Hi! I'm your AI agent. Ask me about products, prices or delivery.";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((m) => [...m, { from: "customer", text: clean }]);
    setValue("");
    setTyping(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, { from: "agent", text: demoReply(clean) }]);
      setTyping(false);
      inputRef.current?.focus();
    }, 700);
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/80 shadow-[var(--shadow-elegant)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4" style={{ backgroundColor: "var(--primary)", backgroundImage: "var(--gradient-primary)" }}>
        <span className="flex size-9 items-center justify-center rounded-full bg-background/20">
          <Sparkle className="size-4 text-primary-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary-foreground">{t("sim_title")}</p>
          <p className="truncate text-[11px] text-primary-foreground/80">{t("sim_sub")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("sim_reset")}
          onClick={() => setMessages([])}
          className="text-primary-foreground hover:bg-background/20"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" style={{ minHeight: 320 }}>
        <Bubble from="agent">{greeting}</Bubble>
        {messages.map((m, i) => (
          <Bubble key={i} from={m.from}>
            {m.text}
          </Bubble>
        ))}
        {typing && <p className="px-1 text-xs text-muted-foreground">{t("sim_typing")}</p>}
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("sim_try")}
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestedPrompts[lang].map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(value);
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("sim_placeholder")}
            className="h-11 rounded-full bg-background/70"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" aria-label={t("sim_send")}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: "customer" | "agent"; children: React.ReactNode }) {
  const isCustomer = from === "customer";
  return (
    <div className={cn("flex", isCustomer ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isCustomer
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
