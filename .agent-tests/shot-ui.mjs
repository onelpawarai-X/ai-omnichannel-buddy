import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(3000);
// put something on the stage so the layout is shown populated
await p.fill('input[placeholder*="লিংক"]', "http://127.0.0.1:12000/api/renders/scene-video.mp4");
await p.click('button:has-text("আনো")');
await p.waitForTimeout(7000);
await p.evaluate(() => {
  const st = window.__zyraxon.getState();
  const m = st.timeline.media[0];
  if (m) st.dispatch([{ op: "add_clip", clip: { kind: m.kind, mediaId: m.id, label: m.name, duration: m.duration } }]);
});
await p.waitForTimeout(2500);
await p.screenshot({ path: "/tmp/zb/ui-full.png" });
// background colour actually rendered?
const probe = await p.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const glass = document.querySelector(".glass");
  const gs = glass ? getComputedStyle(glass) : null;
  return {
    bodyBg: cs.backgroundColor,
    bodyImage: cs.backgroundImage.slice(0, 90),
    glassBlur: gs?.backdropFilter ?? "none",
    glassRadius: gs?.borderRadius ?? "?",
    panels: document.querySelectorAll(".glass").length,
  };
});
console.log(JSON.stringify(probe, null, 1));
await b.close();
