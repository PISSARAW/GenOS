const assert = require('node:assert/strict');
const { resolveOrchestratorId } = require('../src/services/primitiveHandlers/collective');

assert.equal(resolveOrchestratorId({ workspaceId: 'workspace-only', agentId: 'agent-only' }), null);
assert.equal(resolveOrchestratorId({ orchestrator_id: 'orch-snake' }), 'orch-snake');
assert.equal(resolveOrchestratorId({ orchestratorId: 'orch-camel', orchestrator_id: 'other' }), 'orch-camel');

console.log('Collective identifier contract: PASS');