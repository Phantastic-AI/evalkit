// A worked saga: the organizer sets up two tracks, hands one of them to a
// single reviewer as her own beat (a "watcher"), and leaves the rest of the
// pile in the general pool. One reviewer works her queue; the other, who
// was handed the watcher's beat, never opens hers. Proves: conference +
// track creation, reviewer invites, CFP submission at volume, reviewer
// groups scoped to a track, dealing (both group-scoped and general), staging
// + submitting reviews, and reading the result back as each persona.
export default async function organizerS3Watcher({ p }) {
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  await p.signUp('Saga Organizer', `organizer-${stamp}@example.org`, 'saga-harness-password-1');
  const { slug } = await p.createConference('S3 Watcher', {
    tracks: ['Frontend', 'Backend'],
  });

  const reviewerA = await p.inviteReviewer(`reviewer-a-${stamp}@example.org`, 'Reviewer A');
  const reviewerB = await p.inviteReviewer(`reviewer-b-${stamp}@example.org`, 'Reviewer B');

  // 8 on Frontend, 16 on Backend — 24 total.
  await p.cfpSubmit(8, { track: 'Frontend' });
  await p.cfpSubmit(16, { track: 'Backend' });

  // Reviewer B is the sole member of a Frontend-scoped group: dealing to the
  // group hands her exactly the track's 8 undecided proposals, and nothing
  // outside it.
  const group = await p.createGroup('Frontend watchers', [reviewerB], 'Frontend');
  await p.dealTo({ group, each: 1 });

  // Reviewer A reads generally — dealt to by name by name, not by group, so
  // her assignment isn't track-scoped: she gets a crack at everything still
  // undecided across the whole pile.
  await p.dealTo({ who: [reviewerA], each: 1 });

  // She works three of her queue and submits; B, despite holding 8
  // assignments of her own, never opens hers.
  await p.stageReview(reviewerA, 0, 4);
  await p.stageReview(reviewerA, 1, 3);
  await p.stageReview(reviewerA, 2, 5);
  await p.submitReviews(reviewerA);

  return {
    surfaces: [
      { persona: 'organizer', url: `/admin/${slug}/reviews/reviewers` },
      { persona: reviewerA, url: `/admin/${slug}/reviews` },
      { persona: reviewerB, url: `/admin/${slug}/reviews` },
    ],
  };
}
