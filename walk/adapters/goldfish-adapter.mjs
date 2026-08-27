// REAL goldfish adapter — the only place walk/drive.mjs's injected
// `goldfish` function actually calls goldfish/goldfish.mjs (docs/
// SPEC-two-rungs.md: "the walk driver must reuse its question/prompt
// shapes, not invent new ones"). Wired in only by a future CLI entry point
// (`goldfish-walk`) alongside walk/adapters/screenshot-adapter.mjs — this
// module is never imported by walk/drive.mjs itself and never exercised by
// any test in walk/test/ (hard constraint: no network or model calls in any
// code path a test runs). It requires ANTHROPIC_API_KEY in the environment,
// exactly as goldfish.mjs itself does, and never logs or embeds it.
//
// Reuses goldfish.mjs completely unmodified, as a child process, rather than
// importing its internals — goldfish.mjs has no exported API (it is a
// `main()`-only CLI script) and chunk 1's rule against modifying existing
// modules except additively extends naturally to not carving an export out
// of a script that was never meant to have one. Spawning it is also the one
// approach that guarantees the exact same prompts, hats, and grading call
// this whole kit already ships — nothing here re-implements or drifts from
// goldfish.mjs's own question text.
import { execFile } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDFISH_SCRIPT = resolve(HERE, '..', '..', 'goldfish', 'goldfish.mjs');

function runGoldfish(args) {
  return new Promise((resolvePromise, reject) => {
    execFile('node', [GOLDFISH_SCRIPT, ...args], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`goldfish-adapter: goldfish.mjs failed: ${stderr || err.message}`));
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(new Error(`goldfish-adapter: could not parse goldfish.mjs's own stdout as JSON: ${stdout.slice(0, 300)}`));
      }
    });
  });
}

// goldfish.mjs asks for "exactly these four, one short paragraph each" but
// answers arrive as free prose, not structured JSON (that would defeat the
// point of a cold, unprompted read). This splits on the numbered lead-ins
// the QUESTIONS text itself asks for ("1.", "2.", ...); a goldfish that
// drifts from that numbering just leaves later segments folded into the
// first, which is a visible degradation (job/action/confusion/neverTold
// collapse together) rather than a silent misparse.
const SEGMENT_RE = /(?:^|\n)\s*([1-4])[.)]\s*/g;

function splitAnswers(raw) {
  const text = String(raw ?? '');
  const marks = [...text.matchAll(SEGMENT_RE)];
  if (marks.length < 4) {
    return { job: text.trim(), nextAction: '', confusion: '', neverTold: '' };
  }
  const segments = { 1: '', 2: '', 3: '', 4: '' };
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    segments[marks[i][1]] = text.slice(start, end).trim();
  }
  return { job: segments[1], nextAction: segments[2], confusion: segments[3], neverTold: segments[4] };
}

const CONFUSION_PHRASES = [
  "don't know",
  'do not know',
  'not sure',
  'no idea',
  'unclear what',
  "can't tell",
  'cannot tell',
  'nothing to press',
  'no control',
];

/** True when the goldfish's own "what would you do next" answer amounts to
 *  "I don't know" — a self-report, not a resolver failure (resolver
 *  failures are typed action_resolver_defect independently; this is layer
 *  0, before the resolver ever runs — see walk/drive.mjs's own handling of
 *  g.confused). */
function looksConfused(nextAction) {
  const text = String(nextAction ?? '').toLowerCase();
  if (!text.trim()) return true;
  return CONFUSION_PHRASES.some((phrase) => text.includes(phrase));
}

/** The real goldfish() function walk/drive.mjs's DI contract expects:
 *  ({persona, hat, goal, image, step}) -> {answers, namedAction, confused}.
 *  `image` is whatever walk/adapters/screenshot-adapter.mjs handed back —
 *  written to a temp file only because goldfish.mjs's CLI takes a path, not
 *  a buffer; cleaned up unconditionally after the call. */
export async function goldfishAdapter({ persona, hat, image }) {
  const dir = mkdtempSync(join(tmpdir(), 'evalkit-goldfish-'));
  const imagePath = join(dir, 'screen.png');
  try {
    writeFileSync(imagePath, Buffer.isBuffer(image) ? image : Buffer.from(image));
    const args = ['--image', imagePath, '--hat', hat ?? 'novice', '--persona', persona ?? ''];
    const result = await runGoldfish(args);
    const answers = splitAnswers(result.answers);
    return { answers, namedAction: answers.nextAction, confused: looksConfused(answers.nextAction) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
