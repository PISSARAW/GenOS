const assert = require('assert');
process.env.GENOS_ADMIN_PASSWORD = 'TestPassword123!';
process.env.GENOS_ADMIN_TOKEN = 'TestAdminToken123!';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const vectorMemory = require('../src/services/vectorMemoryService');
const { sleepCycle } = require('../src/services/sleepCycle');
const { mctsSelect } = require('../src/services/primitiveHandlers/search');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');

async function testGabaergicInhibitionFilter() {
  const tmpDbPath = path.join(os.tmpdir(), `test-gaba-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    // Insert positive and inhibited decisions
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by) VALUES ('good-mem-1', 'Good Pattern', 'Always check bounds', 5.0, 'General', 'system')");
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by) VALUES ('bad-mem-1', 'Trauma Bug', 'Infinite recursion error', 1.0, 'General', 'system')");
    
    // Add GABA synapse inhibiting bad-mem-1
    await db.run("INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type) VALUES ('good-mem-1', 'bad-mem-1', -1.5, 'gaba')");

    const res = await vectorMemory.searchMemory('recursion', { limit: 5 }, db);
    const resultIds = (res.allScoredExperiences || []).map(r => r.id);
    assert.strictEqual(resultIds.includes('bad-mem-1'), false, 'Inhibited memory bad-mem-1 must be filtered out of active retrieval');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

async function testSleepCycleCoreProtection() {
  const tmpDbPath = path.join(os.tmpdir(), `test-sleep-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by) VALUES ('core-lesson', 'Security Invariant', 'Verify token', 2.0, 'core', 'system')");
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by) VALUES ('golden-rule', 'Architecture Rule', 'Clean layering', 2.0, 'golden_path', 'system')");
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by) VALUES ('transient-thought', 'Temporary guess', 'Random test', 0.12, 'temporary', 'system')");

    // Run sleep cycle with decay
    await sleepCycle(db, { weightDecayFactor: 0.5, orphanWeightThreshold: 0.1 });

    const coreRow = await db.get("SELECT synaptic_weight FROM genome_decisions WHERE id = 'core-lesson'");
    const goldenRow = await db.get("SELECT synaptic_weight FROM genome_decisions WHERE id = 'golden-rule'");
    const transientRow = await db.get("SELECT * FROM genome_decisions WHERE id = 'transient-thought'");

    assert(coreRow && coreRow.synaptic_weight >= 1.0, 'Core category memories must preserve >= 1.0 synaptic weight');
    assert(goldenRow && goldenRow.synaptic_weight >= 1.0, 'Golden path memories must preserve >= 1.0 synaptic weight');
    assert.strictEqual(transientRow, undefined, 'Transient orphan memories below 0.1 must be pruned');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

async function testMctsSelectDeterministicNonVisitedSort() {
  const tmpDbPath = path.join(os.tmpdir(), `test-mcts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    // Insert 3 nodes with visits = 0 and distinct heuristic values
    await db.run("INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES ('node-low', 'Low Node', 'agent', 1.0, 0, '{}')");
    await db.run("INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES ('node-high', 'High Node', 'agent', 9.0, 0, '{}')");
    await db.run("INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES ('node-mid', 'Mid Node', 'agent', 5.0, 0, '{}')");

    const selectRes = await mctsSelect({ candidates: ['node-low', 'node-high', 'node-mid'] });
    assert.strictEqual(selectRes.success, true);
    assert.strictEqual(selectRes.selectedNode.id, 'node-high', 'Node with highest prior score must be selected first among unvisited nodes');
    assert.strictEqual(selectRes.allScored[0].id, 'node-high');
    assert.strictEqual(selectRes.allScored[1].id, 'node-mid');
    assert.strictEqual(selectRes.allScored[2].id, 'node-low');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

async function testAutonomousOrchestrationAliases() {
  const contract = {
    problem_profile: { complexity: 0.8 },
    strategy_portfolio: [
      { id: 'falsifiable_hypothesis_tree', primitives: ['diagnose', 'hypothesis_evidence'] },
      { id: 'mcts_prm', primitives: ['mcts_select', 'prm_evaluate', 'backpropagate'] }
    ]
  };

  const plan = buildAutonomyPlan(contract);
  const phaseKeys = plan.phases.map(p => p.key);
  // retrieve_and_diagnose requires genos_search_failures and genos_diagnose;
  // with our semantic alias mapping, 'diagnose' in portfolio satisfies both!
  assert(phaseKeys.includes('retrieve_and_diagnose'), 'retrieve_and_diagnose phase must be retained via semantic aliases');
  assert(phaseKeys.includes('evidence_and_evaluation'), 'evidence_and_evaluation phase must be retained');
}

async function runAll() {
  console.log('Running unthrottled capabilities test suite...');
  await testGabaergicInhibitionFilter();
  console.log('  ✓ testGabaergicInhibitionFilter passed');
  await testSleepCycleCoreProtection();
  console.log('  ✓ testSleepCycleCoreProtection passed');
  await testMctsSelectDeterministicNonVisitedSort();
  console.log('  ✓ testMctsSelectDeterministicNonVisitedSort passed');
  await testAutonomousOrchestrationAliases();
  console.log('  ✓ testAutonomousOrchestrationAliases passed');
  console.log('All unthrottling tests passed successfully!');
}

runAll().catch((err) => {
  console.error('Unthrottled tests failed:', err);
  process.exit(1);
});
