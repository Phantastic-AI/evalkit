# evalkit spec: two rungs, one driver

2026-08-26. Operator-ruled scope. Status: draft for external review.

## Goals

Two test types, both running fixtures on a staging deployment through the product's real
sign-up, forms, and flows — the same path a user takes:

1. **Deterministic fixtures** — scripted world-building plus mechanical
   truth checks. Exists today; gains journey scoring.
2. **Interactive simulations** — a goldfish-driven walk of a journey,
   producing BOTH scores from one run: "can it be done" (the walk reached
   its goal) and "can it be found" (per-step comprehension, graded).

The goldfish (a small model wearing a persona, given zero product
knowledge) drives everything. There is no frontier-model driver anywhere:
a strong model completing a journey is a meaningless signal, because the
user is not a strong model with the whole product in mind. If the goldfish
can complete it, it is both doable and findable. If it cannot, the screen
gets fixed — the model does not get bigger.

Out of scope, ruled: CI export (ripping recipes to Playwright tests —
later, maybe), standalone smoke suites, snapshot/restore of fixture
databases (fresh rebuild through the real flows every run, so a fixture
can never preserve a state the product can no longer produce).

## What sbek is (sessionboard-eval-kit, inventoried from source)

Its own description: "a Claude-driven browser agent clicks through a
submission URL and scores it against feature rubrics."

- Driver: frontier Claude agent over Playwright; discovers flows unscripted.
- Specs: YAML per area; personas; numbered steps; pass criteria with
  weights (w1..w3); chained areas with preconditions (area 04's approvals
  gate area 06's widgets).
- Judge: LLM-as-judge over the run transcript; `finalize` rolls scores up.
- Fixtures: its own seed (sample-data.json creates a full conference).
- Ops hardening in recent commits: containment rules, halting scenarios
  that lose their session, not scoring absence of evidence as absence.

What we keep from it: score legibility (weighted criteria, rollups, a
number a room can compare), the fixture concept, persona-first specs.
What we deliberately drop: the frontier driver and transcript judging —
the expensive parts, and the parts that measure the agent as much as the
product.

## What evalkit has today

- `tableread/`: scenes.json (26-scene worked example — cast, moment,
  fixture recipe, surfaces, intents {job, nextAction}, verbatim truths,
  crossTruths spanning two personas at one beat, hats, expectedFindings);
  recipes that build worlds via real forms; a runner that captures every
  persona's screens as marked-up visible text; a screenplay renderer.
- `goldfish/`: the cold reader (text or screenshot, novice/pro hats, four
  questions) and a grader comparing its answers to declared intents.
- `onboarding/`: a numbered artifact chain (00–08) with two human gates,
  agent-executable, modeled on an OOUX process chain.

## Rung 1 — deterministic fixtures (extend, don't change)

As today, plus:

- **Journey scoring.** A recipe run is already a capability test of every
  step in it; report it as one: steps completed / total, failing step
  named. A form change that breaks a recipe is the capability alarm.
- **Truth scoring.** Truths and crossTruths found / total, per scene, per
  act. Mechanical, no model.

## Rung 2 — goldfish-driven simulation (new)

`goldfish-walk <journey>`:

1. The fixture recipe builds the starting world (rung 1 machinery).
2. The goldfish gets: persona line, the journey's goal in the user's own
   words ("get your three helpers reading the pile"), and the first
   screen's capture. Never a route map, never product docs.
3. It answers the four questions. The runner takes its named next action,
   finds that control in the captured page (link or form), executes it
   with the existing form machinery, captures the resulting screen.
4. Repeat until a goal truth holds (mechanical check against page or DB),
   or the walk is stuck (see open questions), or a step budget runs out.
5. Output, per walk: **done** (goal reached; steps taken vs the scripted
   recipe's step count as par) and **found** (per-step grades: did it name
   the intended job and action; the confusion list at every step —
   diagnostics attached to the exact screen where the journey leaks).

Both hats walk separately where the scene declares the pro. Free-text
inputs (a proposal needs a title) come from the persona's own material,
declared in the journey spec, so invention is bounded.

## Scores

Two sbek-style score sets, never blended, at three levels (step, journey,
suite), each with weighted criteria owned by the scene author and ruled by
the operator at the screenplay gate:

- **CAPABILITY** — truths held, crossTruths held, journeys completed.
  Deterministic by construction.
- **UX** — the inverse of findability failure: every step where the
  goldfish named the intended job and action cleanly earns its weight;
  confusion, wrong turns, and wandering subtract. High UX score = a
  stranger moves through the product without friction.

**Variance is signal, by design (operator ruling).** Goldfish walks are
non-deterministic and stay that way: a suite run executes each walk N
times (default 3) and reports the UX score as a band (min, mean, max),
never a collapsed vote. A tight band means the screens produce the same
experience for every stranger; a wide band means the product is fragile —
sometimes findable is a finding, not noise. Band drift across product
versions is the regression alarm. CAPABILITY should not vary; if it does,
that is flake in the product or the fixture, and it is reported as its own
defect, never averaged away.

## Open questions (for external review)

1. **Stuck detection.** Same named action twice in a row? No progress in
   the capture diff? A step budget only? What is honest?
2. **Band mechanics.** Ruled: variance is signal; report bands over N
   runs, no majority vote. Open: what N gives stable bands at acceptable
   cost, and what band width should page a human?
3. **Destructive controls.** The goldfish may press delete/send. Staging
   absorbs it, but should walks carry a forbid-list, or is pressing the
   wrong dangerous control exactly the finding we want recorded?
4. **Par and the done-score.** Steps-vs-par penalizes exploration; is
   wandering-then-succeeding a pass, a partial, or diagnostics-only?
5. **Text vs pixels for driving.** Text captures are cheap and the form
   machinery needs DOM anyway; do screenshot-driven walks add enough
   (affordance blindness) to justify vision cost on every step, or stay a
   spot-check mode?
6. **Score shape.** Percentages per axis vs weighted points. What does a
   room of engineers comparing two products actually need?
7. **The grader's honesty.** The same small model family reads and grades;
   is self-agreement risk real, and is a rubric-constrained grade (strict
   JSON, quote-the-evidence) enough to keep it honest?
