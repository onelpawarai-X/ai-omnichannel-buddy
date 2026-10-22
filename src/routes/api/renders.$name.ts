import { createFileRoute } from "@tanstack/react-router";
import { readFile, stat } from "node:fs/promises";

import { resolveRenderFile } from "../../server/media-runner";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  json: "application/json",
  txt: "text/plain",
};

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

/** Serves files the media worker produced. */
export const Route = createFileRoute("/api/renders/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = resolveRenderFile(params.name);
        if (!path) return Response.json({ error: "invalid name" }, { status: 400 });
        try {
          const info = await stat(path);
          if (!info.isFile()) return Response.json({ error: "not a file" }, { status: 404 });
          const bytes = await readFile(path);
          return new Response(bytes, {
            headers: {
              "content-type": mimeFor(path),
              "content-length": String(info.size),
              "access-control-allow-origin": "*",
              "cache-control": "no-cache",
            },
          });
        } catch {
          return Response.json({ error: "not found" }, { status: 404 });
        }
      },
    },
  },
});
