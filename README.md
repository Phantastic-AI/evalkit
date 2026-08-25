# evalkit

Two instruments, one question: not "can the software do it?" but "can a
person find it?"

- **tableread/** — user stories as a screenplay of scenes; fixtures built
  through the product's own front door on a staging deployment; every
  character's screen captured at every beat; mechanical truths checked.
- **goldfish/** — a cold reader: a small model with deliberately no product
  knowledge reads each captured screen in persona (novice or pro) and is
  graded against the scene's declared intent. Its ignorance is the
  instrument.

Every scene gets two scores, never blended: **capability** (the truths came
out true) and **comprehension** (a stranger could tell what the page is for
and what to do next). A product can pass one and fail the other; that
distinction is the reason this kit exists.

Adapting to a new product means rewriting `tableread/primitives.mjs` and
the recipes — the scene format, runner, renderer and reader are generic.

Complementary to capability harnesses (e.g. sessionboard-eval-kit, which
drives a frontier browser agent through journeys and judges the transcript):
those measure whether journeys can be completed; evalkit measures whether
screens explain themselves, at roughly a thousandth of the cost per read.

Born inside Fireside during the Kill-My-SaaS build, 2026-08.
