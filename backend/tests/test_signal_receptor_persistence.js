'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { migrateSignalReceptors } = require('../src/db/migrations/migrateSignalReceptors');
const store = require('../src/services/signalReceptorPersistenceService');
const receptor = require('../src/services/signalReceptorService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
      INSERT INTO workspaces VALUES ('ws-a', 'org-a', 'proj-a');
      INSERT INTO workspaces VALUES ('ws-b', 'org-b', 'proj-b');
      INSERT INTO agents VALUES ('worker-a', 'ws-a');
      INSERT INTO agents VALUES ('worker-b', 'ws-b');`);
    await migrateSignalReceptors(db);
    const scope = { organizationId: 'org-a', projectId: 'proj-a' };
    const rule = {
      id: 'receptor-a', targetLigand: 'READY', threshold: 0.5,
      targetAgentId: 'worker-a', action: 'update_agent',
      actionData: { agentId: 'worker-a', status: 'running' }
    };
    await store.saveScopedReceptor(db, scope, rule);
    await receptor.refreshPersistedReceptors(db);
    let calls = 0;
    const signal = {
      semanticType: 'READY', concentration: 0.9, senderAgentId: 'orchestrator-a',
      recipientAgentIds: ['worker-a'], scope
    };
    const matched = await receptor.matchAndDispatch(signal, {
      updateAgent: async () => { calls++; return { updated: true }; }
    });
    assert.equal(matched.dispatched[0].executed, true);
    assert.equal(matched.llmRequired, false);
    assert.equal(calls, 1);
    const outside = await receptor.matchAndDispatch({
      ...signal, scope: { organizationId: 'org-b', projectId: 'proj-b' }
    }, { updateAgent: async () => { calls++; return { updated: true }; } });
    assert.equal(outside.triggered.length, 0);
    assert.equal(calls, 1);
    await assert.rejects(store.saveScopedReceptor(db, scope, {
      ...rule, id: 'invalid-target', targetAgentId: 'worker-b',
      actionData: { agentId: 'worker-b', status: 'running' }
    }), /outside the receptor scope/);
    const failed = await receptor.matchAndDispatch(signal, {});
    assert.equal(failed.dispatched[0].executed, false);
    assert.equal(failed.llmRequired, true);
    assert.equal(await store.deleteScopedReceptor(db, scope, rule.id), true);
    await receptor.refreshPersistedReceptors(db);
    assert.equal(receptor.matchReceptors(signal).length, 0);
    console.log('signal receptor persistence passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
