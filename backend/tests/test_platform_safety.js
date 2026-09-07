const test = require('node:test');
const assert = require('node:assert/strict');
const safety = require('../src/services/platformSafetyService');

test('routes complex uncertain workloads to a capable model and requests approval', () => {
  const result = safety.routeModel({ complexity: 0.95, uncertainty: 0.9, requiredCapabilities: ['reasoning'] });
  assert.equal(result.decision, 'route');
  assert.equal(result.requiresApproval, true);
  assert.ok(result.selected.capabilities.includes('reasoning'));
});

test('Zero Trust denies missing permissions and escalates high-impact tools', () => {
  assert.equal(safety.validateToolCall({ agentId: 'agent-a', toolName: 'read_file' }).decision, 'deny');
  assert.equal(safety.validateToolCall({ agentId: 'agent-a', toolName: 'delete_file', permissions: ['tool:execute'] }).decision, 'approval_required');
  assert.equal(safety.validateToolCall({ agentId: 'agent-a', toolName: 'read_file', permissions: ['tool:execute'], taints: ['external'] }).decision, 'deny');
});

test('model routing rejects malformed capability and token requirements', () => {
  assert.equal(safety.routeModel({ requiredCapabilities: 'reasoning' }).decision, 'invalid-request');
  assert.equal(safety.routeModel({ requiredCapabilities: [''] }).decision, 'invalid-request');
  assert.equal(safety.routeModel({ estimatedInputTokens: -1 }).decision, 'invalid-request');
  assert.equal(safety.routeModel({}, [{ provider: 'x', model: 'm', capabilities: ['reasoning'], costInput: 'bad' }]).decision, 'no-capable-model');
});

test('replay produces deterministic ordered steps and Pareto removes dominated options', () => {
  const replay = safety.buildReplay('inc-1', [{ id: 1, agent_id: 'a', event_type: 'INCIDENT_STEP', action: 'scan', detail: 'x', severity: 'info', created_at: '2026-01-01', payload_json: '{}' }]);
  assert.equal(replay.totalSteps, 1);
  assert.equal(replay.timeline[0].step, 1);
  const result = safety.paretoFrontier([
    { id: 'good', quality: 1, security: 1, cost: 1, latency: 1 },
    { id: 'dominated', quality: 0.5, security: 0.5, cost: 2, latency: 2 }
  ]);
  assert.deepEqual(result.frontier.map(item => item.id), ['good']);
});
