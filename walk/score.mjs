// Scoring (docs/SPEC-two-rungs.md, "Scores" and "Bands"). Two score sets,
// never blended: CAPABILITY (binary done per journey — deterministic by
// construction, so disagreement across N repeats is a flake defect, never
// averaged into a rate) and UX (weighted per-step comprehension, with
// wandering caps and unobserved-step handling). Plus the band math a scored
// suite run reports across N walks — percentiles, the N-ladder rung, paging
// flags — and the hard-gate rollup. No model calls anywhere in this file:
// every input here (a walk's own trace, or a per-step comprehension grade)
// was already produced by drive.mjs or the grader, mechanically or once,
// upstream.

// ---- CAPABILITY --------------------------------------------------------

/** results: N walk() outputs for the SAME journey. CAPABILITY is a single
 *  shared boolean, not an average — the spec is explicit that variance here
 *  is flake, reported as its own defect, never blended into a rate. `done`
 *  is null (not a guess) exactly when the N repeats disagreed. */
export function scoreCapability(results) {
  const values = results.map((r) => !!r.done);
  const flake = values.length > 1 && !values.every((v) => v === values[0]);
  return { done: flake ? null : (values[0] ?? false), flake, n: values.length, values };
}

// ---- UX ------------------------------------------------------------------

/** Per-script-step status against one walk's own trace: 'comprehended' (the
 *  step was reached and its grader result says so), 'confused' (reached but
 *  not comprehended), or 'unobserved' (the walk never got that far — spec:
 *  "marked unobserved, never passed"). journey.steps: [{weight}, ...], one
 *  entry per scripted step, length === journey's own par. A trace step's
 *  `comprehended` field is attached upstream by the grading layer (layers
 *  1-4 of "Grader honesty") — this module only ever consumes it. */
export function stepStatuses(trace, steps) {
  return steps.map((_step, i) => {
    const observed = trace[i];
    if (!observed) return 'unobserved';
    return observed.comprehended ? 'comprehended' : 'confused';
  });
}

/** Weighted fraction of steps comprehended, 0-100, before any wandering cap.
 *  A step's weight is earned only on 'comprehended'; 'confused' and
 *  'unobserved' both earn nothing — spec: unreached steps are "never
 *  passed", and neither is a step the goldfish reached but got wrong. */
function baseUXScore(trace, steps) {
  if (!steps.length) return 0;
  const totalWeight = steps.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  if (totalWeight <= 0) return 0;
  const statuses = stepStatuses(trace, steps);
  let earned = 0;
  steps.forEach((s, i) => {
    if (statuses[i] === 'comprehended') earned += s.weight ?? 1;
  });
  return (earned / totalWeight) * 100;
}

/** Wandering caps (spec: "par = the scripted recipe's step count"):
 *  - a stuck reason of 'loop' caps at 50 outright — a loop is exactly the
 *    "random-walk finish" case the spec calls out, whether or not the walk
 *    eventually escaped it and finished; there is no dedicated "random walk"
 *    reason code in walk/stuck.mjs distinct from 'loop', so this is the one
 *    signal available to mean it.
 *  - otherwise, only a walk that actually reached its goal (done) has its
 *    path quality judged by how far over par it ran: >2x par caps at 60,
 *    >1.5x caps at 80. A walk that never finished at all is already scored
 *    low by baseUXScore's own unobserved-step handling and gets no separate
 *    path-quality cap on top of that.
 *  - path length is controlPresses, not stepsTaken (operator ruling,
 *    2026-08-26, from the first live walk: an honest 1-press CFP submit took
 *    3 decisions because reading a long form means scrolling it — scrolls
 *    are reading, not wandering). stepsTaken is the fallback for older walk
 *    results that never recorded presses. */
function applyWanderingCap(rawScore, { stepsTaken, controlPresses, par, done, stuckReason }) {
  if (stuckReason === 'loop') return Math.min(rawScore, 50);
  if (!done || !par) return rawScore;
  const ratio = (controlPresses ?? stepsTaken) / par;
  if (ratio > 2) return Math.min(rawScore, 60);
  if (ratio > 1.5) return Math.min(rawScore, 80);
  return rawScore;
}

/** journey.steps: the scripted step-by-step weights the scene author owns
 *  (spec: "weighted criteria owned by the scene author"), length === par.
 *  walkResult: one walk() output, its trace steps carrying `.comprehended`
 *  from the grading layer. Returns a single 0-100 UX score for this walk. */
export function scoreUX(walkResult, journey) {
  const steps = journey.steps ?? [];
  const raw = baseUXScore(walkResult.trace, steps);
  return applyWanderingCap(raw, walkResult);
}

// ---- Band math -------------------------------------------------------

/** The p-th percentile of `sorted` (already ascending) by linear
 *  interpolation between the two nearest ranks — the same method
 *  numpy.percentile defaults to. Exported because both band() and a test
 *  fixture (known array -> known percentile) want it directly. */
export function percentile(sorted, p) {
  if (!sorted.length) throw new Error('percentile: empty array');
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** p10/median/p90 plus band width, over N UX scores from N walk repeats of
 *  one journey. Percentiles, never min/max — spec: "min/max widen with N
 *  purely by sampling, which fakes regressions; percentiles stay stable." */
export function band(values) {
  if (!values.length) throw new Error('band: empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const p10 = percentile(sorted, 10);
  const median = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);
  return { p10, median, p90, width: p90 - p10 };
}

/** The N-ladder rung (spec: "N is a ladder"): dry while shaking the suite
 *  out (N<=2, where most reds are harness bugs, not product ones), scored
 *  once a full pass runs dry (the N=5 default lives here, but so does any
 *  other N short of a release run), release at N>=10. */
export function ladderRung(n) {
  if (n <= 2) return 'dry';
  if (n >= 10) return 'release';
  return 'scored';
}

/** Paging thresholds only ever apply at N>=5 (spec: "Paging thresholds at
 *  N>=5"); below that, sampling noise alone can trip any of these. */
export function pagingFlags(bandResult, n) {
  if (n < 5) return { paged: false, reasons: [] };
  const reasons = [];
  if (bandResult.median < 80) reasons.push('median<80');
  if (bandResult.p10 < 70) reasons.push('p10<70');
  if (bandResult.width > 15) reasons.push('band width>15');
  return { paged: reasons.length > 0, reasons };
}

// ---- Hard gates --------------------------------------------------------

/** BLOCK/REVIEW/PASS per spec's "Hard gates": a pretty aggregate never
 *  overrides a broken critical journey, an escaped external side effect, or
 *  a flaking fixture — those BLOCK outright, ahead of any UX number. */
export function hardGate({
  criticalJourneyFailed = false,
  externalSinkEscape = false,
  fixtureFlaked = false,
  uxBand = null,
  n = 0,
  unclassifiedHarnessFailure = false,
} = {}) {
  if (criticalJourneyFailed || externalSinkEscape || fixtureFlaked) return 'BLOCK';
  const paging = uxBand ? pagingFlags(uxBand, n) : { paged: false, reasons: [] };
  if (paging.paged || unclassifiedHarnessFailure) return 'REVIEW';
  return 'PASS';
}
