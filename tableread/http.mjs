// HTTP plumbing for the saga tools: a per-actor cookie jar, a fetch wrapper
// that follows redirects by hand (so Set-Cookie on a 303 is never lost), and
// a "read the real form, override a few fields, post it back" helper. Ported
// from fizz/mbt/support/http.ts — same idiom, minus the cheerio dependency
// (see html.mjs), since this tool lives outside fizz/mbt's own node_modules
// and the brief is no new deps.
import { findForms } from './html.mjs';

export class CookieJar {
  #cookies = new Map();

  /** Record every Set-Cookie header on a response, last one wins per name. */
  apply(res) {
    const getSetCookie = res.headers.getSetCookie;
    const lines = getSetCookie ? getSetCookie.call(res.headers) : fallbackSetCookies(res);
    for (const line of lines) {
      const first = line.split(';', 1)[0] ?? '';
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (name) this.#cookies.set(name, value);
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function fallbackSetCookies(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** Turn a scraped/overridden fields object into a POST body. A field whose
 *  value is an array (a checkbox group — see html.mjs's extractFields)
 *  becomes one repeated param per element, so multi-select stays faithful
 *  to what a browser would actually send; everything else is one param. */
export function buildBody(fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      for (const item of v) body.append(k, item);
    } else if (v !== undefined && v !== null) {
      body.append(k, v);
    }
  }
  return body;
}

/**
 * Force any URL onto `baseUrl`'s own origin, keeping only path+search+hash.
 *
 * Ported from the mbt harness's local-wrangler-dev safety net (there,
 * request.url comes back carrying a production custom domain baked in, and
 * this stops any redirect from literally leaving the sandbox). Against
 * staging (real TLS, real workers.dev host) this is normally a no-op — the
 * app's own SITE_ORIGIN already matches the host we're talking to — but it
 * stays in place so the exact same tool can be pointed at a local wrangler
 * dev later without a second code path, and as a safety net if a redirect
 * Location were ever built from the wrong origin.
 */
function localize(url, baseUrl) {
  const target = new URL(url);
  const base = new URL(baseUrl);
  if (target.origin === base.origin) return url;
  target.protocol = base.protocol;
  target.hostname = base.hostname;
  target.port = base.port;
  return target.toString();
}

/**
 * GET or POST `path`, following redirects (303/302/301) by hand: capture
 * Set-Cookie at every hop, then re-request the Location with GET (matching
 * the POST-redirect-GET pattern this app uses throughout) and the jar's
 * current cookies. Returns the final, non-redirect response.
 */
export async function request(jar, baseUrl, path, init = {}) {
  let url = localize(path.startsWith('http') ? path : baseUrl + path, baseUrl);
  let method = init.method ?? 'GET';
  let body = init.body;

  for (let hop = 0; hop < 8; hop++) {
    const headers = {
      // x-forwarded-proto: https is what the app's http->https redirect
      // middleware reads as "a TLS-terminating proxy sits in front of me" —
      // true unconditionally on staging (Cloudflare's edge really does
      // that), and a harmless no-op there since the request already arrived
      // over TLS. Kept so the same client tolerates a bare local wrangler
      // dev later, where it is load-bearing (see fizz/mbt/support/http.ts).
      'x-forwarded-proto': 'https',
      ...(init.headers ?? {}),
      cookie: jar.header(),
    };
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
    const res = await fetch(url, {
      method,
      body: body ? body.toString() : undefined,
      headers,
      redirect: 'manual',
    });
    jar.apply(res);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect with no Location from ${url} (status ${res.status})`);
      url = localize(new URL(loc, url).toString(), baseUrl);
      method = 'GET';
      body = undefined;
      continue;
    }

    const html = await res.text();
    return { status: res.status, url, html };
  }
  throw new Error(`Too many redirects starting at ${path}`);
}

/**
 * Fetch `pagePath`, find the one real `<form>` `selectForm` picks out from
 * the page's parsed forms, apply `overrides` to its scraped fields, and POST
 * it back to the form's own `action` (resolved against the page it came
 * from). This is the only way primitives.mjs talks to the product — no
 * field is ever invented by hand, only overridden.
 */
export async function postFormOnPage(jar, baseUrl, pagePath, selectForm, overrides = {}) {
  const page = await request(jar, baseUrl, pagePath);
  const forms = findForms(page.html);
  const form = forms.find(selectForm);
  if (!form) {
    throw new Error(`Form not found on ${pagePath} (status ${page.status})`);
  }
  const fields = { ...form.fields };
  if (typeof overrides === 'function') overrides(fields, form);
  else Object.assign(fields, overrides);

  const action = form.action || pagePath;
  const method = form.method || 'POST';
  const postUrl = new URL(action, page.url).toString();
  return request(jar, baseUrl, postUrl, { method, body: buildBody(fields) });
}

/** GET a page and return its raw result plus its parsed forms. */
export async function loadPage(jar, baseUrl, path) {
  const result = await request(jar, baseUrl, path);
  return { forms: findForms(result.html), result };
}

/** One actor's session: its own cookie jar against the one shared server. */
export class Actor {
  jar = new CookieJar();
  #baseUrl;
  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }
  get(path) {
    return request(this.jar, this.#baseUrl, path);
  }
  postForm(pagePath, selectForm, overrides = {}) {
    return postFormOnPage(this.jar, this.#baseUrl, pagePath, selectForm, overrides);
  }
  load(path) {
    return loadPage(this.jar, this.#baseUrl, path);
  }
}
