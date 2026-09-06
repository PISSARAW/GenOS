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
console.log('Later phases detect unfinished predecessors.');