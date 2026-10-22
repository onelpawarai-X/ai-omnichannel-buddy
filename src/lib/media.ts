/**
 * Client-side media probing: duration, dimensions, thumbnails and keyframes.
 * Blob URLs only — nothing is uploaded.
 */
import type { MediaKind } from "./editor-store";

export function guessKindFromType(type: string, name: string): MediaKind | null {
  if (type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) return "audio";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) return "image";
  return null;
}

function loadElement(url: string, kind: "video" | "audio"): Promise<HTMLVideoElement | HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind) as HTMLVideoElement;
    el.preload = "auto";
    el.muted = true;
    el.src = url;
    const timer = window.setTimeout(() => reject(new Error("Media load timed out")), 30000);
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(el);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Media failed to load"));
    };
  });
}

/** Capture a frame from a video at a given time as a JPEG data URL. */
function captureFrame(video: HTMLVideoElement, time: number, maxW = 320): Promise<string> {
  return new Promise((resolve) => {
    const draw = () => {
      try {
        const scale = Math.min(1, maxW / (video.videoWidth || maxW));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((video.videoWidth || 320) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        resolve("");
      }
    };
    if (Math.abs(video.currentTime - time) < 0.05) {
      draw();
      return;
    }
    video.onseeked = () => {
      video.onseeked = null;
      draw();
    };
    video.currentTime = time;
  });
}

export type ProbeResult = {
  duration: number;
  width?: number;
  height?: number;
  thumb?: string;
  frames?: string[];
};

/** Probe a video: duration, size, poster frame and a few keyframes for the AI. */
export async function probeVideo(url: string): Promise<ProbeResult> {
  const video = (await loadElement(url, "video")) as HTMLVideoElement;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const thumb = await captureFrame(video, Math.min(0.5, duration / 2));
  const frameCount = Math.min(4, Math.max(1, Math.round(duration / 5)));
  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = duration > 1 ? (duration * i) / frameCount : 0;
    frames.push(await captureFrame(video, t, 224));
  }
  video.src = "";
  return { duration, width: video.videoWidth, height: video.videoHeight, thumb, frames };
}

/** Probe an image: natural size; default 4s timeline duration. */
export async function probeImage(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 320 / (img.naturalWidth || 320));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      let thumb: string | undefined;
      try {
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        thumb = canvas.toDataURL("image/jpeg", 0.6);
      } catch {
        thumb = undefined;
      }
      resolve({ duration: 4, width: img.naturalWidth, height: img.naturalHeight, thumb });
    };
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
}

/** Probe audio duration only. */
export async function probeAudio(url: string): Promise<ProbeResult> {
  const audio = await loadElement(url, "audio");
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  audio.src = "";
  return { duration };
}

/** Format seconds as mm:ss.d for UI labels. */
export function formatTime(t: number): string {
  if (!Number.isFinite(t)) return "0:00.0";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
