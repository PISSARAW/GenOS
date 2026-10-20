'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const api = require('../src/services/metapopulationCoordinationService');
const runtime = require('../src/services/metapopulation/runtime/regionalRuntimeService');
const registry = require('../src/services/metapopulation/migration/migrationAdapterRegistry');

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  await migrateMetapopulationRuntime(db);
  return db;
}

function cycleAdapters(state, action) {
  return {
    observe: async () => ({ revision: 1 }),
    diagnose: async () => ({ status: 'READY' }),
    plan: async () => ({ actions: [action] }),
    execute: async (plan) => {
      state.executions += 1;
      state.key = plan.actions[0].idempotencyKey;
      return { completed: true, results: [{ type: action.type }] };
    },
    verify: async () => ({ valid: true })
  };
}

async function cycleIdempotencyIsDurable(db) {
  const session = await api.createMetapopulationSession('Idempotency cycle test.', { db });
  const input = { metapopulationId: session.sessionId, cycle: 1 };
  const state = { executions: 0, key: null };
  const adapters = cycleAdapters(state, { type: 'EXTERNAL_EFFECT', idempotencyKey: 'effect-key' });
  const first = await runtime.runRegionalCycle(input, { db, adapters });
  assert.equal(first.status, 'VERIFIED');
  assert.equal(state.executions, 1);
  const persisted = await db.get(`SELECT idempotency_key FROM metapopulation_cycle_states
    WHERE metapopulation_id = ?`, session.sessionId);
  assert.equal(persisted.idempotency_key, 'effect-key');
  const replay = await runtime.runRegionalCycle({ ...input, cycle: 2 }, { db, adapters });
  assert.equal(replay.status, 'FAILED');
  assert.equal(replay.reason, 'REGIONAL_ACTION_DUPLICATE');
  assert.equal(state.executions, 1);
  const indexes = await db.all("PRAGMA index_list('metapopulation_cycle_states')");
  assert.equal(indexes.find((entry) => entry.name === 'idx_cycle_states_idempotency_key')?.unique, 1);
}

async function executeActionsAlwaysHaveKeys(db) {
  const session = await api.createMetapopulationSession('Generated key test.', { db });
  const state = { executions: 0, key: null };
  const generated = await runtime.runRegionalCycle({ metapopulationId: session.sessionId, cycle: 1 },
    { db, adapters: cycleAdapters(state, { type: 'EXTERNAL_EFFECT' }) });
  assert.equal(generated.status, 'VERIFIED');
  assert.match(state.key, /^[a-f0-9]{64}$/);
  const invalid = await runtime.runRegionalCycle({ metapopulationId: session.sessionId, cycle: 2 },
    { db, adapters: cycleAdapters(state, { type: 'EXTERNAL_EFFECT', idempotencyKey: ' ' }) });
  assert.equal(invalid.status, 'FAILED');
  assert.equal(invalid.reason, 'REGIONAL_ACTION_IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(state.executions, 1);
}

async function adapterContractRequiresKeys() {
  let received = null;
  const adapter = { validate: async () => ({ valid: true }),
    assimilate: async (context) => { received = context.idempotencyKey; return { receiptId: 'one', provenance: {} }; } };
  registry.registerAdapter('STRATEGY', adapter);
  try {
    assert.equal(registry.IDEMPOTENCY_CONTRACT.keyField, 'idempotencyKey');
    await assert.rejects(() => registry.invokeAdapter(adapter, 'assimilate', {}),
      { code: 'METAPOPULATION_ADAPTER_IDEMPOTENCY_KEY_REQUIRED' });
    await registry.invokeAdapter(adapter, 'assimilate', { idempotencyKey: 'migration-one' });
    assert.equal(received, 'migration-one');
  } finally {
    registry.clearAdapter('STRATEGY');
  }
}

async function main() {
  const db = await createDatabase();
  try {
    await cycleIdempotencyIsDurable(db);
    await executeActionsAlwaysHaveKeys(db);
    await adapterContractRequiresKeys();
    console.log('Metapopulation external adapter and cycle idempotency: PASS');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
