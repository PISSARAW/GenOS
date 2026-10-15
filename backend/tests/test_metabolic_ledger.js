'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrationRunners } = require('../src/db/migrations/registry');
const ledger = require('../src/services/metabolicLedgerService');

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON;');
  const migration = migrationRunners.find((runner) => runner.name === '122-metabolic-ledger');
  assert(migration, 'metabolic ledger migration must be registered');
  await migration.run(db);
  return db;
}

function observation(id, measurements, overrides = {}) {
  return { id, missionId: 'mission-1', threadId: 'thread-1', provider: 'provider-1',
    model: 'model-1', observedAt: '2026-10-15T10:00:00.000Z', measurements, ...overrides };
}

async function verifyExactZeroAndUnknown() {
  const db = await createDatabase();
  await ledger.recordMetabolicObservation(db, observation('obs-zero', {
    inputTokens: { value: 0, source: 'exact' },
    billedCostUsd: { value: 0, source: 'provider_receipt', evidenceRef: 'receipt:zero' },
    toolCostUsd: { source: 'unavailable', unavailableReason: 'tool omitted usage' }
  }));
  const aggregate = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-1' });
  assert.equal(aggregate.metrics.inputTokens.value, 0);
  assert.equal(aggregate.metrics.billedCostUsd.value, 0);
  assert.equal(aggregate.metrics.toolCostUsd.value, null);
  assert.equal(aggregate.metrics.toolCostUsd.source, 'unavailable');
  assert.equal(aggregate.metrics.runtimeCostUsd.value, null,
    'an unobserved metric must not be synthesized as zero');
  await db.close();
}

async function verifyMixedAggregation() {
  const db = await createDatabase();
  await ledger.recordMetabolicObservation(db, observation('obs-provider', {
    inputTokens: { value: 5, source: 'provider_receipt', evidenceRef: 'receipt:1' },
    activeTimeMs: { value: 20, source: 'exact' }
  }));
  await ledger.recordMetabolicObservation(db, observation('obs-estimate', {
    inputTokens: { value: 3, source: 'estimated', estimationMethod: 'utf8-bytes/4' },
    activeTimeMs: { value: 10, source: 'exact' }
  }, { threadId: 'thread-2' }));
  const aggregate = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-1' });
  assert.equal(aggregate.metrics.inputTokens.value, 8);
  assert.equal(aggregate.metrics.inputTokens.source, 'estimated');
  assert.deepEqual(aggregate.metrics.inputTokens.sources, { provider_receipt: 1, estimated: 1 });
  assert.equal(aggregate.metrics.activeTimeMs.value, 30);
  const filtered = await ledger.aggregateMetabolicUsage(db,
    { missionId: 'mission-1', threadId: 'thread-1' });
  assert.equal(filtered.metrics.inputTokens.value, 5);
  assert.equal(filtered.metrics.inputTokens.source, 'provider_receipt');
  await db.close();
}

async function verifyIncompleteAggregation() {
  const db = await createDatabase();
  await ledger.recordMetabolicObservation(db, observation('obs-known', {
    outputTokens: { value: 4, source: 'exact' }
  }));
  await ledger.recordMetabolicObservation(db, observation('obs-unknown', {
    outputTokens: { source: 'unavailable', unavailableReason: 'provider omitted usage' }
  }));
  const aggregate = await ledger.aggregateMetabolicUsage(db, { missionId: 'mission-1' });
  assert.equal(aggregate.metrics.outputTokens.value, null);
  assert.equal(aggregate.metrics.outputTokens.observedValue, 4);
  assert.equal(aggregate.metrics.outputTokens.complete, false);
  assert.deepEqual(aggregate.metrics.outputTokens.sources, { exact: 1, unavailable: 1 });
  await db.close();
}

async function verifyValidationAndImmutability() {
  const db = await createDatabase();
  await assert.rejects(ledger.recordMetabolicObservation(db, observation('bad-estimate', {
    inputTokens: { value: 1, source: 'estimated' }
  })), /estimationMethod/);
  await assert.rejects(ledger.recordMetabolicObservation(db, observation('bad-null', {
    inputTokens: { value: null, source: 'exact' }
  })), /finite non-negative/);
  await ledger.recordMetabolicObservation(db, observation('immutable', {
    wallTimeMs: { value: 0, source: 'exact' }
  }));
  await assert.rejects(db.run(`UPDATE metabolic_ledger_measurements SET value = 1
    WHERE observation_id = 'immutable'`), /immutable/);
  await db.close();
}

async function main() {
  await verifyExactZeroAndUnknown();
  await verifyMixedAggregation();
  await verifyIncompleteAggregation();
  await verifyValidationAndImmutability();
  console.log('Metabolic ledger validation, provenance and aggregation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
