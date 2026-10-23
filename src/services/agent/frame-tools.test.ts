import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../stores/project-store";
import { EditingSession } from "./editing-session";
import { editingToolDefs, editingToolReadOnly, executeEditingTool } from "./editing-tools";

const captureFrameAt = vi.fn();
const captureFrameStrip = vi.fn();

vi.mock("../../bridges/render-bridge", () => ({
  getRenderBridge: () => ({ captureFrameAt, captureFrameStrip }),
}));

function schemaFor(name: string) {
  const definition = editingToolDefs("openai").find(
    (entry) => (entry as { function: { name: string } }).function.name === name,
  ) as { function: { parameters: Record<string, unknown>; description: string } } | undefined;
  return definition?.function;
}

describe("read-only frame viewing tools", () => {
  beforeEach(() => {
    captureFrameAt.mockReset();
    captureFrameStrip.mockReset();
    useProjectStore.getState().createNewProject("Frames");
    const { project } = useProjectStore.getState();
    useProjectStore.setState({
      project: {
        ...project,
        mediaLibrary: {
          items: [
            {
              id: "source-video",
              name: "source.mp4",
              type: "video",
              blob: new Blob(["fixture"]),
              fileHandle: null,
              thumbnailUrl: null,
              waveformData: null,
              metadata: {
                duration: 10, width: 640, height: 360, frameRate: 24,
                codec: "avc", sampleRate: 48000, channels: 2, fileSize: 7,
              },
            },
          ],
        },
      },
    });
  });

  it("exposes view_frame and view_frame_strip as read-only tools", () => {
    expect(schemaFor("view_frame")).toBeDefined();
    expect(schemaFor("view_frame_strip")).toBeDefined();
    expect(editingToolReadOnly("view_frame")).toBe(true);
    expect(editingToolReadOnly("view_frame_strip")).toBe(true);
    expect(schemaFor("view_frame")!.description).toMatch(/image the model can see/i);
  });

  it("returns a frame image and names the clips covering that instant", async () => {
    const session = new EditingSession();
    session.beginTransaction();
    const track = await executeEditingTool("add_track", { trackType: "video" }, session);
    const trackId = (track.data as { trackId: string }).trackId;
    const clip = await executeEditingTool("add_clip", { trackId, mediaId: "source-video", startTime: 2 }, session);
    const clipId = (clip.data as { clipId: string }).clipId;
    captureFrameAt.mockResolvedValue({ dataUrl: "data:image/png;base64,AAA", mimeType: "image/png", time: 3, width: 640, height: 360 });

    const result = await executeEditingTool("view_frame", { time: 3, maxEdge: 320 }, session);

    expect(result.ok, result.error?.message).toBe(true);
    expect(captureFrameAt).toHaveBeenCalledWith(3, 320);
    expect(result.image).toEqual({ dataUrl: "data:image/png;base64,AAA", mimeType: "image/png" });
    expect((result.data as { clipsAtTime: string[] }).clipsAtTime).toEqual([clipId]);
  });

  it("reports a clear failure when the renderer cannot produce the frame", async () => {
    const session = new EditingSession();
    captureFrameAt.mockResolvedValue(null);
    const result = await executeEditingTool("view_frame", { time: 1 }, session);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/could not render that frame/i);
  });

  it("rejects a strip whose range runs backwards before rendering", async () => {
    const session = new EditingSession();
    const result = await executeEditingTool("view_frame_strip", { fromSec: 5, toSec: 5 }, session);
    expect(result.ok).toBe(false);
    expect(captureFrameStrip).not.toHaveBeenCalled();
  });

  it("returns the sampled times for a strip", async () => {
    const session = new EditingSession();
    captureFrameStrip.mockResolvedValue({
      dataUrl: "data:image/png;base64,BBB",
      mimeType: "image/png",
      times: [0, 2.5, 5],
      cellEdge: 240,
    });

    const result = await executeEditingTool("view_frame_strip", { fromSec: 0, toSec: 5, frames: 3 }, session);

    expect(result.ok, result.error?.message).toBe(true);
    expect(captureFrameStrip).toHaveBeenCalledWith(0, 5, { frames: 3, cellEdge: 240 });
    expect((result.data as { times: number[] }).times).toEqual([0, 2.5, 5]);
    expect(result.image?.dataUrl).toBe("data:image/png;base64,BBB");
  });
});
