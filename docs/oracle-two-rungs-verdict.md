My strongest recommendation: **keep the two-rung design, but stop treating a goldfish failure as automatically a product/screen failure.** Rung 2 needs a formal triage layer: **product UX leak vs fixture break vs action-resolver miss vs model idiosyncrasy vs unsafe-control trap**. Without that, the harness will produce confident-looking scores that send engineers fixing the wrong thing.

## Highest decision-impact recommendations

| Rank | Decision impact               | Recommendation                                                                                                                                                                                        |
| ---: | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Architecture-changing         | Add an **action safety policy** before allowing destructive/send/delete actions. Record dangerous attraction as a UX finding, but do not let it mutate shared staging or touch real external systems. |
|    2 | Architecture-changing         | Define **stuck detection as a state/action/progress classifier**, not one heuristic. Same action twice is not enough.                                                                                 |
|    3 | Architecture-changing         | Treat the action resolver as a first-class tested component. “Goldfish named action → runner finds control” is a major hidden harness surface.                                                        |
|    4 | Architecture-changing         | Separate driver and grader enough to avoid self-agreement. Strict JSON plus evidence quotes is necessary but not sufficient.                                                                          |
|    5 | Architecture / infra-changing | Clarify “no snapshot restore”: okay for canonical setup, dangerous if it prevents reproducible debug state or isolated repeated runs.                                                                 |
|    6 | Scoring-changing              | Remove step-vs-par from CAPABILITY. Wandering-then-succeeding is a capability pass and a UX penalty.                                                                                                  |
|    7 | Scoring / ops-changing        | Default N=5, not N=3, for scored UX bands; use N=3 only as a cheap dev smoke.                                                                                                                         |
|    8 | Scoring-changing              | Use weighted points internally, normalized 0–100 externally, with locked denominators and suite versions.                                                                                             |
|    9 | Ops-changing                  | Text/a11y-driven walks should be the default; screenshot/vision should be a targeted audit mode, not every-step default.                                                                              |
|   10 | Governance-changing           | Add suite coverage, rubric ownership, model-version pinning, and failure taxonomy before trusting product-to-product comparisons.                                                                     |

---

# 1. Stuck detection

**Recommendation:** use a composite stuck classifier with explicit reason codes.

Do **not** define stuck as “same named action twice” or “no capture diff.” Both are too crude. A user may legitimately press the same action repeatedly across different records, and a screen diff may change because of timestamps, loaders, ads, toasts, or async UI noise without actual progress.

Use these signals together:

| Stuck reason         | Concrete trigger                                                                    |
| -------------------- | ----------------------------------------------------------------------------------- |
| `repeated_noop`      | Same page-state signature + same action signature produces no progress twice.       |
| `loop`               | State sequence repeats, e.g. A→B→A or A→B→C→A, with no progress-truth improvement.  |
| `control_unresolved` | Goldfish names an action, but the runner cannot map it to a unique visible control. |
| `control_ambiguous`  | Multiple plausible controls match the action and none is clearly dominant.          |
| `explicit_confusion` | Goldfish says it does not know what to do, or gives no executable next action.      |
| `unsafe_trap`        | Goldfish selects a destructive/external action blocked by the safety policy.        |
| `budget_exhausted`   | Hard step budget reached.                                                           |

Define a **page-state signature** as something like:

```text
route + normalized visible/a11y text + role/name/control set + key entity IDs + form-state hash + goal/progress truth vector
```

Define an **action signature** as:

```text
role + accessible name + locator/control ID + normalized payload/action type
```

For budget, use the scripted par only as a calibration point:

```text
soft warning: after par + 2 steps with no progress-truth movement
hard budget: max(8, 2 * par + 2), with journey override for genuinely long flows
```

The important part is that “stuck” should not be a single failure. It should emit a classified diagnosis. A product team can act on `control_ambiguous`; a harness author must act on `control_unresolved`; a designer should act on `loop` or `explicit_confusion`.

---

# 2. Band mechanics

**Recommendation:** default to **N=5** for scored runs, **N=3** only for cheap dev smoke, and **N=10** for release candidates or high-risk journeys.

N=3 is too small for min/mean/max bands to be stable. With only three samples, the min and max are often artifacts of one weird run. Since the design intentionally treats variance as signal, the sample has to be large enough that the signal is not just sampler noise.

Concrete default:

| Mode                                  |  N | Use                                                                    |
| ------------------------------------- | -: | ---------------------------------------------------------------------- |
| Local/dev smoke                       |  3 | Fast feedback, not authoritative.                                      |
| Normal scored suite                   |  5 | Default CI/review readout.                                             |
| Release candidate / high-risk journey | 10 | Stronger signal before blocking or comparing products.                 |
| Adaptive rerun                        | +5 | Triggered when score is near a threshold or band is unexpectedly wide. |

Page a human when any of these happen:

```text
CAPABILITY:
- Any deterministic capability variance at all.
- Any critical journey fails.

UX:
- min UX < 70
- mean UX < 80
- max - min > 15 points
- max - min > 10 points for critical/high-traffic journeys
- band width widens by >10 points versus prior baseline under the same suite/model config
```

Also: compare bands only when these are pinned:

```text
suite version
journey spec version
fixture recipe version
model provider/model version
prompt version
temperature/sampler settings
browser/runtime version
product build/feature flags
N
```

A hidden issue: **min/max bands widen mechanically as N increases.** So do not compare an N=5 band to an N=10 band as if the width means the same thing. Either compare same-N runs, or report both the raw min/mean/max and a secondary stable statistic such as median/p10/p90 once N is large enough.

---

# 3. Destructive controls

**Recommendation:** do not use a simple forbid-list. Use a safety policy with action classes.

Pressing the wrong dangerous control is absolutely a finding. But executing it naively is how the harness corrupts staging, pollutes later runs, sends real emails, deletes shared entities, or trains engineers to distrust the suite.

Use this policy:

| Action class            | Harness behavior                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `safe`                  | Execute normally.                                                                                                |
| `contained_mutation`    | Execute only inside the run namespace/tenant; allow undo/tombstone.                                              |
| `destructive_contained` | Execute only if the target entity belongs to this run and can be restored or discarded.                          |
| `external_side_effect`  | Route to sink/mock: email, SMS, webhook, payment, calendar invite, third-party API. Record the attempted action. |
| `credential/security`   | Trap; record as dangerous attraction; do not execute.                                                            |
| `unknown_risky`         | Trap by default until classified.                                                                                |

For delete/send flows, the ideal behavior is:

1. Goldfish clicks the dangerous control.
2. Harness records: “dangerous control attracted user here.”
3. If the product shows a confirmation screen, let the goldfish interact with the confirmation **inside a contained run namespace**.
4. If it confirms, that is a stronger UX/safety finding.
5. No real external side effect occurs.

This preserves the signal without allowing the harness to become a staging vandal.

Also, “real flows” should mean **real product UI and app code**, not real-world providers. Emails, SMS, payments, CRM writes, calendar invites, and webhooks should go to test sinks.

---

# 4. Par and done-score

**Recommendation:** make `done` binary for CAPABILITY and move over-par behavior into UX diagnostics.

A journey that eventually reaches the mechanical goal truth before budget should be a **CAPABILITY pass**. Do not discount capability because the path was inefficient. Otherwise the score confuses two different claims:

```text
Can the product state be reached?
Can a stranger find the path cleanly?
```

Use this shape:

```text
CAPABILITY:
- done = 1 if goal truth holds before hard budget
- done = 0 otherwise
- steps-vs-par is not part of CAPABILITY

UX:
- wrong turns, confusion, loops, ambiguous controls, and unnecessary detours lose points
- steps-vs-par appears as route efficiency / directness
```

Concrete rule:

| Outcome                                             |                                                    CAPABILITY | UX treatment                                         |
| --------------------------------------------------- | ------------------------------------------------------------: | ---------------------------------------------------- |
| Direct success                                      |                                                          Pass | Full possible UX, subject to per-step comprehension. |
| Wandering then success                              |                                                          Pass | Partial UX; wrong turns and confusion count.         |
| Random/lucky success                                |                                                          Pass | Low UX; diagnostics show non-findable route.         |
| Reaches goal after hard budget                      |                                                          Fail | Stuck/budget failure.                                |
| Cannot reach goal because control/form breaks       |                                                          Fail | Capability defect, not UX.                           |
| Cannot reach goal because goldfish cannot find path | Capability via Rung 1 still matters; Rung 2 fails findability | UX/findability defect or harness/model triage.       |

I would add a UX cap to prevent “eventual success” from looking too good:

```text
completed within <= 1.5x par: no automatic cap
completed within > 1.5x par: UX capped at 80
completed within > 2x par: UX capped at 60
completed only through loop/random exploration: UX capped at 50
```

The exact numbers can be tuned, but the principle matters: **success after wandering is not a capability failure; it is a findability failure.**

---

# 5. Text vs pixels for driving

**Recommendation:** default to text/a11y/DOM driving, but always capture screenshots and run targeted vision audits.

Do **not** pay vision cost on every step by default. The runner ultimately has to execute DOM controls, and the deterministic form machinery needs reliable locators. Text/a11y captures are cheaper, easier to diff, easier to grade, and easier to reproduce.

But pure text capture will miss important UX failures:

```text
bad visual hierarchy
button looks disabled but is clickable
primary CTA is visually buried
dangerous control is too prominent
layout pushes next action below the fold
modal/backdrop confusion
color/spacing/icon-only affordance problems
```

Concrete mode split:

| Mode                          | Default? | Purpose                                                                              |
| ----------------------------- | -------: | ------------------------------------------------------------------------------------ |
| Text/a11y/DOM walk            |      Yes | Main scored journey driver.                                                          |
| Screenshot capture every step |      Yes | Evidence/debugging, not necessarily vision-graded.                                   |
| Screenshot/vision-driven walk |       No | Spot-check visual affordance.                                                        |
| Vision audit trigger          |      Yes | Run when screen changed, UX band widened, text walk failed oddly, or before release. |

For implementation, do not feed the goldfish only raw visible text. Feed a structured screen packet:

```json
{
  "visible_text": "...",
  "controls": [
    {"role": "button", "name": "Invite helpers", "state": "enabled", "bounds": "..."},
    {"role": "link", "name": "Delete pile", "state": "enabled", "bounds": "..."}
  ],
  "headings": ["..."],
  "form_fields": ["..."],
  "current_url_or_route": "...",
  "screenshot_ref": "..."
}
```

That gives the small model a novice-readable representation while keeping execution grounded in the DOM.

---

# 6. Score shape

**Recommendation:** author weights as points; report normalized 0–100 per axis, with raw points and locked denominator visible.

A room of engineers comparing two products does not need only percentages, and it does not need only raw weighted points. It needs:

```text
Did anything critical break?
Which journey leaked?
Which screen caused the loss?
Was the regression capability or UX?
Is the denominator the same as last time?
```

Use this shape:

```text
CAPABILITY: 0–100 normalized score + raw counts
- truths held / total
- crossTruths held / total
- journeys completed / total
- critical blockers named separately

UX: 0–100 normalized band
- min / mean / max
- per-journey band
- per-screen losses
- confusion taxonomy
```

But internally keep weighted points:

```text
criterion_points_earned / criterion_points_possible
```

Critical rule: **lock the denominator by suite version.** If you add three new journeys and the score drops, that is not necessarily a product regression. It may be coverage expansion. So every readout should include:

```text
suite_version
rubric_version
coverage_version
denominator
```

Also add hard gates. A product with 94% suite capability but a broken critical journey should not be called healthy.

Example gates:

```text
BLOCK:
- any critical CAPABILITY journey fails
- any external side-effect escapes containment
- any fixture capability flakes

REVIEW:
- UX mean < 80
- UX min < 70
- UX band width > 15
- critical journey width > 10

PASS:
- capability criticals pass
- UX bands inside thresholds
- no unclassified harness failures
```

---

# 7. Grader honesty

**Recommendation:** self-agreement risk is real. Strict JSON and evidence quotes help, but they are not enough.

The danger is not only hallucination. The danger is that the same small-model family may share the same blind spots twice:

```text
driver misreads screen
grader agrees that the misread was reasonable
score looks objective
team fixes wrong thing or misses real issue
```

Use a layered grading design:

| Layer                    | Preferred mechanism                                                               |
| ------------------------ | --------------------------------------------------------------------------------- |
| Goal reached             | Mechanical DB/page truth. No model.                                               |
| Control selected         | Deterministic locator/control ID comparison.                                      |
| Intended action match    | Canonical label + synonym set + rubric matcher.                                   |
| Job/action comprehension | Separate verifier, ideally different model family or deterministic matcher first. |
| Ambiguous cases          | Human-review queue or operator gate.                                              |

Minimum honest grader contract:

```text
- grader model/version pinned
- temperature 0
- strict JSON
- must quote exact screen evidence
- must cite selected control ID or visible control label
- must choose from declared canonical labels where possible
- must output "ambiguous" instead of forcing pass/fail
- raw driver answer stored for later regrading
```

For release-quality scoring, I would not use the same model invocation or same stochastic sample to both drive and grade. Acceptable options:

```text
best: deterministic/rule grader wherever possible
good: different small model family as verifier
acceptable for dev: same family, separate prompt, temp 0, evidence quote, human spot checks
not acceptable for scored release: same model family, same loose rubric, no calibration set
```

Add a small calibration set of human-labeled screens. Before trusting the UX score, measure whether the grader overcredits, undercredits, or collapses ambiguity into passes.

---

# Critique of the RULED decisions

## A. Goldfish-only driver

**Keep the principle, soften the absolutism.**

The good ruling: a frontier model can make a bad product look usable. A strong agent has unnatural patience, search skill, and product-inference ability. It is a bad proxy for a cold user.

Hidden flaws:

1. **A single goldfish is not “the user.”**
   It is one model’s cognitive style. It may be worse than humans at visual hierarchy, better than humans at scanning dense text, more literal than humans, and weirdly patient in places humans would quit.

2. **Goldfish failure does not automatically mean the screen is wrong.**
   It may mean the persona was underspecified, the fixture is wrong, the action resolver failed, the control labels are missing from capture, the model version shifted, or the journey spec’s intended action is too narrow.

3. **Goldfish success does not prove broad findability.**
   It proves this proxy, under this capture format, with this prompt and sampler, reached the goal.

4. **You lose a useful diagnostic ceiling.**
   A frontier driver should not be the scored user proxy, but it can be useful as a non-scoring differential debug tool: “Can any agent find the route through this UI?” If goldfish fails and scripted Rung 1 passes, the issue is likely findability. If both goldfish and a stronger diagnostic driver fail, the issue may be action resolver, fixture, or product breakage.

Decision change I would make:

```text
Goldfish-only for scored UX.
No frontier score.
Optional strong-driver diagnostic lane, never included in suite score.
Multiple goldfish variants/hats over time, pinned and calibrated.
```

## B. Variance-as-signal bands

**Correct instinct, but min/mean/max can lie unless the run contract is pinned.**

The good ruling: variance should not be averaged away. “Sometimes findable” is a real UX defect.

Hidden flaws:

1. **N=3 bands are unstable.**
   A single odd run dominates min/max.

2. **Band width can come from non-UX causes.**
   Async loading, fixture pollution, stale sessions, model provider drift, action resolver ambiguity, network timing, or data race can all masquerade as UX fragility.

3. **Min/max depends on N.**
   Increasing N can widen the band even when the product did not change.

4. **Model drift can look like product drift.**
   If the provider silently changes the model, your UX regression alarm becomes untrustworthy.

Decision change I would make:

```text
Variance is signal only after classifying non-product variance.
Pin model/sampler/suite versions.
Use N=5 scored default.
Use same-N paired comparisons across product versions.
Report run-level reason codes, not only bands.
```

## C. No snapshot restore

**Keep “no snapshot as canonical setup,” but do not ban state capture for isolation and reproduction.**

The good ruling: fixtures created through real flows catch breakage that a preserved DB state would hide.

Hidden flaws:

1. **It conflicts with repeated stochastic walks.**
   If every UX sample needs a full rebuild through real flows, N=5 or N=10 becomes expensive. If you reuse state instead, goldfish runs contaminate each other.

2. **It makes failures harder to reproduce.**
   A late failure after a long setup chain should have a state capsule, run namespace, trace, or artifact bundle. Otherwise engineers will rerun the whole world and hope it fails again.

3. **It may under-test legacy/imported states.**
   “Only state the current product can produce” is clean, but real products often have migrated, imported, or grandfathered states that users still encounter.

Decision change I would make:

```text
Canonical scored setup: rebuild through real flows.
Each walk repeat: isolated run namespace/tenant/user set.
Debugging: allow captured state artifact/trace after failure.
Never use snapshots as the source of truth for scored setup unless explicitly marked as migrated-state coverage.
```

That preserves the philosophical ruling while avoiding operational pain.

## D. Two weighted score sets

**Good separation, but the scoring governance is underdesigned.**

The good ruling: CAPABILITY and UX should not be blended. A product can be technically capable and hard to use, or findable up to a broken backend boundary.

Hidden flaws:

1. **Weights can drift or get gamed.**
   If scene authors own weights without strong versioning/review, scores become editorial.

2. **Suite scores can hide critical failures.**
   A high weighted score can mask one broken critical journey.

3. **Denominator changes will be misread as product changes.**
   Adding tests, changing weights, or splitting criteria changes the score even if the product is identical.

4. **UX scoring for unreached downstream steps is ambiguous.**
   If the goldfish gets stuck early, are later steps zero, unobserved, or excluded? This must be explicit.

Decision change I would make:

```text
Separate axes stay.
Weights are suite-versioned and operator-approved.
Critical gates override aggregate scores.
Unobserved downstream UX is marked unobserved, not silently passed.
Suite comparison requires same rubric/suite denominator.
```

---

# Important missing decisions

## 1. The action resolver contract

This is the largest unstated implementation risk.

The spec depends on this chain:

```text
goldfish names next action → runner maps that to a control → runner executes it
```

That mapping can fail independently of UX. You need a resolver spec:

```text
input: goldfish action JSON
candidate controls: role/name/label/bounds/form context
resolution policy: exact > synonym > semantic > ambiguous
output: selected control ID or ambiguity reason
failure classes: no_match, multi_match, hidden_control, disabled_control, unsafe_control
```

Also test the resolver separately with deterministic fixtures. Otherwise the harness will label resolver failures as product UX failures.

## 2. Run isolation

Every walk should have its own namespace:

```text
run_id
tenant/workspace
persona users
emails/domains
fixture entities
external sink addresses
created object IDs
cleanup/tombstone policy
```

This matters more once N>1. Without isolation, run 2 is not testing the same starting world as run 1.

## 3. Failure taxonomy

Do not output only pass/fail/score. Every failure should be typed:

```text
product_capability_defect
product_findability_defect
fixture_recipe_defect
action_resolver_defect
grader_ambiguity
model_proxy_limitation
unsafe_control_attraction
staging_infra_flake
external_sink_failure
```

This prevents the team from turning every red run into a design bug.

## 4. Model and prompt versioning

A score is meaningless without these attached:

```text
driver model
grader model
prompt version
persona version
temperature/sampler
capture format version
rubric version
suite version
product build
feature flags
browser/runtime
```

This is especially important because band drift is supposed to be a regression alarm.

## 5. Coverage map

Before comparing products or versions, define what the suite covers:

```text
personas
hats
journeys
objects
permissions/roles
happy paths
edge paths
destructive paths
cross-persona truths
mobile/desktop, if relevant
```

A 92% score over thin coverage is not better than an 82% score over meaningful coverage.

## 6. External side-effect containment

The spec should explicitly say:

```text
No real email/SMS/payment/webhook/calendar/CRM/provider side effects in scored runs.
All external effects route to deterministic sinks.
Escapes are BLOCK-level harness/product defects.
```

This is separate from whether the product UI path is real.

## 7. Human review loop

Define when the operator reviews:

```text
new journey added
rubric/weight changed
wide UX band
grader ambiguity
unsafe-control attraction
capability flake
new screen with no baseline
```

Otherwise the “operator-ruled” parts become informal and non-reproducible.

## 8. Mobile/responsive mode

If real users use the product on different screen sizes, this matters. Text capture alone will not catch responsive layout failures. Even one mobile viewport lane for critical journeys may expose different findability defects.

## 9. Accessibility as a deliberate signal

If the main capture is a11y/DOM, then missing accessible names, bad roles, disabled states, and unlabeled icon buttons will directly hurt findability. That is good, but it should be explicit. Otherwise engineers may argue the harness is “not seeing” what a sighted user sees.

## 10. Score lifecycle

Add rules for when scores are comparable:

```text
same suite version: comparable
same rubric but added journey: comparable only within old subset
changed weights: not directly comparable
changed model: calibration required
changed capture format: calibration required
```

---

# Build order I would use

1. **Run namespace + side-effect sinks + action safety policy.**
   Without this, stochastic walks will corrupt state or produce unsafe behavior.

2. **Action resolver contract and tests.**
   This is the hidden engine of Rung 2.

3. **Stuck classifier with reason codes.**
   Do not wait until runs are flaky to design this.

4. **Mechanical progress/goal truth layer.**
   Needed before UX scoring is trustworthy.

5. **Grader separation and calibration set.**
   Prevent self-agreement from becoming fake objectivity.

6. **N=5 band reporting with pinned run config.**
   Make variance useful rather than noisy.

7. **Scorecard/versioning/coverage governance.**
   Necessary before the numbers are shown to a room as product evidence.

The core design is good, but the main thing I would change before implementation is this: **make Rung 2 a findability simulator with rigorous failure attribution, not a goldfish oracle.**
