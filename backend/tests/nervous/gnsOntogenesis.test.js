'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('../ontogenesisFixture');
const { createProject, getProject } = require('../../src/services/ontogenesis/projectStore');
const { compileDevelopmentalContext } = require('../../src/services/ontogenesis/developmentalContextService');
const { NervousStore } = require('../../src/services/nervous/store');
const { NervousRuntime } = require('../../src/services/nervous/runtime');
const bridge = require('../../src/services/nervous/runtimeBridge');
const { capture } = require('../../src/services/nervous/ontogenesisAdapter');
const { tickOnce } = require('../../src/services/ontogenesis/tickService');

async function setup(t) {
  const previous = process.env.GENOS_NERVOUS_ENABLED;
  process.env.GENOS_NERVOUS_ENABLED = '1';
  const db = await fixture.memoryDb();
  const storage = await fixture.memoryDb();
  const store = await new NervousStore(storage).initialize();
  const time = { now: Date.now() - 10000 };
  const runtime = new NervousRuntime(store, { clock: () => time.now });
  bridge.runtimes.set(db, Promise.resolve(runtime));
  t.after(async () => {
    bridge.runtimes.delete(db);
    await store.close(); await db.close();
    if (previous === undefined) delete process.env.GENOS_NERVOUS_ENABLED;
    else process.env.GENOS_NERVOUS_ENABLED = previous;
  });
  const config = { ...fixture.testConfig(), gvxScope: { organizationId: 'org-onto', entityId: 'repo' } };
  await createProject(db, { id: 'project-onto', rootPath: 'C:/test', branch: 'codex/test', config });
  return { db, runtime, time, scope: { organizationId: 'org-onto', projectId: 'project-onto' } };
}

async function sample(h, input) {
  return h.runtime.ingest({ id: input.id, agentId: 'worker-onto', eventType: 'NERVOUS_RESOURCE_SAMPLE',
    timestamp: new Date(h.time.now).toISOString(), payload: { ...h.scope, resourcePressure: input.pressure } }, h.scope);
}

test('developmental runtime context persists scoped GNS history and before/after comparisons', async t => {
  const h = await setup(t);
  await sample(h, { id: 'before', pressure: 0.9 });
  const before = await capture(h.db, { projectId: h.scope.projectId, executionId: 'adapt-1', phase: 'before' });
  assert.equal(before.snapshot.agents[0].pressure, 0.9);
  assert.equal(before.snapshot.agents[0].pressureAt, h.time.now);
  assert.equal(before.snapshot.agents[0].lastThreatAt, h.time.now);
  h.time.now += 1000;
  await sample(h, { id: 'after', pressure: 0.2 });
  const after = await capture(h.db, { projectId: h.scope.projectId, executionId: 'adapt-1', phase: 'after', outcome: 'integrated' });
  assert.equal(after.comparison.changes[0].pressureDelta, -0.7);
  assert.equal(after.comparison.causalAttribution, 'not_claimed');
  assert.equal(after.snapshot.evidenceStatus, 'UNVERIFIED');
  const context = await compileDevelopmentalContext(h.db, await getProject(h.db, h.scope.projectId));
  assert.equal(context.nervous.available, true);
  assert.equal(context.nervous.history.length, 3);
  assert.equal(context.nervous.mayPromote, false);
  await capture(h.db, { projectId: h.scope.projectId, executionId: 'adapt-1', phase: 'after', outcome: 'integrated' });
  assert.equal((await h.db.get('SELECT count(*) AS n FROM ontogenesis_nervous_history')).n, 3);
});

test('canonical project scope rejects forged config, retains expired history as unknown and respects disable', async t => {
  const h = await setup(t);
  await sample(h, { id: 'old', pressure: 0.95 });
  h.time.now += 31000;
  const context = await compileDevelopmentalContext(h.db, { id: h.scope.projectId,
    config_json: JSON.stringify({ gvxScope: { organizationId: 'forged', entityId: 'bad' } }) });
  assert.equal(context.nervous.snapshot.scope.organizationId, 'org-onto');
  assert.equal(context.nervous.snapshot.agents[0].pressure, null);
  assert.equal(context.nervous.snapshot.agents[0].mode, 'UNKNOWN');
  assert.equal(context.nervous.snapshot.signalRefs.length, 1);
  const absent = await capture(h.db, { projectId: 'other', phase: 'context' });
  assert.equal(absent.status, 'UNAVAILABLE');
  delete process.env.GENOS_NERVOUS_ENABLED;
  assert.equal((await capture(h.db, { projectId: h.scope.projectId, phase: 'context' })).status, 'DISABLED');
});

test('production dispatch and integration controllers capture the same real execution before and after', async t => {
  const h = await setup(t);
  const root = await fixture.repository();
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await h.db.run('UPDATE ontogenesis_projects SET root_path = ?, branch = ? WHERE id = ?',
    [root, 'codex/ontogenesis', h.scope.projectId]);
  const { addTask } = require('../../src/services/ontogenesis/projectStore');
  const taskId = await addTask(h.db, { projectId: h.scope.projectId, title: 'complete app' });
  await sample(h, { id: 'measured', pressure: 0.5 });
  const harness = fixture.fakeHarness(h.db);
  for (let i = 0; i < 12; i += 1) {
    await tickOnce(h.db, { projectId: h.scope.projectId, owner: 'gns-onto-test', harness });
    if ((await h.db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [taskId])).status === 'done') break;
  }
  assert.equal((await h.db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [taskId])).status, 'done');
  const rows = await h.db.all("SELECT * FROM ontogenesis_nervous_history WHERE phase != 'context' ORDER BY rowid");
  assert.deepEqual(rows.map(row => row.phase), ['before', 'after']);
  assert.equal(rows[0].execution_id, rows[1].execution_id);
  assert.equal(JSON.parse(rows[1].snapshot_json).outcome, 'integrated');
});

test('production failure controller captures failed execution without claiming a repair', async t => {
  const h = await setup(t);
  const { addTask } = require('../../src/services/ontogenesis/projectStore');
  const { createExecution } = require('../../src/services/ontogenesis/executionStore');
  const { failExecution } = require('../../src/services/ontogenesis/executionLifecycle');
  const taskId = await addTask(h.db, { projectId: h.scope.projectId, title: 'repair' });
  await createExecution(h.db, { id: 'failed-adaptation', projectId: h.scope.projectId, taskId,
    worktree: 'C:/test', baseSha: 'base', topology: 'trinity', variant: 'default', reservationMb: 1,
    budgets: { tokens: 1, usd: 0, seconds: 1 } });
  await sample(h, { id: 'failed-pressure', pressure: 0.9 });
  await failExecution(h.db, { project: await getProject(h.db, h.scope.projectId) }, new Error('test-failure'));
  const after = await h.db.get("SELECT snapshot_json FROM ontogenesis_nervous_history WHERE phase = 'after'");
  assert.equal(JSON.parse(after.snapshot_json).outcome, 'failed');
  assert.equal(JSON.parse(after.snapshot_json).evidenceStatus, 'UNVERIFIED');
});

test('authorized project trace purge includes the persisted GNS adaptation history', async t => {
  const h = await setup(t);
  const root = await fixture.repository();
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await h.db.run("UPDATE ontogenesis_projects SET root_path = ?, state = 'STOPPED' WHERE id = ?", [root, h.scope.projectId]);
  await h.db.run("UPDATE ontogenesis_control SET mode = 'stopped' WHERE project_id = ?", [h.scope.projectId]);
  await sample(h, { id: 'trace', pressure: 0.6 });
  await capture(h.db, { projectId: h.scope.projectId, phase: 'context' });
  const { planPurge, purgeProject } = require('../../src/services/ontogenesis/purgeService');
  const plan = await planPurge(h.db, { projectId: h.scope.projectId });
  assert.equal(plan.counts.ontogenesis_nervous_history, 1);
  const receipt = await purgeProject(h.db, { projectId: h.scope.projectId, confirmation: h.scope.projectId });
  assert.equal(receipt.deleted.ontogenesis_nervous_history, 1);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM ontogenesis_nervous_history')).n, 0);
});

test('production stop controller records a suspended adaptation with its supporting measurement dates', async t => {
  const h = await setup(t);
  const { addTask } = require('../../src/services/ontogenesis/projectStore');
  const { createExecution } = require('../../src/services/ontogenesis/executionStore');
  const { stopExecution } = require('../../src/services/ontogenesis/executionLifecycle');
  const taskId = await addTask(h.db, { projectId: h.scope.projectId, title: 'paused adaptation' });
  await createExecution(h.db, { id: 'suspended-adaptation', projectId: h.scope.projectId, taskId,
    worktree: 'C:/test', baseSha: 'base', topology: 'trinity', variant: 'default', reservationMb: 1,
    budgets: { tokens: 1, usd: 0, seconds: 1 } });
  await sample(h, { id: 'suspended-pressure', pressure: 0.5 });
  await capture(h.db, { projectId: h.scope.projectId, executionId: 'suspended-adaptation', phase: 'before' });
  assert.equal(await stopExecution(h.db, { project: await getProject(h.db, h.scope.projectId),
    control: { mode: 'paused' } }, { stop: async () => true }), true);
  const rows = await h.db.all("SELECT * FROM ontogenesis_nervous_history WHERE execution_id = 'suspended-adaptation' ORDER BY rowid");
  assert.deepEqual(rows.map(row => row.phase), ['before', 'after']);
  const after = JSON.parse(rows[1].snapshot_json);
  assert.equal(after.outcome, 'suspended');
  assert.equal(after.agents[0].pressureAt, h.time.now);
  assert.equal(after.evidenceStatus, 'UNVERIFIED');
});
