# tableread

A table read for software: user stories become fixtures, fixtures become
worlds, and a cold reader walks every screen before an audience does.

Where capability harnesses ask "can it be done?", tableread asks "can it be
found?" — a product can pass the first and fail the second, and the whole
point is never averaging the two away.

## Shape

- `scenes.json` — the source of truth: one conference, one timeline, five
  acts, every scene carrying its cast, fixture recipe, surfaces, intents,
  truths (mechanical, capability), crossTruths (facts spanning two personas'
  screens at one beat), and expected findings.
- `render-screenplay.mjs` — renders scenes into `SCREENPLAY.md`, the
  human-readable script. Generated; never hand-edited.
- `run-scene.mjs` / `run-station.mjs` — build a scene's world through the
  product's own real screens (against a staging deployment), capture every
  persona's surfaces as visible text, check the verbatim truths.
- `primitives.mjs` + `recipes/` — the product adapter (currently: Fireside)
  and the fixture scripts. Adapting tableread to another product means
  rewriting these two, nothing else. The adapter exports `createWorld`
  (legacy name `createSagaWorld` accepted).
- `--adapter=<dir>` (both runners; env `TABLEREAD_ADAPTER` also works) points
  at another product's adapter directory — its own `primitives.mjs`,
  `recipes/`, and `scenes.json` — instead of the built-in Fireside one.
  Example: `node run-scene.mjs --adapter=/path/to/superpowers-app/evals <scene-id>`.
  Omit it and behavior is unchanged: the built-in Fireside adapter, as before.
- Comprehension grading — the goldfish — lives in its own repo (`goldfish`):
  a calibrated-ignorant small model reads each captured surface cold and is
  graded against the scene's declared intents.

## Laws

Fixtures run against staging only, with invented identities, on
conferences slugged `saga-*`. Capability and comprehension are always two
scores, never one. A ghost (vocabulary for an unbuilt feature) is graded as
an expected absence, never claimed. See the source product's
`docs/sagas/README.md` for the long form.

Born inside [Fireside](https://github.com/Phantastic-AI/fireside) during
the Kill-My-SaaS build, 2026-08.
