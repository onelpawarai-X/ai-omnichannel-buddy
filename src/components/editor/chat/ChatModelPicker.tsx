import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Settings, RefreshCw } from "@/icons/lucide-compat";
import {
  AI_PROVIDER_PRESETS,
  modelsForProvider,
  providerPreset,
  type AIModelOption,
  type AIProviderId,
} from "../../../stores/ai-provider-catalog";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { useSettingsStore } from "../../../stores/settings-store";
import { discoverCompatibleModels } from "../../../services/agent/model-discovery";

/**
 * Compact provider + model picker for the chat header, so the model can be
 * switched without leaving the conversation. Full configuration (keys, custom
 * URLs) stays in Settings → AI Editor.
 */
export function ChatModelPicker({ disabled = false }: { disabled?: boolean }): JSX.Element {
  const connection = useAIConnectionStore();
  const openSettings = useSettingsStore((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<readonly AIModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setLive([]);
  }, [connection.provider, connection.baseUrl]);

  const preset = providerPreset(connection.provider);
  const models = live.length ? live : modelsForProvider(connection.provider);
  const options = models.some((m) => m.id === connection.model) || !connection.model
    ? models
    : [{ id: connection.model, label: connection.model, inputModalities: ["text"] as const }, ...models];

  const chooseProvider = (provider: AIProviderId) => {
    const next = providerPreset(provider);
    connection.configure({ provider, baseUrl: next.baseUrl, model: next.defaultModel, apiKey: "" });
    setLive([]);
  };

  const loadModels = async () => {
    setLoading(true);
    try {
      const discovered = await discoverCompatibleModels({
        provider: preset.wire === "anthropic" ? "anthropic-compatible" : "openai-compatible",
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
      });
      setLive(discovered.map((m) => ({ id: m.id, label: m.label, inputModalities: ["text"] as const })));
      if (discovered.length && !discovered.some((m) => m.id === connection.model)) {
        connection.configure({ model: discovered[0].id });
      }
    } catch {
      // Full error reporting lives in Settings → AI Editor.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${preset.label} · ${connection.model || "no model"}`}
        className="flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-bg-2 px-1.5 py-1 text-[10px] text-fg-2 transition-colors hover:border-border-strong hover:text-fg disabled:opacity-40"
      >
        <span className="truncate font-medium">{connection.model || "Select model"}</span>
        <ChevronDown size={10} className="shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-border bg-bg-1 p-1.5 shadow-lg"
        >
          <div className="px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-fg-muted">
            Provider
          </div>
          {AI_PROVIDER_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === connection.provider}
              onClick={() => chooseProvider(option.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-fg-2 hover:bg-hover hover:text-fg"
            >
              <Check
                size={11}
                className={`shrink-0 ${option.id === connection.provider ? "text-accent" : "opacity-0"}`}
                aria-hidden
              />
              <span className="truncate">{option.label}</span>
              {option.keyless && <span className="ml-auto shrink-0 text-[9px] text-fg-muted">no key</span>}
            </button>
          ))}

          <div className="mt-1 flex items-center justify-between border-t border-border px-1.5 py-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-fg-muted">Model</span>
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={loading}
              className="flex items-center gap-1 text-[9px] text-accent hover:underline disabled:opacity-50"
            >
              <RefreshCw size={9} className={loading ? "animate-spin" : ""} aria-hidden />
              {loading ? "Loading" : "Load"}
            </button>
          </div>

          {options.length === 0 && (
            <p className="px-1.5 py-1 text-[10px] text-fg-muted">
              No preset models — type an ID in Settings.
            </p>
          )}
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === connection.model}
              onClick={() => {
                connection.configure({ model: option.id });
                setOpen(false);
              }}
              title={option.description ?? option.id}
              className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-hover"
            >
              <Check
                size={11}
                className={`mt-0.5 shrink-0 ${option.id === connection.model ? "text-accent" : "opacity-0"}`}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[11px] text-fg-2">{option.label}</span>
                {option.inputModalities.length > 1 && (
                  <span className="block truncate text-[9px] text-fg-muted">
                    reads {option.inputModalities.join(", ")}
                  </span>
                )}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openSettings("ai-editor");
            }}
            className="mt-1 flex w-full items-center gap-1.5 border-t border-border px-1.5 py-1.5 text-left text-[10px] text-fg-2 hover:text-fg"
          >
            <Settings size={11} aria-hidden />
            API keys, base URL, custom model…
          </button>
        </div>
      )}
    </div>
  );
}
