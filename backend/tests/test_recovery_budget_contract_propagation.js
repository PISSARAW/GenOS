'use strict';

const assert = require('node:assert/strict');
const { buildRecoveryMission } = require('../src/services/agentRecovery/dispatchWorkerRecovery');

const sourceCoordination = { communicationCadence: 'continuous_sync' };
const input = {
  mission: {
    executionBudget: { tokens: 30000 },
    workerContract: {
      resources: { maxTokens: 30000 },
      mission: { communicationRequired: true, coordinationPolicy: sourceCoordination }
    }
  },
  sourceAgentId: 'source-worker',
  target: { targetId: 'recovery-worker', name: 'Recovery', role: 'recovery_specialist', prompt: 'Verify scope.' },
  workspace: { workspaceRoot: 'D:/workspace', workspaceId: 'recovery-ws' },
  bisectionResult: null,
  report: { mission: 'Verify scope.', attempt: 0, maxAttempts: 3 },
  orchestratorId: 'orchestrator',
  decision: { action: 'fork_worker', identity: 'new' },
  nextVariant: 1
};

const inherited = buildRecoveryMission(input);
assert.equal(inherited.workerTokenLimit, 30000,
  'a replacement inherits the source contract token ceiling when no top-level limit exists');
assert.equal(inherited.communicationRequired, true,
  'a replacement inherits the source contract communication requirement');
assert.deepEqual(inherited.coordinationPolicy, sourceCoordination,
  'a replacement inherits the source contract coordination policy');

const explicitPolicy = { communicationCadence: 'checkpointed' };
const explicit = buildRecoveryMission({ ...input, mission: {
  ...input.mission, workerTokenLimit: 40000, communicationRequired: true,
  coordinationPolicy: explicitPolicy
} });
assert.equal(explicit.workerTokenLimit, 40000, 'an explicit recovery limit remains authoritative');
assert.deepEqual(explicit.coordinationPolicy, explicitPolicy, 'an explicit coordination policy remains authoritative');

console.log('Recovery missions preserve allocated token and communication contracts.');
