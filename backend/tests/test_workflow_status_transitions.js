const assert = require('node:assert/strict');
const { workflowTransitionAllowed } = require('../src/controllers/workflowController');

assert.equal(workflowTransitionAllowed('draft', 'staging'), true);
assert.equal(workflowTransitionAllowed('staging', 'published'), true);
assert.equal(workflowTransitionAllowed('published', 'draft'), false);
assert.equal(workflowTransitionAllowed('published', 'published'), true);
assert.equal(workflowTransitionAllowed('archived', 'published'), false);
console.log('Workflow status transition checks passed.');