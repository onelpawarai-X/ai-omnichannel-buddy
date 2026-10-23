import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";

export type SettingsTab = "general" | "ai-editor" | "mcp";

export interface SettingsState {
  // General preferences
  autoSave: boolean;
  autoSaveInterval: number;
  language: string;

  /** Desktop MCP server: auto-allow destructive/expensive tools from trusted local clients. */
  mcpAutoAllowTrustedLocal: boolean;

  /** Agent chat: auto-approve destructive/expensive tools instead of prompting. */
  agentAutoConfirm: boolean;
  /** Agent chat: plan tools without applying mutations. */
  agentDryRun: boolean;

  // Session-scoped API caches (cleared on session lock, not persisted)

  // Settings dialog state
  settingsOpen: boolean;
  settingsTab: SettingsTab;

  // Actions
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (minutes: number) => void;
  setLanguage: (lang: string) => void;
  setMcpAutoAllowTrustedLocal: (enabled: boolean) => void;
  setAgentAutoConfirm: (enabled: boolean) => void;
  setAgentDryRun: (enabled: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        autoSave: true,
        autoSaveInterval: 5,
        language: "en",

        mcpAutoAllowTrustedLocal: true,
        agentAutoConfirm: false,
        agentDryRun: false,


        settingsOpen: false,
        settingsTab: "general" as SettingsTab,

        setAutoSave: (enabled: boolean) => set({ autoSave: enabled }),

        setAutoSaveInterval: (minutes: number) =>
          set({ autoSaveInterval: Math.max(1, Math.min(30, minutes)) }),

        setLanguage: (lang: string) => set({ language: lang }),


        setMcpAutoAllowTrustedLocal: (enabled: boolean) =>
          set({ mcpAutoAllowTrustedLocal: enabled }),

        setAgentAutoConfirm: (enabled: boolean) => set({ agentAutoConfirm: enabled }),

        setAgentDryRun: (enabled: boolean) => set({ agentDryRun: enabled }),



        openSettings: (tab?: SettingsTab) =>
          set({
            settingsOpen: true,
            settingsTab: tab ?? get().settingsTab,
          }),

        closeSettings: () => set({ settingsOpen: false }),
      }),
      {
        name: "openreel-settings",
        version: 8,
        migrate: (persisted) => {
          // Provider, endpoint, key and voice fields are gone: ZYRAXON is the
          // only provider and speech preferences live in their own store.
          const next = (persisted ?? {}) as Record<string, unknown>;
          delete next.defaultLlmProvider;
          delete next.llmBaseUrl;
          delete next.llmModel;
          delete next.openaiCompatibleBaseUrl;
          delete next.openaiCompatibleModel;
          delete next.favoriteVoices;
          delete next.favoriteModels;
          delete next.configuredServices;
          return next as unknown as SettingsState;
        },
        partialize: (state) => ({
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
          language: state.language,
          mcpAutoAllowTrustedLocal: state.mcpAutoAllowTrustedLocal,
          agentAutoConfirm: state.agentAutoConfirm,
          agentDryRun: state.agentDryRun,
        }),
      },
    ),
  ),
);

