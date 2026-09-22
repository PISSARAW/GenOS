'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;

const agents = { a1: { id: 'a1', workspace_id: 'ws', name: 'Agent1', role: 'worker', status: 'idle', cognitive_budget: 50, runtime_pid: 123, runtime_started_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01' } };
let objectStore = {}, refStore = {}, parentLinks = {};

function resetStores() {
  for (const k in objectStore) delete objectStore[k];
  for (const k in refStore) delete refStore[k];
  for (const k in parentLinks) delete parentLinks[k];
}

function makeState(overrides = {}) {
  return { schema: 'genos.agent-git-state/v1', agent: { ...agents.a1 }, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [], ...overrides };
}

function handleObjectInsert(args) {
  objectStore[args[0]] = { id: args[0], agent_id: args[1], workspace_id: args[2], object_kind: args[3], ref_name: args[4], remote_name: args[5], state_hash: args[6], state_json: args[7], metadata_json: args[8], signature: args[9], created_by: args[10], parent_commit_id: args[11] || null, tree_hash: args[12] || null, commit_hash: args[13] || null, created_at: new Date().toISOString() };
  return { changes: 1 };
}

function handleRefInsert(args) {
  refStore[args[0]] = { ref_key: args[0], agent_id: args[1], ref_name: args[2], object_id: args[3], version: args[4] };
  return { changes: 1 };
}

function handleParentLink(args) {
  parentLinks[args[0]] = parentLinks[args[0]] || [];
  if (!parentLinks[args[0]].includes(args[1])) parentLinks[args[0]].push(args[1]);
  return { changes: 1 };
}

function handleRefUpdate(args) {
  const key = `${args[1]}:${args[2]}`;
  if (refStore[key]) refStore[key].object_id = args[0];
  return { changes: 1 };
}

function handleRefSelect(args) {
  const key = `${args[0]}:${args[1]}`;
  return { object_id: refStore[key]?.object_id || null };
}

const RUN_HANDLERS = [
  { match: 'INSERT INTO agent_git_objects', handler: handleObjectInsert },
  { match: 'INSERT INTO agent_git_refs', handler: handleRefInsert },
  { match: 'agent_git_commit_parents', handler: handleParentLink },
  { match: 'UPDATE agent_git_refs', handler: handleRefUpdate },
  { match: 'SELECT object_id FROM agent_git_refs', handler: handleRefSelect }
];

function dispatchRun(sql, args) {
  for (const { match, handler } of RUN_HANDLERS) {
    if (sql.includes(match)) return handler(args);
  }
  return { changes: 1 };
}

function mockRun(sql, args) {
  return dispatchRun(sql, args);
}

function mockGet(sql, args) {
  if (sql.includes('FROM agents a')) return agents[args[0]] || null;
  if (sql.includes('FROM agent_git_objects')) return objectStore[args[0]] || null;
  if (sql.includes('FROM agent_git_refs')) {
    if (sql.includes('object_id')) return { object_id: refStore[`${args[0]}:${args[1]}`]?.object_id || null };
    return refStore[`${args[0]}:${args[1]}`] || null;
  }
  return null;
}

function mockAll(sql, args) {
  if (sql.includes('agent_git_objects')) return Object.values(objectStore).filter(o => o.agent_id === args[0]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (sql.includes('agent_git_commit_parents')) {
    const commitId = args[0];
    const explicitParents = parentLinks[commitId] || [];
    const obj = objectStore[commitId];
    const implicitParents = obj?.parent_commit_id ? [obj.parent_commit_id] : [];
    const allParents = [...new Set([...explicitParents, ...implicitParents])];
    return allParents.map(p => ({ commit_id: commitId, parent_commit_id: p }));
  }
  return [];
}

function installMock() {
  dbModule.getDatabase = async () => ({
    get: async (sql, ...args) => mockGet(sql, args),
    all: async (sql, ...args) => mockAll(sql, args),
    run: async (sql, ...args) => mockRun(sql, args),
    exec: async () => ({ changes: 0 })
  });
}

function clearServiceCache() {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('agentGitService') || key.includes('canonical') || key.includes('commitGraph') || key.includes('dagOperations') || key.includes('gitOperations')) {
      delete require.cache[key];
    }
  });
}

function makeReq(overrides = {}) {
  return { body: { agentId: 'a1', ...overrides }, tenant: { organizationId: 'org', projectId: 'proj' }, user: { username: 'tester' } };
}

async function testTreeHashStripsVolatile() {
  const h1 = require('../src/services/agentGitService').treeHash(makeState());
  const h2 = require('../src/services/agentGitService').treeHash(makeState({ capturedAt: '2026-01-02T00:00:00Z' }));
  assert.equal(h1, h2, 'treeHash strips capturedAt');
}

async function testTreeHashStableWithRuntimeVolatiles() {
  const s1 = makeState({ agent: { ...agents.a1, runtime_pid: 100, runtime_started_at: 't1', updated_at: 't1' } });
  const s2 = makeState({ agent: { ...agents.a1, runtime_pid: 200, runtime_started_at: 't2', updated_at: 't2' } });
  const { treeHash } = require('../src/services/agentGitService');
  assert.equal(treeHash(s1), treeHash(s2), 'volatiles do not affect treeHash');
}

async function testCommitHashDistinct() {
  const tree = require('../src/services/agentGitService').treeHash(makeState());
  const { commitHash } = require('../src/services/agentGitService');
  const c1 = commitHash({ tree, parents: [], metadata: { a: 1 } });
  const c2 = commitHash({ tree, parents: [], metadata: { a: 2 } });
  assert.notEqual(c1, tree);
  assert.notEqual(c1, c2);
}

async function testCommitHashStableAcrossRuns() {
  const { commitHash } = require('../src/services/agentGitService');
  const c1 = commitHash({ tree: 't', parents: ['p1'], metadata: { msg: 'm' } });
  const c2 = commitHash({ tree: 't', parents: ['p1'], metadata: { msg: 'm' } });
  assert.equal(c1, c2, 'commitHash deterministic');
}

async function testCreateCommitSetsParentLink() {
  resetStores();
  installMock();
  clearServiceCache();
  const service = require('../src/services/agentGitService');
  const c1 = await service.createCommit(makeReq(), { agentId: 'a1', refName: 'main' });
  assert.equal(c1.parentCommitId, null, 'first commit has null parent');
  const c2 = await service.createCommit(makeReq(), { agentId: 'a1', refName: 'main' });
  assert.equal(c2.parentCommitId, c1.id, 'second commit links to first');
}

async function testMergeBaseSameCommit() {
  resetStores();
  installMock();
  clearServiceCache();
  const service = require('../src/services/agentGitService');
  const c1 = await service.createCommit(makeReq(), { agentId: 'a1', refName: 'main' });
  const result = await service.mergeBaseDag(makeReq({ leftObjectId: c1.id, rightObjectId: c1.id }));
  assert.equal(result.mergeBaseObjectId, c1.id, 'merge-base of same commit is itself');
}

async function testResetSoftMode() {
  resetStores();
  installMock();
  clearServiceCache();
  const service = require('../src/services/agentGitService');
  const c1 = await service.createCommit(makeReq(), { agentId: 'a1', refName: 'main' });
  const result = await service.reset(makeReq({ objectId: c1.id, mode: 'soft' }));
  assert.equal(result.success, true, 'reset --soft succeeds');
  assert.equal(result.mode, 'soft');
}

(async () => {
  console.log('=== P0 Invariants ===');
  try {
    await testTreeHashStripsVolatile();
    await testTreeHashStableWithRuntimeVolatiles();
    await testCommitHashDistinct();
    await testCommitHashStableAcrossRuns();
    await testCreateCommitSetsParentLink();
    await testMergeBaseSameCommit();
    await testResetSoftMode();
    console.log('\\n✓ All P0 invariant tests passed');
  } catch (error) {
    console.error('\\n\\u2717 Test failed:', error.message);
    process.exitCode = 1;
  } finally {
    dbModule.getDatabase = originalGetDatabase;
  }
})();
