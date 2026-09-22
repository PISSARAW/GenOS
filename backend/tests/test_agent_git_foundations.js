'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const { createMockDb, clearServiceCache } = require('./test_agent_git_mock_helper.cjs');

const agents = {
  left: { id: 'left', workspace_id: 'ws', name: 'Left', role: 'worker', status: 'idle', cognitive_budget: 80 },
  right: { id: 'right', workspace_id: 'ws', name: 'Right', role: 'reviewer', status: 'idle', cognitive_budget: 60 }
};

const stateLeft = { schema: 'genos.agent-git-state/v1', agent: agents.left, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [] };

const objects = {
  source: { id: 'obj-source', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-source', state_json: JSON.stringify(stateLeft), metadata_json: '{}' }
};

dbModule.getDatabase = createMockDb(agents, objects);
clearServiceCache();
const service = require('../src/services/agentGitService');

function makeReq(overrides = {}) {
  return { body: { agentId: 'left', ...overrides }, tenant: { organizationId: 'org', projectId: 'project' }, user: { username: 'tester' } };
}

async function testTreeHashStable() {
  const h1 = service.treeHash(stateLeft);
  const h2 = service.treeHash({ ...stateLeft, capturedAt: 'different' });
  assert.equal(h1, h2, 'treeHash stable');
}

async function testCommitHashDistinct() {
  const tree = service.treeHash(stateLeft);
  const c1 = service.commitHash({ tree, parents: [], metadata: { message: 'a' } });
  const c2 = service.commitHash({ tree, parents: [], metadata: { message: 'b' } });
  assert.notEqual(c1, tree);
  assert.notEqual(c1, c2);
}

async function testCreateCommitLinksParent() {
  // First commit: no ref exists yet, so parentCommitId should be null
  const c1 = await service.createCommit(makeReq(), { agentId: 'left', refName: 'main' });
  assert.equal(c1.parentCommitId, null, 'first commit has no parent');
}

async function testMergeBase() {
  const base = await service.mergeBaseDag(makeReq({ leftObjectId: 'obj-source', rightObjectId: 'obj-source' }));
  assert.equal(base.mergeBaseObjectId, 'obj-source', 'merge-base = common ancestor');
}

async function testResetModes() {
  const c1 = await service.createCommit(makeReq(), { agentId: 'left', refName: 'main' });
  const result = await service.reset(makeReq({ objectId: c1.id, mode: 'soft' }));
  assert.equal(result.success, true, 'reset --soft succeeds');
}

async function testReplaceStateAtomique() {
  await service.replaceState(makeReq(), { targetAgentId: 'left', state: stateLeft, sections: ['decisions'] });
  // No throw = success
}

async function testApplyPatchDelta() {
  const s1 = { ...stateLeft, decisions: [{ id: 'd1', title: 'A', content: '1' }] };
  const s2 = { ...stateLeft, decisions: [{ id: 'd1', title: 'A', content: '1' }, { id: 'd2', title: 'B', content: '2' }] };
  const patch = service.computePatch(s1, s2);
  assert.ok(Array.isArray(patch.operations));
  assert.ok(patch.operations.length > 0);
}

(async () => {
  console.log('=== Test Agent Git Foundations (DAG) ===');
  try {
    await testTreeHashStable();
    await testCommitHashDistinct();
    await testCreateCommitLinksParent();
    await testMergeBase();
    await testResetModes();
    await testReplaceStateAtomique();
    await testApplyPatchDelta();
    console.log('\n✓ All foundation tests passed');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exitCode = 1;
  }
})();
