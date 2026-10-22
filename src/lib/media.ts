/** Small formatting helpers shared by the studio UI. */

/** Seconds to `m:ss.cc`, or `h:mm:ss.cc` past an hour. */
export function formatTime(seconds: number, frames = false, fps = 30): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  const head = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes);
  const tail = `${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  if (!frames) return `${head}:${tail}`;
  return `${head}:${tail}:${String(Math.floor((safe % 1) * fps)).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
