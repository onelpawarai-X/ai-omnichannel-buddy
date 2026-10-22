import { chromium } from "playwright";

const V = "http://127.0.0.1:12000/api/renders/scene-video.mp4";
const A = "http://127.0.0.1:12000/api/renders/beats.m4a";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});

await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);

const run = async (prompt, label) => {
  const before = await page.evaluate(() => window.__zyraxon.getState().chat.length);
  await page.fill("textarea#agent-prompt", prompt);
  await page.click('button[title="পাঠান"]');
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(5000);
    if (!(await page.evaluate(() => window.__zyraxon.getState().agentBusy))) break;
  }
  const s = await page.evaluate((from) => {
    const st = window.__zyraxon.getState();
    return {
      media: st.timeline.media.map((m) => ({ name: m.name, kind: m.kind, dur: +m.duration.toFixed(2), beats: m.beats?.length ?? 0, spec: !!m.spectrogram })),
      clips: st.timeline.clips.map((c) => ({ kind: c.kind, start: +c.start.toFixed(2), dur: +c.duration.toFixed(2), fx: c.effects.join("+") || "-" })),
      tools: st.chat.slice(from).filter((c) => c.role === "tool").map((c) => `${c.toolName}${c.ok === false ? "!" : ""}`),
      said: st.chat.slice(from).filter((c) => c.role === "assistant").map((c) => c.text).join(" ").slice(-700),
    };
  }, before);
  console.log(`\n########## ${label} ##########`);
  console.log("tools:", s.tools.join(", "));
  console.log("media:", JSON.stringify(s.media));
  console.log("clips:", JSON.stringify(s.clips));
  console.log("said:", s.said.replace(/\n/g, " "));
};

// ---- TEST 2: a real beat track; cut on the spectrogram's pulses ----
await page.fill('input[placeholder*="লিংক"]', A);
await page.click('button:has-text("আনো")');
await page.waitForTimeout(6000);
await run(
  `এখন "beats.m4a" টা একটা ১২০ BPM বিট ট্র্যাক। স্পেকট্রোগ্রাম দেখে বলো কতগুলো পালস আছে, তারপর ওই বিটে ভিডিও ক্লিপটা কাটো আর প্রতিটা কাটে ভিন্ন ইফেক্ট দাও। অডিওটা A1 এ ০ থেকে রাখো। finish কল করো।`,
  "TEST 2 — beat-synced cuts read from the spectrogram",
);
await page.screenshot({ path: "/tmp/zb/shot-final-2.png" });

console.log("\nERRORS:", errors.slice(0, 5));
await browser.close();
