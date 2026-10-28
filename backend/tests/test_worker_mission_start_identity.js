'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const missionStartIdentities = require('../src/services/agentRuntimeAdapter/missionStartIdentityState').missionStartIdentities;
const missionExecution = require('../src/services/agentRuntimeAdapter/missionExecution');
const { missionStartFingerprint } = require('../src/services/agentRuntimeAdapter/missionStartIdentity');

async function main() {
  const agentId = `worker-start-identity-${crypto.randomUUID()}`;
  const payload = { agentId, missionId: 'mission-one', prompt: 'Inspect the assigned branch.',
    orchestratorAgentId: 'orchestrator-one', workspaceRoot: 'C:/workspace/one',
    missionExecutionAuthority: { executionAuthorityRef: 'authority-one', revision: 4 } };
  const reordered = { missionExecutionAuthority: { revision: 4, executionAuthorityRef: 'authority-one' },
    workspaceRoot: 'C:/workspace/one', orchestratorAgentId: 'orchestrator-one', prompt: 'Inspect the assigned branch.',
    missionId: 'mission-one', agentId };
  assert.equal(missionStartFingerprint(payload), missionStartFingerprint(reordered),
    'object key ordering must not make an otherwise identical launch conflict');

  const activeStart = Promise.resolve({ started: true, missionId: payload.missionId });
  const orchestration = require('../src/services/agentOrchestrationState');
  orchestration.missionStarts.set(agentId, activeStart);
  missionStartIdentities.set(agentId, missionStartFingerprint(payload));
  try {
    assert.strictEqual(missionExecution.startMission(reordered), activeStart,
      'an identical retry must join the current launch promise');
    for (const conflicting of [
      { ...payload, prompt: 'Run a different prompt.' },
      { ...payload, workspaceRoot: 'C:/workspace/two' },
      { ...payload, missionExecutionAuthority: { executionAuthorityRef: 'authority-two', revision: 4 } }
    ]) {
      await assert.rejects(missionExecution.startMission(conflicting), {
        code: 'AGENT_MISSION_ALREADY_RUNNING'
      });
    }
  } finally {
    orchestration.missionStarts.delete(agentId);
    missionStartIdentities.delete(agentId);
  }
  console.log('Worker mission start retries join only when the canonical payload hash matches.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
