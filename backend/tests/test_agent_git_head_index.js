'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const { createMockDb, clearServiceCache } = require('./test_agent_git_mock_helper.cjs');
const originalGetDatabase = dbModule.getDatabase;

const agents = {
  a1: { id: 'a1', workspace_id: 'ws', name: 'Agent1', role: 'worker', status: 'idle', cognitive_budget: 50, created_at: '2026-01-01' }
};

const indexStore = {};

const db = {
  get: async (sql, ...args) => {
    if (sql.includes('FROM agents a') || sql.includes('FROM agents')) return agents[args[0]] || agents.a1;
    if (sql.includes('agent_git_indexes')) {
      const agentId = args[0];
      return indexStore[agentId] || null;
    }
    return null;
  },
  all: async () => [],
  run: async (sql, ...args) => {
    if (sql.includes('INSERT INTO agent_git_indexes')) {
      indexStore[args[1]] = { id: args[0], agent_id: args[1], index_json: args[2] };
      return { changes: 1 };
    }
    if (sql.includes('UPDATE agent_git_indexes')) {
      const agentId = args[1];
      if (indexStore[agentId]) indexStore[agentId].index_json = args[0];
      return { changes: 1 };
    }
    if (sql.includes('DELETE FROM agent_git_indexes')) {
      delete indexStore[args[0]];
      return { changes: 1 };
    }
    return { changes: 1 };
  },
  exec: async () => ({ changes: 0 })
};

dbModule.getDatabase = async () => db;
clearServiceCache();
const service = require('../src/services/agentGitService');

function makeReq(overrides = {}) {
  return { body: { agentId: 'a1', ...overrides }, tenant: { organizationId: 'org', projectId: 'proj' }, user: { username: 'tester' } };
}

async function testStage() {
  const decisions = [{ id: 'd1', title: 'A', content: '1', created_at: '2026-01-01' }];
  const result = await service.stage(makeReq({ section: 'decisions', items: decisions }));
  assert.equal(result.success, true);
  assert.equal(result.stagedCount, 1);
}

async function testUnstage() {
  const decisions = [{ id: 'd1', title: 'A', content: '1', created_at: '2026-01-01' }];
  await service.stage(makeReq({ section: 'decisions', items: decisions }));
  const result = await service.unstage(makeReq({ section: 'decisions' }));
  assert.equal(result.success, true);
  const status = await service.status(makeReq());
  assert.equal(status.stagedCount, 0);
}

async function testStatus() {
  let status = await service.status(makeReq());
  assert.equal(status.success, true);
  assert.equal(status.stagedCount, 0);
  await service.stage(makeReq({ section: 'memories', items: [{ id: 'm1' }] }));
  status = await service.status(makeReq());
  assert.equal(status.stagedCount, 1);
}

async function testCommitFromIndex() {
  const decisions = [{ id: 'd1', title: 'A', content: '1', created_at: '2026-01-01' }];
  await service.stage(makeReq({ section: 'decisions', items: decisions }));
  const commitFromIndex = require('../src/services/agentGitService/commitFromIndex.cjs');
  const result = await commitFromIndex(makeReq(), { agentId: 'a1', refName: 'main' });
  assert.equal(result.success, true);
  assert.ok(result.objectId);
  const status = await service.status(makeReq());
  assert.equal(status.stagedCount, 0);
}

(async () => {
  console.log('=== Test Agent Git HEAD + Index ===');
  try {
    await testStage();
    await testUnstage();
    await testStatus();
    await testCommitFromIndex();
    console.log('\n✓ All HEAD+Index tests passed');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exitCode = 1;
  } finally {
    dbModule.getDatabase = originalGetDatabase;
  }
})();
