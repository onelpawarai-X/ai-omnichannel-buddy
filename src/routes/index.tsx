import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/app-shell";
import { ChatSimulator } from "@/components/chat-simulator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activity, channelVolume, channels, kpis, weekSales } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Nexa Flow AI automation" },
      {
        name: "description",
        content:
          "See conversations, auto-resolved chats, orders and revenue across all your messaging channels, and test your AI agent live.",
      },
      { property: "og:title", content: "Dashboard — Nexa Flow AI automation" },
      {
        property: "og:description",
        content: "Multi-channel AI conversations, orders and revenue at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, lang } = useI18n();

  return (
    <div>
      <PageHeader title={t("dash_title")} subtitle={t("dash_sub")} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.key} className="border-border/70 bg-card/80 shadow-[var(--shadow-soft)]">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">{t(k.key)}</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{k.value}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--success)]">
                    <ArrowUpRight className="size-3" />
                    {k.delta}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="font-display text-base">{t("chart_title")}</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelVolume}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="channel" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="messages" radius={[8, 8, 0, 0]} fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="font-display text-base">{t("kpi_revenue")}</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekSales}>
                    <defs>
                      <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#sales)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("activity")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activity.map((a, i) => {
                const ch = channels.find((c) => c.id === a.channel);
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ background: ch?.accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{lang === "bn" ? a.bn : a.en}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ch?.name}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      {a.time}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <ChatSimulator className="xl:sticky xl:top-24 xl:self-start" />
      </div>
    </div>
  );
}
