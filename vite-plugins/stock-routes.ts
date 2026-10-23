import type { Plugin } from "vite";

/**
 * Serve `/api/stock` and `/api/lottie` during `vite dev`.
 *
 * In production these are Cloudflare Pages Functions. Vite does not run Pages
 * Functions, so without this the two server-hop sources would work after deploy
 * and fail on the dev server. The handlers are the same shared module, so the
 * two paths cannot drift.
 */
export function stockRoutesPlugin(): Plugin {
  return {
    name: "openreel-stock-routes",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route =
          url.pathname === "/api/stock"
            ? "stock"
            : url.pathname === "/api/lottie"
              ? "lottie"
              : null;
        if (!route) return next();

        try {
          const { stockResponse, lottieResponse } = await import("../functions/_lib/stock.ts");
          const body =
            route === "stock"
              ? await stockResponse(url.searchParams)
              : await lottieResponse(url.searchParams);
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              results: [],
              error: error instanceof Error ? error.message : "stock source unreachable",
            }),
          );
        }
      });
    },
  };
}
