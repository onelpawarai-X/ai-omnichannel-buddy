import { create } from "zustand";
import {
  AI_PROVIDER_DEFAULTS,
  providerPreset,
  resolveWire,
  type AIProviderId,
  type AIWireFormat,
} from "./ai-provider-catalog";

export { AI_PROVIDER_DEFAULTS, resolveWire };
export type { AIProviderId, AIWireFormat };
/** Legacy alias: the provider id the connection currently targets. */
export type AIProvider = AIProviderId;

interface AIConnectionState {
  provider: AIProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  configure: (
    options: Partial<Pick<AIConnectionState, "provider" | "baseUrl" | "model" | "apiKey">>,
  ) => void;
  forgetKey: () => void;
}

const DEFAULT_PROVIDER: AIProviderId = "zyraxon";
const defaultPreset = providerPreset(DEFAULT_PROVIDER);

/**
 * Intentionally no persistence: keys and connection details stay in this tab.
 * Defaults to the keyless ZYRAXON gateway so the editor is usable immediately.
 */
export const useAIConnectionStore = create<AIConnectionState>((set) => ({
  provider: DEFAULT_PROVIDER,
  baseUrl: defaultPreset.baseUrl,
  model: defaultPreset.defaultModel,
  apiKey: "",
  configure: (options) => set(options),
  forgetKey: () => set({ apiKey: "" }),
}));
