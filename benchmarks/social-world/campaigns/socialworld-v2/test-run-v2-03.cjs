'use strict';

const assert = require('node:assert/strict');
const { oraclePassed, reportFor } = require('./run-v2-03.cjs');

const decision = { baseline: { chosenAction: 'verify_first' }, recalled: { chosenAction: 'proceed' }, changed: true };
const evidence = {
  write: { written: 5, lessons: 1, expectedSupport: 5 },
  positive: {
    sourceEvidence: Array.from({ length: 5 }, (_, index) => ({ id: `episode-${index + 1}`,
      sourceEventId: `event-${index + 1}`, evidenceRefs: [`event:event-${index + 1}`],
      provenance: { kind: 'reported', evidenceClass: 'runtime_report' } })),
    recall: { episodes: [{ id: 'episode-1' }], lessons: [{ id: 'lesson-1' }] }, decision
  },
  negative: { episodeCount: 0, lessonCount: 0, recalledEpisodes: 0, recalledLessons: 0,
    decision: { baseline: { chosenAction: 'verify_first' }, recalled: { chosenAction: 'verify_first' }, changed: false } },
  provenanceComplete: true
};

assert.equal(oraclePassed(evidence.positive, evidence.negative, evidence.write), true);
assert.equal(oraclePassed({ ...evidence.positive, sourceEvidence: [] }, evidence.negative, evidence.write), false,
  'missing durable source-event evidence must never pass');
assert.equal(oraclePassed({ ...evidence.positive, sourceEvidence: evidence.positive.sourceEvidence.map((item) => ({ ...item, provenance: null })) },
  evidence.negative, evidence.write), false, 'missing persisted provenance must never pass');
assert.equal(oraclePassed({ ...evidence.positive, decision: { ...decision, changed: false } }, evidence.negative, evidence.write), false,
  'an unchanged held-out decision must not pass');
assert.equal(oraclePassed(evidence.positive, { ...evidence.negative, episodeCount: 1 }, evidence.write), false,
  'a contaminated negative control must not pass');

const incomplete = reportFor({ args: { sourceCommit: 'test', configHash: 'test' }, startedAt: new Date().toISOString(),
  durationMs: 0, evidenceName: 'missing.json', passed: false,
  evidence: { ...evidence, positive: {}, negative: {}, provenanceComplete: false } });
assert.equal(incomplete.status, 'inconclusive');
assert.equal(incomplete.oracle.recalculable, false);
console.log('V2-03 runner rejects missing oracle evidence and contaminated controls.');
