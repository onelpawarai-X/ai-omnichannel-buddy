/**
 * Place a stock result into the project.
 *
 * One implementation is shared by the Stock panel and the agent host so a click
 * and a tool call cannot drift. Everything downloads with `credentials: "omit"`
 * and goes through the same decoder the manual import path uses.
 */
import { importLottieAsMotionComposition } from "@openreel/core/motion/importers/lottie-importer";
import { useProjectStore } from "../stores/project-store";
import { toast } from "../stores/notification-store";
import type { StockAsset } from "./stock-library";

export interface ImportedAnimation {
  readonly compositionId: string;
  readonly name: string;
  readonly durationSec: number;
  readonly width: number;
  readonly height: number;
}

/** Download a Lottie JSON and register it as a motion composition. */
export async function importAnimationFromUrl(
  url: string,
  name?: string,
): Promise<ImportedAnimation> {
  let lottie: Record<string, unknown>;
  try {
    const response = await fetch(url, { credentials: "omit", redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lottie = (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Could not download the animation: ${error instanceof Error ? error.message : "unreachable"}`,
    );
  }
  if (typeof lottie.w !== "number" || typeof lottie.h !== "number" || !Array.isArray(lottie.layers)) {
    throw new Error("That file is not a Lottie animation");
  }
  const resolved = name ?? (typeof lottie.nm === "string" ? lottie.nm : "Imported animation");
  const composition = importLottieAsMotionComposition({ ...lottie, nm: resolved } as never);
  const result = await useProjectStore.getState().upsertMotionComposition(composition);
  if (!result.success) throw new Error(result.error?.message ?? "Could not store the animation");
  return {
    compositionId: composition.id,
    name: resolved,
    durationSec: composition.duration,
    width: composition.width,
    height: composition.height,
  };
}

/** Rasterise an SVG so the media decoder accepts it like any other image. */
async function svgToPngFile(url: string, name: string): Promise<File> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Could not download ${name}`);
  const svg = await response.text();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${name}`));
      element.src = objectUrl;
    });
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.drawImage(image, 0, 0, size, size);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not render the icon");
    return new File([png], `${name}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function safeFileName(asset: StockAsset, extension: string): string {
  const base = asset.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base || asset.id.replace(/[^a-z0-9]+/gi, "-")}.${extension}`;
}

/** Download a stock result and put it on the timeline at `startTime`. */
export async function importStockAsset(asset: StockAsset, startTime = 0): Promise<void> {
  if (!asset.importUrl) throw new Error("That result has no downloadable file");
  const { importMedia, addClipToNewTrack } = useProjectStore.getState();

  if (asset.kind === "animation") {
    const imported = await importAnimationFromUrl(asset.importUrl, asset.title);
    toast.success("Animation added", imported.name);
    return;
  }

  const file =
    asset.kind === "icon"
      ? await svgToPngFile(asset.importUrl, safeFileName(asset, "png").replace(/\.png$/, ""))
      : await (async () => {
          const response = await fetch(asset.importUrl!, { credentials: "omit" });
          if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
          const blob = await response.blob();
          if (!blob.size) throw new Error("The download was empty");
          const extension = blob.type.split("/")[1]?.split("+")[0] || "bin";
          return new File([blob], safeFileName(asset, extension), {
            type: blob.type || "application/octet-stream",
          });
        })();

  const imported = await importMedia(file);
  if (!imported.success || !imported.actionId) {
    throw new Error(imported.error?.message ?? "Could not decode the downloaded file");
  }
  await addClipToNewTrack(imported.actionId, startTime);
  toast.success("Added to the timeline", asset.title);
}
