import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox","--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
await p.goto("http://127.0.0.1:12000/", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(4000);

const click = async (label) => {
  await p.locator(`button:has-text("${label}")`).first().click({ timeout: 15000 });
  await p.waitForTimeout(9000);
};

// The library tabs live behind the sidebar toggle.
await p.locator('button:has-text("লাইব্রেরি")').first().click({ timeout: 15000 });
await p.waitForTimeout(1500);

// --- YouTube shelf
await click("ইউটিউব");
const yt = await p.locator('img[src*="ytimg"], img[src*="i.ytimg"]').count();
const ytState = await p.evaluate(() => window.__zyraxon.getState().assetResults.length);
console.log("youtube shelf cards:", yt, "state:", ytState);

// --- Stock shelf
await click("স্টক");
const stock = await p.evaluate(() => window.__zyraxon.getState().stockResults.slice(0, 3).map((v) => v.title.slice(0, 40)));
console.log("stock shelf:", stock.length, JSON.stringify(stock));

// --- Lottie live search
await click("অ্যানিমেশন");
await p.locator('input[placeholder*="LottieFiles"]').fill("confetti");
await p.locator('button:has-text("খুঁজুন")').first().click();
await p.waitForTimeout(14000);
const lot = await p.evaluate(() => window.__zyraxon.getState().lottieResults.slice(0, 3).map((v) => v.title.slice(0, 40)));
console.log("lottie search:", lot.length, JSON.stringify(lot));

await p.screenshot({ path: "/tmp/zb/ui-shelves.png" });
console.log("page errors:", errs.length ? errs.slice(0, 5) : "none");
await b.close();
