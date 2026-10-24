'use strict';

const assert = require('node:assert/strict');
const { compareSection } = require('../src/services/agentGitService/cognitiveOps.cjs');

const before = [
  { id: 'belief-1', title: 'Keep old belief', content: 'Evidence A', cart_nodes_json: '["evidence-a"]', synaptic_weight: 0.6 },
  { id: 'belief-2', title: 'Remove me', content: 'Old' }
];
const after = [
  { id: 'belief-1', title: 'Keep old belief', content: 'Evidence B', cart_nodes_json: '["evidence-b"]', synaptic_weight: 0.2 },
  { id: 'belief-3', title: 'New belief', content: 'Evidence C' }
];
const changes = compareSection({ section: 'decisions', before, after });

assert.deepEqual(changes.map(({ id, change }) => [id, change]), [
  ['belief-1', 'modified'], ['belief-2', 'removed'], ['belief-3', 'added']
]);
assert.deepEqual(changes[0].facets, ['content', 'evidence', 'confidence']);
assert.equal(changes[0].after.content, 'Evidence B');
console.log('AgentGit cognitive diff passed.');
