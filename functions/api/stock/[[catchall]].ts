/**
 * Same-origin Mixkit shelf for the browser.
 *
 * Mixkit sends no CORS header, so the stock panel cannot read its category
 * pages directly. This route fetches them server-side and returns JSON; the
 * playable 720p/1080p mp4 urls it reports are on a CDN that does allow CORS, so
 * the editor downloads the chosen clip straight from the browser.
 */
import { stockResponse } from "../../_lib/stock";

export const onRequestGet: PagesFunction = async ({ request }) =>
  Response.json(await stockResponse(new URL(request.url).searchParams));
