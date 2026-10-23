import { useCallback, useEffect, useState } from "react";
import { ToolcraftButton as Button } from "@openreel/ui";
import {
  ZYRAXON_MODELS,
  ZYRAXON_UPSTREAM_URL,
  pickDefaultModel,
  type AIModelOption,
} from "../../../stores/ai-provider-catalog";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { listModels, type ZyraxonModelRecord } from "../../../services/zyraxon";
import { useSpeechSettingsStore } from "../../../stores/speech-settings-store";
import { DICTATION_LANGUAGES } from "../../../config/dictation-languages";
import { VoicePicker } from "./VoicePicker";

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50";

function fromGateway(record: ZyraxonModelRecord): AIModelOption {
  return {
    id: record.id,
    label: record.displayName || record.id,
    description: record.description,
    contextWindow: record.contextWindow,
    maxOutputTokens: record.maxOutputTokens,
    inputModalities: record.inputModalities as AIModelOption["inputModalities"],
    routedModalities: record.routedModalities as AIModelOption["routedModalities"],
  };
}

/**
 * ZYRAXON connection settings.
 *
 * There is no provider dropdown, no base URL and no key: the gateway is a
 * permanent constant and is keyless. What the user can change is the model,
 * the dictation language and the narration voice.
 */
export function AIConnectionPanel({ disabled = false }: { disabled?: boolean }) {
  const model = useAIConnectionStore((s) => s.model);
  const setModel = useAIConnectionStore((s) => s.setModel);
  const dictationLanguage = useSpeechSettingsStore((s) => s.dictationLanguage);
  const setDictationLanguage = useSpeechSettingsStore((s) => s.setDictationLanguage);
  const [live, setLive] = useState<readonly AIModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
  }, [model]);

  const options = live.length ? live : ZYRAXON_MODELS;
  const selected = options.find((option) => option.id === model);
  const defaultModel = pickDefaultModel();

  const loadModels = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const records = await listModels();
      if (!records.length) {
        setStatus("The gateway returned no models.");
        return;
      }
      setLive(records.map(fromGateway));
      setStatus(`Loaded ${records.length} live models.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read the catalogue.");
    } finally {
      setLoading(false);
    }
  }, []);

  const routed = selected?.routedModalities ?? selected?.inputModalities ?? ["text"];

  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-md border border-border bg-bg-2/60 px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted">
        <p className="font-medium text-fg-2">ZYRAXON — permanent, no key</p>
        <p className="mt-0.5">
          The gateway is built in and always on. You choose the model; nothing else needs configuring.
        </p>
        <p className="mt-0.5 font-mono text-[10px] break-all text-fg-muted">{ZYRAXON_UPSTREAM_URL}</p>
      </div>

      <div>
        <div className="flex items-end gap-2">
          <label className="block flex-1 text-fg-2">Editing model
            <select
              aria-label="ZYRAXON model"
              className={inputClass}
              disabled={disabled}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}{option.id === defaultModel ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            label={loading ? "Reading…" : "Refresh"}
            variant="secondary"
            size="sm"
            onClick={() => void loadModels()}
            isDisabled={disabled || loading}
            className="mb-0.5 shrink-0"
          />
        </div>
        {selected && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
            {selected.description}
            {selected.description ? " · " : ""}
            routes {routed.join(", ")}
            {selected.contextWindow ? ` · ${(selected.contextWindow / 1000).toFixed(0)}K context` : ""}
          </p>
        )}
      </div>

      <label className="block text-fg-2">Dictation language
        <select
          aria-label="Dictation language"
          className={inputClass}
          disabled={disabled}
          value={dictationLanguage}
          onChange={(event) => setDictationLanguage(event.target.value)}
        >
          {DICTATION_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] leading-relaxed text-fg-muted">
          The microphone transcribes in this language. You can also switch it beside the mic.
        </span>
      </label>

      <VoicePicker disabled={disabled} />

      {status && (
        <p role="status" className="text-[11px] leading-relaxed text-fg-muted">{status}</p>
      )}
    </div>
  );
}
