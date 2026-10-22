import { createFileRoute } from "@tanstack/react-router";

const PIPED_HOSTS = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.yt",
];

const INVIDIOUS_HOSTS = ["https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://yewtu.be"];

type Stream = { url: string; mimeType: string; quality: string; videoOnly: boolean; progressive: boolean };

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;
  for (const pattern of [
    /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ]) {
    const match = pattern.exec(value);
    if (match?.[1]) return match[1];
  }
  return null;
}

function rank(quality: string): number {
  const match = /(\d{3,4})p/.exec(quality);
  if (match?.[1]) return Number(match[1]);
  return 360;
}

async function getJson<T>(url: string, ms = 12000): Promise<T | null> {
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

type PipedStream = { url?: string; mimeType?: string; quality?: string; videoOnly?: boolean; format?: string };
type PipedInfo = {
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnailUrl?: string;
  videoStreams?: PipedStream[];
  audioStreams?: PipedStream[];
};

function collect(video: PipedStream[], audio: PipedStream[]): Stream[] {
  const out: Stream[] = [];
  for (const s of [...video, ...audio]) {
    if (!s.url || !s.mimeType || s.mimeType.includes("mpegurl")) continue;
    const videoOnly = s.videoOnly === true;
    out.push({
      url: s.url,
      mimeType: s.mimeType,
      quality: s.quality ?? s.format ?? "unknown",
      videoOnly,
      progressive: s.mimeType.startsWith("video/") && !videoOnly,
    });
  }
  return out;
}

/** Picks the best progressive stream, preferring 720p or lower for smooth playback. */
function bestVideo(streams: Stream[]): Stream | undefined {
  const ranked = streams.filter((s) => s.progressive).sort((a, b) => rank(b.quality) - rank(a.quality));
  return ranked.find((s) => rank(s.quality) <= 720) ?? ranked[0];
}

function bestAudio(streams: Stream[]): Stream | undefined {
  return streams.find((s) => s.mimeType.startsWith("audio/"));
}

/** Resolve a YouTube id into metadata plus playable, server-proxied stream URLs. */
export const Route = createFileRoute("/api/youtube")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const input = new URL(request.url).searchParams.get("url") ?? "";
        const id = parseVideoId(input);
        if (!id) return Response.json({ error: "could not read a YouTube video id" }, { status: 400 });

        for (const host of PIPED_HOSTS) {
          const json = await getJson<PipedInfo>(`${host}/streams/${id}`, 14000);
          if (!json) continue;
          const streams = collect(json.videoStreams ?? [], json.audioStreams ?? []);
          if (streams.length === 0) continue;
          const video = bestVideo(streams);
          const audio = bestAudio(streams);
          return Response.json({
            id,
            title: json.title ?? id,
            author: json.uploader ?? "",
            duration: json.duration ?? 0,
            thumb: json.thumbnailUrl ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            video: video ? { ...video, url: `/api/media?url=${encodeURIComponent(video.url)}` } : null,
            audio: audio ? { ...audio, url: `/api/media?url=${encodeURIComponent(audio.url)}` } : null,
            source: host,
          });
        }

        for (const host of INVIDIOUS_HOSTS) {
          const json = await getJson<{
            title?: string;
            author?: string;
            lengthSeconds?: number;
            formatStreams?: Array<{ url?: string; type?: string; qualityLabel?: string }>;
          }>(`${host}/api/v1/videos/${id}`, 14000);
          if (!json?.formatStreams?.length) continue;
          const streams: Stream[] = json.formatStreams.flatMap((f) =>
            f.url
              ? [{ url: f.url, mimeType: f.type ?? "video/mp4", quality: f.qualityLabel ?? "360p", videoOnly: false, progressive: true }]
              : [],
          );
          const video = bestVideo(streams);
          if (!video) continue;
          return Response.json({
            id,
            title: json.title ?? id,
            author: json.author ?? "",
            duration: json.lengthSeconds ?? 0,
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            video: { ...video, url: `/api/media?url=${encodeURIComponent(video.url)}` },
            audio: null,
            source: host,
          });
        }

        return Response.json({ error: "no resolver could reach this video" }, { status: 502 });
      },
    },
  },
});
