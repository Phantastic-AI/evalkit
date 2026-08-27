#!/usr/bin/env node
// The cold reader. Reads one captured surface (visible text or a
// screenshot), wearing one hat, and answers the four questions with no
// product knowledge; then a second small call grades the answers against
// the surface's declared intent. Costs: two small-model calls per read —
// fractions of a cent. Requires ANTHROPIC_API_KEY in the environment; this
// file never embeds or logs it.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const MODEL = process.env.GOLDFISH_MODEL ?? 'claude-haiku-4-5-20251001';
const API = 'https://api.anthropic.com/v1/messages';

const HATS = {
  novice:
    'You have never done this job before in your life. You know only what a ' +
    'generally sensible adult knows. If jargon appears, it confuses you.',
  pro:
    'You have done this job professionally for years and have used the ' +
    'category-leading tools. Beyond the four questions, name what a tool ' +
    'like this is missing for somebody like you.',
};

const QUESTIONS = `Answer exactly these four, one short paragraph each, brutally honestly:
1. What is this page for, in one sentence?
2. What would you do next, right now, and which control would you press?
3. What confused you — every place you stopped or reread, in the order you hit it. Include purely visual problems if you are reading a screenshot.
4. What did the page never tell you that you needed to know?`;

function args(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

async function ask(content, maxTokens = 1024) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set. Refusing to pretend.');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.map((b) => b.text ?? '').join('');
}

async function main() {
  const a = args(process.argv);
  const hat = HATS[a.hat ?? 'novice'];
  if (!hat) throw new Error(`Unknown hat: ${a.hat}. Hats: ${Object.keys(HATS).join(', ')}`);
  const persona = a.persona ?? 'a person using this software for the first time';
  // A walk carries the journey's goal in the user's own words (docs/
  // SPEC-two-rungs.md, "The walk loop"); a plain scene read has none.
  const goalLine = a.goal && a.goal !== true ? `\n\nYour goal right now: ${a.goal}` : '';
  const intents = a.intents ? JSON.parse(a.intents) : null;

  let content;
  if (a.image) {
    const media = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[
      extname(a.image).toLowerCase()
    ];
    if (!media) throw new Error('Image must be png/jpg/webp.');
    content = [
      { type: 'image', source: { type: 'base64', media_type: media, data: readFileSync(a.image).toString('base64') } },
      { type: 'text', text: `You are ${persona}. ${hat}${goalLine}\n\nThe image is exactly what you see on screen.\n\n${QUESTIONS}` },
    ];
  } else if (a.capture) {
    const text = readFileSync(a.capture, 'utf8');
    content = [
      {
        type: 'text',
        text:
          `You are ${persona}. ${hat}${goalLine}\n\nThis is the page you see (links are [LINK: x], ` +
          `buttons are [BUTTON: x]; text order is page order):\n\n---\n${text}\n---\n\n${QUESTIONS}`,
      },
    ];
  } else {
    throw new Error('Give me --capture file.txt or --image file.png');
  }

  const answers = await ask(content);

  let grade = null;
  if (intents) {
    // The grader is a comparison, not an opinion: did the cold reader name
    // the declared job and the declared next action? Judged by a second
    // small call so paraphrase counts and coincidence doesn't.
    const verdict = await ask(
      [
        {
          type: 'text',
          text:
            `A cold reader answered questions about a screen. The screen's declared intent:\n` +
            `JOB: ${intents.job}\nNEXT ACTION (the control's visible name): ${intents.nextAction}\n\n` +
            `The reader's answers:\n---\n${answers}\n---\n\n` +
            `Answer in strict JSON only: {"jobFound": true|false, "actionFound": true|false, ` +
            `"why": "one sentence"}. jobFound means answer 1 describes the declared job in ` +
            `substance (paraphrase counts). actionFound means answer 2 chose the declared ` +
            `control (its visible name or an unambiguous description of it).`,
        },
      ],
      256
    );
    const m = verdict.match(/\{[\s\S]*\}/);
    grade = m ? JSON.parse(m[0]) : { error: 'ungradeable', raw: verdict };
  }

  process.stdout.write(JSON.stringify({ model: MODEL, hat: a.hat ?? 'novice', answers, grade }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
