import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStuck, pageSignature, actionSignature } from '../stuck.mjs';

function step(overrides) {
  return {
    pageSignature: 'p',
    actionSignature: null,
    progress: false,
    resolverFailure: null,
    confused: false,
    ...overrides,
  };
}

test('pageSignature sorts visible-control labels so order never matters', () => {
  const a = pageSignature('/x/cfp', ['Submit', 'Cancel']);
  const b = pageSignature('/x/cfp', ['Cancel', 'Submit']);
  assert.equal(a, b);
});

test('actionSignature is role + accessible name', () => {
  assert.equal(actionSignature({ tag: 'button', label: 'Submit' }), 'button:Submit');
  assert.equal(actionSignature(null), null);
});

test('not stuck: a healthy walk making progress on distinct pages', () => {
  const history = [
    step({ pageSignature: 'p1', actionSignature: 'a1', progress: true }),
    step({ pageSignature: 'p2', actionSignature: 'a2', progress: true }),
  ];
  assert.equal(classifyStuck(history), null);
});

test('repeated_noop: same page-state + same action, twice, no progress either time', () => {
  const history = [
    step({ pageSignature: 'p1', actionSignature: 'button:Search' }),
    step({ pageSignature: 'p1', actionSignature: 'button:Search' }),
  ];
  const r = classifyStuck(history);
  assert.equal(r.reason, 'repeated_noop');
});

test('loop: A -> B -> A with distinct actions each time, no progress across the cycle', () => {
  const history = [
    step({ pageSignature: 'A', actionSignature: 'act1' }),
    step({ pageSignature: 'B', actionSignature: 'act2' }),
    step({ pageSignature: 'A', actionSignature: 'act3' }),
  ];
  const r = classifyStuck(history);
  assert.equal(r.reason, 'loop');
});

test('control_unresolved: the resolver could not map the named action to a control', () => {
  for (const failure of ['no_match', 'hidden_control', 'disabled_control']) {
    const history = [step({ resolverFailure: failure })];
    const r = classifyStuck(history);
    assert.equal(r.reason, 'control_unresolved', `resolverFailure ${failure}`);
  }
});

test('control_ambiguous: the resolver found more than one plausible control', () => {
  const history = [step({ resolverFailure: 'multi_match' })];
  const r = classifyStuck(history);
  assert.equal(r.reason, 'control_ambiguous');
});

test('unsafe_trap: the goldfish named a control the safety policy blocks', () => {
  const history = [step({ resolverFailure: 'unsafe_control' })];
  const r = classifyStuck(history);
  assert.equal(r.reason, 'unsafe_trap');
});

test('explicit_confusion: the goldfish said it does not know what to do', () => {
  const history = [step({ confused: true })];
  const r = classifyStuck(history);
  assert.equal(r.reason, 'explicit_confusion');
});

test('budget_exhausted: hard step budget reached with no other reason firing', () => {
  const history = Array.from({ length: 9 }, (_, i) =>
    step({ pageSignature: `p${i}`, actionSignature: `act${i}`, progress: i === 8 })
  );
  const r = classifyStuck(history, { budget: 8 });
  assert.equal(r.reason, 'budget_exhausted');
});

test('budget_exhausted: derived from par per the spec formula max(8, 2*par + 2)', () => {
  const history = Array.from({ length: 8 }, (_, i) =>
    step({ pageSignature: `p${i}`, actionSignature: `act${i}`, progress: i === 7 })
  );
  assert.equal(classifyStuck(history, { par: 3 }).reason, 'budget_exhausted');
  assert.equal(classifyStuck(history.slice(0, 7), { par: 3 }), null);
});
