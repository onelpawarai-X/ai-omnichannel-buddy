/**
 * Effect registry.
 *
 * One effect = a declarative recipe the compositor can render. An effect either
 * contributes a CSS/canvas filter fragment for the layer, an overlay painted
 * above it, or both. Preview and export run the same recipes, so what the
 * timeline shows is what the render produces.
 */
export type EffectParamType = "number" | "color" | "bool" | "select";

export type EffectParam = {
  key: string;
  label: string;
  type: EffectParamType;
  def: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

export type EffectValues = Record<string, number | string | boolean>;

export type EffectCategory =
  | "color"
  | "blur"
  | "distort"
  | "light"
  | "vintage"
  | "glitch"
  | "motion"
  | "particles"
  | "overlay";

export type EffectFrame = {
  width: number;
  height: number;
  /** timeline time in seconds */
  time: number;
  /** seconds since the clip started */
  local: number;
  /** 0..1 progress through the clip */
  progress: number;
};

export type EffectDef = {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  params: EffectParam[];
  filter?: (v: EffectValues, frame: EffectFrame) => string;
  overlay?: (ctx: CanvasRenderingContext2D, frame: EffectFrame, v: EffectValues) => void;
  animated?: boolean;
};

const num = (v: EffectValues, key: string, fallback: number): number => {
  const raw = v[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: EffectValues, key: string, fallback: string): string => {
  const raw = v[key];
  return typeof raw === "string" ? raw : fallback;
};

/** Deterministic pseudo-random in 0..1, so the same frame always renders the same. */
function hashNoise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function param(key: string, label: string, def: number, min: number, max: number, step = 0.01): EffectParam {
  return { key, label, type: "number", def, min, max, step };
}

function colorParam(key: string, label: string, def: string): EffectParam {
  return { key, label, type: "color", def };
}

function selectParam(key: string, label: string, def: string, options: string[]): EffectParam {
  return { key, label, type: "select", def, options };
}

function radialGlow(
  ctx: CanvasRenderingContext2D,
  frame: EffectFrame,
  v: EffectValues,
  defaults: { color: string; intensity: number; x: number; y: number; radius: number },
): void {
  const color = str(v, "color", defaults.color);
  const intensity = num(v, "intensity", defaults.intensity);
  const cx = num(v, "x", defaults.x) * frame.width;
  const cy = num(v, "y", defaults.y) * frame.height;
  const radius = Math.max(1, num(v, "radius", defaults.radius) * Math.max(frame.width, frame.height));
  const pulse = 0.85 + 0.15 * Math.sin(frame.time * 1.7);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, "transparent");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity * pulse));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function grainOverlay(ctx: CanvasRenderingContext2D, frame: EffectFrame, v: EffectValues): void {
  const amount = Math.min(1, Math.max(0, num(v, "amount", 0.18)));
  const scale = Math.max(1, Math.round(num(v, "size", 2)));
  const seed = Math.floor(frame.time * 24);
  ctx.save();
  ctx.globalAlpha = amount;
  const step = scale * 2;
  for (let y = 0; y < frame.height; y += step) {
    for (let x = 0; x < frame.width; x += step) {
      const n = hashNoise(x * 0.37 + y * 0.91 + seed);
      if (n < 0.5) continue;
      ctx.fillStyle = n > 0.75 ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, scale, scale);
    }
  }
  ctx.restore();
}

function scanlines(ctx: CanvasRenderingContext2D, frame: EffectFrame, v: EffectValues): void {
  const spacing = Math.max(2, Math.round(num(v, "spacing", 4)));
  const opacity = Math.min(1, Math.max(0, num(v, "opacity", 0.25)));
  const offset = Math.round((frame.time * 60) % (spacing * 2));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#000000";
  for (let y = offset; y < frame.height; y += spacing * 2) ctx.fillRect(0, y, frame.width, spacing);
  ctx.restore();
}

function rgbSplit(ctx: CanvasRenderingContext2D, frame: EffectFrame, v: EffectValues, strength: number): void {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(0.6, strength / 60);
  ctx.fillStyle = "#ff0040";
  ctx.fillRect(-strength, 0, frame.width, frame.height);
  ctx.fillStyle = "#00ffe0";
  ctx.fillRect(strength, 0, frame.width, frame.height);
  ctx.restore();
}

/** Shared entry shape so the array below stays readable. */
type EffectEntry = EffectDef;

export const EFFECTS: EffectEntry[] = [
  {
    id: "brightness",
    name: "Brightness",
    category: "color",
    description: "Lift or crush overall exposure",
    params: [param("amount", "Amount", 1.15, 0, 3)],
    filter: (v) => `brightness(${num(v, "amount", 1.15)})`,
  },
  {
    id: "contrast",
    name: "Contrast",
    category: "color",
    description: "Push shadows and highlights apart",
    params: [param("amount", "Amount", 1.2, 0, 3)],
    filter: (v) => `contrast(${num(v, "amount", 1.2)})`,
  },
  {
    id: "saturate",
    name: "Saturation",
    category: "color",
    description: "Boost or drain colour intensity",
    params: [param("amount", "Amount", 1.4, 0, 3)],
    filter: (v) => `saturate(${num(v, "amount", 1.4)})`,
  },
  {
    id: "grayscale",
    name: "Grayscale",
    category: "color",
    description: "Full or partial black and white",
    params: [param("amount", "Amount", 1, 0, 1)],
    filter: (v) => `grayscale(${num(v, "amount", 1)})`,
  },
  {
    id: "sepia",
    name: "Sepia",
    category: "vintage",
    description: "Warm paper tone",
    params: [param("amount", "Amount", 0.8, 0, 1)],
    filter: (v) => `sepia(${num(v, "amount", 0.8)})`,
  },
  {
    id: "invert",
    name: "Invert",
    category: "color",
    description: "Negative colours",
    params: [param("amount", "Amount", 1, 0, 1)],
    filter: (v) => `invert(${num(v, "amount", 1)})`,
  },
  {
    id: "hue",
    name: "Hue rotate",
    category: "color",
    description: "Rotate the colour wheel",
    params: [param("degrees", "Degrees", 45, -180, 180, 1)],
    filter: (v) => `hue-rotate(${num(v, "degrees", 45)}deg)`,
  },
  {
    id: "temperature",
    name: "Temperature",
    category: "color",
    description: "Warm or cool white balance",
    params: [param("warmth", "Warmth", 0.25, -1, 1)],
    filter: (v) => {
      const warmth = num(v, "warmth", 0.25);
      return `hue-rotate(${Math.round(warmth * -18)}deg) saturate(${1 + Math.abs(warmth) * 0.18})`;
    },
  },
  {
    id: "blur",
    name: "Gaussian blur",
    category: "blur",
    description: "Soft focus",
    params: [param("radius", "Radius px", 4, 0, 60, 0.5)],
    filter: (v) => `blur(${num(v, "radius", 4)}px)`,
  },
  {
    id: "sharpen",
    name: "Sharpen",
    category: "color",
    description: "Crisp micro contrast",
    params: [param("amount", "Amount", 0.6, 0, 2, 0.05)],
    filter: (v) => {
      const a = num(v, "amount", 0.6);
      return `contrast(${1 + a * 0.25}) saturate(${1 + a * 0.08})`;
    },
  },
  {
    id: "posterize",
    name: "Posterise",
    category: "vintage",
    description: "Reduce tonal steps",
    params: [param("steps", "Steps", 6, 2, 16, 1)],
    filter: (v) => {
      const steps = num(v, "steps", 6);
      return `contrast(${1 + (16 - steps) * 0.04}) saturate(${1 - (16 - steps) * 0.02})`;
    },
  },
  {
    id: "pixelate",
    name: "Pixelate",
    category: "distort",
    description: "Blocky mosaic",
    params: [param("size", "Block px", 12, 2, 80, 1)],
    filter: (v) => `blur(${Math.max(0.5, num(v, "size", 12) / 4)}px)`,
  },
  {
    id: "vignette",
    name: "Vignette",
    category: "overlay",
    description: "Darken the frame edges",
    params: [param("amount", "Amount", 0.6, 0, 1), param("softness", "Softness", 0.6, 0.1, 1)],
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.6);
      const inner = Math.min(frame.width, frame.height) * num(v, "softness", 0.6) * 0.5;
      const outer = Math.hypot(frame.width, frame.height) * 0.62;
      const gradient = ctx.createRadialGradient(frame.width / 2, frame.height / 2, inner, frame.width / 2, frame.height / 2, outer);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(1, `rgba(0,0,0,${amount})`);
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "film-grain",
    name: "Film grain",
    category: "vintage",
    description: "Animated sensor noise",
    params: [param("amount", "Amount", 0.16, 0, 0.6), param("size", "Grain px", 2, 1, 6, 1)],
    overlay: (ctx, frame, v) => grainOverlay(ctx, frame, v),
    animated: true,
  },
  {
    id: "film-burn",
    name: "Film burn",
    category: "vintage",
    description: "Warm light leak from the corner",
    params: [colorParam("color", "Colour", "#ff8a3d"), param("intensity", "Intensity", 0.55, 0, 1), param("radius", "Radius", 0.7, 0.1, 2)],
    overlay: (ctx, frame, v) => radialGlow(ctx, frame, v, { color: "#ff8a3d", intensity: 0.55, x: 0.1, y: 0.1, radius: 0.7 }),
    animated: true,
  },
  {
    id: "light-leak",
    name: "Light leak",
    category: "light",
    description: "Moving coloured flare",
    params: [colorParam("color", "Colour", "#ff5fa2"), param("intensity", "Intensity", 0.4, 0, 1), param("speed", "Speed", 0.4, 0, 2, 0.05)],
    overlay: (ctx, frame, v) => {
      const x = 0.5 + 0.4 * Math.sin(frame.time * num(v, "speed", 0.4) * 2);
      radialGlow(ctx, frame, { ...v, x, y: 0.3 }, { color: "#ff5fa2", intensity: 0.4, x: 0.5, y: 0.3, radius: 0.55 });
    },
    animated: true,
  },
  {
    id: "bloom",
    name: "Bloom",
    category: "light",
    description: "Soft highlight glow",
    params: [param("amount", "Amount", 0.45, 0, 1)],
    overlay: (ctx, frame, v) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = num(v, "amount", 0.45);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "halation",
    name: "Halation",
    category: "light",
    description: "Red halo around highlights",
    params: [param("amount", "Amount", 0.3, 0, 1)],
    filter: (v) => `contrast(${1 + num(v, "amount", 0.3) * 0.2})`,
    overlay: (ctx, frame, v) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.5, num(v, "amount", 0.3));
      ctx.fillStyle = "#ff2d55";
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "chromatic",
    name: "Chromatic aberration",
    category: "glitch",
    description: "Lens colour fringing",
    params: [param("amount", "Amount", 6, 0, 40, 1)],
    overlay: (ctx, frame, v) => rgbSplit(ctx, frame, v, num(v, "amount", 6)),
  },
  {
    id: "rgb-shift",
    name: "RGB shift",
    category: "glitch",
    description: "Offset colour channels",
    params: [param("amount", "Amount", 8, 0, 40, 1)],
    overlay: (ctx, frame, v) => rgbSplit(ctx, frame, v, num(v, "amount", 8)),
  },
  {
    id: "glitch",
    name: "Glitch",
    category: "glitch",
    description: "Datamosh band displacement",
    params: [param("amount", "Amount", 0.4, 0, 1), param("rate", "Rate", 6, 0.5, 30, 0.5)],
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.4);
      const bands = Math.round(3 + amount * 9);
      const tick = Math.floor(frame.time * num(v, "rate", 6));
      for (let i = 0; i < bands; i++) {
        const seed = tick * 7.13 + i * 3.77;
        const n = hashNoise(seed);
        if (n < 0.45) continue;
        const y = n * frame.height;
        const h = Math.max(2, n * 18);
        const dx = (hashNoise(seed + 1.3) - 0.5) * 60 * amount;
        ctx.save();
        ctx.globalAlpha = 0.6 * amount;
        ctx.drawImage(ctx.canvas, 0, y, frame.width, h, dx, y, frame.width, h);
        ctx.globalAlpha = 0.25 * amount;
        ctx.fillStyle = hashNoise(seed + 2.1) > 0.5 ? "#00fff0" : "#ff0055";
        ctx.fillRect(0, y, frame.width, h);
        ctx.restore();
      }
      rgbSplit(ctx, frame, v, 10 * amount);
    },
    animated: true,
  },
  {
    id: "crt",
    name: "CRT",
    category: "vintage",
    description: "Scanlines and tube glow",
    params: [param("spacing", "Line px", 4, 2, 12, 1), param("opacity", "Opacity", 0.28, 0, 0.8)],
    overlay: (ctx, frame, v) => {
      scanlines(ctx, frame, v);
      radialGlow(ctx, frame, { ...v, intensity: 0.12, x: 0.5, y: 0.5, radius: 0.9 }, { color: "#8affff", intensity: 0.12, x: 0.5, y: 0.5, radius: 0.9 });
    },
  },
  {
    id: "vhs",
    name: "VHS",
    category: "vintage",
    description: "Tape wobble, tracking noise and chroma bleed",
    params: [param("amount", "Amount", 0.5, 0, 1)],
    filter: (v) => {
      const a = num(v, "amount", 0.5);
      return `saturate(${1 + a * 0.35}) contrast(${1 + a * 0.1})`;
    },
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.5);
      const y = (Math.sin(frame.time * 3.1) * 0.5 + 0.5) * frame.height;
      ctx.save();
      ctx.globalAlpha = 0.35 * amount;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, y, frame.width, 2 + amount * 6);
      ctx.restore();
      scanlines(ctx, frame, { ...v, spacing: 3, opacity: 0.2 * amount });
      rgbSplit(ctx, frame, v, 8 * amount);
    },
    animated: true,
  },
  {
    id: "dreamy",
    name: "Dreamy",
    category: "blur",
    description: "Soft haze and lifted blacks",
    params: [param("amount", "Amount", 0.5, 0, 1)],
    filter: (v) => {
      const a = num(v, "amount", 0.5);
      return `blur(${a * 1.6}px) brightness(${1 + a * 0.12}) saturate(${1 + a * 0.15})`;
    },
    overlay: (ctx, frame, v) => {
      ctx.save();
      ctx.globalAlpha = num(v, "amount", 0.5) * 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "neon",
    name: "Neon",
    category: "light",
    description: "Cyberpunk magenta and cyan grade",
    params: [param("amount", "Amount", 0.6, 0, 1)],
    filter: (v) => {
      const a = num(v, "amount", 0.6);
      return `saturate(${1 + a * 0.6}) contrast(${1 + a * 0.25}) hue-rotate(${a * -12}deg)`;
    },
    overlay: (ctx, frame, v) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = num(v, "amount", 0.6) * 0.25;
      const gradient = ctx.createLinearGradient(0, 0, frame.width, frame.height);
      gradient.addColorStop(0, "#ff00c8");
      gradient.addColorStop(1, "#00fff0");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "duotone",
    name: "Duotone",
    category: "color",
    description: "Two-colour posterise",
    params: [colorParam("shadow", "Shadow", "#12203a"), colorParam("highlight", "Highlight", "#ffd28a"), param("amount", "Amount", 0.85, 0, 1)],
    filter: (v) => `grayscale(1) contrast(${1 + num(v, "amount", 0.85) * 0.4})`,
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.85);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = amount;
      ctx.fillStyle = str(v, "shadow", "#12203a");
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = amount * 0.5;
      ctx.fillStyle = str(v, "highlight", "#ffd28a");
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
  },
  {
    id: "old-film",
    name: "Old film",
    category: "vintage",
    description: "Sepia, dust and flicker",
    params: [param("amount", "Amount", 0.5, 0, 1)],
    filter: (v) => `sepia(${num(v, "amount", 0.5) * 0.7}) contrast(${1 + num(v, "amount", 0.5) * 0.15})`,
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.5);
      grainOverlay(ctx, frame, { ...v, amount: amount * 0.3, size: 3 });
      ctx.save();
      ctx.globalAlpha = 0.04 * amount * (0.5 + 0.5 * Math.sin(frame.time * 22));
      ctx.fillStyle = "#fff2cc";
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const seed = Math.floor(frame.time * 8) + i * 11;
        ctx.save();
        ctx.globalAlpha = 0.5 * amount;
        ctx.fillStyle = "#2b2118";
        ctx.beginPath();
        ctx.arc(hashNoise(seed) * frame.width, hashNoise(seed + 5) * frame.height, 1 + hashNoise(seed + 9) * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    animated: true,
  },
  {
    id: "zoom-pulse",
    name: "Zoom pulse",
    category: "motion",
    description: "Rhythmic punch-in",
    params: [param("amount", "Amount", 0.06, 0, 0.4), param("rate", "Rate", 2, 0.2, 8, 0.1)],
    animated: true,
  },
  {
    id: "shake",
    name: "Camera shake",
    category: "motion",
    description: "Handheld jitter",
    params: [param("amount", "Amount", 0.02, 0, 0.15, 0.005), param("rate", "Rate", 12, 1, 40, 1)],
    animated: true,
  },
  {
    id: "float",
    name: "Float",
    category: "motion",
    description: "Slow vertical drift",
    params: [param("amount", "Amount", 0.03, 0, 0.2, 0.005), param("rate", "Rate", 0.6, 0.05, 3, 0.05)],
    animated: true,
  },
  {
    id: "confetti",
    name: "Confetti",
    category: "particles",
    description: "Falling colour shards",
    params: [param("count", "Count", 120, 10, 400, 10), param("speed", "Speed", 0.35, 0.05, 2, 0.05), param("size", "Size", 9, 2, 30, 1)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 120));
      const speed = num(v, "speed", 0.35);
      const size = num(v, "size", 9);
      const palette = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ffffff"];
      ctx.save();
      for (let i = 0; i < count; i++) {
        const seed = i * 3.17;
        const x = hashNoise(seed) * frame.width + (hashNoise(seed + 1.1) - 0.5) * 120 * frame.local * speed;
        const y = ((frame.local * speed * (0.6 + hashNoise(seed + 2.2) * 0.9) * 320 + hashNoise(seed + 3.3) * frame.height) % (frame.height + 60)) - 30;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(frame.time * 4 + seed);
        ctx.fillStyle = palette[Math.floor(hashNoise(seed + 4.4) * palette.length)] ?? "#ffffff";
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "sparkle",
    name: "Sparkle",
    category: "particles",
    description: "Twinkling stars",
    params: [param("count", "Count", 70, 5, 300, 5), param("rate", "Rate", 2, 0.2, 10, 0.1)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 70));
      const rate = num(v, "rate", 2);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < count; i++) {
        const seed = i * 5.31;
        const twinkle = Math.max(0, Math.sin(frame.time * rate * Math.PI + hashNoise(seed + 2.9) * Math.PI * 2));
        ctx.globalAlpha = twinkle;
        ctx.beginPath();
        ctx.arc(hashNoise(seed) * frame.width, hashNoise(seed + 1.7) * frame.height, 1 + twinkle * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "snow",
    name: "Snow",
    category: "particles",
    description: "Drifting snowflakes",
    params: [param("count", "Count", 140, 10, 500, 10), param("speed", "Speed", 0.25, 0.05, 1.5, 0.05), param("size", "Size", 3, 1, 12, 1)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 140));
      const speed = num(v, "speed", 0.25);
      const size = num(v, "size", 3);
      ctx.save();
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < count; i++) {
        const seed = i * 2.71;
        const x = hashNoise(seed) * frame.width + Math.sin(frame.time * 1.2 + seed) * 14;
        const y = (hashNoise(seed + 1.3) * frame.height + frame.local * speed * 200) % frame.height;
        ctx.globalAlpha = 0.5 + hashNoise(seed + 2.1) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.5 + hashNoise(seed + 3.4)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "rain",
    name: "Rain",
    category: "particles",
    description: "Falling streaks",
    params: [param("count", "Count", 200, 20, 600, 10), param("speed", "Speed", 1.1, 0.2, 4, 0.1), param("length", "Length", 26, 4, 90, 2)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 200));
      const speed = num(v, "speed", 1.1);
      const length = num(v, "length", 26);
      ctx.save();
      ctx.strokeStyle = "rgba(200,225,255,0.6)";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < count; i++) {
        const seed = i * 4.13;
        const x = hashNoise(seed) * frame.width;
        const y = (hashNoise(seed + 1.9) * frame.height + frame.local * speed * 620) % (frame.height + length);
        ctx.globalAlpha = 0.25 + hashNoise(seed + 2.5) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - length);
        ctx.lineTo(x - 3, y);
        ctx.stroke();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "bokeh",
    name: "Bokeh",
    category: "light",
    description: "Soft out-of-focus discs",
    params: [param("count", "Count", 22, 3, 80, 1), param("size", "Size", 70, 10, 260, 5), param("opacity", "Opacity", 0.22, 0, 0.6)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 22));
      const size = num(v, "size", 70);
      const opacity = num(v, "opacity", 0.22);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < count; i++) {
        const seed = i * 6.7;
        const x = hashNoise(seed) * frame.width;
        const y = (hashNoise(seed + 1.1) * frame.height + frame.local * 24 * (0.4 + hashNoise(seed + 2.2))) % frame.height;
        const r = size * (0.5 + hashNoise(seed + 3.3));
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(255,236,190,${opacity})`);
        gradient.addColorStop(0.7, `rgba(255,214,140,${opacity * 0.5})`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "speed-lines",
    name: "Speed lines",
    category: "overlay",
    description: "Radial anime speed lines",
    params: [param("count", "Count", 60, 8, 220, 2), param("opacity", "Opacity", 0.4, 0, 1)],
    overlay: (ctx, frame, v) => {
      const count = Math.round(num(v, "count", 60));
      const cx = frame.width / 2;
      const cy = frame.height / 2;
      const maxR = Math.hypot(frame.width, frame.height) / 2;
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = num(v, "opacity", 0.4);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + frame.time * 0.4;
        const inner = maxR * (0.35 + hashNoise(i * 9.1) * 0.4);
        ctx.lineWidth = 1 + hashNoise(i * 3.3) * 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
        ctx.stroke();
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "letterbox",
    name: "Letterbox",
    category: "overlay",
    description: "Cinematic black bars",
    params: [param("ratio", "Bar %", 0.12, 0, 0.35), colorParam("color", "Colour", "#000000")],
    overlay: (ctx, frame, v) => {
      const bar = frame.height * num(v, "ratio", 0.12);
      ctx.save();
      ctx.fillStyle = str(v, "color", "#000000");
      ctx.fillRect(0, 0, frame.width, bar);
      ctx.fillRect(0, frame.height - bar, frame.width, bar);
      ctx.restore();
    },
  },
  {
    id: "grid",
    name: "Grid",
    category: "overlay",
    description: "Techno grid lines",
    params: [param("size", "Cell px", 60, 10, 240, 5), param("opacity", "Opacity", 0.2, 0, 0.8), colorParam("color", "Colour", "#4cc9f0")],
    overlay: (ctx, frame, v) => {
      const size = Math.max(4, Math.round(num(v, "size", 60)));
      ctx.save();
      ctx.globalAlpha = num(v, "opacity", 0.2);
      ctx.strokeStyle = str(v, "color", "#4cc9f0");
      ctx.lineWidth = 1;
      for (let x = 0; x <= frame.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, frame.height);
        ctx.stroke();
      }
      for (let y = 0; y <= frame.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(frame.width, y);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: "mirror",
    name: "Mirror",
    category: "distort",
    description: "Reflect the frame horizontally",
    params: [selectParam("side", "Side", "right", ["left", "right"]), param("amount", "Amount", 0.5, 0, 1)],
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.5);
      const half = Math.round(frame.width * amount);
      ctx.save();
      ctx.translate(str(v, "side", "right") === "right" ? frame.width : 0, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(ctx.canvas, 0, 0, half, frame.height, 0, 0, half, frame.height);
      ctx.restore();
    },
  },
  {
    id: "kaleidoscope",
    name: "Kaleidoscope",
    category: "distort",
    description: "Radial mirror symmetry",
    params: [param("segments", "Segments", 6, 2, 16, 1), param("amount", "Amount", 0.7, 0, 1)],
    overlay: (ctx, frame, v) => {
      const segments = Math.max(2, Math.round(num(v, "segments", 6)));
      const amount = num(v, "amount", 0.7);
      const cx = frame.width / 2;
      const cy = frame.height / 2;
      const source = ctx.canvas;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.hypot(cx, cy), 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < segments; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i / segments) * Math.PI * 2);
        if (i % 2 === 1) ctx.scale(-1, 1);
        ctx.globalAlpha = amount * 0.5;
        ctx.drawImage(source, 0, 0, frame.width, frame.height, -cx, -cy, frame.width, frame.height);
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    id: "wave",
    name: "Wave warp",
    category: "distort",
    description: "Rippling horizontal displacement",
    params: [param("amount", "Amount", 14, 0, 80, 1), param("rate", "Rate", 1.6, 0.1, 8, 0.1), param("bands", "Bands", 24, 4, 120, 2)],
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 14);
      const rate = num(v, "rate", 1.6);
      const bands = Math.max(2, Math.round(num(v, "bands", 24)));
      const source = ctx.canvas;
      const bandHeight = frame.height / bands;
      ctx.save();
      for (let i = 0; i < bands; i++) {
        const y = i * bandHeight;
        const dx = Math.sin(frame.time * rate + i * 0.6) * amount;
        ctx.drawImage(source, 0, y, frame.width, Math.ceil(bandHeight), dx, y, frame.width, Math.ceil(bandHeight));
      }
      ctx.restore();
    },
    animated: true,
  },
  {
    id: "zoom-blur",
    name: "Zoom blur",
    category: "blur",
    description: "Radial zoom smear",
    params: [param("amount", "Amount", 0.08, 0, 0.3)],
    overlay: (ctx, frame, v) => {
      const amount = num(v, "amount", 0.08);
      const source = ctx.canvas;
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (let i = 1; i <= 5; i++) {
        const scale = 1 + (amount * i) / 5;
        const w = frame.width * scale;
        const h = frame.height * scale;
        ctx.drawImage(source, (frame.width - w) / 2, (frame.height - h) / 2, w, h);
      }
      ctx.restore();
    },
  },
  {
    id: "flash",
    name: "Flash",
    category: "light",
    description: "Strobe white flashes",
    params: [param("rate", "Rate", 3, 0.5, 12, 0.5), param("intensity", "Intensity", 0.7, 0, 1)],
    overlay: (ctx, frame, v) => {
      if (Math.sin(frame.time * num(v, "rate", 3) * Math.PI * 2) <= 0.6) return;
      ctx.save();
      ctx.globalAlpha = num(v, "intensity", 0.7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.restore();
    },
    animated: true,
  },
];

export const EFFECT_BY_ID: Map<string, EffectDef> = new Map(EFFECTS.map((e) => [e.id, e]));

export const EFFECT_CATEGORIES: EffectCategory[] = [
  "color",
  "blur",
  "distort",
  "light",
  "vintage",
  "glitch",
  "motion",
  "particles",
  "overlay",
];

export type AppliedEffect = { id: string; values: EffectValues; enabled: boolean };

export function defaultValues(effect: EffectDef): EffectValues {
  const values: EffectValues = {};
  for (const p of effect.params) values[p.key] = p.def;
  return values;
}

export function appliedEffect(id: string, overrides: EffectValues = {}): AppliedEffect {
  const def = EFFECT_BY_ID.get(id);
  if (!def) return { id, values: overrides, enabled: true };
  return { id, values: { ...defaultValues(def), ...overrides }, enabled: true };
}

/** Merge every enabled effect's filter fragment, in order. */
export function effectsFilter(effects: AppliedEffect[], frame: EffectFrame): string {
  const parts: string[] = [];
  for (const applied of effects) {
    if (!applied.enabled) continue;
    const def = EFFECT_BY_ID.get(applied.id);
    if (!def?.filter) continue;
    const fragment = def.filter(applied.values, frame);
    if (fragment) parts.push(fragment);
  }
  return parts.join(" ");
}

export function paintEffects(ctx: CanvasRenderingContext2D, effects: AppliedEffect[], frame: EffectFrame): void {
  for (const applied of effects) {
    if (!applied.enabled) continue;
    EFFECT_BY_ID.get(applied.id)?.overlay?.(ctx, frame, applied.values);
  }
}

export function effectsAnimated(effects: AppliedEffect[]): boolean {
  return effects.some((a) => a.enabled && EFFECT_BY_ID.get(a.id)?.animated === true);
}

/** Motion effects move the layer itself instead of painting over it. */
export function motionTransform(
  effects: AppliedEffect[],
  frame: EffectFrame,
): { scale: number; dx: number; dy: number; rotate: number } {
  let scale = 1;
  let dx = 0;
  let dy = 0;
  let rotate = 0;
  for (const applied of effects) {
    if (!applied.enabled) continue;
    if (applied.id === "zoom-pulse") {
      const amount = num(applied.values, "amount", 0.06);
      const rate = num(applied.values, "rate", 2);
      scale *= 1 + amount * (0.5 + 0.5 * Math.sin(frame.local * rate * Math.PI * 2));
    } else if (applied.id === "shake") {
      const amount = num(applied.values, "amount", 0.02);
      const rate = num(applied.values, "rate", 12);
      dx += Math.sin(frame.time * rate * 6.1) * amount * frame.width;
      dy += Math.cos(frame.time * rate * 5.3) * amount * frame.height;
    } else if (applied.id === "float") {
      const amount = num(applied.values, "amount", 0.03);
      const rate = num(applied.values, "rate", 0.6);
      dy += Math.sin(frame.time * rate * Math.PI * 2) * amount * frame.height;
    }
  }
  return { scale, dx, dy, rotate };
}

/** Compact catalogue for the agent prompt. */
export function effectCatalogueText(): string {
  return EFFECTS.map((e) => {
    const params = e.params.map((p) => `${p.key}=${String(p.def)}`).join(",");
    return `${e.id} [${e.category}] ${e.description}${params ? ` (${params})` : ""}`;
  }).join("\n");
}
