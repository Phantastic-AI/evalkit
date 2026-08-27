import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, defaultPolicy, mergePolicy } from '../safety.mjs';

test('safe: a plain GET link', () => {
  const r = classify({ tag: 'a', type: 'link', label: 'View submissions', method: 'GET', href: '/admin/x/submissions' });
  assert.equal(r.class, 'safe');
  assert.equal(r.pressable, true);
});

test('contained_mutation: a POST submit with no dangerous label', () => {
  const r = classify({ tag: 'input', type: 'submit', label: 'Save changes', method: 'POST', action: '/admin/x/settings' });
  assert.equal(r.class, 'contained_mutation');
  assert.equal(r.pressable, true);
});

test('destructive_contained: a delete button, pressable inside the fixture world', () => {
  const r = classify({ tag: 'button', type: 'submit', label: 'Delete submission', method: 'POST', action: '/admin/x/submissions/1/delete' });
  assert.equal(r.class, 'destructive_contained');
  assert.equal(r.pressable, true);
});

test('external_side_effect: a mailto link is never pressed', () => {
  const r = classify({ tag: 'a', type: 'link', label: 'Email the speaker', href: 'mailto:speaker@example.org' });
  assert.equal(r.class, 'external_side_effect');
  assert.equal(r.pressable, false);
});

test('external_side_effect: a webhook route by label pattern', () => {
  const r = classify({ tag: 'button', type: 'submit', label: 'Send calendar invite', method: 'POST', action: '/admin/x/agenda/invite' });
  assert.equal(r.class, 'external_side_effect');
  assert.equal(r.pressable, false);
});

test('credential: a password field is never pressed', () => {
  const r = classify({ tag: 'input', type: 'password', label: 'Password', method: 'POST' });
  assert.equal(r.class, 'credential');
  assert.equal(r.pressable, false);
});

test('credential: a "delete account" control, distinct from destructive_contained', () => {
  const r = classify({ tag: 'button', type: 'submit', label: 'Delete my account', method: 'POST', action: '/account/delete' });
  assert.equal(r.class, 'credential');
  assert.equal(r.pressable, false);
});

test('unknown_risky: insufficient descriptor is trapped, not guessed safe', () => {
  const r = classify({ tag: 'div', label: 'Do the thing' });
  assert.equal(r.class, 'unknown_risky');
  assert.equal(r.pressable, false);
});

test('mergePolicy: suite override replaces the matching pattern list, keeps the rest', () => {
  const policy = mergePolicy({ destructivePatterns: [/\barchive\b/i] });
  const archived = classify({ tag: 'button', type: 'submit', label: 'Archive scene', method: 'POST' }, policy);
  assert.equal(archived.class, 'destructive_contained');

  // the default "delete" pattern is gone now that destructivePatterns was replaced
  const deleted = classify({ tag: 'button', type: 'submit', label: 'Delete scene', method: 'POST' }, policy);
  assert.equal(deleted.class, 'contained_mutation');

  // untouched lists (credential) still come from defaultPolicy
  const cred = classify({ tag: 'input', type: 'password' }, policy);
  assert.equal(cred.class, 'credential');
});

test('defaultPolicy is exported and usable directly', () => {
  assert.ok(defaultPolicy.destructivePatterns.length > 0);
});
