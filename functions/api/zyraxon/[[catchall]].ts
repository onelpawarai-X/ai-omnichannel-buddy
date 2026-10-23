/**
 * Same-origin route to the ZYRAXON gateway for the browser.
 *
 * The gateway allows CORS on paper, but a cross-origin POST that carries the
 * editing tool definitions is blocked before it leaves the page, so every edit
 * failed while plain chat passed. Forwarding the call from our own origin
 * removes that hop. The gateway is public, so no credential is forwarded.
 *
 * `/api/zyraxon/v1/...` maps to `/api/public/zyraxon/v1/...`, and
 * `/api/zyraxon/tts...` to `/api/public/tts...`.
 */
import { zyraxonProxyResponse } from "../../_lib/zyraxon";

export const onRequest: PagesFunction = async ({ request }) =>
  zyraxonProxyResponse(request);
