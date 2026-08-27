# evalkit spec: two rungs, one driver

2026-08-26. Operator-ruled; external (Oracle) review folded. Status: building.

## Goals

Two test types, both running fixtures on a staging deployment through the product's real
sign-up, forms, and flows — the same path a user takes:

1. **Deterministic fixtures** — scripted world-building plus mechanical
   truth checks. Exists today; gains journey scoring.
2. **Interactive simulations** — a goldfish-driven walk of a journey,
   producing BOTH scores from one run: "can it be done" (the walk reached
   its goal) and "can it be found" (per-step comprehension, graded).

The goldfish (a small model wearing a persona, given zero product
knowledge) drives everything scored. There is no frontier-model score
anywhere: a strong model completing a journey is a meaningless signal,
because the user is not a strong model with the whole product in mind. If
the goldfish can complete it, it is both doable and findable. If it
cannot, the harness first decides *why* (see failure taxonomy) — and when
the answer is the product, the screen gets fixed. The model does not get
bigger.

Out of scope, ruled: CI export (ripping recipes to Playwright tests —
later, maybe), standalone smoke suites, snapshot/restore as fixture setup
(worlds are built through the real flows, never restored from a database
image, so a fixture can never preserve a state the product can no longer
produce — but a world is built once and *played in*, see isolation; every
scenario does not start from zero).

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
  persona's screens; a screenplay renderer.
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
  act. Mechanical, no model. Text is the right medium here: string checks
  against rendered pages, free, deterministic.

## Rung 2 — goldfish-driven simulation (new)

### Eyes and hands (ruled)

The goldfish's eyes are **screenshots at the lane's viewport**, never a
text or DOM dump. Ruled reversal of the text-first default: a text capture
lists every control on the page including everything below the fold — a
route map no human gets — and makes the reader superhuman when the app is
a GUI. Viewport and positioning are everything. Consequences:

- Scrolling is an action the goldfish must choose like any other; a
  control below the fold has to be *found*, which is exactly the signal.
- The DOM never reaches the goldfish. It stays as the runner's hands
  (resolving and executing the control the goldfish names) and as the
  mechanical truth layer.
- Vision tokens cost more than text; still small-model priced. Cost is
  controlled by lanes, not by leaking text to the reader.

### Viewport lanes (ruled)

- **desktop** — the default; every walk runs here.
- **mobile** — critical journeys; hides everything, tests hierarchy.
- **iPad** — optional lane.
- **superwide** — optional lane; the opposite failure mode from mobile:
  nothing hides, but stretch diseases show — full-width text lines,
  controls drifting to far corners, empty middles.

### The walk loop

`goldfish-walk <journey> [--lane <viewport>]`:

1. The walk starts from a station in an already-built world (rung 1
   machinery; backbone worlds are built once per suite run and shared —
   see isolation). Only the walk's own slice is fresh.
2. The goldfish gets: persona line, the journey's goal in the user's own
   words ("get your three helpers reading the pile"), and a screenshot of
   the first screen at the lane's viewport. Never a route map, never
   product docs.
3. It answers the four questions. The action resolver maps its named next
   action to a real control; the runner executes it with the existing form
   machinery (or scrolls, if that is the named action) and screenshots the
   result.
4. Repeat until a goal truth holds (mechanical check against page or DB),
   the stuck classifier fires, or the step budget runs out.
5. Output, per walk: **done** (goal reached — binary) and **found**
   (per-step grades: did it name the intended job and action; the
   confusion list at every step — diagnostics attached to the exact screen
   where the journey leaks), plus the walk's failure type if it failed.

Both hats walk separately where the scene declares the pro. Free-text
inputs (a proposal needs a title) come from the persona's own material,
declared in the journey spec, so invention is bounded.

### The action resolver (first-class component)

The goldfish-names-action → runner-finds-control mapping fails
independently of UX and must never be scored as product confusion.
Contract:

- input: the goldfish's named action (free text + any quoted control name)
- candidates: controls from the DOM — role, name, label, bounds, form
  context
- policy: exact match > synonym > semantic > ambiguous
- output: a control ID, or an ambiguity reason
- failure classes: `no_match`, `multi_match`, `hidden_control` (exists but
  off-viewport or display:none), `disabled_control`, `unsafe_control`

The resolver is tested separately, offline, against stored pages with
known controls. A resolver failure types the run
`action_resolver_defect`, never a product defect.

### Stuck classifier

Not one heuristic — a classifier with reason codes, each itself a finding:

`repeated_noop` (same action, no page change), `loop` (page-state cycle),
`control_unresolved`, `control_ambiguous`, `explicit_confusion` (the
goldfish says it is lost), `unsafe_trap` (only unsafe controls remain),
`budget_exhausted`.

Detection uses page-state signatures (route + visible-control set) and
action signatures across steps.

### Safety policy

Actions classed: `safe`, `contained_mutation`, `destructive_contained`,
`external_side_effect`, `credential`, `unknown_risky`.

- Pressing delete/send *inside the fixture world* is allowed and
  recorded — attraction to the dangerous control is the finding, and
  staging absorbs the press.
- External side effects (real email, webhooks, payments, calendars) route
  to deterministic sinks. An escape is a BLOCK-level harness defect,
  regardless of scores.
- Credential and unknown-risky controls are never pressed; the attraction
  is recorded.

### Worlds and isolation (ruled)

Every scenario does not start from zero. Two layers:

- **The backbone world** — built once per suite run, through real flows
  (the reference suite builds five worlds for 26 scenes). A real user
  arrives at a product that already has history; walks start from a
  station in that world, not from an empty database. Building the
  backbone is itself Rung 1's capability test.
- **The walk's slice** — each of the N repeats gets its own stamped
  mutable slice: its own persona sign-in, its own target objects where
  the walk creates or mutates (own submissions dealt, own group, own
  decisions), invented emails, sink addresses, grep-able slug prefix for
  teardown. The backbone is read-shared; nothing a walk mutates is shared
  with the next walk — otherwise the band measures contamination, not
  variance.

A full backbone rebuild happens per suite run (or when a recipe change
demands it), never per walk repeat.

### Debug capsules (ruled)

After a failure, the harness may save state artifacts and the step trace
so an engineer can reproduce without rebuilding the whole world and hoping
it fails again. Capsules are never fixture setup. Scored setup is
real-flows-only, always.

### Diagnostic lane (ruled)

On goldfish failure only, an unscored strong-driver attempt may run as a
differential: strong model succeeds → findability leak; both fail →
breakage, fixture, or resolver. Never in any score, never run on passing
walks.

## Scores

Two sbek-style score sets, never blended, at three levels (step, journey,
suite), each with weighted criteria owned by the scene author and ruled by
the operator at the screenplay gate:

- **CAPABILITY** — truths held, crossTruths held, journeys completed.
  Deterministic by construction. **Done is binary** — wandering then
  succeeding is a pass here; par lives in UX only. CAPABILITY must not
  vary across the N walks; if it does, that is flake in the product or the
  fixture, reported as its own defect, never averaged away.
- **UX** — the inverse of findability failure: every step where the
  goldfish named the intended job and action cleanly earns its weight;
  confusion, wrong turns, and wandering subtract. Wandering caps (par =
  the scripted recipe's step count): a walk over ~1.5× par caps that
  journey's UX at 80; over 2× at 60; a loop or random-walk finish at 50.
  Steps the walk never reached are marked **unobserved**, not passed.

### Bands (ruled)

Goldfish walks are non-deterministic and stay that way — "sometimes
findable" is a finding, not noise. A scored suite run executes each walk N
times and reports **percentile bands: p10 / median / p90** (min/max widen
with N purely by sampling, which fakes regressions; percentiles stay
stable). Band drift across product versions under the same suite stamp is
the regression alarm.

**N is a ladder (ruled):** N=1–2 while the suite is being shaken out —
most reds are harness bugs then, and repeating a broken walk pays five
times to learn one bug. Once a full pass runs dry (every fixture builds;
every failure types as a product reason), N=5 is the scored default; N=10
for release scorecards. Every scorecard prints its ladder rung; a dry-run
number is never quoted as a scored one.

Paging thresholds at N≥5: UX median < 80, p10 < 70, or band width > 15.

### Suite stamp (ruled)

The runner computes a content hash over scenes.json + weights + prompt
files + capture-format version at run start, and prints it on the
scorecard beside model IDs, persona versions, and denominators. No one
bumps it; changing a weight changes it by construction. Scores are
comparable only under the same stamp; a score without its stamp is an
anecdote. An optional human label may ride along.

### Hard gates

A pretty aggregate never overrides a broken critical journey:

- **BLOCK** — any critical CAPABILITY journey fails; any external side
  effect escapes containment; any fixture flakes.
- **REVIEW** — UX median < 80, p10 < 70, band > 15, or unclassified
  harness failures.
- **PASS** — everything else.

### Failure taxonomy

Every red run is typed before it is scored, so the team does not turn
every red into a design bug:

`product_capability_defect`, `product_findability_defect`,
`fixture_recipe_defect`, `action_resolver_defect`, `grader_ambiguity`,
`model_proxy_limitation`, `unsafe_control_attraction`,
`staging_infra_flake`, `external_sink_failure`.

## Grader honesty (layered)

The same small-model family reading and grading can share one blind spot
twice. Layers, cheapest and most honest first:

1. **Goal reached** — mechanical DB/page truth. No model.
2. **Control selected** — deterministic control-ID comparison. No model.
3. **Intended action match** — canonical label + synonym set. No model
   where possible.
4. **Job/action comprehension** — the only model grade: pinned model,
   temperature 0, strict JSON, must quote screen evidence, must answer
   "ambiguous" rather than force pass/fail. Raw goldfish answers stored
   for later regrading.

Release-grade (deferred): a different-family verifier for layer 4 and a
small human-labeled calibration set to measure grader drift.

## Deferred, ruled

- Different-family verifier + calibration set (release-grade, later).
- Formal human-review trigger list (the operator gates informally today:
  story gate, screenplay gate, WALK-AGENDA rulings).
- CI export, standalone smokes (ruled out at scoping).

## Build order (Oracle's, adopted)

1. Run isolation + side-effect sinks + action safety policy.
2. Action resolver contract + offline tests.
3. Stuck classifier with reason codes.
4. Mechanical progress/goal truth layer.
5. Grader separation (layers 1–3 mechanical, layer 4 pinned).
6. N-ladder band reporting with the suite stamp.
7. Scorecard/coverage governance.

## Ruling log

- 2026-08-26 — pixels-as-eyes: goldfish drives from screenshots at a
  fixed viewport; text capture rejected as superhuman ("viewport and
  positioning are everything"). DOM stays as hands + truth layer.
- 2026-08-26 — viewport lanes: desktop default, mobile critical, iPad
  optional, superwide optional.
- 2026-08-26 — N ladder: 1–2 dry-run → 5 scored → 10 release; percentile
  bands p10/median/p90.
- 2026-08-26 — diagnostic strong-driver lane accepted, unscored,
  failure-triggered only.
- 2026-08-26 — debug capsules accepted, repro only, never setup.
- 2026-08-26 — suite stamp accepted as an automatic content hash; no
  manual bumping.
- 2026-08-26 — worlds are built once and played in; every scenario does
  not start from zero. Isolation is slice-scoped (per-walk mutable slice),
  not world-scoped; backbone rebuild is per suite run, never per repeat.
- 2026-08-26 — from the first live walk: par is measured against resolved
  control presses, never raw decision count. Scrolling a long page is how
  reading works, not wandering; an honest 1-press CFP submit took 3
  decisions (2 scrolls) and must score clean.
- (earlier) — two score sets CAPABILITY/UX never blended; variance is
  signal; no frontier score; fixtures on staging through real flows only.
