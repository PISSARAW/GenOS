'use strict';
const assert = require('node:assert/strict');
const { initializeDirectWorkerMission, workspaceRequest } = require('../bin/directWorkerMissionInitialization.cjs');

(async () => {
  const calls = [];
  const db = {};
  await initializeDirectWorkerMission({ db, missionId: 'mission', task: 'task', orchestratorId: 'parent', request: {} }, {
    initializeMission: async input => { assert.equal(input.action, 'dispatch_worker'); calls.push('parent'); },
    missionIdentity: { create: async (actualDb, input) => {
      assert.equal(actualDb, db);
      assert.equal(input.orchestratorAgentId, 'parent');
      assert.deepEqual(calls, ['parent']);
      calls.push('mission');
    } }
  });
  assert.deepEqual(calls, ['parent', 'mission']);
  let created = false;
  await assert.rejects(initializeDirectWorkerMission({ db }, {
    initializeMission: async () => { throw new Error('workspace invalid'); },
    missionIdentity: { create: async () => { created = true; } }
  }), /workspace invalid/);
  assert.equal(created, false);
  process.env.GENOS_WORKSPACE_ROOT = 'D:\\configured-workspace';
  assert.equal(workspaceRequest({}).workspaceRoot, 'D:\\configured-workspace');
  assert.deepEqual(workspaceRequest({ workspaceId: 'explicit' }), { workspaceId: 'explicit' });
  assert.equal(workspaceRequest({ workspaceRoot: 'D:\\explicit' }).workspaceRoot, 'D:\\explicit');
  process.env.NODE_ENV = 'test';
  delete process.env.GENOS_WORKSPACE_ROOT;
  const database = require('../src/db');
  const realDb = await database.getDatabase(':memory:');
  try {
    await initializeDirectWorkerMission({ db: realDb, missionId: 'fresh-mission', task: 'fresh task', orchestratorId: 'fresh-parent', request: {} }, {
      initializeMission: require('../bin/orchestratorMissionInitialization.cjs').initializeMission,
      missionIdentity: require('../src/services/missionIdentityService')
    });
    const member = await realDb.get('SELECT agent_id FROM mission_agents WHERE mission_id = ?', 'fresh-mission');
    assert.equal(member.agent_id, 'fresh-parent');
  } finally { await database.closeDatabase(); }
  const fs = require('node:fs');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'genos-direct-workspace-'));
  process.env.GENOS_WORKSPACE_ROOT = root;
  const workspaceDb = await database.getDatabase(':memory:');
  try {
    await initializeDirectWorkerMission({ db: workspaceDb, missionId: 'workspace-mission', task: 'task', orchestratorId: 'workspace-parent', request: {} }, {
      initializeMission: require('../bin/orchestratorMissionInitialization.cjs').initializeMission,
      missionIdentity: require('../src/services/missionIdentityService')
    });
    const parent = await workspaceDb.get('SELECT workspace_id FROM agents WHERE id = ?', 'workspace-parent');
    assert.equal(parent.workspace_id, 'ws-local');
  } finally { await database.closeDatabase(); delete process.env.GENOS_WORKSPACE_ROOT; fs.rmSync(root, { recursive: true }); }
  console.log('Direct worker mission initialization checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
