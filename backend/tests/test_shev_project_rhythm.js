'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const authority = require('./shevFixture').authority();
const store = require('../src/services/ontogenesis/projectStore');
const { migrateMorphogenesisCapabilities } = require('../src/db/migrations/migrateMorphogenesisCapabilities');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { enrollSensor, sensorContract } = require('../src/services/shev/sensorService');
const { tickProject } = require('../src/services/shev/runtimeService');
const { compilePending } = require('../src/services/shev/initiativeService');

const projectId = 'shev-project-rhythm';
const dimension = { name: 'delivery-rhythm', expected: 'Cadence observee',
  acceptance: ['La cadence est retablie et observee sur une nouvelle fenetre.'] };

function rhythmConfig(scheduleId, overrides = {}) {
  return { scheduleId, lookbackWindows: 4, minimumObservedWindows: 3,
    maxMissedRatio: 0.25, maxObservationAgeMs: 3600000, ...overrides };
}

async function addSchedule(db, id) {
  await db.run(`INSERT INTO ontogenesis_schedules
    (id, project_id, kind, spec_json, timezone, next_run_at, status, payload_json)
    VALUES (?, ?, 'interval', ?, 'UTC', ?, 'active', '{}')`,
  [id, projectId, JSON.stringify({ policy: 'chronotaxis', periodMs: 60000,
    anchorMs: Date.now() - 600000, index: 10, bins: 12 }), new Date(Date.now() + 60000).toISOString()]);
}

async function addWindow(db, input) {
  await db.run(`INSERT INTO morph_temporal_observations
    (observation_id, schedule_id, window_index, observed_at, status, evidence_ref)
    VALUES (?, ?, ?, ?, ?, ?)`, [`${input.scheduleId}-${input.index}`, input.scheduleId,
    input.index, new Date(input.atMs).toISOString(), input.status,
    input.status === 'OBSERVED' ? `artifact:${input.scheduleId}-${input.index}` : null]);
}

async function enroll(db, input) {
  const sensor = { id: input.id, adapter: 'project-rhythm', dimension: dimension.name,
    intervalMs: 1000, config: input.config };
  const details = sensorContract(sensor);
  return enrollSensor(db, { ...sensor, projectId, expectedVersion: 1,
    authorization: authority.authorize({ projectId, operation: 'sensor-enrollment',
      subjectId: sensor.id, expectedVersion: 1, details }) });
}

async function setup(db) {
  await migrateMorphogenesisCapabilities(db);
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/rhythm',
    objective: 'Maintenir la cadence', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test',
    authorityPublicKey: authority.publicKey,
    mandate: { purpose: 'Maintenir la cadence', autoDiagnose: true,
      autoInstrument: true, dimensions: [dimension] } });
  await db.run("UPDATE ontogenesis_projects SET state = 'IDLE' WHERE id = ?", [projectId]);
}

async function recordDriftWindows(db) {
  await addSchedule(db, 'rhythm-drift');
  const now = Date.now();
  for (const [index, status] of ['OBSERVED', 'MISSED', 'OBSERVED', 'MISSED'].entries()) {
    await addWindow(db, { scheduleId: 'rhythm-drift', index, status, atMs: now - (4 - index) * 1000 });
  }
}

async function testObservedDriftWakesProject(db) {
  await recordDriftWindows(db);
  await enroll(db, { id: 'rhythm-drift-sensor', config: rhythmConfig('rhythm-drift') });
  const runtime = await tickProject(db, { projectId, fence: async () => {} });
  assert.equal(runtime.status, 'observed');
  const observation = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND domain = 'project-chronobiology'`, [projectId]);
  assert.equal(observation.kind, 'degradation');
  assert.equal(observation.epistemic_status, 'observed');
  assert.match(JSON.parse(observation.evidence_json)[0], /^chronotaxis:sha256:/);
  assert.deepEqual(await compilePending(db, { projectId }), { compiled: 1, queued: 1 });
  const initiative = await db.get('SELECT * FROM shev_initiatives WHERE observation_id = ?', [observation.id]);
  assert.equal(initiative.status, 'queued');
  assert.ok(await db.get("SELECT id FROM ontogenesis_events WHERE project_id = ? AND type = 'wake' AND consumed = 0", [projectId]));

  await db.run("UPDATE shev_sensors SET next_due_at = '2000-01-01T00:00:00Z' WHERE id = 'rhythm-drift-sensor'");
  await tickProject(db, { projectId, fence: async () => {} });
  assert.deepEqual(await compilePending(db, { projectId }), { compiled: 0, queued: 0 });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_initiatives')).n, 1);
}

async function testIncompleteAndStaleEvidenceStayClosed(db) {
  await addSchedule(db, 'rhythm-incomplete');
  await addWindow(db, { scheduleId: 'rhythm-incomplete', index: 0,
    status: 'OBSERVED', atMs: Date.now() });
  await enroll(db, { id: 'rhythm-incomplete-sensor', config: rhythmConfig('rhythm-incomplete') });

  await addSchedule(db, 'rhythm-stale');
  for (let index = 0; index < 3; index += 1) await addWindow(db, { scheduleId: 'rhythm-stale',
    index, status: 'MISSED', atMs: Date.now() - 7200000 - index * 1000 });
  await enroll(db, { id: 'rhythm-stale-sensor', config: rhythmConfig('rhythm-stale') });
  await tickProject(db, { projectId, fence: async () => {} });
  const observations = await db.all(`SELECT epistemic_status, kind FROM shev_observations
    WHERE source IN ('chronotaxis:rhythm-incomplete', 'chronotaxis:rhythm-stale') ORDER BY source`);
  assert.deepEqual(observations, [
    { epistemic_status: 'unknown', kind: 'blind_spot' },
    { epistemic_status: 'stale', kind: 'blind_spot' }
  ]);
  const result = await compilePending(db, { projectId });
  assert.deepEqual(result, { compiled: 2, queued: 1 });
  const stale = await db.get(`SELECT i.status, i.reason FROM shev_initiatives i
    JOIN shev_observations o ON o.id = i.observation_id WHERE o.epistemic_status = 'stale'`);
  assert.deepEqual(stale, { status: 'proposed', reason: 'preuve-insuffisante' });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await testObservedDriftWakesProject(db);
    await testIncompleteAndStaleEvidenceStayClosed(db);
    console.log('SHEV project rhythm checks passed: drift wake, stale fail-closed and signal deduplication.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
