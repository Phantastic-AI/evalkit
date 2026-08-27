// The suite stamp (docs/SPEC-two-rungs.md, "Suite stamp"): a content hash
// over everything that can change what a score means — scenes.json, every
// journey spec, the scoring weights, the prompt files — plus a capture-
// format version constant, so a change to the capture shape itself (not
// just its inputs) also moves the stamp. "No one bumps it; changing a
// weight changes it by construction." Scores are only ever comparable under
// the same stamp.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Bump this by hand only when the CAPTURE shape itself changes — the fields
// tableread/capture.mjs or a screenshot adapter hands back (visibleText
// extraction rules, control extraction schema, viewport lane definitions).
// Everything else that should move the stamp belongs in the file list
// computeStamp() is given, not here.
export const CAPTURE_FORMAT_VERSION = 'v1';

/** Deterministic content hash over an ORDERED list of file paths (typically:
 *  scenes.json, every journey spec, a weights file, every prompt file).
 *  Order is the CALLER's own declared identity for the suite — computeStamp
 *  never sorts behind the caller's back, so reordering the same files is
 *  itself a stamp-changing event, same as editing one. Each file's own path
 *  is folded into the hash alongside its content so renaming a file (with
 *  identical bytes) also changes the stamp, not just editing it. */
export function computeStamp(paths) {
  const hash = createHash('sha256');
  hash.update(`capture-format:${CAPTURE_FORMAT_VERSION}\n`);
  for (const path of paths) {
    const content = readFileSync(path, 'utf8');
    hash.update(`path:${path}\n`);
    hash.update(content);
    hash.update('\n--\n');
  }
  return hash.digest('hex');
}

/** The scorecard's own header block: stamp, model ids, persona version, the
 *  N used as denominators, and the N-ladder rung (walk/score.mjs's
 *  ladderRung) — the facts spec's "Suite stamp" section says must ride
 *  alongside every score. `label` is the spec's own "optional human label". */
export function renderScorecardHeader({ stamp, modelIds, personaVersion, denominators, ladderRung, label }) {
  const lines = [
    `stamp: ${stamp}`,
    label ? `label: ${label}` : null,
    `models: ${Array.isArray(modelIds) ? modelIds.join(', ') : modelIds}`,
    `persona version: ${personaVersion}`,
    `denominators: ${JSON.stringify(denominators)}`,
    `ladder: ${ladderRung}`,
  ].filter((line) => line !== null);
  return lines.join('\n');
}
