const assert = require('assert');
const syncytium = require('../src/services/syncytiumService');
const { createSyncytiumCrdt, roleColor } = require('../src/services/syncytiumCrdtService');

console.log('=== TEST 1: Syncytium Mission Analysis & Composition ===');
const analysis = syncytium.analyzeMission('Édition collaborative en temps réel avec CRDT et synchronisation continue.');
assert.equal(analysis.recommended, true);
assert.equal(analysis.mode, 'syncytium');
assert.equal(analysis.crdtReady, true);
assert.equal(analysis.members.length, 4);
assert.deepEqual(
  analysis.members.map((m) => m.role),
  ['shared_state_coordinator', 'parallel_executor', 'consistency_guardian', 'integration_executor']
);
console.log('  ✅ Analyse et composition des 4 agents Syncytium validées.');

console.log('\n=== TEST 2: Concurrent CRDT Operations & Non-Blocking State ===');
const crdt = createSyncytiumCrdt();

// 1. Parallel Executor inserts code slice
crdt.applyOp({
  opId: 'op-exec-1',
  agentId: 'agent-exec',
  role: 'parallel_executor',
  timestampMs: 1000,
  kind: { type: 'insert_text', index: 0, text: 'export function processBatch() {}' }
});

// 2. Consistency Guardian sets invariant field
crdt.applyOp({
  opId: 'op-guard-1',
  agentId: 'agent-guard',
  role: 'consistency_guardian',
  timestampMs: 1050,
  kind: { type: 'set_field', key: 'typeSafetyChecked', value: true }
});

let snapshot = crdt.getSnapshot();
assert.equal(snapshot.textContent, 'export function processBatch() {}');
assert.equal(snapshot.sharedFields.typeSafetyChecked, true);
assert.equal(snapshot.totalOps, 2);
console.log('  ✅ Opérations concurrentes CRDT sans corruption validées.');

console.log('\n=== TEST 3: Multi-Agent Cursors Tracking (4 Roles) ===');
const roles = [
  ['coord-1', 'shared_state_coordinator', 1, 10],
  ['exec-2', 'parallel_executor', 2, 20],
  ['guard-3', 'consistency_guardian', 3, 5],
  ['integ-4', 'integration_executor', 4, 30]
];

for (const [agentId, role, line, column] of roles) {
  crdt.applyOp({
    opId: `cur-${agentId}`,
    agentId,
    role,
    timestampMs: 1200,
    kind: { type: 'update_cursor', line, column, selection: [column, column + 5] }
  });
}

snapshot = crdt.getSnapshot();
assert.equal(snapshot.cursors.length, 4);
const coordCursor = snapshot.cursors.find((c) => c.role === 'shared_state_coordinator');
assert.equal(coordCursor.color, roleColor('shared_state_coordinator'));
console.log('  ✅ Curseurs des 4 agents avec couleurs distinctes validés.');

console.log('\n=== TEST 4: Time-Travel Rewind Millisecond by Millisecond ===');
crdt.applyOp({
  opId: 'op-exec-2',
  agentId: 'agent-exec',
  role: 'parallel_executor',
  timestampMs: 2000,
  kind: { type: 'insert_text', index: 31, text: '\n// Slice 2' }
});

const liveSnap = crdt.getSnapshot();
assert.equal(liveSnap.textContent.includes('// Slice 2'), true);

const rewind1500 = crdt.timeTravel(1500);
assert.equal(rewind1500.textContent.includes('// Slice 2'), false);
assert.equal(rewind1500.isTimeTravel, true);
assert.equal(rewind1500.rewindTargetMs, 1500);

const rewind2500 = crdt.timeTravel(2500);
assert.equal(rewind2500.textContent.includes('// Slice 2'), true);
console.log('  ✅ Time-Travel rewind exact milliseconde par milliseconde validé.');

console.log('\n=== TEST 5: Invariant Check & Fault Localization ===');
crdt.applyOp({
  opId: 'op-inv-1',
  agentId: 'agent-guard',
  role: 'consistency_guardian',
  timestampMs: 3000,
  kind: {
    type: 'check_invariant',
    name: 'memory_safety',
    passed: false,
    error: 'Detected unauthorized mutation outside bounded slice'
  }
});

const finalSnap = crdt.getSnapshot();
const memoryInv = finalSnap.invariants.find((inv) => inv.name === 'memory_safety');
assert(memoryInv);
assert.equal(memoryInv.passed, false);
assert.match(memoryInv.failureReason, /Detected unauthorized mutation/);
console.log('  ✅ Vérification d invariant et localisation de faute validées.');

console.log('\n=== TEST 6: Op Without kind Must Not Crash ===');
const malformedCrdt = createSyncytiumCrdt();
malformedCrdt.applyOp({
  opId: 'op-broken',
  agentId: 'agent-exec',
  role: 'parallel_executor',
  timestampMs: 4000,
  kind: undefined
});
malformedCrdt.applyOp({
  opId: 'op-no-type',
  agentId: 'agent-exec',
  role: 'parallel_executor',
  timestampMs: 4001,
  kind: {}
});
const malformedSnap = malformedCrdt.getSnapshot();
assert.equal(malformedSnap.textContent, '');
assert.equal(malformedSnap.totalOps, 2);
console.log('  ✅ Opérations sans kind ignorées sans crash validées.');

console.log('\n=============================================================');
console.log('TOUS LES TESTS CRDT ET SYNCHRONISATION SYNCYTIUM ONT RÉUSSI !');
console.log('=============================================================');
