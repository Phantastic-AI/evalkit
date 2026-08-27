// Mechanical goal-truth layer (docs/SPEC-two-rungs.md, "The walk loop" step 4
// and "Grader honesty" layer 1: "Goal reached — mechanical DB/page truth. No
// model."). A journey declares an ordered list of goal truths; checkGoal
// evaluates every one of them and returns whether the WHOLE goal — a
// conjunction, never a majority vote — is reached. Zero model calls, zero
// opinions: a verbatim string search, or a plain predicate function, over a
// page's own text.
//
// A truth is one of:
//   { type: 'verbatim', route?, text }        — route's page text must
//                                                contain `text` exactly.
//   { type: 'predicate', route?, check, label? } — check(page) must return
//                                                truthy; label is just for
//                                                the evidence trail.
//
// `route` is OPTIONAL. When present, the truth is checked against
// fetchPage(route) — an explicitly different screen (e.g. an admin page
// confirming what a speaker's own action produced). When omitted, the truth
// is checked against `currentPage` — whatever screen the walk is presently
// looking at — so a journey can say "the page I just landed on says X"
// without needing to independently guess that page's own route (a
// confirmation page's exact path is often the one thing a journey author
// does NOT want to hard-code; the walk already knows where it is).
//
// fetchPage(route) -> {status, url, visibleText}, the same fields
// tableread/capture.mjs's capture() returns (plus url, since a goal often
// hinges on where a redirect landed, e.g. primitives.mjs's own cfpSubmit
// check: `postRes.url.includes('/cfp/thanks')`). Tests inject a stub;
// walk/adapters/screenshot-adapter.mjs is the real implementation, reusing
// tableread/http.mjs + tableread/html.mjs against a persona's own cookie jar.

const TRUTH_TYPES = new Set(['verbatim', 'predicate']);

/** Reject a malformed journey spec before ever touching fetchPage — a typo'd
 *  truth type is an authoring bug, not a missing page, and must throw
 *  unconditionally rather than getting swallowed by "no page available". */
function assertKnownType(truth) {
  if (!TRUTH_TYPES.has(truth.type)) {
    throw new Error(`truth.mjs: unknown goal-truth type "${truth.type}"`);
  }
}

/** One truth's own verdict against an already-fetched page. Always returns a
 *  short, human-readable `detail` — the evidence a scorecard or a debug
 *  capsule can show, never just a bare boolean. */
function evaluate(truth, page) {
  if (truth.type === 'verbatim') {
    const held = typeof page?.visibleText === 'string' && page.visibleText.includes(truth.text);
    return { held, detail: held ? `found "${truth.text}"` : `"${truth.text}" not found` };
  }
  const held = !!truth.check(page);
  const label = truth.label ?? 'predicate';
  return { held, detail: `${label}: ${held ? 'held' : 'not held'}` };
}

async function resolvePage(truth, fetchPage, currentPage, cache) {
  if (!truth.route) {
    if (!currentPage) return null;
    return currentPage;
  }
  if (!cache.has(truth.route)) cache.set(truth.route, fetchPage(truth.route));
  return cache.get(truth.route);
}

/** journey.goalTruths: array of truth specs (see above). `currentPage`, when
 *  given, is the walk's own last-known screen ({route, url, visibleText, ...})
 *  — used for any truth that declares no route of its own. `reached` is true
 *  only when every declared truth holds AND at least one truth was declared
 *  (an empty goalTruths list can never silently read as "reached"). `evidence`
 *  carries every truth's own verdict, held or not, plus the truth itself, so
 *  a partial goal state is visible rather than collapsed to one bit. */
export async function checkGoal(journey, fetchPage, currentPage = null) {
  const truths = journey?.goalTruths ?? [];
  const cache = new Map();
  const evidence = [];
  for (const truth of truths) {
    assertKnownType(truth);
    const page = await resolvePage(truth, fetchPage, currentPage, cache);
    if (!page) {
      evidence.push({ held: false, detail: 'no route declared and no current page available', truth, route: truth.route ?? null });
      continue;
    }
    evidence.push({ ...evaluate(truth, page), truth, route: truth.route ?? null });
  }
  const reached = truths.length > 0 && evidence.every((e) => e.held);
  return { reached, evidence };
}
