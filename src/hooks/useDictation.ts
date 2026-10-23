import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictation through the browser's own speech recogniser.
 *
 * Nothing is uploaded: the Web Speech API runs the recognition itself, which is
 * why no speech-to-text endpoint is involved. The recogniser never guesses the
 * language — the caller names it — so switching `lang` mid-session restarts the
 * recogniser with the new tag and the next words come back in that language.
 */

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { readonly error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface UseDictationResult {
  readonly supported: boolean;
  readonly listening: boolean;
  readonly error: string | null;
  /** The language the recogniser is currently listening in. */
  readonly activeLanguage: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export interface UseDictationOptions {
  /** BCP-47 tag. Changing it while listening restarts the recogniser. */
  readonly lang: string;
  /** A finished phrase, ready to be committed to the message box. */
  readonly onFinal: (text: string) => void;
  /** The live, not-yet-final tail. Replaces the previous interim value. */
  readonly onInterim?: (text: string) => void;
}

export function useDictation({
  lang,
  onFinal,
  onInterim,
}: UseDictationOptions): UseDictationResult {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState(lang);
  const [supported] = useState(() => recognitionCtor() !== null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Kept in a ref so the recogniser callbacks never capture a stale function.
  const finalRef = useRef(onFinal);
  const interimRef = useRef(onInterim);
  const langRef = useRef(lang);
  // True while the user wants to listen; drives auto-restart after a natural end.
  const wantRef = useRef(false);

  useEffect(() => {
    finalRef.current = onFinal;
    interimRef.current = onInterim;
  }, [onFinal, onInterim]);

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const begin = useCallback(
    (tag: string) => {
      const Ctor = recognitionCtor();
      if (!Ctor) {
        setError("এই ব্রাউজারে কথাবার্তা চেনার সুবিধা নেই। লিখে দিন, অথবা Chrome বা Edge ব্যবহার করুন।");
        wantRef.current = false;
        setListening(false);
        return;
      }
      teardown();
      setError(null);
      const recognition = new Ctor();
      recognition.lang = tag;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            const trimmed = transcript.trim();
            if (trimmed) finalRef.current(trimmed);
          } else {
            interim += transcript;
          }
        }
        // A final result clears the interim tail, so only report when non-empty.
        const tail = interim.trim();
        if (tail) interimRef.current?.(tail);
        else interimRef.current?.("");
      };

      recognition.onerror = (event) => {
        const code = event.error ?? "unknown";
        // "no-speech" and "aborted" are routine; the recogniser restarts on end.
        if (code === "no-speech" || code === "aborted") return;
        setError(
          code === "not-allowed" || code === "service-not-allowed"
            ? "মাইক্রোফোনের অনুমতি বন্ধ আছে। ব্রাউজারে অনুমতি দিয়ে আবার চেষ্টা করুন।"
            : code === "audio-capture"
              ? "কোনো মাইক্রোফোন পাওয়া যায়নি। একটি লাগিয়ে আবার চেষ্টা করুন।"
              : code === "network"
                ? "ব্রাউজারের কথাবার্তা সেবা পাওয়া যাচ্ছে না। নেটওয়ার্ক দেখে নিন।"
                : `কথা লেখা থেমে গেছে (${code})।`,
        );
        wantRef.current = false;
        setListening(false);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (wantRef.current) {
          // Continuous mode still ends on silence; keep the session alive.
          begin(langRef.current);
        } else {
          setListening(false);
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        setActiveLanguage(tag);
        setListening(true);
      } catch {
        setError("মাইক্রোফোন চালু করা যায়নি। ব্রাউজারের অনুমতি দেখে নিন।");
        recognitionRef.current = null;
        wantRef.current = false;
        setListening(false);
      }
    },
    [teardown],
  );

  const stop = useCallback(() => {
    wantRef.current = false;
    interimRef.current?.("");
    teardown();
    setListening(false);
  }, [teardown]);

  const start = useCallback(() => {
    if (wantRef.current) return;
    wantRef.current = true;
    begin(langRef.current);
  }, [begin]);

  // Follow the selected language, including a change made mid-session.
  useEffect(() => {
    langRef.current = lang;
    if (wantRef.current) begin(lang);
    else setActiveLanguage(lang);
  }, [lang, begin]);

  useEffect(
    () => () => {
      wantRef.current = false;
      teardown();
    },
    [teardown],
  );

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, error, activeLanguage, start, stop, toggle };
}
