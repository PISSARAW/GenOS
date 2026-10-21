'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testDbPath = path.join(os.tmpdir(), `genos-memory-corrections-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.GENOS_DB_PATH = testDbPath;
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_EMBEDDING_PROVIDER = 'none';
process.env.GENOS_EMBEDDING_URL = 'http://127.0.0.1:9';
process.env.GENOS_EMBEDDING_TIMEOUT_MS = '20';

const { getDatabase, closeDatabase } = require('../src/db');
const { executeStrategyTool } = require('../src/services/mcpStrategyTools');
const vectorMemory = require('../src/services/vectorMemoryService');
const calibration = require('../src/services/memory/memoryCalibrationService');
const { stdpUpdate } = require('../src/services/primitiveHandlers/memoryStdp');

async function testRetrievalContract() {
  const db = await getDatabase();
  const result = await vectorMemory.searchMemory('la migration a plante', { limit: 1 }, db);
  assert.strictEqual(result.retrieval.mode, 'lexical_fallback');
  assert.strictEqual(result.retrieval.semantic, false);
  await assert.rejects(
    () => vectorMemory.searchMemory('echec de migration', { requireSemantic: true }, db),
    (error) => error.code === 'SEMANTIC_EMBEDDING_UNAVAILABLE'
  );
  console.log('PASS rappel lexical explicite et mode semantique fail-closed');
}

function tenant(overrides = {}) {
  return { organizationId: 'org-memory', projectId: 'project-a', ...overrides };
}

async function execute(tool, args) {
  const result = await executeStrategyTool(tool, args);
  assert.strictEqual(result.success, true, JSON.stringify(result));
  return result.output;
}

async function testDurableLineageMemory() {
  const base = tenant({ action: 'memorize', lineageId: 'lineage-1', memoryId: 'memory-1',
    ancestorId: 'ancestor-1', memory: { lesson: 'rollback before retry' }, salience: 0.9 });
  const stored = await execute('genos_ancestral_memory', base);
  assert.strictEqual(stored.persistence, 'sqlite');
  await closeDatabase();

  const recalled = await execute('genos_ancestral_memory', tenant({
    action: 'recall', lineageId: 'lineage-1'
  }));
  assert.strictEqual(recalled.count, 1);
  assert.strictEqual(recalled.memories[0].memory.lesson, 'rollback before retry');
  const isolated = await execute('genos_ancestral_memory', tenant({
    action: 'recall', lineageId: 'lineage-1', projectId: 'project-b'
  }));
  assert.strictEqual(isolated.count, 0);

  await execute('genos_risk_inheritance', tenant({ action: 'propagate', lineageId: 'lineage-1',
    sourceId: 'ancestor-1', targetId: 'descendant-1', risk: 0.8, depth: 1 }));
  await closeDatabase();
  const inherited = await execute('genos_risk_inheritance', tenant({
    action: 'getRisk', lineageId: 'lineage-1', targetId: 'descendant-1'
  }));
  assert.strictEqual(inherited.persistence, 'sqlite');
  assert.strictEqual(inherited.calibration.status, 'provisional');
  assert.ok(Math.abs(inherited.risk - 0.64) < 1e-9);
  console.log('PASS memoire de lignee durable, scopee et calibree explicitement');
}

function qualifiedSamples() {
  return [
    ...Array.from({ length: 12 }, (_, index) => ({ score: 0.75 + index / 100, helpful: true })),
    ...Array.from({ length: 12 }, (_, index) => ({ score: 0.1 + index / 100, helpful: false }))
  ];
}

function testCalibrationGate() {
  const tooSmall = calibration.calibrateThreshold({ samples: [
    { score: 0.9, helpful: true }, { score: 0.1, helpful: false }
  ] });
  assert.strictEqual(tooSmall.status, 'provisional');
  const qualified = calibration.calibrateThreshold({ samples: qualifiedSamples(), baseline: 0.7 });
  assert.strictEqual(qualified.status, 'qualified');
  assert.strictEqual(qualified.best.balancedAccuracy, 1);
  assert.strictEqual(calibration.runtimeProfile().evidence.causalDecisionChangeWorkerTypes, 0);
  console.log('PASS seuils versionnes et qualification conditionnee par des observations');
}

async function testStdpBoundary() {
  const db = await getDatabase();
  const embedding = Buffer.from(new Float32Array(768).buffer);
  await db.run(`INSERT INTO genome_decisions
    (id, title, content, created_by, category, embedding_blob, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'stdp-source', 'Source', 'A', 'agent-memory',
  'Experience', embedding, 'org-memory', 'project-a');
  await db.run(`INSERT INTO genome_decisions
    (id, title, content, created_by, category, embedding_blob, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'stdp-target', 'Target', 'B', 'agent-memory',
  'Experience', embedding, 'org-memory', 'project-a');
  const result = await stdpUpdate({ db, sourceId: 'stdp-source', targetId: 'stdp-target',
    preSpikeAt: 1000, postSpikeAt: 1020, organizationId: 'org-memory', projectId: 'project-a' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.learningDomain, 'symbolic_memory_graph');
  assert.strictEqual(result.modelWeightsUpdated, false);
  console.log('PASS STDP borne au graphe symbolique de memoire');
}

function removeTestDatabase() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (_) {}
  }
}

async function run() {
  try {
    await testRetrievalContract();
    await testDurableLineageMemory();
    testCalibrationGate();
    await testStdpBoundary();
  } finally {
    await closeDatabase();
    removeTestDatabase();
  }
  console.log('PASS corrections des critiques memoire');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
