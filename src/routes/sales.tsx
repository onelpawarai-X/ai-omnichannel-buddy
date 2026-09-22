import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { channels, kpis, orders } from "@/lib/demo-data";
import { useI18n, type dict } from "@/lib/i18n";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales — orders captured from chat" },
      {
        name: "description",
        content:
          "Track orders your AI agent captured across Messenger, Instagram, WhatsApp, Telegram and website chat, with revenue summaries.",
      },
      { property: "og:title", content: "Sales — orders captured from chat" },
      {
        property: "og:description",
        content: "Every chat order and its status in one sales view.",
      },
    ],
  }),
  component: Sales,
});

const statusTone: Record<string, string> = {
  status_new: "var(--primary)",
  status_confirmed: "var(--success)",
  status_shipped: "var(--channel-telegram)",
};

function Sales() {
  const { t } = useI18n();

  return (
    <div>
      <PageHeader title={t("sa_title")} subtitle={t("sa_sub")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.key} className="border-border/70 bg-card/80">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground">{t(k.key)}</p>
              <p className="mt-2 font-display text-2xl font-semibold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/80">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sa_order")}</TableHead>
                <TableHead>{t("sa_customer")}</TableHead>
                <TableHead>{t("sa_items")}</TableHead>
                <TableHead>{t("sa_channel")}</TableHead>
                <TableHead>{t("sa_status")}</TableHead>
                <TableHead className="text-right">{t("sa_total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const ch = channels.find((c) => c.id === o.channel);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.id}</TableCell>
                    <TableCell>{o.customer}</TableCell>
                    <TableCell className="text-muted-foreground">{o.items}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: ch?.accent }}
                        />
                        {ch?.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="border-0 text-[11px]"
                        style={{
                          background: `color-mix(in oklab, ${statusTone[o.status]} 18%, transparent)`,
                          color: statusTone[o.status],
                        }}
                      >
                        {t(o.status as keyof typeof dict)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{o.total}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
