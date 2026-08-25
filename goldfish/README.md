# goldfish

A cold reader for user interfaces. Small model, empty memory, honest
confusion — the limitations are the measurement instrument.

Give it a screen (extracted text or a screenshot) and a persona line, and it
answers four questions with no product knowledge at all:

1. What is this page for, in one sentence?
2. What would you do next, and which control would you press?
3. What confused you, in the order you hit it?
4. What did the page never tell you that you needed to know?

Then its answers are graded against the screen's declared intent — the job
the page is for, the control that is the next action. Reader found both:
comprehension passes. Anything else: the confusion list is the diagnosis.

## Why a small model

A frontier model defeats the test by figuring the page out. The goldfish
needs to be ignorant in a calibrated way: small working memory, no domain
expertise, good instincts — which is a fair model of a person seeing a
screen for the first time. Two hats ship: the **novice** (has never done
this job before — grades whether the page explains itself) and the **pro**
(does this job yearly and names what's missing — grades absence, which only
expertise can see).

## Cost

One read is a few thousand input tokens of a small model: well under a cent
per screen per hat. An entire product walkthrough, every screen, both hats,
costs less than a coffee refill. Capability harnesses that drive frontier
agents through journeys are the complement, not the competitor — they ask
"can it be done"; the goldfish asks "can it be found".

## Use

    export ANTHROPIC_API_KEY=...
    node goldfish.mjs --capture page.txt --hat novice \
      --persona "the organizer of a tech conference; volunteers review talk proposals" \
      --intents '{"job":"run the reviewing round","nextAction":"Assign them"}'

`--image page.png` reads a screenshot instead (text catches copy diseases;
pixels catch affordance ones — run both). Output is JSON: the four answers
plus a grade. `lib/html.mjs` extracts visible text from captured HTML
(links as [LINK: x], buttons as [BUTTON: x]).

Born inside Fireside during the Kill-My-SaaS build, 2026-08, when the
operator's own confusion on a page matched a cold Haiku's word for word.
