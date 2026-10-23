import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AI_PROVIDER_DEFAULTS,
  ZYRAXON_MODELS,
  providerPreset,
  pickDefaultModel,
  resolveWire,
  type AIProviderId,
  type AIWireFormat,
} from "./ai-provider-catalog";

export { AI_PROVIDER_DEFAULTS, resolveWire };
export type { AIProviderId, AIWireFormat };
/** Legacy alias: the provider id the connection currently targets. */
export type AIProvider = AIProviderId;

interface AIConnectionState {
  /** Always ZYRAXON; kept in state so older callers keep compiling. */
  readonly provider: AIProviderId;
  readonly baseUrl: string;
  model: string;
  /** Choose the editing model from anywhere; the chat box calls this too. */
  setModel: (model: string) => void;
  configure: (
    options: Partial<Pick<AIConnectionState, "provider" | "baseUrl" | "model">>,
  ) => void;
  reset: () => void;
}

const DEFAULT_PROVIDER: AIProviderId = "zyraxon";
const defaultPreset = providerPreset(DEFAULT_PROVIDER);

/** A persisted model must still exist in the catalogue, or we fall back. */
function isKnownModel(model: string): boolean {
  return ZYRAXON_MODELS.some((option) => option.id === model);
}

/**
 * The gateway is permanent, so only the model choice is worth remembering.
 * There is no key and no endpoint to store: `baseUrl` is a constant and
 * `provider` can never change.
 */
export const useAIConnectionStore = create<AIConnectionState>()(
  persist(
    (set) => ({
      provider: DEFAULT_PROVIDER,
      baseUrl: defaultPreset.baseUrl,
      model: pickDefaultModel(),
      setModel: (model) =>
        set({ model: isKnownModel(model) ? model : pickDefaultModel() }),
      configure: (options) =>
        set((state) => ({
          ...state,
          ...options,
          provider: DEFAULT_PROVIDER,
          baseUrl: defaultPreset.baseUrl,
          model:
            options.model !== undefined
              ? isKnownModel(options.model)
                ? options.model
                : pickDefaultModel()
              : state.model,
        })),
      reset: () => set({ model: pickDefaultModel() }),
    }),
    {
      name: "openreel-zyraxon-connection",
      version: 1,
      partialize: (state) => ({ model: state.model }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as { model?: unknown };
        return {
          ...current,
          model:
            typeof saved.model === "string" && isKnownModel(saved.model)
              ? saved.model
              : current.model,
        };
      },
    },
  ),
);
