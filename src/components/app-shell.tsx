import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Plug,
  ShoppingBag,
  Sparkle,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n, type Lang } from "@/lib/i18n";

const nav = [
  { to: "/", key: "nav_dashboard", icon: LayoutDashboard },
  { to: "/channels", key: "nav_channels", icon: Plug },
  { to: "/agent", key: "nav_agent", icon: Boxes },
  { to: "/inbox", key: "nav_inbox", icon: Inbox },
  { to: "/sales", key: "nav_sales", icon: ShoppingBag },
  { to: "/pricing", key: "nav_pricing", icon: CreditCard },
] as const;

function LangToggle() {
  const { lang, setLang } = useI18n();
  const options: { id: Lang; label: string }[] = [
    { id: "en", label: "EN" },
    { id: "bn", label: "বাং" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setLang(o.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            lang === o.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[var(--gradient-aurora)] opacity-60" />
      <div className="relative mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar/70 px-4 py-6 backdrop-blur-xl lg:flex">
          <Link to="/" className="mb-8 flex items-center gap-3 px-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Sparkle className="size-5 text-primary-foreground" />
            </span>
            <span>
              <span className="block font-display text-base font-semibold leading-tight">
                {t("brand")}
              </span>
              <span className="block text-[11px] text-muted-foreground">{t("tagline")}</span>
            </span>
          </Link>

          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[var(--shadow-soft)]"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-xl border border-border/70 bg-card/70 p-4">
            <p className="text-xs text-muted-foreground">{t("demo_badge")}</p>
            <p className="mt-1 text-sm font-medium">{t("pr_sub")}</p>
            <Button asChild size="sm" className="mt-3 w-full">
              <Link to="/pricing">{t("nav_pricing")}</Link>
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--gradient-primary)]">
                <Sparkle className="size-4 text-primary-foreground" />
              </span>
              <span className="font-display text-sm font-semibold">{t("brand")}</span>
            </div>
            <Badge variant="outline" className="hidden border-border/70 text-muted-foreground lg:inline-flex">
              {t("demo_badge")}
            </Badge>
            <div className="flex items-center gap-2">
              <LangToggle />
            </div>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-border/70 px-3 py-2 lg:hidden">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
                  pathname === item.to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
