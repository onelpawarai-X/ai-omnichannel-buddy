import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { ChatSimulator } from "@/components/chat-simulator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent training — teach your AI in plain words" },
      {
        name: "description",
        content:
          "A no-code interface to describe your business type, FAQ, product catalog and policies so the AI agent answers customers correctly.",
      },
      { property: "og:title", content: "Agent training — teach your AI in plain words" },
      {
        property: "og:description",
        content: "No code needed: write your FAQ, catalog and rules and test the agent instantly.",
      },
    ],
  }),
  component: AgentTraining,
});

type Faq = { q: string; a: string };
type Product = { name: string; price: string };

const STORAGE_KEY = "nexa.training";

function AgentTraining() {
  const { t } = useI18n();
  const [name, setName] = useState("Nexa Store");
  const [type, setType] = useState("Fashion & clothing");
  const [tone, setTone] = useState("friendly");
  const [rules, setRules] = useState(
    "Always greet politely. Never promise same-day delivery outside Dhaka. Escalate refunds to a human agent.",
  );
  const [faqs, setFaqs] = useState<Faq[]>([
    { q: "Do you deliver outside Dhaka?", a: "Yes, 2–3 days, ৳120 delivery charge." },
    { q: "ক্যাশ অন ডেলিভারি আছে?", a: "হ্যাঁ, সারা বাংলাদেশে ক্যাশ অন ডেলিভারি আছে।" },
  ]);
  const [products, setProducts] = useState<Product[]>([
    { name: "Cotton Panjabi", price: "৳1,450" },
    { name: "Silk Saree", price: "৳3,650" },
  ]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.name) setName(d.name);
      if (d.type) setType(d.type);
      if (d.tone) setTone(d.tone);
      if (d.rules) setRules(d.rules);
      if (Array.isArray(d.faqs)) setFaqs(d.faqs);
      if (Array.isArray(d.products)) setProducts(d.products);
    } catch {
      /* ignore malformed demo data */
    }
  }, []);

  const save = () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name, type, tone, rules, faqs, products }),
    );
    toast.success(t("ag_saved"));
  };

  return (
    <div>
      <PageHeader title={t("ag_title")} subtitle={t("ag_sub")} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("ag_business")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("ag_name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("ag_type")}</Label>
                <Input value={type} onChange={(e) => setType(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("ag_tone")}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t("ag_tone_friendly")}</SelectItem>
                    <SelectItem value="formal">{t("ag_tone_formal")}</SelectItem>
                    <SelectItem value="short">{t("ag_tone_short")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("ag_faq")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {faqs.map((f, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={f.q}
                    placeholder={t("ag_question")}
                    onChange={(e) =>
                      setFaqs((s) => s.map((x, j) => (i === j ? { ...x, q: e.target.value } : x)))
                    }
                  />
                  <Input
                    value={f.a}
                    placeholder={t("ag_answer")}
                    onChange={(e) =>
                      setFaqs((s) => s.map((x, j) => (i === j ? { ...x, a: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove")}
                    onClick={() => setFaqs((s) => s.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFaqs((s) => [...s, { q: "", a: "" }])}
              >
                <Plus className="size-4" />
                {t("ag_add")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("ag_products")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <Input
                    value={p.name}
                    placeholder={t("ag_product")}
                    onChange={(e) =>
                      setProducts((s) =>
                        s.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    value={p.price}
                    placeholder={t("ag_price")}
                    onChange={(e) =>
                      setProducts((s) =>
                        s.map((x, j) => (i === j ? { ...x, price: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove")}
                    onClick={() => setProducts((s) => s.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProducts((s) => [...s, { name: "", price: "" }])}
              >
                <Plus className="size-4" />
                {t("ag_add")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-base">{t("ag_rules")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
            </CardContent>
          </Card>

          <Button onClick={save} size="lg">
            {t("ag_save")}
          </Button>
        </div>

        <ChatSimulator className="xl:sticky xl:top-24 xl:self-start" />
      </div>
    </div>
  );
}
