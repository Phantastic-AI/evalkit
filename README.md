# evalkit

Test whether people can use your app, not only whether it works.

evalkit runs your product's user stories as repeatable scenarios against a
staging deployment and grades every screen twice:

- **Capability** — did the right facts appear. Checked mechanically:
  exact strings that must (or must not) be on the page, including facts
  that span two users' screens at the same moment.
- **Comprehension** — could a stranger tell what the screen is for and
  what to do next. Checked by a cold reader: a small model given a persona
  and zero product knowledge, whose answers are graded against the intent
  you declared for that screen.

The two scores are reported separately, always. A screen can work and be
unusable, or read clearly and be broken. Averaging them hides exactly what
you need to see.

## How it works

1. **Stories become scenes.** You write your product's user stories as a
   screenplay: one timeline, ordered scenes, each naming its cast, the
   moment ("the call closed an hour ago; Dana has never done this"), the
   screens to read, the intent (what the page is for, which control is the
   next action), and the checkable truths.
2. **Scenes become worlds.** An adapter drives your app's real forms on
   staging (sign up, create, submit, assign) to build each scene's state.
   No mocks, no database seeding: the world exists because the product's
   own front door built it.
3. **Worlds become captures.** The runner reads every character's screens
   as rendered text (links and buttons marked) and stores them beside the
   scene.
4. **Captures get graded.** Truths are checked by string match. Then the
   goldfish reads each capture cold, in persona, and answers four
   questions: What is this page for? What would you do next, and which
   control? What confused you? What were you never told? A second small
   call compares its answers to the scene's declared intent.

Rerun after any change. A scene that regresses names the screen, the
persona, and the confusion.

## Reader hats

- **novice** — has never done this job. Grades whether the product
  explains itself.
- **pro** — does this job professionally and names what is missing. Grades
  absence, which only expertise can see.

A small model is the right instrument here, not a compromise: a stronger
model figures the page out and defeats the test. One read costs a fraction
of a cent; a full five-act screenplay, every scene, both hats, costs about
a quarter.

## Use it on your app

Follow [onboarding/](onboarding/README.md) — a numbered artifact chain an
agent can execute end to end (gather inputs, write stories, build the
adapter, author scenes, run, grade). Start an agent with
[onboarding/STARTER_PROMPT.md](onboarding/STARTER_PROMPT.md).

Adapting evalkit means writing two things for your product: the primitives
file (how to drive your forms) and the recipes (which acts build which
scene). The scene format, runner, renderer, and reader never change.

## Layout

- `tableread/` — the engine: scene schema (`scenes.json`), fixture runner
  (`run-scene.mjs`), text capture, screenplay renderer, and a complete
  worked suite for [Fireside](https://github.com/Phantastic-AI/fireside)
  (26 scenes, five acts) as the reference example.
- `goldfish/` — the cold reader and grader (`goldfish.mjs`). Needs
  `ANTHROPIC_API_KEY`; reads a capture or a screenshot.
- `onboarding/` — the process for pointing all of this at your own app.

## Relation to capability harnesses

Harnesses like [sessionboard-eval-kit](https://forge.smol.ai/swyx/killmysaas-evals)
drive a frontier browser agent through whole journeys and judge the
transcript. They answer "can it be done" and pay frontier prices per step.
evalkit answers "can it be found" from pre-built moments at small-model
prices per screen. Run both: they measure different failures.

Born inside Fireside during the Kill-My-SaaS build, August 2026.
