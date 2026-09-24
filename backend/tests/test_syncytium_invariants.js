'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Budget and release invariants.', {
    schema: {
      fields: [
        { path: 'budget', dataType: 'PN_COUNTER', consistencyZone: 'INVARIANT_PRESERVING' },
        { path: 'release.note', dataType: 'LWW_REGISTER' }
      ],
      invariants: [
        { id: 'budget-nonnegative', scope: 'budget', dependencies: ['budget'], predicate: { op: 'non_negative', path: 'budget' }, severity: 'ERROR' },
        { id: 'budget-advisory-cap', scope: 'budget', predicate: { op: 'max', path: 'budget', value: 3 }, severity: 'WARNING' },
        { id: 'release-note-required', scope: ['release.note'], predicate: { op: 'present', path: 'release.note' }, severity: 'ERROR' }
      ]
    }
  });

  const accepted = await syncytium.applyOperation(session.sessionId, {
    opId: 'budget-credit', actorId: 'finance', kind: { type: 'typed_field', key: 'budget', action: 'increment', delta: 4 }
  });
  assert.equal(accepted.snapshot.sharedFields.budget, 4);
  assert.equal(accepted.invariants.find((item) => item.invariantId === 'budget-nonnegative').passed, true);
  assert.equal(accepted.invariants.find((item) => item.invariantId === 'budget-advisory-cap').passed, false);
  assert.equal(accepted.invariants.some((item) => item.invariantId === 'release-note-required'), false);

  const unrelated = await syncytium.applyOperation(session.sessionId, {
    opId: 'release-note', actorId: 'release', kind: { type: 'set_field', key: 'release.note', value: 'Reviewed.' }
  });
  assert.deepEqual(unrelated.invariants.map((item) => item.invariantId), ['release-note-required']);
  assert.equal(unrelated.invariants[0].passed, true);

  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'budget-overspend', actorId: 'finance', kind: { type: 'typed_field', key: 'budget', action: 'increment', delta: -9 }
  }), (error) => error.code === 'SYNCYTIUM_INVARIANT_VIOLATION'
    && error.violations.some((item) => item.invariantId === 'budget-nonnegative'));
  const snapshot = await syncytium.snapshot(session.sessionId);
  assert.equal(snapshot.shared.logSize, 2);
  assert.equal(snapshot.shared.sharedFields.budget, 4);

  assert.throws(() => require('../src/services/syncytiumSchemaService').compile({
    invariants: [{ id: 'unsafe', evaluationMode: 'MODEL_ASSISTED', predicate: { op: 'present', path: 'x' } }]
  }), (error) => error.code === 'SYNCYTIUM_INVARIANT_SCHEMA_INVALID');
  assert.throws(() => require('../src/services/syncytiumSchemaService').compile({
    invariants: [{ id: 'unknown', predicate: { op: 'eval', path: 'x' } }]
  }), (error) => error.code === 'SYNCYTIUM_INVARIANT_SCHEMA_INVALID');
}

main().then(() => console.log('Syncytium invariant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
