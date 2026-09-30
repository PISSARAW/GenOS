'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const runtime = require('../../src/services/search/naturalSearchRuntime');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');

async function openTestDb(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec('CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT \'active\')');
  await db.run('INSERT OR IGNORE INTO agents (id, name) VALUES (?, ?)', ['restore-agent', 'restore test']);
  await new SearchPersistence(db).initTables();
  return db;
}

async function seedOperationalStates(state) {
  const modules = state.actuator.modules;
  const genome = { id: 'genome-persisted', hypothesisFamily: 'causal', strategy: 'falsification', operators: ['replay'], exploration: { radius: 0.3 } };
  modules.searchGenome.genome = genome;
  state.actuator.searchGenome.genome = genome;
  modules.affinityVariants = [{ id: 'variant-persisted', hypothesisFamily: 'causal' }];
  const patch = modules.ensurePatch('restore-agent');
  modules.recordForageStep(patch.id, 0.8, 1);
  await modules.causalReplay.replay('restore-agent', { id: 'hyp-replay', statement: 'unstable branch' }, [
    { action: 'inspect' }, { action: 'checkpoint', isCheckpoint: true }, { action: 'intervene' },
  ], state.ledger);
  modules.negativeMemory.recordFailure('restore-agent', { id: 'hyp-failed', statement: 'avoid dead end' },
    { ref: 'test-failure', strength: 0.8, reliability: 1 }, { signature: 'restore', conditions: [], scope: 'agent' });
  modules.evolutionEngine.population = [genome];
  modules.evolutionEngine.generation = 7;
  modules.evolutionEngine.generationHistory = [{ generation: 7, bestFitness: 2 }];
  const plasmid = modules.cultureService.compilePlasmid(genome, { environment: { task: 'restore' }, generations: 7, successRate: 1, reproducible: true });
  modules.cultureService.transmit(plasmid.id, 'restore-agent');
}

function assertOperationalStates(state) {
  const modules = state.actuator.modules;
  assert.equal(state.actuator.searchGenome.genome.id, 'genome-persisted');
  assert.equal(modules.affinityVariants[0].id, 'variant-persisted');
  assert.equal(modules.patchService.evaluatePatch('restore-agent').totalInfoGain, 0.8);
  assert.equal(modules.causalReplay.getHistory('restore-agent')[0].restorePoint, 'checkpoint_0');
  assert.equal(modules.causalReplay.getHistory('restore-agent')[0].checkpointCount, 2);
  assert.equal(modules.negativeMemory.isPathBlocked('restore-agent', 'avoid dead end'), true);
  assert.equal(modules.evolutionEngine.generation, 7);
  assert.equal(modules.evolutionEngine.population[0].id, 'genome-persisted');
  assert.equal(modules.cultureService.transmissions[0].targetAgentId, 'restore-agent');
}

async function main() {
  const filename = path.join(os.tmpdir(), `natural-search-state-${crypto.randomUUID()}.db`);
  let db = await openTestDb(filename);
  await runtime.initializeNaturalSearchRuntime(db);
  const state = await runtime.getOrCreateSearchState('restore-agent', db);
  await seedOperationalStates(state);
  await runtime.flushSearchState('restore-agent');
  await runtime.clearSearchState('restore-agent');
  await db.close();
  db = await openTestDb(filename);
  await runtime.initializeNaturalSearchRuntime(db);
  const restored = await runtime.getOrCreateSearchState('restore-agent', db);
  assertOperationalStates(restored);
  await runtime.clearSearchState('restore-agent');
  await db.close();
  fs.rmSync(filename, { force: true });
}

main().then(() => console.log('Natural Search seven-module SQLite restore passed.')).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
