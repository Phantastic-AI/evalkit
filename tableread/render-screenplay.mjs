#!/usr/bin/env node
// CLI: node render-screenplay.mjs [--scenes=scenes.json] [--out=SCREENPLAY.md]
//
// scenes.json -> SCREENPLAY.md, screenplay-formatted: act headings,
// scene slugs, direction in italics, bracketed stage directions carrying
// intents/truths/sbek/hats/expectedFindings compactly, dialogue as script
// lines where a scene has any. Structure only — no field here is invented;
// everything rendered comes straight out of a scene record.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const ACT_TITLES = {
  1: 'The Call Opens',
  2: 'Assembling the Committee',
  3: 'Watching and Rescuing',
  4: 'Deciding, Telling, and What Is Missing',
  5: "Alex's Conference",
};

function args() {
  const argv = process.argv.slice(2);
  const scenesArg = argv.find((a) => a.startsWith('--scenes='));
  const outArg = argv.find((a) => a.startsWith('--out='));
  return {
    scenesPath: resolve(HERE, scenesArg ? scenesArg.slice('--scenes='.length) : 'scenes.json'),
    outPath: resolve(HERE, outArg ? outArg.slice('--out='.length) : 'SCREENPLAY.md'),
  };
}

function byAct(scenes) {
  const acts = new Map();
  for (const s of scenes) {
    if (!acts.has(s.act)) acts.set(s.act, []);
    acts.get(s.act).push(s);
  }
  return [...acts.entries()].sort((a, b) => a[0] - b[0]);
}

/** Every scene's own capability/comprehension weight, never blended into one
 *  number here or anywhere downstream — docs/sagas/README.md's own law.
 *  Capability = the mechanical, checkable facts (truths + crossTruths).
 *  Comprehension = the goldfish/intent probes this scene poses (one per
 *  scene: its own direction + intents pair, plus one more for each named
 *  station-specific probe folded into direction rather than the standard
 *  four). */
function weight(scene) {
  const capability = (scene.truths?.length ?? 0) + (scene.crossTruths?.length ?? 0);
  const comprehension = 1; // the standard four are implicit; station-specific probes live in direction/goldfish prose, not a count
  return { capability, comprehension };
}

function mdEscape(s) {
  return String(s);
}

function renderBracket(label, lines) {
  if (!lines || lines.length === 0) return '';
  const body = lines.map((l) => `  ${l}`).join('\n');
  return `[${label}\n${body}]\n\n`;
}

function renderScene(scene, index, actSceneNumber) {
  const roman = ROMAN[scene.act] ?? String(scene.act);
  const heading = `## ACT ${roman}, SCENE ${actSceneNumber} — ${scene.title}`;
  const castLine = `*${scene.cast.join(', ')}*`;
  const hatsLine = scene.hats?.length ? ` · hat: ${scene.hats.join('/')}` : '';

  let out = `${heading}\n\n${castLine}${hatsLine}\n\n`;
  out += `*${scene.moment}*\n\n`;
  if (scene.direction) out += `*${scene.direction}*\n\n`;

  if (scene.dialogue?.length) {
    out += scene.dialogue.map((l) => `> ${l}`).join('\n') + '\n\n';
  }

  const intentLines = scene.intents
    ? [`JOB — ${scene.intents.job}`, `NEXT ACTION — ${scene.intents.nextAction}`]
    : [];
  out += renderBracket('COMPREHENSION — goldfish/intent', intentLines);

  const truthLines = (scene.truths ?? []).map((t) => `· ${t}`);
  out += renderBracket('CAPABILITY — truths', truthLines);

  if (scene.crossTruths?.length) {
    const lines = scene.crossTruths.map((c) => `· [${c.personas.join(' <-> ')}] ${c.fact}`);
    out += renderBracket('CROSS — interlock, spans personas', lines);
  }

  if (scene.sbek?.length) {
    out += renderBracket('SBEK', scene.sbek.map((s) => `· ${s}`));
  }

  if (scene.expectedFindings?.length) {
    out += renderBracket('EXPECTED FINDING', scene.expectedFindings.map((f) => `· ${f}`));
  }

  out += `SURFACES: ${scene.surfaces.map((s) => `${s.persona} @ ${s.url}`).join('  |  ')}\n`;
  out += `FIXTURE: ${scene.fixtureRecipe}\n`;

  return out + '\n---\n\n';
}

function render(scenes) {
  const lines = [];
  lines.push('# SCREENPLAY');
  lines.push('');
  lines.push('GENERATED from scenes.json by render-screenplay.mjs — do not edit.');
  lines.push('');
  lines.push(
    'One conference, one timeline, five acts: the camera follows Dana Reyes, first-time ' +
      'organizer, from the moment she opens her call to the moment Alex Rivera — her first ' +
      'attendee — finds a friend in the crowd. Pro-hat cutaways (Priya Anand, Renata Cole and ' +
      'Lena Fischer) visit a different, comparable conference on purpose, at the matching beat, ' +
      'for contrast.'
  );
  lines.push('');
  lines.push(
    '**Grading law** (docs/sagas/README.md): every scene below carries two separate scores, ' +
      'never one blended number. CAPABILITY is mechanical — did the truths (and crossTruths, for ' +
      'an interlock) come out true, checkable against the page or the database. COMPREHENSION is ' +
      'human — did a goldfish reading the surface cold answer the intent (job + next action) the ' +
      'way a real person would. A scene can pass one and fail the other; that distinction is the ' +
      'point, not a rounding error to average away.'
  );
  lines.push('');

  let totalCapability = 0;
  let totalComprehension = 0;

  for (const [act, sceneList] of byAct(scenes)) {
    const roman = ROMAN[act] ?? String(act);
    lines.push(`# ACT ${roman} — ${ACT_TITLES[act] ?? ''}`);
    lines.push('');
    let actCapability = 0;
    let actComprehension = 0;
    sceneList.forEach((scene, i) => {
      lines.push(renderScene(scene, i, i + 1).trimEnd());
      lines.push('');
      const w = weight(scene);
      actCapability += w.capability;
      actComprehension += w.comprehension;
    });
    lines.push(
      `*Act ${roman} tally — capability: ${actCapability} truths asserted across ` +
        `${sceneList.length} scene(s). comprehension: ${actComprehension} goldfish/intent probe(s). ` +
        `Reported separately; never combined.*`
    );
    lines.push('');
    totalCapability += actCapability;
    totalComprehension += actComprehension;
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `**Whole-screenplay tally** — capability: ${totalCapability} truths across ${scenes.length} ` +
      `scenes. comprehension: ${totalComprehension} goldfish/intent probes. Two numbers, on purpose.`
  );
  lines.push('');

  return lines.join('\n');
}

function main() {
  const { scenesPath, outPath } = args();
  const scenes = JSON.parse(readFileSync(scenesPath, 'utf8'));
  const ids = new Set();
  for (const s of scenes) {
    if (ids.has(s.id)) throw new Error(`Duplicate scene id: ${s.id}`);
    ids.add(s.id);
    if (s.fixtureRecipe.startsWith('reuse:')) {
      const ownerId = s.fixtureRecipe.slice('reuse:'.length);
      const owner = scenes.find((x) => x.id === ownerId);
      if (!owner) throw new Error(`${s.id}: reuse:${ownerId} — no such scene`);
      if (owner.fixtureRecipe.startsWith('reuse:')) {
        throw new Error(`${s.id}: reuse:${ownerId} points at another reuse, not an owning recipe`);
      }
    }
  }
  const md = render(scenes);
  writeFileSync(outPath, md);
  console.log(`saga: rendered ${scenes.length} scenes -> ${outPath}`);
}

main();
