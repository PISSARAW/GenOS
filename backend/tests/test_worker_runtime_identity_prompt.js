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
  organization: 'cross_functional_pod',
  coordinationPolicy: { communicationCadence: 'continuous_sync' },
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
  allowedCommands: ['node mcp/test_lease.js'],
  genosCapsule: {},
  capabilities: []
});
assert.match(prompt, /\[IDENTITY\]\nAgent ID: worker-identity-1/);
assert.match(prompt, /Name: Kofi-a1b2c3/);
assert.match(prompt, /Mission ID: mission-social-1/);
assert.match(prompt, /Orchestrator ID: orchestrator-social-1/);
assert.match(prompt, /COMMANDS ALLOWED/);
assert.match(prompt, /node mcp\/test_lease\.js/);
assert.match(prompt, /Call these GenOS MCP tools directly by exact name/);
assert.match(prompt, /not MCP resources/);
assert.match(prompt, /genos_organization_state/);
assert.match(prompt, /genos_worker_publish/);
assert.match(prompt, /genos_worker_inbox/);
assert.match(prompt, /recipient_agent_id/);
assert.match(prompt, /in_reply_to/);
assert.match(prompt, /acknowledge_message_ids/);
assert.match(prompt, /list_mcp_resources/);

console.log('Worker runtime identity prompt: PASS');
