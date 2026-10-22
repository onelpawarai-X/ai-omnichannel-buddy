/**
 * Asset search across the open libraries the editor is wired to.
 *
 * Every source here is a public, keyless API: Wikimedia Commons (video and
 * images), Openverse (audio and images), Iconify (icons), and Piped/Invidious
 * (YouTube metadata plus a direct stream). Results are normalised into
 * `AssetResult` so the UI and the agent can treat them uniformly.
 */
export type AssetKind = "video" | "audio" | "image" | "animation" | "icon" | "youtube";

export type AssetResult = {
  id: string;
  kind: AssetKind;
  title: string;
  /** direct media URL, playable in the editor */
  url: string;
  thumb?: string;
  duration?: number;
  width?: number;
  height?: number;
  author?: string;
  license?: string;
  source: string;
  page?: string;
  tags?: string[];
};

/** Public CORS-friendly proxies, tried in order when a host blocks the browser. */
const PIPED_HOSTS = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.yt",
];

const INVIDIOUS_HOSTS = ["https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://yewtu.be"];

function timeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => window.clearTimeout(id) };
}

async function getJson<T>(url: string, ms = 12000): Promise<T | null> {
  const { signal, cancel } = timeout(ms);
  try {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    cancel();
  }
}

function proxied(url: string): string {
  return `/api/media?url=${encodeURIComponent(url)}`;
}

type CommonsResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; width?: number; height?: number; duration?: number }>;
      }
    >;
  };
};

/** Wikimedia Commons: free videos, images and audio. No key, CORS enabled. */
export async function searchCommons(query: string, kind: AssetKind, limit = 24): Promise<AssetResult[]> {
  const mime = kind === "video" ? "filetype:video" : kind === "audio" ? "filetype:audio" : "filetype:bitmap";
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(`${query} ${mime}`)}` +
    `&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=480`;
  const json = await getJson<CommonsResponse>(url, 15000);
  const pages = json?.query?.pages;
  if (!pages) return [];
  const results: AssetResult[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const detected: AssetKind = info.mime?.startsWith("video/")
      ? "video"
      : info.mime?.startsWith("audio/")
        ? "audio"
        : "image";
    if (kind !== "animation" && detected !== kind) continue;
    const result: AssetResult = {
      id: `commons:${page.title ?? info.url}`,
      kind: detected,
      title: (page.title ?? "commons file").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      url: info.url,
      source: "Wikimedia Commons",
      license: "Commons (check file page)",
    };
    if (info.thumburl) result.thumb = info.thumburl;
    if (info.width) result.width = info.width;
    if (info.height) result.height = info.height;
    if (info.duration) result.duration = info.duration;
    results.push(result);
  }
  return results;
}

type OpenverseResponse = {
  results?: Array<{
    id?: string;
    title?: string;
    url?: string;
    thumbnail?: string;
    creator?: string;
    license?: string;
    license_version?: string;
    duration?: number;
    filesize?: number;
    category?: string;
    foreign_landing_url?: string;
    tags?: Array<{ name?: string }>;
  }>;
};

/** Openverse: openly licensed audio and images. No key required for search. */
export async function searchOpenverse(query: string, kind: "audio" | "image", limit = 24): Promise<AssetResult[]> {
  const url = `https://api.openverse.org/v1/${kind === "audio" ? "audio" : "images"}/?q=${encodeURIComponent(query)}&page_size=${limit}`;
  const json = await getJson<OpenverseResponse>(url, 15000);
  if (!json?.results) return [];
  return json.results.flatMap((item) => {
    if (!item.url) return [];
    const result: AssetResult = {
      id: `openverse:${item.id ?? item.url}`,
      kind,
      title: item.title ?? "untitled",
      url: item.url,
      source: "Openverse",
    };
    if (item.thumbnail) result.thumb = item.thumbnail;
    if (item.creator) result.author = item.creator;
    if (item.license) result.license = `${item.license} ${item.license_version ?? ""}`.trim();
    if (item.duration) result.duration = item.duration;
    if (item.foreign_landing_url) result.page = item.foreign_landing_url;
    if (item.tags?.length) result.tags = item.tags.flatMap((t) => (t.name ? [t.name] : []));
    return [result];
  });
}

type IconifySearch = { icons?: string[] };

/** Iconify: 200k+ open icons, searchable without a key. */
export async function searchIcons(query: string, limit = 32): Promise<AssetResult[]> {
  const json = await getJson<IconifySearch>(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`, 10000);
  if (!json?.icons) return [];
  return json.icons.map((name) => ({
    id: `icon:${name}`,
    kind: "icon" as const,
    title: name,
    url: `https://api.iconify.design/${name.replace(":", "/")}.svg?height=256`,
    thumb: `https://api.iconify.design/${name.replace(":", "/")}.svg?height=96`,
    source: "Iconify",
    license: "icon set licence",
    tags: [name.split(":")[0] ?? ""],
  }));
}

/** Pull a YouTube video id out of any common URL shape. */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1]) return match[1];
  }
  return null;
}

export type YouTubeStream = {
  url: string;
  mimeType: string;
  quality: string;
  videoOnly: boolean;
  /** true when the stream carries both picture and sound */
  progressive: boolean;
};

export type YouTubeInfo = {
  id: string;
  title: string;
  author: string;
  duration: number;
  thumb?: string;
  streams: YouTubeStream[];
  /** best progressive (picture + sound) mp4, ready to drop on the timeline */
  best?: YouTubeStream;
  /** best audio-only stream, for soundtracks */
  audio?: YouTubeStream;
};

type PipedStream = { url?: string; mimeType?: string; quality?: string; videoOnly?: boolean; format?: string };
type PipedInfo = {
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnailUrl?: string;
  videoStreams?: PipedStream[];
  audioStreams?: PipedStream[];
};

function normaliseStreams(video: PipedStream[], audio: PipedStream[]): YouTubeStream[] {
  const all: YouTubeStream[] = [];
  for (const s of [...video, ...audio]) {
    if (!s.url || !s.mimeType) continue;
    if (s.mimeType.includes("mpegurl")) continue;
    const videoOnly = s.videoOnly === true;
    all.push({
      url: s.url,
      mimeType: s.mimeType,
      quality: s.quality ?? s.format ?? "unknown",
      videoOnly,
      progressive: s.mimeType.startsWith("video/") && !videoOnly,
    });
  }
  return all;
}

/** Resolve metadata and direct streams through Piped, then Invidious. */
export async function fetchYouTubeInfo(videoId: string): Promise<YouTubeInfo | null> {
  for (const host of PIPED_HOSTS) {
    const json = await getJson<PipedInfo>(`${host}/streams/${videoId}`, 14000);
    if (!json) continue;
    const streams = normaliseStreams(json.videoStreams ?? [], json.audioStreams ?? []);
    if (streams.length === 0) continue;
    const info: YouTubeInfo = {
      id: videoId,
      title: json.title ?? videoId,
      author: json.uploader ?? "",
      duration: json.duration ?? 0,
      streams,
    };
    if (json.thumbnailUrl) info.thumb = json.thumbnailUrl;
    const best = pickProgressive(streams);
    if (best) info.best = best;
    const audio = pickAudio(streams);
    if (audio) info.audio = audio;
    return info;
  }
  return fetchInvidiousInfo(videoId);
}

function pickProgressive(streams: YouTubeStream[]): YouTubeStream | undefined {
  const progressive = streams.filter((s) => s.progressive);
  const ranked = progressive.sort((a, b) => rankQuality(b.quality) - rankQuality(a.quality));
  return ranked.find((s) => rankQuality(s.quality) <= rankQuality("720p")) ?? ranked[0];
}

function pickAudio(streams: YouTubeStream[]): YouTubeStream | undefined {
  const audioOnly = streams.filter((s) => s.mimeType.startsWith("audio/") || s.videoOnly === false);
  return audioOnly.find((s) => s.mimeType.startsWith("audio/"));
}

function rankQuality(quality: string): number {
  const match = /(\d{3,4})p/.exec(quality);
  if (match?.[1]) return Number(match[1]);
  if (quality.includes("tiny") || quality.includes("240")) return 240;
  return 360;
}

type InvidiousFormat = {
  url?: string;
  itag?: string;
  type?: string;
  qualityLabel?: string;
  audioQuality?: string;
  encoding?: string;
  container?: string;
};
type InvidiousInfo = {
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ url?: string; quality?: string }>;
  formatStreams?: InvidiousFormat[];
  adaptiveFormats?: InvidiousFormat[];
};

async function fetchInvidiousInfo(videoId: string): Promise<YouTubeInfo | null> {
  for (const host of INVIDIOUS_HOSTS) {
    const json = await getJson<InvidiousInfo>(`${host}/api/v1/videos/${videoId}`, 14000);
    if (!json) continue;
    const streams: YouTubeStream[] = [];
    for (const f of json.formatStreams ?? []) {
      if (!f.url) continue;
      streams.push({
        url: f.url,
        mimeType: f.type ?? "video/mp4",
        quality: f.qualityLabel ?? "360p",
        videoOnly: false,
        progressive: true,
      });
    }
    for (const f of json.adaptiveFormats ?? []) {
      if (!f.url) continue;
      streams.push({
        url: f.url,
        mimeType: f.type ?? "video/mp4",
        quality: f.qualityLabel ?? f.audioQuality ?? "unknown",
        videoOnly: (f.type ?? "").startsWith("video/"),
        progressive: false,
      });
    }
    if (streams.length === 0) continue;
    const info: YouTubeInfo = {
      id: videoId,
      title: json.title ?? videoId,
      author: json.author ?? "",
      duration: json.lengthSeconds ?? 0,
      streams,
    };
    const thumb = json.videoThumbnails?.find((t) => t.quality === "medium")?.url ?? json.videoThumbnails?.[0]?.url;
    if (thumb) info.thumb = thumb;
    const best = pickProgressive(streams);
    if (best) info.best = best;
    const audio = pickAudio(streams);
    if (audio) info.audio = audio;
    return info;
  }
  return null;
}

type PipedSearch = { items?: Array<{ url?: string; title?: string; uploaderName?: string; duration?: number; thumbnail?: string; type?: string }> };
type InvidiousSearch = Array<{ videoId?: string; title?: string; author?: string; lengthSeconds?: number; videoThumbnails?: Array<{ url?: string }> }>;

/** Search YouTube for videos to import. */
export async function searchYouTube(query: string, limit = 18): Promise<AssetResult[]> {
  for (const host of PIPED_HOSTS) {
    const json = await getJson<PipedSearch>(
      `${host}/search?q=${encodeURIComponent(query)}&filter=videos`,
      14000,
    );
    if (!json?.items?.length) continue;
    const results: AssetResult[] = [];
    for (const item of json.items) {
      if (!item.url) continue;
      const id = item.url.replace(/^\/watch\?v=/, "").split("&")[0] ?? "";
      if (!id) continue;
      const result: AssetResult = {
        id: `youtube:${id}`,
        kind: "youtube",
        title: item.title ?? id,
        url: `https://www.youtube.com/watch?v=${id}`,
        source: "YouTube",
        page: `https://www.youtube.com/watch?v=${id}`,
      };
      if (item.thumbnail) result.thumb = item.thumbnail;
      if (item.uploaderName) result.author = item.uploaderName;
      if (item.duration) result.duration = item.duration;
      results.push(result);
    }
    if (results.length) return results;
  }
  for (const host of INVIDIOUS_HOSTS) {
    const json = await getJson<InvidiousSearch>(`${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, 14000);
    if (!json?.length) continue;
    return json.flatMap((item) => {
      if (!item.videoId) return [];
      const result: AssetResult = {
        id: `youtube:${item.videoId}`,
        kind: "youtube" as const,
        title: item.title ?? item.videoId,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        source: "YouTube",
        page: `https://www.youtube.com/watch?v=${item.videoId}`,
      };
      const thumb = item.videoThumbnails?.[0]?.url;
      if (thumb) result.thumb = thumb;
      if (item.author) result.author = item.author;
      if (item.lengthSeconds) result.duration = item.lengthSeconds;
      return [result];
    });
  }
  return [];
}

/** Turn a resolved YouTube stream into a media-pool-ready URL the editor can play. */
export function youtubeStreamUrl(stream: YouTubeStream): string {
  return proxied(stream.url);
}

/** Search every source at once, grouped by kind. */
export async function searchAll(query: string): Promise<AssetResult[]> {
  const [videos, audios, images, icons, youtube] = await Promise.all([
    searchCommons(query, "video", 12),
    searchOpenverse(query, "audio", 12),
    searchOpenverse(query, "image", 12),
    searchIcons(query, 24),
    searchYouTube(query, 12),
  ]);
  return [...youtube, ...videos, ...images, ...audios, ...icons];
}

/** Playable URL for an asset: YouTube streams and hotlink-hostile files go via the proxy. */
export function assetPlayableUrl(asset: AssetResult): string {
  if (asset.kind === "youtube") return asset.url;
  const needsProxy = /googlevideo\.com|odycdn\.com/.test(asset.url);
  return needsProxy ? proxied(asset.url) : asset.url;
}
