import { createFileRoute } from "@tanstack/react-router";

type Asset = {
  id: string;
  kind: "video" | "audio" | "image" | "icon" | "youtube";
  title: string;
  url: string;
  thumb?: string;
  duration?: number;
  author?: string;
  license?: string;
  source: string;
};

async function getJson<T>(url: string, ms = 14000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type CommonsResponse = {
  query?: {
    pages?: Record<
      string,
      { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; duration?: number }> }
    >;
  };
};

async function searchCommons(query: string, kind: "video" | "audio" | "image", limit: number): Promise<Asset[]> {
  const filetype = kind === "video" ? "filetype:video" : kind === "audio" ? "filetype:audio" : "filetype:bitmap";
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrnamespace=6&gsrlimit=${limit}` +
    `&gsrsearch=${encodeURIComponent(`${query} ${filetype}`)}` +
    `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=480`;
  const json = await getJson<CommonsResponse>(url);
  const pages = json?.query?.pages;
  if (!pages) return [];
  const out: Asset[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const detected = info.mime?.startsWith("video/") ? "video" : info.mime?.startsWith("audio/") ? "audio" : "image";
    if (detected !== kind) continue;
    const asset: Asset = {
      id: `commons:${page.title ?? info.url}`,
      kind,
      title: (page.title ?? "commons file").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      url: info.url,
      source: "Wikimedia Commons",
      license: "Wikimedia Commons",
    };
    if (info.thumburl) asset.thumb = info.thumburl;
    if (info.duration) asset.duration = info.duration;
    out.push(asset);
  }
  return out;
}

type OpenverseResponse = {
  results?: Array<{
    id?: string;
    title?: string;
    url?: string;
    thumbnail?: string;
    creator?: string;
    license?: string;
    duration?: number;
  }>;
};

async function searchOpenverse(query: string, kind: "audio" | "image", limit: number): Promise<Asset[]> {
  const endpoint = kind === "audio" ? "audio" : "images";
  const json = await getJson<OpenverseResponse>(
    `https://api.openverse.org/v1/${endpoint}/?q=${encodeURIComponent(query)}&page_size=${limit}`,
  );
  if (!json?.results) return [];
  return json.results.flatMap((item) => {
    if (!item.url) return [];
    const asset: Asset = {
      id: `openverse:${item.id ?? item.url}`,
      kind,
      title: item.title ?? "untitled",
      url: item.url,
      source: "Openverse",
    };
    if (item.thumbnail) asset.thumb = item.thumbnail;
    if (item.creator) asset.author = item.creator;
    if (item.license) asset.license = item.license;
    if (item.duration) asset.duration = item.duration;
    return [asset];
  });
}

async function searchIcons(query: string, limit: number): Promise<Asset[]> {
  const json = await getJson<{ icons?: string[] }>(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`, 10000);
  if (!json?.icons) return [];
  return json.icons.map((name) => {
    const slug = name.replace(":", "/");
    return {
      id: `icon:${name}`,
      kind: "icon" as const,
      title: name,
      url: `https://api.iconify.design/${slug}.svg?height=256`,
      thumb: `https://api.iconify.design/${slug}.svg?height=96`,
      source: "Iconify",
    };
  });
}

type PipedSearch = { items?: Array<{ url?: string; title?: string; uploaderName?: string; duration?: number; thumbnail?: string }> };

async function searchYouTube(query: string, limit: number): Promise<Asset[]> {
  const hosts = ["https://api.piped.private.coffee", "https://pipedapi.adminforge.de", "https://api.piped.yt"];
  for (const host of hosts) {
    const json = await getJson<PipedSearch>(`${host}/search?q=${encodeURIComponent(query)}&filter=videos`, 14000);
    if (!json?.items?.length) continue;
    const out: Asset[] = [];
    for (const item of json.items.slice(0, limit)) {
      if (!item.url) continue;
      const id = item.url.replace(/^\/watch\?v=/, "").split("&")[0] ?? "";
      if (!id) continue;
      const asset: Asset = {
        id: `youtube:${id}`,
        kind: "youtube",
        title: item.title ?? id,
        url: `https://www.youtube.com/watch?v=${id}`,
        source: "YouTube",
      };
      if (item.thumbnail) asset.thumb = item.thumbnail;
      if (item.uploaderName) asset.author = item.uploaderName;
      if (item.duration) asset.duration = item.duration;
      out.push(asset);
    }
    if (out.length) return out;
  }
  return [];
}

/** Searches the open media libraries. Every source is public and needs no key. */
export const Route = createFileRoute("/api/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const query = (params.get("q") ?? "").trim();
        const kind = params.get("kind") ?? "all";
        const limit = Math.max(1, Math.min(40, Number(params.get("limit") ?? 20) || 20));
        if (!query) return Response.json({ results: [] });

        const jobs: Array<Promise<Asset[]>> = [];
        if (kind === "all" || kind === "video") jobs.push(searchCommons(query, "video", Math.min(limit, 16)));
        if (kind === "all" || kind === "image") jobs.push(searchOpenverse(query, "image", Math.min(limit, 16)));
        if (kind === "all" || kind === "audio") jobs.push(searchOpenverse(query, "audio", Math.min(limit, 16)));
        if (kind === "all" || kind === "icon") jobs.push(searchIcons(query, Math.min(limit, 32)));
        if (kind === "all" || kind === "youtube") jobs.push(searchYouTube(query, Math.min(limit, 16)));
        if (kind === "animation") jobs.push(searchCommons(query, "video", 8));

        const settled = await Promise.allSettled(jobs);
        const results = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
        return Response.json({ results: results.slice(0, limit), query, kind });
      },
    },
  },
});
