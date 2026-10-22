import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom has no canvas. lottie-web and the spectrogram renderer both need a 2D
// context, so hand back a recording stub instead of null.
type Context2D = {
  canvas: HTMLCanvasElement;
  calls: string[];
  imageData: ImageData | null;
};

const contexts = new WeakMap<HTMLCanvasElement, Context2D>();

function createContext(canvas: HTMLCanvasElement): Context2D {
  const state: Context2D = { canvas, calls: [], imageData: null };
  const record = (name: string) => (...args: unknown[]): void => {
    state.calls.push(name);
    void args;
  };
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 10 }),
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    getImageData: (x: number, y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: (data: ImageData) => {
      state.imageData = data;
    },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    bezierCurveTo: record("bezierCurveTo"),
    quadraticCurveTo: record("quadraticCurveTo"),
    arc: record("arc"),
    rect: record("rect"),
    fill: record("fill"),
    stroke: record("stroke"),
    clip: record("clip"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    clearRect: record("clearRect"),
    fillText: record("fillText"),
    strokeText: record("strokeText"),
    translate: record("translate"),
    rotate: record("rotate"),
    scale: record("scale"),
    transform: record("transform"),
    setTransform: record("setTransform"),
    drawImage: record("drawImage"),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
    setLineDash: record("setLineDash"),
  };
  const ctx = target as unknown as Context2D;
  Object.defineProperty(ctx, "canvas", { value: canvas, enumerable: true });
  return ctx;
}

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value(this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d") return null;
    const existing = contexts.get(this);
    if (existing) return existing as unknown as CanvasRenderingContext2D;
    const created = createContext(this);
    contexts.set(this, created);
    return created as unknown as CanvasRenderingContext2D;
  },
});

Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
  configurable: true,
  value(this: HTMLCanvasElement) {
    // Encode the real canvas size so a test can assert what was drawn, and keep
    // the payload long enough to look like a PNG for size-sensitive checks.
    const header = `${this.width}x${this.height}`;
    const filler = "A".repeat(Math.min(4096, Math.max(0, this.width * this.height)));
    return `data:image/png;base64,${Buffer.from(`${header}|${filler}`).toString("base64")}`;
  },
});
