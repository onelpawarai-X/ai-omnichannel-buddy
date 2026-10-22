/**
 * Mixkit stock library.
 *
 * Mixkit publishes a large, genuinely free stock video catalogue: effects,
 * backgrounds, overlays, green screen, transitions and ordinary footage. The
 * site renders each category page on the server, so the catalogue can be read
 * straight from the markup - no key, no quota. Every asset exposes a 360p
 * preview and a 720p/1080p file on the same CDN, which the editor can import
 * like any other clip.
 */
import { createFileRoute } from "@tanstack/react-router";

const ORIGIN = "https://mixkit.co";
const CDN = "https://assets.mixkit.co/videos";

const AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export type StockVideo = {
  id: string;
  title: string;
  url: string;
  thumb: string;
  hd: string;
  category: string;
  source: "Mixkit";
};

/**
 * Categories worth surfacing as one-tap effect shelves. The slug is the path
 * segment on mixkit.co, so these are real catalogue sections rather than
 * keyword guesses.
 */
export const STOCK_CATEGORIES: Array<{ slug: string; label: string }> = [
  { slug: "abstract", label: "Abstract" },
  { slug: "background", label: "Backgrounds" },
  { slug: "double-exposure", label: "Double exposure" },
  { slug: "fire", label: "Fire" },
  { slug: "smoke", label: "Smoke" },
  { slug: "light", label: "Light" },
  { slug: "water", label: "Water" },
  { slug: "sky", label: "Sky" },
  { slug: "space", label: "Space" },
  { slug: "stars-in-space-background-1610", label: "Stars" },
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
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Read the video cards out of a category page.
 *
 * Each card carries an item id, a title slug and a poster frame. The playable
 * file names are derived from the id, which is how the CDN lays them out.
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
      url: `${CDN}/${id}/${id}-720.mp4`,
      thumb: `${CDN}/${id}/${id}-thumb-360-0.jpg`,
      hd: `${CDN}/${id}/${id}-1080.mp4`,
      category,
      source: "Mixkit",
    });
  }
  return out;
}

type CacheEntry = { at: number; videos: StockVideo[] };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 10 * 60 * 1000;

export async function fetchCategory(slug: string): Promise<StockVideo[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.videos;

  const response = await fetch(`${ORIGIN}/free-stock-video/${encodeURIComponent(slug)}/`, {
    headers: { accept: "text/html", "user-agent": AGENT },
  });
  if (!response.ok) return [];
  const videos = parseCategoryPage(await response.text(), slug);
  if (videos.length) cache.set(slug, { at: Date.now(), videos });
  return videos;
}

export const Route = createFileRoute("/api/stock")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("categories") !== null) {
          return Response.json({ categories: STOCK_CATEGORIES });
        }
        const slug = (params.get("category") ?? "abstract").trim();
        const limit = Math.max(1, Math.min(60, Number(params.get("limit") ?? 30) || 30));
        try {
          const videos = await fetchCategory(slug);
          return Response.json({ results: videos.slice(0, limit), category: slug });
        } catch {
          return Response.json({ results: [], category: slug, error: "mixkit unreachable" });
        }
      },
    },
  },
});
