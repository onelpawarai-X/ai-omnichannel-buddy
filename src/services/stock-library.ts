/**
 * Keyless stock and animation catalogues.
 *
 * Every source here is public: no key, no account, no quota. Most are called
 * straight from the browser because they send `access-control-allow-origin: *`.
 * Mixkit and LottieFiles do not, so those two go through the same-origin
 * `/api/stock` and `/api/lottie` routes, which fetch them server-side.
 *
 * A result is normalised to `StockAsset` so the shelf, the editor and the agent
 * all speak one shape. `importUrl` is what the media bridge downloads; a result
 * with no `importUrl` is browsable but not placeable.
 */

export type StockSourceId =
  | "mixkit"
  | "lottiefiles"
  | "commons"
  | "openverse-image"
  | "openverse-audio"
  | "iconify"
  | "youtube";

export type StockKind = "video" | "audio" | "image" | "animation" | "icon" | "youtube";

export interface StockAsset {
  readonly id: string;
  readonly source: StockSourceId;
  readonly sourceLabel: string;
  readonly kind: StockKind;
  readonly title: string;
  readonly previewUrl?: string;
  readonly importUrl?: string;
  readonly hdUrl?: string;
  readonly pageUrl?: string;
  readonly author?: string;
  readonly license?: string;
  readonly durationSec?: number;
  readonly width?: number;
  readonly height?: number;
  /** Set when a result cannot be downloaded, so the shelf can say why. */
  readonly unavailable?: string;
}

export interface StockSource {
  readonly id: StockSourceId;
  readonly label: string;
  readonly kind: StockKind;
  readonly note: string;
}

export const STOCK_SOURCES: readonly StockSource[] = [
  { id: "mixkit", label: "Footage & effects", kind: "video", note: "Free stock video: fire, smoke, light leaks, particles, green screen" },
  { id: "lottiefiles", label: "Animations", kind: "animation", note: "Lottie animation files, dropped on the timeline as vector overlays" },
  { id: "commons", label: "Wikimedia", kind: "video", note: "Wikimedia Commons video and images" },
  { id: "openverse-image", label: "Images", kind: "image", note: "Openverse openly-licensed images" },
  { id: "openverse-audio", label: "Music & SFX", kind: "audio", note: "Openverse openly-licensed audio" },
  { id: "iconify", label: "Icons", kind: "icon", note: "Iconify open icon sets as SVG" },
  { id: "youtube", label: "YouTube", kind: "youtube", note: "Browse YouTube; a result imports as its poster frame" },
];

export const MIXKIT_CATEGORIES: ReadonlyArray<{ slug: string; label: string }> = [
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

const LABELS: Record<StockSourceId, string> = {
  mixkit: "Mixkit",
  lottiefiles: "LottieFiles",
  commons: "Wikimedia Commons",
  "openverse-image": "Openverse",
  "openverse-audio": "Openverse",
  iconify: "Iconify",
  youtube: "YouTube",
};

const PIPED_HOSTS = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
];

const SEARCH_TIMEOUT_MS = 15_000;

/** Fetch JSON with a deadline and no credentials; returns null on any failure. */
async function getJson<T>(url: string, ms = SEARCH_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface MixkitPayload {
  results?: Array<{ id: string; title: string; url: string; thumb: string; hd: string }>;
  error?: string;
}

/** Mixkit shelves: a whole category at once, no query needed. */
export async function mixkitCategory(slug: string, limit = 24): Promise<StockAsset[]> {
  const payload = await getJson<MixkitPayload>(
    `/api/stock?category=${encodeURIComponent(slug)}&limit=${limit}`,
  );
  if (!payload?.results) return [];
  return payload.results.map((video) => ({
    id: video.id,
    source: "mixkit" as const,
    sourceLabel: LABELS.mixkit,
    kind: "video" as const,
    title: video.title,
    previewUrl: video.thumb,
    importUrl: video.url,
    hdUrl: video.hd,
    license: "Mixkit free license",
  }));
}

interface LottiePayload {
  results?: Array<{ id: string; title: string; url: string; thumb?: string }>;
}

/** Lottie animations are JSON, so they arrive as `animation` assets. */
export async function lottieSearch(query: string, limit = 24): Promise<StockAsset[]> {
  const payload = await getJson<LottiePayload>(
    `/api/lottie?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (!payload?.results) return [];
  return payload.results.map((item) => ({
    id: item.id,
    source: "lottiefiles" as const,
    sourceLabel: LABELS.lottiefiles,
    kind: "animation" as const,
    title: item.title,
    ...(item.thumb ? { previewUrl: item.thumb } : {}),
    importUrl: item.url,
    license: "LottieFiles free license",
  }));
}

interface CommonsPayload {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; width?: number; height?: number }>;
      }
    >;
  };
}

/** Wikimedia Commons, filtered to the requested media kind. */
export async function commonsSearch(
  query: string,
  kind: "video" | "image",
  limit = 16,
): Promise<StockAsset[]> {
  const filetype = kind === "video" ? "filetype:video" : "filetype:bitmap";
  const payload = await getJson<CommonsPayload>(
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      `&generator=search&gsrnamespace=6&gsrlimit=${limit}` +
      `&gsrsearch=${encodeURIComponent(`${query} ${filetype}`)}` +
      "&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=480",
  );
  const pages = payload?.query?.pages;
  if (!pages) return [];
  const out: StockAsset[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const detected = info.mime?.startsWith("video/") ? "video" : "image";
    if (detected !== kind) continue;
    out.push({
      id: `commons:${page.title ?? info.url}`,
      source: "commons",
      sourceLabel: LABELS.commons,
      kind,
      title: (page.title ?? "commons file").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      ...(info.thumburl ? { previewUrl: info.thumburl } : {}),
      importUrl: info.url,
      pageUrl: info.url,
      license: "Wikimedia Commons",
      ...(info.width ? { width: info.width } : {}),
      ...(info.height ? { height: info.height } : {}),
    });
  }
  return out;
}

interface OpenversePayload {
  results?: Array<{
    id?: string;
    title?: string;
    url?: string;
    thumbnail?: string;
    creator?: string;
    license?: string;
    duration?: number;
    width?: number;
    height?: number;
  }>;
}

/** Openverse: openly-licensed images and audio in one endpoint shape. */
export async function openverseSearch(
  query: string,
  kind: "image" | "audio",
  limit = 20,
): Promise<StockAsset[]> {
  const endpoint = kind === "audio" ? "audio" : "images";
  const payload = await getJson<OpenversePayload>(
    `https://api.openverse.org/v1/${endpoint}/?q=${encodeURIComponent(query)}&page_size=${limit}`,
  );
  if (!payload?.results) return [];
  const source: StockSourceId = kind === "audio" ? "openverse-audio" : "openverse-image";
  return payload.results.flatMap((item) => {
    if (!item.url) return [];
    return [
      {
        id: `openverse:${item.id ?? item.url}`,
        source,
        sourceLabel: LABELS[source],
        kind,
        title: item.title ?? "untitled",
        ...(item.thumbnail ? { previewUrl: item.thumbnail } : {}),
        importUrl: item.url,
        ...(item.creator ? { author: item.creator } : {}),
        ...(item.license ? { license: item.license } : {}),
        ...(item.duration ? { durationSec: item.duration } : {}),
        ...(item.width ? { width: item.width } : {}),
        ...(item.height ? { height: item.height } : {}),
      } satisfies StockAsset,
    ];
  });
}

/** Iconify open icon sets, served as SVG the editor can place as an overlay. */
export async function iconifySearch(query: string, limit = 32): Promise<StockAsset[]> {
  const payload = await getJson<{ icons?: string[] }>(
    `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    10_000,
  );
  if (!payload?.icons) return [];
  return payload.icons.map((name) => {
    const slug = name.replace(":", "/");
    return {
      id: `icon:${name}`,
      source: "iconify" as const,
      sourceLabel: LABELS.iconify,
      kind: "icon" as const,
      title: name,
      previewUrl: `https://api.iconify.design/${slug}.svg?height=96`,
      importUrl: `https://api.iconify.design/${slug}.svg?height=256`,
      license: "Iconify open sets",
    };
  });
}

interface PipedItem {
  url?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
}

interface PipedPayload {
  items?: PipedItem[];
}

/**
 * YouTube browse and search.
 *
 * Playback streams are not reachable from a browser (no CORS, and anonymous
 * stream resolution is unreliable), so a result imports its poster frame as an
 * image and links back to the video. That is stated on the asset, not hidden.
 */
export async function youtubeSearch(query: string, region = "US", limit = 24): Promise<StockAsset[]> {
  for (const host of PIPED_HOSTS) {
    const url = query
      ? `${host}/search?q=${encodeURIComponent(query)}&filter=videos`
      : `${host}/trending?region=${encodeURIComponent(region)}`;
    const payload = await getJson<PipedPayload | PipedItem[]>(url);
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!items?.length) continue;
    const out: StockAsset[] = [];
    for (const item of items.slice(0, limit)) {
      const id = item.url?.replace(/^\/watch\?v=/, "").split("&")[0];
      if (!id) continue;
      out.push({
        id: `youtube:${id}`,
        source: "youtube",
        sourceLabel: LABELS.youtube,
        kind: "youtube",
        title: item.title ?? id,
        previewUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        // hqdefault always exists; maxresdefault is the HD upgrade when present.
        importUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        hdUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        pageUrl: `https://www.youtube.com/watch?v=${id}`,
        ...(item.uploaderName ? { author: item.uploaderName } : {}),
        ...(item.duration && item.duration > 0 ? { durationSec: item.duration } : {}),
        unavailable: "Imports the poster frame; the video stream itself is not downloadable from a browser.",
      });
    }
    if (out.length) return out;
  }
  return [];
}

/** Run one source. A shelf or the agent can call this per source. */
export async function searchSource(
  source: StockSourceId,
  query: string,
  limit?: number,
): Promise<StockAsset[]> {
  switch (source) {
    case "mixkit":
      return mixkitCategory(query || "abstract", limit);
    case "lottiefiles":
      return query ? lottieSearch(query, limit) : [];
    case "commons":
      return query ? commonsSearch(query, "video", limit) : [];
    case "openverse-image":
      return query ? openverseSearch(query, "image", limit) : [];
    case "openverse-audio":
      return query ? openverseSearch(query, "audio", limit) : [];
    case "iconify":
      return query ? iconifySearch(query, limit) : [];
    case "youtube":
      return youtubeSearch(query, "US", limit);
    default:
      return [];
  }
}

/** Search every source in parallel; one failing source never hides the others. */
export async function searchAllSources(query: string, limit = 12): Promise<StockAsset[]> {
  const settled = await Promise.allSettled(
    STOCK_SOURCES.map((source) => searchSource(source.id, query, limit)),
  );
  return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
}
