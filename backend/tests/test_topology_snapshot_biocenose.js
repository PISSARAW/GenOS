'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const service = require('../src/services/topologySnapshotService');
const adapter = require('../src/services/topologySnapshots/biocenose');
const store = require('../src/services/biocenose/communityStore');
const { commitInitial } = require('../src/services/biocenose/governance/constitutionService');
const { POLICIES } = require('../src/services/biocenose/variants/variantPolicyRouter');

service.registerAdapter('biocenose-test', adapter);

async function contextFor(db, variant) {
  const session = await store.createSession(db, {
    missionId: 'mission-1', question: 'Which option is supported?',
    questionType: variant === 'forecasting_crowd' ? 'PROBABILISTIC' : 'FACTUAL',
    members: [{ memberId: 'agent-1', role: 'reviewer' }]
  });
  await commitInitial({ db, communityId: session.communityId, question: session.question,
    questionType: session.questionType, variant, roles: ['reviewer'], actorId: 'agent-1' });
  await store.appendEvent(db, { communityId: session.communityId, actorId: 'agent-1',
    type: 'STATUS_CHANGED', payload: { reason: 'test closure' },
    patch: { status: 'CLOSED', round: variant === 'delphi_community' ? 1 : 0 } });
  return { db, topologyId: 'biocenose-test', variantId: variant,
    sessionId: session.communityId, agentId: 'agent-1', workspaceId: 'workspace-1',
    workerKind: 'bounded_worker',
    scope: { clause: 'organization_id = ? AND project_id = ?', params: ['org-1', 'project-1'] } };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);`);
    await db.run('INSERT INTO agents VALUES (?, ?, ?)', 'agent-1', 'workspace-1', 'idle');
    await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'workspace-1', 'org-1', 'project-1');
    for (const variant of Object.keys(POLICIES)) {
      const context = await contextFor(db, variant);
      const manifest = await service.capture(context);
      assert.equal(manifest.components.find((item) => item.id === 'variant-evidence').reference.variant, variant);
      assert.equal((await service.preflightRestore({ ...context, manifest })).allowed, true);
      await assert.rejects(() => service.capture({ ...context, agentId: 'unbound' }),
        (error) => error.code === 'BIOCENOSE_SNAPSHOT_OWNER_MISMATCH');
      await assert.rejects(() => service.capture({ ...context, variantId: 'other' }),
        (error) => error.code === 'BIOCENOSE_SNAPSHOT_VARIANT_MISMATCH');
      await store.appendEvent(db, { communityId: context.sessionId, actorId: 'agent-1',
        type: 'STATUS_CHANGED', payload: { reason: 'post-snapshot change' }, patch: {} });
      await assert.rejects(() => service.preflightRestore({ ...context, manifest }),
        (error) => error.code === 'TOPOLOGY_SNAPSHOT_DRIFT');
    }
    console.log('Biocenose topology snapshot checks: PASS');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error('Biocenose topology snapshot checks failed:', error);
  process.exitCode = 1;
});
