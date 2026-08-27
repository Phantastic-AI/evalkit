import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walk, detectScroll, LANE_VIEWPORTS } from '../drive.mjs';

// A tiny in-memory site: route -> {visibleText, controls}. screenshot() reads
// straight from it; executeControl() "navigates" by returning the pressed
// control's own action as the new route — no network, no DOM, no model.
function fakeSite(pages) {
  async function screenshot({ route, viewport }) {
    const page = pages[route];
    if (!page) throw new Error(`fakeSite: no page for route "${route}"`);
    return {
      route,
      url: `https://fake${route}`,
      status: 200,
      image: `image:${route}`,
      visibleText: page.visibleText,
      controls: page.controls,
    };
  }
  async function executeControl(control) {
    return { route: control.action };
  }
  async function fetchPage(route) {
    const page = pages[route];
    if (!page) throw new Error(`fakeSite: no page for route "${route}"`);
    return { status: 200, url: `https://fake${route}`, visibleText: page.visibleText };
  }
  return { screenshot, executeControl, fetchPage };
}

function scriptedGoldfish(answersByStep) {
  return async ({ step }) => {
    const scripted = answersByStep[step] ?? answersByStep[answersByStep.length - 1];
    return {
      answers: { job: 'test job', nextAction: scripted.namedAction, confusion: '', neverTold: '' },
      namedAction: scripted.namedAction,
      confused: !!scripted.confused,
    };
  };
}

test('end-to-end: a scripted goldfish presses two controls in sequence and reaches the goal', async () => {
  const pages = {
    '/start': {
      visibleText: 'Welcome. Press Continue to proceed.',
      controls: [{ id: 'btn1', tag: 'button', type: 'submit', label: 'Continue', action: '/next', method: 'POST' }],
    },
    '/next': {
      visibleText: 'Almost there. Press Finish.',
      controls: [{ id: 'btn2', tag: 'button', type: 'submit', label: 'Finish', action: '/done', method: 'POST' }],
    },
    '/done': { visibleText: 'All done! Thanks for that.', controls: [] },
  };
  const journey = {
    id: 'two-step',
    lane: 'desktop',
    startRoute: '/start',
    par: 2,
    goalTruths: [{ type: 'predicate', check: (page) => page.visibleText.includes('All done'), label: 'reached the done page' }],
  };
  const goldfish = scriptedGoldfish([{ namedAction: 'press "Continue"' }, { namedAction: 'press "Finish"' }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.done, true);
  assert.equal(result.stuckReason, null);
  assert.equal(result.failureType, null);
  assert.equal(result.stepsTaken, 2);
  assert.equal(result.par, 2);
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[0].resolved.control.label, 'Continue');
  assert.equal(result.trace[1].resolved.control.label, 'Finish');
  assert.equal(result.trace[0].progress, false); // goal not reached yet after step 1
  assert.equal(result.trace[1].progress, true); // goal reached on step 2
  assert.deepEqual(result.trace[0].answers, { job: 'test job', nextAction: 'press "Continue"', confusion: '', neverTold: '' });
});

test('stuck: a goldfish that loops A -> B -> A ends the walk with reason "loop"', async () => {
  // Page A carries two controls throughout (so its own pageSignature is
  // identical on both visits) but the goldfish picks a DIFFERENT one on the
  // second visit — otherwise the exact (pageSignature, actionSignature) pair
  // would repeat and walk/stuck.mjs's own precedence (noop checked before
  // loop) would report repeated_noop instead of the loop this test means to
  // exercise. "Look around" is a harmless self-referential action so it
  // still counts as making no progress.
  const pages = {
    '/a': {
      visibleText: 'Page A. Go to B, or look around.',
      controls: [
        { id: 'toB', tag: 'button', type: 'submit', label: 'Go to B', action: '/b', method: 'POST' },
        { id: 'look', tag: 'button', type: 'submit', label: 'Look around', action: '/a', method: 'POST' },
      ],
    },
    '/b': {
      visibleText: 'Page B. Go to A.',
      controls: [{ id: 'toA', tag: 'button', type: 'submit', label: 'Go to A', action: '/a', method: 'POST' }],
    },
  };
  const journey = {
    id: 'looper',
    lane: 'desktop',
    startRoute: '/a',
    par: 2,
    goalTruths: [{ type: 'predicate', check: () => false, label: 'never reached' }],
  };
  const goldfish = scriptedGoldfish([
    { namedAction: 'press "Go to B"' },
    { namedAction: 'press "Go to A"' },
    { namedAction: 'press "Look around"' },
  ]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.done, false);
  assert.equal(result.stuckReason, 'loop');
  assert.equal(result.failureType, 'product_findability_defect');
  assert.equal(result.stepsTaken, 3);
});

test('stuck: repeating the same no-op action on the same screen ends the walk with reason "repeated_noop"', async () => {
  const pages = {
    '/refresh': {
      visibleText: 'Nothing happens here. Press Refresh.',
      controls: [{ id: 'refresh', tag: 'button', type: 'submit', label: 'Refresh', action: '/refresh', method: 'POST' }],
    },
  };
  const journey = {
    id: 'stall',
    lane: 'desktop',
    startRoute: '/refresh',
    goalTruths: [{ type: 'predicate', check: () => false }],
  };
  const goldfish = scriptedGoldfish([{ namedAction: 'press "Refresh"' }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.stuckReason, 'repeated_noop');
  assert.equal(result.stepsTaken, 2);
});

test('scroll: a below-the-fold control is unreachable until the goldfish scrolls, then resolves', async () => {
  const controls = [
    { id: 'loadMore', tag: 'button', type: 'submit', label: 'Load more', action: '/found', method: 'POST', bounds: { top: 900, left: 20, width: 200, height: 50 } },
  ];
  const pages = {
    '/scroll-page': { visibleText: 'Scroll down for more.', controls },
    '/found': { visibleText: 'You scrolled and found it.', controls: [] },
  };
  const journey = {
    id: 'scroller',
    lane: 'desktop', // 1280x800 — top:900 starts below the fold
    startRoute: '/scroll-page',
    par: 2,
    goalTruths: [{ type: 'predicate', check: (page) => page.visibleText.includes('found it') }],
  };
  const goldfish = scriptedGoldfish([{ namedAction: 'scroll down to see more' }, { namedAction: 'press "Load more"' }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.done, true);
  assert.equal(result.stepsTaken, 2);
  assert.equal(result.trace[0].isScroll, true);
  assert.equal(result.trace[0].resolved, null);
  assert.equal(result.trace[0].viewport.scrollY, 0); // decision-time viewport — before this step's scroll
  assert.equal(result.trace[0].resultViewport.scrollY > 0, true); // the scroll's own effect
  assert.equal(result.trace[1].isScroll, false);
  assert.equal(result.trace[1].resolved.control.label, 'Load more');
});

test('detectScroll: plain scroll-down phrasing', () => {
  assert.deepEqual(detectScroll('I will scroll down to see more'), { direction: 'down' });
});

test('detectScroll: scroll-up phrasing is distinguished from scroll-down', () => {
  assert.deepEqual(detectScroll('scroll back up to the top'), { direction: 'up' });
});

test('detectScroll: a non-scroll action returns null', () => {
  assert.equal(detectScroll('press "Submit Proposal"'), null);
});

test('resolver failure ends the walk typed action_resolver_defect, never a product defect', async () => {
  const pages = {
    '/x': { visibleText: 'Nothing useful here.', controls: [] },
  };
  const journey = {
    id: 'dead-end',
    lane: 'desktop',
    startRoute: '/x',
    goalTruths: [{ type: 'predicate', check: () => false }],
  };
  const goldfish = scriptedGoldfish([{ namedAction: 'press the button that says Continue' }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.stuckReason, 'control_unresolved');
  assert.equal(result.failureType, 'action_resolver_defect');
});

test('explicit confusion ends the walk immediately, typed a findability defect', async () => {
  const pages = { '/x': { visibleText: 'A confusing page.', controls: [] } };
  const journey = {
    id: 'confused',
    lane: 'desktop',
    startRoute: '/x',
    goalTruths: [{ type: 'predicate', check: () => false }],
  };
  const goldfish = scriptedGoldfish([{ namedAction: 'I have no idea what to do', confused: true }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);

  const result = await walk(journey, { goldfish, executeControl, screenshot, fetchPage });

  assert.equal(result.stepsTaken, 1);
  assert.equal(result.stuckReason, 'explicit_confusion');
  assert.equal(result.failureType, 'product_findability_defect');
});

test('LANE_VIEWPORTS covers all four declared lanes', () => {
  for (const lane of ['desktop', 'mobile', 'ipad', 'superwide']) {
    assert.ok(LANE_VIEWPORTS[lane].width > 0);
    assert.ok(LANE_VIEWPORTS[lane].height > 0);
  }
});

test('walk() refuses a journey with no goalTruths rather than looping forever', async () => {
  const pages = { '/x': { visibleText: 'x', controls: [] } };
  const journey = { id: 'no-goal', lane: 'desktop', startRoute: '/x' };
  const goldfish = scriptedGoldfish([{ namedAction: 'press "Anything"' }]);
  const { screenshot, executeControl, fetchPage } = fakeSite(pages);
  await assert.rejects(() => walk(journey, { goldfish, executeControl, screenshot, fetchPage }), /goalTruths/);
});
