/**
 * The user's requirement: the agent must reach the live shelves itself, not just
 * the panel. This drives the agent with a real clip and checks it calls
 * search_lottie / search_stock and lands a real clip on the timeline.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:12000";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));
await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3000);

// Seed a real clip so the agent has something to edit.
await page.fill('input[placeholder*="লিংক"]', BASE + "/api/renders/scene-video.mp4");
await page.click('button:has-text("আনো")');
await page.waitForTimeout(9000);
const seeded = await page.evaluate(() => {
  const st = window.__zyraxon.getState();
  return { media: st.timeline.media.length, clips: st.timeline.clips.length };
});
console.log("seeded:", JSON.stringify(seeded));

const run = async (prompt) => {
  const from = await page.evaluate(() => window.__zyraxon.getState().chat.length);
  await page.fill("textarea#agent-prompt", prompt);
  await page.click('button[title="পাঠান"]');
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(5000);
    if (!(await page.evaluate(() => window.__zyraxon.getState().agentBusy))) break;
  }
  return page.evaluate((start) => {
    const st = window.__zyraxon.getState();
    const entries = st.chat.slice(start);
    return {
      tools: entries.filter((e) => e.role === "tool").map((e) => e.toolName),
      said: entries.filter((e) => e.role === "assistant" && e.text).length,
      clips: st.timeline.clips.map((c) => c.kind),
      animations: st.animations.length,
      media: st.timeline.media.length,
    };
  }, from);
};

const a = await run("এই ভিডিওতে কনফেটি অ্যানিমেশন যোগ করো — LottieFiles থেকে খুঁজে নাও");
console.log("A tools:", JSON.stringify(a.tools));
console.log("A animations:", a.animations, "clips:", JSON.stringify(a.clips), "assistant msgs:", a.said);

const b = await run("ইফেক্ট লাইব্রেরি থেকে একটা ফায়ার ওভারলে যোগ করো");
console.log("B tools:", JSON.stringify(b.tools));
console.log("B clips:", JSON.stringify(b.clips), "media:", b.media);

console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await page.screenshot({ path: "/tmp/zb/ui-agent-shelves.png" });
await browser.close();
