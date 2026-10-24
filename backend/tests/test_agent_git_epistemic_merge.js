'use strict';

const assert = require('node:assert/strict');
const { mergeDecisions } = require('../src/services/agentGitService/epistemicOps.cjs');

const result = mergeDecisions({
  base: [{ id: 'stable', content: 'same' }, { id: 'conflict', content: 'base', synaptic_weight: 0.5 }],
  left: [{ id: 'stable', content: 'same' }, { id: 'conflict', content: 'left', synaptic_weight: 0.2 }],
  right: [{ id: 'stable', content: 'same' }, { id: 'conflict', content: 'right', synaptic_weight: 0.9 }],
  leftObjectId: 'left-commit',
  rightObjectId: 'right-commit'
});

assert.deepEqual(result.decisions, [{ id: 'stable', content: 'same' }]);
assert.equal(result.contradictions.length, 1);
assert.equal(result.contradictions[0].resolution, 'unresolved');
assert.equal(result.contradictions[0].left.synaptic_weight, 0.2);
assert.equal(result.contradictions[0].right.synaptic_weight, 0.9);
console.log('AgentGit epistemic merge passed.');
