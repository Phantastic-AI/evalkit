import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractControls } from '../../tableread/html.mjs';
import { resolveAction } from '../resolver.mjs';

function controlsFrom(html) {
  return extractControls(html);
}

test('exact match: a quoted control name resolves the one control that has it', () => {
  const html = `
    <form action="/x/cfp" method="POST">
      <input type="text" name="title">
      <button type="submit">Submit Proposal</button>
    </form>`;
  const r = resolveAction('I will press "Submit Proposal" to send my talk', controlsFrom(html));
  assert.equal(r.ok, true);
  assert.equal(r.control.label, 'Submit Proposal');
  assert.equal(r.safety.class, 'contained_mutation');
});

test('synonym match: goldfish says "sign in", control is labeled "Log In"', () => {
  const html = `
    <form action="/sign-in" method="POST">
      <button type="submit">Log In</button>
    </form>`;
  const r = resolveAction("I'll click sign in now", controlsFrom(html));
  assert.equal(r.ok, true);
  assert.equal(r.control.label, 'Log In');
});

test('multi_match: two identically labeled Submit buttons is ambiguous', () => {
  const html = `
    <form action="/a" method="POST"><button type="submit">Submit</button></form>
    <form action="/b" method="POST"><button type="submit">Submit</button></form>`;
  const r = resolveAction('click "Submit"', controlsFrom(html));
  assert.equal(r.ok, false);
  assert.equal(r.failure.class, 'multi_match');
  assert.equal(r.failure.candidates.length, 2);
});

test('hidden_control: a control below the fold at a mobile viewport', () => {
  const html = `
    <form action="/x" method="POST">
      <button type="submit" data-bounds="2000,20,200,40">Load more</button>
    </form>`;
  const viewport = { width: 375, height: 667, scrollY: 0 };
  const r = resolveAction('press "Load more"', controlsFrom(html), { viewport });
  assert.equal(r.ok, false);
  assert.equal(r.failure.class, 'hidden_control');
});

test('a control with bounds inside the viewport is not treated as hidden', () => {
  const html = `
    <form action="/x" method="POST">
      <button type="submit" data-bounds="100,20,200,40">Load more</button>
    </form>`;
  const viewport = { width: 375, height: 667, scrollY: 0 };
  const r = resolveAction('press "Load more"', controlsFrom(html), { viewport });
  assert.equal(r.ok, true);
});

test('unknown bounds (no data-bounds, no viewport signal) is never guessed hidden', () => {
  const html = `<form action="/x" method="POST"><button type="submit">Load more</button></form>`;
  const viewport = { width: 375, height: 667, scrollY: 0 };
  const r = resolveAction('press "Load more"', controlsFrom(html), { viewport });
  assert.equal(r.ok, true);
});

test('disabled_control: a disabled button matches by label but cannot be pressed', () => {
  const html = `
    <form action="/x" method="POST">
      <button type="submit" disabled>Confirm</button>
    </form>`;
  const r = resolveAction('press "Confirm"', controlsFrom(html));
  assert.equal(r.ok, false);
  assert.equal(r.failure.class, 'disabled_control');
});

test('destructive_contained: a delete button resolves and is pressable inside the fixture world', () => {
  const html = `
    <form action="/x/submissions/1/delete" method="POST">
      <button type="submit">Delete submission</button>
    </form>`;
  const r = resolveAction('press "Delete submission"', controlsFrom(html));
  assert.equal(r.ok, true);
  assert.equal(r.safety.class, 'destructive_contained');
  assert.equal(r.safety.pressable, true);
});

test('unsafe_control: a mailto link is classed external_side_effect and never pressed', () => {
  const html = `<a href="mailto:speaker@example.org">Email speaker</a>`;
  const r = resolveAction('click "Email speaker"', controlsFrom(html));
  assert.equal(r.ok, false);
  assert.equal(r.failure.class, 'unsafe_control');
  assert.equal(r.failure.safety.class, 'external_side_effect');
});

test('no_match: nothing on the page relates to the named action', () => {
  const html = `
    <form action="/x/cfp" method="POST">
      <button type="submit">Submit Proposal</button>
    </form>`;
  const r = resolveAction('scroll down to read more', controlsFrom(html));
  assert.equal(r.ok, false);
  assert.equal(r.failure.class, 'no_match');
});
