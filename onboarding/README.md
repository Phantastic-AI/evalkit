# Onboarding: point evalkit at your app

A numbered artifact chain. Each step produces one file in YOUR product
repo under `docs/evalkit/`, named exactly as below. Do the steps in order;
a step's output is the next step's input. An agent runs this end to end;
a human rules where marked. Kick off with
[STARTER_PROMPT.md](STARTER_PROMPT.md).

## Prerequisites

- A staging deployment of your app that test data may be created on, with
  form-based flows reachable over HTTP. Production is never touched.
- Sign-in that a script can complete (a printed/emailed magic link, a test
  password, or an equivalent your staging exposes).
- Node 20+. An Anthropic API key for the goldfish step.

## The chain

**00-input-manifest.md** — What the product is, in its own documents.
List, with one line each on its authority: the requirements or spec, the
route map or nav structure, existing user research, the staging URL, the
test-identity policy (what addresses are safe to invent). Rule of the
step: every later claim about the product must trace to something listed
here or to the running app itself.

**01-roles-and-stories.md** — Who uses the product and what they are
trying to do. For each role: 3 to 6 stories in the form "who; what just
happened; what they want; why". Include the story that precedes product
knowledge (the person who does not yet know the feature exists) and the
unhappy stories (lost password, wrong email, expired link, the mistyped
form). HUMAN RULES HERE: the operator confirms, adds, or strikes stories
before the chain continues.

**02-stations.md** — Each story broken into stations: concrete moments
with a buildable world state. Per station: person, moment, the numbered
real-flow steps that would build it on staging (name real forms and
fields by reading the code or the pages, never invent), the screens each
persona would read, and the facts a read must confirm. A station whose
fixture cannot be built through the real screens is recorded with the reason
— that is a finding about the product, not a gap in the doc.

**03-adapter.md + primitives** — The adapter plan, then the code: copy
`tableread/primitives.mjs` as the model and rewrite it for your product's
forms (sign-up, sign-in, create, submit, act). Each primitive is verified
against the running staging app before the next is written. Output: the
plan doc listing each primitive with the route and fields it drives, plus
the working `primitives.mjs` in your suite directory.

**04-smoke-recipe** — One recipe that builds the simplest interesting
station end to end and captures one screen. It must run clean against
staging before anything else is authored. Fix the adapter, not the app,
until it does. Generated fixture content must sound real: a cold reader
spends its confusion on content that admits it is synthetic.

**05-scenes.json** — Stations become scenes in the screenplay schema
(see `tableread/scenes.json` for a complete worked example): id, act,
cast, moment, direction, fixtureRecipe, surfaces, intents (job + the next
action's visible control name), truths (verbatim strings), crossTruths
(facts spanning two personas' screens at one beat), hats, expectedFindings
(diseases you already suspect — a scene is allowed to exist to prove an
absence). Render with `render-screenplay.mjs` and read the result as a
story; if it does not read as one, the scenes are wrong, not the renderer.
HUMAN RULES HERE: the operator reads the screenplay before any grading.

**06-capture-run.md** — Run every scene's recipe; store captures; check
truths. Record per scene: built or failed, truths found or missing, and
every fixture bug fixed along the way. Missing truths are either product
bugs or wrong scenes; decide which, in writing, per miss.

**07-goldfish-pass.md** — Run the cold reader over every capture, novice
hat first, pro hat where the scene declares it. Record verbatim answers
and the grade (job found, action found) per scene. Findings go beside the
scene they came from, quoted, not summarized.

**08-findings-and-ratchet.md** — The two scorecards (capability,
comprehension — never one number), the ranked findings, and the standing
instruction: rerun 06+07 after any change to a surface a scene reads; a
regressed scene blocks the change until a human rules otherwise.

## Laws

- Staging only. Invented identities only, stamped per run.
- Fixture worlds carry a grep-able slug prefix so cleanup is safe.
- Worlds are built once and played in; scenarios start from stations,
  never from an empty database.
- The goldfish gets nothing beyond the persona line, and reads pixels at
  a declared viewport — never a DOM or text dump.
- Ghosts (vocabulary for unbuilt features) are graded as expected
  absences, never claimed as features.
- The two grades are never averaged.
