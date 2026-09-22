'use strict';

/**
 * @file test_conway99_benchmark.js
 * @description Benchmark Conway-99 : teste le Mathematical Organism sur un vrai problème.
 *
 * Le pipeline complet :
 * 1. Création du problème Conway-99 formel
 * 2. Initialisation du runtime avec SAT symbionte
 * 3. Exécution d'un step complet (observe → explore → verify → symbiont)
 * 4. Vérification que le SAT solver a été appelé
 */

const assert = require('node:assert');
const math = require('../src/services/mathematical');
const { createConway99Problem } = require('../src/services/mathematical/conway99Problem');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');

const TOOLCHAIN_VERSION = 'lean-4.9.0';
const ENVIRONMENT_DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

async function testConway99Benchmark() {
  console.log('=== Conway-99 Benchmark ===');

  // 1. Créer le problème formel
  const problem = createConway99Problem();
  console.log('Problem:', problem.name);
  console.log('Statement:', problem.statement.substring(0, 80) + '...');
  console.log('Parameters:', JSON.stringify(problem.parameters));
  console.log('Known results:', problem.knownResults.length);

  // 2. Initialiser le runtime
  const runtime = math.createMathematicalOrganismRuntime({
    budget: { tokens: 10000, cpu: 3600 },
    envMeanReturnRate: 0.3,
  });

  runtime.initialize(problem, {
    initialNiches: [
      { name: 'SAT', representation: 'SAT' },
      { name: 'Algebraic', representation: 'algebraic' },
      { name: 'Analytic', representation: 'analytic' },
    ],
    initialStrategies: [
      ['induction', 'existing_theorem_retrieval'],
      ['contradiction', 'auxiliary_lemma_generation'],
      ['representation_change', 'normalize'],
    ],
  });

  // 3. Vérifier le registry symbionte
  const solvers = runtime.symbiontExecutor.listSolvers();
  console.log('Available symbionts:', solvers.join(', '));
  assert.ok(solvers.includes('SAT'), 'SAT solver should be registered');

  // 4. Créer un mock Lean gate (pas Lean installé)
  const graph = new MathematicalDependencyGraph();
  const gate = new LeanIncrementalGate({
    graph,
    executor: async (input) => ({
      exitCode: 0,
      toolchainVersion: TOOLCHAIN_VERSION,
      sourceDigest: 'sha256:' + require('node:crypto').createHash('sha256').update(input.source).digest('hex'),
      axioms: [],
    }),
    toolchainVersion: TOOLCHAIN_VERSION,
    environmentDigest: ENVIRONMENT_DIGEST,
  });
  runtime.setLeanGate(gate);

  // 5. Exécuter un step
  const stepResult = await runtime.step();
  console.log('Step executed:', stepResult);

  // 6. Vérifier les résultats
  const summary = runtime.getSummary();
  console.log('Summary niches:', summary.niches);
  console.log('Summary totalLineages:', summary.totalLineages);
  console.log('Summary metrics.totalVerified:', summary.metrics.totalVerified);
  console.log('Summary metrics.totalQuestions:', summary.metrics.totalQuestions);

  // Vérifier que le SAT symbionte a été appelé via l'history
  const symbiontEvents = summary.history.filter(h => h.event === 'symbiont_execution');
  console.log('Symbiont execution events:', symbiontEvents.length);
  if (symbiontEvents.length > 0) {
    console.log('Symbiont solver:', symbiontEvents[0].solver);
    console.log('Symbiont status:', symbiontEvents[0].status);
  }

  // 7. Vérifier que le problème a bien été formalisé
  const formalizationCount = runtime.formalizationRegistry.size();
  console.log('Formalization registry size:', formalizationCount);

  // Assertions
  assert.ok(summary.niches >= 3, 'Should have at least 3 niches');
  assert.ok(summary.totalLineages >= 3, 'Should have at least 3 lineages');
  assert.ok(summary.metrics.totalQuestions >= 0, 'Should track questions');
  assert.ok(symbiontEvents.length >= 1, 'SAT symbiont should have been executed at least once');

  console.log('=== Conway-99 Benchmark PASSED ===');
}

testConway99Benchmark().catch(e => { console.error(e); process.exit(1); });
