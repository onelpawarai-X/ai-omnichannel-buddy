/**
 * Live LottieFiles search.
 *
 * LottieFiles has no open search API: the site posts a CSRF-protected form and
 * renders the results into the page payload. That flow is reproduced here so the
 * editor searches the real catalogue - millions of animations - instead of a
 * hand-picked handful. The payload carries direct assets-v2 .json links, which
 * are served without a referer, so they load straight into the compositor.
 */
import { createFileRoute } from "@tanstack/react-router";

const ORIGIN = "https://lottiefiles.com";

const AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export type LottieResult = {
  id: string;
  title: string;
  url: string;
  thumb?: string;
  source: "LottieFiles";
};

/** The page escapes its payload, so quotes and slashes arrive backslashed. */
function unescapePayload(html: string): string {
  return html.replace(/\\"/g, '"').replace(/\\u002F/g, "/").replace(/\\\//g, "/");
}

/**
 * Pull animation entries out of the page payload.
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
  for (const match of flat.matchAll(/"a\/([0-9a-f-]{36})\/([A-Za-z0-9]{10})\.json"/g)) {
    const folder = match[1];
    const file = match[2];
    if (folder && file && !files.has(folder)) {
      files.set(folder, `https://assets-v2.lottiefiles.com/a/${folder}/${file}.json`);
    }
  }

  const thumbs = new Map<string, string>();
  for (const match of flat.matchAll(/"a\/([0-9a-f-]{36})\/([A-Za-z0-9]{10})\.png"/g)) {
    const folder = match[1];
    const file = match[2];
    if (folder && file && !thumbs.has(folder)) {
      thumbs.set(folder, `https://assets-v2.lottiefiles.com/a/${folder}/${file}.png`);
    }
  }

  const out: LottieResult[] = [];
  for (const [folder, url] of files) {
    const entry: LottieResult = {
      id: `lottiefiles:${folder}`,
      title: titles.get(folder) ?? url.split("/").pop() ?? "animation",
      url,
      source: "LottieFiles",
    };
    const thumb = thumbs.get(folder);
    out.push(thumb ? { ...entry, thumb } : entry);
  }
  return out;
}

type CacheEntry = { at: number; results: LottieResult[] };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 5 * 60 * 1000;

export async function searchLottieFiles(query: string, limit: number): Promise<LottieResult[]> {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results.slice(0, limit);

  // Step 1: the CSRF token, plus the session cookie it is bound to.
  const csrfResponse = await fetch(`${ORIGIN}/api/v1/search-csrf`, {
    headers: { accept: "application/json", referer: `${ORIGIN}/`, "user-agent": AGENT },
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
  // server-rendered result page, which carries the animation payload. That page
  // reports 404 while still rendering everything, so the body is what counts.
  const page = await fetch(`${ORIGIN}/search?q=${encodeURIComponent(query)}`, {
    method: "POST",
    redirect: "follow",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      referer: `${ORIGIN}/search?q=${encodeURIComponent(query)}`,
      cookie: cookies,
      "user-agent": AGENT,
    },
    body: new URLSearchParams({ csrf_token: csrf.csrfToken, search_query: query }),
  });
  const html = await page.text();
  if (!html.includes("assets-v2.lottiefiles.com")) return [];

  const results = parseLottiePayload(html).slice(0, 60);
  if (results.length) cache.set(key, { at: Date.now(), results });
  return results;
}

export const Route = createFileRoute("/api/lottie")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const query = (params.get("q") ?? "").trim();
        const limit = Math.max(1, Math.min(48, Number(params.get("limit") ?? 24) || 24));
        if (!query) return Response.json({ results: [], query });
        try {
          const results = await searchLottieFiles(query, limit);
          return Response.json({ results, query, source: "LottieFiles" });
        } catch {
          return Response.json({ results: [], query, error: "lottiefiles unreachable" });
        }
      },
    },
  },
});
