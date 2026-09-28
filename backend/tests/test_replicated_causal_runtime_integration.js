'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const registry = require('../src/services/proceduralRegistryService');
const handler = require('../src/services/primitiveHandlers/proceduralHandlers').replicatedCausalCheck;
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { loadReceipt } = require('../src/services/versionedContractPersistenceService');

async function setupDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateVersionedContractReceipts(db);
  return db;
}

function registerInputs() {
  const environmentId = 'causal-runtime-env';
  const snapshotId = 'causal-runtime-snapshot';
  const runnerId = 'causal-runtime-runner';
  registry.registerEnvironment(environmentId, { runtime: 'node', revision: 'fixture-1' });
  registry.registerSnapshot(snapshotId, { value: 0 });
  registry.registerRunner(runnerId, async (arm, state, context) => {
    state.value += arm.delta;
    return {
      seed: context.seed,
      environmentHash: context.environmentHash,
      metric: state.value,
      trajectory: [{ value: state.value }],
      steps: 1,
    };
  });
  return { environmentId, snapshotId, runnerId };
}

async function main() {
  const db = await setupDatabase();
  const inputs = registerInputs();
  const result = await handler({
    db,
    ...inputs,
    experimentId: 'causal-runtime-integration',
    seeds: [5, 13, 29],
    budget: { maxRuns: 6, maxSteps: 2 },
    control: { delta: 0 },
    intervention: { delta: 2 },
    evidenceRefs: ['protocol:runtime-integration-v1'],
  });
  assert.equal(result.receipt.contractType, 'CausalInterventionReceipt');
  assert.equal(result.pairs.length, 3);
  assert.equal(result.effect.meanDifference, 2);
  assert.deepEqual(result.pairs.map((pair) => pair.seed), [5, 13, 29]);
  assert.deepEqual(result.pairs.map((pair) => pair.divergenceSteps), [[0], [0], [0]]);
  assert.equal((await loadReceipt(db, result.receipt.receiptId)).receiptId, result.receipt.receiptId);
  assert.deepEqual(registry.resolveSnapshot(inputs.snapshotId), { value: 0 });
  await assert.rejects(() => handler({
    db, ...inputs, experimentId: 'causal-bad-seeds', seeds: [1, 1, 2],
    budget: { maxRuns: 6, maxSteps: 2 }, control: {}, intervention: {},
  }), { code: 'CAUSAL_SEED_INVALID' });
  await assert.rejects(() => handler({
    db, ...inputs, experimentId: 'causal-bad-environment', environmentHash: '0'.repeat(64),
    seeds: [1, 2, 3], budget: { maxRuns: 6, maxSteps: 2 }, control: {}, intervention: {},
  }), { code: 'CAUSAL_ENV_DRIFT' });
  registry.unregisterRunner(inputs.runnerId);
  registry.unregisterEnvironment(inputs.environmentId);
  registry.unregisterSnapshot(inputs.snapshotId);
  await db.close();
  console.log('Replicated causal runtime integration: registry, paired execution and SQLite receipt passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
