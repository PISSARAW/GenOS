/**
 * GenOS Test Suite - Mutations and Hypermutations
 * Validates genetics service somatic hypermutation & crossover, strategy mutation primitives,
 * O(N) Levenshtein memory optimization, prompt hypermutation, and MCP tools.
 */

const assert = require('assert');
const { crossoverGenome, somaticHypermutate } = require('../src/services/geneticsService');
const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
const { calculateLevenshtein, somaticHypermutationPrompt } = require('../src/services/resilienceService');
const { executeStrategyTool } = require('../src/services/mcpStrategyTools');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log('  ✅ PASS: ' + name);
  } catch (err) {
    failedTests++;
    console.error('  ❌ FAIL: ' + name);
    console.error(err);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log('  ✅ PASS: ' + name);
  } catch (err) {
    failedTests++;
    console.error('  ❌ FAIL: ' + name);
    console.error(err);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('🧪 GenOS Mutations & Hypermutations Test Suite');
  console.log('======================================================\n');

  // --- 1. geneticsService: crossoverGenome and somaticHypermutate ---
  test('geneticsService.crossoverGenome performs multi-locus crossover with mutations', () => {
    const parentA = {
      id: 'agent-1',
      name: 'ParentA',
      genes: {
        role: 'researcher',
        strategy: 'dfs',
        tools: ['code_search', 'run_tests'],
        temp: 0.7,
        topP: 0.9
      }
    };
    const parentB = {
      id: 'agent-2',
      name: 'ParentB',
      genes: {
        role: 'engineer',
        strategy: 'bfs',
        tools: ['ast_grep', 'verify_contracts'],
        temp: 0.3,
        topP: 0.7
      }
    };

    const child = crossoverGenome(parentA, parentB, { mutationRate: 1.0 });
    assert(child !== null);
    assert(child.childGenes.temp >= 0.0 && child.childGenes.temp <= 1.0);
    assert(child.childGenes.topP >= 0.0 && child.childGenes.topP <= 1.0);
    assert(Array.isArray(child.childGenes.tools));
    assert(child.childGenes.tools.length >= 1);
  });

  test('geneticsService.somaticHypermutate mutates parameters, tools and prompt', () => {
    const originalGenes = {
      role: 'optimizer',
      strategy: 'gradient_descent',
      tools: ['code_search', 'ast_grep'],
      temp: 0.5,
      topP: 0.8
    };

    const mutated = somaticHypermutate(originalGenes, {
      mutationRate: 0.8,
      stressLevel: 1.5
    });

    assert(mutated.mutatedGenes.temp >= 0.0 && mutated.mutatedGenes.temp <= 1.0);
    assert(mutated.mutatedGenes.topP >= 0.0 && mutated.mutatedGenes.topP <= 1.0);
    assert.strictEqual(mutated.isHypermutated, true);
    assert(mutated.hypermutationScore > 0);
  });

  // --- Setup test agent in DB for strategy primitives ---
  const { getDatabase } = require('../src/db');
  const db = await getDatabase();
  const testAgentId = 'test_agent_mutations_' + Date.now();
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, current_task) VALUES (?, 'Test Agent', 'tester', 'idle', 'GenOS', 'worker', 'ws-local', 'standard', 'mutation-task')",
    testAgentId
  );
  await db.run(
    "INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, metadata) VALUES (?, 'ws-local', ?, 'Test Agent', 'agent', ?)",
    testAgentId,
    testAgentId,
    JSON.stringify({ genes: { role: 'tester', strategy: 'dfs', tools: ['genos_inspect', 'genos_test'], temp: 0.4, topP: 0.85 } })
  );

  // --- 2. strategyExecutionAdapter: stagnation_check & single_mutation ---
  await testAsync('strategyExecutionAdapter handles stagnation_check primitive', async () => {
    const context = {
      agentId: testAgentId,
      forceStagnation: true
    };

    const result = await strategyExecutionAdapter.executePrimitive('stagnation_check', context);
    assert(result !== null);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stagnant, true);
    assert.strictEqual(result.recommendedAction, 'hypermutation_reheat');
  });

  await testAsync('strategyExecutionAdapter handles single_mutation primitive', async () => {
    const context = {
      agentId: testAgentId,
      singleFactor: 'temp'
    };

    const result = await strategyExecutionAdapter.executePrimitive('single_mutation', context);
    assert(result !== null);
    assert.strictEqual(result.success, true);
    assert(result.mutantId !== undefined);
  });

  await testAsync('strategyExecutionAdapter handles autonomous hypermutation with empty descriptors', async () => {
    const context = {
      agentId: testAgentId,
      mutations: []
    };

    const result = await strategyExecutionAdapter.executePrimitive('hypermutation', context);
    assert(result !== null);
    assert.strictEqual(result.success, true);
    assert(result.mutantId !== undefined);
  });

  // --- 3. resilienceService: calculateLevenshtein O(N) memory & somaticHypermutationPrompt ---
  test('resilienceService.calculateLevenshtein computes accurate distance with O(N) rolling buffers', () => {
    assert.strictEqual(calculateLevenshtein('', ''), 0);
    assert.strictEqual(calculateLevenshtein('kitten', 'sitting'), 0.4286);
    assert.strictEqual(calculateLevenshtein('GenOS', 'GenOS'), 0);
    assert.strictEqual(calculateLevenshtein('hypermutation', 'mutation'), 0.3846);

    const s1 = 'A'.repeat(5000) + 'B'.repeat(5000);
    const s2 = 'A'.repeat(5000) + 'C'.repeat(5000);
    const dist = calculateLevenshtein(s1, s2);
    assert.strictEqual(dist, 0.5);
  });

  test('resilienceService.somaticHypermutationPrompt mutates text strings stochastically', () => {
    const prompt = 'System instruction for always verify and execute safe operations.';
    const res = somaticHypermutationPrompt(prompt, 0.5);
    assert(res !== null && typeof res === 'object');
    assert(typeof res.mutatedPrompt === 'string');
    assert(res.drift >= 0);
    assert(res.mutatedCount > 0);
  });

  // --- 4. mcpStrategyTools: genos_resilience_hypermutation ---
  await testAsync('mcpStrategyTools executes genos_resilience_hypermutation autonomously', async () => {
    const res = await executeStrategyTool('genos_resilience_hypermutation', {
      agent_id: testAgentId,
      mutations: []
    });

    assert(res !== null);
    assert.strictEqual(res.configured, true);
    assert.strictEqual(res.success, true);
    assert(res.output.mutantId !== undefined);
  });

  // Cleanup test agent
  await db.run('DELETE FROM agents WHERE id = ?', testAgentId);
  await db.run('DELETE FROM lineage_nodes WHERE id = ?', testAgentId);

  console.log('\n======================================================');
  console.log('Results: ' + passedTests + ' passed, ' + failedTests + ' failed');
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
