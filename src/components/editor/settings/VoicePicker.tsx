import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { useSpeechSettingsStore } from "../../../stores/speech-settings-store";
import { listVoices, speak, type ZyraxonVoice } from "../../../services/zyraxon";
import { DICTATION_LANGUAGES } from "../../../config/dictation-languages";

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50";

/**
 * Narration voice picker.
 *
 * The bundled language list covers the common cases with no request; "Load all"
 * reads the gateway's 322 voices and groups them by locale so any of the 75
 * languages is reachable. The preview button synthesises one short line through
 * the same endpoint a narration would use.
 */
export function VoicePicker({ disabled = false }: { disabled?: boolean }) {
  const voice = useSpeechSettingsStore((s) => s.narrationVoice);
  const setVoice = useSpeechSettingsStore((s) => s.setNarrationVoice);
  const [all, setAll] = useState<ZyraxonVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const { voices } = await listVoices();
      setAll(voices);
      setStatus(`${voices.length} voices across ${new Set(voices.map((v) => v.locale)).size} locales.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read the voices.");
    } finally {
      setLoading(false);
    }
  }, []);

  const grouped = useMemo(() => {
    const source: ZyraxonVoice[] = all.length
      ? all
      : DICTATION_LANGUAGES.map((language) => ({
          name: language.voice,
          locale: language.code,
          gender: "",
          friendly: language.label,
        }));
    const byLocale = new Map<string, ZyraxonVoice[]>();
    for (const entry of source) {
      const list = byLocale.get(entry.locale) ?? [];
      list.push(entry);
      byLocale.set(entry.locale, list);
    }
    return [...byLocale.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [all]);

  const preview = useCallback(async () => {
    stop();
    setPlaying(true);
    setStatus(null);
    try {
      const blob = await speak("This is how the narration will sound.", { voice });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stop;
      audio.onerror = () => {
        stop();
        setStatus("The browser could not play the preview.");
      };
      await audio.play();
    } catch (error) {
      stop();
      setStatus(error instanceof Error ? error.message : "Could not synthesise the preview.");
    }
  }, [stop, voice]);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="block flex-1 text-fg-2">Narration voice
          <select
            aria-label="Narration voice"
            className={inputClass}
            disabled={disabled}
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
          >
            {grouped.map(([locale, voices]) => (
              <optgroup key={locale} label={locale}>
                {voices.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.friendly || entry.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Button
          label={loading ? "Reading…" : all.length ? "Reload" : "Load all"}
          variant="secondary"
          size="sm"
          onClick={() => void loadAll()}
          isDisabled={disabled || loading}
          className="mb-0.5 shrink-0"
        />
        <Button
          label={playing ? "Stop" : "Preview"}
          variant="secondary"
          size="sm"
          onClick={() => (playing ? stop() : void preview())}
          isDisabled={disabled}
          className="mb-0.5 shrink-0"
        >
          {playing ? <Square size={11} aria-hidden /> : <Play size={11} aria-hidden />}
        </Button>
      </div>
      {status && (
        <p role="status" className="text-[11px] leading-relaxed text-fg-muted">{status}</p>
      )}
    </div>
  );
}
