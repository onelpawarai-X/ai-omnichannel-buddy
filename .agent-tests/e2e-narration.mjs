/**
 * Checks the behaviour the user asked for, not just the timeline result:
 *  1. the agent talks between steps instead of going silent until the end
 *  2. it does not thrash - no long runs of the same tool, no apply/remove loops
 *  3. with nothing uploaded it does not invent an edit out of library stock
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:12000";
const V = `${BASE}/api/renders/scene-video.mp4`;

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 200));
});

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);

const run = async (prompt) => {
  const from = await page.evaluate(() => window.__zyraxon.getState().chat.length);
  await page.fill("textarea#agent-prompt", prompt);
  await page.click('button[title="পাঠান"]');
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(5000);
    if (!(await page.evaluate(() => window.__zyraxon.getState().agentBusy))) break;
  }
  return page.evaluate((start) => {
    const st = window.__zyraxon.getState();
    const entries = st.chat.slice(start);
    return {
      entries: entries.map((e) => ({ role: e.role, text: (e.text ?? "").slice(0, 160), tool: e.toolName })),
      clips: st.timeline.clips.map((c) => ({ kind: c.kind, fx: c.effects.join("+") })),
      media: st.timeline.media.map((m) => ({ name: m.name, kind: m.kind, source: m.source ?? "upload" })),
    };
  }, from);
};

const longestRun = (names) => {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of names) {
    run = n === prev ? run + 1 : 1;
    prev = n;
    if (run > best) best = run;
  }
  return best;
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ---------- A: a real edit with a real video, watching how it talks ----------
await page.fill('input[placeholder*="লিংক"]', V);
await page.click('button:has-text("আনো")');
await page.waitForTimeout(6000);

const a = await run(
  'ভিডিওটা সিনেমাটিক গ্রেড করে একটা টাইটেল বসাও — "ZYRAXON" — ২ সেকেন্ডের জন্য। কাজ করার সময় কী করছ সেটা লিখতে থাকো।',
);

const toolNames = a.entries.filter((e) => e.role === "tool").map((e) => e.tool);
const prose = a.entries.filter((e) => e.role === "assistant" && e.text.trim());
const lastToolAt = a.entries.map((e) => e.role === "tool").lastIndexOf(true);
const proseBeforeEnd = a.entries
  .map((e, i) => (e.role === "assistant" && e.text.trim() && i < lastToolAt ? 1 : 0))
  .reduce((x, y) => x + y, 0);

console.log("\n########## A — real edit ##########");
console.log("tools:", toolNames.join(", "));
console.log("prose lines:", prose.length, "| before the last tool call:", proseBeforeEnd);
for (const p of prose.slice(0, 8)) console.log("  •", p.text.replace(/\n/g, " "));
console.log("clips:", JSON.stringify(a.clips));

check("agent talks while it works (>= 3 lines)", prose.length >= 3, `got ${prose.length}`);
check("commentary is interleaved, not saved for the end", proseBeforeEnd >= 2, `got ${proseBeforeEnd}`);
check("no long run of one tool", longestRun(toolNames) <= 4, `longest ${longestRun(toolNames)}`);
check("did not thrash (<= 24 tool calls)", toolNames.length <= 24, `got ${toolNames.length}`);
const removed = toolNames.filter((n) => n === "remove_effect").length;
check("no apply/remove effect loop", removed <= 2, `remove_effect x${removed}`);
check("the edit landed", a.clips.length >= 1, `${a.clips.length} clip(s)`);
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// ---------- B: nothing uploaded ----------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const b = await run("ভিডিও এডিট করে দাও।");

const bTools = b.entries.filter((e) => e.role === "tool").map((e) => e.tool);
const bProse = b.entries.filter((e) => e.role === "assistant" && e.text.trim()).map((e) => e.text);
const stock = b.media.filter((m) => m.source === "library" || m.source === "stock");

console.log("\n########## B — nothing uploaded ##########");
console.log("tools:", bTools.join(", "));
console.log("clips:", b.clips.length, "| stock imported:", stock.length);
console.log("said:", bProse.join(" ").replace(/\n/g, " ").slice(0, 400));

check("did not fabricate an edit from stock", b.clips.length === 0 && stock.length === 0, `clips ${b.clips.length}, stock ${stock.length}`);
check("asked the user or explained instead of guessing", bProse.length >= 1, `${bProse.length} line(s)`);
check("kept it short", bTools.length <= 6, `${bTools.length} tool call(s)`);

console.log("\nERRORS:", errors.slice(0, 5));
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
