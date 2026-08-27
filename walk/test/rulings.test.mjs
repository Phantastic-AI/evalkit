// Pins the two rulings from the first live walk (2026-08-26): scrolls are
// reading, not wandering — par is measured against controlPresses; and the
// goldfish CLI's `--flag=value` arg shape, which the untested adapter got
// wrong on its first real spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreUX } from '../score.mjs';
import { buildGoldfishArgs } from '../adapters/goldfish-adapter.mjs';

test('scoreUX: the live CFP walk shape — 3 decisions, 1 press, par 1 — is not wandering', () => {
  const journey = { par: 1, steps: [{ weight: 1 }] };
  const walkResult = {
    done: true,
    stepsTaken: 3, // two scrolls + one press: three goldfish reads
    controlPresses: 1,
    par: 1,
    stuckReason: null,
    trace: [{ comprehended: true }],
  };
  assert.equal(scoreUX(walkResult, journey), 100); // stepsTaken/par = 3x would have capped at 60
});

test('scoreUX: presses over par still cap — the ruling exempts scrolls, not detours', () => {
  const journey = { par: 1, steps: [{ weight: 1 }] };
  const walkResult = {
    done: true,
    stepsTaken: 3,
    controlPresses: 3,
    par: 1,
    stuckReason: null,
    trace: [{ comprehended: true }],
  };
  assert.equal(scoreUX(walkResult, journey), 60);
});

test('scoreUX: walk results without controlPresses fall back to stepsTaken', () => {
  const journey = { par: 1, steps: [{ weight: 1 }] };
  const walkResult = { done: true, stepsTaken: 3, par: 1, stuckReason: null, trace: [{ comprehended: true }] };
  assert.equal(scoreUX(walkResult, journey), 60);
});

test('buildGoldfishArgs: --flag=value shape, goal included only when present', () => {
  assert.deepEqual(buildGoldfishArgs({ imagePath: '/tmp/s.png', hat: 'novice', persona: 'a working engineer', goal: 'submit my talk' }), [
    '--image=/tmp/s.png',
    '--hat=novice',
    '--persona=a working engineer',
    '--goal=submit my talk',
  ]);
  assert.deepEqual(buildGoldfishArgs({ imagePath: '/tmp/s.png' }), ['--image=/tmp/s.png', '--hat=novice', '--persona=']);
  for (const arg of buildGoldfishArgs({ imagePath: '/tmp/s.png', hat: 'pro', persona: 'x', goal: 'y' })) {
    assert.match(arg, /^--[a-z]+=/); // no bare `--flag value` pairs — goldfish.mjs would read the value as its own flag
  }
});
