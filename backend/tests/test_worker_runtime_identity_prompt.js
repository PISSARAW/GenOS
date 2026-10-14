'use strict';

const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { buildAgentRuntimePrompt } = require('../bin/agent-runtime-prompt.cjs');

const mission = buildWorkerMission({
  agentId: 'worker-identity-1',
  name: 'Kofi-a1b2c3',
  nameMeaning: 'Patient identity witness',
  missionId: 'mission-social-1',
  orchestratorAgentId: 'orchestrator-social-1',
  role: 'identity_witness',
  workerKind: 'bounded_worker',
  prompt: 'Verify the identities of your peers.',
  strategyContract: {},
  toolLease: []
});

assert.equal(mission.name, 'Kofi-a1b2c3');
assert.equal(mission.nameMeaning, 'Patient identity witness');
const prompt = buildAgentRuntimePrompt({
  selfIntro: 'Je suis Kofi-a1b2c3.',
  agentName: mission.name,
  mission,
  isWorker: true,
  toolLease: [],
  strategyContract: {},
  runtimeContract: {},
  autonomyPlan: {},
  runtimeAutonomyPlan: {},
  executionPolicy: {},
  genosCapsule: {},
  capabilities: []
});
assert.match(prompt, /\[IDENTITY\]\nAgent ID: worker-identity-1/);
assert.match(prompt, /Name: Kofi-a1b2c3/);
assert.match(prompt, /Mission ID: mission-social-1/);
assert.match(prompt, /Orchestrator ID: orchestrator-social-1/);

console.log('Worker runtime identity prompt: PASS');
