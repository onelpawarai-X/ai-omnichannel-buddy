const ORIGIN = "https://lottiefiles.com";
const agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const csrfResponse = await fetch(`${ORIGIN}/api/v1/search-csrf`, { headers: { accept: "application/json", referer: `${ORIGIN}/`, "user-agent": agent } });
console.log("csrf status", csrfResponse.status);
const csrf = await csrfResponse.json();
console.log("token?", !!csrf.csrfToken, "bypass?", csrf.turnstileBypass);
const cookies = csrfResponse.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
console.log("cookies:", cookies.slice(0,80));
const body = new URLSearchParams({ csrf_token: csrf.csrfToken, search_query: "glitch" });
const page = await fetch(`${ORIGIN}/search?q=glitch`, {
  method: "POST", redirect: "follow",
  headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded", referer: `${ORIGIN}/search?q=glitch`, cookie: cookies, "user-agent": agent },
  body,
});
console.log("page status", page.status, "url", page.url);
const html = await page.text();
console.log("len", html.length, "has assets-v2:", html.includes("assets-v2.lottiefiles.com"));
console.log("has .json urls:", /assets-v2\.lottiefiles\.com\/a\/[^"]+\.json/.test(html));
console.log("sample:", (html.match(/assets-v2\.lottiefiles\.com\/a\/[^"\\ ]{0,60}/) || ["none"])[0]);
