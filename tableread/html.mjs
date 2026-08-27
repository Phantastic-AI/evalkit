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

function isDisabled(a) {
  return 'disabled' in a || (a['aria-disabled'] ?? '').toLowerCase() === 'true';
}

/** true when a fixture directly says a control is hidden (a `hidden`
 *  attribute, `aria-hidden="true"`, or an inline `display:none`);
 *  undefined otherwise — "not marked hidden" is not the same claim as
 *  "visible" once off-viewport bounds enter the picture (walk/resolver.mjs
 *  is what turns this plus a viewport into an actual visibility verdict). */
function isMarkedHidden(a) {
  if ('hidden' in a) return true;
  if ((a['aria-hidden'] ?? '').toLowerCase() === 'true') return true;
  if (/display\s*:\s*none/i.test(a['style'] ?? '')) return true;
  return undefined;
}

/** Pixel bounds from a `data-bounds="top,left,width,height"` attribute, the
 *  one place this hand-rolled extraction can learn a control's on-page
 *  position — there is no layout engine here, so real CSS box geometry is
 *  out of reach; a fixture (or a future screenshot-driven capture step)
 *  stamps this attribute explicitly instead. Returns undefined, never a
 *  guess, when the attribute is absent or malformed. */
function parseBounds(a) {
  const raw = a['data-bounds'];
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [top, left, width, height] = parts;
  return { top, left, width, height };
}

/** Every clickable control on a page a walk's action resolver could name:
 *  links, buttons, and submit/button/reset inputs, each with its label,
 *  form context (the action/method it would submit against, when it's
 *  inside a `<form>`), disabled state, and — only where directly
 *  parseable, see isMarkedHidden/parseBounds above — a hidden flag and
 *  pixel bounds. Distinct from findForms' extractFields: that reads a
 *  form's data fields as a browser would submit them; this reads the
 *  clickable surface a person actually presses. */
export function extractControls(html) {
  const controls = [];
  let index = 0;

  const formRanges = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html))) {
    const a = parseAttrs(fm[1]);
    formRanges.push({
      start: fm.index,
      end: fm.index + fm[0].length,
      action: a['action'] ?? '',
      method: (a['method'] ?? 'GET').toUpperCase(),
    });
  }
  const formAt = (pos) => formRanges.find((f) => pos >= f.start && pos < f.end);

  const inputRe = /<input\b([^>]*?)\/?>/gi;
  let m;
  while ((m = inputRe.exec(html))) {
    const a = parseAttrs(m[1]);
    const type = (a['type'] ?? 'text').toLowerCase();
    if (!['submit', 'button', 'reset'].includes(type)) continue;
    const form = formAt(m.index);
    controls.push({
      id: a['id'] || `input-${index++}`,
      tag: 'input',
      type,
      label: a['value'] || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''),
      name: a['name'] ?? '',
      action: form?.action ?? '',
      method: form?.method ?? 'GET',
      disabled: isDisabled(a),
      hidden: isMarkedHidden(a),
      bounds: parseBounds(a),
    });
  }

  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((m = buttonRe.exec(html))) {
    const a = parseAttrs(m[1]);
    const type = (a['type'] ?? 'submit').toLowerCase();
    const form = formAt(m.index);
    controls.push({
      id: a['id'] || `button-${index++}`,
      tag: 'button',
      type,
      label: stripTags(m[2]).trim(),
      name: a['name'] ?? '',
      action: form?.action ?? '',
      method: form?.method ?? 'GET',
      disabled: isDisabled(a),
      hidden: isMarkedHidden(a),
      bounds: parseBounds(a),
    });
  }

  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(html))) {
    const a = parseAttrs(m[1]);
    if (!a['href']) continue;
    controls.push({
      id: a['id'] || `link-${index++}`,
      tag: 'a',
      type: 'link',
      label: stripTags(m[2]).trim(),
      name: a['name'] ?? '',
      href: a['href'],
      method: 'GET',
      disabled: isDisabled(a),
      hidden: isMarkedHidden(a),
      bounds: parseBounds(a),
    });
  }

  return controls;
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
