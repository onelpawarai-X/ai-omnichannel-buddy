import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 300)); });
page.on("pageerror", (err) => errors.push("PAGEERROR " + err.message.slice(0, 300)));

await page.goto("http://127.0.0.1:12000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3000);

const title = await page.title();
const hasStage = await page.locator("canvas").count();
const hasTimeline = await page.locator("text=এডিট এজেন্ট").count();
console.log(JSON.stringify({ title, canvases: hasStage, chatVisible: hasTimeline, errors }, null, 1));

await page.screenshot({ path: "/tmp/zb/shot-01-boot.png", fullPage: false });
await browser.close();
