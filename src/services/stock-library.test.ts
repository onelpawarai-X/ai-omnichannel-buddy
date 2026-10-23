import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commonsSearch,
  iconifySearch,
  lottieSearch,
  mixkitCategory,
  openverseSearch,
  searchSource,
  youtubeSearch,
} from "./stock-library";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("stock catalogue clients", () => {
  it("maps a Mixkit shelf to importable assets", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) =>
      jsonResponse({
        results: [
          {
            id: "mixkit:52284",
            title: "Fire",
            url: "https://assets.mixkit.co/videos/52284/52284-720.mp4",
            thumb: "https://assets.mixkit.co/videos/52284/52284-thumb-360-0.jpg",
            hd: "https://assets.mixkit.co/videos/52284/52284-1080.mp4",
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [asset] = await mixkitCategory("fire", 12);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/stock?category=fire&limit=12");
    expect(asset).toMatchObject({
      id: "mixkit:52284",
      kind: "video",
      source: "mixkit",
      sourceLabel: "Mixkit",
      importUrl: "https://assets.mixkit.co/videos/52284/52284-720.mp4",
      hdUrl: "https://assets.mixkit.co/videos/52284/52284-1080.mp4",
    });
  });

  it("maps LottieFiles results to animation assets", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            id: "lottiefiles:abc",
            title: "Fire animation",
            url: "https://assets-v2.lottiefiles.com/a/abc/xyz.json",
            thumb: "https://assets-v2.lottiefiles.com/a/abc/thumb.png",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const [asset] = await lottieSearch("fire");

    expect(asset).toMatchObject({
      kind: "animation",
      importUrl: "https://assets-v2.lottiefiles.com/a/abc/xyz.json",
      previewUrl: "https://assets-v2.lottiefiles.com/a/abc/thumb.png",
    });
  });

  it("keeps only Commons files of the requested kind", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        query: {
          pages: {
            "1": {
              title: "File:Fire.webm",
              imageinfo: [{ url: "https://upload.wikimedia.org/fire.webm", mime: "video/webm", width: 1280, height: 720 }],
            },
            "2": {
              title: "File:Fire.jpg",
              imageinfo: [{ url: "https://upload.wikimedia.org/fire.jpg", mime: "image/jpeg" }],
            },
          },
        },
      }),
    ) as unknown as typeof fetch;

    const videos = await commonsSearch("fire", "video");

    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ kind: "video", importUrl: "https://upload.wikimedia.org/fire.webm" });
  });

  it("carries the creator and licence through from Openverse audio", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            id: "ov-1",
            title: "Rain",
            url: "https://cdn.example/rain.mp3",
            creator: "Someone",
            license: "cc0",
            duration: 42,
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const [asset] = await openverseSearch("rain", "audio");

    expect(asset).toMatchObject({
      kind: "audio",
      source: "openverse-audio",
      author: "Someone",
      license: "cc0",
      durationSec: 42,
      importUrl: "https://cdn.example/rain.mp3",
    });
  });

  it("turns Iconify names into downloadable SVGs", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ icons: ["mdi:fire"] })) as unknown as typeof fetch;

    const [asset] = await iconifySearch("fire");

    expect(asset).toMatchObject({
      kind: "icon",
      importUrl: "https://api.iconify.design/mdi/fire.svg?height=256",
      previewUrl: "https://api.iconify.design/mdi/fire.svg?height=96",
    });
  });

  it("states that a YouTube result imports its poster frame", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ items: [{ url: "/watch?v=abc123", title: "Clip", uploaderName: "Chan", duration: 30 }] }),
    ) as unknown as typeof fetch;

    const [asset] = await youtubeSearch("clip");

    expect(asset).toMatchObject({
      kind: "youtube",
      importUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      hdUrl: "https://i.ytimg.com/vi/abc123/maxresdefault.jpg",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      author: "Chan",
    });
    expect(asset.unavailable).toMatch(/poster frame/i);
  });

  it("returns an empty list instead of throwing when a source fails", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({}, false, 500)) as unknown as typeof fetch;
    await expect(commonsSearch("fire", "video")).resolves.toEqual([]);
  });

  it("needs a query for the search sources but not for a Mixkit shelf", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => jsonResponse({ results: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(searchSource("lottiefiles", "")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    await searchSource("mixkit", "");
    expect(String(fetchMock.mock.calls[0][0])).toContain("category=abstract");
  });
});
