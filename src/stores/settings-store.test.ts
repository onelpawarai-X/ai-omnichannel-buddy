import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings-store";

describe("settings store migrations", () => {
  afterEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ autoSave: true });
  });

  it("drops the removed provider, endpoint, key and voice fields", async () => {
    localStorage.setItem(
      "openreel-settings",
      JSON.stringify({
        version: 7,
        state: {
          autoSave: false,
          defaultLlmProvider: "openai-compatible",
          llmBaseUrl: "https://gateway.example/v1",
          llmModel: "account-tool-model",
          configuredServices: ["openai"],
          favoriteVoices: [{ voiceId: "en-US-AriaNeural", name: "Aria" }],
          favoriteModels: [{ modelId: "gpt-4o", name: "GPT-4o" }],
        },
      }),
    );

    await useSettingsStore.persist.rehydrate();

    const state = useSettingsStore.getState() as unknown as Record<string, unknown>;
    expect(state.autoSave).toBe(false);
    expect(state.defaultLlmProvider).toBeUndefined();
    expect(state.llmBaseUrl).toBeUndefined();
    expect(state.llmModel).toBeUndefined();
    expect(state.configuredServices).toBeUndefined();
    expect(state.favoriteVoices).toBeUndefined();
    expect(state.favoriteModels).toBeUndefined();
  });

  it("keeps unrelated preferences", async () => {
    localStorage.setItem(
      "openreel-settings",
      JSON.stringify({
        version: 7,
        state: { autoSave: false, autoSaveInterval: 12, language: "bn" },
      }),
    );

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState()).toMatchObject({
      autoSave: false,
      autoSaveInterval: 12,
      language: "bn",
    });
  });
});
