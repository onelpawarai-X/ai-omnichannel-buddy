import { describe, expect, it } from "vitest";
import {
  DEFAULT_DICTATION_LANGUAGE,
  DICTATION_LANGUAGES,
  isDictationLanguage,
  voiceForLanguage,
} from "./dictation-languages";

describe("dictation languages", () => {
  it("starts in Bengali, the language the agent answers in", () => {
    expect(DEFAULT_DICTATION_LANGUAGE).toBe("bn-BD");
    expect(voiceForLanguage(DEFAULT_DICTATION_LANGUAGE)).toBe("bn-BD-NabanitaNeural");
  });

  it("pairs every recogniser tag with a narration voice", () => {
    for (const language of DICTATION_LANGUAGES) {
      expect(language.code).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(language.label.length).toBeGreaterThan(0);
      expect(language.voice).toMatch(/^[a-z]{2}-[A-Z]{2}-\w+Neural$/);
      expect(language.voice.startsWith(language.code)).toBe(true);
    }
  });

  it("keeps tags unique so a language maps to exactly one voice", () => {
    const codes = DICTATION_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(isDictationLanguage("bn-BD")).toBe(true);
    expect(isDictationLanguage("xx-XX")).toBe(false);
  });

  it("falls back to a known voice rather than an empty string", () => {
    expect(voiceForLanguage("xx-XX")).toBe("en-US-AriaNeural");
  });
});
