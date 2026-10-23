/**
 * Same-origin LottieFiles search for the browser.
 *
 * The catalogue is searched through a CSRF-protected server-rendered form, so
 * the search runs here and the panel receives plain JSON. The returned .json
 * animation urls are on a CDN that allows CORS, so the browser fetches the
 * animation itself.
 */
import { lottieResponse } from "../../_lib/stock";

export const onRequestGet: PagesFunction = async ({ request }) =>
  Response.json(await lottieResponse(new URL(request.url).searchParams));
