import { createFileRoute } from "@tanstack/react-router";

import { runMediaScript } from "../../server/media-runner";

/**
 * Runs a shell command on the media worker. Used by the editor agent to
 * synthesise test media and to probe files. The runner confines commands to a
 * scratch directory and refuses destructive patterns.
 */
export const Route = createFileRoute("/api/command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { script?: unknown; output?: unknown; timeoutMs?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "invalid json body" }, { status: 400 });
        }
        const script = typeof body.script === "string" ? body.script : "";
        if (!script.trim()) return Response.json({ ok: false, error: "script is required" }, { status: 400 });
        const output = typeof body.output === "string" ? body.output : undefined;
        const timeoutMs = typeof body.timeoutMs === "number" ? Math.min(300_000, Math.max(1000, body.timeoutMs)) : undefined;
        const result = await runMediaScript(script, output, timeoutMs);
        return Response.json(result);
      },
    },
  },
});
