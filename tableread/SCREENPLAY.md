# SCREENPLAY

GENERATED from scenes.json by render-screenplay.mjs — do not edit.

One conference, one timeline, five acts: the camera follows Dana Reyes, first-time organizer, from the moment she opens her call to the moment Alex Rivera — her first attendee — finds a friend in the crowd. Pro-hat cutaways (Priya Anand, Renata Cole and Lena Fischer) visit a different, comparable conference on purpose, at the matching beat, for contrast.

**Grading law** (docs/sagas/README.md): every scene below carries two separate scores, never one blended number. CAPABILITY is mechanical — did the truths (and crossTruths, for an interlock) come out true, checkable against the page or the database. COMPREHENSION is human — did a goldfish reading the surface cold answer the intent (job + next action) the way a real person would. A scene can pass one and fail the other; that distinction is the point, not a rounding error to average away.

# ACT I — The Call Opens

## ACT I, SCENE 1 — Discovery by consequence

*Dana Reyes* · hat: novice

*Hour one of Dana's first conference. She opens the call for speakers, setting nothing but a closing date. Days pass. Speakers submit. Nothing in the product has told her a reading period is coming — she only meets that fact as a consequence of a pile that now needs her attention.*

*Two screens, read one after the other: the program overview, then the pile. The finding lives in the gap between them — nowhere does either say a reading period is coming, or that Dana is currently the whole committee.*

[COMPREHENSION — goldfish/intent
  JOB — See what has happened since the call opened, without knowing there is a reviewing arc coming at all.
  NEXT ACTION — Open the program overview she already knows how to find — not Reviews, which she has never seen.]

[CAPABILITY — truths
  · The round config has never been touched — no name, no dates — because Dana has never opened /reviews.
  · The submissions pile holds 8 rows, all undecided, none assigned.
  · The message table has zero rows for Dana on this event — nobody has told her anything about reviewing, because nothing has happened that would.]

[SBEK
  · CFP-S1 (organizer.md maps: organizer story 0, learns-it's-coming)]

[EXPECTED FINDING
  · The absence itself: nowhere between opening the call and watching eight proposals land does the product say a reading period is coming, that Dana is currently the whole committee, or where "reviews" even lives.]

SURFACES: organizer @ /admin/{slug}  |  organizer @ /admin/{slug}/submissions
FIXTURE: dana-day-one

---

## ACT I, SCENE 2 — A typo'd address, filed under a name nobody owns

*Priya Osei* · hat: novice

*Priya submitted a proposal into Dana's call. Her fingers slipped on the way in — priya.osie@example.org, not priya.osei@example.org — and the product never checked. Weeks later she tries to sign in with the address she actually owns.*

*One POST, no redirect: the sign-in page answers straight into its own response. The sentence on screen is identical to the one a total stranger would get.*

[COMPREHENSION — goldfish/intent
  JOB — Sign back in under her own, correctly-spelled address and find her proposal.
  NEXT ACTION — Ask for a mailed sign-in link — the only door /sign-in offers besides a password she never set.]

[CAPABILITY — truths
  · workflows/submit.ts's submitProposal keys a fresh `person` row on whatever email string arrived on the form — a typo and a real address are indistinguishable to that code.
  · index.ts's requestMagicLink answers "If that address is in the system, a sign-in link is on its way." whether the guess is right or wrong (index.ts:383/393) — the same sentence a stranger sees.]

[EXPECTED FINDING
  · GHOST — no correction path exists anywhere in the product for a mistyped CFP address: no confirmation email at submit time, no "claim this submission" flow, nothing. The proposal sits, findable only by the wrong string, forever.]

SURFACES: priya-osei @ /sign-in/link
FIXTURE: reuse:S1

---

## ACT I, SCENE 3 — Which address did I use?

*Kwame Boateng, Dana Reyes* · hat: novice

*Kwame submitted under his work address weeks ago. Trying to sign back in from his phone, he guesses at his personal one instead — wrong, but the product cannot tell him so.*

*The same neutral sentence L1 already proved. This scene's own weight is on Dana's side: does she have any tool to find him and hand him a working link?*

[COMPREHENSION — goldfish/intent
  JOB — Get back into the account holding his proposal, from whichever address turns out to be the right one.
  NEXT ACTION — Guess, fail silently, and — if the product offered it — ask Dana to look him up.]

[CAPABILITY — truths
  · The correct-security, brutal-UX sentence (index.ts:383/393) never distinguishes "wrong guess" from "right guess, no inbox yet."
  · settings.ts's addToTeam is the organizer's only magic-link-minting form, and it only mints a link for a person who does NOT already exist (`if (res.invited === null) return res.said`) — a CFP submitter already has a person row, so inviting his address grants a role silently and hands back no link at all.]

[EXPECTED FINDING
  · GHOST — Dana has no "look up a speaker by name, hand her a fresh link" tool anywhere in admin. The one form that mints links (team/add) is scoped to granting reviewer/organizer standing, and refuses to mint anything for someone who already exists in the system — the exact shape of a CFP submitter.]

SURFACES: kwame-boateng @ /sign-in/link
FIXTURE: reuse:S1

---

*Act I tally — capability: 7 truths asserted across 3 scene(s). comprehension: 3 goldfish/intent probe(s). Reported separately; never combined.*

# ACT II — Assembling the Committee

## ACT II, SCENE 1 — The founder with a fresh call, no vocabulary

*Dana Reyes, Marcus Udoh, Sana Iqbal, Theo Laurent* · hat: novice

*The call has closed, a pile waited, and three names Dana trusts are her whole committee. She has never said "round," "scorecard," or "blind" in her life. First visit to the Reviewers view: she wants reading to start, not concepts first.*

*A bare hit — no q, no p, nothing dealt. Whole pile still undecided. Read for order (does "start reading" sit above the round/team-config furniture a three-name founder has no use for) and dialect (round, blind, scorecard — words that mean nothing to her yet).*

[COMPREHENSION — goldfish/intent
  JOB — Get her three reviewers reading, without learning the product's vocabulary first.
  NEXT ACTION — The hand-out form — how many readers per proposal, who's reading, press Assign them.]

[CAPABILITY — truths
  · reviewTeam returns 4 rows (Dana + 3 invited); team.length > 1, so whoReadsWhat renders the table branch, not the single-reviewer branch.
  · The pile is > 0, so handOutForm renders with "N proposals are still undecided."
  · ev.roundConfig.name is unset, so the heading falls back to "Round 1" — a word Dana never chose.]

[EXPECTED FINDING
  · Documented finding: the Reviewers page fails on order and dialect for a first-time, three-name founder — "committee," "round," "blind" are none of them her words yet.]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers
FIXTURE: dana-committee

---

## ACT II, SCENE 2 — The deal lands

*Dana Reyes, Marcus Udoh, the speaker of proposal zero* · hat: novice

*Dana hands the pile out. In the same instant: Marcus's queue fills, a message waits on his portal, and — this is the point of the scene — nothing on the speaker's own portal changes at all.*

*Three cuts, same beat: Dana's Reviewers view (assignments now visible), Marcus's queue and his own portal (the hand-out note), and the speaker's portal, read cold, unchanged. The constraint reviewer-experience.md states in words — "Nothing reviewer-facing may reveal a decision before its letter goes out" — is what this scene makes checkable.*

[COMPREHENSION — goldfish/intent
  JOB — Dana: get reading started. Marcus: find out what landed on him. The speaker: unaware anything happened at all.
  NEXT ACTION — Marcus opens his queue; the speaker has nothing new to open.]

[CAPABILITY — truths
  · Marcus's assigned count in reviewTeam increases by his share of the round-robin (workflows/review.ts's handOutAssignments).
  · A message exists for Marcus with subject matching handOutBody's own shape — "Proposals assigned to you" (review.ts).
  · The speaker's portal carries no review-standing fact anywhere — her submission still reads Submitted, nothing more.]

[CROSS — interlock, spans personas
  · [organizer <-> marcus-udoh] The instant Dana's hand-out lands, reviewTeam's assigned count for Marcus and the "Proposals assigned to you" message on his own portal are the same fact, read from two screens.
  · [organizer <-> speaker-of-proposal-zero] Dana's own hand-out act changes nothing the speaker can read — her portal, captured in the same beat, carries no reviewer-facing standing at all (reviewer-experience.md's own constraint, made checkable).]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers  |  marcus-udoh @ /admin/{slug}/reviews  |  marcus-udoh @ /{slug}/portal  |  speaker-of-proposal-zero @ /{slug}/portal
FIXTURE: reuse:S2

---

## ACT II, SCENE 3 — Maya's invite never arrives

*Dana Reyes, Maya Chen* · hat: novice

*Dana invites a fourth reader. If Maya's address were real and the mail genuinely went to spam, what does Dana have left to hand her?*

*The synthetic half, proven live: the on-screen key link is findable, exactly where settings.ts's own comment says it would be — "the link comes back on the screen either way." The real-domain half is asserted from the source, not captured, and it complicates that comment rather than confirming it.*

[COMPREHENSION — goldfish/intent
  JOB — Dana: get a fourth reader a working way in, whatever her address turns out to be.
  NEXT ACTION — Read the settings page she landed on after the invite.]

[CAPABILITY — truths
  · settings.ts's team/add hands back `?key=<link>#team` in the redirect for an address isRealAddress() rejects — Maya's @example.org address, here, live.
  · The GET handler for /admin/:slug/settings reads that same `key` query param on any later visit and renders it (settings.ts:1253), so the link stays findable on a fresh visit to the same URL, not only in the instant after the invite.]

[EXPECTED FINDING
  · Code-grounded, not live-walkable: for a REAL address, settings.ts's own redirect construction is `emailed ? '&sent=1' : '&key=...'` — once an email attempt succeeds, the key is deliberately NOT also printed on screen (settings.ts:1481). If Maya's invite really were real-domain and really did land in spam, Dana would have no on-screen fallback at all — the opposite of what this scene's live half might suggest on its own. This fixture cannot exercise the real-domain path (it sends no real mail), so the asymmetry is recorded here rather than proven end to end.]

SURFACES: organizer @ {mayaInviteLandingUrl}
FIXTURE: reuse:S2

---

## ACT II, SCENE 4 — The expired link on the couch

*Marcus Udoh* · hat: novice

*A busy week; Marcus never got around to his first invite. He asks for a fresh sign-in link from his phone.*

*The request half, live: a working link prints straight onto the response page. The two-hour expiry itself is asserted from the source, not from a real clock running out.*

[COMPREHENSION — goldfish/intent
  JOB — Get back in without hunting for the first email.
  NEXT ACTION — Sign-in page's own "Email me a sign-in link instead" button.]

[CAPABILITY — truths
  · The expired-link page's actual copy is "That link has expired. Ask for a fresh one below." (index.ts:430) — NOT labels.ts's own auth.link_expired string ("That link has expired — they last two hours"), which is defined and never read by any route (grepped dead across src/).]

[EXPECTED FINDING
  · Not live-verified: the expiry itself would need a real two hours to pass or the session secret to forge a stale token, neither available to this harness. Asserted from index.ts:425-431 alone.
  · A live, checkable asymmetry: the synthetic on-screen link this fixture CAN prove carries no expiry warning text at all — "two hours" only ever appears in the emailed text body (index.ts:391), which a synthetic @example.org address never receives.
  · The expired-link page reuses signInPage() whole, so "ask for a fresh one below" is not a dead end — the same "Email me a sign-in link instead" button that got Marcus his link the first time sits right there. This is a working affordance, not a ghost — recorded here because the coordinator's original framing assumed it without the code check; the check confirms it, structurally.]

SURFACES: marcus-udoh @ /sign-in/link
FIXTURE: reuse:S2

---

## ACT II, SCENE 5 — Topics paired with tracks at setup time

*Priya Anand, Yuki Tanaka, Bram Voss* · hat: pro

*Priya's conference had topics decided before a single proposal existed. She paired trusted readers with tracks in her head at setup time, and wants the product to restate that pairing, not make her redo it.*

*Pro cutaway — Systems Summit 2027, a different conference from Dana's, visited on purpose for the contrast. Read the groups panel: does this page look like it already knows the plan she made?*

[COMPREHENSION — goldfish/intent
  JOB — See the Platform/Product pairing she already decided, restated rather than rebuilt.
  NEXT ACTION — Read the groups panel; deal to one group without touching the other track.]

[CAPABILITY — truths
  · Two ReviewerGroup rows exist, one bound to each track.
  · handOutForm's group select offers "Platform readers · Platform" and "Product readers · Product" next to "Everyone."
  · Dealing to a group reaches only that group's current members, read fresh at the moment of dealing (handOutForm's own line).]

[EXPECTED FINDING
  · Documented finding, screenshot-catchable: group card visual illegibility on first read.
  · Documented finding: the group silently overrides the individual reviewer checkboxes — handOutForm's own copy says "used only when dealing to Everyone," but nothing on the form visibly marks the checkboxes inert once a group is chosen.]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers
FIXTURE: priya-topics

---

## ACT II, SCENE 6 — Invited

*Renata Cole, Lena Fischer* · hat: pro

*Renata, alone on her own committee, invites her first reviewer.*

*Pro cutaway — Signal Conf 2027. Before the invite, reviewTeam has exactly one row: herself. The redirect carries key=, not sent=1 — no email was attempted for Lena's synthetic address.*

[COMPREHENSION — goldfish/intent
  JOB — Get her first reader a way in.
  NEXT ACTION — The invite form on the single-reviewer branch of whoReadsWhat — "You are currently the only reviewer."]

[CAPABILITY — truths
  · Before the invite, reviewTeam(saga-rev-lena) has exactly 1 row.
  · After, it has 2; Lena's row shows 0 assigned.
  · The redirect carries key=<link>, not sent=1 — no email was attempted.]

[SBEK
  · CFP-S3 (organizer.md maps: organizer story 1, gets-help — provisioning)]

SURFACES: organizer @ {lenaInviteLandingUrl}
FIXTURE: renata-lena

---

## ACT II, SCENE 7 — First sign-in

*Lena Fischer* · hat: pro

*Lena opens Fireside for the first time, following the link Renata handed her. She lands somewhere. The question is where, and what it assumes she already knows.*

*ev.everything is false for a plain reviewer, so the Reviewers-view bareLanding redirect that catches an organizer's own bare hit never fires for her — she never sees a tab strip at all.*

[COMPREHENSION — goldfish/intent
  JOB — Find out what she's here to do.
  NEXT ACTION — Nothing yet — her queue is empty; the empty-state branch is the whole page.]

[CAPABILITY — truths
  · No tab strip renders on her screen (reviewsTabs returns '' when !ev.everything) — confirms a plain reviewer has only My reviews and never sees a choice.
  · Her queue is empty (q.total === 0) — the empty-state branch renders.
  · No message exists for her yet — no hand-out has happened.]

[SBEK
  · CFP-S3 (organizer.md maps: reviewer station first sign-in)]

SURFACES: lena-fischer @ /admin/{slug}/reviews
FIXTURE: reuse:R1

---

## ACT II, SCENE 8 — Reading

*Lena Fischer* · hat: pro

*Lena now has a real queue: staged, autosaving, names hidden, submit still ahead of her. She wants to know her work is safe before she's ready to send it.*

*One card open and staged, not submitted — "Staged — yours until you submit."*

[COMPREHENSION — goldfish/intent
  JOB — Read and score without losing her work before she's ready to submit.
  NEXT ACTION — Stage a score; leave it unsubmitted.]

[CAPABILITY — truths
  · Her queue holds proposals matching the hand-out.
  · The staged proposal carries the chip "Staged — yours until you submit."
  · ev.roundConfig.blind is true — the round line reads "Names hidden while scoring."]

[SBEK
  · ABS-S3 steps 1-6 (sbek-import.md maps: reviewer stations invited, first sign-in, reading)]

SURFACES: lena-fischer @ /admin/{slug}/reviews
FIXTURE: reuse:R1

---

*Act II tally — capability: 23 truths asserted across 8 scene(s). comprehension: 8 goldfish/intent probe(s). Reported separately; never combined.*

# ACT III — Watching and Rescuing

## ACT III, SCENE 1 — The watcher

*Dana Reyes, Marcus Udoh, Sana Iqbal, Theo Laurent* · hat: novice

*Days into the round: Dana dealt the pile earlier, and she's anxious, checking in on a quiet Sunday. She wants to see what changed, not read the whole round again.*

*Read for change-and-exception, not inventory: does the screen say who is behind in one glance, or make her scan every row to find out?*

[COMPREHENSION — goldfish/intent
  JOB — Find out who is behind without re-reading the whole round.
  NEXT ACTION — Scan for the one exception — Theo's row.]

[CAPABILITY — truths
  · Marcus and Sana show partial "X scored of Y assigned" progress.
  · Theo's row shows his assigned count with 0 completed, and a live "Retract N unopened" button (r.untouched > 0).
  · newArrivals renders: two undecided proposals with no reviewer this round, landed after the last hand-out.]

[EXPECTED FINDING
  · This station's own test: restating everyone (Marcus's progress, Sana's progress, and Theo's) is the inventory failure the story exists to catch — the honest answer to "is anyone behind" names only Theo.]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers
FIXTURE: reuse:S2

---

## ACT III, SCENE 2 — Deadline approaching

*Lena Fischer* · hat: pro

*Days from the round's close, Lena checks her queue again. The one fact the product actually has — a close date — sits quietly at the top. Nothing else marks the approach.*

*Read for whether anything on this screen, or reachable from it, prompts her before the date arrives, or only states it passively.*

[COMPREHENSION — goldfish/intent
  JOB — Find out how much time she has left.
  NEXT ACTION — Nothing beyond reading the date — there is no reminder to act on.]

[CAPABILITY — truths
  · dueChip(ev.roundConfig.closesAt) renders "Closes {date}" near the head of her queue.
  · No reminder message exists for her tied to the approaching close.
  · dueChip's own comment says it plainly: "Display only — nothing here enforces a deadline."]

[EXPECTED FINDING
  · Documented gap: deadlines display-only. Station it anyway — the fixture's job is to make the walk feel the absence, not paper over it with an invented reminder.]

SURFACES: lena-fischer @ /admin/{slug}/reviews
FIXTURE: reuse:R1

---

## ACT III, SCENE 3 — The rescuer

*Dana Reyes, Theo Laurent* · hat: novice

*Near the round's close, Theo has gone silent. Dana must move his work to someone else without breaking anything — not his half-written drafts, not the trust of the pile, not what the act itself will say to him.*

*Two cuts, same beat: Dana's own Reviewers view after the take-back, and Theo's own portal — the interlock proves the exact copy her act promises is the exact copy that lands on him.*

[COMPREHENSION — goldfish/intent
  JOB — Dana: move Theo's unopened work without losing anything he started or unsettling the pile. Theo: find out, later, what happened to his queue.
  NEXT ACTION — Dana presses Retract. Theo reads his portal, whenever he next looks.]

[CAPABILITY — truths
  · retractForm's own count matches what actually moves — Theo's started-but-unsubmitted rows, if any, are untouched after the act.
  · The proposals he held unopened return to the undecided, unassigned pile.
  · Theo receives a message: subject "Assignments taken back", body "{N} unopened assignments were taken back — DevFlow 2027. Nothing you wrote was touched." (review.ts's exact TAKEBACK_SUBJECT / takeBackBody copy).]

[CROSS — interlock, spans personas
  · [organizer <-> theo-laurent] The retraction Dana sees confirmed on her own Reviewers view and the exact TAKEBACK_SUBJECT/takeBackBody copy on Theo's own portal are the same write, read from both sides of it in the same beat.]

[EXPECTED FINDING
  · Documented gap: nudge/retract safety opacity — the "is this safe to click?" pass is exactly what would surface it. Does the Retract button, on sight, say it only reaches work nobody opened — or does it read as "take everything back"?]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers  |  theo-laurent @ /{slug}/portal
FIXTURE: reuse:S2

---

## ACT III, SCENE 4 — Unopened work retracted

*Renata Cole, Lena Fischer* · hat: pro

*Lena has gone quiet near the close. Renata retracts her unopened work. Lena, next time she looks, finds a note she never asked for.*

*Pro-hat pair to S5 — the same mechanic, read cold from the reviewer's own side rather than the chair's. Does the note explain what happened and why, or land as unexplained subtraction?*

[COMPREHENSION — goldfish/intent
  JOB — Renata: free up the two proposals Lena never opened. Lena: find out why her count dropped.
  NEXT ACTION — Renata presses Retract. Lena reads her own portal.]

[CAPABILITY — truths
  · A message exists: subject "Assignments taken back", body "2 unopened assignments were taken back — Signal Conf 2027. Nothing you wrote was touched."
  · Her assigned count in reviewTeam drops by 2; retractForm no longer shows a Retract button for her row (r.untouched === 0).
  · The freed proposals return to the undecided, unassigned pile.]

SURFACES: organizer @ /admin/{slug}/reviews/reviewers  |  lena-fischer @ /{slug}/portal
FIXTURE: reuse:R1

---

*Act III tally — capability: 13 truths asserted across 4 scene(s). comprehension: 4 goldfish/intent probe(s). Reported separately; never combined.*

# ACT IV — Deciding, Telling, and What Is Missing

## ACT IV, SCENE 1 — Letters release, every portal changes at once

*Dana Reyes, two speakers* · hat: novice

*Dana decides: one accepted, one declined. She releases the letters. In the same instant, both speakers' portals change — and, per the product's own rule, only because she took the second, deliberate step of releasing, not merely deciding.*

*Fills a real gap: sbek-import.md gap #1 names it directly — "the graders' organizer story climaxes at decide-and-notify, ours stops at watching and rescuing." This scene is that station. Snap the outbox before release (staged, nothing sent yet), then both portals after.*

[COMPREHENSION — goldfish/intent
  JOB — Dana: record both verdicts and tell both speakers, as two separate deliberate acts. Both speakers: find out where they stand.
  NEXT ACTION — Dana decides, then separately releases. Each speaker reads her own portal, nothing more.]

[CAPABILITY — truths
  · Both submissions carry distinct, persisted decisions (accepted / rejected) in the organizer's own submissions list before any letter goes out.
  · "Changing status never auto-emails anyone" (00-how-sessionboard-works.md line 83) — deciding and releasing are two separate deliberate steps, checkable as two separate writes in this scene's own sequence.
  · After release, the accepted speaker's portal reads Accepted and the rejected speaker's portal reads Rejected — nothing shared between the two.]

[CROSS — interlock, spans personas
  · [accepted-speaker <-> rejected-speaker] One release act, two portals, read in the same beat: each speaker's own status changes and nobody else's status appears on either page — the letters land as two private facts, not one shared list.
  · [organizer <-> accepted-speaker] Dana's submissions list and the accepted speaker's own portal agree on the same word ("Accepted") the instant the letter releases, not before.]

[SBEK
  · CFP-S4 (CFP-12, CFP-13, CFP-14)]

SURFACES: organizer @ /admin/{slug}/outbox  |  organizer @ /admin/{slug}/submissions  |  accepted-speaker @ /{slug}/portal  |  rejected-speaker @ /{slug}/portal
FIXTURE: reuse:S2

---

## ACT IV, SCENE 2 — Say it the same way, every time

*Dana Reyes* · hat: novice

*Dana is composing the same acceptance letter for the third time this week and wants it to say the same thing without retyping it.*

*The outbox screen she is looking at right now is the whole surface: stage a decision, write a note, release. Read for a saved-template picker, a named-template list, anything reusable — and find none.*

[COMPREHENSION — goldfish/intent
  JOB — Write an acceptance letter that reads the same way every time, without retyping it from scratch.
  NEXT ACTION — Look for a saved template, a placeholder picker, anything reusable.]

[CAPABILITY — truths
  · outbox.ts's own letter machinery (stageDecision, splitLetter, letterBody, the NOTE_MARK convention) composes a fresh, one-off note per decision — nothing here names, saves, or reuses a shape across sends.
  · workflows/crm.ts's fillTemplate — the closest relative in the whole product, supporting {{first_name}}/{{event}} placeholders for bulk CRM email — is typed fresh at send time too; it is not a saved, named, reusable template either.]

[EXPECTED FINDING
  · Gap R-3: no saved-template surface exists anywhere in the product — not for decision letters, and not even in the CRM's own placeholder-filling composer, which comes closest but still discards the shape after every send.]

SURFACES: organizer @ /admin/{slug}/outbox
FIXTURE: reuse:S2

---

## ACT IV, SCENE 3 — A template with placeholders

*Renata Cole* · hat: pro

*Renata, composing a decision letter for the third conference she's chaired this year, expects what any mature tool would give her: a saved template, with placeholders, that she names once and reuses forever.*

*Pro-hat pair to T1 — same absence, higher expectation. The CRM's own {{first_name}}/{{event}} composer is the nearest thing the product has, and even that discards what she typed the moment the send completes.*

[COMPREHENSION — goldfish/intent
  JOB — Reuse a decision letter's shape across conferences without rebuilding it from memory each time.
  NEXT ACTION — Look for a template library — a named list she could pick from.]

[CAPABILITY — truths
  · Same absence as T1: no persisted, named, reusable template surface exists on this screen or reachable from it.
  · The CRM's fillTemplate mechanism (workflows/crm.ts) is the one place in the product that already knows how to fill {{tokens}} — but nothing calls it here, and even there the template itself is not saved.]

[EXPECTED FINDING
  · Gap R-3, pro framing: a chair running her third, fourth, fifth conference has the strongest claim on this feature, and the gap is identical to a first-timer's.]

SURFACES: organizer @ /admin/{slug}/outbox
FIXTURE: reuse:R1

---

## ACT IV, SCENE 4 — Round 2 opens with a new pile

*Renata Cole, Lena Fischer* · hat: pro

*Round 1 has sealed, round 2 is open, and a new pile has landed on Lena. Whether anything says so, or the queue simply changed underneath her.*

*Read the queue and the portal both, aimed at the portal specifically: does anything there say a new round started, or does the queue just have new proposals in it with no announcement?*

[COMPREHENSION — goldfish/intent
  JOB — Find out whether this is a new batch or leftovers from before.
  NEXT ACTION — Read the queue's own round number; read the portal for any announcement.]

[CAPABILITY — truths
  · Round 1 is sealed: roundHistory shows it with current: false.
  · Her queue now reports round 2 (q.round === 2), with freshly assigned proposals.
  · The round-2 hand-out writes her a message — subject "Proposals assigned to you", body from handOutBody — the same as any hand-out; workflows/review.ts's handOutAssignments is round-agnostic, so a second round gets the same notification a first round does.]

[SBEK
  · ABS-01, ABS-02 (sbek-import.md gap #2: two-plus rounds with per-round pools)]

SURFACES: lena-fischer @ /admin/{slug}/reviews  |  lena-fischer @ /{slug}/portal
FIXTURE: reuse:R1

---

*Act IV tally — capability: 12 truths asserted across 4 scene(s). comprehension: 4 goldfish/intent probe(s). Reported separately; never combined.*

# ACT V — Alex's Conference

## ACT V, SCENE 1 — Alex arrives

*Alex Rivera* · hat: novice

*A brand-new account, first conference. No event_role, no submission, no my_schedule row — afterSignIn sends Alex to the chooser, not the marketing page.*

*Snap the chooser itself, before Alex picks anything — the page a first-timer actually lands on.*

[COMPREHENSION — goldfish/intent
  JOB — Find the conference Alex is actually here for.
  NEXT ACTION — Press the one card matching DevFlow 2027.]

[CAPABILITY — truths
  · index.ts's afterSignIn returns /welcome for a person with no event_role, no submission, and no my_schedule row anywhere.
  · welcomePage renders one <form> per open conference, the whole card the submit button — including conferences that are not Alex's own.]

[EXPECTED FINDING
  · Worth recording, not fixing: /welcome lists every open conference on the whole instance with no tenant scoping — a real, observed fact while building this scene (a same-named leftover conference from an earlier fixture run sorted ahead of a fresh one and required a disambiguating check to catch).]

SURFACES: alex @ /welcome
FIXTURE: attendee-arc

---

## ACT V, SCENE 2 — Alex stars two talks

*Alex Rivera* · hat: novice

*Two talks catch Alex's eye on the freshly published agenda. One tap each, and they line up on My schedule.*

*The public agenda's own per-card form, signed in — a real POST, not local storage.*

[COMPREHENSION — goldfish/intent
  JOB — Build a personal shortlist out of a whole published program.
  NEXT ACTION — My schedule → "Find someone you met →", already visible above the list.]

[CAPABILITY — truths
  · "2 sessions starred" reads exactly on My schedule, plus "Add my schedule to calendar →".
  · Both starred sessions render in time order under their day heading, each with a working [LINK] to its own public page.]

SURFACES: alex @ /{slug}/my-schedule
FIXTURE: reuse:V1

---

## ACT V, SCENE 3 — Share my schedule

*Alex Rivera* · hat: novice

*Alex turns sharing on — the two-pass choice, the card that says in plain words what becomes visible before it offers the button.*

*The after state: "You are on the list."*

[COMPREHENSION — goldfish/intent
  JOB — Be findable by other people going to the same talks, on Alex's own terms.
  NEXT ACTION — "Take me off this list" sits right there, one click, for later.]

[CAPABILITY — truths
  · "You are on the list." and "People going to the same talks can see your name, and the sessions you starred." read exactly on the page.
  · "Take me off this list" (social.revoke) renders as a live control, not a promise.]

SURFACES: alex @ /{slug}/my-schedule
FIXTURE: reuse:V1

---

## ACT V, SCENE 4 — Alex follows a speaker

*Alex Rivera, a speaker* · hat: novice

*One of Alex's starred talks has a speaker worth following past this one conference.*

*The follow control, from the speaker's own public page — a real relationship, so it needs an account, unlike a star.*

[COMPREHENSION — goldfish/intent
  JOB — Keep track of a speaker's future talks past this one conference.
  NEXT ACTION — Nothing further on this page — the button now reads its own state back.]

[CAPABILITY — truths
  · "Following ✓" renders as a submitted, pressed button (aria-pressed="true") in place of the earlier "Follow {name}" one.]

SURFACES: alex @ /{slug}/speakers/{speakerId}
FIXTURE: reuse:V1

---

## ACT V, SCENE 5 — Finding someone you met

*Alex Rivera, Nadia Brandt* · hat: novice

*Alex remembers Nadia's name from a talk and searches for her — the operator's own ≤2-taps path: nav → My schedule → Find someone you met.*

*Search, then request. connect.ts's own matchCard form, no id ever typed by hand.*

[COMPREHENSION — goldfish/intent
  JOB — Turn a name remembered from a talk into a real connection, pending her agreement.
  NEXT ACTION — Wait — nothing more Alex can do until Nadia answers.]

[CAPABILITY — truths
  · "Sent. They will see it next time they look." (friend.done) renders after the request.
  · The request is not yet a friendship: Alex's own "Your people" list still reads "Nobody yet."]

SURFACES: alex @ /{slug}/connect?q=Nadia&note=sent
FIXTURE: reuse:V1

---

## ACT V, SCENE 6 — Nadia accepts — both see each other's stars

*Alex Rivera, Nadia Brandt* · hat: novice

*Nadia opens her own Find-someone page, sees Alex's request, and accepts it. In that same instant, both of their starred schedules open to each other — nothing else does.*

*The interlock the operator asked for: two personas, one beat. Nadia's accept, then both schedules, cut one after another.*

[COMPREHENSION — goldfish/intent
  JOB — Nadia: accept someone she remembers meeting. Alex: see what Nadia is going to; Nadia: see what Alex is going to.
  NEXT ACTION — Either of them opens "See their schedule" from their own Your people list.]

[CAPABILITY — truths
  · "They are one of your people now." (friend.accepted) renders on Nadia's page after accepting.
  · Alex's own /connect/:nadia/schedule shows Nadia's one starred talk.
  · Nadia's own /connect/:alex/schedule shows both of Alex's starred talks.]

[CROSS — interlock, spans personas
  · [alex <-> nadia] One accept, read from both sides in the same beat: friendSchedule (queries/friends.ts) opens the same way for both of them at once — gated on the friendship alone, nothing else, and nothing shared before it existed (V5's own truth: Alex's list read "Nobody yet" right up until this accept).]

SURFACES: nadia @ /{slug}/connect?note=accepted  |  alex @ /{slug}/connect/{nadiaId}/schedule  |  nadia @ /{slug}/connect/{alexId}/schedule
FIXTURE: reuse:V1

---

## ACT V, SCENE 7 — Catching up on a missed talk

*Alex Rivera* · hat: novice

*Alex wants to mark a starred talk as one they actually caught, or missed, and catch up on the ones they didn't.*

*The ghost. Read the starred talk's own public page cold: no "Were you there?", no "Saw it" / "Missed it", no "Catch up" anywhere on it — not gated behind the conference being over, simply never wired to any control at all.*

[COMPREHENSION — goldfish/intent
  JOB — Record which starred talks were actually attended, and find a way to catch up on the rest.
  NEXT ACTION — None — there is no such control on this page or reachable from it.]

[CAPABILITY — truths
  · lib/labels.ts §1.14 defines 'star.unmarked' ("Were you there?"), 'star.watched' ("Saw it"), 'star.missed' ("Missed it"), and 'screen.catch_up' ("Catch up") — all four grepped dead across src/routes: zero call sites outside labels.ts itself.
  · The session's own live page renders only "On your schedule" (the star toggle) and the speaker block — nothing about attendance, watched state, or catching up.]

[EXPECTED FINDING
  · GHOST, the expected finding this scene exists to surface: Saw it / Missed it / Catch up is dead vocabulary, defined in the label map and wired to nothing. A goldfish reading this page cold will never find it, because it is not there to find.]

SURFACES: alex @ /{slug}/s/{sessionSlug}
FIXTURE: reuse:V1

---

*Act V tally — capability: 15 truths asserted across 7 scene(s). comprehension: 7 goldfish/intent probe(s). Reported separately; never combined.*

---

**Whole-screenplay tally** — capability: 70 truths across 26 scenes. comprehension: 26 goldfish/intent probes. Two numbers, on purpose.
