import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await b.newPage();
p.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 200)));
await p.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(2000);
const out = await p.evaluate(async () => {
  const r = await fetch("/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script: "echo browser-ok" }),
  });
  const text = await r.text();
  return { status: r.status, ct: r.headers.get("content-type"), first: text.slice(0, 160) };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
