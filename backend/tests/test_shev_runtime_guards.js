'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const authority = require('./shevFixture').authority();
const store = require('../src/services/ontogenesis/projectStore');
const executions = require('../src/services/ontogenesis/executionStore');
const responsibilities = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { compilePending, approveInitiative, declineInitiative } = require('../src/services/shev/initiativeService');
const { initiativeEnvelope } = require('../src/services/shev/initiativeAdmissionService');
const { performBounded } = require('../src/services/shev/boundedAction');
const { requireActive } = require('../src/services/shev/runtimeGuard');

const projectId = 'shev-runtime-guards';
const mandate = { purpose: 'Guard tests', autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'quality', expected: 'Stable', acceptance: ['Verified result.'] }] };

function authorize(operation, subjectId, details) {
  return authority.authorize({ projectId, expectedVersion: 2, operation, subjectId, details });
}

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/ontogenesis',
    objective: 'Guard tests', config: fixture.testConfig() });
  await responsibilities.registerResponsibility(db, { projectId, authorityRef: 'test', mandate, authorityPublicKey: authority.publicKey });
  await responsibilities.reviseResponsibility(db, { projectId, expectedVersion: 1, mandate, stage: 'assisted',
    authorization: authority.authorize({ projectId, expectedVersion: 1, operation: 'mandate-revision',
      subjectId: projectId, details: { mandate, stage: 'assisted' } }) });
}

async function proposal(db, id) {
  await recordObservation(db, { id, projectId, domain: 'application-contract', dimension: 'quality', kind: 'risk',
    epistemicStatus: 'observed', source: 'test:probe', observedAt: new Date().toISOString(),
    summary: 'Measured risk', evidenceRefs: [`artifact:${id}`] });
  await compilePending(db, { projectId });
  return db.get('SELECT * FROM shev_initiatives WHERE observation_id = ?', [id]);
}

async function approvedTask(db, stopCondition) {
  const initiative = await proposal(db, stopCondition);
  const details = { budget: { tokens: 1000, usd: 1, seconds: 60, maxAttempts: 3,
    deadlineAt: new Date(Date.now() + 60000).toISOString() }, stopCondition, alternative: 'Retain current state.' };
  const approved = await approveInitiative(db, { ...details, projectId, initiativeId: initiative.id,
    authorization: authorize('initiative-approval', initiative.id, details) });
  return db.get('SELECT * FROM ontogenesis_backlog WHERE id = ?', [approved.task_id]);
}

async function reservation(db, input) {
  await executions.createExecution(db, { ...input, projectId, worktree: 'C:/test', baseSha: 'a'.repeat(40),
    topology: 'trinity', variant: '', reservationMb: 1 });
  await executions.updateExecution(db, { id: input.id, phase: 'failed', result: { verified: false } });
}

async function testBudgets(db) {
  const task = await approvedTask(db, 'on-regression');
  await reservation(db, { id: 'reservation-a', taskId: task.id, budgets: { tokens: 600, usd: 0.4, seconds: 20 } });
  const envelope = await initiativeEnvelope(db, task);
  assert.equal(envelope.budget.tokens, 400);
  assert.equal(envelope.budget.usd, 0.6);
  assert.ok(envelope.budget.seconds <= 40);
  assert.equal(envelope.alternative, 'Retain current state.');
  await reservation(db, { id: 'reservation-b', taskId: task.id, budgets: { tokens: 400, usd: 0.1, seconds: 10 } });
  assert.equal((await initiativeEnvelope(db, task)).blocked, 'shev-budget-epuise');
  const failedTask = await approvedTask(db, 'on-failed-check');
  await reservation(db, { id: 'failed-run', taskId: failedTask.id, budgets: { tokens: 1, usd: 0.01, seconds: 1 } });
  assert.equal((await initiativeEnvelope(db, failedTask)).blocked, 'shev-condition-arret');
  await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = ?", [projectId]);
  assert.equal((await initiativeEnvelope(db, failedTask)).blocked, 'shev-controle-inactif');
  await db.run("UPDATE ontogenesis_control SET mode = 'running' WHERE project_id = ?", [projectId]);
}

async function testAbstention(db) {
  const initiative = await proposal(db, 'decline-risk');
  const reason = 'The owner accepts the measured risk.';
  const input = { projectId, initiativeId: initiative.id, reason,
    authorization: authorize('initiative-abstention', initiative.id, { reason }) };
  await assert.rejects(declineInitiative(db, { ...input, reason: 'Changed reason' }), /signature/);
  assert.equal((await declineInitiative(db, input)).status, 'rejected');
  await compilePending(db, { projectId });
  assert.equal((await db.get('SELECT * FROM shev_initiatives WHERE id = ?', [initiative.id])).task_id, null);
}

async function testCancellation(db) {
  let signal;
  await assert.rejects(performBounded({ maxSeconds: 5, deadlineAt: new Date(Date.now() + 10000).toISOString(),
    context: {}, guard: () => requireActive(db, { projectId, expectedVersion: 2, action: true }),
    perform: async context => {
      signal = context.signal;
      await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = ?", [projectId]);
      return new Promise(resolve => context.signal.addEventListener('abort', () => resolve({}), { once: true }));
    } }), /stopped|inactive/);
  assert.equal(signal.aborted, true);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await testBudgets(db);
    await testAbstention(db);
    await testCancellation(db);
    console.log('SHEV cumulative budgets, failed-check stop, signed abstention and cancellation passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
