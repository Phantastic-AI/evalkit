// Act II-IV, DevFlow 2027 — Dana's committee, one continuous world. This is
// the backbone the operator asked for: one conference, one timeline, several
// scenes cut from the same running fixture at the moment each is true,
// rather than each station rebuilding its own conference from scratch.
// Covers organizer.md S2/S4/S5 (the fresh call, the watcher, the rescuer),
// two lost-identity moments that land naturally inside committee-building
// (L3, L4), the interlock the operator named directly — "deal lands ->
// reviewer note arrives -> speaker's portal unchanged" (X1) — the rescuer's
// own interlock (Théo's portal, folded into S5), the second named interlock
// — "letters release -> every portal changes at once" (X3), filling
// sbek-import.md gap #1 ("Deciding and letters as stations... no station
// covers deciding or the letter") — and the templating gap (T1).
export default async function danaCommittee({ p, snap }) {
  // Stamped per run — see dana-day-one.mjs's header note; staging persists
  // accounts, so a literal address only ever works once.
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  await p.signUp('Dana Reyes', `dana-${stamp}@example.org`, 'reading-the-room-2');
  const { slug } = await p.createConference('DevFlow 2027', {
    slug: `saga-devflow-committee-${stamp}`,
    cfpClosesAt: pastDate(3),
    tracks: [],
    // Event dates match the name's year (see dana-day-one.mjs).
    startsOn: '2027-11-25',
    endsOn: '2027-11-26',
  });

  // The pile — 24, matching organizer.md S2's own count ("standing in for
  // the story's 300; loop to any N").
  await p.cfpSubmit(24, { title: 'Committee proposal' });

  const marcus = await p.inviteReviewer(`marcus-${stamp}@example.org`, 'Marcus Udoh');
  const sana = await p.inviteReviewer(`sana-${stamp}@example.org`, 'Sana Iqbal');
  const theo = await p.inviteReviewer(`theo-${stamp}@example.org`, 'Theo Laurent');

  // S2 — Dana's first visit to Reviewers. Bare hit, no q/p/open/note —
  // reviews.ts's bareLanding redirects her straight to /reviewers, whole
  // pile still undecided, nothing dealt yet: team.length is 4 (Dana + 3), so
  // whoReadsWhat renders the table branch; roundConfig.name is unset, so the
  // heading falls back to "Round 1", a word she never chose.
  await snap('S2', 'organizer', `/admin/${slug}/reviews/reviewers`);

  // L3 — a fourth invite, Maya Chen, to test whether the on-screen key link
  // is actually findable. It is, for exactly the reason this fixture can
  // only ever prove the synthetic half of the story: her address is
  // @example.org, isRealAddress() rejects it, so no email is even attempted
  // and settings.ts's team/add hands the key= link back on screen ("the
  // link comes back on the screen either way" — settings.ts's own comment).
  // The other half — what happens when the address IS real and an email
  // genuinely goes out — cannot be exercised by this harness at all: this
  // tool sends no real mail (docs/sagas/README.md's law is synthetic
  // identities only), and settings.ts's own redirect construction
  // (`emailed ? '&sent=1' : '&key=...'`) shows that for a real address the
  // key is deliberately NOT also printed on screen once an email attempt
  // succeeds. So if Maya's invite really were real-domain and really did
  // land in spam, Dana would have no on-screen fallback at all — the
  // opposite of what the on-screen convenience path (proven live below)
  // might suggest. That half is asserted from settings.ts:1481 alone, not
  // captured here.
  const maya = await p.inviteReviewer(`maya-${stamp}@example.org`, 'Maya Chen');
  await snap('L3', 'organizer', p.world.ids.reviewers[maya].inviteLandingUrl);

  // L4 — Marcus asks for a fresh sign-in link days after his invite (a busy
  // week; he never got around to the first one). This proves the request
  // half live: a working link prints straight onto the response page, no
  // wait needed. It does NOT prove the two-hour expiry itself (that would
  // need a real clock to run out, or the session secret to forge a stale
  // token, neither available here) — the expired-link page's own copy
  // ("That link has expired. Ask for a fresh one below." — index.ts:430,
  // NOT labels.ts's unused auth.link_expired string) is asserted from the
  // source, not captured. One more asymmetry worth recording live: the
  // synthetic on-screen link this fixture can prove carries no expiry
  // warning text at all on screen — "two hours" only ever appears in the
  // emailed text body (index.ts:391), which a synthetic address never gets.
  await snap('L4', marcus, '/sign-in/link', {
    method: 'POST',
    body: { email: `marcus-${stamp}@example.org` },
  });

  // The deal — one reviewer apiece (each: 1), which round-robins the pile
  // into a clean partition (workflows/review.ts's handOutAssignments: reader
  // at position j gets exactly the pile indices congruent to j mod 3) —
  // marcus gets 0, 3, 6…; sana gets 1, 4, 7…; theo gets 2, 5, 8… . Organizer.md
  // S4's own fixture deals "each: 2"; this recipe deals "1" instead so which
  // submission belongs to which reviewer is exact rather than guessed, and
  // the station's own truths never depend on the exact count.
  await p.dealTo({ who: [marcus, sana, theo], each: 1 });

  // X1 — "the deal lands" — the interlock the operator asked for by name.
  // One speaker's portal, read before anyone touches her submission's
  // status, stands in for "unchanged": nothing reviewer-facing may leak
  // before a decision (reviewer-experience.md's own constraint).
  const speakerZero = p.world.ids.submissions[0];
  const speakerSignIn = await p.signInLink(speakerZero.email);
  await snap('X1', 'organizer', `/admin/${slug}/reviews/reviewers`);
  await snap('X1', marcus, `/admin/${slug}/reviews`);
  await snap('X1', marcus, `/${slug}/portal`);
  await snap('X1', speakerSignIn.persona, `/${slug}/portal`);

  // Marcus and Sana make real progress; Theo touches nothing at all.
  await p.stageReview(marcus, 0, 4);
  await p.submitReviews(marcus);
  await p.stageReview(sana, 1, 3);
  await p.submitReviews(sana);

  // Two late arrivals, landing after the hand-out — newArrivals' own
  // trigger (standing.unassigned > 0).
  await p.cfpSubmit(2, { title: 'Late arrival' });

  // S4 — the watcher. Dana's Sunday check-in: Marcus/Sana show partial
  // progress, Theo's row shows 0 completed with a live Retract button, and
  // newArrivals names the two proposals nobody has read yet.
  await snap('S4', 'organizer', `/admin/${slug}/reviews/reviewers`);

  // Push toward the close, then the rescue.
  await p.roundConfig({ round: '1', name: 'Round 1', closes: futureDate(4), opens: '', blind: '0' });
  await p.takeBack(theo);

  // S5 + its own interlock — Dana's screen and Theo's own portal, same
  // event, same beat: her Reviewers view shows the retraction; his portal
  // carries the exact TAKEBACK_SUBJECT/takeBackBody copy review.ts writes.
  await snap('S5', 'organizer', `/admin/${slug}/reviews/reviewers`);
  await snap('S5', theo, `/${slug}/portal`);

  // X3 — "letters release, every portal changes at once" — the second
  // named interlock, filling sbek-import.md gap #1 (deciding and letters
  // have no station in either source doc). Two speakers, two verdicts, one
  // release, read from both of their own portals plus Dana's outbox.
  const acceptedIdx = 3;
  const rejectedIdx = 4;
  await p.decide(acceptedIdx, 'accept');
  await p.decide(rejectedIdx, 'decline');
  await snap('X3', 'organizer', `/admin/${slug}/outbox`);
  await p.releaseLetters();
  const acceptedSignIn = await p.signInLink(p.world.ids.submissions[acceptedIdx].email);
  const rejectedSignIn = await p.signInLink(p.world.ids.submissions[rejectedIdx].email);
  await snap('X3', 'organizer', `/admin/${slug}/submissions`);
  await snap('X3', acceptedSignIn.persona, `/${slug}/portal`);
  await snap('X3', rejectedSignIn.persona, `/${slug}/portal`);

  // T1 — Dana, composing the same acceptance letter for the third time this
  // week, wants it to say the same thing without retyping it. The outbox
  // screen she is looking at right now is the whole surface: stage a
  // decision, write a note, release — nothing on it saves what she wrote as
  // a reusable shape (no template picker, no saved-template list, anywhere
  // on this screen or reachable from it).
  await snap('T1', 'organizer', `/admin/${slug}/outbox`);

  return {
    surfaces: [{ persona: 'organizer', url: `/admin/${slug}/reviews/reviewers` }],
  };
}

function futureDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
function pastDate(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
