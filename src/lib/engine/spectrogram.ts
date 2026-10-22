/**
 * Spectrogram rendering.
 *
 * The provider reads pictures, not sound: an `input_audio` part is accepted by
 * the API and then silently dropped, so a model asked to "listen" answers that
 * it hears nothing. Verified against every model in the catalogue with base64
 * mp3, wav, ogg, flac, data URLs, https URLs, `audio_url`, `input_audio` and
 * `file` parts - all silent.
 *
 * A spectrogram is the way through. Render the audio as a labelled picture and
 * the model reads it accurately: it identifies speech vs music, finds the
 * harmonic stacks, and reads the syllable rhythm and pause positions off the
 * time axis. So audio reaches the agent as a picture, and the numeric analysis
 * travels alongside it as text.
 */

/** In-place iterative radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      const ti = im[i] as number;
      re[i] = re[j] as number;
      im[i] = im[j] as number;
      re[j] = tr;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] as number;
        const xi = im[b] as number;
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        const ur = re[a] as number;
        const ui = im[a] as number;
        re[a] = ur + vr;
        im[a] = ui + vi;
        re[b] = ur - vr;
        im[b] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Magma-like ramp: quiet is near black, loud runs through violet to white. */
function ramp(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [6, 6, 14]],
    [0.2, [40, 22, 90]],
    [0.4, [108, 34, 122]],
    [0.6, [186, 62, 92]],
    [0.8, [244, 132, 62]],
    [1, [252, 246, 224]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1] as [number, [number, number, number]];
    const next = stops[i] as [number, [number, number, number]];
    if (t <= next[0]) {
      const span = next[0] - prev[0] || 1;
      const k = (t - prev[0]) / span;
      return [
        Math.round(prev[1][0] + (next[1][0] - prev[1][0]) * k),
        Math.round(prev[1][1] + (next[1][1] - prev[1][1]) * k),
        Math.round(prev[1][2] + (next[1][2] - prev[1][2]) * k),
      ];
    }
  }
  return [252, 246, 224];
}

function label(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}s`;
}

export type SpectrogramOptions = {
  /** widest plot in pixels; columns are capped to this */
  maxWidth?: number;
  /** tallest plot in pixels */
  height?: number;
  fftSize?: number;
};

/**
 * Render a decoded audio buffer as a labelled spectrogram PNG data URL.
 *
 * The axes are drawn with real numbers: time in seconds along the bottom and
 * frequency in kHz up the side, so the model can quote timings back.
 */
export function spectrogramDataUrl(buffer: AudioBuffer, options: SpectrogramOptions = {}): string | null {
  if (typeof document === "undefined") return null;
  const fftSize = options.fftSize ?? 1024;
  const bins = fftSize >> 1;
  const plotHeight = options.height ?? 420;
  const maxWidth = options.maxWidth ?? 1000;
  const marginLeft = 44;
  const marginTop = 16;
  const marginBottom = 26;
  const marginRight = 10;

  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  if (length < fftSize) return null;

  // mono mix
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] = (mono[i] as number) + (data[i] as number) / channels;
  }

  const hop = Math.max(1, Math.ceil((length - fftSize) / maxWidth));
  const columns = Math.floor((length - fftSize) / hop) + 1;
  if (columns < 2) return null;

  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));

  // magnitude columns in dB, normalised against the loudest bin
  const grid: Float32Array[] = [];
  let peak = 1e-9;
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let col = 0; col < columns; col++) {
    const offset = col * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = (mono[offset + i] as number) * (window[i] as number);
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      const r = re[b] as number;
      const i2 = im[b] as number;
      const m = Math.sqrt(r * r + i2 * i2);
      mag[b] = m;
      if (m > peak) peak = m;
    }
    grid.push(mag);
  }

  const floorDb = -70;
  const plotWidth = columns;
  const canvas = document.createElement("canvas");
  canvas.width = marginLeft + plotWidth + marginRight;
  canvas.height = marginTop + plotHeight + marginBottom;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#06060e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const image = ctx.createImageData(plotWidth, plotHeight);
  for (let col = 0; col < plotWidth; col++) {
    const mag = grid[col] as Float32Array;
    for (let y = 0; y < plotHeight; y++) {
      // low frequencies at the bottom
      const b = Math.min(bins - 1, Math.floor(((plotHeight - 1 - y) / plotHeight) * bins));
      const value = (mag[b] as number) / peak;
      const db = 20 * Math.log10(value + 1e-9);
      const norm = Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
      const [r, g, bl] = ramp(norm);
      const index = (y * plotWidth + col) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = bl;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, marginLeft, marginTop);

  // axes
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "12px monospace";
  ctx.lineWidth = 1;

  const nyquist = sampleRate / 2;
  for (const freq of [0, 1000, 2000, 4000, 8000, 16000]) {
    if (freq > nyquist) break;
    const y = marginTop + plotHeight - (freq / nyquist) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(marginLeft - 4, y);
    ctx.lineTo(marginLeft, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : "0", marginLeft - 7, y);
  }

  const duration = length / sampleRate;
  const step = duration <= 6 ? 1 : duration <= 30 ? 5 : duration <= 120 ? 15 : 60;
  for (let t = 0; t <= duration + 1e-6; t += step) {
    const x = marginLeft + (t / duration) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, marginTop + plotHeight);
    ctx.lineTo(x, marginTop + plotHeight + 4);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label(t), x, marginTop + plotHeight + 6);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(`spectrogram · ${duration.toFixed(2)}s · ${(sampleRate / 1000).toFixed(1)}kHz`, marginLeft, 2);

  return canvas.toDataURL("image/png");
}

/** Spectrogram of a media URL, decoded through the Web Audio API. */
export async function spectrogramOf(url: string, options: SpectrogramOptions = {}): Promise<string | null> {
  const buffer = await decodeAudioBuffer(url);
  if (!buffer) return null;
  try {
    return spectrogramDataUrl(buffer, options);
  } catch {
    return null;
  }
}

async function decodeAudioBuffer(url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const buffer = await ctx.decodeAudioData(bytes);
    void ctx.close();
    return buffer;
  } catch {
    return null;
  }
}
