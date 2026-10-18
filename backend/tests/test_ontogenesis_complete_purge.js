'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixture = require('./ontogenesisFixture');
const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
const workspaces = require('../src/services/ontogenesis/worktreeService');
const purge = require('../src/services/ontogenesis/purgeService');

async function seedTraces(db, projectId, root) {
  await db.exec(`
    CREATE TABLE telemetry_events (id INTEGER PRIMARY KEY, project_id TEXT);
    CREATE TABLE trace_spans (id TEXT PRIMARY KEY, project_id TEXT);
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, project_id TEXT);
  `);
  await db.run('INSERT INTO telemetry_events (project_id) VALUES (?)', [projectId]);
  await db.run("INSERT INTO trace_spans (id, project_id) VALUES ('span', ?)", [projectId]);
  await db.run('INSERT INTO audit_logs (project_id) VALUES (?)', [projectId]);
  await db.run(`INSERT INTO ontogenesis_memory (id, project_id, kind, content)
    VALUES ('memory', ?, 'failure', 'sensitive')`, [projectId]);
  await db.run(`INSERT INTO ontogenesis_runs (id, project_id, topology, status)
    VALUES ('run', ?, 'solo', 'failed')`, [projectId]);
  await db.run(`INSERT INTO ontogenesis_ledger (id, project_id, seq, kind)
    VALUES ('ledger', ?, 1, 'trace')`, [projectId]);
  const operation = await require('../src/services/ontogenesis/operationJournal').prepareOperation(db, {
    projectId, kind: 'dispatch', idempotencyKey: 'purge-test', intent: { root }
  });
  await require('../src/services/ontogenesis/operationJournal').transitionOperation(db, {
    operationId: operation.id, state: 'failed', failure: { reason: 'test' }
  });
  return require('../src/services/ontogenesis/artifactRegistry').registerArtifact(db, {
    projectId, operationId: operation.id, kind: 'capsule', path: '.genos/held', legalHold: true
  });
}

async function seedWorktrees(db, root, projectId) {
  const project = await db.get('SELECT * FROM ontogenesis_projects WHERE id = ?', [projectId]);
  await workspaces.ensureIntegration(project);
  const capsule = path.join(workspaces.managedRoot(project), 'capsules', 'purge-candidate');
  fs.mkdirSync(path.dirname(capsule), { recursive: true });
  await runCommand('git', ['worktree', 'add', '--detach', capsule, 'HEAD'], { cwd: root });
  const requestDir = path.join(workspaces.managedRoot(project), 'requests');
  fs.mkdirSync(requestDir, { recursive: true });
  fs.writeFileSync(path.join(requestDir, 'trace.json'), '{"sensitive":true}');
  return { project, capsule };
}

async function stopProject(db, projectId) {
  await db.run("UPDATE ontogenesis_projects SET state = 'STOPPED' WHERE id = ?", [projectId]);
  await db.run("UPDATE ontogenesis_control SET mode = 'stopped' WHERE project_id = ?", [projectId]);
}

async function assertPurged(db, context) {
  assert.strictEqual(fs.existsSync(workspaces.managedRoot(context.project)), false);
  const listed = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd: context.root });
  assert.ok(!listed.stdout.includes(context.capsule));
  for (const table of ['telemetry_events', 'trace_spans', 'audit_logs', 'ontogenesis_memory',
    'ontogenesis_runs', 'ontogenesis_ledger', 'ontogenesis_operations', 'ontogenesis_artifacts']) {
    const row = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ?`, [context.projectId]);
    assert.strictEqual(row.count, 0, table);
  }
  assert.strictEqual((await db.get('SELECT COUNT(*) AS count FROM ontogenesis_backlog WHERE project_id = ?',
    [context.projectId])).count, 1);
  assert.strictEqual((await db.get('SELECT state FROM ontogenesis_projects WHERE id = ?', [context.projectId])).state,
    'STOPPED');
}

async function runScenario() {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try {
    const created = await fixture.project(db, root);
    const worktree = await seedWorktrees(db, root, created.id);
    const held = await seedTraces(db, created.id, root);
    await assert.rejects(purge.purgeProject(db, {
      projectId: created.id, confirmation: created.id
    }), /purge-projet-non-arrete/);
    await stopProject(db, created.id);
    await db.run(`INSERT INTO ontogenesis_continuity (project_id, state, generation)
      VALUES (?, 'remote_active', 1)`, [created.id]);
    await assert.rejects(purge.planPurge(db, { projectId: created.id }), /purge-continuite-active/);
    await db.run("UPDATE ontogenesis_continuity SET state = 'local' WHERE project_id = ?", [created.id]);
    await assert.rejects(purge.planPurge(db, { projectId: created.id }), /purge-gel-juridique/);
    await db.run('UPDATE ontogenesis_artifacts SET legal_hold = 0 WHERE id = ?', [held.id]);
    const plan = await purge.planPurge(db, { projectId: created.id });
    assert.strictEqual(plan.worktrees.length, 2);
    assert.strictEqual(plan.counts.telemetry_events, 1);
    await assert.rejects(purge.purgeProject(db, {
      projectId: created.id, confirmation: 'wrong'
    }), /confirmation-projet-requise/);
    const result = await purge.purgeProject(db, { projectId: created.id, confirmation: created.id });
    assert.strictEqual(result.worktrees, 2);
    assert.strictEqual(result.deleted.telemetry_events, 1);
    await assertPurged(db, { root, projectId: created.id, ...worktree });
    const receipt = await db.get('SELECT * FROM ontogenesis_purge_receipts WHERE id = ?', [result.receiptId]);
    assert.strictEqual(receipt.state, 'completed');
    assert.strictEqual(receipt.manifest_hash, result.manifestHash);
    await assert.rejects(db.run("UPDATE ontogenesis_purge_receipts SET error = 'changed' WHERE id = ?",
      [receipt.id]), /immutable/);
    const replay = await purge.purgeProject(db, { projectId: created.id, confirmation: created.id });
    assert.strictEqual(replay.worktrees, 0);
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

runScenario()
  .then(() => console.log('Ontogenesis complete purge checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
