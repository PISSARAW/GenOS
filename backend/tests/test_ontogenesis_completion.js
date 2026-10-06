'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const control = require('../src/services/ontogenesis/controlService');
const operator = require('../src/services/ontogenesis/operatorService');
const { processInbox } = require('../src/services/ontogenesis/inboxProcessor');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { activeExecution } = require('../src/services/ontogenesis/executionStore');
const { runResidentLoop, loopOptions } = require('../src/services/ontogenesis/residentLoopService');

function invalidConfiguration() {
  const { validateProjectConfig, defaultConfig } = require('../src/services/ontogenesis/configSchema');
  assert.strictEqual(validateProjectConfig(defaultConfig()).ok, true);
  for (const patch of [{ topologies: [] }, { topologies: ['unknown'] }, { missionBudgets: { tokens: -1 } },
    { memory: { envelopeMb: Infinity, reserveMb: 0 } }, { checks: [{ program: 'node', args: [false] }] },
    { allowPush: 'true' }, { authority: { allowEdit: 'true', branches: ['*'], paths: ['*'] } }]) {
    assert.strictEqual(validateProjectConfig(patch).ok, false, JSON.stringify(patch));
  }
  assert.throws(() => loopOptions({ intervalMs: -1 }), /intervalle-resident-invalide/);
  assert.throws(() => loopOptions({ maxTicks: NaN }), /nombre-ticks-invalide/);
}

async function operatorCommands(db, project) {
  await assert.rejects(operator.addOperatorTask(db, { projectId: project.id, title: 'bad', dependsOn: ['foreign'] }), /dependance-hors-projet/);
  const task = await operator.addOperatorTask(db, { projectId: project.id, title: 'next', dependsOn: [project.task] });
  await operator.reprioritize(db, { projectId: project.id, taskId: task, priority: 80 });
  const message = await operator.sendMessage(db, { projectId: project.id, body: 'Conserver la compatibilite' });
  await processInbox(db, project.id);
  await processInbox(db, project.id);
  assert.strictEqual((await db.get('SELECT priority FROM ontogenesis_backlog WHERE id = ?', [task])).priority, 80);
  assert.strictEqual((await db.get('SELECT status FROM ontogenesis_inbox WHERE id = ?', [message])).status, 'applied');
  assert.strictEqual((await db.get("SELECT count(*) AS n FROM ontogenesis_memory WHERE kind = 'preference' AND project_id = ?", [project.id])).n, 1);
  await operator.reprioritize(db, { projectId: project.id, taskId: 'foreign', priority: 10 });
  await processInbox(db, project.id);
  assert.strictEqual((await db.get("SELECT count(*) AS n FROM ontogenesis_inbox WHERE status = 'rejected' AND project_id = ?", [project.id])).n, 1);
  await db.run('INSERT INTO ontogenesis_spend (project_id, tokens, usd, seconds) VALUES (?, 100, 0.1, 10)', [project.id]);
  await operator.reviseBudgets(db, { projectId: project.id, reason: 'Nouvelle enveloppe explicite', budgets: { tokens: 150000, usd: 2, seconds: 300 } });
  assert.strictEqual((await db.get('SELECT tokens FROM ontogenesis_spend WHERE project_id = ?', [project.id])).tokens, 100);
  await assert.rejects(operator.reviseBudgets(db, { projectId: project.id, budgets: {} }), /raison-requise/);
  await store.setProjectState(db, { projectId: project.id, state: 'WAITING_INPUT' });
  await control.resumeProject(db, { projectId: project.id });
  assert.strictEqual((await tickOnce(db, { projectId: project.id, owner: 'resume-test', harness: fixture.fakeHarness(db) })).state, 'PLANNING');
}

async function cancellation(db, project) {
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'cancel-test', harness });
  await tick();
  await tick();
  const run = await activeExecution(db, project.id);
  assert.ok(run);
  await require('../src/services/ontogenesis/scheduleService').stopTask(db, { taskId: project.task });
  assert.strictEqual((await tick()).note, 'tache-arretee');
  assert.strictEqual(await activeExecution(db, project.id), undefined);
  assert.strictEqual((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [project.task])).status, 'blocked');
  assert.strictEqual((await db.get('SELECT phase FROM ontogenesis_execution WHERE id = ?', [run.id])).phase, 'cancelled');
  assert.strictEqual(harness.launches, 1);
  assert.strictEqual(harness.stops, 1);
}

async function pausedCandidate(db, project) {
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'pause-candidate-test', harness });
  for (let index = 0; index < 4; index += 1) await tick();
  const run = await activeExecution(db, project.id);
  assert.strictEqual(run.phase, 'verified');
  await assert.rejects(operator.reviseBudgets(db, { projectId: project.id, reason: 'Refuse pendant execution', budgets: fixture.testConfig().budgets }), /execution-en-cours/);
  await control.pauseProject(db, { projectId: project.id });
  assert.strictEqual((await tick()).state, 'PAUSED');
  assert.strictEqual((await activeExecution(db, project.id)).phase, 'verified');
  await control.resumeProject(db, { projectId: project.id });
  assert.strictEqual((await tick()).state, 'PLANNING');
  const integrated = await tick();
  assert.match(integrated.sha, /^[a-f0-9]{40}$/);
  assert.strictEqual(harness.launches, 1);
  assert.strictEqual(harness.stops, 0);
}

async function recovery(db, project) {
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'recovery-test', harness });
  await tick();
  await tick();
  assert.strictEqual((await activeExecution(db, project.id)).phase, 'finished');
  await store.setProjectState(db, { projectId: project.id, state: 'PLANNING' });
  assert.strictEqual((await tick()).state, 'INTEGRATING');
  assert.match((await tick()).sha, /^[a-f0-9]{40}$/);
  assert.strictEqual(harness.launches, 1);
  const run = await db.get('SELECT * FROM ontogenesis_execution WHERE project_id = ?', [project.id]);
  const candidate = JSON.parse(run.result_json).candidateWorktree;
  const requestRoot = path.join(require('../src/services/ontogenesis/worktreeService').managedRoot(await store.getProject(db, project.id)), 'requests');
  fs.mkdirSync(requestRoot, { recursive: true });
  const request = path.join(requestRoot, `${run.id}.json`);
  fs.writeFileSync(request, '{}');
  await db.run("UPDATE ontogenesis_execution SET updated_at = '2020-01-01' WHERE id = ?", [run.id]);
  fs.writeFileSync(path.join(candidate, 'app.js'), 'human edit');
  const { pruneArtifacts } = require('../src/services/ontogenesis/retentionService');
  const kept = await pruneArtifacts(db, { projectId: project.id, olderThanDays: 1 });
  assert.strictEqual(kept.capsules, 0);
  assert.strictEqual(kept.retained[0].reason, 'capsule-modifiee-conservee');
  assert.ok(fs.existsSync(request));
  fs.writeFileSync(path.join(candidate, 'app.js'), 'module.exports = "complete";\n');
  const lostLease = { get: db.get.bind(db), all: db.all.bind(db),
    run: async (sql, args) => sql.startsWith('UPDATE ontogenesis_claims SET expires_at')
      ? { changes: 0 } : db.run(sql, args) };
  const fenced = await pruneArtifacts(lostLease, { projectId: project.id, olderThanDays: 1 });
  assert.strictEqual(fenced.capsules, 0);
  assert.strictEqual(fenced.requests, 0);
  assert.strictEqual(fenced.retained[0].reason, 'claim-perdu');
  assert.ok(fs.existsSync(candidate));
  assert.ok(fs.existsSync(request));
  const purged = await pruneArtifacts(db, { projectId: project.id, olderThanDays: 1 });
  assert.strictEqual(purged.capsules, 1);
  assert.strictEqual(purged.requests, 1);
  assert.strictEqual(fs.existsSync(candidate), false);
  assert.strictEqual((await db.get('SELECT phase FROM ontogenesis_execution WHERE id = ?', [run.id])).phase, 'integrated');
}

async function silentResident() {
  const changes = [];
  const result = await runResidentLoop(null, { projectId: 'injected', intervalMs: 10, maxTicks: 3 },
    { tick: async () => ({ ticked: true, state: 'IDLE', note: 'attente-idle' }), onChange: (outcome) => changes.push(outcome) });
  assert.strictEqual(result.count, 3);
  assert.strictEqual(changes.length, 1);
}

async function failureAccounting(db, project) {
  const executions = require('../src/services/ontogenesis/executionStore');
  const { failExecution } = require('../src/services/ontogenesis/executionLifecycle');
  const ctx = { project: await store.getProject(db, project.id) };
  const budget = { tokens: 100, usd: 0.01, seconds: 10 };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const id = `onto_run_failure_${attempt}`;
    await executions.createExecution(db, { id, projectId: project.id, taskId: project.task,
      worktree: ctx.project.root_path, baseSha: 'test-base', topology: 'trinity', variant: 'default',
      reservationMb: 1, budgets: budget });
    await db.run('INSERT INTO ontogenesis_runs (id, project_id, task_id, topology, budgets_json) VALUES (?, ?, ?, ?, ?)',
      [id, project.id, project.task, 'trinity', JSON.stringify(budget)]);
    await store.setTaskStatus(db, { taskId: project.task, status: 'doing' });
    const error = new Error('worker-crashed');
    error.retryable = true;
    if (attempt === 1) {
      await db.exec("CREATE TRIGGER reject_failure BEFORE INSERT ON ontogenesis_memory BEGIN SELECT RAISE(ABORT, 'test-storage-failure'); END");
      await assert.rejects(failExecution(db, ctx, error), /test-storage-failure/);
      assert.strictEqual((await activeExecution(db, project.id)).phase, 'prepared');
      assert.strictEqual((await db.get('SELECT attempt FROM ontogenesis_backlog WHERE id = ?', [project.task])).attempt, 0);
      assert.strictEqual(await db.get('SELECT * FROM ontogenesis_spend WHERE project_id = ?', [project.id]), undefined);
      await db.exec('DROP TRIGGER reject_failure');
    }
    const failed = await failExecution(db, ctx, error);
    assert.strictEqual(failed.state, attempt < 3 ? 'PLANNING' : 'WAITING_INPUT');
  }
  const spent = await db.get('SELECT * FROM ontogenesis_spend WHERE project_id = ?', [project.id]);
  assert.strictEqual(spent.tokens, 300);
  assert.strictEqual(spent.seconds, 30);
  assert.strictEqual((await db.get('SELECT attempt FROM ontogenesis_backlog WHERE id = ?', [project.task])).attempt, 3);
}

async function isolated(test) {
  console.log('completion scenario:', test.name);
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try { await test(db, await fixture.project(db, root)); }
  finally { await db.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

const scenarios = { invalidConfiguration, operatorCommands, cancellation, pausedCandidate,
  recovery, failureAccounting, silentResident };

async function runScenario(name) {
  const test = scenarios[name];
  if (!test) throw new Error('completion-scenario-inconnu');
  if (['invalidConfiguration', 'silentResident'].includes(name)) await test();
  else await isolated(test);
}

async function main() {
  const selected = process.argv[2] ? [process.argv[2]] : Object.keys(scenarios);
  for (const name of selected) await runScenario(name);
  console.log('ontogenesis completion checks passed:', selected.join(', '));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
