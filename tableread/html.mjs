// Hand-rolled HTML surgery for the saga tools: form scraping and visible-text
// extraction, no parser dependency. fizz/mbt proves fetch+regex is enough for
// the parts it doesn't hand to cheerio (magic-link extraction); the saga
// tools live outside that tree with no new deps, so the same idea covers the
// rest — forms and page text — for this app's plain, server-rendered markup.

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Parse a tag's raw attribute text into a plain object, keys lowercased.
 *  Handles double-quoted, single-quoted, and bare values; a bare attribute
 *  name (e.g. `checked`, `selected`) gets value ''. */
function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2] !== undefined ? m[2] : '';
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}

/** Every input/select/textarea in a form body, as a browser would submit it —
 *  matches fizz/mbt/support/http.ts's extractForm semantics field for field,
 *  with one addition it doesn't need: a checkbox field always comes back as
 *  an ARRAY of the currently-checked values (possibly empty), never a bare
 *  scalar, because this app has real checkbox GROUPS (group members, deal
 *  recipients) where more than one can be checked at once and an override
 *  needs a array to replace wholesale. A radio group stays a scalar — only
 *  one can ever be checked. */
function extractFields(body) {
  const fields = {};
  let m;

  const inputRe = /<input\b([^>]*?)\/?>/gi;
  while ((m = inputRe.exec(body))) {
    const a = parseAttrs(m[1]);
    const name = a['name'];
    if (!name) continue;
    const type = (a['type'] ?? 'text').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset') continue;
    if (type === 'checkbox') {
      if (!Array.isArray(fields[name])) fields[name] = [];
      if ('checked' in a) fields[name].push(a['value'] || 'on');
      continue;
    }
    if (type === 'radio') {
      if ('checked' in a) fields[name] = a['value'] || 'on';
      continue;
    }
    fields[name] = a['value'] ?? '';
  }

  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(body))) {
    const a = parseAttrs(m[1]);
    const name = a['name'];
    if (!name) continue;
    const options = parseOptions(m[2]);
    const selected = options.find((o) => o.selected) ?? options[0];
    fields[name] = selected ? selected.value : '';
  }

  const taRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  while ((m = taRe.exec(body))) {
    const a = parseAttrs(m[1]);
    const name = a['name'];
    if (!name) continue;
    fields[name] = decodeEntities(m[2]);
  }

  return fields;
}

function parseOptions(selectBody) {
  const out = [];
  const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = optRe.exec(selectBody))) {
    const a = parseAttrs(m[1]);
    const text = stripTags(m[2]).trim();
    out.push({ value: a['value'] !== undefined ? a['value'] : text, text, selected: 'selected' in a });
  }
  return out;
}

/** Every `<form>` on a page: action, method, fields (browser-submit shape),
 *  and the raw body so a caller can dig further (e.g. read a `<select>`'s
 *  live `<option>` list for a field extractField's "first value" default
 *  isn't the right pick). */
export function findForms(html) {
  const forms = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = formRe.exec(html))) {
    const a = parseAttrs(m[1]);
    forms.push({
      action: a['action'] ?? '',
      method: (a['method'] ?? 'GET').toUpperCase(),
      class: a['class'] ?? '',
      id: a['id'] ?? '',
      body: m[2],
      fields: extractFields(m[2]),
    });
  }
  return forms;
}

/** The `<option>`s of one named `<select>` inside `html` (page or form
 *  body) — for reading a live dropdown's real choices instead of guessing. */
export function optionsOf(html, selectName) {
  const re = new RegExp(`<select\\b[^>]*\\bname=["']${selectName}["'][^>]*>([\\s\\S]*?)</select>`, 'i');
  const m = re.exec(html);
  return m ? parseOptions(m[1]) : [];
}

/** First option with a real (non-empty) value — skips a leading "Choose
 *  one" placeholder, mirroring fizz/mbt/support/world.ts's firstRealOption. */
export function firstRealOption(options) {
  for (const o of options) if (o.value) return o.value;
  return undefined;
}

const BLOCK_CLOSERS =
  /<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|header|footer|nav|ul|ol|table|form|label|fieldset|dt|dd|dl|blockquote|pre)>/gi;

/** Rendered-text extraction: links as `text [LINK: href]`, buttons (real
 *  `<button>` and `<input type=submit|button>`) as `[BUTTON: label]`, block
 *  elements become newlines, scripts/styles are stripped outright before
 *  anything else runs on them. */
export function toVisibleText(html) {
  let s = html;
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_all, attrRaw, inner) => {
    const a = parseAttrs(attrRaw);
    const text = stripTags(inner).trim();
    return a['href'] ? `${text} [LINK: ${a['href']}]` : text;
  });

  s = s.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (_all, _attrRaw, inner) => {
    return `[BUTTON: ${stripTags(inner).trim()}]`;
  });

  s = s.replace(/<input\b([^>]*?)\/?>/gi, (_all, attrRaw) => {
    const a = parseAttrs(attrRaw);
    const type = (a['type'] ?? 'text').toLowerCase();
    if (type === 'submit' || type === 'button') return `[BUTTON: ${a['value'] || 'Submit'}]`;
    return '';
  });

  s = s.replace(BLOCK_CLOSERS, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  const lines = s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const collapsed = [];
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }
  return collapsed.join('\n').trim();
}
