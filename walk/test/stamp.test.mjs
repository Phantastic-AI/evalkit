import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStamp, renderScorecardHeader, CAPTURE_FORMAT_VERSION } from '../stamp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures', 'stamp');
const FIXTURE_PATHS = [join(FIXTURES, 'scenes.json'), join(FIXTURES, 'weights.json'), join(FIXTURES, 'prompt.txt')];

test('computeStamp: deterministic — the same files hash identically every time', () => {
  const a = computeStamp(FIXTURE_PATHS);
  const b = computeStamp(FIXTURE_PATHS);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/); // sha256 hex digest
});

test('computeStamp: sensitive — changing one weight changes the stamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evalkit-stamp-'));
  try {
    const scenes = join(dir, 'scenes.json');
    const weights = join(dir, 'weights.json');
    writeFileSync(scenes, '[{"id":"S1"}]');
    writeFileSync(weights, '{"job":2,"action":1}');
    const before = computeStamp([scenes, weights]);

    writeFileSync(weights, '{"job":3,"action":1}'); // one weight, changed
    const after = computeStamp([scenes, weights]);

    assert.notEqual(before, after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeStamp: unrelated files are untouched by an edit elsewhere — only the touched path moves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evalkit-stamp-'));
  try {
    const a = join(dir, 'a.json');
    const b = join(dir, 'b.json');
    writeFileSync(a, '{"x":1}');
    writeFileSync(b, '{"y":1}');
    const stampA = computeStamp([a]);
    writeFileSync(b, '{"y":2}'); // b changes, a does not
    const stampAAfter = computeStamp([a]);
    assert.equal(stampA, stampAAfter);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeStamp: order matters — the same files in a different order hash differently', () => {
  const forward = computeStamp(FIXTURE_PATHS);
  const reversed = computeStamp([...FIXTURE_PATHS].reverse());
  assert.notEqual(forward, reversed);
});

test('computeStamp: renaming a file (identical bytes, different path) changes the stamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evalkit-stamp-'));
  try {
    const original = join(dir, 'original.json');
    const renamed = join(dir, 'renamed.json');
    writeFileSync(original, '{"same":"bytes"}');
    writeFileSync(renamed, '{"same":"bytes"}');
    assert.notEqual(computeStamp([original]), computeStamp([renamed]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeStamp: an empty path list still stamps the capture-format version alone, deterministically', () => {
  assert.equal(computeStamp([]), computeStamp([]));
});

test('CAPTURE_FORMAT_VERSION is exported and non-empty', () => {
  assert.ok(typeof CAPTURE_FORMAT_VERSION === 'string' && CAPTURE_FORMAT_VERSION.length > 0);
});

test('renderScorecardHeader: prints stamp, models, persona version, denominators, and ladder rung', () => {
  const header = renderScorecardHeader({
    stamp: 'deadbeef',
    modelIds: ['claude-haiku-4-5-20251001'],
    personaVersion: 'v3',
    denominators: { n: 5, journeys: 2 },
    ladderRung: 'scored',
  });
  assert.match(header, /stamp: deadbeef/);
  assert.match(header, /models: claude-haiku-4-5-20251001/);
  assert.match(header, /persona version: v3/);
  assert.match(header, /denominators: \{"n":5,"journeys":2\}/);
  assert.match(header, /ladder: scored/);
  assert.doesNotMatch(header, /label:/);
});

test('renderScorecardHeader: an optional label rides along when given', () => {
  const header = renderScorecardHeader({
    stamp: 'deadbeef',
    modelIds: 'claude-haiku-4-5-20251001',
    personaVersion: 'v3',
    denominators: { n: 5 },
    ladderRung: 'release',
    label: 'pre-launch cut',
  });
  assert.match(header, /label: pre-launch cut/);
});
