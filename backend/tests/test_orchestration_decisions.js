const assert = require('assert');
const { decideFromEvent } = require('./src/services/orchestrationDecisionService');

assert.equal(decideFromEvent({ eventType: 'AGENT_FAILED' }).tool, 'genos_replay');
assert.equal(decideFromEvent({ eventType: 'HARD_INVARIANT_FAILURE' }).organization, 'red_blue_coevolution');
assert.equal(decideFromEvent({ eventType: 'AGENT_COMPLETED', payload: { advice: 'counterexample' } }).tool, 'genos_evaluate_trajectories');
assert.equal(decideFromEvent({ eventType: 'AGENT_COMPLETED', payload: { advice: 'patch', proposal: {} } }).tool, 'genos_record_experience');
assert.equal(decideFromEvent({ eventType: 'PARASITISM_MANIFEST_READY' }).tool, 'genos_parasitic_pressure');
assert.equal(decideFromEvent({ eventType: 'AGENT_COMPLETED' }).action, 'replay_before_promotion');
assert.equal(decideFromEvent({ eventType: 'AGENT_STEP' }), null);
console.log('Orchestration decision checks passed.');
