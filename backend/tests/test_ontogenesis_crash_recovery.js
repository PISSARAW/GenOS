'use strict';

const assert = require('assert');
const fixture = require('./ontogenesisFixture');
const projectStore = require('../src/services/ontogenesis/projectStore');
const executionStore = require('../src/services/ontogenesis/executionStore');
const journal = require('../src/services/ontogenesis/operationJournal');
const recovery = require('../src/services/ontogenesis/crashRecoveryService');

async function project(db, id) {
  await projectStore.createProject(db, { id, rootPath: '.', branch: 'codex/test',
    objective: 'recover', config: fixture.testConfig() });
  const taskId = await projectStore.addTask(db, { projectId: id, title: 'recover task' });
  return { id, taskId };
}

async function dispatchOperation(db, input) {
  const operation = await journal.prepareOperation(db, { id: input.id, projectId: input.projectId,
    kind: 'dispatch', idempotencyKey: `dispatch:${input.id}`, intent: { taskId: input.taskId } });
  await journal.transitionOperation(db, { operationId: operation.id, state: 'started' });
  return operation;
}

async function createExecution(db, input) {
  await executionStore.createExecution(db, { id: input.id, projectId: input.projectId,
    taskId: input.taskId, worktree: '.', baseSha: 'abc', topology: 'trinity', variant: 'default',
    reservationMb: 1, budgets: { tokens: 1, usd: 0, seconds: 60 } });
}

async function testPreparedReset(db, scope) {
  const operation = await dispatchOperation(db, { id: 'onto_run_unapplied', ...scope });
  const first = await recovery.recoverIncompleteOperations(db, { projectId: scope.projectId,
    owner: 'recovery-one', harness: { observe: async () => ({ alive: false }) } });
  assert.deepStrictEqual(first, [{ operationId: operation.id, outcome: 'reset_prepared' }]);
  assert.strictEqual((await journal.getOperation(db, operation.id)).state, 'prepared');
  assert.deepStrictEqual(await recovery.recoverIncompleteOperations(db, { projectId: scope.projectId,
    owner: 'recovery-two', harness: { observe: async () => ({ alive: false }) } }), []);
}

async function testDeadRuntime(db, scope) {
  const operation = await dispatchOperation(db, { id: 'onto_run_dead', ...scope });
  await createExecution(db, { id: operation.id, ...scope });
  const outcomes = await recovery.recoverIncompleteOperations(db, { projectId: scope.projectId,
    owner: 'recovery-dead', harness: { observe: async () => ({ alive: false }) } });
  assert.strictEqual(outcomes[0].outcome, 'compensated');
  assert.strictEqual((await journal.getOperation(db, operation.id)).state, 'completed');
  const execution = await db.get('SELECT * FROM ontogenesis_execution WHERE id = ?', [operation.id]);
  assert.strictEqual(execution.phase, 'finished');
  assert.match(execution.result_json, /runtime-interrompu-repris/);
  await db.run("UPDATE ontogenesis_execution SET phase = 'failed' WHERE id = ?", [operation.id]);
}

async function testLiveRuntime(db, scope) {
  const operation = await dispatchOperation(db, { id: 'onto_run_live', ...scope });
  await createExecution(db, { id: operation.id, ...scope });
  await db.run("UPDATE ontogenesis_execution SET phase = 'running', pid = 42 WHERE id = ?", [operation.id]);
  const outcomes = await recovery.recoverIncompleteOperations(db, { projectId: scope.projectId,
    owner: 'recovery-live', harness: { observe: async () => ({ alive: true }) } });
  assert.strictEqual(outcomes[0].outcome, 'adopted');
  assert.strictEqual((await journal.getOperation(db, operation.id)).state, 'completed');
  await db.run("UPDATE ontogenesis_execution SET phase = 'integrated' WHERE id = ?", [operation.id]);
}

async function testAmbiguousEscalation(db, scope) {
  const operation = await journal.prepareOperation(db, { id: 'onto_unknown', projectId: scope.projectId,
    kind: 'external_unknown', idempotencyKey: 'unknown:1', intent: { external: true } });
  await journal.transitionOperation(db, { operationId: operation.id, state: 'started' });
  const outcomes = await recovery.recoverIncompleteOperations(db, {
    projectId: scope.projectId, owner: 'recovery-ambiguous' });
  assert.strictEqual(outcomes[0].outcome, 'escalated');
  assert.strictEqual((await journal.getOperation(db, operation.id)).state, 'escalated');
  assert.strictEqual((await projectStore.getProject(db, scope.projectId)).state, 'WAITING_INPUT');
  const message = await db.get('SELECT * FROM ontogenesis_outbox WHERE operation_id = ?', [operation.id]);
  assert.strictEqual(message.kind, 'recovery_escalation');
}

async function testCommittedIntegration(db, scope) {
  const executionId = 'onto_run_integrated';
  await createExecution(db, { id: executionId, ...scope });
  await db.run("UPDATE ontogenesis_execution SET phase = 'integrated' WHERE id = ?", [executionId]);
  await db.run(`INSERT INTO ontogenesis_integrations
    (id, project_id, task_id, base_sha, result_sha, status) VALUES (?, ?, ?, 'abc', 'def', 'committed')`,
  [executionId, scope.projectId, scope.taskId]);
  const operation = await journal.prepareOperation(db, { id: `onto_integration_${executionId}`,
    projectId: scope.projectId, kind: 'integrate', idempotencyKey: `integrate:${executionId}`,
    intent: { executionId } });
  await journal.transitionOperation(db, { operationId: operation.id, state: 'started' });
  const outcomes = await recovery.recoverIncompleteOperations(db, {
    projectId: scope.projectId, owner: 'recovery-integration' });
  assert.strictEqual(outcomes[0].outcome, 'completed');
  assert.strictEqual((await journal.getOperation(db, operation.id)).state, 'completed');
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    const created = await project(db, 'crash-recovery');
    const scope = { projectId: created.id, taskId: created.taskId };
    await testPreparedReset(db, scope);
    await testDeadRuntime(db, scope);
    await testLiveRuntime(db, scope);
    await testAmbiguousEscalation(db, scope);
    await testCommittedIntegration(db, scope);
    const receipts = await db.get('SELECT COUNT(*) AS count FROM ontogenesis_recovery_receipts');
    assert.strictEqual(receipts.count, 5);
  } finally {
    await db.close();
  }
  console.log('Ontogenesis crash recovery checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
