import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MotionShaderDef } from "@openreel/core";
import {
  clearGeneratedMotionShaders,
  getMotionShaderDef,
} from "@openreel/core/motion/shaders";
import { createEmptyProject } from "../../stores/project/project-helpers";
import { useProjectStore } from "../../stores/project-store";
import { useAIConnectionStore } from "../../stores/ai-connection-store";
import { pickDefaultModel } from "../../stores/ai-provider-catalog";

const generateAiShaderMock = vi.fn();
const makeZyraxonClientMock = vi.fn();

vi.mock("../../services/ai-shader", () => ({
  generateAiShader: (...args: unknown[]) => generateAiShaderMock(...args),
}));

vi.mock("../../services/agent/zyraxon-transport", () => ({
  makeZyraxonClient: (...args: unknown[]) => makeZyraxonClientMock(...args),
}));

import { GenerateShaderBox } from "./GenerateShaderBox";

function sampleDef(): MotionShaderDef {
  return {
    id: "ai-holographic-foil-abcd1234",
    name: "Holographic Foil",
    category: "fill",
    glsl: "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 fragColor;\nvoid main(){fragColor=vec4(vUv,0.0,1.0);}",
    params: [],
    origin: "generated",
  };
}

describe("GenerateShaderBox", () => {
  beforeEach(() => {
    generateAiShaderMock.mockReset();
    makeZyraxonClientMock.mockReset();
    clearGeneratedMotionShaders();

    makeZyraxonClientMock.mockReturnValue({
      complete: vi.fn().mockResolvedValue({ text: "{}", toolUses: [], stopReason: "end_turn" }),
    });
    useAIConnectionStore.setState({ model: pickDefaultModel() });

    useProjectStore.setState({
      hasOpenProject: true,
      project: createEmptyProject("Generate shader test"),
    });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState({ hasOpenProject: false });
    clearGeneratedMotionShaders();
  });

  it("generates, registers, dispatches and reports the def", async () => {
    const def = sampleDef();
    generateAiShaderMock.mockResolvedValue({ ok: true, def });
    const onGenerated = vi.fn();

    render(<GenerateShaderBox category="fill" onGenerated={onGenerated} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Describe a shader, e.g. holographic foil" }), {
      target: { value: "holographic foil" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate shader" }));

    expect(screen.getByText("Generating shader...")).toBeTruthy();

    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledWith(def);
    });

    expect(generateAiShaderMock).toHaveBeenCalledTimes(1);
    expect(generateAiShaderMock.mock.calls[0][0]).toBe("holographic foil");
    expect(generateAiShaderMock.mock.calls[0][1]).toBe("fill");
    expect(getMotionShaderDef(def.id)?.id).toBe(def.id);
    expect(makeZyraxonClientMock).toHaveBeenCalledWith({ model: pickDefaultModel() });

    const project = useProjectStore.getState().project;
    expect((project.generatedShaders ?? []).some((entry) => entry.id === def.id)).toBe(true);
  });

  it("uses the model currently chosen in the chat box", async () => {
    const def = sampleDef();
    generateAiShaderMock.mockResolvedValue({ ok: true, def });
    useAIConnectionStore.setState({ model: "zyraxon-codex" });

    render(<GenerateShaderBox category="fill" onGenerated={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a shader, e.g. holographic foil" }), {
      target: { value: "iridescent foil" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate shader" }));

    await waitFor(() => expect(generateAiShaderMock).toHaveBeenCalledOnce());
    expect(makeZyraxonClientMock).toHaveBeenCalledWith({ model: "zyraxon-codex" });
  });

  it("guards when no model is selected", async () => {
    const onGenerated = vi.fn();
    useAIConnectionStore.setState({ model: "" });

    render(<GenerateShaderBox category="fill" onGenerated={onGenerated} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a shader, e.g. holographic foil" }), {
      target: { value: "holographic foil" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate shader" }));

    await waitFor(() => {
      expect(screen.getByText("Pick a ZYRAXON model in the chat box")).toBeTruthy();
    });

    expect(generateAiShaderMock).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });
});
