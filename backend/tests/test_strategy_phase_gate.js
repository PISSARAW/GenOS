const assert = require('node:assert/strict');
const strategy = require('../src/services/strategyExecutionService');

const steps = [
  { sequence: 0, stage_key: 'snapshot', status: 'planned' },
  { sequence: 1, stage_key: 'promotion', status: 'planned' }
];
assert.match(strategy.unfinishedPhaseReason(steps, 1), /snapshot/);
steps[0].status = 'completed';
assert.equal(strategy.unfinishedPhaseReason(steps, 1), null);
assert.equal(strategy.compileExecutionPlan({ execution_pipeline: ['snapshot', 'promotion'] }).steps.length, 2);
assert.equal(strategy.parseRun({ id: 'r1', agent_id: 'a1', status: 'completed', metrics_json: '{}', budget_json: '{}' }, []).epistemicState.verdict, 'verified');
assert.equal(strategy.parseRun({ id: 'r2', agent_id: 'a1', status: 'blocked', guardrail_reason: 'missing proof', metrics_json: '{}', budget_json: '{}' }, []).epistemicState.verdict, 'blocked');
assert.equal(strategy.parseRun({ id: 'r3', agent_id: 'a1', status: 'awaiting_approval', metrics_json: '{}', budget_json: '{}' }, []).epistemicState.verdict, 'pending_approval');
assert.equal(strategy.parseRun({ id: 'r4', agent_id: 'a1', status: 'planned', metrics_json: '{}', budget_json: '{}' }, []).epistemicState.verdict, 'unverified');
console.log('Later phases detect unfinished predecessors.');