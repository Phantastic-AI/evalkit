// Act V, DevFlow 2027 — the attendee arc, deep. Alex Rivera (first
// conference, the novice hat this act follows) and Nadia Brandt (the
// invented second attendee the friendship scenes need) walk the whole
// signed-in social layer: arrival, starring, My schedule + sharing,
// following a speaker, finding each other and the reciprocity of that
// (connect.ts's own double opt-in), and the one control that does not
// exist — catching up on a missed talk.
//
// Needs a published agenda, which neither organizer.md nor reviewer.md's
// worlds ever build — this recipe is the one that walks decide -> place ->
// publish end to end, grounded in src/routes/admin/agenda.ts (the
// GET-with-?pick=, then a real <form action=".../place"> per open cell,
// same "no field invented" idiom as everywhere else) and
// src/routes/public/agenda.ts / schedule.ts / speakers.ts / connect.ts for
// the attendee-facing half.
export default async function attendeeArc({ p, snap }) {
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  await p.signUp('Dana Reyes', `dana-attendee-${stamp}@example.org`, 'reading-the-room-3');
  const { slug } = await p.createConference('DevFlow 2027', {
    slug: `saga-devflow-attendees-${stamp}`,
    tracks: [],
    // /welcome lists every open conference on the whole instance with no
    // tenant scoping, so "DevFlow 2027" alone is not a safe match once a
    // same-named fixture from an earlier run is still sitting on staging
    // (a real, observed collision while building this recipe, not a
    // hypothetical one). The venue name is unique per run and never quoted
    // in any scene's truths, so it is safe to use purely as a discriminator.
    venueName: `Attendee Arc Hall ${stamp}`,
  });

  // Three talks: two accepted and placed, one declined — so the agenda
  // Alex and Nadia meet is a real, mixed program, not a single-item stub.
  await p.cfpSubmit(3, { title: 'Attendee-arc talk' });
  await p.decide(0, 'accept');
  await p.decide(1, 'accept');
  await p.decide(2, 'decline');
  await p.placeSession(0);
  await p.placeSession(1);
  await p.publishAgenda();

  // V1 — Alex arrives. A brand-new account holds no event_role, no
  // submission, no my_schedule row, so afterSignIn sends them to /welcome
  // (index.ts) — the chooser, not the marketing page. Snap it before
  // choosing: this is the page a first-timer actually lands on.
  await p.signUpAs('alex', 'Alex Rivera', `alex-${stamp}@example.org`, 'first-conference-1');
  await snap('V1', 'alex', '/welcome');
  // Matched on the venue's own stamp, not the display name — see the
  // createConference call above for why.
  await p.chooseConference('alex', `Attendee Arc Hall ${stamp}`);

  // V2 — Alex stars two talks, from the public, published agenda's own
  // per-card form (routes/public/agenda.ts).
  await p.star('alex', 0, true);
  await p.star('alex', 1, true);
  await snap('V2', 'alex', `/${slug}/my-schedule`);

  // V3 — sharing: off until asked for, twice (the card, then the form
  // inside its own <details>) — this recipe goes straight to "yes", the
  // outcome a scene needs to see, not the two-pass UI itself.
  await p.shareSchedule('alex', { on: true });
  await snap('V3', 'alex', `/${slug}/my-schedule`);

  // V4 — Alex follows a speaker, from her own public page
  // (routes/public/speakers.ts's followControl form).
  const speakerId = await p.agendaSpeakerId('alex');
  await p.followSpeaker('alex', speakerId, true);
  await snap('V4', 'alex', `/${slug}/speakers/${speakerId}`);

  // Nadia arrives the same door, stars the same first talk (so "their
  // schedule" has something on it once they are friends), and shares hers
  // too.
  await p.signUpAs('nadia', 'Nadia Brandt', `nadia-${stamp}@example.org`, 'second-conference-1');
  await p.chooseConference('nadia', `Attendee Arc Hall ${stamp}`);
  await p.star('nadia', 0, true);
  await p.shareSchedule('nadia', { on: true });

  // V5 — Alex finds Nadia by name and sends the request (connect.ts's
  // matchCard form, read off the search results page itself — no personId
  // ever typed by hand here, only scraped off the real page the way every
  // other write in this tool works).
  const sentUrl = await p.sendFriendRequest('alex', 'Nadia');
  await snap('V5', 'alex', sentUrl);

  // V6 — the interlock: Nadia accepts, and from that instant both sides can
  // read the other's starred schedule (queries/friends.ts's friendSchedule,
  // gated on the friendship alone — nothing else).
  const acceptedUrl = await p.acceptFriendRequest('nadia');
  await snap('V6', 'nadia', acceptedUrl);
  const alexId = p.personIdOf('alex');
  const nadiaId = p.personIdOf('nadia');
  await snap('V6', 'alex', `/${slug}/connect/${nadiaId}/schedule`);
  await snap('V6', 'nadia', `/${slug}/connect/${alexId}/schedule`);

  // V7 — the ghost. star.watched / star.missed / screen.catch_up
  // (lib/labels.ts §1.14) are defined and never read by any route — grepped
  // dead across src/routes. This is the expected finding, not a bug this
  // fixture triggers: a starred talk's own public page, read cold, has no
  // "Were you there?" / "Saw it" / "Missed it" / "Catch up" anywhere on it.
  const sessionSlug = await p.agendaSessionSlug('alex');
  await snap('V7', 'alex', `/${slug}/s/${sessionSlug}`);

  return {
    surfaces: [{ persona: 'alex', url: `/${slug}/my-schedule` }],
  };
}
