import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGoal } from '../truth.mjs';

function stubFetchPage(pages) {
  return async (route) => {
    if (!(route in pages)) throw new Error(`stubFetchPage: no fixture page for route "${route}"`);
    return pages[route];
  };
}

test('checkGoal: no truths declared never reads as reached', async () => {
  const result = await checkGoal({ goalTruths: [] }, stubFetchPage({}));
  assert.equal(result.reached, false);
  assert.deepEqual(result.evidence, []);
});

test('checkGoal: a single verbatim truth against an explicit route', async () => {
  const journey = { goalTruths: [{ type: 'verbatim', route: '/x/cfp/thanks', text: 'Thanks for your proposal' }] };
  const fetchPage = stubFetchPage({ '/x/cfp/thanks': { status: 200, url: 'https://x/x/cfp/thanks', visibleText: 'Thanks for your proposal!' } });
  const result = await checkGoal(journey, fetchPage);
  assert.equal(result.reached, true);
  assert.equal(result.evidence[0].held, true);
});

test('checkGoal: a verbatim truth that is not on the page fails, does not throw', async () => {
  const journey = { goalTruths: [{ type: 'verbatim', route: '/x', text: 'Never appears' }] };
  const fetchPage = stubFetchPage({ '/x': { status: 200, url: 'https://x', visibleText: 'Something else entirely' } });
  const result = await checkGoal(journey, fetchPage);
  assert.equal(result.reached, false);
  assert.equal(result.evidence[0].held, false);
});

test('checkGoal: a predicate truth with no route checks the current page', async () => {
  const journey = {
    goalTruths: [{ type: 'predicate', check: (page) => page.url.includes('/cfp/thanks'), label: 'landed on thanks' }],
  };
  const currentPage = { status: 200, url: 'https://x/x/cfp/thanks', visibleText: 'ok' };
  const result = await checkGoal(journey, stubFetchPage({}), currentPage);
  assert.equal(result.reached, true);
});

test('checkGoal: a route-less truth with no current page available fails cleanly', async () => {
  const journey = { goalTruths: [{ type: 'predicate', check: () => true }] };
  const result = await checkGoal(journey, stubFetchPage({}), null);
  assert.equal(result.reached, false);
  assert.equal(result.evidence[0].held, false);
  assert.match(result.evidence[0].detail, /no current page/);
});

test('checkGoal: reached requires EVERY declared truth to hold (conjunction, not majority)', async () => {
  const journey = {
    goalTruths: [
      { type: 'verbatim', route: '/a', text: 'yes' },
      { type: 'verbatim', route: '/b', text: 'also yes' },
    ],
  };
  const fetchPage = stubFetchPage({
    '/a': { status: 200, url: 'https://x/a', visibleText: 'yes' },
    '/b': { status: 200, url: 'https://x/b', visibleText: 'nope' },
  });
  const result = await checkGoal(journey, fetchPage);
  assert.equal(result.reached, false);
  assert.equal(result.evidence[0].held, true);
  assert.equal(result.evidence[1].held, false);
});

test('checkGoal: fetchPage is only called once per distinct route even when reused across truths', async () => {
  let calls = 0;
  const fetchPage = async (route) => {
    calls += 1;
    return { status: 200, url: `https://x${route}`, visibleText: 'shared page has A and B on it' };
  };
  const journey = {
    goalTruths: [
      { type: 'verbatim', route: '/shared', text: 'A' },
      { type: 'verbatim', route: '/shared', text: 'B' },
    ],
  };
  const result = await checkGoal(journey, fetchPage);
  assert.equal(result.reached, true);
  assert.equal(calls, 1);
});

test('checkGoal: unknown truth type throws rather than silently passing', async () => {
  const journey = { goalTruths: [{ type: 'mystery' }] };
  await assert.rejects(() => checkGoal(journey, stubFetchPage({})));
});
