import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const el = document.querySelector(".glass");
  const cs = getComputedStyle(el);
  return {
    backdropFilter: cs.backdropFilter,
    webkit: cs.webkitBackdropFilter,
    bg: cs.backgroundColor,
    boxShadow: cs.boxShadow.slice(0, 80),
    supported: CSS.supports("backdrop-filter", "blur(4px)"),
  };
}), null, 1));
await b.close();
