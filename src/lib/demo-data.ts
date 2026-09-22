import type { Lang } from "./i18n";

export type ChannelId = "messenger" | "instagram" | "whatsapp" | "telegram" | "webchat";

export const channels: {
  id: ChannelId;
  name: string;
  en: string;
  bn: string;
  accent: string;
  defaultConnected: boolean;
}[] = [
  {
    id: "messenger",
    name: "Facebook Messenger",
    en: "Reply to page messages and comments instantly.",
    bn: "পেজের মেসেজ ও কমেন্টে সঙ্গে সঙ্গে উত্তর দিন।",
    accent: "var(--channel-messenger)",
    defaultConnected: true,
  },
  {
    id: "instagram",
    name: "Instagram Direct",
    en: "Handle DMs, story replies and product questions.",
    bn: "ডিএম, স্টোরি রিপ্লাই ও প্রোডাক্টের প্রশ্ন সামলান।",
    accent: "var(--channel-instagram)",
    defaultConnected: true,
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    en: "Order confirmations and support on WhatsApp.",
    bn: "হোয়াটসঅ্যাপে অর্ডার নিশ্চিত ও সাপোর্ট।",
    accent: "var(--channel-whatsapp)",
    defaultConnected: false,
  },
  {
    id: "telegram",
    name: "Telegram",
    en: "Fast bot replies for your Telegram community.",
    bn: "টেলিগ্রাম কমিউনিটিতে দ্রুত বট রিপ্লাই।",
    accent: "var(--channel-telegram)",
    defaultConnected: false,
  },
  {
    id: "webchat",
    name: "Website Live Chat",
    en: "A lightweight chat widget for your website.",
    bn: "আপনার ওয়েবসাইটের জন্য হালকা চ্যাট উইজেট।",
    accent: "var(--channel-webchat)",
    defaultConnected: true,
  },
];

export const channelLabel = (id: ChannelId) =>
  channels.find((c) => c.id === id)?.name ?? id;

export const kpis = [
  { key: "kpi_convos", value: "1,284", delta: "+18%" },
  { key: "kpi_auto", value: "86%", delta: "+4%" },
  { key: "kpi_orders", value: "96", delta: "+11%" },
  { key: "kpi_revenue", value: "৳ 4,82,500", delta: "+23%" },
] as const;

export const channelVolume = [
  { channel: "Messenger", messages: 520 },
  { channel: "Instagram", messages: 340 },
  { channel: "WhatsApp", messages: 260 },
  { channel: "Telegram", messages: 96 },
  { channel: "Web chat", messages: 180 },
];

export const weekSales = [
  { day: "Sat", sales: 42000 },
  { day: "Sun", sales: 51000 },
  { day: "Mon", sales: 63000 },
  { day: "Tue", sales: 58000 },
  { day: "Wed", sales: 74000 },
  { day: "Thu", sales: 92000 },
  { day: "Fri", sales: 102500 },
];

export const activity: { channel: ChannelId; en: string; bn: string; time: string }[] = [
  {
    channel: "messenger",
    en: "Agent confirmed an order for 2× Cotton Panjabi.",
    bn: "এজেন্ট ২টি কটন পাঞ্জাবির অর্ডার নিশ্চিত করেছে।",
    time: "2m",
  },
  {
    channel: "instagram",
    en: "Answered a delivery-time question in Bangla.",
    bn: "বাংলায় ডেলিভারি সময়ের প্রশ্নের উত্তর দিয়েছে।",
    time: "9m",
  },
  {
    channel: "webchat",
    en: "Escalated a refund request to a human agent.",
    bn: "রিফান্ডের অনুরোধ মানুষের কাছে পাঠিয়েছে।",
    time: "21m",
  },
  {
    channel: "whatsapp",
    en: "Sent a payment link and captured the address.",
    bn: "পেমেন্ট লিংক পাঠিয়ে ঠিকানা নিয়েছে।",
    time: "46m",
  },
];

export type Conversation = {
  id: string;
  name: string;
  channel: ChannelId;
  unread: number;
  aiHandled: boolean;
  messages: { from: "customer" | "agent"; text: string; time: string }[];
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    name: "Rafiul Hasan",
    channel: "messenger",
    unread: 2,
    aiHandled: true,
    messages: [
      { from: "customer", text: "পাঞ্জাবির দাম কত?", time: "10:02" },
      {
        from: "agent",
        text: "Cotton Panjabi is ৳1,450. Sizes M, L, XL are in stock. Would you like to order?",
        time: "10:02",
      },
      { from: "customer", text: "L size লাগবে, ডেলিভারি কতদিন?", time: "10:04" },
    ],
  },
  {
    id: "c2",
    name: "Nusrat Jahan",
    channel: "instagram",
    unread: 0,
    aiHandled: true,
    messages: [
      { from: "customer", text: "Do you deliver outside Dhaka?", time: "09:40" },
      {
        from: "agent",
        text: "Yes — outside Dhaka takes 2–3 days, delivery charge ৳120.",
        time: "09:40",
      },
    ],
  },
  {
    id: "c3",
    name: "Tanvir Ahmed",
    channel: "whatsapp",
    unread: 1,
    aiHandled: false,
    messages: [
      { from: "customer", text: "I want to return my order, it was the wrong size.", time: "08:55" },
      {
        from: "agent",
        text: "I'm sorry about that. A team member will help you with the exchange shortly.",
        time: "08:56",
      },
    ],
  },
  {
    id: "c4",
    name: "Shanta Akter",
    channel: "webchat",
    unread: 0,
    aiHandled: true,
    messages: [
      { from: "customer", text: "Is cash on delivery available?", time: "08:10" },
      { from: "agent", text: "Yes, cash on delivery is available all over Bangladesh.", time: "08:10" },
    ],
  },
  {
    id: "c5",
    name: "Imran Kabir",
    channel: "telegram",
    unread: 0,
    aiHandled: true,
    messages: [
      { from: "customer", text: "New collection কখন আসবে?", time: "Yesterday" },
      { from: "agent", text: "নতুন কালেকশন আগামী বৃহস্পতিবার আসছে। চাইলে জানিয়ে দেব।", time: "Yesterday" },
    ],
  },
];

export const orders = [
  {
    id: "#10241",
    customer: "Rafiul Hasan",
    items: "2× Cotton Panjabi (L)",
    total: "৳ 2,900",
    status: "status_new",
    channel: "messenger" as ChannelId,
  },
  {
    id: "#10240",
    customer: "Nusrat Jahan",
    items: "1× Silk Saree",
    total: "৳ 3,650",
    status: "status_confirmed",
    channel: "instagram" as ChannelId,
  },
  {
    id: "#10239",
    customer: "Shanta Akter",
    items: "3× Kids T-shirt",
    total: "৳ 1,350",
    status: "status_shipped",
    channel: "webchat" as ChannelId,
  },
  {
    id: "#10238",
    customer: "Imran Kabir",
    items: "1× Leather Wallet",
    total: "৳ 1,100",
    status: "status_confirmed",
    channel: "telegram" as ChannelId,
  },
  {
    id: "#10237",
    customer: "Tanvir Ahmed",
    items: "2× Formal Shirt",
    total: "৳ 3,200",
    status: "status_new",
    channel: "whatsapp" as ChannelId,
  },
];

export const plans = [
  {
    id: "starter",
    name: "Starter",
    monthly: 19,
    yearly: 190,
    en: ["2 channels", "1,000 AI replies / month", "Unified inbox", "Email support"],
    bn: ["২টি চ্যানেল", "মাসে ১,০০০ AI রিপ্লাই", "ইউনিফাইড ইনবক্স", "ইমেইল সাপোর্ট"],
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 49,
    yearly: 490,
    en: [
      "All 5 channels",
      "10,000 AI replies / month",
      "Order capture & sales dashboard",
      "Bangla + English agent",
      "Priority support",
    ],
    bn: [
      "৫টি চ্যানেলই",
      "মাসে ১০,০০০ AI রিপ্লাই",
      "অর্ডার নেওয়া ও সেলস ড্যাশবোর্ড",
      "বাংলা + ইংরেজি এজেন্ট",
      "প্রায়োরিটি সাপোর্ট",
    ],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    monthly: 129,
    yearly: 1290,
    en: [
      "Unlimited AI replies",
      "5 team seats",
      "Custom agent rules & catalog sync",
      "Advanced sales reports",
      "Dedicated onboarding",
    ],
    bn: [
      "আনলিমিটেড AI রিপ্লাই",
      "৫টি টিম সিট",
      "কাস্টম নিয়ম ও ক্যাটালগ সিংক",
      "অ্যাডভান্সড সেলস রিপোর্ট",
      "ডেডিকেটেড অনবোর্ডিং",
    ],
    popular: false,
  },
];

const isBangla = (text: string) => /[\u0980-\u09FF]/.test(text);

export const suggestedPrompts: Record<Lang, string[]> = {
  en: ["What are your prices?", "How long is delivery?", "Do you accept cash on delivery?"],
  bn: ["দাম কত?", "ডেলিভারি কতদিন লাগে?", "ক্যাশ অন ডেলিভারি আছে?"],
};

/** Simple demo reply engine — keyword based, mirrors the customer's language. */
export function demoReply(input: string): string {
  const q = input.toLowerCase();
  const bn = isBangla(input);

  const rules: { match: RegExp; en: string; bn: string }[] = [
    {
      match: /price|cost|dam|দাম|কত টাকা|মূল্য/,
      en: "Cotton Panjabi ৳1,450 · Silk Saree ৳3,650 · Formal Shirt ৳1,600. Which one would you like?",
      bn: "কটন পাঞ্জাবি ৳১,৪৫০ · সিল্ক শাড়ি ৳৩,৬৫০ · ফরমাল শার্ট ৳১,৬০০। কোনটি নিতে চান?",
    },
    {
      match: /deliver|shipping|কতদিন|ডেলিভারি|পাঠা/,
      en: "Inside Dhaka 24 hours (৳60), outside Dhaka 2–3 days (৳120).",
      bn: "ঢাকার ভেতরে ২৪ ঘণ্টা (৳৬০), ঢাকার বাইরে ২–৩ দিন (৳১২০)।",
    },
    {
      match: /cash|cod|payment|bkash|পেমেন্ট|বিকাশ|ক্যাশ/,
      en: "We accept cash on delivery, bKash and card payments.",
      bn: "ক্যাশ অন ডেলিভারি, বিকাশ ও কার্ড — সবই নেওয়া হয়।",
    },
    {
      match: /size|stock|available|সাইজ|স্টক|আছে/,
      en: "Sizes M, L and XL are in stock right now. Shall I reserve one for you?",
      bn: "এখন M, L ও XL সাইজ স্টকে আছে। একটি রেখে দেব?",
    },
    {
      match: /return|refund|exchange|ফেরত|রিফান্ড|বদল/,
      en: "You can exchange within 7 days with the receipt. I'm connecting a human agent for the details.",
      bn: "রসিদসহ ৭ দিনের মধ্যে বদল করা যায়। বিস্তারিত জানাতে একজন এজেন্ট যুক্ত করছি।",
    },
    {
      match: /order|buy|নিতে চাই|অর্ডার|কিনব/,
      en: "Great! Please share your name, phone number and full address and I'll place the order.",
      bn: "দারুণ! আপনার নাম, ফোন নম্বর ও পূর্ণ ঠিকানা দিন — আমি অর্ডার করে দিচ্ছি।",
    },
    {
      match: /hi|hello|hey|assalam|সালাম|হ্যালো|হাই/,
      en: "Hello! Welcome to Nexa Store. How can I help you today?",
      bn: "হ্যালো! নেক্সা স্টোরে স্বাগতম। কীভাবে সাহায্য করতে পারি?",
    },
    {
      match: /time|open|hour|খোলা|সময়/,
      en: "Our team is online 10am–10pm, but I reply 24/7.",
      bn: "আমাদের টিম সকাল ১০টা–রাত ১০টা অনলাইনে থাকে, তবে আমি ২৪/৭ উত্তর দিই।",
    },
  ];

  const hit = rules.find((r) => r.match.test(q) || r.match.test(input));
  if (hit) return bn ? hit.bn : hit.en;

  return bn
    ? "আপনার প্রশ্নটি বুঝেছি। প্রোডাক্ট, দাম, ডেলিভারি বা অর্ডার নিয়ে জানতে চাইলে বলুন — আমি সাহায্য করব।"
    : "Got it. I can help with products, prices, delivery or placing an order — just let me know.";
}
