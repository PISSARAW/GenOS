'use strict';

const assert = require('node:assert/strict');
const { classifyOutput } = require('../../scripts/syncytium-launch-evidence.cjs');
assert.equal(classifyOutput({ raw: 'transport succeeded' }), 'partial');
assert.equal(classifyOutput({ biologicalMode: { complete: true, status: 'completed',
  semanticValidation: { status: 'complete' } } }), 'partial');
assert.equal(classifyOutput({ biologicalMode: { complete: true, status: 'completed',
  semanticValidation: { status: 'complete' }, stateValidation: { status: 'verified' } } }), 'completed');
const syncytium = require('../src/services/syncytiumCoordinationService');
const completion = require('../src/services/syncytiumMissionCompletionService');

function workerOutput() { return { members: [{ status: 'completed' }], dispatchFailures: [] }; }
function semantic() { return { status: 'complete', workerCount: 1, coveredWorkers: 1 }; }

async function main() {
  const session = await syncytium.createSession('A response is not a state proof.', {
    schema: { fields: { result: { dataType: 'LWW_REGISTER' } }, invariants: [
      { id: 'result-present', predicate: { op: 'present', path: 'result' } }
    ] }
  });
  assert.equal((await syncytium.snapshot(session.sessionId)).consistency.verdict, 'divergent');
  assert.equal(completion.applySemanticValidation(workerOutput(), semantic(), 1).complete, false);
  const empty = await completion.validateSession(session.sessionId);
  assert.equal(empty.status, 'incomplete');
  assert.ok(empty.reasons.includes('EMPTY_SHARED_STATE'));
  await syncytium.applyOperation(session.sessionId, { opId: 'result', actorId: 'worker',
    kind: { type: 'set_field', key: 'result', value: 'verified result' } });
  assert.ok((await completion.validateSession(session.sessionId)).reasons.includes('MATERIALIZATION_MISSING_OR_STALE'));
  await syncytium.createSnapshot(session.sessionId);
  const accepted = await completion.validateAndComplete({ sessionId: session.sessionId,
    output: workerOutput(), validation: semantic(), expectedCount: 1 });
  assert.equal(accepted.complete, true);
  assert.equal(accepted.stateValidation.stateVersion, 1);
  assert.equal(accepted.stateValidation.invariants[0].passed, true);
  await syncytium.applyOperation(session.sessionId, { opId: 'later', actorId: 'worker',
    kind: { type: 'set_field', key: 'result', value: 'later result' } });
  const stale = await completion.validateAndComplete({ sessionId: session.sessionId,
    output: workerOutput(), validation: semantic(), expectedCount: 1 });
  assert.equal(stale.complete, false);
  assert.equal(stale.status, 'partial');
  assert.ok(stale.stateValidation.reasons.includes('MATERIALIZATION_MISSING_OR_STALE'));
  assert.equal((await completion.validateSession('missing')).status, 'incomplete');
  console.log('Syncytium mission completion evidence gates: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
