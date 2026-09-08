const assert = require('node:assert/strict');
const { decideFromEvent } = require('../src/services/orchestrationDecisionService');

assert.equal(decideFromEvent({ eventType: 'AGENT_FAILED' }).gateId, 'replay_or_escalate');
assert.equal(decideFromEvent({ eventType: 'HARD_INVARIANT_FAILURE' }).gateId, 'fork_or_delegate');
assert.equal(decideFromEvent({ eventType: 'AGENT_COMPLETED', payload: { advice: 'evidence' } }).gateId, 'select_or_merge_hypotheses');
console.log('Orchestration decisions identify the autonomy gate they consume.');