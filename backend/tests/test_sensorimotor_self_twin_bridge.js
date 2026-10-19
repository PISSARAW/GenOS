'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const bridge = require('../src/services/sensorimotorSelfTwinBridge');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    let shevEvent;
    const result = await bridge.executePredictiveStep({ db,
      scope: { organizationId: 'org', projectId: 'project', entityId: 'agent' },
      prediction: { target: 'desktop', intervention: 'bounded-click', semanticType: 'capability_gap' },
      step: { type: 'click', x: 2, y: 3 }, toleratedError: 0.1,
      authorization: { requiresExplicitAuthorization: true, granted: true },
      verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:desktop-step' }),
      executeBoundedAction: async ({ step }) => ({ action: step.type }),
      observeState: async () => ({ observations: [{ metric: 'screen', predicted: 10, observed: 20 }],
        evidenceRefs: ['artifact:screen'] }),
      candidateSubmitter: async ({ candidate }) => ({ candidateId: candidate.id }),
      notifyShev: async (event) => { shevEvent = event; return { accepted: true }; } });
    assert.equal(result.discrepancy.status, 'measured');
    assert.equal(result.discrepancy.epsilon, 1);
    assert.equal(result.record.agowCandidate.content.semanticType, 'self_twin_prediction_error');
    assert.equal(shevEvent.kind, 'capability_gap');
    assert.equal(result.promotionEligible, false);
    await assert.rejects(bridge.executePredictiveStep({ authorization: {}, toleratedError: 0.2 }),
      /explicit-authorization-required/);
  } finally { await db.close(); }
  console.log('Sensorimotor Self-Twin predictive bridge checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
