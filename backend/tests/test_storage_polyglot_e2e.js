'use strict';

/**
 * Polyglot persistence E2E (SQLite canonique, projections reconstruisibles).
 *
 * Verifie sur une base SQLite vierge :
 *   1. Le cablage : planner, registre, projectors se chargent (pas de MODULE_NOT_FOUND).
 *   2. La politique vectorielle : sqlite-vec primaire, LanceDB non promu par defaut.
 *   3. Le graphe : factory async, suppressions supportees, labels normalises sur allowlist.
 *   4. L'outbox : trigger INSERT agent -> evenement AGENT_CREATED, payload = cle seule.
 *   5. Le projecteur : evenement inconnu -> echec enregistre, jamais marque projete.
 *   6. La recherche : index FTS crees, agent indexe.
 *   7. Les chemins : bundle unique .genos/data via StoragePaths.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

process.env.NODE_ENV = 'test';

const DB_PATH = path.join(os.tmpdir(), `genos-storage-polyglot-${Date.now()}-${process.pid}.db`);

async function openFreshDb() {
  const dbModule = require('../src/db');
  const db = await dbModule.getDatabase(DB_PATH);
  return { dbModule, db };
}

async function testWiring() {
  const { StorageQueryPlanner } = require('../src/storage/query/storageQueryPlanner');
  const planner = new StorageQueryPlanner();
  await planner.init();
  const all = planner.registry.getAll();
  for (const name of ['operational', 'graph', 'analytics', 'vector', 'search']) {
    assert.ok(all[name], `capabilite enregistree : ${name}`);
  }
  const { DuckDBStore, DuckDBAnalyticsStore } = require('../src/storage/analytics/duckdbStore');
  assert.equal(DuckDBStore, DuckDBAnalyticsStore, 'alias DuckDB unifie');
  await planner.registry.evaluateVectorPromotion(null);
  const vectorCap = planner.registry.get('vector');
  assert.equal(vectorCap.promotionPolicy.promoted, false, 'LanceDB non promu sans benchmark');
  assert.equal(vectorCap.provider, 'sqlite-vec', 'sqlite-vec primaire');
  return planner;
}

async function testSemanticDefault(planner) {
  const res = await planner.query({
    intent: 'semantic',
    sql: 'SELECT 1 AS ok',
    args: [],
    table: 'nonexistent',
    vector: [0.1, 0.2],
  });
  assert.equal(res.engine, 'sqlite-vec', 'moteur semantique par defaut = sqlite-vec');
}

async function testGraphRepository(db) {
  const { createGraphRepository } = require('../src/storage/graph/graphRepository');
  const repo = await createGraphRepository(db);
  for (const method of ['upsertNode', 'upsertEdge', 'deleteNode', 'deleteEdge', 'deleteEdgesFrom', 'deleteEdgesTo', 'neighbors', 'traverse']) {
    assert.equal(typeof repo[method], 'function', `GraphRepository.${method} existe`);
  }
  const { normalizeEdgeType } = require('../src/storage/graph/ladybugStore');
  assert.equal(normalizeEdgeType('knows'), 'KNOWS');
  assert.equal(normalizeEdgeType('some_custom_relation_xyz'), 'RELATION');
  return repo;
}

async function testOutboxTrigger(db) {
  const { ensureOutboxTables } = require('../src/storage/projection/projectionOutbox');
  await ensureOutboxTables(db);
  const triggers = require('../src/db/migrations/migrateOutboxTriggers');
  await triggers.run(db);
  await db.run(
    "INSERT INTO agents (id, name, role, status) VALUES ('agent-poly-1', 'Poly', 'worker', 'idle')"
  );
  const evt = await db.get(
    "SELECT * FROM projection_events WHERE aggregate_id = 'agent-poly-1' ORDER BY sequence DESC LIMIT 1"
  );
  assert.ok(evt, 'trigger outbox a emis un evenement');
  assert.equal(evt.event_type, 'AGENT_CREATED');
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.table, 'agents');
  assert.equal(payload.operation, 'INSERT');
  assert.equal(payload.id, 'agent-poly-1');
  assert.ok(!payload.name, 'payload = cle seule, relecture canonique requise');
  return evt;
}

async function testGraphProjectorHonesty(db, evt) {
  const { GraphProjector } = require('../src/storage/projection/graphProjector');
  const projector = new GraphProjector(db);
  await projector.init();
  const n = await projector.processBatch(50);
  assert.ok(n >= 1, 'projecteur graphe consomme le batch');
  const row = await db.get('SELECT graph_projected_at FROM projection_events WHERE event_id = ?', [evt.event_id]);
  assert.ok(row.graph_projected_at, 'AGENT_CREATED marque projete apres ecriture');

  const { appendProjectionEvent } = require('../src/storage/projection/projectionOutbox');
  const bogusId = await appendProjectionEvent({
    aggregate_type: 'bogus',
    aggregate_id: 'x',
    event_type: 'BOGUS_UNKNOWN_EVENT',
    payload_json: { table: 'agents', operation: 'INSERT', id: 'x' },
  });
  await projector.processBatch(50);
  const bogus = await db.get('SELECT * FROM projection_events WHERE event_id = ?', [bogusId]);
  assert.equal(bogus.graph_projected_at, null, 'evenement inconnu jamais marque projete');
  const failures = await db.all('SELECT * FROM projection_failures WHERE event_id = ?', [bogusId]);
  assert.ok(failures.length >= 1, 'evenement inconnu enregistre en echec (UNSUPPORTED_EVENT)');

  const { appendProjectionEvent: append2 } = require('../src/storage/projection/projectionOutbox');
  const voteId = await append2({
    aggregate_type: 'vote',
    aggregate_id: 'vote:d1:a1',
    event_type: 'VOTE_CAST',
    payload_json: { table: 'collective_decision_votes', operation: 'INSERT', id: 'vote:d1:a1' },
  });
  await projector.processBatch(50);
  const vote = await db.get('SELECT * FROM projection_events WHERE event_id = ?', [voteId]);
  assert.ok(vote.graph_projected_at, 'VOTE_CAST a effet graphe nul explicite, projete honnetement');
}

async function testSearchProjector(db) {
  const { SearchProjector } = require('../src/storage/projection/searchProjector');
  const projector = new SearchProjector(db);
  await projector.init();
  await projector._upsertAgentSearch('agent-poly-1');
  const hit = await db.get('SELECT id FROM agents_fts WHERE agents_fts MATCH ?', ['Poly']);
  assert.ok(hit, 'agent indexe en recherche FTS');
}

async function testStoragePaths() {
  const { FILES, PATHS } = require('../src/storage/storagePaths');
  assert.ok(PATHS.graph.endsWith('graph'), 'bundle graph');
  assert.ok(FILES.ladybug.endsWith('world.lbdb'), 'ladybug dans le bundle');
  assert.ok(FILES.duckdb.endsWith('analytics.duckdb'), 'duckdb dans le bundle');
  assert.ok(FILES.lancedb.endsWith('genos.lance'), 'lance dans le bundle');
  assert.ok(FILES.sqlite.endsWith('genos.db'), 'sqlite dans le bundle');
}

async function testUpdateDeleteMapping() {
  const triggers = require('../src/db/migrations/migrateOutboxTriggers');
  assert.ok(triggers, 'module triggers chargeable');
  assert.equal(triggers.getEventType('relation', 'INSERT'), 'RELATION_ADDED');
  assert.equal(triggers.getEventType('relation', 'UPDATE'), 'RELATION_UPDATED');
  assert.equal(triggers.getEventType('relation', 'DELETE'), 'RELATION_REMOVED');
  assert.equal(triggers.getEventType('memory', 'UPDATE'), 'SYNAPSE_UPDATED');
  assert.equal(triggers.getEventType('vote', 'INSERT'), 'VOTE_CAST');
  const del = triggers.buildTrigger(
    { table: 'memory_synapses', idExpr: "'memory:' || NEW.source_id || ':' || NEW.target_id", aggregate: 'memory', scope: 'direct' },
    'DELETE'
  );
  assert.ok(del.includes('OLD.source_id'), 'cle composite DELETE utilise OLD');
  assert.ok(!del.includes('NEW.source_id'), 'cle composite DELETE sans NEW');
  assert.ok(del.includes('SYNAPSE_REMOVED'), 'DELETE synapse mappee');
}

async function main() {
  const { dbModule, db } = await openFreshDb();
  try {
    const planner = await testWiring();
    await testSemanticDefault(planner);
    await testGraphRepository(db);
    const evt = await testOutboxTrigger(db);
    await testGraphProjectorHonesty(db, evt);
    await testSearchProjector(db);
    await testStoragePaths();
    await testUpdateDeleteMapping();
    console.log('STORAGE_POLYGLOT_E2E_OK');
  } finally {
    await dbModule.closeDatabase();
    try { require('node:fs').unlinkSync(DB_PATH); } catch (_) { /* ignore */ }
    try { require('node:fs').unlinkSync(`${DB_PATH}-wal`); } catch (_) { /* ignore */ }
    try { require('node:fs').unlinkSync(`${DB_PATH}-shm`); } catch (_) { /* ignore */ }
  }
}

main().catch((err) => {
  console.error('STORAGE_POLYGLOT_E2E_FAIL', err);
  process.exit(1);
});
