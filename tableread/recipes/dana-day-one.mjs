// Act I, DevFlow 2027 — the call opens. Dana's own day one (organizer.md
// S1) plus two lost-identity scenes that live at the same moment: a CFP
// submission filed under a typo'd address (L1) and a speaker who later
// can't remember which address she used (L2). All three are the same
// fixture window — the call is open, speakers are submitting — so one
// world, three snaps.
//
// L1/L2 ground: workflows/submit.ts's submitProposal keys a new `person`
// row on whatever email string arrives on the form, unchecked and
// uncorrected (planCoPresenters/submitProposal both call findPersonByEmail
// first, then INSERT a fresh row when nothing matches — a typo and a real
// address are indistinguishable to that code). index.ts's requestMagicLink
// answers the same neutral sentence either way — "If that address is in
// the system, a sign-in link is on its way." — whether the guess was right
// or wrong (index.ts:383/393), which is correct security and is also why
// L2 has no recovery path to find inside the product: there is no
// "look up a speaker by name and hand her a fresh link" tool anywhere in
// admin/settings.ts — team/add is the only magic-link-minting form the
// organizer has, and it only mints one for a person who does NOT already
// exist (settings.ts: `if (res.invited === null) return res.said` — an
// existing person, which a CFP submitter already is, gets the role granted
// silently with no link at all).
export default async function danaDayOne({ p, snap }) {
  // Every @example.org address here is stamped per run — staging persists
  // accounts across runs, and workflows/account.ts's signUp (like
  // addToTeam) refuses a second account on an address that already has one,
  // so a literal 'dana@example.org' would only ever work once. Same
  // convention recipes/organizer-s3-watcher.mjs already proves out.
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  await p.signUp('Dana Reyes', `dana-${stamp}@example.org`, 'reading-the-room-1');
  const { slug } = await p.createConference('DevFlow 2027', {
    slug: `saga-devflow-${stamp}`,
    tracks: [],
    // Event dates match the name's year. The defaults (future(90)) land in
    // the current year and a cold reader reads "DevFlow 2027" over 2026
    // dates as a mistake — the first live goldfish walk spent its opening
    // confusion on exactly that.
    startsOn: '2027-11-25',
    endsOn: '2027-11-26',
  });

  // The growing pile — six ordinary submissions standing in for "eight
  // speaker sign-ups... a growing pile" (organizer.md S1 step 3; six here,
  // not eight, room left for L1/L2's two identity-quirked ones to bring the
  // pile to eight, matching S1's own count).
  await p.cfpSubmit(6);

  // L1 — the typo. "Priya Osei" means to submit under priya.osei@example.org
  // but fat-fingers it; the harness plays both halves so the mismatch is
  // exact rather than accidental.
  await p.cfpSubmit(1, {
    name: 'Priya Osei',
    email: `priya.osie-${stamp}@example.org`, // the typo, deliberately: osei -> osie
    title: 'Debugging Distributed Systems With a Flashlight',
  });
  const realAddress = `priya.osei-${stamp}@example.org`; // the address she will actually try later

  // L2 — the forgetful speaker. "Kwame Boateng" submits under his work
  // address; weeks later (S1's "days pass") he tries his personal one from
  // memory and gets it wrong.
  await p.cfpSubmit(1, {
    name: 'Kwame Boateng',
    email: `kwame-${stamp}@devflow-speaker-co.example.org`,
    title: 'What Postgres Taught Me About Trust',
  });
  const guessedWrongAddress = `kwame.boateng-${stamp}@example.org`; // not the address he actually used

  // S1 — Dana never opens Reviews; she returns to the program overview and
  // the pile, exactly as the station specifies. Two surfaces, same read.
  await snap('S1', 'organizer', `/admin/${slug}`);
  await snap('S1', 'organizer', `/admin/${slug}/submissions`);

  // L1 — Priya tries her real, correctly-spelled address. Nothing is
  // "in the system" under that exact string (her submission sits under the
  // typo'd one instead), so the neutral sentence is the only thing on
  // screen — and it is the same sentence a stranger who guessed at random
  // would see. This is a POST whose response IS the page (index.ts's
  // requestMagicLink renders straight into signInPage(), no redirect).
  await snap('L1', 'priya-osei', '/sign-in/link', {
    method: 'POST',
    body: { email: realAddress },
  });

  // L2 — Kwame guesses wrong. Same neutral sentence, same shape as L1, but
  // the point here is organizer-side: Dana has no tool to find him and
  // hand him a working link (there is nothing to snap for "the tool that
  // doesn't exist" — the absence is the finding, argued in this scene's
  // own truths/expectedFindings against settings.ts's addToTeam, not
  // captured as a page).
  await snap('L2', 'kwame-boateng', '/sign-in/link', {
    method: 'POST',
    body: { email: guessedWrongAddress },
  });

  return {
    surfaces: [{ persona: 'organizer', url: `/admin/${slug}/submissions` }],
  };
}
