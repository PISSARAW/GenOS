'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { treeHash } = require('../src/services/agentGitService/canonical');
const { signObjectLocal } = require('../src/services/agentGitService/verifyHelpers.cjs');
const { verifyMergeEvidence } = require('../src/services/agentGitService/verifiedMerge.cjs');

const state = { agent: { id: 'a1' }, decisions: [], runs: [], permissions: [] };
const stateJson = JSON.stringify(state);
const stateHash = crypto.createHash('sha256').update(stateJson).digest('hex');
const tree = treeHash(state);
const metadata = {};
const valid = {
  id: 'commit-1',
  state_json: stateJson,
  state_hash: stateHash,
  tree_hash: tree,
  metadata_json: JSON.stringify(metadata),
  signature: signObjectLocal(tree, metadata)
};

assert.equal(verifyMergeEvidence({ sources: [valid, valid], mergedState: state }).verified, true);
const tampered = { ...valid, state_json: JSON.stringify({ ...state, agent: { id: 'tampered' } }) };
const result = verifyMergeEvidence({ sources: [tampered, valid], mergedState: state });
assert.equal(result.verified, false);
assert.ok(result.issues.some((issue) => issue.issue === 'state_hash_mismatch'));
console.log('AgentGit verified merge passed.');
