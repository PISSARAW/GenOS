/**
 * Evolution breed transaction (evolutionBreed.js).
 * Proves the child INSERT + lineage write are atomic: when lineage
 * persistence throws, no orphan child row remains and no manual
 * DELETE compensation runs (rollback covers everything).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testDbPath = path.resolve(__dirname, `test_genos_breed_tx_${process.pid}.db`);
process.env.GENOS_DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { getDatabase, closeDatabase } = require('../src/db');
const genosCli = require('../src/services/genosCli');
const agentEvolutionService = require('../src/services/agentEvolutionService');
const evolution = require('../src/services/primitiveHandlers/evolution');

const realRunCrossover = genosCli.runCrossover;
const realRecordLineage = agentEvolutionService.recordWorkerLineage;

async function seedParents(db, workspaceId, suffix) {
  const parentA = `breed_parent_a_${suffix}`;
  const parentB = `breed_parent_b_${suffix}`;
  for (const [id, name] of [[parentA, 'Parent A'], [parentB, 'Parent B']]) {
    await db.run(
      "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, current_task) VALUES (?, ?, 'Meaning', 'worker', 'idle', 'GenOS', 'worker', ?, 'Task')",
      id, name, workspaceId
    );
  }
  return { parentA, parentB };
}

async function testLineageThrowRollsBack(db, workspaceId, suffix) {
  const { parentA, parentB } = await seedParents(db, workspaceId, suffix);
  agentEvolutionService.recordWorkerLineage = async () => {
    throw new Error('lineage boom');
  };
  const result = await evolution.breed({ parentA, parentB });
  assert.strictEqual(result.success, false);
  assert.ok(String(result.error).includes('lineage boom'));
  const orphan = await db.get(
    "SELECT id FROM agents WHERE parent_agent_id = ? AND lineage_relation = 'crossover'",
    parentA
  );
  assert.strictEqual(orphan, undefined, 'no orphan child row may survive a lineage failure');
  console.log('  PASS: lineage throw rolls back the child INSERT with no orphan.');
}

async function testLineageSuccessCommits(db, workspaceId, suffix) {
  const { parentA, parentB } = await seedParents(db, workspaceId, suffix);
  agentEvolutionService.recordWorkerLineage = realRecordLineage;
  const result = await evolution.breed({ parentA, parentB });
  assert.strictEqual(result.success, true, `breed should succeed: ${result.error}`);
  assert.ok(result.childId);
  const child = await db.get('SELECT id, lineage_relation FROM agents WHERE id = ?', result.childId);
  assert.ok(child, 'child row is committed');
  assert.strictEqual(child.lineage_relation, 'crossover');
  const lineage = await db.get('SELECT id FROM lineage_nodes WHERE id = ?', result.childId);
  assert.ok(lineage, 'child lineage row is committed');
  console.log('  PASS: successful breed commits child + lineage atomically.');
}

async function run() {
  console.log('=== Evolution breed transaction ===');
  genosCli.runCrossover = async () => ({ ok: true, json: { success: true, stub: true } });
  const db = await getDatabase();
  let deleteCalls = 0;
  const originalRun = db.run.bind(db);
  db.run = async (...args) => {
    if (typeof args[0] === 'string' && args[0].toUpperCase().includes('DELETE FROM AGENTS')) deleteCalls += 1;
    return originalRun(...args);
  };
  const workspaceId = `ws_breed_tx_${Date.now()}`;
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', workspaceId, 'Breed TX WS', './test');
  await testLineageThrowRollsBack(db, workspaceId, `f_${Date.now()}`);
  await testLineageSuccessCommits(db, workspaceId, `s_${Date.now()}`);
  assert.strictEqual(deleteCalls, 0, 'no manual DELETE compensation may run');
  console.log('  PASS: no manual DELETE compensation executed.');
  genosCli.runCrossover = realRunCrossover;
  agentEvolutionService.recordWorkerLineage = realRecordLineage;
  await closeDatabase();
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (_) {}
  }
  console.log('BREED TRANSACTION TESTS PASSED.');
}

run().catch((err) => {
  console.error('Breed transaction test failed:', err);
  process.exit(1);
});
