'use strict';

/**
 * FailureClassifier : panne transitoire vs structurelle vs autorité.
 */

const TABLE = [
  { keys: ['timeout', 'rate'], kind: 'transient', action: 'retry' },
  { keys: ['auth', 'lease'], kind: 'authority', action: 'contain_escalate' },
  { keys: ['oom', 'gpu'], kind: 'substrate', action: 'degrade_mode' },
  { keys: ['crash', 'exit'], kind: 'crash', action: 'checkpoint_restore' }
];

function classify(opts) {
  const err = textOf(opts);
  const hit = findHit(err);
  if (hit) return { kind: hit.kind, action: hit.action };
  return { kind: 'unknown', action: 'contain_observe' };
}

function textOf(opts) {
  const o = opts ?? {};
  return String(o.error ?? '').toLowerCase();
}

function findHit(err) {
  for (const row of TABLE) {
    if (rowHits(row, err)) return row;
  }
  return null;
}

function rowHits(row, err) {
  return row.keys.some((k) => err.includes(k));
}

module.exports = { classify };
