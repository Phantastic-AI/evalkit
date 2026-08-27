import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personaEmail, slugPrefix, sinkAddress, namespace } from '../isolation.mjs';

test('personaEmail is deterministic given the same run_id', () => {
  assert.equal(personaEmail('Reviewer A', 'r1'), personaEmail('Reviewer A', 'r1'));
  assert.equal(personaEmail('Reviewer A', 'r1'), 'reviewer-a+r1@example.org');
});

test('personaEmail slugifies the persona name', () => {
  assert.equal(personaEmail('Speaker (Track 2)', 'r1'), 'speaker-track-2+r1@example.org');
});

test('different run_ids never collide on the same persona', () => {
  assert.notEqual(personaEmail('organizer', 'r1'), personaEmail('organizer', 'r2'));
});

test('slugPrefix is stable and grep-able', () => {
  assert.equal(slugPrefix('r1'), 'saga-r1-');
  assert.equal(slugPrefix('r1'), slugPrefix('r1'));
  assert.notEqual(slugPrefix('r1'), slugPrefix('r2'));
});

test('sinkAddress is deterministic per kind and run_id, and kinds never collide', () => {
  assert.equal(sinkAddress('email', 'r1'), sinkAddress('email', 'r1'));
  assert.notEqual(sinkAddress('email', 'r1'), sinkAddress('webhook', 'r1'));
  assert.notEqual(sinkAddress('email', 'r1'), sinkAddress('email', 'r2'));
});

test('sinkAddress falls back to a deterministic name for an unlisted kind', () => {
  assert.equal(sinkAddress('crm', 'r1'), sinkAddress('crm', 'r1'));
  assert.match(sinkAddress('crm', 'r1'), /r1/);
});

test('namespace bundles the same deterministic names as the standalone helpers', () => {
  const ns = namespace('r1');
  assert.equal(ns.runId, 'r1');
  assert.equal(ns.slugPrefix, slugPrefix('r1'));
  assert.equal(ns.personaEmail('organizer'), personaEmail('organizer', 'r1'));
  assert.equal(ns.sinkAddress('email'), sinkAddress('email', 'r1'));
});
