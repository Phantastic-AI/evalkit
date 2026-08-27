// The stuck classifier (docs/SPEC-two-rungs.md, "Stuck classifier"). Pure
// functions over a walk's own history — no I/O, no network, nothing that
// talks to staging. A walk's runner appends one record per step and calls
// classifyStuck(history, opts) after each append; a non-null result ends
// the walk with that reason attached as its own finding, never scored as
// plain "failed".
//
// One history entry, as the runner builds it:
//   {
//     pageSignature,     // string: route + sorted visible-control labels
//     actionSignature,   // string|null: the resolved control's signature,
//                        // or null when nothing was resolved this step
//     progress,          // boolean: did the goal/progress truth improve
//     resolverFailure,   // null | 'no_match' | 'multi_match' |
//                        // 'hidden_control' | 'disabled_control' |
//                        // 'unsafe_control' — walk/resolver.mjs's own
//                        // failure.class, carried straight through
//     confused,          // boolean: goldfish said it doesn't know what to
//                        // do, or gave no executable next action
//   }

/** route + sorted visible-control labels, per spec. Sorting makes the
 *  signature insensitive to the order controls happen to render in. */
export function pageSignature(route, visibleLabels) {
  const labels = [...(visibleLabels ?? [])].map((l) => String(l).trim().toLowerCase()).sort();
  return `${route}::${labels.join('|')}`;
}

/** role + accessible name, collapsed to one string — built from a resolved
 *  control (walk/resolver.mjs's output) or straight from a control ID. */
export function actionSignature(control) {
  if (control == null) return null;
  if (typeof control === 'string') return control;
  const role = control.tag ?? control.role ?? '';
  const name = control.label ?? control.name ?? control.id ?? '';
  return `${role}:${name}`;
}

const RESOLVER_TO_STUCK = {
  unsafe_control: 'unsafe_trap',
  multi_match: 'control_ambiguous',
  no_match: 'control_unresolved',
  hidden_control: 'control_unresolved',
  disabled_control: 'control_unresolved',
};

function lastStepReason(last) {
  if (!last) return null;
  if (last.resolverFailure && RESOLVER_TO_STUCK[last.resolverFailure]) {
    return { reason: RESOLVER_TO_STUCK[last.resolverFailure], detail: { resolverFailure: last.resolverFailure } };
  }
  if (last.confused) {
    return { reason: 'explicit_confusion', detail: {} };
  }
  return null;
}

function stepKey(step) {
  return `${step.pageSignature}::${step.actionSignature}`;
}

/** Same page-state signature + same action signature produced no progress
 *  once already, and produces no progress again on the latest step. A
 *  goldfish may legitimately repeat an action across different records —
 *  what makes this stuck is the exact (state, action) pair recurring with
 *  nothing to show for it either time. */
function detectRepeatedNoop(history) {
  const last = history[history.length - 1];
  if (!last || last.progress || last.actionSignature == null) return null;
  const key = stepKey(last);
  const priorHit = history.slice(0, -1).find((s) => !s.progress && s.actionSignature != null && stepKey(s) === key);
  if (!priorHit) return null;
  return { reason: 'repeated_noop', detail: { pageSignature: last.pageSignature, actionSignature: last.actionSignature } };
}

/** A page-state signature the walk already visited since its last real
 *  progress recurs — A->B->A with nothing gained across the cycle, not
 *  just the same single action repeating (that's repeated_noop). */
function detectLoop(history) {
  const last = history[history.length - 1];
  if (!last || last.progress) return null;
  let sinceProgress = [];
  for (const step of history) {
    if (step.progress) {
      sinceProgress = [];
      continue;
    }
    sinceProgress.push(step.pageSignature);
  }
  const seen = new Set(sinceProgress.slice(0, -1));
  const current = sinceProgress[sinceProgress.length - 1];
  if (current != null && seen.has(current)) {
    return { reason: 'loop', detail: { pageSignature: current, cycleLength: sinceProgress.length } };
  }
  return null;
}

function defaultBudget(par) {
  return Math.max(8, 2 * par + 2);
}

/** Classify a walk's current history against the spec's seven reason
 *  codes, most actionable first. Returns null when nothing fires (the walk
 *  is still making a normal attempt), or {reason, detail}.
 *  opts: {budget} (an explicit hard step budget) or {par} (used to derive
 *  one per the spec's max(8, 2*par + 2) when budget is omitted). */
export function classifyStuck(history, opts = {}) {
  if (!history.length) return null;

  const last = history[history.length - 1];
  const fromLastStep = lastStepReason(last);
  if (fromLastStep) return fromLastStep;

  const noop = detectRepeatedNoop(history);
  if (noop) return noop;

  const loop = detectLoop(history);
  if (loop) return loop;

  const budget = opts.budget ?? (opts.par != null ? defaultBudget(opts.par) : undefined);
  if (budget != null && history.length >= budget) {
    return { reason: 'budget_exhausted', detail: { steps: history.length, budget } };
  }

  return null;
}
