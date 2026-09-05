const assert = require('assert');
const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
const { getDatabase, closeDatabase } = require('../src/db');
const { getStrategy, listStrategies } = require('../src/strategies/strategyRegistry');

async function testPlasmidDivergence() {
  console.log('--- Testing Plasmid Divergent Optimization Strategy & Primitives ---');

  // 1. Registry verification
  const totalStrategies = listStrategies().length;
  assert.equal(totalStrategies, 78, `Registry must contain exactly 78 strategies, got ${totalStrategies}`);

  const strategy = getStrategy('plasmid_divergent_optimization');
  assert(strategy, 'plasmid_divergent_optimization strategy must be registered');
  assert.equal(strategy.name, 'Optimisation divergente sur plasmide');
  assert.equal(strategy.maturity, 'implemented');
  assert.deepEqual(strategy.primitives, ['plasmid_divergent_fork', 'pareto_select', 'assimilate_plasmid']);
  console.log('  ✅ PASS: Strategy registry and metadata validated (78 total strategies).');

  // 2. Database preparation
  const db = await getDatabase();
  const ws = await db.get('SELECT id FROM workspaces LIMIT 1');
  const wsId = ws ? ws.id : null;
  const parentId = `test_parent_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, current_task) VALUES (?, 'Test Orchestrator', 'orchestrator', 'running', 'orchestrator', ?, 'standard', 'Compile deterministic build trace')",
    parentId, wsId
  );

  // 3. Test Baseline Retained
  console.log('  Testing Case A: Baseline retained (conservative exploitation wins)...');
  const resBaseline = await strategyExecutionAdapter.executePrimitive('plasmid_divergent_fork', {
    agentId: parentId,
    plasmidId: 'plasmid_compile_v1',
    plasmidName: 'deterministic_build_plasmid',
    baselineScore: 0.9,
    mutantScore: 0.4
  });

  assert.equal(resBaseline.success, true);
  assert.equal(resBaseline.branch, 'baseline_retained');
  assert.equal(resBaseline.winner, 'baseline');
  assert.equal(resBaseline.winningAgentId, resBaseline.baselineId);

  const baselineRow = await db.get('SELECT id, role, status, lineage_relation FROM agents WHERE id = ?', resBaseline.baselineId);
  const mutantRowA = await db.get('SELECT id, role, status, lineage_relation FROM agents WHERE id = ?', resBaseline.mutantId);

  assert.equal(baselineRow.role, 'baseline_executor');
  assert.equal(baselineRow.lineage_relation, 'plasmid_exploitation');
  assert.equal(baselineRow.status, 'completed');

  assert.equal(mutantRowA.role, 'plasmid_optimizer');
  assert.equal(mutantRowA.lineage_relation, 'plasmid_mutation');
  assert(mutantRowA.status === 'apoptosis' || mutantRowA.status === 'pruned');
  console.log('  ✅ PASS: Baseline branch retained and mutant branch pruned on lower fitness.');

  // 4. Test Mutant Promoted
  console.log('  Testing Case B: Mutant promoted (exploration discovers superior optimization)...');
  const resMutant = await strategyExecutionAdapter.executePrimitive('plasmid_divergent_fork', {
    agentId: parentId,
    plasmidId: 'plasmid_compile_v1',
    plasmidName: 'deterministic_build_plasmid',
    optimizationGoal: 'minimize_binary_footprint',
    candidatePlasmidCode: 'const optimizedCompiler = () => ({ stripped: true, size: 4096 });',
    baselineScore: 0.5,
    mutantScore: 0.98
  });

  assert.equal(resMutant.success, true);
  assert.equal(resMutant.branch, 'mutant_promoted');
  assert.equal(resMutant.winner, 'mutant');
  assert.equal(resMutant.winningAgentId, resMutant.mutantId);
  assert(resMutant.newPlasmidId, 'New plasmid ID must be generated when mutant is promoted');

  const winnerMutantRow = await db.get('SELECT id, status FROM agents WHERE id = ?', resMutant.mutantId);
  const prunedBaselineRow = await db.get('SELECT id, status FROM agents WHERE id = ?', resMutant.baselineId);
  assert.equal(winnerMutantRow.status, 'completed');
  assert(prunedBaselineRow.status === 'apoptosis' || prunedBaselineRow.status === 'pruned');

  const plasmidRow = await db.get('SELECT id, title, content, category FROM genome_decisions WHERE id = ?', resMutant.newPlasmidId);
  assert(plasmidRow, 'Synthesized plasmid must exist in genome_decisions');
  assert.equal(plasmidRow.category, 'Plasmid');
  assert(plasmidRow.content.includes('optimizedCompiler'));
  console.log('  ✅ PASS: Mutant branch promoted, baseline pruned, and new plasmid synthesized in genome_decisions.');

  // 5. Test Alias Primitive Dispatch
  console.log('  Testing Case C: Alias primitive execution (assimilate_plasmid)...');
  const resAlias = await strategyExecutionAdapter.executePrimitive('assimilate_plasmid', {
    agentId: parentId,
    plasmidId: resMutant.newPlasmidId,
    baselineScore: 0.8,
    mutantScore: 0.2
  });
  assert.equal(resAlias.success, true);
  console.log('  ✅ PASS: assimilate_plasmid primitive dispatched cleanly.');

  // Cleanup test agents
  await db.run('DELETE FROM agents WHERE id IN (?, ?, ?, ?, ?)', parentId, resBaseline.baselineId, resBaseline.mutantId, resMutant.baselineId, resMutant.mutantId);
  await db.run('DELETE FROM agents WHERE parent_agent_id = ?', parentId);
  await db.run('DELETE FROM genome_decisions WHERE id = ?', resMutant.newPlasmidId);

  console.log('--- All Plasmid Divergence tests passed successfully! ---');
}

testPlasmidDivergence()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
