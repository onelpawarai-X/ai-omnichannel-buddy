import { ActionExecutor } from "@openreel/core";
import { CAPABILITY_MANIFEST } from "@openreel/core/capabilities/manifest";
import { editSnapshot, type EditSnapshot } from "@openreel/core/actions/handlers/edit-snapshot";
import { createPortableEdit } from "@openreel/core/editing/portable-project";
import { TitleEngine } from "@openreel/core/text/title-engine";
import type { Project, Action } from "@openreel/core";
import type {
  EditingHost,
  TxnHandle,
  TextOverlayOptions,
  UpdateTextOverlayOptions,
  ImportedMediaRef,
  GenerateImageOptions,
  GeneratedImageRef,
  StockSearchOptions,
  StockSearchResult,
  ImportedAnimationRef,
} from "@openreel/agent";
import { searchSource, type StockSourceId } from "../stock-library";
import { importAnimationFromUrl as importAnimationFromUrlShared } from "../stock-import";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { getMediaBridge, initializeMediaBridge } from "../../bridges/media-bridge";

export function cloneEditSnapshot(snapshot: EditSnapshot): EditSnapshot {
  return { ...JSON.parse(JSON.stringify({ ...snapshot, mediaLibrary: undefined })), mediaLibrary: { items: snapshot.mediaLibrary.items.map((m) => ({ ...m })) } } as EditSnapshot;
}
const IMAGE_SIZE_BY_ASPECT: Record<string, readonly [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "3:2": [1200, 800],
  "2:3": [800, 1200],
  "21:9": [1536, 658],
};

/** Accept "16:9", "1280x720", or nothing (square). */
function imageSize(size?: string): { width: number; height: number } {
  const value = size?.trim();
  if (value) {
    const aspect = IMAGE_SIZE_BY_ASPECT[value];
    if (aspect) return { width: aspect[0], height: aspect[1] };
    const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width >= 64 && height >= 64 && width <= 4096 && height <= 4096) return { width, height };
    }
  }
  return { width: 1024, height: 1024 };
}

const blobRevisions = new WeakMap<Blob, number>();
let nextBlobRevision = 0;
const blobRevision = (blob: Blob | null): number => { if (!blob) return 0; if (!blobRevisions.has(blob)) blobRevisions.set(blob, ++nextBlobRevision); return blobRevisions.get(blob)!; };
export function projectRevision(project: Project): string {
  return JSON.stringify({ ...editSnapshot(project), mediaLibrary: { items: project.mediaLibrary.items.map((m) => ({ id: m.id, name: m.name, metadata: m.metadata, sourceFile: m.sourceFile, blobRevision: blobRevision(m.blob) })) }, id: project.id, modifiedAt: project.modifiedAt });
}

/** Engine actions run on an isolated draft. Exactly one snapshot enters UI history. */
export class EditingSession implements EditingHost {
  private draft!: Project;
  private revision = "";
  private original!: Project;
  private executor = new ActionExecutor();
  private hasChanges = false;
  private exportRequested = false;
  private portable = false;
  committed = false;
  constructor(private signal?: AbortSignal) {}
  requireOpenProject(): void { if (!useProjectStore.getState().hasOpenProject) throw new Error("Open a project first"); }
  getProject(): Project { this.requireOpenProject(); return this.draft; }
  capabilities() { return CAPABILITY_MANIFEST; }
  beginTransaction(): TxnHandle {
    this.requireOpenProject();
    this.original = useProjectStore.getState().getFullProject();
    this.revision = projectRevision(this.original);
    this.draft = { ...this.original, ...cloneEditSnapshot(editSnapshot(this.original)) };
    try { createPortableEdit(this.draft); this.portable = true; } catch { this.portable = false; }
    return { id: crypto.randomUUID() };
  }
  async applyAction(action: Action) {
    if (this.signal?.aborted) throw new Error("Edit cancelled");
    const result = await this.executor.execute(action, this.draft);
    if (result.success) {
      if (this.portable) createPortableEdit(this.draft);
      this.hasChanges = true;
    }
    return result;
  }
  async commitTransaction(_handle: TxnHandle, label: string): Promise<void> {
    if (this.signal?.aborted) throw new Error("Edit cancelled");
    if (projectRevision(useProjectStore.getState().getFullProject()) !== this.revision) throw new Error("The project changed while the AI was working. No AI changes were applied; try again.");
    if (this.hasChanges) {
      const store = useProjectStore.getState();
      store.beginHistoryGroup(label);
      try {
        const result = await store.executeAction({ type: "project/applyEditSnapshot", id: crypto.randomUUID(), timestamp: Date.now(), params: { snapshot: cloneEditSnapshot(editSnapshot(this.draft)) } });
        if (!result.success) throw new Error(result.error?.message ?? "Could not apply edit");
        this.committed = true;
      } finally { store.endHistoryGroup(); }
    }
    if (this.exportRequested) useUIStore.getState().openModal("export");
  }
  async rollbackTransaction(): Promise<void> { this.hasChanges = false; this.exportRequested = false; }
  async runJob() { return { ok: false, error: "This job is unavailable in the local AI workspace" }; }
  requestExport(): void { this.exportRequested = true; }
  replaceDraft(project: Project): void { this.draft = project; this.hasChanges = true; }
  async relinkMedia(mediaId: string, file: File): Promise<void> {
    const old = this.draft.mediaLibrary.items.find((m) => m.id === mediaId);
    if (!old) throw new Error("Missing media reference");
    if (!getMediaBridge().isInitialized()) await initializeMediaBridge();
    const result = await getMediaBridge().importFile(file, true);
    if (!result.success || !result.media) throw new Error(result.error ?? "Could not decode media");
    const decoded = result.media;
    const type = decoded.metadata.hasVideo ? "video" : decoded.metadata.hasAudio ? "audio" : "image";
    if (type !== old.type) throw new Error("Choose the same decoded media type");
    const asset = { ...old, name: file.name, blob: file, fileHandle: null, isPlaceholder: false, sourceFile: { name: file.name, size: file.size, lastModified: file.lastModified }, metadata: { duration: decoded.metadata.duration ?? 0, width: decoded.metadata.width ?? 0, height: decoded.metadata.height ?? 0, frameRate: decoded.metadata.frameRate ?? 0, codec: decoded.metadata.codec ?? "", sampleRate: decoded.metadata.sampleRate ?? 0, channels: decoded.metadata.channels ?? 0, fileSize: file.size }, thumbnailUrl: decoded.thumbnails?.[0]?.dataUrl ?? null, waveformData: decoded.waveformData?.peaks ?? null };
    const project = { ...this.draft, mediaLibrary: { items: this.draft.mediaLibrary.items.map((m) => m.id === mediaId ? asset : m) } };
    createPortableEdit(project); // Check actual decoded source ranges before publishing.
    this.replaceDraft(project);
  }
  /**
   * Decode a file and add it to the draft media library, without committing.
   * Shared by URL import and image generation so both go through the same
   * decoder that the manual import path uses.
   */
  private async addMediaFile(file: File, requestedName?: string): Promise<ImportedMediaRef> {
    if (!getMediaBridge().isInitialized()) await initializeMediaBridge();
    const result = await getMediaBridge().importFile(file, true);
    if (!result.success || !result.media) throw new Error(result.error ?? "Could not decode media");
    const decoded = result.media;
    const type = decoded.metadata.hasVideo ? "video" : decoded.metadata.hasAudio ? "audio" : "image";
    const mediaId = crypto.randomUUID();
    const name = requestedName ?? file.name;
    const asset = {
      id: mediaId,
      name,
      type,
      blob: file,
      fileHandle: null,
      isPlaceholder: false,
      sourceFile: { name, size: file.size, lastModified: file.lastModified },
      metadata: {
        duration: decoded.metadata.duration ?? 0,
        width: decoded.metadata.width ?? 0,
        height: decoded.metadata.height ?? 0,
        frameRate: decoded.metadata.frameRate ?? 0,
        codec: decoded.metadata.codec ?? "",
        sampleRate: decoded.metadata.sampleRate ?? 0,
        channels: decoded.metadata.channels ?? 0,
        fileSize: file.size,
      },
      thumbnailUrl: decoded.thumbnails?.[0]?.dataUrl ?? null,
      waveformData: decoded.waveformData?.peaks ?? null,
    } as unknown as Project["mediaLibrary"]["items"][number];
    const project = { ...this.draft, mediaLibrary: { items: [...this.draft.mediaLibrary.items, asset] } };
    createPortableEdit(project); // Validate the decoded source before publishing.
    this.replaceDraft(project);
    return {
      mediaId,
      name,
      type,
      durationSec: decoded.metadata.duration ?? 0,
      width: decoded.metadata.width || undefined,
      height: decoded.metadata.height || undefined,
    };
  }

  /** Download a public http(s) file straight into the media library. */
  async importMediaFromUrl(url: string, options?: { name?: string }): Promise<ImportedMediaRef> {
    this.requireOpenProject();
    let response: Response;
    try {
      response = await fetch(url, { credentials: "omit", redirect: "follow" });
    } catch {
      throw new Error(`Could not download ${url}. The host blocked the browser request (CORS) or the URL is unreachable.`);
    }
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("The download was empty");
    const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
    const base = path.split("/").filter(Boolean).pop();
    const name = options?.name ?? (base && base.includes(".") ? decodeURIComponent(base) : `media-${Date.now()}.${blob.type.split("/")[1] || "bin"}`);
    return await this.addMediaFile(new File([blob], name, { type: blob.type || "application/octet-stream" }), name);
  }

  /** Keyless text-to-image, added straight to the media library. */
  async generateImage(options: GenerateImageOptions): Promise<GeneratedImageRef> {
    this.requireOpenProject();
    const { width, height } = imageSize(options.size);
    const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(options.prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    let response: Response;
    try {
      response = await fetch(url, { credentials: "omit", redirect: "follow" });
    } catch {
      throw new Error("Could not reach the image service. Check the network connection.");
    }
    if (!response.ok) throw new Error(`Image generation failed: HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("The image service returned an empty image.");
    const name = options.name ?? `generated-${Date.now()}.png`;
    const ref = await this.addMediaFile(new File([blob], name, { type: blob.type || "image/png" }), name);
    return { mediaId: ref.mediaId, name: ref.name, width: ref.width ?? width, height: ref.height ?? height };
  }

  /** Keyless stock search, straight from the browser for most sources. */
  async searchStock(options: StockSearchOptions): Promise<readonly StockSearchResult[]> {
    this.requireOpenProject();
    const source = (options.source ?? "").trim() as StockSourceId;
    const results = await searchSource(source, options.query ?? "", options.limit ?? 12);
    return results.map((asset) => ({
      id: asset.id,
      source: asset.source,
      kind: asset.kind,
      title: asset.title,
      ...(asset.importUrl ? { importUrl: asset.importUrl } : {}),
      ...(asset.previewUrl ? { previewUrl: asset.previewUrl } : {}),
      ...(asset.pageUrl ? { pageUrl: asset.pageUrl } : {}),
      ...(asset.author ? { author: asset.author } : {}),
      ...(asset.license ? { license: asset.license } : {}),
      ...(asset.durationSec ? { durationSec: asset.durationSec } : {}),
      ...(asset.unavailable ? { unavailable: asset.unavailable } : {}),
    }));
  }

  /** Download a Lottie JSON and register it as a motion composition. */
  async importAnimationFromUrl(url: string, options?: { name?: string }): Promise<ImportedAnimationRef> {
    this.requireOpenProject();
    const imported = await importAnimationFromUrlShared(url, options?.name);
    return {
      compositionId: imported.compositionId,
      name: imported.name,
      durationSec: imported.durationSec,
      width: imported.width,
      height: imported.height,
    };
  }

  async createTextOverlay(options: TextOverlayOptions) {
    let trackId = options.trackId ?? this.draft.timeline.tracks.find((t) => t.type === "text")?.id;
    if (!trackId) {
      const result = await this.applyAction({ type: "track/add", id: crypto.randomUUID(), timestamp: Date.now(), params: { trackType: "text", position: 0 } });
      if (!result.success) throw new Error(result.error?.message);
      trackId = this.draft.timeline.tracks.find((t) => t.type === "text")!.id;
    }
    if (this.draft.timeline.tracks.find((t) => t.id === trackId)?.locked) throw new Error("Text track is locked");
    const clip = new TitleEngine().createTextClip({ trackId, text: options.text, startTime: options.startSec, duration: options.durationSec, style: options.style });
    const result = await this.applyAction({ type: "text/create", id: crypto.randomUUID(), timestamp: Date.now(), params: { clip } });
    if (!result.success) throw new Error(result.error?.message);
    return { id: clip.id, trackId };
  }
  async updateTextOverlay(id: string, options: UpdateTextOverlayOptions) {
    const clip = this.draft.textClips?.find((c) => c.id === id);
    if (!clip) throw new Error(`Text element not found: ${id}`);
    if (this.draft.timeline.tracks.find((t) => t.id === clip.trackId)?.locked) throw new Error("Text track is locked");
    const updates = { ...(options.text !== undefined ? { text: options.text } : {}), ...(options.style ? { style: { ...clip.style, ...options.style } } : {}), ...(options.transform ? { transform: { ...clip.transform, ...options.transform } } : {}) };
    const result = await this.applyAction({ type: "text/update", id: crypto.randomUUID(), timestamp: Date.now(), params: { clipId: id, updates } });
    if (!result.success) throw new Error(result.error?.message);
    return { id, trackId: clip.trackId };
  }
}
