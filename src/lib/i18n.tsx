import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "bn";

type Dict = Record<string, { en: string; bn: string }>;

export const dict: Dict = {
  brand: { en: "Nexa Flow", bn: "নেক্সা ফ্লো" },
  tagline: {
    en: "All-in-one multi-channel AI automation",
    bn: "অল-ইন-ওয়ান মাল্টি-চ্যানেল AI অটোমেশন",
  },
  nav_dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  nav_channels: { en: "Channels", bn: "চ্যানেল" },
  nav_agent: { en: "Agent Training", bn: "এজেন্ট ট্রেনিং" },
  nav_inbox: { en: "Unified Inbox", bn: "ইউনিফাইড ইনবক্স" },
  nav_sales: { en: "Sales", bn: "সেলস" },
  nav_pricing: { en: "Plans & Billing", bn: "প্ল্যান ও বিলিং" },
  language: { en: "Language", bn: "ভাষা" },
  demo_badge: { en: "Demo data", bn: "ডেমো ডেটা" },

  dash_title: { en: "Overview", bn: "ওভারভিউ" },
  dash_sub: {
    en: "Your AI agent is handling conversations across every channel.",
    bn: "আপনার AI এজেন্ট সব চ্যানেলের কথাবার্তা সামলাচ্ছে।",
  },
  kpi_convos: { en: "Conversations today", bn: "আজকের কথাবার্তা" },
  kpi_auto: { en: "Auto-resolved", bn: "AI নিজেই সমাধান" },
  kpi_orders: { en: "Orders received", bn: "প্রাপ্ত অর্ডার" },
  kpi_revenue: { en: "Revenue this week", bn: "এই সপ্তাহের বিক্রি" },
  chart_title: { en: "Messages by channel", bn: "চ্যানেল অনুযায়ী মেসেজ" },
  activity: { en: "Recent activity", bn: "সাম্প্রতিক কার্যক্রম" },

  sim_title: { en: "Live agent simulator", bn: "লাইভ এজেন্ট সিমুলেটর" },
  sim_sub: {
    en: "Ask anything a customer might ask.",
    bn: "কাস্টমার যা জিজ্ঞেস করতে পারে, লিখে দেখুন।",
  },
  sim_placeholder: { en: "Type a customer message…", bn: "কাস্টমারের মেসেজ লিখুন…" },
  sim_send: { en: "Send", bn: "পাঠান" },
  sim_reset: { en: "Reset chat", bn: "চ্যাট রিসেট" },
  sim_typing: { en: "Agent is typing…", bn: "এজেন্ট লিখছে…" },
  sim_try: { en: "Try one of these", bn: "এগুলো চেষ্টা করুন" },

  ch_title: { en: "Channels", bn: "চ্যানেল" },
  ch_sub: {
    en: "Connect every place your customers message you.",
    bn: "কাস্টমাররা যেখানে মেসেজ করে, সব জায়গা যুক্ত করুন।",
  },
  ch_connect: { en: "Connect", bn: "কানেক্ট করুন" },
  ch_connected: { en: "Connected", bn: "কানেক্টেড" },
  ch_disconnect: { en: "Disconnect", bn: "বিচ্ছিন্ন করুন" },
  ch_pending: { en: "Connecting…", bn: "কানেক্ট হচ্ছে…" },
  ch_demo_note: {
    en: "Demo mode — buttons simulate a connection for now.",
    bn: "ডেমো মোড — বাটনগুলো আপাতত কানেকশন দেখায় মাত্র।",
  },

  ag_title: { en: "Agent training", bn: "এজেন্ট ট্রেনিং" },
  ag_sub: {
    en: "No code. Just describe your business and the agent learns.",
    bn: "কোড লাগবে না। ব্যবসার কথা লিখুন, এজেন্ট শিখে নেবে।",
  },
  ag_business: { en: "Business profile", bn: "ব্যবসার প্রোফাইল" },
  ag_name: { en: "Business name", bn: "ব্যবসার নাম" },
  ag_type: { en: "Business type", bn: "ব্যবসার ধরন" },
  ag_tone: { en: "Reply tone", bn: "রিপ্লাইয়ের ধরন" },
  ag_tone_friendly: { en: "Friendly", bn: "বন্ধুত্বপূর্ণ" },
  ag_tone_formal: { en: "Formal", bn: "আনুষ্ঠানিক" },
  ag_tone_short: { en: "Short & fast", bn: "সংক্ষিপ্ত ও দ্রুত" },
  ag_faq: { en: "FAQ", bn: "সাধারণ প্রশ্ন" },
  ag_products: { en: "Product catalog", bn: "প্রোডাক্ট ক্যাটালগ" },
  ag_rules: { en: "Rules & policies", bn: "নিয়মাবলী" },
  ag_add: { en: "Add", bn: "যোগ করুন" },
  ag_question: { en: "Question", bn: "প্রশ্ন" },
  ag_answer: { en: "Answer", bn: "উত্তর" },
  ag_product: { en: "Product", bn: "প্রোডাক্ট" },
  ag_price: { en: "Price", bn: "দাম" },
  ag_save: { en: "Save training", bn: "ট্রেনিং সেভ করুন" },
  ag_saved: { en: "Training saved for this browser.", bn: "ট্রেনিং এই ব্রাউজারে সেভ হয়েছে।" },
  remove: { en: "Remove", bn: "মুছুন" },

  in_title: { en: "Unified inbox", bn: "ইউনিফাইড ইনবক্স" },
  in_sub: {
    en: "Every channel, one conversation list.",
    bn: "সব চ্যানেল, একটাই কথাবার্তার তালিকা।",
  },
  in_all: { en: "All", bn: "সব" },
  in_reply: { en: "Write a reply…", bn: "রিপ্লাই লিখুন…" },
  in_ai_on: { en: "AI replying", bn: "AI রিপ্লাই দিচ্ছে" },

  sa_title: { en: "Sales", bn: "সেলস" },
  sa_sub: {
    en: "Orders your agent captured from chat.",
    bn: "চ্যাট থেকে এজেন্ট যেসব অর্ডার নিয়েছে।",
  },
  sa_order: { en: "Order", bn: "অর্ডার" },
  sa_customer: { en: "Customer", bn: "কাস্টমার" },
  sa_items: { en: "Items", bn: "পণ্য" },
  sa_total: { en: "Total", bn: "মোট" },
  sa_status: { en: "Status", bn: "অবস্থা" },
  sa_channel: { en: "Channel", bn: "চ্যানেল" },
  status_new: { en: "New", bn: "নতুন" },
  status_confirmed: { en: "Confirmed", bn: "নিশ্চিত" },
  status_shipped: { en: "Shipped", bn: "পাঠানো হয়েছে" },

  pr_title: { en: "Choose your plan", bn: "আপনার প্ল্যান বাছুন" },
  pr_sub: {
    en: "Start free, upgrade when your inbox grows.",
    bn: "ফ্রি শুরু করুন, ইনবক্স বড় হলে আপগ্রেড করুন।",
  },
  pr_monthly: { en: "Monthly", bn: "মাসিক" },
  pr_yearly: { en: "Yearly (2 months free)", bn: "বার্ষিক (২ মাস ফ্রি)" },
  pr_month: { en: "/month", bn: "/মাস" },
  pr_choose: { en: "Choose plan", bn: "প্ল্যান নিন" },
  pr_popular: { en: "Most popular", bn: "সবচেয়ে জনপ্রিয়" },
  pr_note: {
    en: "Checkout is not live yet in this demo.",
    bn: "এই ডেমোতে পেমেন্ট এখনো চালু নয়।",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof dict) => string };

const I18nContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => dict[k]?.en ?? String(k) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("nexa.lang");
    if (stored === "bn" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("nexa.lang", l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (k) => (dict[k] ? dict[k][lang] : String(k)) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
