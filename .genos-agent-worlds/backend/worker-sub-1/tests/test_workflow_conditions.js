const assert = require('node:assert/strict');
const { parseWorkflowCondition, validateWorkflowCondition } = require('../src/services/workflowConditions');
assert.equal(validateWorkflowCondition('input.mode == "prod"'), true);
assert.equal(validateWorkflowCondition("input.mode === 'prod'"), true);
assert.equal(validateWorkflowCondition('input.mode=="prod'), false);
assert.equal(validateWorkflowCondition('input.mode == prod'), true);
assert.equal(parseWorkflowCondition('input.mode == "prod"')({ mode: 'prod' }), true);
assert.equal(parseWorkflowCondition('input.mode == "prod"')({ mode: 'dev' }), false);
console.log('Workflow condition checks passed.');
