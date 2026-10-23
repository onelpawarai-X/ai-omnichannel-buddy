import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockShelfPanel } from "./StockShelfPanel";

const realFetch = globalThis.fetch;

vi.mock("../../../stores/project-store", () => ({
  useProjectStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        importMedia: vi.fn(async () => ({ success: true, actionId: "m1" })),
        addClipToNewTrack: vi.fn(async () => ({ success: true })),
        upsertMotionComposition: vi.fn(async () => ({ success: true })),
      }),
    },
  ),
}));

vi.mock("../../../stores/timeline-store", () => ({
  useTimelineStore: (selector: (state: { playheadPosition: number }) => unknown) =>
    selector({ playheadPosition: 0 }),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("StockShelfPanel", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  it("loads a Mixkit shelf on first paint and lists the source switches", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            id: "mixkit:1",
            title: "Blazing fire",
            url: "https://assets.mixkit.co/videos/1/1-720.mp4",
            thumb: "https://assets.mixkit.co/videos/1/1-thumb.jpg",
            hd: "https://assets.mixkit.co/videos/1/1-1080.mp4",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    render(<StockShelfPanel />);

    expect(await screen.findByText("Blazing fire")).toBeInTheDocument();
    for (const label of ["Footage & effects", "Animations", "Wikimedia", "Images", "Music & SFX", "Icons", "YouTube"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(String((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]))
      .toContain("category=abstract");
  });

  it("searches the animation library when that source is chosen", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("/api/lottie")) {
        return jsonResponse({
          results: [
            {
              id: "lottiefiles:abc",
              title: "Fire animation",
              url: "https://assets-v2.lottiefiles.com/a/abc/x.json",
              thumb: "https://assets-v2.lottiefiles.com/a/abc/t.png",
            },
          ],
        });
      }
      return jsonResponse({ results: [] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<StockShelfPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Animations/ }));
    await userEvent.type(screen.getByLabelText("Search stock libraries"), "fire{Enter}");

    expect(await screen.findByText("Fire animation")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/lottie?q=fire"))).toBe(true);
  });

  it("explains an unavailable source instead of offering a dead button", async () => {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      if (String(input).includes("/trending")) {
        return jsonResponse({ items: [{ url: "/watch?v=abc", title: "Clip", uploaderName: "Chan" }] });
      }
      return jsonResponse({ results: [] });
    }) as unknown as typeof fetch;

    render(<StockShelfPanel />);
    await userEvent.click(screen.getByRole("button", { name: /YouTube/ }));

    await waitFor(() => expect(screen.getByText("Clip")).toBeInTheDocument());
    expect(screen.getAllByText(/poster frame/i).length).toBeGreaterThan(0);
  });
});
