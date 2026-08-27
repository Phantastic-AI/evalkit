// REAL screenshot adapter — the only place walk/drive.mjs's injected
// `screenshot` function actually touches the network. Wired in only by a
// future CLI entry point, never imported by walk/drive.mjs itself, never
// exercised by any test in walk/test/.
//
// Honest gap, recorded rather than papered over: docs/SPEC-two-rungs.md
// rules pixels as the goldfish's ONLY eyes ("pixels-as-eyes... DOM never
// reaches the goldfish"), which means the real `image` a goldfish call needs
// is an actual rendered screenshot — something only a browser's own layout
// engine can produce. This repo takes no new dependencies (the hackathon-
// adjacent build's own hard constraint) and has none of Playwright/
// Puppeteer/etc. already in place, so there is no zero-dependency way to
// rasterize a page from plain Node. What THIS module implements for real —
// the HTTP fetch and DOM extraction half, reusing tableread/http.mjs and
// tableread/html.mjs exactly as tableread/capture.mjs does — is genuinely
// wired and correct; only the pixel half is a documented stub that throws
// rather than fabricate an image. Wiring a real browser layer (and the new
// dependency that requires) is future work, not silently faked here.
import { request } from '../../tableread/http.mjs';
import { extractControls, toVisibleText } from '../../tableread/html.mjs';

/** The real screenshot() function walk/drive.mjs's DI contract expects:
 *  ({route, viewport}) -> {route, url, status, viewportUsed, image,
 *  visibleText, controls}. `jar` and `baseUrl` come from the caller's own
 *  per-persona session (tableread/primitives.mjs's jarFor), not from this
 *  module — a screenshot adapter has no identity of its own. */
export async function screenshotAdapter({ route, viewport, jar, baseUrl }) {
  const result = await request(jar, baseUrl, route);
  const controls = extractControls(result.html);
  const visibleText = toVisibleText(result.html);
  return {
    route,
    url: result.url,
    status: result.status,
    viewportUsed: viewport,
    image: renderPixels(),
    visibleText,
    controls,
  };
}

function renderPixels() {
  throw new Error(
    'screenshot-adapter.mjs: pixel rendering is not wired — this build takes no new dependencies, and rasterizing ' +
      "a page needs a real browser layout engine (e.g. Playwright), which isn't one of them yet. The HTTP fetch + " +
      'DOM extraction half of this adapter works today; only image capture remains future work.'
  );
}
