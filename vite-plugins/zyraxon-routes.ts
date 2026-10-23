import type { Plugin } from "vite";
import { zyraxonProxyResponse } from "../functions/_lib/zyraxon.ts";

/**
 * Serve the ZYRAXON same-origin proxy during `vite dev`.
 *
 * In production this is the Cloudflare Pages Function; Vite does not run Pages
 * Functions, so without this the gateway would be reachable after deploy and
 * blocked on the dev server. Both call the same handler.
 */
export function zyraxonRoutesPlugin(): Plugin {
  return {
    name: "openreel-zyraxon-routes",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/zyraxon/")) return next();

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks);

        const request = new Request(url.toString(), {
          method: req.method ?? "GET",
          headers: req.headers as Record<string, string>,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
        });

        try {
          const response = await zyraxonProxyResponse(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const buffer = Buffer.from(await response.arrayBuffer());
          res.end(buffer);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "gateway unreachable",
            }),
          );
        }
      });
    },
  };
}
