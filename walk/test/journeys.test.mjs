// Shape and goal-truth-logic tests for walk/journeys/ — DATA files, never
// executed against staging here or anywhere in this suite. What IS fair
// game offline: validating the journey's own shape, and exercising its
// goal-truth predicates against synthetic in-memory pages (no network, no
// staging) to catch a broken predicate before it ever meets a real capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGoal } from '../truth.mjs';
import { LANE_VIEWPORTS } from '../drive.mjs';
import cfpSubmit from '../journeys/cfp-submit.mjs';
import danaReviewers from '../journeys/dana-reviewers.mjs';

function assertJourneyShape(journey) {
  assert.equal(typeof journey.id, 'string');
  assert.ok(journey.id.length > 0);
  assert.ok(LANE_VIEWPORTS[journey.lane], `lane "${journey.lane}" is not a declared viewport lane`);
  assert.equal(typeof journey.persona, 'string');
  assert.ok(journey.persona.length > 0);
  assert.equal(typeof journey.goal, 'string');
  assert.ok(journey.goal.length > 0);
  assert.equal(typeof journey.startRoute, 'string');
  assert.ok(journey.startRoute.startsWith('/'));
  assert.equal(typeof journey.par, 'number');
  assert.ok(journey.par > 0);
  assert.ok(Array.isArray(journey.goalTruths));
  assert.ok(journey.goalTruths.length > 0);
  for (const truth of journey.goalTruths) {
    assert.ok(['verbatim', 'predicate'].includes(truth.type));
  }
}

test('cfp-submit: shape is well-formed', () => {
  assertJourneyShape(cfpSubmit);
  assert.equal(cfpSubmit.hat, 'novice');
  // Bounded invention: every field cfpSubmit() (primitives.mjs) fills is
  // covered by declared material, so nothing is invented at walk time.
  for (const field of ['title', 'abstract', 'name', 'org', 'email']) {
    assert.equal(typeof cfpSubmit.material[field], 'string');
    assert.ok(cfpSubmit.material[field].length > 0, `material.${field} must not be empty`);
  }
});

test('cfp-submit: goal truth holds once the walk lands on the CFP thanks page', async () => {
  const currentPage = { status: 200, url: 'https://fireside-staging.example/saga-x/cfp/thanks', visibleText: 'Thanks!' };
  const result = await checkGoal(cfpSubmit, async () => { throw new Error('should not need to fetch another route'); }, currentPage);
  assert.equal(result.reached, true);
});

test('cfp-submit: goal truth does not hold while still on the form itself', async () => {
  const currentPage = { status: 200, url: 'https://fireside-staging.example/saga-x/cfp', visibleText: 'Submit a proposal' };
  const result = await checkGoal(cfpSubmit, async () => { throw new Error('should not need to fetch another route'); }, currentPage);
  assert.equal(result.reached, false);
});

test('dana-reviewers: shape is well-formed, both hats declared', () => {
  assertJourneyShape(danaReviewers);
  assert.deepEqual(danaReviewers.hats, ['novice', 'pro']);
});

test('dana-reviewers: goal truth holds once all three helpers show a nonzero assigned count', async () => {
  // Synthetic text in the real captured page's own shape (tableread/out/
  // organizer-s3-watcher-saga-mt3oyopx3hmg/organizer.txt): "<Name>\n<Role>\n
  // <assigned>\nReviewed <scored> of <assigned>".
  const currentPage = {
    status: 200,
    visibleText: [
      'Who reads what',
      'Marcus Udoh\nReviewer\n8\nReviewed 0 of 8',
      'Sana Iqbal\nReviewer\n8\nReviewed 0 of 8',
      'Theo Laurent\nReviewer\n8\nReviewed 0 of 8',
    ].join('\n'),
  };
  const result = await checkGoal(danaReviewers, async () => { throw new Error('checked against the current page'); }, currentPage);
  assert.equal(result.reached, true);
});

test('dana-reviewers: goal truth fails while the pile is still fully undecided (nobody assigned yet)', async () => {
  const currentPage = {
    status: 200,
    visibleText: [
      'Who reads what',
      'Marcus Udoh\nReviewer\n0\nNothing assigned to you yet.',
      'Sana Iqbal\nReviewer\n0\nNothing assigned to you yet.',
      'Theo Laurent\nReviewer\n0\nNothing assigned to you yet.',
    ].join('\n'),
  };
  const result = await checkGoal(danaReviewers, async () => { throw new Error('checked against the current page'); }, currentPage);
  assert.equal(result.reached, false);
});

test('dana-reviewers: goal truth fails when only some helpers were dealt in', async () => {
  const currentPage = {
    status: 200,
    visibleText: [
      'Marcus Udoh\nReviewer\n8\nReviewed 0 of 8',
      'Sana Iqbal\nReviewer\n8\nReviewed 0 of 8',
      'Theo Laurent\nReviewer\n0\nNothing assigned to you yet.',
    ].join('\n'),
  };
  const result = await checkGoal(danaReviewers, async () => { throw new Error('checked against the current page'); }, currentPage);
  assert.equal(result.reached, false);
});
