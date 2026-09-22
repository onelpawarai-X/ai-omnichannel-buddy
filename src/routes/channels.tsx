import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { channels, type ChannelId } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/channels")({
  head: () => ({
    meta: [
      { title: "Channels — connect Messenger, WhatsApp & more" },
      {
        name: "description",
        content:
          "One-click cards to connect Facebook Messenger, Instagram Direct, WhatsApp Business, Telegram and a website live chat widget.",
      },
      { property: "og:title", content: "Channels — connect Messenger, WhatsApp & more" },
      {
        property: "og:description",
        content: "Connect every place your customers message you, in one place.",
      },
    ],
  }),
  component: Channels,
});

type State = "connected" | "idle" | "pending";

function Channels() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<Record<ChannelId, State>>(
    () =>
      Object.fromEntries(
        channels.map((c) => [c.id, c.defaultConnected ? "connected" : "idle"]),
      ) as Record<ChannelId, State>,
  );

  const connect = (id: ChannelId, name: string) => {
    setState((s) => ({ ...s, [id]: "pending" }));
    window.setTimeout(() => {
      setState((s) => ({ ...s, [id]: "connected" }));
      toast.success(`${name} ${lang === "bn" ? "কানেক্টেড (ডেমো)" : "connected (demo)"}`);
    }, 1100);
  };

  return (
    <div>
      <PageHeader title={t("ch_title")} subtitle={t("ch_sub")} />
      <p className="mb-6 inline-flex rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
        {t("ch_demo_note")}
      </p>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {channels.map((c) => {
          const st = state[c.id];
          return (
            <Card
              key={c.id}
              className="group relative overflow-hidden border-border/70 bg-card/80 transition-shadow hover:shadow-[var(--shadow-elegant)]"
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: c.accent }}
                aria-hidden
              />
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="flex size-11 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in oklab, ${c.accent} 18%, transparent)` }}
                  >
                    <MessageCircle className="size-5" style={{ color: c.accent }} />
                  </span>
                  {st === "connected" && (
                    <Badge
                      className="gap-1 border-0 text-[11px]"
                      style={{
                        background: "color-mix(in oklab, var(--success) 18%, transparent)",
                        color: "var(--success)",
                      }}
                    >
                      <Check className="size-3" />
                      {t("ch_connected")}
                    </Badge>
                  )}
                </div>

                <h3 className="mt-4 font-display text-base font-semibold">{c.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{lang === "bn" ? c.bn : c.en}</p>

                <div className="mt-5">
                  {st === "connected" ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setState((s) => ({ ...s, [c.id]: "idle" }))}
                    >
                      {t("ch_disconnect")}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={st === "pending"}
                      onClick={() => connect(c.id, c.name)}
                    >
                      {st === "pending" && <Loader2 className="size-4 animate-spin" />}
                      {st === "pending" ? t("ch_pending") : t("ch_connect")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
