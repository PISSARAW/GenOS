'use strict';

const assert = require('node:assert/strict');
const { encodeMission, decodeMission, decodeMissionInput } = require('../src/services/runtimeProtocol');
const envelope = require('../src/services/agentMissionEnvelopeService');

function run() {
  const resolvedMemory = { status: 'attached', text: 'memory payload', estimatedTokens: 3 };
  const coordinationPolicy = {
    variant: 'cross_functional_pod',
    communicationCadence: 'continuous_sync',
    sharedState: true
  };
  const decoded = decodeMission(encodeMission({
    agentId: 'worker-protocol-test',
    executionRunId: 'run-protocol-test',
    missionId: 'mission-protocol-test', episodeId: 'episode-protocol-test',
    threadId: 'thread-protocol-test', organizationId: 'org-protocol-test',
    projectId: 'project-protocol-test',
    organization: 'cross_functional_pod',
    coordinationPolicy,
    memoryContext: resolvedMemory
  }));

  assert.equal(decoded.organization, 'cross_functional_pod');
  assert.equal(decoded.executionRunId, 'run-protocol-test');
  assert.deepEqual({ missionId: decoded.missionId, episodeId: decoded.episodeId,
    threadId: decoded.threadId, organizationId: decoded.organizationId,
    projectId: decoded.projectId }, {
    missionId: 'mission-protocol-test', episodeId: 'episode-protocol-test',
    threadId: 'thread-protocol-test', organizationId: 'org-protocol-test',
    projectId: 'project-protocol-test'
  });
  assert.deepEqual(decoded.coordinationPolicy, coordinationPolicy);
  assert.equal(decoded.coordinationPolicyJson, JSON.stringify(coordinationPolicy));
  assert.deepEqual(decoded.memoryContext, resolvedMemory);

  const jsonMission = decodeMissionInput(Buffer.from(JSON.stringify({ agentId: 'json-worker',
    memoryContextJson: JSON.stringify({ status: 'omitted_budget', text: '' }) })));
  assert.deepEqual(jsonMission.memoryContext, { status: 'omitted_budget', text: '' });

  const built = envelope.build({
    normalizedMission: { organization: 'cross_functional_pod', coordinationPolicy,
      memoryContext: resolvedMemory,
      missionId: 'mission-envelope-test', missionScope: {
        episodeId: 'episode-envelope-test', threadId: 'thread-envelope-test'
      } },
    executionRun: { id: 'run-envelope-test' },
    controlTenant: { organization_id: 'org-envelope-test', project_id: 'project-envelope-test' },
    workspaceRoot: process.cwd(), dispatchedAgent: { execution_mode: 'worker' },
    runtimeBudget: {}, autonomyPlan: {}, genosCapsule: {}
  }, { agentId: 'worker-envelope-test' }, {});
  const envelopeDecoded = decodeMission(encodeMission(built));
  assert.equal(envelopeDecoded.organization, 'cross_functional_pod');
  assert.equal(envelopeDecoded.executionRunId, 'run-envelope-test');
  assert.deepEqual({ missionId: envelopeDecoded.missionId,
    episodeId: envelopeDecoded.episodeId, threadId: envelopeDecoded.threadId,
    organizationId: envelopeDecoded.organizationId,
    projectId: envelopeDecoded.projectId }, {
    missionId: 'mission-envelope-test', episodeId: 'episode-envelope-test',
    threadId: 'thread-envelope-test', organizationId: 'org-envelope-test',
    projectId: 'project-envelope-test'
  });
  assert.deepEqual(envelopeDecoded.coordinationPolicy, coordinationPolicy);
  assert.deepEqual(envelopeDecoded.memoryContext, resolvedMemory);
  console.log('Runtime coordination protocol regression passed.');
}

run();
