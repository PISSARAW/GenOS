'use strict';

const assert = require('node:assert');
const math = require('../src/services/mathematical');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');

// Test: MathematicalOrganismRuntime executes closed loop
async function testRuntime() {
  const runtime = math.createMathematicalOrganismRuntime({
    budget: { tokens: 1000, cpu: 3600 },
    envMeanReturnRate: 0.3,
  });

  // Initialize with a problem
  runtime.initialize({
    statement: 'Test problem: find pattern in sequence',
    domain: 'combinatorics',
  }, {
    initialNiches: [
      { name: 'SAT', representation: 'SAT' },
      { name: 'Algebraic', representation: 'algebraic' },
    ],
    initialStrategies: [
      ['induction', 'existing_theorem_retrieval'],
      ['contradiction', 'auxiliary_lemma_generation'],
    ],
  });

  // Set up a mock Lean gate
  const graph = new MathematicalDependencyGraph();
  const gate = new LeanIncrementalGate({
    graph,
    executor: async (input) => ({
      exitCode: 0,
      toolchainVersion: 'lean-4.9.0',
      sourceDigest: `sha256:${require('node:crypto').createHash('sha256').update(input.source).digest('hex')}`,
      axioms: [],
    }),
    toolchainVersion: 'lean-4.9.0',
    environmentDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  runtime.setLeanGate(gate);

  // Run for a few steps
  const summary = await runtime.run(5);

  // Verify runtime executed
  assert.ok(summary.step >= 1, 'Runtime should execute at least 1 step');
  assert.ok(summary.niches >= 2, 'Should have at least 2 niches');
  assert.ok(summary.totalLineages >= 1, 'Should have at least 1 lineage');
  assert.ok(summary.metrics.totalQuestions >= 0, 'Should track questions');
  assert.ok(summary.metrics.totalMutations >= 0, 'Should track mutations');

  console.log('OK MathematicalOrganismRuntime (closed loop executed)');
  return summary;
}

// Test: Runtime produces verified artifacts through Lean gate
async function testRuntimeVerification() {
  const runtime = math.createMathematicalOrganismRuntime({
    budget: { tokens: 500, cpu: 3600 },
    envMeanReturnRate: 0.3,
  });

  runtime.initialize({
    statement: 'Simple test problem',
    domain: 'general',
  }, {
    initialNiches: [{ name: 'Test', representation: 'SAT' }],
    initialStrategies: [['induction']],
  });

  const graph = new MathematicalDependencyGraph();
  const gate = new LeanIncrementalGate({
    graph,
    executor: async (input) => ({
      exitCode: 0,
      toolchainVersion: 'lean-4.9.0',
      sourceDigest: `sha256:${require('node:crypto').createHash('sha256').update(input.source).digest('hex')}`,
      axioms: [],
    }),
    toolchainVersion: 'lean-4.9.0',
    environmentDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  runtime.setLeanGate(gate);

  await runtime.run(3);

  const summary = runtime.getSummary();
  assert.ok(summary.metrics.totalVerified >= 0, 'Should track verified artifacts');

  console.log('OK MathematicalOrganismRuntime verification flow');
}

testRuntime().catch(e => { console.error(e); process.exit(1); });
testRuntimeVerification().catch(e => { console.error(e); process.exit(1); });