'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const authority = require('./shevFixture').authority();
const store = require('../src/services/ontogenesis/projectStore');
const workspaces = require('../src/services/ontogenesis/worktreeService');
const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
const { registerResponsibility, reviseResponsibility } = require('../src/services/shev/responsibilityService');
const { enrollSensor, sensorContract } = require('../src/services/shev/sensorService');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const recovery = require('../src/services/shev/recoveryService');

const projectId = 'shev-complete-domains';
const mandate = { purpose: 'Maintenir le contrat et les donnees', autoDiagnose: true, autoInstrument: false,
  dimensions: [
    { name: 'contract', expected: 'Contrat satisfait', acceptance: ['Le contrat est relu apres integration.'] },
    { name: 'freshness', expected: 'Donnees recentes', acceptance: ['La sortie est recente.'] }
  ] };
const hash = value => createHash('sha256').update(value).digest('hex');

function authorization(operation, subjectId, details) {
  return authority.authorize({ operation, subjectId, details, projectId, expectedVersion: 2 });
}

async function setup(db, root) {
  fs.writeFileSync(path.join(root, 'contract.json'), '{"ready":false}');
  fs.writeFileSync(path.join(root, 'report.csv'), 'amount\n1\n');
  await runCommand('git', ['add', 'contract.json', 'report.csv'], { cwd: root });
  await runCommand('git', ['commit', '-m', '[TEST] Domain artifacts'], { cwd: root });
  await store.createProject(db, { id: projectId, rootPath: root, branch: 'codex/ontogenesis',
    objective: 'complete', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'test-owner', mandate, authorityPublicKey: authority.publicKey });
  await reviseResponsibility(db, { projectId, expectedVersion: 1, mandate, stage: 'assisted',
    authorization: authority.authorize({ projectId, operation: 'mandate-revision', subjectId: projectId,
      expectedVersion: 1, details: { mandate, stage: 'assisted' } }) });
  const project = await store.getProject(db, projectId);
  const { worktree } = await workspaces.ensureIntegration(project);
  fs.utimesSync(path.join(worktree, 'report.csv'), new Date(0), new Date(0));
  const sensors = [
    { id: 'contract-probe', adapter: 'json-contract', dimension: 'contract', intervalMs: 1000,
      config: { relativePath: 'contract.json', target: 'integration', pointer: '/ready', expectedSha256: hash('true') } },
    { id: 'data-probe', adapter: 'data-freshness', dimension: 'freshness', intervalMs: 1000,
      config: { relativePath: 'report.csv', target: 'integration', maxAgeMs: 86400000 } }
  ];
  for (const input of sensors) await enrollSensor(db, { ...input, projectId, expectedVersion: 2,
    authorization: authorization('sensor-enrollment', input.id, sensorContract(input)) });
  return worktree;
}

function harnessFor(db) {
  const harness = fixture.fakeHarness(db);
  const start = harness.start;
  harness.start = async input => {
    const result = await start(input);
    const execution = await db.get('SELECT result_json FROM ontogenesis_execution WHERE id = ?', [input.id]);
    const candidate = JSON.parse(execution.result_json).candidateWorktree;
    const initiative = await db.get('SELECT kind, observation_id FROM shev_initiatives WHERE task_id = ?', [input.taskId]);
    const observation = await db.get('SELECT dimension FROM shev_observations WHERE project_id = ? AND id = ?', [projectId, initiative.observation_id]);
    if (observation.dimension === 'contract') fs.writeFileSync(path.join(candidate, 'contract.json'), '{"ready":true}');
    else fs.writeFileSync(path.join(candidate, 'report.csv'), 'amount\n2\n');
    return result;
  };
  return harness;
}

async function tick(db, harness) {
  return tickOnce(db, { projectId, owner: 'shev-closed-loop', harness });
}

async function runRepairs(db, harness) {
  for (let index = 0; index < 30; index += 1) {
    await tick(db, harness);
    const effects = await db.all('SELECT * FROM shev_effects');
    if (effects.length === 2) {
      assert.ok(effects.every(effect => effect.project_result === 'confirmed'));
      assert.ok(effects.every(effect => effect.agent_result === 'not_tested'));
      assert.equal(harness.launches, 2);
      return;
    }
  }
  const diagnostics = await Promise.all([
    store.getProject(db, projectId), db.all('SELECT * FROM ontogenesis_backlog'),
    db.all('SELECT * FROM shev_runtime_jobs'), db.all('SELECT * FROM shev_initiatives')
  ]);
  throw new Error(`SHEV did not close both domain effects through Ontogenesis: ${JSON.stringify(diagnostics)}`);
}

async function provokeRegressions(db, input) {
  fs.writeFileSync(path.join(input.worktree, 'contract.json'), '{"ready":false}');
  fs.utimesSync(path.join(input.worktree, 'report.csv'), new Date(0), new Date(0));
  await db.run("UPDATE shev_watches SET next_due_at = '2000-01-01T00:00:00Z'");
  await db.run("UPDATE shev_sensors SET next_due_at = '2000-01-01T00:00:00Z'");
  await tick(db, input.harness);
  const monitoring = await db.all("SELECT * FROM shev_monitoring WHERE result = 'regressed'");
  assert.equal(monitoring.length, 2);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_initiatives')).n, 2);
  return monitoring;
}

async function approve(db, monitor) {
  const plan = { actionRef: `restore:${monitor.id}`, budgetUsd: 0.1, maxSeconds: 30,
    deadlineAt: new Date(Date.now() + 3600000).toISOString(), stopCondition: 'on-regression', alternative: 'Intervention du proprietaire.' };
  await recovery.proposeRecovery(db, { projectId, monitoringId: monitor.id, plan });
  await recovery.approveRecovery(db, { projectId, monitoringId: monitor.id,
    authorization: authorization('recovery-approval', monitor.id, plan) });
}

async function interruptedRecovery(db, input) {
  const observation = await db.get('SELECT dimension FROM shev_observations WHERE id = ? AND project_id = ?', [input.monitor.observation_id, projectId]);
  const file = path.join(input.worktree, observation.dimension === 'contract' ? 'contract.json' : 'report.csv');
  let applications = 0;
  const result = await recovery.executeRecovery(db, { projectId, monitoringId: input.monitor.id,
    perform: async context => {
      assert.equal(context.idempotencyKey, input.monitor.id);
      applications += 1;
      if (observation.dimension === 'contract') fs.writeFileSync(file, '{"ready":true}');
      else fs.utimesSync(file, new Date(), new Date());
      throw new Error('Simulated disconnect after the business effect.');
    } });
  assert.equal(result.reconciliationRequired, true);
  await assert.rejects(recovery.executeRecovery(db, { monitoringId: input.monitor.id,
    perform: async () => { applications += 1; } }), /not approved/);
  assert.equal(applications, 1);
  return { result: 'applied', externalReceiptRef: `external:${input.monitor.id}`,
    evidenceRefs: [`file:sha256:${hash(fs.readFileSync(file))}`], spentUsd: 0, seconds: 0.01 };
}

async function reconcile(db, input) {
  const row = await recovery.reconcileRecovery(db, { projectId, monitoringId: input.monitor.id, receipt: input.receipt,
    authorization: authorization('recovery-reconciliation', input.monitor.id, input.receipt),
    verify: async ({ receipt }) => ({ verified: receipt.externalReceiptRef === `external:${input.monitor.id}`,
      verifierRef: 'test:external-receipt-reader', evidenceRefs: receipt.evidenceRefs }) });
  assert.equal(row.status, 'applied');
}

async function main() {
  const root = await fixture.repository();
  fs.mkdirSync(path.join(root, '.genos'), { recursive: true });
  const databasePath = path.join(root, '.genos', 'shev-test.sqlite');
  let db = await fixture.memoryDb(databasePath);
  try {
    const worktree = await setup(db, root);
    const harness = harnessFor(db);
    await runRepairs(db, harness);
    const monitoring = await provokeRegressions(db, { worktree, harness });
    for (const monitor of monitoring) {
      await approve(db, monitor);
      await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = ?", [projectId]);
      await assert.rejects(recovery.executeRecovery(db, { projectId, monitoringId: monitor.id, perform: async () => assert.fail() }), /inactive/);
      await db.run("UPDATE ontogenesis_control SET mode = 'running' WHERE project_id = ?", [projectId]);
      const receipt = await interruptedRecovery(db, { monitor, worktree });
      await db.close();
      db = await fixture.memoryDb(databasePath);
      await reconcile(db, { monitor, receipt });
    }
    const restartedHarness = harnessFor(db);
    await tick(db, restartedHarness);
    for (const monitor of monitoring) {
      const newest = await db.get('SELECT * FROM shev_monitoring WHERE initiative_id = ? ORDER BY rowid DESC LIMIT 1', [monitor.initiative_id]);
      assert.equal(newest.result, 'confirmed');
      assert.notEqual(newest.id, monitor.id);
    }
    const count = (await db.get('SELECT COUNT(*) AS n FROM shev_initiatives')).n;
    await db.run("UPDATE shev_sensors SET next_due_at = '2001-01-01T00:00:00Z'");
    await tick(db, restartedHarness);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_initiatives')).n, count);
    assert.equal(restartedHarness.launches, 0);
    await assert.rejects(db.run("DELETE FROM shev_monitoring"), /immutable/);
    console.log('SHEV two-domain closed loop passed: integrated repairs, monitoring, pause, crash, durable reconciliation, recheck and quiescence.');
  } finally {
    await db.close();
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.includes('onto-runtime-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
