import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_DICTATION_LANGUAGE,
  isDictationLanguage,
  voiceForLanguage,
} from "../config/dictation-languages";

interface SpeechSettingsState {
  /** BCP-47 tag the browser recogniser listens in. */
  dictationLanguage: string;
  /** ZYRAXON voice used for narration. */
  narrationVoice: string;
  setDictationLanguage: (code: string) => void;
  setNarrationVoice: (voice: string) => void;
}

/**
 * Speech preferences are worth remembering, unlike the old per-tab keys: the
 * user picks a language once and the microphone keeps using it.
 */
export const useSpeechSettingsStore = create<SpeechSettingsState>()(
  persist(
    (set) => ({
      dictationLanguage: DEFAULT_DICTATION_LANGUAGE,
      narrationVoice: voiceForLanguage(DEFAULT_DICTATION_LANGUAGE),
      setDictationLanguage: (code) =>
        set((state) =>
          isDictationLanguage(code)
            ? { dictationLanguage: code, narrationVoice: voiceForLanguage(code) }
            : state,
        ),
      setNarrationVoice: (voice) => set({ narrationVoice: voice }),
    }),
    {
      name: "openreel-speech-settings",
      version: 1,
      partialize: (state) => ({
        dictationLanguage: state.dictationLanguage,
        narrationVoice: state.narrationVoice,
      }),
    },
  ),
);
