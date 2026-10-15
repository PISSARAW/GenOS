'use strict';

const assert = require('node:assert/strict');
const { arbitrateGroupNeeds } = require('../src/services/morphogenesis/groupResourceNegotiation');

function fixture() {
  return {
    budget: 70,
    groups: [
      { id: 'alpha', state: 'active', governance: 'local', needs: [{ id: 'analysis', requestedTokens: 100,
        minimumTokens: 50, marginalValue: 0.9, confidence: 1, evidenceRefs: ['receipt:a'],
        workerKind: 'specialist', workerCount: 2, governance: 'collective' }] },
      { id: 'beta', state: 'active', governance: 'local', needs: [{ id: 'probe', requestedTokens: 20,
        minimumTokens: 10, marginalValue: 0.8, confidence: 1, evidenceRefs: ['receipt:b'] }] }
    ],
    availableWorkers: [{ id: 'worker:1', groupId: 'donor', workerKind: 'specialist', transferable: true }],
    spawnAuthority: false,
    governanceAuthority: []
  };
}

function testMarginalAllocationAndBoundedActions() {
  const result = arbitrateGroupNeeds(fixture());
  assert.equal(result.allocatedTokens, 70);
  assert.equal(result.unallocatedTokens, 0);
  assert.deepEqual(result.allocations.map((entry) => [entry.groupId, entry.allocatedTokens, entry.status]), [
    ['beta', 20, 'funded'], ['alpha', 50, 'partial']
  ]);
  assert.deepEqual(result.actions, [
    { type: 'transfer', workerId: 'worker:1', fromGroupId: 'donor', toGroupId: 'alpha', status: 'proposed' },
    { type: 'spawn', workerKind: 'specialist', toGroupId: 'alpha', status: 'pending_authority' },
    { type: 'regovernance', groupId: 'alpha', from: 'local', to: 'collective', status: 'pending_authority' }
  ]);
}

function testSleepWakeAndEvidenceGate() {
  const input = { budget: 10, groups: [
    { id: 'sleeping', state: 'sleeping', wakeSignal: { marginalValue: 0.8, evidenceRefs: ['new:1'] },
      needs: [{ id: 'resume', requestedTokens: 10, minimumTokens: 5, marginalValue: 0.7, confidence: 1, evidenceRefs: ['need:1'] }] },
    { id: 'stale', state: 'sleeping', wakeSignal: { marginalValue: 1, evidenceRefs: [] },
      needs: [{ id: 'stale-work', requestedTokens: 10, marginalValue: 1, confidence: 1 }] }
  ] };
  const result = arbitrateGroupNeeds(input);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].groupId, 'sleeping');
  assert.deepEqual(result.groupStates, [
    { groupId: 'sleeping', state: 'active', reason: 'qualified_new_evidence' },
    { groupId: 'stale', state: 'sleeping', reason: 'wake_signal_below_threshold' }
  ]);
}

function testDeterminismAndInputBounds() {
  const first = arbitrateGroupNeeds(fixture());
  const second = arbitrateGroupNeeds(fixture());
  assert.deepEqual(first, second);
  const result = arbitrateGroupNeeds({ budget: -5, groups: [{ id: 'idle', needs: [] }] });
  assert.equal(result.budget, 0);
  assert.deepEqual(result.groupStates, [{ groupId: 'idle', state: 'sleeping', reason: 'no_fundable_need' }]);
  assert.throws(() => arbitrateGroupNeeds({ groups: null }), /groups must be an array/);
}

function testHardActionCeiling() {
  const groups = Array.from({ length: 12 }, (_, index) => ({ id: `g${index}`, needs: [{ id: 'need',
    requestedTokens: 1, minimumTokens: 1, marginalValue: 1, confidence: 1,
    evidenceRefs: [`need:${index}`], workerKind: 'specialist', workerCount: 1 }] }));
  const availableWorkers = Array.from({ length: 12 }, (_, index) => ({ id: `w${index}`, groupId: 'donor',
    workerKind: 'specialist', transferable: true }));
  const result = arbitrateGroupNeeds({ budget: 12, groups, availableWorkers,
    policy: { maxTransfers: 100, maxSpawns: 100 } });
  assert.equal(result.actions.filter((action) => action.type === 'transfer').length, 5);
  assert.equal(result.actions.filter((action) => action.type === 'spawn').length, 5);
}

testMarginalAllocationAndBoundedActions();
testSleepWakeAndEvidenceGate();
testDeterminismAndInputBounds();
testHardActionCeiling();
process.stdout.write('Morphogenesis group negotiation tests passed (4 cases).\n');
