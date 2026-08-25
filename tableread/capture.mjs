// capture(url, jar, init) -> { status, visibleText }: GET (or, with init, POST)
// a page as one persona (their cookie jar) and reduce it to what a goldfish
// reader would actually see — the rendered-text extraction from html.mjs.
// This is the read half of the saga tools; primitives.mjs is the write half.
//
// init is normally omitted (a plain GET, every station in organizer.md and
// reviewer.md). A few scenes have no GET-able surface at all — /sign-in/link
// answers straight onto the response page rather than redirecting anywhere
// (index.ts's requestMagicLink), so the "page" a person actually sees is a
// POST's own response body. init lets a scene surface say so explicitly
// ({method:'POST', body:{...}}); run-scene.mjs is what builds init from a
// scene's own surface entry.
import { request, buildBody } from './http.mjs';
import { toVisibleText } from './html.mjs';

export async function capture(url, jar, init) {
  const u = new URL(url);
  const baseUrl = `${u.protocol}//${u.host}`;
  const reqInit = init?.method
    ? { method: init.method, body: init.body ? buildBody(init.body) : undefined }
    : {};
  const res = await request(jar, baseUrl, url, reqInit);
  return { status: res.status, visibleText: toVisibleText(res.html) };
}
