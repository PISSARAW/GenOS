'use strict';

const { getDatabase } = require('../src/db');
const { GraphProjector } = require('../src/storage/projection/graphProjector');
const { AnalyticsProjector } = require('../src/storage/projection/analyticsProjector');
const { SearchProjector } = require('../src/storage/projection/searchProjector');
const { StorageCapabilityRegistry } = require('../src/storage/capabilityRegistry');
const { StorageQueryPlanner } = require('../src/storage/query/storageQueryPlanner');

async function setupTestAgent(db) {
  await db.run(
    `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, dissonance_level, eureka_count, cognitive_budget, is_apoptotic)
     VALUES (?, ?, 'test_agent', 'idle', 'GenOS', 'worker', NULL, NULL, 'standard', 'TypeScript', 'Branch', NULL, NULL, NULL, 'Test agent', 0, 0, 100, 0)`,
    ['test-agent-001']
  );
  await db.run(
    `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, dissonance_level, eureka_count, cognitive_budget, is_apoptotic)
     VALUES (?, ?, 'parent_agent', 'idle', 'GenOS', 'worker', NULL, NULL, 'standard', 'TypeScript', 'Branch', NULL, NULL, NULL, 'Parent agent', 0, 0, 100, 0)`,
    ['parent-agent-001']
  );
  await db.run(
    `INSERT INTO agent_relations (id, source_agent_id, target_agent_id, relation_type)
     VALUES (?, ?, ?, 'test_relation')`,
    ['rel-001', 'parent-agent-001', 'test-agent-001']
  );
  await db.run(
    `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
     VALUES (?, NULL, ?, ?, 'test_lineage')`,
    ['lin-001', 'parent-agent-001', 'test-agent-001']
  );
}

async function testProjectionEvents(db) {
  const events = await db.all('SELECT * FROM projection_events ORDER BY sequence');
  console.log(`  Projection events: ${events.length}`);
  if (events.length === 0) throw new Error('No projection events generated');
  const types = new Set(events.map((e) => e.event_type));
  console.log('  Event types: ' + [...types].join(', '));
  return events;
}

async function testGraphProjector(db) {
  const projector = new GraphProjector(db);
  await projector.init();
  const processed = await projector.processBatch(100);
  console.log(`  Graph projector processed: ${processed}`);
  if (processed === 0) throw new Error('Graph projector processed 0 events');
  return projector;
}

async function testAnalyticsProjector(db) {
  const projector = new AnalyticsProjector(db);
  await projector.init();
  const processed = await projector.processBatch(100);
  console.log(`  Analytics projector processed: ${processed}`);
  return projector;
}

async function testSearchProjector(db) {
  const projector = new SearchProjector(db);
  await projector.init();
  const processed = await projector.processBatch(100);
  console.log(`  Search projector processed: ${processed}`);
  return projector;
}

async function testCapabilityRegistry() {
  const registry = new StorageCapabilityRegistry();
  await registry.registerAll();
  const all = registry.getAll();
  const degraded = Object.entries(all).filter(([, cap]) => cap.degraded).map(([name]) => name);
  if (degraded.length > 0) {
    console.log(`  Degraded capabilities: ${degraded.join(', ')}`);
  }
  return registry;
}

async function testQueryPlanner() {
  const planner = new StorageQueryPlanner();
  await planner.init();
  const result = await planner.query({
    intent: 'exact',
    sql: 'SELECT id, name FROM agents WHERE id = ?',
    args: ['test-agent-001'],
  });
  console.log(`  Query planner result: ${JSON.stringify(result.results?.[0] || result.results)}`);
  if (!result.results || result.results.length === 0) throw new Error('Query planner returned no results');
  return planner;
}

async function testGraphQuery(planner) {
  const result = await planner.query({
    intent: 'graph',
    startId: 'parent-agent-001',
    maxDepth: 2,
  });
  console.log(`  Graph query engine: ${result.engine}`);
  if (result.engine !== 'ladybug' && result.engine !== 'sqlite-cte') {
    throw new Error(`Unexpected graph engine: ${result.engine}`);
  }
  return result;
}

async function testVectorPromotion(registry) {
  const result = await registry.evaluateVectorPromotion({ vectorCount: 500, improvement: 0.1 });
  console.log(`  Vector promotion (insufficient): ${result.reason}`);
  if (result.promoted) throw new Error('Should not promote with insufficient benchmark');
  const result2 = await registry.evaluateVectorPromotion({ vectorCount: 2000000, improvement: 0.3 });
  console.log(`  Vector promotion (sufficient): ${result2.reason}`);
  if (!result2.promoted) throw new Error('Should promote with sufficient benchmark');
}

async function cleanupTestData(db) {
  await db.run('DELETE FROM agent_relations WHERE id = ?', ['rel-001']);
  await db.run('DELETE FROM lineage_edges WHERE id = ?', ['lin-001']);
  await db.run('DELETE FROM agents WHERE id IN (?, ?)', ['test-agent-001', 'parent-agent-001']);
  await db.run('DELETE FROM projection_events');
  await db.run('DELETE FROM projection_consumers');
  await db.run('DELETE FROM projection_failures');
}

async function main() {
  console.log('=== GenOS Polyglot E2E Test ===');
  const db = await getDatabase();

  console.log('\n1. Setting up test data...');
  await setupTestAgent(db);

  console.log('\n2. Verifying projection events...');
  await testProjectionEvents(db);

  console.log('\n3. Testing GraphProjector...');
  const graphProjector = await testGraphProjector(db);

  console.log('\n4. Testing AnalyticsProjector...');
  const analyticsProjector = await testAnalyticsProjector(db);

  console.log('\n5. Testing SearchProjector...');
  const searchProjector = await testSearchProjector(db);

  console.log('\n6. Testing CapabilityRegistry...');
  const registry = await testCapabilityRegistry();

  console.log('\n7. Testing StorageQueryPlanner...');
  const planner = await testQueryPlanner();
  await testGraphQuery(planner);
  await testVectorPromotion(registry);

  console.log('\n8. Testing GraphProjector rebuild...');
  await graphProjector.rebuild();
  const processedAfterRebuild = await graphProjector.processBatch(100);
  console.log(`  After rebuild: ${processedAfterRebuild} new events`);

  console.log('\n9. Cleaning up...');
  await cleanupTestData(db);

  await graphProjector._graph?.close?.();
  await analyticsProjector._store?.close?.();
  await db.close();

  console.log('\n=== E2E Test PASSED ===');
}

main().catch((error) => {
  console.error('\n=== E2E Test FAILED ===');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
});
