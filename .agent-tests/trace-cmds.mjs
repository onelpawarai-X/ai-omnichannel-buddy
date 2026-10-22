import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  window.__cmds = [];
  const orig = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/command") && init?.body) {
      try { window.__cmds.push(JSON.parse(String(init.body)).script); } catch {}
    }
    return orig(input, init);
  };
});
await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
await page.fill('input[placeholder*="লিংক"]', "http://127.0.0.1:12000/api/renders/scene-video.mp4");
await page.click('button:has-text("আনো")');
await page.waitForTimeout(6000);
await page.fill("textarea#agent-prompt", "নিজে একটা ৩ সেকেন্ডের কালো ক্লিপ বানাও ffmpeg দিয়ে, সেটা টাইমলাইনে বসাও। finish কল করো।");
await page.click('button[title="পাঠান"]');
for (let i = 0; i < 30; i++) { await page.waitForTimeout(4000); if (!(await page.evaluate(() => window.__zyraxon.getState().agentBusy))) break; }
const cmds = await page.evaluate(() => window.__cmds);
console.log("COMMANDS RUN:", cmds.length);
cmds.forEach((c, i) => console.log(`\n[${i}] ${c.slice(0, 300)}`));
const tools = await page.evaluate(() => window.__zyraxon.getState().chat.filter((c) => c.role === "tool").map((c) => `${c.toolName}${c.ok === false ? " FAIL" : ""}`));
console.log("\nTOOLS:", tools.join(", "));
await browser.close();
