import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox","--disable-dev-shm-usage"] });
const p = await b.newPage();
const hits = [];
p.on("response", (r) => {
  const u = r.url();
  if (/lottiefiles\.com\/api|lottie\.host/i.test(u)) hits.push(`${r.status()} ${u.slice(0,200)}`);
});
await p.goto("https://lottiefiles.com/free-animations/glitch", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(6000);
// type in the search box to trigger the animation search API
try {
  const box = await p.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first();
  await box.click({ timeout: 8000 });
  await box.type("confetti", { delay: 90 });
  await p.waitForTimeout(9000);
} catch (e) { console.log("search box:", String(e).slice(0, 120)); }
console.log([...new Set(hits)].join("\n"));
await b.close();
