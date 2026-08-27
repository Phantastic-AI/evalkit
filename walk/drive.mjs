// The walk loop (docs/SPEC-two-rungs.md, "The walk loop"). Orchestrates one
// goldfish-driven pass through a journey: screenshot -> four questions ->
// resolve the named action -> safety check -> execute (or scroll) -> capture
// -> stuck check -> repeat, until a goal truth holds, the stuck classifier
// fires, or the step budget runs out.
//
// Dependency-injected on purpose (spec: "Design for dependency injection...
// so the whole loop is testable offline with stubs"). walk() never imports
// anything that touches the network or a model — only the four pieces of
// chunk 1 (resolver, safety, stuck) plus walk/truth.mjs, all pure/offline.
// The REAL goldfish and screenshot adapters live in walk/adapters/ and are
// wired in only by a CLI entry point that imports walk() alongside them;
// this file never imports walk/adapters/ itself.
//
// Injected functions, all async:
//
//   screenshot({route, viewport}) -> {
//     route, url, status, viewportUsed, image, visibleText, controls, ref?
//   }
//     One capture of "the current screen": the pixels goldfish sees
//     (`image`, opaque — a path, buffer, whatever the adapter hands the
//     goldfish call) PLUS the DOM-derived facts only the runner's hands ever
//     see (`controls`, html.mjs's extractControls shape; `visibleText`, for
//     route-less goal truths against "whatever we're looking at right now").
//     `ref` is an optional stable handle a debug capsule can use to find
//     this exact capture again later; when omitted, walk() derives one from
//     route + scrollY.
//
//   goldfish({persona, hat, goal, image, step}) -> {
//     answers: { job, nextAction, confusion, neverTold },  // verbatim, the
//                                                           // four questions
//                                                           // goldfish.mjs
//                                                           // itself asks
//     namedAction,   // free text handed to the resolver (usually ==
//                    // answers.nextAction, may carry a quoted control name)
//     confused,      // true iff the goldfish said outright it doesn't know
//                    // what to do, or named no executable next action
//   }
//
//   executeControl(control, safety, {route, viewport}) -> { route }
//     Presses `control` for real (tableread's form machinery: fill from the
//     journey's own declared material, submit; or follow a link) and
//     reports the route landed on. Never called for a scroll action, and
//     never called when the resolver didn't resolve to a pressable control.
//
//   fetchPage(route) -> {status, url, visibleText}
//     Only used for goal truths that declare their OWN route (see
//     walk/truth.mjs); most per-step goal checks run against the current
//     screen instead and never call this at all.
//
// options also takes: policy (walk/safety.mjs's policy, default defaultPolicy),
// synonyms (extra resolver synonym groups).
import { resolveAction, isVisible } from './resolver.mjs';
import { classifyStuck, pageSignature, actionSignature } from './stuck.mjs';
import { checkGoal } from './truth.mjs';
import { defaultPolicy } from './safety.mjs';

export const LANE_VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 667 },
  ipad: { width: 768, height: 1024 },
  superwide: { width: 2560, height: 1080 },
};

// A goldfish's named action reads as a scroll when it plainly says so — no
// synonym table, no semantic scoring (that machinery is the resolver's, for
// mapping onto a real control; scrolling is not a control at all, so it is
// detected before the resolver ever sees the text). "top"/"up" (and not
// "down"/absent) is the only signal read as scrolling backward.
const SCROLL_RE = /\bscroll(?:ing|ed)?\b/i;
const SCROLL_UP_RE = /\b(?:up|top|back up|earlier)\b/i;
const SCROLL_STEP_FRACTION = 0.8; // ~80% of one viewport height, like a real scroll gesture that keeps a little of the prior screen in view

/** {direction:'down'|'up'} when `namedAction` plainly names a scroll,
 *  otherwise null. Exported for the offline test that exercises it directly. */
export function detectScroll(namedAction) {
  const text = String(namedAction ?? '');
  if (!SCROLL_RE.test(text)) return null;
  return { direction: SCROLL_UP_RE.test(text) ? 'up' : 'down' };
}

function advanceScroll(viewport, direction) {
  const step = Math.round(viewport.height * SCROLL_STEP_FRACTION);
  const current = viewport.scrollY ?? 0;
  const scrollY = direction === 'up' ? Math.max(0, current - step) : current + step;
  return { ...viewport, scrollY };
}

function initialViewport(journey, overrides) {
  const lane = journey.lane ?? 'desktop';
  const base = LANE_VIEWPORTS[lane];
  if (!base) throw new Error(`drive.mjs: unknown lane "${lane}" (journey ${journey.id ?? '?'})`);
  return { ...base, scrollY: 0, ...overrides };
}

function visibleControlLabels(controls, viewport) {
  return controls.filter((c) => isVisible(c, viewport) !== false).map((c) => c.label || c.name || c.id || '');
}

// Every stuck reason the walk can end on gets exactly one failure-taxonomy
// type (docs/SPEC-two-rungs.md's "Failure taxonomy"), decided once here so
// the mapping is visible in one place rather than scattered across callers.
// Resolver failures are never a product defect (spec: "A resolver failure
// types the run action_resolver_defect, never a product defect") regardless
// of how confusing the screen actually was. Everything else the goldfish
// itself got stuck on — explicit confusion, repeating an action for nothing,
// or looping between the same screens — reads as a findability defect: the
// product was there to find, the goldfish couldn't find it. budget_exhausted
// (wandered the whole budget with no other reason firing) reads the same
// way, for the same reason.
const STUCK_TO_FAILURE_TYPE = {
  control_unresolved: 'action_resolver_defect',
  control_ambiguous: 'action_resolver_defect',
  unsafe_trap: 'unsafe_control_attraction',
  explicit_confusion: 'product_findability_defect',
  repeated_noop: 'product_findability_defect',
  loop: 'product_findability_defect',
  budget_exhausted: 'product_findability_defect',
};

/** Run one walk of one journey to completion. Returns the full step trace
 *  plus {done, failureType, stuckReason, stepsTaken, par}. Never throws on a
 *  failed walk — a walk that never reaches its goal is a normal, expected
 *  outcome the caller scores, not an exception. */
export async function walk(journey, options) {
  const { goldfish, executeControl, screenshot, fetchPage, policy = defaultPolicy, synonyms, viewport: viewportOverrides } = options;
  if (!journey.goalTruths?.length) throw new Error(`drive.mjs: journey "${journey.id ?? '?'}" declares no goalTruths`);

  let route = journey.startRoute;
  let viewport = initialViewport(journey, viewportOverrides);
  let screen = await screenshot({ route, viewport });
  const history = [];
  const trace = [];
  let heldCount = 0;
  let done = false;
  let stuckReason = null;
  let failureType = null;

  for (let step = 0; ; step++) {
    // pageSignature/actionSignature describe the DECISION POINT this step
    // made — the screen the goldfish was actually looking at, paired with
    // what it chose from it (walk/stuck.mjs's own convention: a "loop" is a
    // decision point recurring, not a landing page recurring). Captured
    // before anything below mutates `route`/`viewport`.
    const decisionRoute = route;
    const decisionScreen = screen;
    const decisionViewport = viewport;

    const g = await goldfish({ persona: journey.persona, hat: journey.hat, goal: journey.goal, image: screen.image, step });
    const scroll = detectScroll(g.namedAction);

    let resolved = null;
    let resolverFailure = null;
    let safetyClass = null;
    let actionSig = null;

    if (scroll) {
      viewport = advanceScroll(viewport, scroll.direction);
      actionSig = `scroll:${scroll.direction}`;
      screen = await screenshot({ route, viewport }); // "scrolls ... and screenshots the result" (spec, "The walk loop")
    } else if (g.confused) {
      // An explicit self-report of confusion is not a named action to
      // resolve — resolving whatever text came with it would risk masking
      // "I don't know" behind an unrelated no_match, and RESOLVER_TO_STUCK
      // would then report the wrong stuck reason. Nothing executes; the
      // screen is unchanged.
    } else {
      resolved = resolveAction(g.namedAction, decisionScreen.controls ?? [], { viewport: decisionViewport, policy, synonyms });
      if (resolved.ok) {
        safetyClass = resolved.safety.class;
        actionSig = actionSignature(resolved.control);
        const result = await executeControl(resolved.control, resolved.safety, { route, viewport });
        route = result.route;
        viewport = { ...viewport, scrollY: 0 }; // a freshly landed-on page starts at the top
        screen = await screenshot({ route, viewport }); // "the runner executes it ... and screenshots the result" (spec)
      } else {
        resolverFailure = resolved.failure.class;
        safetyClass = resolved.failure.safety?.class ?? null;
      }
    }

    const pageSig = pageSignature(decisionRoute, visibleControlLabels(decisionScreen.controls ?? [], decisionViewport));
    const currentPage = { status: screen.status, url: screen.url, visibleText: screen.visibleText, route: screen.route ?? route };
    const goalResult = await checkGoal(journey, fetchPage, currentPage);
    const newHeldCount = goalResult.evidence.filter((e) => e.held).length;
    const progress = newHeldCount > heldCount;
    heldCount = newHeldCount;

    const record = {
      index: step,
      route: decisionRoute,
      landedRoute: route,
      viewport: { ...decisionViewport },
      resultViewport: { ...viewport },
      screenRef: decisionScreen.ref ?? `${decisionRoute}@scrollY=${decisionViewport.scrollY ?? 0}`,
      answers: g.answers,
      namedAction: g.namedAction,
      isScroll: !!scroll,
      resolved,
      resolverFailure,
      safetyClass,
      pageSignature: pageSig,
      actionSignature: actionSig,
      progress,
      confused: !!g.confused,
      goalEvidence: goalResult.evidence,
    };
    history.push(record);
    trace.push(record);

    if (goalResult.reached) {
      done = true;
      break;
    }

    const stuck = classifyStuck(history, { par: journey.par, budget: journey.budget });
    if (stuck) {
      stuckReason = stuck.reason;
      failureType = STUCK_TO_FAILURE_TYPE[stuck.reason] ?? null;
      break;
    }
  }

  return { trace, done, failureType, stuckReason, stepsTaken: trace.length, par: journey.par };
}
