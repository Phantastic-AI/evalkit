# Starter prompt

Give an agent this, filled in:

---

You are onboarding evalkit onto our product. evalkit tests whether a
stranger can use each screen, separately from whether the screen works.
Read these completely before doing anything:

1. `<evalkit>/README.md` — what the kit is.
2. `<evalkit>/onboarding/README.md` — the artifact chain you will execute.
3. `<evalkit>/tableread/scenes.json` and `SCREENPLAY.md` — a complete
   worked example for another product; the shape you are producing.

Our product: <one paragraph — what it is, who uses it>.
Staging URL: <url>. It is safe to create test data there; production is
<url or "not your concern"> and you never touch it.
Sign-in works by: <mechanism a script can complete>.
Safe invented identities: <e.g. anything @example.org>.
Code lives at: <path>. Read routes and templates there to ground every
claim about forms and fields; never invent a control.

Execute the chain in order, one artifact per step, into `docs/evalkit/`
in our repo. Stop and ask the operator at the two HUMAN RULES steps
(01 and 05). At step 03 onward you will also write code into
`<evalkit>/suites/<our-product>/`. Verify every primitive against staging
before writing the next. Report at the end of each step: what you
produced, what you could not ground, and what the next step needs.

The laws in onboarding/README.md bind throughout. When a fixture cannot
be built or a truth comes out false, that is a finding to record, not an
obstacle to code around.

---
