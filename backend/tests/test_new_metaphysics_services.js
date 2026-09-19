'use strict';

const assert = require('assert');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const metaphysicsService = require('../src/services/ontology/metaphysicsService');
const speculativeRealismService = require('../src/services/ontology/speculativeRealismService');
const wholeVoidInfiniteService = require('../src/services/ontology/wholeVoidInfiniteService');
const personOtherService = require('../src/services/ontology/personOtherService');
const continuityService = require('../src/services/ontology/continuityService');
const possibleWorldService = require('../src/services/ontology/possibleWorldService');

let passed = 0, failed = 0;
let testChain = Promise.resolve();
async function test(name, fn) {
  const run = testChain.then(async () => {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
  });
  testChain = run;
  return run;
}

async function main() {
  const dbPath = path.join(__dirname, `new-philosophy-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'philosophy-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'philosophy-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT, problem TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_beings (id TEXT PRIMARY KEY, substance_type TEXT NOT NULL, essence_json TEXT NOT NULL DEFAULT '{}', identity_criteria_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, ceased_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_attributes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, value_type TEXT NOT NULL, modality TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'ontological', previous_value_json, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP, valid_from DATETIME DEFAULT CURRENT_TIMESTAMP, valid_until DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, mode TEXT NOT NULL, mode_constraint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'inactive', activation_condition_json, activated_at DATETIME, deactivated_at DATETIME, failure_reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_hypostatizations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_being_id TEXT NOT NULL, attribute_key TEXT NOT NULL, target_being_id TEXT NOT NULL, essence_extracted_json TEXT NOT NULL, hypostatization_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, reabsorbed_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_mereology (id INTEGER PRIMARY KEY AUTOINCREMENT, whole_id TEXT NOT NULL, part_id TEXT NOT NULL, relation_type TEXT NOT NULL, is_essential_part INTEGER DEFAULT 0, proportion REAL, attached_at DATETIME DEFAULT CURRENT_TIMESTAMP, detached_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_identity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, event_type TEXT NOT NULL, description TEXT, previous_essence_hash TEXT, new_essence_hash TEXT, continuity_preserved INTEGER DEFAULT 1, identity_score REAL DEFAULT 1.0, metadata_json TEXT DEFAULT '{}', occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_attribute_history (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, old_value_json, new_value_json NOT NULL, modality TEXT NOT NULL, changed_by TEXT, change_reason TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_relations (id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, source_id TEXT NOT NULL, relation_type TEXT NOT NULL, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', confidence REAL, provenance_json TEXT, created_by TEXT, organization_id TEXT, project_id TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(source_kind, source_id, relation_type, target_kind, target_id));
      CREATE TABLE IF NOT EXISTS ontology_continuity_observations (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, dimension TEXT NOT NULL, representation TEXT NOT NULL CHECK (representation IN ('continuous', 'discrete')), value REAL, discrete_state TEXT, thresholds_json TEXT NOT NULL DEFAULT '[]', evidence_json TEXT NOT NULL DEFAULT '{}', organization_id TEXT, project_id TEXT, observed_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(entity_id, dimension, observed_at));
      CREATE TABLE IF NOT EXISTS ontology_possible_worlds (id TEXT PRIMARY KEY, parent_world_id TEXT, assumptions_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'hypothetical' CHECK (status IN ('hypothetical', 'simulated', 'verified')), evidence_json TEXT NOT NULL DEFAULT '{}', organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_world_accessibility (source_world_id TEXT NOT NULL, target_world_id TEXT NOT NULL, conditions_json TEXT NOT NULL DEFAULT '[]', organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(source_world_id, target_world_id));
      CREATE TABLE IF NOT EXISTS ontology_world_receipts (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, execution_id TEXT, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'invalid')), organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, verified_at DATETIME);`);

    console.log('\n=== Metaphysics Service ===');
    test('materialMonism returns a coherent material monism verdict', () => {
      const r = metaphysicsService.materialMonism({ subjectId: 'agent-1' });
      assert.strictEqual(r.subjectId, 'agent-1');
      assert.strictEqual(r.position, 'material-monism');
      assert.ok(typeof r.conclusion === 'string');
    });
    test('panpsychism returns a panpsychist verdict', () => {
      const r = metaphysicsService.panpsychism({ subjectId: 'agent-2' });
      assert.strictEqual(r.subjectId, 'agent-2');
      assert.strictEqual(r.position, 'panpsychism');
    });
    test('eliminativism returns an eliminativist verdict', () => {
      const r = metaphysicsService.eliminativism({ subjectId: 'agent-3' });
      assert.strictEqual(r.subjectId, 'agent-3');
      assert.strictEqual(r.position, 'eliminativism');
    });
    test('secondOrderProperty records a second-order property', () => {
      const r = metaphysicsService.secondOrderProperty({ property: 'modalité', baseProperty: 'croyance', relation: 'depends' });
      assert.strictEqual(r.property, 'modalité');
      assert.strictEqual(r.baseProperty, 'croyance');
      assert.strictEqual(r.relation, 'depends');
      assert.strictEqual(r.status, 'descriptive');
    });
    test('comparePositions returns comparative analysis', () => {
      const r = metaphysicsService.comparePositions({ subjectId: 'agent-4' });
      assert.ok(Array.isArray(r.positions));
      assert.strictEqual(r.positions.length, 3);
      assert.ok(r.positions.some(p => p.position === 'material-monism'));
      assert.ok(r.positions.some(p => p.position === 'panpsychism'));
      assert.ok(r.positions.some(p => p.position === 'eliminativism'));
    });

    console.log('\n=== Speculative Realism Service ===');
    test('analyzeCorrelationLimit returns correlation analysis', () => {
      const r = speculativeRealismService.analyzeCorrelationLimit({ objectId: 'obj-1', observerId: 'obs-1' });
      assert.strictEqual(r.objectId, 'obj-1');
      assert.strictEqual(r.observerId, 'obs-1');
      assert.ok(typeof r.correlationRisk === 'number');
    });
    test('compareAccessModes returns access modes', () => {
      const r = speculativeRealismService.compareAccessModes({ objectId: 'obj-2' });
      assert.strictEqual(r.objectId, 'obj-2');
      assert.ok(Array.isArray(r.modes));
    });
    test('speculativeRealistClaim returns speculative realist position', () => {
      const r = speculativeRealismService.speculativeRealistClaim({ subjectId: 'agent-5', objectOfThought: 'absolute' });
      assert.strictEqual(r.subjectId, 'agent-5');
      assert.strictEqual(r.objectOfThought, 'absolute');
      assert.strictEqual(r.position, 'speculative-realism');
    });
    test('correlateVsAbsolute compares correlationism and absolute', () => {
      const r = speculativeRealismService.correlateVsAbsolute({ objectId: 'obj-3', observerId: 'obs-3' });
      assert.strictEqual(r.objectId, 'obj-3');
      assert.ok(typeof r.correlation === 'object');
      assert.ok(typeof r.speculation === 'object');
    });

    console.log('\n=== WholeVoidInfinite Service ===');
    test('describeWhole returns whole description', () => {
      const r = wholeVoidInfiniteService.describeWhole({ wholeId: 'system-x', parts: ['a', 'b'] });
      assert.strictEqual(r.wholeId, 'system-x');
      assert.strictEqual(r.whole.partsCount, 2);
      assert.strictEqual(r.whole.integrity, 'integrated');
    });
    await test('describeVoid returns void description with bounded intensity', () => {
      const r = wholeVoidInfiniteService.describeVoid({ voidId: 'void-y', intensity: 0.3 });
      assert.strictEqual(r.voidId, 'void-y');
      assert.strictEqual(r.void.intensity, 0.3);
      assert.strictEqual(r.void.bounded, true);
    });
    test('describeInfinite returns infinite description', () => {
      const r = wholeVoidInfiniteService.describeInfinite({ infiniteId: 'inf-z', mode: 'actual' });
      assert.strictEqual(r.infiniteId, 'inf-z');
      assert.strictEqual(r.infinite.mode, 'actual');
    });
    test('relateWholeVoidInfinite returns triadic relationship', () => {
      const r = wholeVoidInfiniteService.relateWholeVoidInfinite({ wholeId: 'w', voidId: 'v', infiniteId: 'i' });
      assert.strictEqual(r.wholeId, 'w');
      assert.strictEqual(r.voidId, 'v');
      assert.strictEqual(r.infiniteId, 'i');
      assert.ok(typeof r.relationship.whole === 'string');
      assert.ok(typeof r.relationship.void === 'string');
      assert.ok(typeof r.relationship.infinite === 'string');
    });

    console.log('\n=== Person Other Service ===');
    await test('defineOther creates an other relation', async () => {
      const r = await personOtherService.defineOther({ subjectId: 's-1', otherId: 'o-1' });
      assert.strictEqual(r.defined, true);
      assert.ok(r.relation);
    });
    await test('recordEncounter records encounter', async () => {
      const r = await personOtherService.recordEncounter({ subjectId: 's-1', otherId: 'o-2' });
      assert.ok(r);
      assert.strictEqual(r.relationType, 'encounter');
    });
    await test('listOtherRelations lists relations', async () => {
      const r = await personOtherService.listOtherRelations({ subjectId: 's-1' });
      assert.ok(Array.isArray(r));
      assert.ok(r.length >= 1);
    });
    await test('evaluateAlterityBoundary evaluates action permission', async () => {
      const r = await personOtherService.evaluateAlterityBoundary({ subjectId: 's-1', otherId: 'o-1', action: 'modify' });
      assert.strictEqual(r.subjectId, 's-1');
      assert.strictEqual(r.otherId, 'o-1');
      assert.strictEqual(r.action, 'modify');
      assert.ok(typeof r.allowed === 'boolean');
    });

    console.log('\n=== Continuity Service ===');
    await test('recordObservation records continuous dimension', async () => {
      const r = await continuityService.recordObservation({ entityId: 'e-1', dimension: 'voltage', value: 220 });
      assert.strictEqual(r.entityId, 'e-1');
      assert.strictEqual(r.dimension, 'voltage');
      assert.strictEqual(r.representation, 'continuous');
    });
    await test('classify returns classification for dimension', async () => {
      const r = await continuityService.classify({ entityId: 'e-1', dimension: 'voltage' });
      assert.strictEqual(r.found, true);
      assert.strictEqual(r.entityId, 'e-1');
      assert.strictEqual(r.dimension, 'voltage');
    });
    await test('detectTransition detects threshold crossing', async () => {
      await continuityService.recordObservation({ entityId: 'e-2-d', dimension: 't', value: 20, discreteState: 'normal' });
      await new Promise(r => setTimeout(r, 1100));
      await continuityService.recordObservation({ entityId: 'e-2-d', dimension: 't', value: 80, discreteState: 'critical' });
      const r = await continuityService.detectTransition({ entityId: 'e-2-d', dimension: 't' });
      assert.strictEqual(r.detected, true);
      assert.strictEqual(r.transition, 'threshold_crossing');
    });
    await test('detectPhaseTransition returns phase transition info', async () => {
      const r = await continuityService.detectPhaseTransition({ entityId: 'e-2-d', dimension: 't' });
      assert.strictEqual(r.phaseTransition, true);
      assert.ok(['ascending', 'descending'].includes(r.direction));
    });

    console.log('\n=== Possible World Service ===');
    await test('createWorld creates possible world', async () => {
      const r = await possibleWorldService.createWorld({ worldId: 'w-1', assumptions: [{ key: 'mode', value: 'dream' }] });
      assert.strictEqual(r.worldId, 'w-1');
      assert.strictEqual(r.status, 'hypothetical');
      assert.strictEqual(r.assumptions.length, 1);
    });
    await test('getWorld returns world if exists', async () => {
      const r = await possibleWorldService.getWorld({ worldId: 'w-1' });
      assert.strictEqual(r.found, true);
      assert.strictEqual(r.world.worldId, 'w-1');
    });
    await test('listWorlds returns all worlds', async () => {
      const r = await possibleWorldService.listWorlds({});
      assert.ok(Array.isArray(r));
      assert.ok(r.length >= 1);
    });
    await test('addAccessibility adds accessibility link', async () => {
      await possibleWorldService.createWorld({ worldId: 'w-a', assumptions: [] });
      await possibleWorldService.createWorld({ worldId: 'w-b', assumptions: [] });
      const r = await possibleWorldService.addAccessibility({ sourceWorldId: 'w-a', targetWorldId: 'w-b' });
      assert.strictEqual(r.sourceWorldId, 'w-a');
      assert.strictEqual(r.targetWorldId, 'w-b');
    });
    await test('compareWorlds returns differences', async () => {
      await possibleWorldService.createWorld({ worldId: 'w-c', assumptions: [{ key: 'p', value: 1 }] });
      await possibleWorldService.createWorld({ worldId: 'w-d', assumptions: [{ key: 'p', value: 2 }] });
      const r = await possibleWorldService.compareWorlds({ worldA: 'w-c', worldB: 'w-d' });
      assert.strictEqual(r.worldA, 'w-c');
      assert.strictEqual(r.worldB, 'w-d');
      assert.ok(r.differences.length >= 1);
    });
    await test('createReceipt creates world receipt', async () => {
      await possibleWorldService.createWorld({ worldId: 'w-r', assumptions: [] });
      const r = await possibleWorldService.createReceipt({ worldId: 'w-r', executionId: 'exec-1', outcome: 'success' });
      assert.strictEqual(r.worldId, 'w-r');
      assert.ok(r.receiptId);
      assert.strictEqual(r.status, 'unverified');
      assert.ok(r.payloadHash);
    });
    await test('verifyReceipt verifies or invalidates receipt', async () => {
      await possibleWorldService.createWorld({ worldId: 'w-v', assumptions: [] });
      const receipt = await possibleWorldService.createReceipt({ worldId: 'w-v', outcome: 'ok' });
      const v = await possibleWorldService.verifyReceipt({ receiptId: receipt.receiptId });
      assert.strictEqual(v.status, 'verified');
    });
    await test('evaluateCausalDependence combines causality and modal logic', async () => {
      const r = await possibleWorldService.evaluateCausalDependence({
        causeAgent: 'c',
        effectAgent: 'e',
        actualOutcome: 'completed',
        counterfactualOutcome: 'blocked',
        worldId: 'w-e',
      });
      assert.strictEqual(r.worldId, 'w-e');
      assert.strictEqual(r.verdict, 'necessary');
      assert.strictEqual(r.evidenceStatus, 'simulated');
    });

    await testChain;
    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { require('fs').unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => process.exit(1));
