import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, RefreshCw, Star } from "@/icons/lucide-compat";
import {
  ZYRAXON_MODELS,
  pickDefaultModel,
  type AIModelOption,
} from "../../../stores/ai-provider-catalog";
import { useAIConnectionStore } from "../../../stores/ai-connection-store";
import { listModels, type ZyraxonModelRecord } from "../../../services/zyraxon";

/** Fold a live gateway record into the shape the picker renders. */
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
 * Compact model picker for the chat header.
 *
 * ZYRAXON is the only provider, so this lists models, not endpoints. The list
 * is the bundled catalogue until "Refresh" reads the live pool, which is what
 * makes a rotated model show up without a redeploy.
 */
export function ChatModelPicker({ disabled = false }: { disabled?: boolean }): JSX.Element {
  const model = useAIConnectionStore((s) => s.model);
  const setModel = useAIConnectionStore((s) => s.setModel);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<readonly AIModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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

  const options = live.length ? live : ZYRAXON_MODELS;
  const selected = options.find((option) => option.id === model);
  const defaultModel = pickDefaultModel();

  const refresh = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const records = await listModels();
      if (!records.length) {
        setStatus("The gateway returned no models.");
        return;
      }
      setLive(records.map(fromGateway));
      setStatus(`Live: ${records.length} models.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read the catalogue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`ZYRAXON · ${selected?.label ?? model}`}
        className="flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-bg-2 px-1.5 py-1 text-[10px] text-fg-2 transition-colors hover:border-border-strong hover:text-fg disabled:opacity-40"
      >
        {model === defaultModel && <Star size={9} className="shrink-0 text-accent" aria-hidden />}
        <span className="truncate font-medium">{selected?.label ?? model ?? "Select model"}</span>
        <ChevronDown size={10} className="shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 max-h-[60vh] w-72 overflow-y-auto rounded-lg border border-border bg-bg-1 p-1.5 shadow-lg"
        >
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-fg-muted">
              ZYRAXON model
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="flex items-center gap-1 text-[9px] text-accent hover:underline disabled:opacity-50"
            >
              <RefreshCw size={9} className={loading ? "animate-spin" : ""} aria-hidden />
              {loading ? "Reading" : "Refresh"}
            </button>
          </div>

          {options.map((option) => {
            const routed = option.routedModalities ?? option.inputModalities;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={option.id === model}
                onClick={() => {
                  setModel(option.id);
                  setOpen(false);
                }}
                title={option.description ?? option.id}
                className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-hover"
              >
                <Check
                  size={11}
                  className={`mt-0.5 shrink-0 ${option.id === model ? "text-accent" : "opacity-0"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-[11px] text-fg-2">{option.label}</span>
                    {option.id === defaultModel && (
                      <span className="shrink-0 rounded bg-accent-soft px-1 text-[8px] text-accent">
                        default
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[9px] text-fg-muted">
                    {option.description ? `${option.description} · ` : ""}routes {routed.join(", ")}
                  </span>
                </span>
              </button>
            );
          })}

          {status && (
            <p role="status" className="mt-1 border-t border-border px-1.5 pt-1 text-[9px] leading-relaxed text-fg-muted">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
