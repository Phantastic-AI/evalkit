import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCapability,
  stepStatuses,
  scoreUX,
  percentile,
  band,
  ladderRung,
  pagingFlags,
  hardGate,
} from '../score.mjs';

// ---- CAPABILITY ----

test('scoreCapability: all N repeats agree — reports the shared boolean, no flake', () => {
  const r = scoreCapability([{ done: true }, { done: true }, { done: true }]);
  assert.equal(r.done, true);
  assert.equal(r.flake, false);
  assert.equal(r.n, 3);
});

test('scoreCapability: a single disagreement across N is flake, never averaged into a rate', () => {
  const r = scoreCapability([{ done: true }, { done: true }, { done: false }]);
  assert.equal(r.done, null);
  assert.equal(r.flake, true);
  assert.deepEqual(r.values, [true, true, false]);
});

test('scoreCapability: N=1 can never flake (nothing to disagree with)', () => {
  const r = scoreCapability([{ done: false }]);
  assert.equal(r.done, false);
  assert.equal(r.flake, false);
});

// ---- UX: step statuses and base score ----

test('stepStatuses: comprehended, confused (reached but not comprehended), and unobserved (never reached)', () => {
  const trace = [{ comprehended: true }, { comprehended: false }];
  const steps = [{ weight: 1 }, { weight: 1 }, { weight: 1 }];
  assert.deepEqual(stepStatuses(trace, steps), ['comprehended', 'confused', 'unobserved']);
});

test('scoreUX: a clean walk at par, every step comprehended, scores 100', () => {
  const journey = { par: 3, steps: [{ weight: 1 }, { weight: 1 }, { weight: 1 }] };
  const walkResult = {
    done: true,
    stepsTaken: 3,
    par: 3,
    stuckReason: null,
    trace: [{ comprehended: true }, { comprehended: true }, { comprehended: true }],
  };
  assert.equal(scoreUX(walkResult, journey), 100);
});

test('scoreUX: unreached steps earn nothing — never counted as passed', () => {
  const journey = { par: 4, steps: [{ weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1 }] };
  const walkResult = { done: false, stepsTaken: 2, par: 4, stuckReason: 'budget_exhausted', trace: [{ comprehended: true }, { comprehended: true }] };
  assert.equal(scoreUX(walkResult, journey), 50); // 2 of 4 equal-weight steps earned
});

test('scoreUX: weights are respected, not just a step count', () => {
  const journey = { par: 2, steps: [{ weight: 3 }, { weight: 1 }] };
  const walkResult = { done: true, stepsTaken: 2, par: 2, stuckReason: null, trace: [{ comprehended: false }, { comprehended: true }] };
  assert.equal(scoreUX(walkResult, journey), 25); // 1 of 4 total weight
});

// ---- UX: wandering caps ----

test('scoreUX: a walk within 1.5x par is uncapped', () => {
  const journey = { par: 4, steps: Array.from({ length: 4 }, () => ({ weight: 1 })) };
  const walkResult = { done: true, stepsTaken: 5, par: 4, stuckReason: null, trace: Array.from({ length: 4 }, () => ({ comprehended: true })) };
  assert.equal(scoreUX(walkResult, journey), 100); // 5/4 = 1.25x, under the 1.5x threshold
});

test('scoreUX: over 1.5x par caps a done walk at 80', () => {
  const journey = { par: 4, steps: Array.from({ length: 4 }, () => ({ weight: 1 })) };
  const walkResult = { done: true, stepsTaken: 7, par: 4, stuckReason: null, trace: Array.from({ length: 4 }, () => ({ comprehended: true })) };
  assert.equal(scoreUX(walkResult, journey), 80); // 7/4 = 1.75x; raw 100 capped to 80
});

test('scoreUX: over 2x par caps a done walk at 60', () => {
  const journey = { par: 4, steps: Array.from({ length: 4 }, () => ({ weight: 1 })) };
  const walkResult = { done: true, stepsTaken: 9, par: 4, stuckReason: null, trace: Array.from({ length: 4 }, () => ({ comprehended: true })) };
  assert.equal(scoreUX(walkResult, journey), 60); // 9/4 = 2.25x
});

test('scoreUX: a cap only ever lowers the score, never raises a genuinely bad one', () => {
  const journey = { par: 4, steps: Array.from({ length: 4 }, () => ({ weight: 1 })) };
  const walkResult = { done: true, stepsTaken: 9, par: 4, stuckReason: null, trace: [{ comprehended: true }, { comprehended: false }, { comprehended: false }, { comprehended: false }] };
  assert.equal(scoreUX(walkResult, journey), 25); // raw 25 is already under the 60 cap
});

test('scoreUX: a loop finish caps at 50 regardless of how much was comprehended', () => {
  const journey = { par: 3, steps: Array.from({ length: 3 }, () => ({ weight: 1 })) };
  const walkResult = { done: false, stepsTaken: 3, par: 3, stuckReason: 'loop', trace: Array.from({ length: 3 }, () => ({ comprehended: true })) };
  assert.equal(scoreUX(walkResult, journey), 50);
});

test('scoreUX: an unfinished walk with no wandering-ratio applicable is left at its earned score', () => {
  const journey = { par: 4, steps: Array.from({ length: 4 }, () => ({ weight: 1 })) };
  const walkResult = { done: false, stepsTaken: 2, par: 4, stuckReason: 'control_unresolved', trace: [{ comprehended: true }, { comprehended: true }] };
  assert.equal(scoreUX(walkResult, journey), 50); // 2 of 4 steps' weight earned; no path-quality cap layered on top
});

// ---- Band math ----

test('percentile: linear interpolation on a known 10-element array', () => {
  const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(sorted, 10), 19);
  assert.equal(percentile(sorted, 50), 55);
  assert.equal(percentile(sorted, 90), 91);
});

test('percentile: a single-element array returns that element at any percentile', () => {
  assert.equal(percentile([42], 10), 42);
  assert.equal(percentile([42], 90), 42);
});

test('band: known array -> known p10/median/p90 and width', () => {
  const b = band([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(b, { p10: 19, median: 55, p90: 91, width: 72 });
});

test('band: order of input values does not matter', () => {
  const b1 = band([90, 10, 50, 30, 70, 20, 100, 40, 60, 80]);
  const b2 = band([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(b1, b2);
});

// ---- N-ladder ----

test('ladderRung: dry at N<=2, scored in the middle, release at N>=10', () => {
  assert.equal(ladderRung(1), 'dry');
  assert.equal(ladderRung(2), 'dry');
  assert.equal(ladderRung(3), 'scored');
  assert.equal(ladderRung(5), 'scored');
  assert.equal(ladderRung(9), 'scored');
  assert.equal(ladderRung(10), 'release');
  assert.equal(ladderRung(20), 'release');
});

// ---- Paging flags ----

test('pagingFlags: below N=5, nothing pages no matter how bad the band', () => {
  const flags = pagingFlags({ p10: 10, median: 20, p90: 30, width: 20 }, 4);
  assert.equal(flags.paged, false);
});

test('pagingFlags: median < 80 pages at N>=5', () => {
  const flags = pagingFlags({ p10: 75, median: 79, p90: 85, width: 10 }, 5);
  assert.equal(flags.paged, true);
  assert.deepEqual(flags.reasons, ['median<80']);
});

test('pagingFlags: p10 < 70 pages at N>=5', () => {
  const flags = pagingFlags({ p10: 69, median: 85, p90: 95, width: 26 }, 5);
  assert.ok(flags.reasons.includes('p10<70'));
  assert.ok(flags.reasons.includes('band width>15'));
});

test('pagingFlags: a healthy band at N>=5 does not page', () => {
  const flags = pagingFlags({ p10: 75, median: 85, p90: 90, width: 15 }, 10);
  assert.equal(flags.paged, false);
  assert.deepEqual(flags.reasons, []);
});

// ---- Hard gates ----

test('hardGate: a critical capability failure BLOCKs regardless of a pretty UX band', () => {
  const gate = hardGate({ criticalJourneyFailed: true, uxBand: { p10: 95, median: 99, p90: 100, width: 5 }, n: 10 });
  assert.equal(gate, 'BLOCK');
});

test('hardGate: an escaped external side effect BLOCKs', () => {
  assert.equal(hardGate({ externalSinkEscape: true }), 'BLOCK');
});

test('hardGate: a flaking fixture BLOCKs', () => {
  assert.equal(hardGate({ fixtureFlaked: true }), 'BLOCK');
});

test('hardGate: a paging UX band REVIEWs when nothing else BLOCKs', () => {
  const gate = hardGate({ uxBand: { p10: 60, median: 70, p90: 80, width: 20 }, n: 5 });
  assert.equal(gate, 'REVIEW');
});

test('hardGate: unclassified harness failures REVIEW even with a clean band', () => {
  const gate = hardGate({ uxBand: { p10: 90, median: 95, p90: 99, width: 9 }, n: 10, unclassifiedHarnessFailure: true });
  assert.equal(gate, 'REVIEW');
});

test('hardGate: everything clean PASSes', () => {
  const gate = hardGate({ uxBand: { p10: 90, median: 95, p90: 99, width: 9 }, n: 10 });
  assert.equal(gate, 'PASS');
});

test('hardGate: no uxBand at all (e.g. a dry run) still PASSes absent any BLOCK/REVIEW signal', () => {
  assert.equal(hardGate({}), 'PASS');
});
