// Journey: dana-reviewers — Dana gets her three helpers reading the pile,
// crossing the Reviewers page. DATA ONLY: never run against staging by this
// repo's own tests; a future CLI is what would actually drive it.
//
// This is the walk counterpart to tableread/scenes.json's own scene S2
// ("The founder with a fresh call, no vocabulary") — same cast, same
// station, same intent — reusing that scene's already-built backbone world
// (tableread/recipes/dana-committee.mjs) rather than inventing a new one:
// three reviewers (Marcus Udoh, Sana Iqbal, Theo Laurent) already invited,
// the pile still fully undecided, Dana looking at a bare hit on
// /admin/{slug}/reviews/reviewers (scenes.json S2's own surface).
//
// Grounding for the control name ("Assign them") and the page's own shape
// comes from a REAL captured render of this exact page —
// tableread/out/organizer-s3-watcher-saga-mt3oyopx3hmg/organizer.txt — which
// shows, verbatim: the "Deal to" section ending in "[BUTTON: Assign them]",
// and each reviewer row rendering as "<Name>\n<Role>\n<assigned>\nReviewed
// <scored> of <assigned>" (e.g. "Reviewer A\nReviewer\n24\nReviewed 3 of
// 24"). Both hats are declared per this build's own brief, even though
// scenes.json's own S2 entry declares only "novice" — S2's intent already
// reads pro-legibly too ("get reading started" is not a novice-only need),
// and the operator asked this journey to walk both.
//
// par: dealTo() (tableread/primitives.mjs) is one primitive call — one POST
// to the hand-out form. The real captured page shows sensible defaults
// already selected (each=1, group=Everyone) with nothing else required, so
// one resolved control press (the goldfish presses "Assign them") is the
// same one act.
export default {
  id: 'dana-reviewers',
  title: 'Get three helpers reading the pile from the Reviewers page',
  lane: 'desktop',
  hats: ['novice', 'pro'],
  persona: 'Dana Reyes, a first-time conference organizer who has never used a review tool before',
  goal: 'Get my three helpers reading the pile.',

  startRoute: '/admin/{slug}/reviews/reviewers',

  // No free-text material: dealTo() takes no persona-authored strings (only
  // a reader count, a group choice, and which reviewers sit the round out —
  // all structural form fields, not invented prose).
  material: {},

  par: 1,

  goalTruths: [
    {
      type: 'predicate',
      check: (page) => {
        const text = page?.visibleText ?? '';
        // The three helpers this backbone already invited
        // (dana-committee.mjs). Each must show a nonzero "Reviewed X of Y"
        // — the real page's own progress line for a reviewer actually
        // holding assignments (see the grounding note above). A window of
        // 200 chars after the name matches the real capture's own per-row
        // layout (name, role, assigned count, progress line all fall
        // within that span).
        return ['Marcus Udoh', 'Sana Iqbal', 'Theo Laurent'].every((name) => {
          const idx = text.indexOf(name);
          if (idx === -1) return false;
          const row = text.slice(idx, idx + 200);
          return /Reviewed \d+ of [1-9]\d*/.test(row);
        });
      },
      label: 'all three helpers show a nonzero assigned count on the Reviewers page',
    },
  ],
};
