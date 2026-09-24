'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const adapter = require('../src/services/holobionte/symbionts/trinityAdapter');

function report(values, claim, passed = true) {
  const evidenceVector = {
    correctness: values[0], coverage: values[1], robustness: values[2], reproducibility: values[3],
    novelty: values[4], cost: values[5], latency: values[6], risk: values[7], uncertainty: values[8],
    constraintCoverage: values[9]
  };
  const evidenceVectorEvidence = Object.fromEntries(Object.keys(evidenceVector).map((key) => [key, ['vector-proof']]));
  return {
    outcome: 'success', hardConstraintsPassed: passed, budgetStatus: 'within', evidence: [{ id: 'vector-proof' }],
    evidenceVector, evidenceVectorEvidence, claims: [{ statement: claim, evidence: ['receipt'] }]
  };
}

const reports = [
  { worldNumber: 1, role: 'baseline', report: report([0.75, 0.7, 0.65, 0.85, 0.5, 0.3, 0.4, 0.2, 0.3, 0.92], 'A baseline candidate provides verified database reads.') },
  { worldNumber: 2, role: 'planned', report: report([0.95, 0.95, 0.9, 0.98, 0.8, 0.1, 0.2, 0.05, 0.1, 1], 'The selected candidate provides verified database reads.') },
  { worldNumber: 3, role: 'falsification', report: report([0.71, 0.61, 0.51, 0.81, 0.4, 0.4, 0.6, 0.29, 0.49, 0.9], 'A third candidate provides verified database reads.', false) }
];

const candidates = [1, 2, 3].map((worldNumber) => ({
  worldNumber, symbiontId: `candidate-${worldNumber}`, kind: 'TOOL',
  capability: 'database-read', capabilities: ['database-read']
}));

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const host = await store.createSession(db, {
      hostId: 'trinity-host', scope: 'PERSISTENT', constitution: { hostId: 'trinity-host' }
    });
    const selected = await adapter.selectTrinitySymbiont(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: host.revision,
      candidates, worldReports: reports, domain: 'software_engineering', threshold: 0.7
    });
    assert.strictEqual(selected.status, 'CANDIDATE', selected.comparison.reason);
    assert.strictEqual(selected.symbiont.worldNumber, selected.comparison.selectedWorld);
    assert.ok(selected.symbiont.evidenceRefs.includes('receipt'));
    const session = await store.getSession(db, host.holobiontId);
    assert.strictEqual(session.candidateSymbionts[0].origin, 'TRINITY');
    assert.strictEqual(session.candidateSymbionts[0].status, 'CANDIDATE');
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Trinity integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Trinity integration tests failed:', error);
  process.exitCode = 1;
});
