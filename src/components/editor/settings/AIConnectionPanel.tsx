import { useCallback, useEffect, useRef, useState } from "react";
import { ToolcraftButton as Button } from "@openreel/ui";
import {
  AI_PROVIDER_PRESETS,
  modelsForProvider,
  providerPreset,
  type AIProviderId,
  type AIModelOption,
} from "../../../stores/ai-provider-catalog";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { discoverCompatibleModels } from "../../../services/agent/model-discovery";

const inputClass = "mt-1.5 w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50";

const MODALITY_BADGE: Record<string, string> = {
  text: "text", image: "image", video: "video", audio: "audio", pdf: "pdf",
};

export function AIConnectionPanel({ disabled = false }: { disabled?: boolean }) {
  const connection = useAIConnectionStore();
  const preset = providerPreset(connection.provider);
  const known = modelsForProvider(connection.provider);
  const [live, setLive] = useState<readonly AIModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Live-discovered models belong to the endpoint, so drop them on any change
  // of provider or URL rather than showing another endpoint's catalogue.
  useEffect(() => {
    setLive([]);
    setStatus(null);
  }, [connection.provider, connection.baseUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const models: readonly AIModelOption[] = live.length ? live : known;
  const options = models.some((m) => m.id === connection.model) || !connection.model
    ? models
    : [{ id: connection.model, label: connection.model, inputModalities: ["text"] as const }, ...models];

  const chooseProvider = useCallback(
    (provider: AIProviderId) => {
      const next = providerPreset(provider);
      connection.configure({
        provider,
        baseUrl: next.baseUrl,
        model: next.defaultModel,
        apiKey: "",
      });
      setStatus(null);
    },
    [connection],
  );

  const loadModels = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setStatus(null);
    try {
      const discovered = await discoverCompatibleModels({
        provider: preset.wire === "anthropic" ? "anthropic-compatible" : "openai-compatible",
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setLive(discovered.map((m) => ({ id: m.id, label: m.label, inputModalities: ["text"] as const })));
      setStatus(`Loaded ${discovered.length} model${discovered.length === 1 ? "" : "s"} from the endpoint.`);
      if (discovered.length && !discovered.some((m) => m.id === connection.model)) {
        connection.configure({ model: discovered[0].id });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(error instanceof Error ? error.message : "Could not load models.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [connection, preset.wire]);

  const selected = options.find((m) => m.id === connection.model);

  return (
    <div className="space-y-4 text-xs">
      <label className="block text-fg-2">Provider
        <select
          aria-label="AI provider"
          className={inputClass}
          disabled={disabled}
          value={connection.provider}
          onChange={(e) => chooseProvider(e.target.value as AIProviderId)}
        >
          {AI_PROVIDER_PRESETS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}{option.keyless ? " · no key" : ""}
            </option>
          ))}
        </select>
      </label>

      {preset.note && (
        <p className="rounded-md border border-border bg-bg-2/60 px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
          {preset.note}
        </p>
      )}

      <div>
        <div className="flex items-end gap-2">
          <label className="block flex-1 text-fg-2">Model
            <select
              aria-label="AI model ID"
              className={inputClass}
              disabled={disabled}
              value={connection.model}
              onChange={(e) => connection.configure({ model: e.target.value })}
            >
              {!connection.model && <option value="">Choose a model…</option>}
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}{option.label !== option.id ? ` — ${option.id}` : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            label={loading ? "Loading…" : "Load models"}
            variant="secondary"
            size="sm"
            onClick={() => void loadModels()}
            isDisabled={disabled || loading || !connection.baseUrl.trim()}
            className="mb-0.5 shrink-0"
          />
        </div>
        {selected && (selected.description || selected.inputModalities.length) && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
            {selected.description}
            {selected.inputModalities.length > 1 && (
              <>
                {selected.description ? " · " : ""}
                reads {selected.inputModalities.map((m) => MODALITY_BADGE[m] ?? m).join(", ")}
              </>
            )}
            {selected.contextWindow ? ` · ${(selected.contextWindow / 1000).toFixed(0)}K context` : ""}
          </p>
        )}
        <label className="mt-2 block text-fg-2">Custom model ID
          <input
            aria-label="Custom model ID"
            className={inputClass}
            disabled={disabled}
            value={connection.model}
            placeholder="type any model id the endpoint serves"
            onChange={(e) => connection.configure({ model: e.target.value })}
            spellCheck={false}
          />
        </label>
      </div>

      <label className="block text-fg-2">Base URL
        <input
          aria-label="AI base URL"
          className={inputClass}
          disabled={disabled}
          value={connection.baseUrl}
          onChange={(e) => connection.configure({ baseUrl: e.target.value })}
          spellCheck={false}
        />
      </label>

      <label className="block text-fg-2">
        {preset.keyless ? "API key (optional)" : "Session API key"}
        <input
          aria-label="Session API key"
          type="password"
          autoComplete="off"
          className={inputClass}
          disabled={disabled}
          value={connection.apiKey}
          placeholder={preset.keyless ? "not needed for this provider" : "paste your key"}
          onChange={(e) => connection.configure({ apiKey: e.target.value })}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        {connection.apiKey && (
          <button type="button" disabled={disabled} className="text-accent underline" onClick={connection.forgetKey}>
            Forget key
          </button>
        )}
        {preset.keyUrl && (
          <a href={preset.keyUrl} target="_blank" rel="noreferrer noopener" className="text-accent underline">
            Get an API key
          </a>
        )}
      </div>

      {status && (
        <p role="status" className="text-[11px] leading-relaxed text-fg-muted">{status}</p>
      )}

      <p className="text-[11px] leading-relaxed text-fg-muted">
        Your key stays in this tab and clears on reload. Attachments you add are sent straight to the
        selected model, so a vision model can look at a frame and an audio-capable model can hear a
        clip. Local endpoints can work without a key.
      </p>
    </div>
  );
}
