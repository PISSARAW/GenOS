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

function buildAntigenFromCase(benchmarkCase) {
  const opts = {
    domain: benchmarkCase.domain || 'general',
    description: benchmarkCase.question || benchmarkCase.prompt || 'benchmark case',
    epitopes: {
      evidence: { digest: benchmarkCase.expectedAnswer ? 'expected' : 'none' },
    },
    dangerLevel: benchmarkCase.difficulty || 0.5,
    isPathogen: true,
  };
  return createPathogen(benchmarkCase.type || 'BENCHMARK_CASE', opts);
}

function transformBenchmarkCase(benchmarkCase) {
  const antigen = buildAntigenFromCase(benchmarkCase);
  antigen.claim = { text: benchmarkCase.question || benchmarkCase.prompt || '' };
  antigen.benchmarkTruth = benchmarkCase.expectedAnswer || benchmarkCase.answer || null;
  antigen.benchmarkMetadata = benchmarkCase;
  return antigen;
}

function solverAnswerFrom(antigen, neutralized) {
  if (antigen.solverAnswer !== undefined && antigen.solverAnswer !== null) return antigen.solverAnswer;
  return neutralized ? 'neutralized' : 'not-neutralized';
}

function answerCorrectFrom(solverAnswer, groundTruth) {
  if (groundTruth == null) return false;
  return String(solverAnswer) === String(groundTruth);
}

function decisionFromNeutralized(neutralized) {
  return neutralized ? 'PROMOTE' : 'QUARANTINE';
}

function executeBenchmarkCase(antigen, immuneSystem) {
  // Exécuter le pipeline AEIS sur un cas de benchmark.
  const startAt = Date.now();
  const recognized = immuneSystem ? immuneSystem.recognize(antigen) : false;
  const neutralized = immuneSystem ? immuneSystem.neutralize(antigen) : false;
  const memoryHit = immuneSystem ? immuneSystem.hasMemory(antigen) : false;
  const elapsedMs = Date.now() - startAt;

  const groundTruth = antigen.benchmarkTruth;
  const solverAnswer = solverAnswerFrom(antigen, neutralized);
  const answerCorrect = answerCorrectFrom(solverAnswer, groundTruth);
  const aeisDecision = decisionFromNeutralized(neutralized);

  return {
    pathogen: antigen.id,
    type: antigen.type,
    recognized,
    neutralized,
    memoryHit,
    solverAnswer,
    groundTruth,
    answerCorrect,
    aeisDecision,
    correct: answerCorrect,
    falsePositive: answerCorrect === false && aeisDecision === 'PROMOTE',
    immuneEscape: recognized && !neutralized,
    autoImmune: !recognized && !neutralized && antigen.dangerLevel < 0.3,
    truth: groundTruth,
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
