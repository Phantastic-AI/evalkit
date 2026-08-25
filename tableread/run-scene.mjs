#!/usr/bin/env node
// CLI: node run-scene.mjs <sceneId> [--scenes=<path>] [--teardown] [--keep] [--base-url=<url>]
//
// Scene-driven counterpart to run-station.mjs. A scene (tools/saga/scenes.json)
// names a fixtureRecipe — either a recipes/*.mjs file, or 'reuse:<sceneId>'
// pointing at the scene that actually owns the recipe. Several scenes can
// share one continuous fixture world this way (docs/sagas/README.md's law
// still scopes one *conference* to one fixture — reuse is about scenes,
// which cut to a different moment or persona inside that same conference,
// same law, same world). The recipe runs once; every snap() it takes along
// the way is kept, and this scene's own tagged snapshot(s) are what get
// written to out/.
//
// Recipes written for this runner accept ({ p, snap }): p is the usual saga
// world (primitives.mjs), snap(sceneId, persona, url, init?) captures a
// surface immediately, at the moment in the recipe's own procedural order a
// person would actually see it — not after every later mutation has already
// happened. That ordering is why this exists as a separate script rather
// than an extra flag on run-station.mjs: run-station.mjs captures every
// surface only after the whole recipe has finished, which is exactly wrong
// for a scene that wants "before the deal lands" out of a world whose same
// recipe later deals it. A recipe may still return { surfaces } as a
// fallback so `node run-station.mjs recipes/<name>.mjs` can smoke-test it
// stand-alone (backward compat, unchanged contract); run-scene.mjs never
// reads that field, only the snaps taken for the requested scene id.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSagaWorld, STAGING_BASE_URL } from './primitives.mjs';
import { capture } from './capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error('usage: node run-scene.mjs <sceneId> [--scenes=<path>] [--teardown] [--keep] [--base-url=<url>]');
}

function loadScenes(path) {
  const scenes = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map(scenes.map((s) => [s.id, s]));
  return { scenes, byId };
}

/** Follow a 'reuse:<id>' fixtureRecipe to the scene that actually names a
 *  recipe file. One hop only — every reused scene points straight at its
 *  thread's owning scene, never at another reuse (checked here, not
 *  assumed silently correct). */
function resolveRecipeName(scene, byId) {
  if (!scene.fixtureRecipe.startsWith('reuse:')) return scene.fixtureRecipe;
  const ownerId = scene.fixtureRecipe.slice('reuse:'.length);
  const owner = byId.get(ownerId);
  if (!owner) throw new Error(`${scene.id}: fixtureRecipe "reuse:${ownerId}" — no such scene`);
  if (owner.fixtureRecipe.startsWith('reuse:')) {
    throw new Error(`${scene.id}: "reuse:${ownerId}" points at another reuse — point straight at the owning scene`);
  }
  return owner.fixtureRecipe;
}

async function main() {
  const args = process.argv.slice(2);
  const teardown = args.includes('--teardown');
  const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
  const baseUrl = baseUrlArg ? baseUrlArg.slice('--base-url='.length) : STAGING_BASE_URL;
  const scenesArg = args.find((a) => a.startsWith('--scenes='));
  const scenesPath = resolve(HERE, scenesArg ? scenesArg.slice('--scenes='.length) : 'scenes.json');
  const sceneId = args.find((a) => !a.startsWith('--'));
  if (!sceneId) {
    usage();
    process.exit(1);
  }

  const { byId } = loadScenes(scenesPath);
  const scene = byId.get(sceneId);
  if (!scene) throw new Error(`No scene "${sceneId}" in ${scenesPath}`);
  const recipeName = resolveRecipeName(scene, byId);
  const recipePath = resolve(HERE, 'recipes', `${recipeName}.mjs`);
  const mod = await import(pathToFileURL(recipePath).href);
  const recipe = mod.default;
  if (typeof recipe !== 'function') throw new Error(`recipes/${recipeName}.mjs has no default-exported function`);

  console.log(`saga: running scene ${sceneId} ("${scene.title}") via recipes/${recipeName}.mjs against ${baseUrl}`);

  const shots = [];
  const p = createSagaWorld(baseUrl);

  /** Capture one surface right now, tagged with whichever scene it belongs
   *  to — a recipe covering several scenes calls this once per scene, at
   *  the point in its own procedural order that scene's moment is true. */
  async function snap(forScene, persona, url, init) {
    const jar = p.jarFor(persona);
    const full = url.startsWith('http') ? url : baseUrl + url;
    const { status, visibleText } = await capture(full, jar, init);
    shots.push({ scene: forScene, persona, url: full, status, visibleText });
    return { status, visibleText };
  }

  await recipe({ p, snap });
  if (!p.world.slug) throw new Error(`${recipeName} finished without creating a conference (world.slug is unset)`);

  const mine = shots.filter((s) => s.scene === sceneId);
  if (!mine.length) {
    throw new Error(
      `${recipeName} took no snap() for scene "${sceneId}" — every scene that names this recipe (directly or via ` +
        `reuse:) must be snapped inside it`
    );
  }

  const outDir = resolve(HERE, 'out', `${sceneId}-${p.world.slug}`);
  mkdirSync(outDir, { recursive: true });

  const worldJson = {
    scene: sceneId,
    title: scene.title,
    recipe: recipeName,
    slug: p.world.slug,
    baseUrl,
    ranAt: new Date().toISOString(),
    ids: p.world.ids,
    jars: {},
  };

  // A scene can snap the same persona twice at two different moments or URLs
  // (a before/after read, or two pages the same person visits in one beat) —
  // each capture is its own file, numbered on the second and later hit
  // rather than silently overwriting the first.
  const seen = new Map();
  for (const shot of mine) {
    const base = shot.persona.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const fname = n === 1 ? `${base}.txt` : `${base}-${n}.txt`;
    writeFileSync(
      resolve(outDir, fname),
      `# ${shot.persona} — ${shot.url}\n# status ${shot.status}\n\n${shot.visibleText}\n`
    );
    worldJson.jars[shot.persona] = p.jarFor(shot.persona).header();
    console.log(`saga: captured ${shot.persona} (${shot.status}) -> ${fname}`);
  }

  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(worldJson, null, 2));
  writeFileSync(resolve(outDir, 'scene.json'), JSON.stringify(scene, null, 2));

  // Capability check, cheap version: a scene's own truths that quote verbatim
  // copy are the one kind of fact a plain substring search can grade without
  // a human or a goldfish — did the capture actually say the thing the
  // station claims it says? Not every truth is a literal substring (many are
  // counts or db states); those are silently skipped here, not failed — this
  // is a marker check, not the whole capability grade (docs/sagas/README.md's
  // split: capability from truths, comprehension from goldfish/intents,
  // reported separately, never blended into one number — this file only ever
  // touches the capability half).
  const hay = mine.map((s) => s.visibleText).join('\n---\n');
  const checked = [];
  for (const t of scene.truths ?? []) {
    const m = t.match(/[“"]([^"”]{6,})[”"]/);
    if (!m) continue;
    checked.push({ truth: t, quote: m[1], found: hay.includes(m[1]) });
  }
  if (checked.length) {
    writeFileSync(resolve(outDir, 'truth-markers.json'), JSON.stringify(checked, null, 2));
    for (const c of checked) console.log(`saga: truth marker ${c.found ? 'FOUND' : 'MISSING'} — "${c.quote}"`);
  }

  if (teardown) {
    const dropped = await p.teardown();
    console.log(`saga: torn down ${p.world.slug}`, dropped);
  } else {
    console.log(`saga: kept ${p.world.slug} up (pass --teardown to drop it)`);
  }

  console.log(outDir);
}

main().catch((e) => {
  console.error('saga: FAILED —', e.stack || e.message || e);
  process.exit(1);
});
