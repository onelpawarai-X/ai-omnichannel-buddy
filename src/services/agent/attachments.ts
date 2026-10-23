import type { AIModality } from "../../stores/ai-provider-catalog";

/** A file staged in the composer, kept in memory only. */
export interface PendingAttachment {
  readonly id: string;
  readonly file: File;
  readonly kind: AIModality;
  readonly dataUrl: string;
}

const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

const EXTENSION_KINDS: Record<string, AIModality> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", bmp: "image",
  mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio", flac: "audio", opus: "audio",
  pdf: "pdf",
};

/** Classify a file by MIME type, falling back to its extension. */
export function classifyFile(file: File): AIModality | null {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_KINDS[ext] ?? null;
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Split a `data:` URL into its base64 payload and media type. */
export function splitDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return { mediaType: "application/octet-stream", data: dataUrl };
  return { mediaType: match[1] || "application/octet-stream", data: match[3] ?? "" };
}

/**
 * Stage files the user dropped, pasted or picked. Files whose kind the model
 * cannot read are rejected by name so the composer can explain why.
 */
export async function stageFiles(
  files: readonly File[],
): Promise<{ staged: PendingAttachment[]; rejected: string[] }> {
  const staged: PendingAttachment[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const kind = classifyFile(file);
    if (!kind || file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(file.name);
      continue;
    }
    staged.push({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      kind,
      dataUrl: await readAsDataUrl(file),
    });
  }
  return { staged, rejected };
}

/** Files carried by a clipboard or drag event, including pasted images. */
export function filesFromDataTransfer(
  transfer: DataTransfer | null,
): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []);
  if (files.length) return files;
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
