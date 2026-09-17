const assert = require('node:assert/strict');
const supervisor = require('../src/services/agentProcessSupervisor');

const failure = supervisor.reportOrchestrationActionFailure({
  ownerId: 'orch-1',
  agentId: 'worker-1',
  event: { id: 'evt-1', eventType: 'AGENT_FAILED' },
  decision: { action: 'replay_and_rediagnose', tool: 'genos_replay' },
  error: new Error('MCP unavailable')
});
assert.deepEqual(failure, {
  sourceAgentId: 'worker-1',
  sourceEvent: 'AGENT_FAILED',
  eventId: 'evt-1',
  tool: 'genos_replay',
  error: 'MCP unavailable'
});
console.log('Orchestration action exceptions are emitted as durable failures.');
