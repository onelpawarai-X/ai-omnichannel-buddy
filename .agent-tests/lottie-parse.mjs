import { writeFileSync } from "node:fs";
const ORIGIN = "https://lottiefiles.com";
const agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const csrfResponse = await fetch(`${ORIGIN}/api/v1/search-csrf`, { headers: { accept: "application/json", referer: `${ORIGIN}/`, "user-agent": agent } });
const csrf = await csrfResponse.json();
const cookies = csrfResponse.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
const page = await fetch(`${ORIGIN}/search?q=glitch`, {
  method: "POST", redirect: "follow",
  headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded", referer: `${ORIGIN}/search?q=glitch`, cookie: cookies, "user-agent": agent },
  body: new URLSearchParams({ csrf_token: csrf.csrfToken, search_query: "glitch" }),
});
const html = await page.text();
writeFileSync("/tmp/zb/lf.html", html);

const flat = html.replace(/\\"/g, '"').replace(/\\u002F/g, "/");
const titles = new Map();
for (const m of flat.matchAll(/"([0-9a-f-]{36})","([^"]{1,90})"/g)) {
  if (!titles.has(m[1])) titles.set(m[1], m[2]);
}
const jsons = new Map();
for (const m of flat.matchAll(/"(?:https:\/\/assets-v2\.lottiefiles\.com\/)?a\/([0-9a-f-]{36})\/([A-Za-z0-9]{10})\.json"/g)) {
  if (!jsons.has(m[1])) jsons.set(m[1], `https://assets-v2.lottiefiles.com/a/${m[1]}/${m[2]}.json`);
}
const thumbs = new Map();
for (const m of flat.matchAll(/"a\/([0-9a-f-]{36})\/([A-Za-z0-9]{10})\.png"/g)) {
  if (!thumbs.has(m[1])) thumbs.set(m[1], `https://assets-v2.lottiefiles.com/a/${m[1]}/${m[2]}.png`);
}
console.log("titles", titles.size, "jsons", jsons.size, "thumbs", thumbs.size);
const joined = [...jsons.entries()].filter(([u]) => titles.has(u));
console.log("joined", joined.length);
for (const [u, url] of joined.slice(0, 8)) {
  console.log(" •", titles.get(u).slice(0,42), "|", url.split("/").pop(), "| thumb:", thumbs.has(u));
}
