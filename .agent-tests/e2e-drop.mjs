/**
 * The two things the user could not do:
 *  1. drop a file onto the preview and have it appear there
 *  2. drop a file into the chat and have it appear in the pool so the agent has
 *     something real to edit
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = "http://127.0.0.1:12000";
const SRC = "/tmp/zyraxon-renders/scene-video.mp4";
if (!existsSync(SRC)) {
  console.log("SKIP: no test video at " + SRC);
  process.exit(0);
}
const bytes = readFileSync(SRC);
const b64 = bytes.toString("base64");

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 200)));

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);

// Playwright cannot set a real drag payload, so dispatch the events the app
// listens for with a DataTransfer built in the page.
const dropOn = async (selector, name) => {
  await page.evaluate(
    async ({ selector, name, b64 }) => {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const file = new File([buf], name, { type: "video/mp4" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const el = document.querySelector(selector);
      if (!el) throw new Error("no element for " + selector);
      el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    { selector, name, b64 },
  );
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ---------- 1: drop onto the preview ----------
await dropOn("section.glass canvas, section.glass div", "preview-drop.mp4");
await page.waitForTimeout(9000);
let pool = await page.evaluate(() =>
  window.__zyraxon.getState().timeline.media.map((m) => ({ name: m.name, kind: m.kind, dur: +m.duration.toFixed(2) })),
);
console.log("\n########## 1 — drop on the preview ##########");
console.log("pool:", JSON.stringify(pool));
check("file dropped on the preview reached the pool", pool.some((m) => m.name === "preview-drop.mp4"), JSON.stringify(pool));
check("its duration was probed", pool.some((m) => m.name === "preview-drop.mp4" && m.dur > 0));

// ---------- 2: drop into the chat ----------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await dropOn("[data-testid=chat-drop]", "chat-drop.mp4");
await page.waitForTimeout(9000);
const after = await page.evaluate(() => {
  const st = window.__zyraxon.getState();
  return {
    pool: st.timeline.media.map((m) => m.name),
    attachments: st.attachments.map((a) => ({ name: a.name, kind: a.kind, frames: a.frames?.length ?? 0 })),
  };
});
console.log("\n########## 2 — drop in the chat ##########");
console.log("pool:", JSON.stringify(after.pool));
console.log("attachments:", JSON.stringify(after.attachments));
check("chat drop reached the pool", after.pool.includes("chat-drop.mp4"), JSON.stringify(after.pool));
check("chat drop became an attachment", after.attachments.some((a) => a.name === "chat-drop.mp4"));
check("the attachment carries stills for the model", after.attachments.some((a) => a.name === "chat-drop.mp4" && a.frames > 0));

console.log("\nERRORS:", errors.slice(0, 5));
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
