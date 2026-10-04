'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
const { ensureAdaptivePersister } = require('../src/services/adaptiveStateBootstrap');
const agrobacterium = require('../src/services/mcpBioTools/handlers/agrobacteriumTdnaHijack');
const { registryBindings } = require('../src/services/mcpBioTools/registryBindings');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateAdaptiveState(db);
    await db.run(
      'INSERT INTO adaptive_state (scope, key, payload_json) VALUES (?, ?, ?)',
      'mcp_bio::agrobacterium', 'agrobacteriumRegistry',
      JSON.stringify([['host-restored', { hostId: 'host-restored', isInfected: true, opineYieldProduced: 9, opinesHarvested: 0 }]])
    );
    const persister = await ensureAdaptivePersister(db);
    assert.ok(persister, 'boot binds the real persister');
    for (const binding of registryBindings()) {
      assert.equal(typeof binding.mod[binding.liveKey].flushPersistence, 'function', binding.scope);
    }
    assert.equal(agrobacterium.handleAgrobacteriumTdnaHijack({ host_id: 'host-restored' }).is_infected, true);
    const registry = agrobacterium.agrobacteriumRegistry;
    assert.equal(registry.get('host-restored').opineYieldProduced, 9);
    assert.equal(Array.from(registry.entries()).length, 1);
    registry.set('new-host', { hostId: 'new-host', isInfected: false });
    await registry.flushPersistence();
    const stored = await persister.restoreMap('mcp_bio::agrobacterium', 'agrobacteriumRegistry');
    assert.equal(stored.get('new-host').hostId, 'new-host');
    registry.delete('new-host');
    await registry.flushPersistence();
    assert.equal((await persister.restoreMap('mcp_bio::agrobacterium', 'agrobacteriumRegistry')).has('new-host'), false);
    console.log('adaptive state live persistence passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
