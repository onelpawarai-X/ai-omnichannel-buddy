import { describe, expect, it } from "vitest";

import { spectrogramDataUrl } from "@/lib/engine/spectrogram";

/** A tiny stand-in for an AudioBuffer: 1 s of a 440 Hz tone at 8 kHz. */
function toneBuffer(duration = 1, sampleRate = 8000, frequency = 440): AudioBuffer {
  const length = Math.round(duration * sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return {
    length,
    duration,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

/** A pulse train: silence, then a burst every 0.5 s - a drum-like onset grid. */
function pulseBuffer(duration = 4, sampleRate = 8000): AudioBuffer {
  const length = Math.round(duration * sampleRate);
  const data = new Float32Array(length);
  for (let pulse = 0; pulse < duration / 0.5; pulse++) {
    const start = Math.round(pulse * 0.5 * sampleRate);
    const span = Math.round(0.1 * sampleRate);
    for (let i = 0; i < span && start + i < length; i++) {
      data[start + i] = 0.9 * Math.sin((2 * Math.PI * 180 * i) / sampleRate) * Math.exp(-i / (0.02 * sampleRate));
    }
  }
  return {
    length,
    duration,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe("spectrogramDataUrl", () => {
  /** The stub encodes "<width>x<height>" into the data URL, so decode it back. */
  const sizeOf = (url: string): { width: number; height: number } => {
    const decoded = Buffer.from(url.replace(/^data:image\/png;base64,/, ""), "base64").toString();
    const [width, height] = decoded.split("|")[0]!.split("x").map(Number);
    return { width: width as number, height: height as number };
  };

  it("renders a PNG data URL sized to the labelled plot", () => {
    const url = spectrogramDataUrl(toneBuffer());
    expect(url).toMatch(/^data:image\/png;base64,/);
    const { width, height } = sizeOf(url!);
    // margins: 44 left + 10 right, 16 top + 26 bottom
    expect(width).toBeGreaterThan(44 + 10);
    expect(height).toBe(16 + 420 + 26);
  });

  it("renders a pulse train, which is how the agent reads rhythm", () => {
    const url = spectrogramDataUrl(pulseBuffer());
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null when the buffer is shorter than one FFT window", () => {
    expect(spectrogramDataUrl(toneBuffer(0.02, 8000))).toBeNull();
  });

  it("honours the column cap so a long file cannot blow up the canvas", () => {
    const wide = spectrogramDataUrl(toneBuffer(20, 8000), { maxWidth: 120, height: 80 });
    expect(wide).toMatch(/^data:image\/png;base64,/);
    const { width, height } = sizeOf(wide!);
    expect(width).toBeLessThanOrEqual(44 + 120 + 10);
    expect(height).toBe(16 + 80 + 26);
  });
});
