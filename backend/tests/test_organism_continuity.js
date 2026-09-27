'use strict';

const assert = require('node:assert/strict');
const continuity = require('../src/services/organismContinuityService');

function verifyDormancyCycle() {
  const record = continuity.enterDormancy(
    { id: 'agent-7', memory: { mission: 'survey', progress: 0.4 }, criticalFunctions: ['survey'] },
    'host evacuation'
  );
  assert.equal(record.state, 'dormant');
  assert.equal(record.memorySnapshot.progress, 0.4);
  const blocked = continuity.awakenDormant(record, { healthy: false, reason: 'host still down' });
  assert.equal(blocked.state, 'dormant');
  const awakened = continuity.awakenDormant(record, { healthy: true });
  assert.equal(awakened.state, 'active');
  assert.equal(awakened.restoredMemory.mission, 'survey');
  assert.deepEqual(awakened.restoredFunctions, ['survey']);
}

function verifySuccessionPlan() {
  const plan = continuity.planSuccession(
    {
      deceasedId: 'worker-3',
      criticalFunction: 'verify',
      workspaceId: 'w-1',
      lineage: 'line-a',
      memorySnapshot: { claims: ['c1'], evidence: ['e1'] },
      topology: 'trinity',
      event: { error: 'process exited' },
      mission: { mission: 'verify the patch' }
    },
    [
      { id: 'reserve-1', workspaceId: 'w-9', lineage: 'line-b', capabilities: ['verify'] },
      { id: 'reserve-2', workspaceId: 'w-1', lineage: 'line-a', capabilities: ['verify'] }
    ]
  );
  assert.equal(plan.successorId, 'reserve-2');
  assert.deepEqual(plan.memoryRestored, ['claims', 'evidence']);
  assert.ok(Array.isArray(plan.regenerationPath) && plan.regenerationPath.length >= 2);
  assert.ok(plan.recoveryDecision, 'succession must carry the recovery decision');
}

function verifyNoSuccessor() {
  const plan = continuity.planSuccession(
    { deceasedId: 'worker-9', criticalFunction: 'verify', event: {}, mission: {} },
    []
  );
  assert.equal(plan.successorId, null);
  assert.ok(Array.isArray(plan.regenerationPath));
}

verifyDormancyCycle();
verifySuccessionPlan();
verifyNoSuccessor();
console.log('Organism continuity tests passed.');
