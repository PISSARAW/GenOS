'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const profiler = require('../src/services/cognitiveProjectionProfilerService');

(async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  const base = { model: 'm1', task: 'signal', prompt: 'portable prompt', quality: 0.9,
    latencyMs: 100, costUsd: 0.01, representation: 'portable' };
  const candidate = { ...base, representation: 'json', prompt: '{"task":"signal"}',
    latencyMs: 20, costUsd: 0.002, quality: 0.92 };
  await profiler.record(db, base);
  await profiler.record(db, candidate);
  const selected = await profiler.select(db, { model: 'm1', task: 'signal', minSamples: 1 });
  assert.equal(selected.representation, 'json');
  const applied = await profiler.apply(db, { model: 'm1', task: 'signal', minSamples: 1,
    gvxScope: { organizationId: 'o1', projectId: 'p1', entityId: 'projection:m1:signal' } });
  assert.equal(applied.status, 'active');
  const rolledBack = await profiler.rollback(db, { model: 'm1', task: 'signal', reason: 'quality_regression',
    gvxScope: { organizationId: 'o1', projectId: 'p1', entityId: 'projection:m1:signal' } });
  assert.equal(rolledBack.representation, 'portable');
  const events = await db.all("SELECT event_type FROM gvx_development_events WHERE entity_id = 'projection:m1:signal'");
  assert.deepEqual(events.map((event) => event.event_type), ['application_recorded', 'rollback_recorded']);
  console.log('Cognitive projection profiler checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
