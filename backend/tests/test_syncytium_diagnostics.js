'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Explain and simulate causal shared-state changes.', {
    schema: {
      fields: { score: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' } },
      invariants: [{ id: 'score-nonnegative', scope: 'score', dependencies: ['score'], predicate: { op: 'non_negative', path: 'score' } }]
    }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'score-1', actorId: 'analyst', kind: { type: 'set_field', key: 'score', value: 1 }, evidence: { source: 'estimate-1' }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'score-2', actorId: 'analyst', kind: { type: 'set_field', key: 'score', value: 2 }, intent: { goalId: 'raise-score' }
  });

  const explanation = await syncytium.explain(session.sessionId, { path: 'score', version: 'score-2' });
  assert.equal(explanation.currentValue, 2);
  assert.equal(explanation.operation.transactionId, null);
  assert.equal(explanation.ancestors[0].opId, 'score-1');
  assert.equal(explanation.ancestors[0].evidence.source, 'estimate-1');

  const omitted = await syncytium.simulateWithout(session.sessionId, 'score-2');
  assert.equal(omitted.simulated.sharedFields.score, 1);
  assert.deepEqual(omitted.changedFields, ['score']);
  const replaced = await syncytium.simulateReplacing(session.sessionId, 'score-2', {
    alternative: { kind: { type: 'set_field', key: 'score', value: 3 } }
  });
  assert.equal(replaced.simulated.sharedFields.score, 3);
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.sharedFields.score, 2);

  const fault = await syncytium.createSession('Localize a previously stored invariant failure.', {
    schema: {
      fields: { budget: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' } },
      invariants: [{ id: 'budget-nonnegative', scope: 'budget', dependencies: ['budget'], predicate: { op: 'non_negative', path: 'budget' } }]
    }
  });
  fault.crdt.applyOp({ opId: 'budget-valid', actorId: 'planner', kind: { type: 'set_field', key: 'budget', value: 5 } });
  fault.crdt.applyOp({ opId: 'budget-invalid', actorId: 'planner', kind: { type: 'set_field', key: 'budget', value: -1 } });
  const localized = await syncytium.localizeFaults(fault.sessionId);
  assert.equal(localized[0].invariantId, 'budget-nonnegative');
  assert.equal(localized[0].candidateOperations.some((item) => item.opId === 'budget-invalid'), true);
  assert.deepEqual(localized[0].actors, ['planner']);
  const repair = await syncytium.repairInvariant(fault.sessionId, { invariantId: 'budget-nonnegative' });
  assert.equal(repair.repaired, true);
  assert.equal(repair.plan.strategy, 'RESTORE_PREVIOUS_VALUE');
  assert.equal(repair.result.snapshot.sharedFields.budget, 5);
}

main().then(() => console.log('Syncytium causal diagnostics checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
