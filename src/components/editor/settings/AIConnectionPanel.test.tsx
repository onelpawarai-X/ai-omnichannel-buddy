import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIConnectionPanel } from "./AIConnectionPanel";
import {
  ZYRAXON_MODELS,
  pickDefaultModel,
} from "../../../stores/ai-provider-catalog";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { useSpeechSettingsStore } from "../../../stores/speech-settings-store";

beforeEach(() => {
  useAIConnectionStore.setState({ model: pickDefaultModel() });
  useSpeechSettingsStore.setState({ dictationLanguage: "bn-BD" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ZYRAXON connection settings", () => {
  it("offers every catalogue model with no provider or key controls", () => {
    render(<AIConnectionPanel />);
    const select = screen.getByLabelText("ZYRAXON model");
    for (const option of ZYRAXON_MODELS) {
      expect(screen.getByRole("option", { name: new RegExp(option.label) })).toBeInTheDocument();
    }
    expect(select).toHaveValue(pickDefaultModel());
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByLabelText(/base url/i)).toBeNull();
    expect(screen.queryByLabelText(/provider/i)).toBeNull();
  });

  it("changes the editing model and remembers it", () => {
    render(<AIConnectionPanel />);
    fireEvent.change(screen.getByLabelText("ZYRAXON model"), {
      target: { value: "zyraxon-pulse" },
    });
    expect(useAIConnectionStore.getState().model).toBe("zyraxon-pulse");
  });

  it("sets the dictation language, which also repoints the narration voice", () => {
    render(<AIConnectionPanel />);
    fireEvent.change(screen.getByLabelText("Dictation language"), {
      target: { value: "hi-IN" },
    });
    expect(useSpeechSettingsStore.getState()).toMatchObject({
      dictationLanguage: "hi-IN",
      narrationVoice: "hi-IN-SwaraNeural",
    });
  });
});
