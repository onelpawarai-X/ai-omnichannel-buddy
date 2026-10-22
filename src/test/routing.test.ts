import { describe, expect, it } from "vitest";

import { pickDefaultModel, routeModel, describeCapability, toCapability } from "@/lib/engine/routing";
import type { ZyraxonModel } from "@/lib/zyraxon";

const model = (id: string, modalities: ZyraxonModel["input_modalities"], context = 128_000): ZyraxonModel => ({
  id,
  name: id,
  description: "",
  input_modalities: modalities,
  context_window: context,
  max_output_tokens: 4096,
  reasoning: false,
});

// The catalogue as the provider actually serves it: no model advertises audio.
const CATALOGUE: ZyraxonModel[] = [
  model("zyraxon-apex", ["text"], 1_000_000),
  model("zyraxon-matrix", ["text", "image"]),
  model("zyraxon-pulse", ["text"]),
  model("zyraxon-titan", ["text", "image", "video"]),
  model("zyraxon-cyber", ["text", "image", "video"], 200_000),
  model("zyraxon-visionary", ["text", "image", "video", "pdf"]),
];

describe("model routing", () => {
  it("picks a default that reads text, image and video", () => {
    const picked = pickDefaultModel(CATALOGUE);
    expect(picked).toBeDefined();
    const chosen = CATALOGUE.find((m) => m.id === picked)!;
    expect(chosen.input_modalities).toContain("image");
    expect(chosen.input_modalities).toContain("video");
  });

  it("routes a video task to a model that advertises video", () => {
    const picked = routeModel(CATALOGUE, "video");
    expect(["zyraxon-titan", "zyraxon-cyber", "zyraxon-visionary"]).toContain(picked);
  });

  it("routes a vision task only to models that read images", () => {
    const picked = routeModel(CATALOGUE, "vision");
    const chosen = CATALOGUE.find((m) => m.id === picked)!;
    expect(chosen.input_modalities).toContain("image");
  });

  it("never routes audio, because no model accepts it", () => {
    // "audio" is not a TaskKind on purpose: sound is sent as a spectrogram image.
    const picked = routeModel(CATALOGUE, "vision");
    expect(picked).not.toBe("zyraxon-apex");
  });

  it("respects the exclusion list so a job is not handed back to the caller", () => {
    const picked = routeModel(CATALOGUE, "video", { exclude: ["zyraxon-titan", "zyraxon-visionary"] });
    expect(picked).toBe("zyraxon-cyber");
  });

  it("falls back to the preference when nothing can do the job", () => {
    const textOnly = [model("zyraxon-apex", ["text"])];
    expect(routeModel(textOnly, "video", { prefer: "zyraxon-apex" })).toBe("zyraxon-apex");
  });

  it("describes capability in a way the UI can print", () => {
    const line = describeCapability(toCapability(model("zyraxon-cyber", ["text", "image", "video"], 200_000)));
    expect(line).toContain("image");
    expect(line).toContain("200K");
  });

  it("survives the bare placeholder the UI renders before the catalogue loads", () => {
    const placeholder = { id: "zyraxon-cyber", name: "zyraxon-cyber" } as unknown as ZyraxonModel;
    expect(() => describeCapability(toCapability(placeholder))).not.toThrow();
    expect(describeCapability(toCapability(placeholder))).toContain("text");
  });

  it("flags a model that claims audio, since the provider drops it", () => {
    const line = describeCapability(toCapability(model("zyraxon-ghost", ["text", "audio"])));
    expect(line).toContain("dropped");
  });
});
