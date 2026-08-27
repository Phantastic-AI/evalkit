#!/usr/bin/env node
// CLI: node run-station.mjs recipes/<name>.mjs [--teardown] [--keep] [--adapter=<dir>]
//
// --adapter=<dir> (or env TABLEREAD_ADAPTER) points primitives.mjs at
// another product's adapter directory instead of this one's built-in
// Fireside adapter — see README.md's adapter contract.
//
// Runs a recipe (a default-exported async ({p}) => {...} that composes
// primitives.mjs into a fixture and returns { surfaces: [{persona, url}] }),
// captures every surface as rendered text (capture.mjs), and writes a
// report dir: one .txt per surface plus world.json (ids, slug, jars).
//
// The world stays up by default — a saga is meant to be walked after the
// run, not just proven once and dropped. --teardown is the only thing that
// tears it down; --keep is accepted too, spelling out the default so a
// recipe's own invocation can say so explicitly.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { capture } from './capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(
    'usage: node run-station.mjs recipes/<name>.mjs [--teardown] [--keep] [--base-url=<url>] [--adapter=<dir>]'
  );
}

async function main() {
  const args = process.argv.slice(2);
  const teardown = args.includes('--teardown');
  const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
  const adapterArg = args.find((a) => a.startsWith('--adapter='));
  const adapterDir = resolve(
    adapterArg ? adapterArg.slice('--adapter='.length) : process.env.TABLEREAD_ADAPTER || HERE
  );
  const { createSagaWorld, STAGING_BASE_URL } = await import(pathToFileURL(resolve(adapterDir, 'primitives.mjs')).href);
  const baseUrl = baseUrlArg ? baseUrlArg.slice('--base-url='.length) : STAGING_BASE_URL;
  const recipeArg = args.find((a) => !a.startsWith('--'));
  if (!recipeArg) {
    usage();
    process.exit(1);
  }

  const recipePath = resolve(recipeArg);
  const recipeName = basename(recipePath).replace(/\.mjs$/, '');
  const mod = await import(pathToFileURL(recipePath).href);
  const recipe = mod.default;
  if (typeof recipe !== 'function') {
    throw new Error(`${recipeArg} has no default-exported function`);
  }

  console.log(`saga: running ${recipeName} against ${baseUrl}`);
  const p = createSagaWorld(baseUrl);
  const { surfaces } = await recipe({ p });
  if (!p.world.slug) throw new Error(`${recipeName} finished without creating a conference (world.slug is unset)`);
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    throw new Error(`${recipeName} returned no surfaces to capture`);
  }

  const outDir = resolve(HERE, 'out', `${recipeName}-${p.world.slug}`);
  mkdirSync(outDir, { recursive: true });

  const worldJson = {
    recipe: recipeName,
    slug: p.world.slug,
    baseUrl,
    ranAt: new Date().toISOString(),
    ids: p.world.ids,
    jars: {},
  };

  for (const { persona, url } of surfaces) {
    const jar = p.jarFor(persona);
    const full = url.startsWith('http') ? url : baseUrl + url;
    const { status, visibleText } = await capture(full, jar);
    const fname = `${persona.replace(/[^a-zA-Z0-9._-]+/g, '_')}.txt`;
    writeFileSync(
      resolve(outDir, fname),
      `# ${persona} — ${full}\n# status ${status}\n\n${visibleText}\n`
    );
    worldJson.jars[persona] = jar.header();
    console.log(`saga: captured ${persona} (${status}) -> ${fname}`);
  }

  writeFileSync(resolve(outDir, 'world.json'), JSON.stringify(worldJson, null, 2));

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
