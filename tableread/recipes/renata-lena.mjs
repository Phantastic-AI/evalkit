// Act II-IV pro cutaway — Renata Cole (chair) and Lena Fischer (her first
// reviewer), Signal Conf 2027. One continuous world covering reviewer.md's
// whole S6-S11 arc (invited, first sign-in, reading, deadline, retraction,
// round 2) plus T2 (the pro half of the templating gap), snapped at each
// beat rather than rebuilt per station — same device as dana-committee.mjs,
// a different conference on purpose (a pro-hat cutaway, not the novice
// spine).
//
// Departs from reviewer.md's own fixture counts in one place, deliberately:
// with exactly one reviewer in the pool, workflows/review.ts's own
// round-robin (handOutAssignments) hands her the WHOLE undecided pile
// regardless of the `each` number asked for — one reader can only ever be
// "1 of however-many-readers-are-available", so `each` stops mattering.
// reviewer.md's S8 states a hand-out of "each: 2" against a 6-item pile
// leaving her "2 proposals in her queue"; the code does not support that
// outcome for a single-reviewer pool. This recipe sizes the pile itself (3)
// so what actually lands in her queue is exact, and gets S10's own
// TAKEBACK count ("2 unopened") to come out exactly right by construction:
// one submission gets staged (touched), the other two stay untouched.
export default async function renataLena({ p, snap }) {
  // Stamped per run — staging persists accounts, so a literal address only
  // ever works once (see dana-day-one.mjs's header note).
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  await p.signUp('Renata Cole', `renata-${stamp}@example.org`, 'one-reader-so-far-2');
  const { slug } = await p.createConference('Signal Conf 2027', {
    slug: `saga-rev-lena-${stamp}`,
    tracks: [],
  });

  await p.cfpSubmit(3, { title: 'Signal proposal' });

  // R1 (S6) — Renata invites her first reviewer. Before this, reviewTeam
  // has exactly 1 row (herself); the invite hands back a key=, not sent=1,
  // because Lena's address is not real.
  const lena = await p.inviteReviewer(`lena.fischer-${stamp}@example.org`, 'Lena Fischer');
  await snap('R1', 'organizer', p.world.ids.reviewers[lena].inviteLandingUrl);

  // R2 (S7) — Lena's first sign-in (the magic link already signed her in,
  // inside inviteReviewer above). ev.everything is false for a plain
  // reviewer, so the Reviewers-view bareLanding redirect never fires for
  // her — she lands straight on her own queue, empty, no tab strip.
  await snap('R2', lena, `/admin/${slug}/reviews`);

  // Blind mode on, then the deal — a sole reviewer takes the whole
  // reachable pile regardless of `each` (see header note), which for this
  // 3-item pile means all 3.
  await p.roundConfig({ round: '1', name: 'Round 1', blind: '1' });
  await p.dealTo({ who: [lena], each: 2 });

  // R3 (S8) — reading. One staged, not submitted: "Staged — yours until you
  // submit", author identity withheld (blind), nothing in roundStanding yet.
  await p.stageReview(lena, 0, 4);
  await snap('R3', lena, `/admin/${slug}/reviews`);

  // R4 (S9) — deadline approaching. The one fact the product has, a close
  // date, now sits near her queue; nothing else marks the approach.
  await p.roundConfig({ round: '1', name: 'Round 1', blind: '1', closes: futureDate(3) });
  await snap('R4', lena, `/admin/${slug}/reviews`);

  // R5 (S10) — Lena goes quiet near the close. Renata retracts her
  // untouched work (indices 1 and 2 — index 0 stays hers, staged); Lena
  // reads the note on her own portal later. Both sides, same beat.
  await p.takeBack(lena);
  await snap('R5', 'organizer', `/admin/${slug}/reviews/reviewers`);
  await snap('R5', lena, `/${slug}/portal`);

  // Clear her one remaining staged review out of the way (accepted, so the
  // two retracted-and-still-undecided ones are what round 2 hands out
  // fresh), then seal round 1 and open round 2.
  await p.decide(0, 'accept');
  await p.openRound({ from: '1', to: '2', name: 'Round 2', closes: futureDate(10), blind: '0' });
  await p.dealTo({ who: [lena], each: 1 });

  // R6 (S11) — round 2 opens with a new pile. Round 1 sealed and closed to
  // further writes; her queue now reports round 2, 2 freshly assigned — and
  // the hand-out writes her a portal note, the same as any hand-out.
  await snap('R6', lena, `/admin/${slug}/reviews`);
  await snap('R6', lena, `/${slug}/portal`);

  // T2 — pro Renata, composing a decision letter for the third conference
  // this quarter, expects a saved template with placeholders (the CRM's
  // bulk-email composer already fills {{first_name}}/{{event}} at send time
  // — workflows/crm.ts's fillTemplate — but even that is typed fresh each
  // send, not saved and reused; the outbox has nothing like it at all).
  await snap('T2', 'organizer', `/admin/${slug}/outbox`);

  return {
    surfaces: [{ persona: lena, url: `/admin/${slug}/reviews` }],
  };
}

function futureDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
