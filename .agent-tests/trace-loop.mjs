import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  window.__rounds = [];
  const orig = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/chat/completions") && init?.body) {
      try {
        const b = JSON.parse(String(init.body));
        const msgs = b.messages;
        const last = msgs[msgs.length - 1];
        const assistants = msgs.filter((m) => m.role === "assistant" && m.tool_calls);
        const tools = msgs.filter((m) => m.role === "tool");
        window.__rounds.push({
          n: msgs.length,
          lastRole: last.role,
          lastText: typeof last.content === "string" ? last.content.slice(0, 200) : "(parts)",
          lastCalls: (last.tool_calls || []).map((c) => ({ n: c.function.name, a: String(c.function.arguments).slice(0, 300) })),
          assistantCalls: assistants.map((a) => a.tool_calls.map((c) => c.function.name)),
          toolResults: tools.slice(-4).map((t) => String(t.content).slice(0, 250)),
        });
      } catch {}
    }
    return orig(input, init);
  };
});
await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
await page.fill('input[placeholder*="লিংক"]', "http://127.0.0.1:12000/api/renders/scene-video.mp4");
await page.click('button:has-text("আনো")');
await page.waitForTimeout(6000);
await page.fill("textarea#agent-prompt", "নিজে একটা ২ সেকেন্ডের কালো ক্লিপ বানাও (ffmpeg), তারপর সেটা টাইমলাইনে বসাও। finish কল করো।");
await page.click('button[title="পাঠান"]');
for (let i = 0; i < 30; i++) { await page.waitForTimeout(4000); if (!(await page.evaluate(() => window.__zyraxon.getState().agentBusy))) break; }
const rounds = await page.evaluate(() => window.__rounds);
console.log("ROUNDS:", rounds.length);
rounds.forEach((r, i) => {
  console.log(`\n=== ROUND ${i} (msgs=${r.n}, last=${r.lastRole}) ===`);
  console.log("  last text:", JSON.stringify(r.lastText));
  if (r.lastCalls.length) console.log("  last calls:", JSON.stringify(r.lastCalls, null, 1));
  if (r.toolResults.length) r.toolResults.forEach((t) => console.log("  tool result:", t.replace(/\n/g, " | ")));
});
await browser.close();
