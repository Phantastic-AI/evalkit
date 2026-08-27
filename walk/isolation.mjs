// Slice-scoped run namespace (docs/SPEC-two-rungs.md, "Worlds and
// isolation"). A walk never builds its own world — the backbone is built
// once per suite run and shared/read (tableread/primitives.mjs's
// createSagaWorld, run once) — this module only names the one mutable
// slice a single walk repeat gets inside that shared backbone: its own
// persona emails, its own slug prefix, its own sink addresses. Pure and
// deterministic given run_id: the same run_id always mints the same names,
// so a debug capsule can be reproduced by re-deriving the namespace rather
// than needing to record every minted string separately.
//
// run_id itself is minted by the caller (e.g. primitives.mjs's own rid()
// idiom) — this module never generates one; that would make it non-pure.

function slugifyPersona(persona) {
  const base = String(persona)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'persona';
}

/** <persona>+<run_id>@example.org — a stamped identity for one persona
 *  inside one walk's slice, distinct from the backbone's own personas
 *  (organizer@..., reviewer-a@...) so nothing a walk signs up or invites
 *  collides with backbone state or with another walk's repeat. */
export function personaEmail(persona, runId) {
  return `${slugifyPersona(persona)}+${runId}@example.org`;
}

/** saga-<run_id>- — grep-able prefix for anything this walk's slice
 *  names itself (a conference slug, a submission title stem, a group
 *  name), so teardown can find every object one walk repeat created
 *  without touching the shared backbone or a sibling repeat's slice. */
export function slugPrefix(runId) {
  return `saga-${runId}-`;
}

/** A deterministic sink address for one kind of external side effect
 *  (docs/SPEC-two-rungs.md's "External side effects... route to
 *  deterministic sinks"). Not itself a live sink — just the stable name a
 *  runner points its email/webhook/sms/calendar mock at for this run_id,
 *  so two walk repeats never share a sink and a rerun's sink is
 *  predictable without a lookup table. */
export function sinkAddress(kind, runId) {
  switch (kind) {
    case 'email':
      return `sink+${runId}@example.org`;
    case 'webhook':
      return `https://sink.example.org/webhooks/${runId}`;
    case 'calendar':
      return `sink+${runId}@cal.example.org`;
    case 'sms':
      return `sink+${runId}@sms.example.org`;
    default:
      return `sink+${kind}-${runId}@example.org`;
  }
}

/** One bundle carrying every name this walk's slice needs, so a runner can
 *  thread a single object through instead of the run_id plus three helper
 *  imports. Still just a deterministic view over run_id — nothing here
 *  holds state. */
export function namespace(runId) {
  return {
    runId,
    slugPrefix: slugPrefix(runId),
    personaEmail: (persona) => personaEmail(persona, runId),
    sinkAddress: (kind) => sinkAddress(kind, runId),
  };
}
