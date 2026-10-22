import { chromium } from "playwright";

const URL_MEDIA = "http://127.0.0.1:12000/api/renders/scene-video.mp4";
const URL_AUDIO = "http://127.0.0.1:12000/api/renders/beat-tone.m4a";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));

await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2000);

const state = () => page.evaluate(() => {
  const s = window.__zyraxon?.getState?.();
  if (!s) return null;
  return {
    media: s.timeline.media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: +m.duration.toFixed(2), frames: m.frames?.length ?? 0, beats: m.beats?.length ?? 0, thumb: !!m.thumb })),
    clips: s.timeline.clips.map((c) => ({ id: c.id, kind: c.kind, label: c.label, start: +c.start.toFixed(2), duration: +c.duration.toFixed(2), effects: c.effects.length, trackId: c.trackId })),
    tracks: s.timeline.tracks.map((t) => ({ id: t.id, kind: t.kind, name: t.name })),
    animations: s.animations.length,
  };
});

console.log("exposed store:", await page.evaluate(() => !!window.__zyraxon));

// 1. add video by URL
await page.fill('input[placeholder*="লিংক"]', URL_MEDIA);
await page.click('button:has-text("আনো")');
await page.waitForTimeout(6000);
console.log("after video add:", JSON.stringify(await state(), null, 1));

// 2. add audio by URL
await page.fill('input[placeholder*="লিংক"]', URL_AUDIO);
await page.click('button:has-text("আনো")');
await page.waitForTimeout(4000);
console.log("after audio add:", JSON.stringify(await state(), null, 1));

await page.screenshot({ path: "/tmp/zb/shot-02-media.png" });
console.log("errors:", errors);
await browser.close();
