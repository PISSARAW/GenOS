const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const resilience = require('../src/services/resilienceService');

(async () => {
  const db = await getDatabase(':memory:');
  try {
    await db.run("INSERT INTO organizations (id, name) VALUES (?, ?)", 'org-state', 'state-org');
    await db.run("INSERT INTO projects (id, organization_id, name, status) VALUES (?, ?, ?, 'active')", 'project-state', 'org-state', 'state-project');
    await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)", 'ws-state-1', 'state-ws', '/tmp/ws-state-1', 'org-state', 'project-state');
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, about) VALUES (?, ?, ?, 'running', 'worker', ?, 'check state persistence')", 'agent-state-1', 'Persisted Agent', 'worker', 'ws-state-1');

    const checkpoint = {
      agentId: 'agent-state-1',
      workspaceId: 'ws-state-1',
      status: 'running',
      currentTask: 'resume from checkpoint',
      progress: { step: 3, evidence: ['partial result'] }
    };

    const snapshotId = await resilience.persistIntermediateState(db, 'agent-state-1', checkpoint, 'resume-test');
    const restored = await resilience.restoreIntermediateState(db, 'agent-state-1');

    assert.ok(snapshotId, 'a durable snapshot id must be returned');
    assert.equal(restored.workspaceId, 'ws-state-1');
    assert.equal(restored.currentTask, 'resume from checkpoint');
    assert.deepEqual(restored.progress, { step: 3, evidence: ['partial result'] });
    console.log('Intermediate state persistence checks passed.');
  } finally {
    await closeDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
