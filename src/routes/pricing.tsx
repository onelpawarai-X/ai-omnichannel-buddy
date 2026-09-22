import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { plans } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Plans & billing — Starter, Pro, Business" },
      {
        name: "description",
        content:
          "Compare Starter, Pro and Business subscription plans for multi-channel AI automation, unified inbox and sales tracking.",
      },
      { property: "og:title", content: "Plans & billing — Starter, Pro, Business" },
      {
        property: "og:description",
        content: "Pick the subscription that fits your inbox volume.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const { t, lang } = useI18n();
  const [yearly, setYearly] = useState(false);

  return (
    <div>
      <PageHeader title={t("pr_title")} subtitle={t("pr_sub")} />

      <div className="mb-8 inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1">
        {[false, true].map((v) => (
          <button
            key={String(v)}
            onClick={() => setYearly(v)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              yearly === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v ? t("pr_yearly") : t("pr_monthly")}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.id}
            className={cn(
              "relative overflow-hidden border-border/70 bg-card/80",
              p.popular && "border-primary shadow-[var(--shadow-elegant)]",
            )}
          >
            {p.popular && (
              <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: "var(--gradient-primary)" }} />
            )}
            <CardContent className="p-7">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                {p.popular && <Badge className="text-[11px]">{t("pr_popular")}</Badge>}
              </div>
              <p className="mt-5 font-display text-4xl font-semibold">
                ${yearly ? Math.round(p.yearly / 12) : p.monthly}
                <span className="text-sm font-normal text-muted-foreground">{t("pr_month")}</span>
              </p>
              <ul className="mt-6 space-y-3">
                {(lang === "bn" ? p.bn : p.en).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-7 w-full"
                variant={p.popular ? "default" : "outline"}
                size="lg"
                onClick={() => toast.info(t("pr_note"))}
              >
                {t("pr_choose")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">{t("pr_note")}</p>
    </div>
  );
}
