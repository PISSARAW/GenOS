'use strict';
const assert = require('node:assert/strict');
const { select } = require('../../benchmarks/qwen-worker-missions/evidence-scope.cjs');
function fixture() {
  return { cli: { workerId: 'worker', orchestratorId: 'parent' }, expectedModel: 'ollama://qwen-test',
    agents: [{ id: 'worker', parent_agent_id: 'parent', execution_mode: 'worker' }],
    missions: [{ mission_id: 'mission', orchestrator_agent_id: 'parent' }],
    members: [{ mission_id: 'mission', agent_id: 'worker' }],
    bindings: [{ run_id: 'run', mission_id: 'mission', agent_id: 'worker' }],
    runs: [{ id: 'run', agent_id: 'worker', status: 'blocked', metrics_json: '{"tokens":12}' }],
    events: [{ type: 'AGENT_HALTED', agentId: 'worker', run: 'run', model: 'ollama://qwen-test', usage: { tokens: 12 } }],
    modelAttempts: [{ id: 'attempt', agent_id: 'worker', mission_id: 'run', model: 'ollama://qwen-test',
      provider_called: 1, token_usage_source: 'provider', input_tokens: 8, output_tokens: 4 }] };
}
const blocked = select(fixture());
assert.equal(blocked.modelInvocationMeasured, true);
assert.equal(blocked.terminalResponseMeasured, false);
assert.equal(blocked.measurement.measuredTokens, 12);
for (const field of ['agent_id', 'mission_id', 'model']) {
  const input = fixture(); input.modelAttempts[0][field] = 'foreign';
  assert.equal(select(input).modelInvocationMeasured, false, field);
}
const uncalled = fixture(); uncalled.modelAttempts[0].provider_called = 0;
assert.equal(select(uncalled).modelInvocationMeasured, false);
const partial = fixture(); partial.modelAttempts[0].token_usage_source = 'estimated';
assert.equal(select(partial).modelInvocationMeasured, false);
assert.equal(select(partial).measurement.complete, false);
const duplicate = fixture(); duplicate.modelAttempts.push({ ...duplicate.modelAttempts[0] });
assert.equal(select(duplicate).modelInvocationMeasured, false);
const mismatch = fixture(); mismatch.runs[0].metrics_json = '{"tokens":13}';
assert.equal(select(mismatch).modelInvocationMeasured, false);
const completed = fixture(); completed.runs[0].status = 'completed'; completed.events[0].type = 'AGENT_COMPLETED';
assert.equal(select(completed).modelInvocationMeasured, false, 'Historical call cannot qualify an unattributed completed report.');
completed.events[0].provider = 'ollama';
assert.equal(select(completed).modelInvocationMeasured, true);
assert.equal(select(completed).terminalResponseMeasured, true);
const lastUncalled = fixture(); lastUncalled.modelAttempts.push({ id: 'denied', agent_id: 'worker', mission_id: 'run',
  model: 'ollama://qwen-test', provider_called: 0, token_usage_source: 'not_called', input_tokens: 0, output_tokens: 0 });
assert.equal(select(lastUncalled).modelInvocationMeasured, true);
assert.equal(select(lastUncalled).measurement.providerCalls, 1);
console.log('Exact-run invocation remains measured after a provider-free refusal; completed producer attribution stays strict: PASS');
