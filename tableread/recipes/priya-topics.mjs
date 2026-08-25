// Act II pro cutaway — Priya Anand, Systems Summit 2027. organizer.md S3:
// topics paired with tracks at setup time, restated rather than redone. A
// different conference from Dana's DevFlow 2027 (the operator's "one
// conference, one timeline" governs the novice spine; a clearly-marked pro
// cutaway visits a different, comparable setting on purpose — see
// docs/sagas/README.md).
export default async function priyaTopics({ p, snap }) {
  // Stamped per run — staging persists accounts, so a literal address only
  // ever works once (see dana-day-one.mjs's header note).
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  await p.signUp('Priya Anand', `priya-${stamp}@example.org`, 'topics-before-proposals-1');
  const { slug } = await p.createConference('Systems Summit 2027', {
    slug: `saga-org-topics-${stamp}`,
    tracks: ['Platform', 'Product'],
  });

  const yuki = await p.inviteReviewer(`yuki-${stamp}@example.org`, 'Yuki Tanaka');
  const bram = await p.inviteReviewer(`bram-${stamp}@example.org`, 'Bram Voss');

  await p.cfpSubmit(6, { track: 'Platform' });
  await p.cfpSubmit(6, { track: 'Product' });

  const platformGroup = await p.createGroup('Platform readers', [yuki], 'Platform');
  const productGroup = await p.createGroup('Product readers', [bram], 'Product');
  void platformGroup;
  void productGroup;

  // P1 (S3) — Priya reads the groups panel she just built: does this page
  // look like it already knows the plan she made at setup time?
  await snap('P1', 'organizer', `/admin/${slug}/reviews/reviewers`);

  return {
    surfaces: [{ persona: 'organizer', url: `/admin/${slug}/reviews/reviewers` }],
  };
}
