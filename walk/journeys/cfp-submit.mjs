// Journey: cfp-submit — the public CFP form. DATA ONLY (docs/SPEC-two-rungs.md's
// task brief): never run against staging by this repo's own tests; a future
// CLI (goldfish-walk cfp-submit) is what would actually drive it, wiring in
// walk/adapters/'s real goldfish + screenshot functions.
//
// Grounding (every route, field, and outcome check below is read straight off
// existing code, never invented):
//   - Route: tableread/primitives.mjs's cfpSubmit() builds
//     `cfpPath = \`/${world.slug}/cfp\`` and loads it unauthenticated (a
//     fresh Actor per submission — no sign-up needed for the CFP itself).
//   - Form fields: cfpSubmit() fills title, abstract, name, org, email, plus
//     track (a radio group, read via primitives.mjs's cfpTrackOptions),
//     format and level (both <select>s, read via tableread/html.mjs's
//     optionsOf/firstRealOption). No field here is invented; every one is
//     scraped from the form itself in the real recipe, and the goldfish
//     would fill the same set from this journey's own `material` below.
//   - Success: cfpSubmit() checks `postRes.url.includes('/cfp/thanks')` —
//     the CFP's own POST-redirect-GET landing. That is this journey's own
//     mechanical goal truth, unmodified.
//
// par: cfpSubmit() is one primitive call — one real-flow act, load the form,
// fill it, submit it. A UI walk's own single resolved control (the form's
// submit button) plus the existing form machinery filling the rest from
// `material` is the same one act, so par is 1.
export default {
  id: 'cfp-submit',
  title: 'Submit a talk proposal through the public CFP form',
  lane: 'desktop',
  hat: 'novice',
  persona:
    'a working engineer who has never submitted a conference talk before, with a topic already worked out in their head',
  goal: 'Get my talk proposal submitted before the call closes.',

  startRoute: '/{slug}/cfp',

  // Free-text material this persona brings with them (spec: "Free-text
  // inputs ... come from the persona's own material, declared in the
  // journey spec, so invention is bounded"). Field names match
  // primitives.mjs's cfpSubmit() overrides exactly (title, abstract, name,
  // org, email); track/format/level are left to whatever the live form's
  // own first real option is, same as cfpSubmit()'s own default when no
  // explicit opts.track is given — this journey does not assert a specific
  // track exists, since scenes.json's own dana-day-one/dana-committee
  // recipes both run with tracks: [].
  material: {
    title: 'Small Migrations, Fewer Surprises',
    abstract:
      'A synthetic proposal used only to exercise the CFP form end to end: how a small team ships a database ' +
      'migration without a maintenance window, told through three incidents that almost worked and one that did.',
    name: 'Jordan Ade',
    org: 'Independent',
    email: 'jordan-ade-cfpwalk@example.org',
  },

  par: 1,

  goalTruths: [
    {
      type: 'predicate',
      // No `route` — checked against whatever page the walk is looking at
      // right after the submit action, per walk/truth.mjs's own contract.
      check: (page) => typeof page?.url === 'string' && page.url.includes('/cfp/thanks'),
      label: 'landed on the CFP thanks page (primitives.mjs cfpSubmit\'s own success check)',
    },
  ],
};
