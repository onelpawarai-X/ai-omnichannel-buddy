import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox","--disable-dev-shm-usage"] });
const p = await b.newPage();
const hits = [];
p.on("response", (r) => {
  const u = r.url();
  if (/json|api|graphql|search/i.test(u) && !/\.(png|jpg|webp|svg|css|woff)/i.test(u)) hits.push(`${r.status()} ${u.slice(0,150)}`);
});
await p.goto("https://lottiefiles.com/free-animations/glitch", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(9000);
console.log([...new Set(hits)].slice(0, 30).join("\n"));
await b.close();
