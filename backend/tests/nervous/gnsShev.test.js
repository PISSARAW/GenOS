'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('../ontogenesisFixture');
const { authority } = require('../shevFixture');
const projects = require('../../src/services/ontogenesis/projectStore');
const { tickOnce } = require('../../src/services/ontogenesis/tickService');
const { registerResponsibility } = require('../../src/services/shev/responsibilityService');
const sensors = require('../../src/services/shev/sensorService');
const { tickProject } = require('../../src/services/shev/runtimeService');
const { compilePending } = require('../../src/services/shev/initiativeService');
const { reconcileProject } = require('../../src/services/shev/healingReconciliationService');
const { NervousStore } = require('../../src/services/nervous/store');
const { NervousRuntime } = require('../../src/services/nervous/runtime');
const bridge = require('../../src/services/nervous/runtimeBridge');

async function setup(t, options = {}) {
  const previous = process.env.GENOS_NERVOUS_ENABLED;
  process.env.GENOS_NERVOUS_ENABLED = '1';
  const db = await fixture.memoryDb();
  const storage = await fixture.memoryDb();
  const store = await new NervousStore(storage).initialize();
  const time = { now: Date.now() - 5000 };
  const runtime = new NervousRuntime(store, { clock: () => time.now });
  bridge.runtimes.set(db, Promise.resolve(runtime));
  t.after(async () => {
    bridge.runtimes.delete(db); await store.close(); await db.close();
    if (previous === undefined) delete process.env.GENOS_NERVOUS_ENABLED;
    else process.env.GENOS_NERVOUS_ENABLED = previous;
  });
  const owner = authority();
  const scope = { organizationId: 'org-shev', projectId: 'project-shev' };
  const config = { ...fixture.testConfig(), gvxScope: { organizationId: scope.organizationId, entityId: 'repo' } };
  await projects.createProject(db, { id: scope.projectId, rootPath: 'C:/test', branch: config.branch, config });
  await registerResponsibility(db, { projectId: scope.projectId, authorityRef: 'delegation:test',
    authorityPublicKey: owner.publicKey, mandate: { purpose: 'Surveiller le fonctionnement',
      autoDiagnose: true, autoInstrument: false, dimensions: [{ name: 'runtime', expected: 'Repos mesure',
        acceptance: ['Mesurer trois echantillons de repos apres le diagnostic.'] }],
      ...(options.endogenous && { endogenousPolicy: { enabled: true, observerKeyId: 'observer-test',
        observerPublicKey: owner.publicKey, cooldownMs: 1000, windowMs: 10000, maxActionsPerWindow: 1 } }) } });
  const sensor = { id: 'gns-runtime', projectId: scope.projectId, expectedVersion: 1,
    adapter: 'gns-operational', dimension: 'runtime', intervalMs: 1000,
    config: { organizationId: scope.organizationId, agentIds: options.agentIds || ['worker-shev'] } };
  const authorization = owner.authorize({ operation: 'sensor-enrollment', projectId: scope.projectId,
    subjectId: sensor.id, expectedVersion: 1, details: sensors.sensorContract(sensor) });
  await sensors.enrollSensor(db, { ...sensor, authorization });
  return { db, runtime, store, scope, time };
}

async function signal(h, input) {
  return h.runtime.ingest({ id: input.id, agentId: input.agentId || 'worker-shev', eventType: input.kind || 'NERVOUS_RESOURCE_SAMPLE',
    timestamp: new Date(h.time.now).toISOString(), payload: { ...h.scope, resourcePressure: input.pressure } }, h.scope);
}

async function due(h) {
  h.sequence = (h.sequence || 0) + 1;
  const at = new Date(Date.now() - 10000 + h.sequence).toISOString();
  await h.db.run('UPDATE shev_sensors SET next_due_at = ?', [at]);
  await h.db.run('UPDATE shev_watches SET next_due_at = ?', [at]);
  return tickProject(h.db, { projectId: h.scope.projectId, fence: async () => {} });
}

test('authorized GNS sensor feeds repair admission and verified longitudinal healing through real runtime', async t => {
  const h = await setup(t);
  const root = await fixture.repository();
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await h.db.run('UPDATE ontogenesis_projects SET root_path = ? WHERE id = ?', [root, h.scope.projectId]);
  await signal(h, { id: 'incident', kind: 'AGENT_FAILED' });
  const observed = await due(h);
  assert.equal(observed.jobs[0].status, 'done');
  await compilePending(h.db, { projectId: h.scope.projectId });
  await reconcileProject(h.db, { projectId: h.scope.projectId });
  const initiative = await h.db.get('SELECT * FROM shev_initiatives');
  assert.equal(initiative.status, 'queued');
  assert.equal((await h.db.get('SELECT current_phase FROM shev_healing_episodes')).current_phase, 'inflammation');
  const harness = fixture.fakeHarness(h.db);
  let lastTick;
  for (let i = 0; i < 12; i += 1) {
    lastTick = await tickOnce(h.db, { projectId: h.scope.projectId, owner: 'gns-test', harness });
    if ((await h.db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [initiative.task_id])).status === 'done') break;
  }
  const completedTask = await h.db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [initiative.task_id]);
  const projectState = await h.db.get('SELECT state FROM ontogenesis_projects WHERE id=?', [h.scope.projectId]);
  const lastExecution = await h.db.get('SELECT phase,result_json FROM ontogenesis_execution ORDER BY rowid DESC LIMIT 1');
  assert.equal(completedTask.status, 'done', JSON.stringify({ projectState, lastExecution, lastTick }));
  assert.equal((await h.db.get('SELECT count(*) AS n FROM shev_effects')).n, 0);
  h.time.now = Date.now() - 1000;
  for (let i = 0; i < 3; i += 1) {
    h.time.now += 100;
    await signal(h, { id: `recovery-${i}`, pressure: 0.1 });
  }
  await due(h);
  await reconcileProject(h.db, { projectId: h.scope.projectId });
  assert.equal((await h.db.get('SELECT project_result FROM shev_effects')).project_result, 'confirmed');
  for (let i = 0; i < 2; i += 1) {
    h.time.now += 100;
    await signal(h, { id: `monitor-${i}`, pressure: 0.1 });
    await due(h);
    await reconcileProject(h.db, { projectId: h.scope.projectId });
  }
  assert.equal((await h.db.get('SELECT current_phase FROM shev_healing_episodes')).current_phase, 'healed');
  const captures = await h.db.all("SELECT phase, execution_id FROM ontogenesis_nervous_history WHERE phase != 'context'");
  assert.deepEqual(captures.map(row => row.phase).sort(), ['after', 'before']);
  assert.equal(captures[0].execution_id, captures[1].execution_id);
  assert.ok((await h.store.effects(h.scope)).every(effect => effect.status === 'PROPOSED'));
});

test('GNS sensor fails closed for scope mismatch and disabled mode, and stale signals cannot diagnose', async t => {
  const h = await setup(t);
  const sensor = await h.db.get('SELECT * FROM shev_sensors');
  const wrong = { ...sensor, config_json: JSON.stringify({ organizationId: 'other-org', agentIds: ['worker-shev'] }) };
  await assert.rejects(sensors.sampleSensor(h.db, { sensor: wrong, sampleRef: 'wrong' }), /SCOPE_MISMATCH/);
  await signal(h, { id: 'old-incident', kind: 'AGENT_FAILED' });
  h.time.now += 31000;
  const unknown = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'expired' });
  assert.equal(unknown.kind, 'blind_spot');
  assert.equal(unknown.epistemicStatus, 'unknown');
  await compilePending(h.db, { projectId: h.scope.projectId });
  assert.equal((await h.db.get('SELECT count(*) AS n FROM ontogenesis_backlog')).n, 0);
  delete process.env.GENOS_NERVOUS_ENABLED;
  await assert.rejects(sensors.sampleSensor(h.db, { sensor, sampleRef: 'off' }), /GNS_DISABLED/);
});

test('a recent agent cannot extend the oldest source expiry in a collective GNS sensor', async t => {
  const h = await setup(t, { agentIds: ['worker-shev', 'worker-b'] });
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  h.time.now = current - 29000;
  await signal(h, { id: 'older', kind: 'AGENT_FAILED' });
  h.time.now = current - 1000;
  await signal(h, { id: 'newer', kind: 'AGENT_FAILED', agentId: 'worker-b' });
  const sensor = await h.db.get('SELECT * FROM shev_sensors');
  const fresh = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'collective-fresh' });
  assert.equal(fresh.kind, 'degradation');
  assert.equal(Date.parse(fresh.validUntil), current + 1000);
  h.time.now = current + 2000;
  const expired = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'collective-expired' });
  assert.equal(expired.epistemicStatus, 'unknown');
  assert.equal(expired.kind, 'blind_spot');
});

test('GNS sensor cannot bypass an enrolled endogenous observer signature or sensor authority', async t => {
  const h = await setup(t, { endogenous: true });
  await signal(h, { id: 'unsigned-incident', kind: 'AGENT_FAILED' });
  const sensor = await h.db.get('SELECT * FROM shev_sensors');
  await assert.rejects(sensors.sampleSensor(h.db, { sensor, sampleRef: 'unsigned' }), /observer signature/);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM shev_observations')).n, 0);
  await assert.rejects(sensors.enrollSensor(h.db, { id: 'unauthorized', projectId: h.scope.projectId,
    expectedVersion: 1, adapter: 'gns-operational', dimension: 'runtime', intervalMs: 1000,
    config: { organizationId: h.scope.organizationId, agentIds: ['worker-shev'] }, authorization: {} }),
  /authorization/);
});

test('a recent completion cannot renew old REST measurements or manufacture a later observation window', async t => {
  const h = await setup(t);
  const current = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: current });
  h.time.now = current - 29000;
  for (let i = 0; i < 3; i += 1) {
    await signal(h, { id: `old-rest-${i}`, pressure: 0.1 });
    h.time.now += 10;
  }
  const measuredAt = current - 28980;
  h.time.now = current - 1000;
  await signal(h, { id: 'recent-completion', kind: 'TOOL_CALL_COMPLETED' });
  const sensor = await h.db.get('SELECT * FROM shev_sensors');
  const sample = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'old-rest' });
  assert.equal(sample.kind, 'state');
  assert.equal(Date.parse(sample.observedAt), measuredAt);
  assert.equal(Date.parse(sample.validUntil), measuredAt + 30000);
  assert.ok(sample.evidenceRefs.includes('telemetry-event:old-rest-2'));
  assert.ok(!sample.evidenceRefs.includes('telemetry-event:recent-completion'));
  h.time.now = current - 500;
  await signal(h, { id: 'another-completion', kind: 'TOOL_CALL_COMPLETED' });
  const repeated = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'old-rest-again' });
  assert.equal(repeated.observedAt, sample.observedAt);
  assert.equal(repeated.validUntil, sample.validUntil);
  h.time.now = current + 2000;
  const expired = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'old-rest-expired' });
  assert.equal(expired.epistemicStatus, 'unknown');
});

test('a crashed sample job replays its immutable observation after new GNS ingestion', async t => {
  const h = await setup(t);
  await signal(h, { id: 'original-incident', kind: 'AGENT_FAILED' });
  const sensor = await h.db.get('SELECT * FROM shev_sensors');
  const original = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'interrupted-job' });
  for (let i = 0; i < 3; i += 1) {
    h.time.now += 100;
    await signal(h, { id: `new-recovery-${i}`, pressure: 0.1 });
  }
  const replayed = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'interrupted-job' });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.id, original.id);
  assert.equal(replayed.kind, 'degradation');
  assert.equal(replayed.observedAt, original.observedAt);
  assert.deepEqual(replayed.evidenceRefs, original.evidenceRefs);
  const fresh = await sensors.sampleSensor(h.db, { sensor, sampleRef: 'new-job' });
  assert.equal(fresh.kind, 'state');
  assert.equal((await h.db.get('SELECT count(*) AS n FROM shev_observations')).n, 2);
});
