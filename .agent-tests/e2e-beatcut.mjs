import { chromium } from "playwright";
const A = "http://127.0.0.1:12000/api/renders/beats.m4a";
const V = "http://127.0.0.1:12000/api/renders/scene-video.mp4";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
for (const url of [V, A]) {
  await page.fill('input[placeholder*="লিংক"]', url);
  await page.click('button:has-text("আনো")');
  await page.waitForTimeout(6000);
}
console.log("MEDIA:", JSON.stringify(await page.evaluate(() => window.__zyraxon.getState().timeline.media.map((m) => ({ n: m.name, k: m.kind, beats: m.beats?.length ?? 0, spec: !!m.spectrogram })))));

await page.fill("textarea#agent-prompt", `অডিও "beats.m4a" টা একটা বিট ট্র্যাক। স্পেকট্রোগ্রাম আর বিট গ্রিড দেখে বলো কত সেকেন্ড পরপর পালস আছে, কতগুলো পালস আছে।
তারপর video "scene-video.mp4" এর টাইমলাইন ক্লিপটাকে অডিওর প্রতিটা বিটে কাটো, আর প্রতি কাটে একটা করে ভিন্ন ইফেক্ট বসাও। অডিওটা A1 এ ০ থেকে রাখো। শেষে finish কল করো এবং স্পেকট্রোগ্রাম থেকে কী বুঝলে সেটা বাংলায় লেখো।`);
await page.click('button[title="পাঠান"]');
console.log("agent running…");
let last = null;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(5000);
  last = await page.evaluate(() => {
    const s = window.__zyraxon.getState();
    return { busy: s.agentBusy, tools: s.chat.filter((c) => c.role === "tool").map((c) => c.toolName) };
  });
  if (!last.busy) break;
}
const final = await page.evaluate(() => {
  const s = window.__zyraxon.getState();
  return {
    clips: s.timeline.clips.map((c) => ({ kind: c.kind, start: +c.start.toFixed(2), dur: +c.duration.toFixed(2), fx: c.effects.join("+") })),
    assistant: s.chat.filter((c) => c.role === "assistant").map((c) => c.text).join("\n---\n").slice(-2500),
  };
});
console.log("TOOLS:", last.tools.join(", "));
console.log("CLIPS:", JSON.stringify(final.clips, null, 1));
console.log("AGENT SAID:\n", final.assistant);
console.log("ERRORS:", errors);
await page.screenshot({ path: "/tmp/zb/shot-05-beatcut.png" });
await browser.close();
