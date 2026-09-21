'use strict';

/**
 * Intégration AEIS avec les benchmarks GenOS existants (BFCL, GAIA, FPAMB).
 *
 * Les benchmarks fournissent une vérité externe (oracle truth) qui permet
 * de mesurer réellement les métriques AEIS :
 * - recognition rate (pathogènes détectés)
 * - neutralization rate (pathogènes neutralisés)
 * - FAR réel (faux claims promus)
 * - coût et latence réels
 * - memory response gain
 *
 * Chaque cas de benchmark est transformé en EpistemicAntigen, exécuté
 * via le pipeline AEIS, et comparé à la vérité externe.
 */

const { createPathogen, challengeReport, challengeMetrics } = require('./epistemicChallengeService');

function transformBenchmarkCase(benchmarkCase) {
  // Transformer un cas de benchmark en pathogène AEIS.
  // Un cas BFCL/GAIA/FPAMB a une question, des outils, et une réponse attendue.
  const antigen = createPathogen(benchmarkCase.type || 'BENCHMARK_CASE', {
    domain: benchmarkCase.domain || 'general',
    description: benchmarkCase.question || benchmarkCase.prompt || 'benchmark case',
    epitopes: {
      evidence: { digest: benchmarkCase.expectedAnswer ? 'expected' : 'none' },
    },
    dangerLevel: benchmarkCase.difficulty || 0.5,
    isPathogen: true,
  });
  antigen.claim = { text: benchmarkCase.question || benchmarkCase.prompt || '' };
  antigen.benchmarkTruth = benchmarkCase.expectedAnswer || benchmarkCase.answer || null;
  antigen.benchmarkMetadata = benchmarkCase;
  return antigen;
}

function executeBenchmarkCase(antigen, immuneSystem) {
  // Exécuter le pipeline AEIS sur un cas de benchmark.
  const startAt = Date.now();
  const recognized = immuneSystem ? immuneSystem.recognize(antigen) : false;
  const neutralized = immuneSystem ? immuneSystem.neutralize(antigen) : false;
  const memoryHit = immuneSystem ? immuneSystem.hasMemory(antigen) : false;
  const elapsedMs = Date.now() - startAt;

  const truth = antigen.benchmarkTruth;
  const correct = truth ? (neutralized === (truth !== 'none')) : false;

  return {
    pathogen: antigen.id,
    type: antigen.type,
    recognized,
    neutralized,
    memoryHit,
    correct,
    falsePositive: !recognized && neutralized,
    immuneEscape: recognized && !neutralized,
    autoImmune: !recognized && !neutralized && antigen.dangerLevel < 0.3,
    truth,
    elapsedMs,
  };
}

function runBenchmarkSuite(benchmarkCases, immuneSystem = null) {
  if (!benchmarkCases || !benchmarkCases.length) {
    return challengeReport([], []);
  }
  const antigens = [];
  const results = [];
  for (const benchCase of benchmarkCases) {
    const antigen = transformBenchmarkCase(benchCase);
    antigens.push(antigen);
    const result = executeBenchmarkCase(antigen, immuneSystem);
    results.push(result);
  }
  const report = challengeReport(antigens, results);
  return challengeMetrics(report);
}

module.exports = {
  transformBenchmarkCase,
  executeBenchmarkCase,
  runBenchmarkSuite,
};
