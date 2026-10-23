/**
 * Stock catalogue readers shared by the Cloudflare Pages Functions and the
 * Vite dev middleware.
 *
 * Two sources need a server hop. Mixkit and LottieFiles send no CORS header and
 * read a browser session cookie, so the browser cannot call them directly; the
 * same-origin `/api/stock` and `/api/lottie` routes do it instead. Everything
 * else in the stock panel is called straight from the browser.
 */

const MIXKIT_ORIGIN = "https://mixkit.co";
const MIXKIT_CDN = "https://assets.mixkit.co/videos";
const LOTTIE_ORIGIN = "https://lottiefiles.com";

const AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export interface StockVideo {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly thumb: string;
  readonly hd: string;
  readonly category: string;
  readonly source: "Mixkit";
}

export interface LottieResult {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly thumb?: string;
  readonly source: "LottieFiles";
}

/**
 * Mixkit sections worth surfacing as one-tap shelves. Each slug is a real
 * catalogue path, not a keyword guess, so every shelf returns footage.
 */
export const STOCK_CATEGORIES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "abstract", label: "Abstract" },
  { slug: "background", label: "Backgrounds" },
  { slug: "double-exposure", label: "Double exposure" },
  { slug: "fire", label: "Fire" },
  { slug: "smoke", label: "Smoke" },
  { slug: "light", label: "Light" },
  { slug: "water", label: "Water" },
  { slug: "sky", label: "Sky" },
  { slug: "space", label: "Space" },
  { slug: "snow", label: "Snow" },
  { slug: "rain", label: "Rain" },
  { slug: "cloud", label: "Clouds" },
  { slug: "countdown", label: "Countdown" },
  { slug: "green-screen", label: "Green screen" },
  { slug: "horror", label: "Horror" },
  { slug: "music", label: "Music" },
  { slug: "party", label: "Party" },
  { slug: "city", label: "City" },
  { slug: "nature", label: "Nature" },
  { slug: "food", label: "Food" },
  { slug: "people", label: "People" },
  { slug: "ai-generated", label: "AI generated" },
];

function humanize(slug: string): string {
  return slug
    .replace(/-\d+$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Read the video cards out of a Mixkit category page.
 *
 * A card carries an item id, a title slug and a poster frame; the playable file
 * names are derived from the id, which is how the CDN lays them out.
 */
export function parseCategoryPage(html: string, category: string): StockVideo[] {
  const out: StockVideo[] = [];
  const seen = new Set<string>();
  const cards = html.matchAll(
    /href="\/free-stock-video\/([a-z0-9-]+?-(\d+))\/"[^>]*>\s*([^<]{0,120})?/g,
  );
  for (const card of cards) {
    const slug = card[1] ?? "";
    const id = card[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = (card[3] ?? "").trim();
    out.push({
      id: `mixkit:${id}`,
      title: label || humanize(slug),
      url: `${MIXKIT_CDN}/${id}/${id}-720.mp4`,
      thumb: `${MIXKIT_CDN}/${id}/${id}-thumb-360-0.jpg`,
      hd: `${MIXKIT_CDN}/${id}/${id}-1080.mp4`,
      category,
      source: "Mixkit",
    });
  }
  return out;
}

const categoryCache = new Map<string, { at: number; videos: StockVideo[] }>();
const CATEGORY_CACHE_MS = 10 * 60 * 1000;

export async function fetchCategory(slug: string): Promise<StockVideo[]> {
  const hit = categoryCache.get(slug);
  if (hit && Date.now() - hit.at < CATEGORY_CACHE_MS) return hit.videos;
  const response = await fetch(
    `${MIXKIT_ORIGIN}/free-stock-video/${encodeURIComponent(slug)}/`,
    { headers: { accept: "text/html", "user-agent": AGENT } },
  );
  if (!response.ok) return [];
  const videos = parseCategoryPage(await response.text(), slug);
  if (videos.length) categoryCache.set(slug, { at: Date.now(), videos });
  return videos;
}

/** The page escapes its payload, so quotes and slashes arrive backslashed. */
function unescapePayload(html: string): string {
  return html.replace(/\\"/g, '"').replace(/\\u002F/g, "/").replace(/\\\//g, "/");
}

/**
 * Pull animation entries out of a LottieFiles search page.
 *
 * The payload is a flat list of values rather than records: an asset folder id,
 * a title, a thumbnail and a .json path sit near each other but not in a fixed
 * shape. Each kind is therefore collected by folder id and joined afterwards,
 * which is what makes titles and posters line up with the right animation.
 */
export function parseLottiePayload(html: string): LottieResult[] {
  const flat = unescapePayload(html);

  const titles = new Map<string, string>();
  for (const match of flat.matchAll(/"([0-9a-f-]{36})","([^"]{1,90})"/g)) {
    const id = match[1];
    const title = match[2];
    if (id && title && !titles.has(id) && !title.startsWith("http")) titles.set(id, title);
  }

  const files = new Map<string, string>();
  for (const match of flat.matchAll(/"a\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{8,12})\.json"/g)) {
    const folder = match[1];
    const file = match[2];
    if (folder && file && !files.has(folder)) {
      files.set(folder, `https://assets-v2.lottiefiles.com/a/${folder}/${file}.json`);
    }
  }

  const thumbs = new Map<string, string>();
  for (const match of flat.matchAll(/"a\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{8,12})\.png"/g)) {
    const folder = match[1];
    const file = match[2];
    if (folder && file && !thumbs.has(folder)) {
      thumbs.set(folder, `https://assets-v2.lottiefiles.com/a/${folder}/${file}.png`);
    }
  }

  const out: LottieResult[] = [];
  for (const [folder, url] of files) {
    const thumb = thumbs.get(folder);
    const entry: LottieResult = {
      id: `lottiefiles:${folder}`,
      title: titles.get(folder) ?? url.split("/").pop() ?? "animation",
      url,
      source: "LottieFiles",
      ...(thumb ? { thumb } : {}),
    };
    out.push(entry);
  }
  return out;
}

const lottieCache = new Map<string, { at: number; results: LottieResult[] }>();
const LOTTIE_CACHE_MS = 5 * 60 * 1000;

export async function searchLottieFiles(
  query: string,
  limit: number,
): Promise<LottieResult[]> {
  const key = query.toLowerCase();
  const hit = lottieCache.get(key);
  if (hit && Date.now() - hit.at < LOTTIE_CACHE_MS) return hit.results.slice(0, limit);

  // Step 1: the CSRF token, plus the session cookie it is bound to.
  const csrfResponse = await fetch(`${LOTTIE_ORIGIN}/api/v1/search-csrf`, {
    headers: { accept: "application/json", referer: `${LOTTIE_ORIGIN}/`, "user-agent": AGENT },
  });
  if (!csrfResponse.ok) return [];
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  if (!csrf.csrfToken) return [];
  const cookies = csrfResponse.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");

  // Step 2: post the search form. The site answers with a redirect to the
  // server-rendered result page, which carries the animation payload.
  const page = await fetch(`${LOTTIE_ORIGIN}/search?q=${encodeURIComponent(query)}`, {
    method: "POST",
    redirect: "follow",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      referer: `${LOTTIE_ORIGIN}/search?q=${encodeURIComponent(query)}`,
      cookie: cookies,
      "user-agent": AGENT,
    },
    body: new URLSearchParams({ csrf_token: csrf.csrfToken, search_query: query }),
  });
  const html = await page.text();
  if (!html.includes("assets-v2.lottiefiles.com")) return [];

  const results = parseLottiePayload(html).slice(0, 60);
  if (results.length) lottieCache.set(key, { at: Date.now(), results });
  return results;
}

/** Shared JSON body for the two routes; keeps the handlers one line each. */
export async function stockResponse(
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  if (params.get("categories") !== null) {
    return { categories: STOCK_CATEGORIES };
  }
  const slug = (params.get("category") ?? "abstract").trim();
  const limit = Math.max(1, Math.min(60, Number(params.get("limit") ?? 30) || 30));
  try {
    const videos = await fetchCategory(slug);
    return { results: videos.slice(0, limit), category: slug, source: "Mixkit" };
  } catch {
    return { results: [], category: slug, error: "mixkit unreachable" };
  }
}

export async function lottieResponse(
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const query = (params.get("q") ?? "").trim();
  if (!query) return { results: [], query };
  const limit = Math.max(1, Math.min(48, Number(params.get("limit") ?? 24) || 24));
  try {
    const results = await searchLottieFiles(query, limit);
    return { results, query, source: "LottieFiles" };
  } catch {
    return { results: [], query, error: "lottiefiles unreachable" };
  }
}
