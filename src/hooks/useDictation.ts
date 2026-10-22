import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictation through the browser's own speech recognizer. Nothing is uploaded to
 * our servers: the Web Speech API runs the recognition itself, so the chat needs
 * no speech-to-text endpoint.
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
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * @param onTranscript Called with each finalized chunk of speech, so the caller
 *   can append it to whatever the user already typed.
 */
export function useDictation(
  onTranscript: (text: string) => void,
  lang = "en-US",
): UseDictationResult {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(onTranscript);
  const [supported] = useState(() => recognitionCtor() !== null);

  useEffect(() => {
    transcriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Type instead, or use Chrome or Edge.");
      return;
    }
    if (recognitionRef.current) return;
    setError(null);
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) text += result[0]?.transcript ?? "";
      }
      const trimmed = text.trim();
      if (trimmed) transcriptRef.current(trimmed);
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in the browser, then try again."
          : code === "no-speech"
            ? "No speech detected. Try again."
            : `Dictation stopped (${code}).`,
      );
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError("Could not start the microphone. Check the browser permission.");
      recognitionRef.current = null;
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
