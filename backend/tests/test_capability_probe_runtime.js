'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const schedule = require('../src/services/ontogenesis/scheduleService');
const probes = require('../src/services/morphogenesis/capabilities/residentProbeRuntime');
const phases = require('../src/services/morphogenesis/capabilities/chronotaxis');

async function run(db) {
  await db.exec('CREATE TABLE ontogenesis_projects (id TEXT PRIMARY KEY)');
  await db.run("INSERT INTO ontogenesis_projects VALUES ('project')");
  await require('../src/db/migrations/migrateOntogenesisSchedule').migrateOntogenesisSchedule(db);
  const anchorMs = Date.parse('2026-10-06T00:00:00Z');
  const id = await schedule.createSchedule(db, { id: 'probe', projectId: 'project', kind: 'interval', nowMs: anchorMs,
    spec: { policy: 'chronotaxis', periodMs: 1000, anchorMs, maximumLatencyMs: 900,
      minimumSpacingMs: 200, offset: 0.3, bins: 8 }, payload: { probeId: 'database-health', environmentId: 'island-a', hostId: 'resident-a' } });
  let row = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [id]);
  const first = row;
  const result = await probes.dispatch(db, { row, nowMs: Date.parse(row.next_run_at) });
  assert.equal(result.status, 'OBSERVED');
  assert.equal((await probes.dispatch(db, { row: first, nowMs: Date.parse(first.next_run_at) })).skipped, true);
  const aggregate = await probes.aggregate(db, { scopeId: 'PROJECT:project', since: '2026-01-01', limit: 10 });
  assert.equal(aggregate.observations.length, 1);
  assert.equal(aggregate.observations[0].content.result.healthy, true);
  assert.equal(aggregate.observations[0].content.environmentId, 'island-a');
  row = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [id]);
  assert.ok(Date.parse(row.next_run_at) - Date.parse(first.next_run_at) >= 200);
  const spec = JSON.parse(row.spec_json);
  const bounds = phases.windowBounds(spec, spec.index);
  assert.equal((await probes.dispatch(db, { row, nowMs: bounds.endMs + 1 })).status, 'MISSED');
  assert.equal((await schedule.temporalCoverage(db, { scheduleId: id, resolveArtifact: async () => false })).covered, 0);
  assert.equal((await schedule.temporalCoverage(db, { scheduleId: id })).missedWindows, 1);
  await faultChecks(db, anchorMs);
  await assert.rejects(probes.aggregate(db, { scopeId: 'PROJECT:project', limit: 1001 }), /BOUNDED/);
}
module.exports = run;

async function faultChecks(db, nowMs) {
  await assert.rejects(schedule.createSchedule(db, { projectId: 'project', kind: 'interval', nowMs,
    spec: { policy: 'chronotaxis', periodMs: 1000 }, payload: { probeId: 'shell' } }), /READ_ONLY/);
  const id = await schedule.createSchedule(db, { id: 'failure', projectId: 'project', kind: 'interval', nowMs,
    spec: { policy: 'chronotaxis', periodMs: 1000, minimumSpacingMs: 0 }, payload: { probeId: 'resident-agents' } });
  const row = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [id]);
  assert.equal((await probes.dispatch(db, { row, nowMs: Date.parse(row.next_run_at) })).status, 'FAILED');
  assert.equal((await schedule.temporalCoverage(db, { scheduleId: id })).covered, 0);
  const current = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [id]);
  await db.run('UPDATE ontogenesis_schedules SET payload_json = ? WHERE id = ?', [JSON.stringify({ probeId: 'shell' }), id]);
  const invalid = await probes.dispatch(db, { row: current, nowMs: Date.parse(current.next_run_at) });
  assert.equal(invalid.paused, true);
  assert.equal((await db.get('SELECT status FROM ontogenesis_schedules WHERE id = ?', [id])).status, 'paused');
}
