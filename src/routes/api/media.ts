import { createFileRoute } from "@tanstack/react-router";

import { proxyMedia } from "../../server/media-proxy";

/** Streams remote media through the server so the editor can seek and decode it. */
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target) return Response.json({ error: "url is required" }, { status: 400 });
        const result = await proxyMedia(target, request);
        if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
        return result.response;
      },
      HEAD: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target) return new Response(null, { status: 400 });
        const result = await proxyMedia(target, request);
        if (!result.ok) return new Response(null, { status: result.status });
        return result.response;
      },
    },
  },
});
