'use strict';

/**
 * Propagation procédurale (G17) : local -> sibling -> culture ->
 * rhizome -> lineage_standard, après validation (gate).
 */

const LADDER = ['local', 'sibling', 'culture', 'rhizome', 'lineage_standard'];

function nextStage(opts) {
  const o = opts || {};
  const idx = LADDER.indexOf(o.stage || 'local');
  if (idx < 0) return { ok: false, reason: 'unknown_stage' };
  if (o.validated !== true) return { ok: false, reason: 'validation_required', stage: o.stage };
  if (idx >= LADDER.length - 1) return { ok: false, reason: 'already_lineage', stage: o.stage };
  return { ok: true, from: o.stage, to: LADDER[idx + 1] };
}

module.exports = { nextStage, LADDER };
