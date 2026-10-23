import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useDictation } from "./useDictation";

/** A stand-in for the browser recogniser that records what the hook asks of it. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  startCount = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    this.startCount += 1;
  }

  stop(): void {}

  abort(): void {}

  emitFinal(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, length: 1, 0: { transcript } }],
    });
  }

  emitInterim(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript } }],
    });
  }
}

function installRecognition(): void {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
}

describe("useDictation", () => {
  beforeEach(() => {
    installRecognition();
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("reports support only when the browser provides a recogniser", () => {
    const { result } = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));
    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);

    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    const unsupported = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));
    expect(unsupported.result.current.supported).toBe(false);
  });

  it("listens in the chosen language and commits only finished phrases", () => {
    const onFinal = vi.fn();
    const onInterim = vi.fn();
    const { result } = renderHook(() =>
      useDictation({ lang: "bn-BD", onFinal, onInterim }),
    );

    act(() => result.current.start());

    const recognition = FakeRecognition.instances.at(-1)!;
    expect(recognition.lang).toBe("bn-BD");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.startCount).toBe(1);
    expect(result.current.listening).toBe(true);
    expect(result.current.activeLanguage).toBe("bn-BD");

    act(() => recognition.emitInterim("আমি"));
    expect(onInterim).toHaveBeenLastCalledWith("আমি");
    expect(onFinal).not.toHaveBeenCalled();

    act(() => recognition.emitFinal("আমি একটি ভিডিও বানাতে চাই"));
    expect(onFinal).toHaveBeenCalledWith("আমি একটি ভিডিও বানাতে চাই");
  });

  it("restarts the recogniser when the language changes mid-session", () => {
    const { result, rerender } = renderHook(
      ({ lang }: { lang: string }) => useDictation({ lang, onFinal: vi.fn() }),
      { initialProps: { lang: "bn-BD" } },
    );

    act(() => result.current.start());
    const first = FakeRecognition.instances.at(-1)!;
    expect(first.lang).toBe("bn-BD");

    rerender({ lang: "en-US" });
    const second = FakeRecognition.instances.at(-1)!;
    expect(second).not.toBe(first);
    expect(second.lang).toBe("en-US");
    expect(result.current.activeLanguage).toBe("en-US");
  });

  it("keeps listening through a silent end but stops on request", () => {
    const { result } = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));
    act(() => result.current.start());

    const first = FakeRecognition.instances.at(-1)!;
    act(() => first.onend?.());
    expect(result.current.listening).toBe(true);
    const second = FakeRecognition.instances.at(-1)!;
    expect(second).not.toBe(first);
    expect(second.lang).toBe("bn-BD");

    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    const before = FakeRecognition.instances.length;
    act(() => second.onend?.());
    expect(FakeRecognition.instances.length).toBe(before);
  });

  it("explains a blocked microphone instead of listening silently", () => {
    const { result } = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));
    act(() => result.current.start());

    act(() => FakeRecognition.instances.at(-1)!.onerror?.({ error: "not-allowed" }));
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toMatch(/মাইক্রোফোনের অনুমতি বন্ধ/);
  });

  it("treats a routine no-speech end as nothing to report", () => {
    const { result } = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));
    act(() => result.current.start());

    act(() => FakeRecognition.instances.at(-1)!.onerror?.({ error: "no-speech" }));
    expect(result.current.error).toBeNull();
    expect(result.current.listening).toBe(true);
  });

  it("toggles between listening and stopped", () => {
    const { result } = renderHook(() => useDictation({ lang: "bn-BD", onFinal: vi.fn() }));

    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
  });
});
