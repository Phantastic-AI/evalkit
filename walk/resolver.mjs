// The action resolver (docs/SPEC-two-rungs.md, "The action resolver
// (first-class component)"). Maps the goldfish's free-text named action
// onto one real control from a captured page. This mapping fails
// independently of the product's UX and must never be scored as product
// confusion — hence it lives here, tested offline against fixture pages,
// separate from anything that talks to staging.
//
// Resolution policy, in order: exact label match (of a quoted control name)
// > synonym match (a small built-in table, extendable per suite) > semantic
// fallback (token overlap — no model calls) > ambiguous. Whichever tier
// finds a candidate wins outright; a tier is only consulted when the one
// before it found nothing.
import { classify, defaultPolicy } from './safety.mjs';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'on', 'in', 'at', 'of', 'and', 'or', 'i', 'll', 'will', 'my',
  'me', 'go', 'goes', 'then', 'now', 'this', 'that', 'it', 'button', 'link', 'control', 'option',
  'click', 'clicking', 'press', 'pressing', 'tap', 'tapping', 'hit', 'select', 'selecting',
  'choose', 'choosing', 'try', 'trying', 'want', 'wanting',
]);

// Interchangeable phrasings a goldfish and a product's own copy might use
// for the same intent. Each entry is one group; matching happens on whole
// words/phrases, case-insensitive. A suite passes its own extra groups via
// opts.synonyms — those are additional groups, not replacements.
const DEFAULT_SYNONYMS = [
  ['submit', 'send', 'save', 'confirm', 'continue', 'next', 'done', 'finish', 'apply'],
  ['sign up', 'register', 'create account', 'join', 'get started'],
  ['sign in', 'log in', 'login', 'log on'],
  ['delete', 'remove', 'trash', 'discard'],
  ['edit', 'update', 'change', 'modify'],
  ['cancel', 'back', 'close', 'dismiss'],
  ['invite', 'add member', 'add reviewer', 'add helper'],
  ['view', 'open', 'read', 'see'],
];

function normalize(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:!?]+$/, '');
}

const QUOTE_RE = /['"“”‘’]([^'"“”‘’]{1,80})['"“”‘’]/;

/** The quoted control name inside a goldfish's named action, if any — e.g.
 *  `press "Submit Proposal"` -> "Submit Proposal". Straight quotes and
 *  curly quotes both count; whichever pair appears first wins. */
export function extractQuoted(namedAction) {
  const m = QUOTE_RE.exec(String(namedAction ?? ''));
  return m ? m[1] : null;
}

function tokenize(s) {
  return normalize(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function controlLabel(control) {
  return control.label || control.name || '';
}

function exactTier(namedAction, controls) {
  const quoted = extractQuoted(namedAction);
  if (!quoted) return [];
  const target = normalize(quoted);
  return controls.filter((c) => normalize(controlLabel(c)) === target || normalize(c.name) === target);
}

function buildSynonymGroups(extra) {
  const groups = [...DEFAULT_SYNONYMS, ...(extra ?? [])];
  return groups.map((g) => g.map(normalize));
}

// Padded on both ends so a phrase match at the very start or end of `text`
// still lands on a word boundary without a separate startsWith/endsWith check.
function groupsMatching(text, groups) {
  const t = ` ${normalize(text)} `;
  const hit = new Set();
  groups.forEach((group, i) => {
    if (group.some((phrase) => t.includes(` ${phrase} `))) hit.add(i);
  });
  return hit;
}

function synonymTier(namedAction, controls, extraSynonyms) {
  const groups = buildSynonymGroups(extraSynonyms);
  const actionGroups = groupsMatching(namedAction, groups);
  if (!actionGroups.size) return [];
  return controls.filter((c) => {
    const label = controlLabel(c);
    if (!label) return false;
    const labelGroups = groupsMatching(label, groups);
    for (const g of labelGroups) if (actionGroups.has(g)) return true;
    return false;
  });
}

const SEMANTIC_THRESHOLD = 0.5;
const SEMANTIC_TIE_EPSILON = 1e-9;

/** Token overlap between the named action and a control's label, scored as
 *  the fraction of the control's own tokens the action text also mentions
 *  — so a short label fully contained in a long, rambling action ("I think
 *  I'll press the button that says Continue to Payment... wait, actually
 *  let's just continue") still scores 1.0. No model calls; NO semantic
 *  embeddings — this is deliberately just overlap counting. */
function semanticScore(namedAction, control) {
  const label = controlLabel(control);
  if (!label) return 0;
  const actionTokens = new Set(tokenize(namedAction));
  const labelTokens = tokenize(label);
  if (!labelTokens.length) return 0;
  const hits = labelTokens.filter((t) => actionTokens.has(t)).length;
  return hits / labelTokens.length;
}

function semanticTier(namedAction, controls) {
  const scored = controls
    .map((c) => ({ control: c, score: semanticScore(namedAction, c) }))
    .filter((s) => s.score >= SEMANTIC_THRESHOLD);
  if (!scored.length) return [];
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => Math.abs(s.score - top) < SEMANTIC_TIE_EPSILON).map((s) => s.control);
}

/** Visibility verdict for one control against a viewport: false when the
 *  extraction layer directly observed it hidden (display:none, `hidden`,
 *  aria-hidden) or its declared bounds fall outside the viewport rect;
 *  undefined ("unknown") when there isn't enough information to say either
 *  way — spec: "when bounds are unavailable, mark visibility unknown,
 *  never guess." Undefined is treated as available by the resolver, same
 *  as true. */
export function isVisible(control, viewport) {
  if (control.hidden === true) return false;
  if (!control.bounds || !viewport) return undefined;
  const { top, left, width, height } = control.bounds;
  const scrollY = viewport.scrollY ?? 0;
  const viewTop = scrollY;
  const viewBottom = scrollY + viewport.height;
  const viewLeft = 0;
  const viewRight = viewport.width;
  const below = top >= viewBottom;
  const above = top + height <= viewTop;
  const rightOf = left >= viewRight;
  const leftOf = left + width <= viewLeft;
  if (below || above || rightOf || leftOf) return false;
  return true;
}

/** Resolve one tier's matches into either a chosen control or a failure,
 *  preferring visible candidates over ones the extraction layer or the
 *  viewport rules out. Returns null (not undefined) when the tier itself
 *  had no candidates at all, so the caller knows to fall through to the
 *  next tier rather than reporting a failure prematurely. */
function settleTier(matches, viewport, policy) {
  if (!matches.length) return null;

  const visible = matches.filter((c) => isVisible(c, viewport) !== false);
  if (visible.length === 0) {
    return { ok: false, failure: { class: 'hidden_control', matched: matches.length } };
  }
  if (visible.length > 1) {
    return { ok: false, failure: { class: 'multi_match', candidates: visible } };
  }

  const control = visible[0];
  if (control.disabled) {
    return { ok: false, failure: { class: 'disabled_control', control } };
  }
  const safety = classify(control, policy);
  if (!safety.pressable) {
    return { ok: false, failure: { class: 'unsafe_control', control, safety } };
  }
  return { ok: true, control, safety };
}

/** input: the goldfish's named action (free text, possibly with a quoted
 *  control name) and the candidate controls extracted from the current
 *  capture (html.mjs's extractControls). opts: {viewport, policy,
 *  synonyms}. Output: {ok:true, control, safety} or {ok:false, failure}
 *  with failure.class one of no_match, multi_match, hidden_control,
 *  disabled_control, unsafe_control. */
export function resolveAction(namedAction, controls, opts = {}) {
  const viewport = opts.viewport;
  const policy = opts.policy ?? defaultPolicy;

  const tiers = [
    exactTier(namedAction, controls),
    synonymTier(namedAction, controls, opts.synonyms),
    semanticTier(namedAction, controls),
  ];

  for (const matches of tiers) {
    const settled = settleTier(matches, viewport, policy);
    if (settled) return settled;
  }

  return { ok: false, failure: { class: 'no_match' } };
}
