// Action safety policy for goldfish walks (docs/SPEC-two-rungs.md, "Safety
// policy"). classify(control, policy) sorts one candidate control into the
// spec's six classes and says whether the runner may press it. Only
// external_side_effect and credential controls are actually withheld here —
// destructive_contained is allowed on purpose (staging absorbs the press;
// attraction to the delete button is the finding, not the incident) and
// unknown_risky is withheld only because we couldn't classify it, not
// because it looks dangerous.
//
// Config-driven: a suite passes its own policy (usually defaultPolicy with a
// few pattern lists overridden via mergePolicy) so a product's own
// vocabulary ("archive", "revoke", "wire transfer") gets covered without
// touching this file.

const CREDENTIAL_TYPES = new Set(['password']);

const DEFAULT_CREDENTIAL_PATTERNS = [
  /\bpassword\b/i,
  /\bcredential/i,
  /\bapi[\s-]?key/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\b(?:2fa|mfa|two-factor)\b/i,
  /\bsecurity question/i,
  /\bdelete (?:my )?account\b/i,
  /\brevoke (?:all )?sessions?\b/i,
  /\bsign out (?:of )?all (?:sessions|devices)\b/i,
];

const DEFAULT_EXTERNAL_PATTERNS = [
  /\bwebhook/i,
  /\bpayment\b/i,
  /\bcharge\b/i,
  /\bcheckout\b/i,
  /\bcalendar invite\b/i,
  /\badd to calendar\b/i,
  /\bsend (?:an )?sms\b/i,
  /\btext message\b/i,
  /\/webhooks?(?:\/|$)/i,
  /\/payments?(?:\/|$)/i,
  /\/calendar\/invite\b/i,
];

const DEFAULT_DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\bdiscard\b/i,
  /\bdrop\b/i,
  /\bunpublish\b/i,
  /\bdeactivate\b/i,
  /\bban\b/i,
  /\brevoke access\b/i,
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const defaultPolicy = {
  credentialPatterns: DEFAULT_CREDENTIAL_PATTERNS,
  externalPatterns: DEFAULT_EXTERNAL_PATTERNS,
  destructivePatterns: DEFAULT_DESTRUCTIVE_PATTERNS,
  // Deterministic addresses external_side_effect controls would route to,
  // once a runner actually wires sink routing (walk/isolation.mjs mints the
  // per-run addresses; this is just the declared shape a suite policy can
  // override). Not consulted by classify() — carried along for the runner.
  sinks: {},
};

/** Merge a suite's own policy fragment onto defaultPolicy. Suite JSON can
 *  only carry strings (no RegExp literals), so a string pattern is treated
 *  as case-insensitive and compiled at match time; a JS caller may still
 *  pass real RegExp objects. Suite arrays REPLACE the matching default
 *  array (additive-by-convention: copy the defaults you want to keep into
 *  your own list) rather than merging pattern-by-pattern, which would make
 *  it impossible to narrow an over-eager built-in pattern. */
export function mergePolicy(overrides = {}, base = defaultPolicy) {
  return {
    ...base,
    ...overrides,
    sinks: { ...base.sinks, ...(overrides.sinks ?? {}) },
  };
}

function toMatcher(pattern) {
  return typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
}

function matchAny(haystacks, patterns) {
  for (const raw of patterns ?? []) {
    const re = toMatcher(raw);
    for (const h of haystacks) {
      if (h && re.test(h)) return { pattern: String(raw), text: h };
    }
  }
  return null;
}

/** Classify one candidate control. `control` is the DOM-ish descriptor the
 *  extraction layer hands back (see html.mjs's extractControls): tag, type,
 *  label, name, href, action, method, disabled. Returns
 *  {pressable, class, reason}. pressable is false for external_side_effect,
 *  credential, and unknown_risky — the three classes the spec says the
 *  runner must never press. */
export function classify(control, policy = defaultPolicy) {
  const label = String(control.label ?? control.name ?? '');
  const href = String(control.href ?? '');
  const action = String(control.action ?? '');
  const method = String(control.method ?? (href || !action ? 'GET' : 'POST')).toUpperCase();
  const type = String(control.type ?? '').toLowerCase();
  const haystacks = [label, href, action];

  if (CREDENTIAL_TYPES.has(type)) {
    return { pressable: false, class: 'credential', reason: `control type "${type}" is a credential field` };
  }
  const credHit = matchAny(haystacks, policy.credentialPatterns);
  if (credHit) {
    return { pressable: false, class: 'credential', reason: `matches credential pattern ${credHit.pattern} in "${credHit.text}"` };
  }

  if (href.startsWith('mailto:') || href.startsWith('tel:')) {
    return { pressable: false, class: 'external_side_effect', reason: `href scheme is external: "${href}"` };
  }
  const extHit = matchAny(haystacks, policy.externalPatterns);
  if (extHit) {
    return {
      pressable: false,
      class: 'external_side_effect',
      reason: `matches external-side-effect pattern ${extHit.pattern} in "${extHit.text}"`,
    };
  }

  const destHit = matchAny(haystacks, policy.destructivePatterns);
  if (destHit) {
    return {
      pressable: true,
      class: 'destructive_contained',
      reason: `matches destructive pattern ${destHit.pattern} in "${destHit.text}"; contained to the fixture world`,
    };
  }

  if (MUTATING_METHODS.has(method)) {
    return { pressable: true, class: 'contained_mutation', reason: `${method} inside the fixture world` };
  }

  const tag = String(control.tag ?? '').toLowerCase();
  const NAV_TAGS = new Set(['a']);
  const NAV_TYPES = new Set(['submit', 'button', 'reset']);
  if (method === 'GET' && (NAV_TAGS.has(tag) || NAV_TYPES.has(type) || tag === 'button')) {
    return { pressable: true, class: 'safe', reason: 'non-mutating navigation or read' };
  }

  return {
    pressable: false,
    class: 'unknown_risky',
    reason: `could not classify control (tag="${tag}", type="${type}", method="${method}") — trapped by default`,
  };
}
