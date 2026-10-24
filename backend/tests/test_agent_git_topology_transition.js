'use strict';

const assert = require('node:assert/strict');
const { readTransitionReceipt } = require('../src/services/agentGitService/topologyOps.cjs');

const receipt = readTransitionReceipt(JSON.stringify({
  topology: 'trinity', committed: true, transitionId: 'transition-1', commitId: 'source-commit', variantId: 'verified'
}));
assert.equal(receipt.valid, true);
assert.deepEqual(receipt.transition, {
  topology: 'trinity', transitionId: 'transition-1', commitId: 'source-commit', variantId: 'verified'
});
assert.equal(readTransitionReceipt('{').valid, false);
assert.equal(readTransitionReceipt(JSON.stringify({ topology: 'trinity', committed: false, transitionId: 'draft' })).valid, false);
assert.equal(readTransitionReceipt(JSON.stringify({ topology: 'not-a-topology', committed: true, transitionId: 'x' })).valid, false);
console.log('AgentGit topology transition passed.');
