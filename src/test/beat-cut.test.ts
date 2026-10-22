import { describe, expect, it } from "vitest";

import { applyOp, applyOps, emptyState } from "@/lib/engine/ops";
import { createClip, createTrack } from "@/lib/engine/model";
import type { TimelineState } from "@/lib/engine/ops";

/** Two tracks: V1 with a 4 s video, A1 with a 4 s music track that has 8 beats. */
function project(): { state: TimelineState; videoTrack: string; audioTrack: string; videoId: string; audioId: string } {
  const state = emptyState();
  const videoTrack = createTrack("video");
  const audioTrack = createTrack("audio");
  state.tracks = [videoTrack, audioTrack];
  state.media = [
    { id: "m_video", name: "clip.mp4", kind: "video", url: "blob:v", duration: 4 },
    { id: "m_music", name: "song.m4a", kind: "audio", url: "blob:a", duration: 4, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  ];
  state.clips = [
    createClip({ kind: "video", trackId: videoTrack.id, label: "clip.mp4", mediaId: "m_video", start: 0, duration: 4 }),
    createClip({ kind: "audio", trackId: audioTrack.id, label: "song.m4a", mediaId: "m_music", start: 0, duration: 4 }),
  ];
  return { state, videoTrack: videoTrack.id, audioTrack: audioTrack.id, videoId: "m_video", audioId: "m_music" };
}

describe("beat_cut", () => {
  it("cuts the video to the beats of the music track", () => {
    // The bug: beat_cut looked for clips belonging to the beat source. Music has
    // no clips of its own, so it gave up and the video was never cut.
    const { state } = project();
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music" });

    const videoClips = result.state.clips.filter((c) => c.kind === "video").sort((a, b) => a.start - b.start);
    expect(videoClips).toHaveLength(8);
    expect(videoClips.map((c) => +c.start.toFixed(2))).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(videoClips.every((c) => Math.abs(c.duration - 0.5) < 0.01)).toBe(true);
    // 8 beats, but the one at 0.00s sits on the clip edge, so 7 splits -> 8 clips.
    expect(result.notes.join(" ")).toContain("7 beat(s)");
  });

  it("leaves the audio track alone", () => {
    const { state, audioTrack } = project();
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music" });
    const audioClips = result.state.clips.filter((c) => c.trackId === audioTrack);
    expect(audioClips).toHaveLength(1);
    expect(audioClips[0]!.duration).toBe(4);
  });

  it("cuts a named target media", () => {
    const { state } = project();
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music", targetMediaId: "m_video" });
    expect(result.state.clips.filter((c) => c.kind === "video")).toHaveLength(8);
  });

  it("cuts only the named clip", () => {
    const { state } = project();
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music", clipId: state.clips[0]!.id });
    const videoClips = result.state.clips.filter((c) => c.kind === "video");
    expect(videoClips).toHaveLength(8);
    expect(result.state.clips.filter((c) => c.kind === "audio")).toHaveLength(1);
  });

  it("refuses a source with fewer than two beats, and says why", () => {
    const { state } = project();
    state.media[1]!.beats = [1];
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music" });
    expect(result.state.clips.filter((c) => c.kind === "video")).toHaveLength(1);
    expect(result.notes.join(" ")).toContain("at least 2 beats");
  });

  it("ignores beats that fall outside the clip", () => {
    const { state } = project();
    state.media[1]!.beats = [0.5, 1, 1.5, 99];
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music" });
    const videoClips = result.state.clips.filter((c) => c.kind === "video");
    expect(videoClips).toHaveLength(4);
    expect(Math.max(...videoClips.map((c) => c.start + c.duration))).toBeCloseTo(4, 2);
  });

  it("is a no-op when nothing can be cut", () => {
    const { state } = project();
    state.clips = state.clips.filter((c) => c.kind !== "video");
    const result = applyOp(state, { op: "beat_cut", mediaId: "m_music" });
    expect(result.state.clips.filter((c: { kind: string }) => c.kind === "video")).toHaveLength(0);
    expect(result.notes.join(" ")).toContain("no clip");
  });
});

describe("applyOps", () => {
  it("reports a created clip id for the caller to reuse", () => {
    const { state, videoTrack } = project();
    const result = applyOps(state, [
      { op: "add_clip", clip: { kind: "video", trackId: videoTrack, label: "b-roll", mediaId: "m_video", start: 6, duration: 1 } },
    ]);
    expect(result.createdClipId).toBeTruthy();
  });
});
