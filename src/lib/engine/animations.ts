/**
 * Animation library: Lottie overlays pulled from public CDNs, rendered by the
 * compositor on the canvas. Each animation is stored as raw JSON so the project
 * stays self-contained and exportable without a network round trip.
 */
import lottie, { type AnimationItem } from "lottie-web";
import { uid } from "./model";

export type AnimationSource = "lottiefiles" | "url" | "generated";

export type AnimationEntry = {
  id: string;
  name: string;
  source: AnimationSource;
  /** raw Lottie JSON */
  data: Record<string, unknown>;
  /** natural duration in seconds */
  duration: number;
  width: number;
  height: number;
  attribution?: string;
  tags: string[];
  preview?: string;
};

const registry = new Map<string, AnimationEntry>();

/** Well-known public Lottie JSON files, verified reachable, used as the seed library. */
export const SEED_ANIMATIONS: Array<{ name: string; url: string; tags: string[] }> = [
  { name: "Confetti burst", url: "https://assets10.lottiefiles.com/packages/lf20_kkflmtur.json", tags: ["party", "celebration", "confetti"] },
  { name: "Loading dots", url: "https://assets2.lottiefiles.com/packages/lf20_p8bfn5to.json", tags: ["loader", "ui"] },
  { name: "Rocket launch", url: "https://assets1.lottiefiles.com/packages/lf20_jbrw3hcz.json", tags: ["rocket", "startup", "launch"] },
  { name: "Heart beat", url: "https://assets9.lottiefiles.com/packages/lf20_yr6zz3wv.json", tags: ["heart", "like", "love"] },
  { name: "Star twinkle", url: "https://assets3.lottiefiles.com/packages/lf20_obhph3sh.json", tags: ["star", "sparkle", "magic"] },
  { name: "Arrow down", url: "https://assets4.lottiefiles.com/packages/lf20_2glqweqs.json", tags: ["arrow", "ui", "pointer"] },
  { name: "Check mark", url: "https://assets6.lottiefiles.com/packages/lf20_zw0djhar.json", tags: ["check", "success", "tick"] },
  { name: "Smoke puff", url: "https://assets7.lottiefiles.com/packages/lf20_kq5rGs.json", tags: ["smoke", "transition", "fog"] },
  { name: "Snow fall", url: "https://assets10.lottiefiles.com/packages/lf20_myejiggj.json", tags: ["snow", "winter", "weather"] },
  { name: "Pulse ring", url: "https://assets1.lottiefiles.com/packages/lf20_5tl1xxnz.json", tags: ["pulse", "ring", "beat", "music"] },
  { name: "Rising arrows", url: "https://assets1.lottiefiles.com/packages/lf20_wd1udlcz.json", tags: ["arrow", "growth", "chart"] },
  { name: "Bouncing ball", url: "https://assets1.lottiefiles.com/packages/lf20_3rqwsqnj.json", tags: ["ball", "bounce", "fun"] },
];

export function listAnimations(): AnimationEntry[] {
  return [...registry.values()];
}

export function getAnimation(id: string): AnimationEntry | undefined {
  return registry.get(id);
}

export function animationIds(): string[] {
  return [...registry.keys()];
}

export function searchAnimations(query: string): AnimationEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return listAnimations();
  return listAnimations().filter((a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)));
}

type LottieJson = {
  v?: string;
  fr?: number;
  ip?: number;
  op?: number;
  w?: number;
  h?: number;
  nm?: string;
};

function describe(json: LottieJson): { duration: number; width: number; height: number; name: string } {
  const fps = typeof json.fr === "number" && json.fr > 0 ? json.fr : 30;
  const inPoint = typeof json.ip === "number" ? json.ip : 0;
  const outPoint = typeof json.op === "number" ? json.op : fps * 2;
  return {
    duration: Math.max(0.1, (outPoint - inPoint) / fps),
    width: typeof json.w === "number" ? json.w : 512,
    height: typeof json.h === "number" ? json.h : 512,
    name: typeof json.nm === "string" ? json.nm : "animation",
  };
}

/** Register raw Lottie JSON; returns the stored entry. */
export function registerAnimation(
  data: Record<string, unknown>,
  options: { name?: string; source?: AnimationSource; attribution?: string; tags?: string[] } = {},
): AnimationEntry {
  const meta = describe(data as LottieJson);
  const entry: AnimationEntry = {
    id: uid("anim"),
    name: options.name ?? meta.name,
    source: options.source ?? "url",
    data,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    tags: options.tags ?? [],
  };
  if (options.attribution !== undefined) entry.attribution = options.attribution;
  registry.set(entry.id, entry);
  return entry;
}

/** Fetch and register a Lottie JSON by URL. */
export async function loadAnimationFromUrl(
  url: string,
  options: { name?: string; tags?: string[]; source?: AnimationSource } = {},
): Promise<AnimationEntry> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`animation fetch failed: ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  const entry = registerAnimation(data, { ...options, source: options.source ?? "url", attribution: url });
  return entry;
}

/** Load the seed library once; failures are skipped rather than fatal. */
export async function loadSeedAnimations(): Promise<AnimationEntry[]> {
  if (registry.size > 0) return listAnimations();
  const results = await Promise.allSettled(
    SEED_ANIMATIONS.map((seed) => loadAnimationFromUrl(seed.url, { name: seed.name, tags: seed.tags, source: "lottiefiles" })),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** Create a detached lottie player the compositor can drive frame by frame. */
export function createPlayer(entry: AnimationEntry, container: HTMLElement): AnimationItem {
  return lottie.loadAnimation({
    container,
    renderer: "canvas",
    loop: false,
    autoplay: false,
    animationData: entry.data,
    rendererSettings: { clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
  });
}

export function destroyPlayer(player: AnimationItem): void {
  try {
    player.destroy();
  } catch {
    // already torn down
  }
}
