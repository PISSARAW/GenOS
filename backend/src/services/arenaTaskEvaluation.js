/**
 * GenOS Arena Task Evaluation Service
 * Transforms real agent dossiers and task solutions into multi-objective
 * Pareto candidates and identifies the optimal Knee-Point recommendation.
 */

const { calculateParetoFront, calculateElo } = require('./arenaService');

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function extractDossierReport(dossier) {
  if (!dossier) return {};
  const events = Array.isArray(dossier.events) ? dossier.events : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const report = events[i].evidenceReport || events[i].payload?.evidenceReport;
    if (report) return report;
  }
  return dossier.evidenceReport || {};
}

function testResultPassed(test) {
  if (typeof test === 'boolean') return test;
  if (test && typeof test === 'object') {
    if (test.passed === true || test.ok === true || test.exitCode === 0) return true;
    if (test.passed === false || test.ok === false || Number(test.exitCode) !== 0) return false;
    return false;
  }
  const text = String(test || '').trim().toLowerCase();
  if (!text || /\b(?:not\s+ok|fail(?:ed|ure)?|error|exception|exit\s+code\s+[1-9]\d*)\b/.test(text)) return false;
  return /^(?:ok\b|passed\b|pass\b|successful\b|success\b|exit\s+code\s+0\b)/.test(text);
}

function dossierToCandidate(dossier, options = {}) {
  const report = extractDossierReport(dossier);
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties : [];
  const tests = Array.isArray(report.tests) ? report.tests : [];

  // Compute adversarial pass rate from verified tests
  let passRate = 50;
  if (tests.length > 0) {
    const passed = tests.filter(testResultPassed).length;
    passRate = Number(((passed / tests.length) * 100).toFixed(1));
  } else if (report.outcome === 'success') {
    passRate = 90;
  } else if (report.outcome === 'failed') {
    passRate = 20;
  }

  // Compute fitness score based on verified claims and penalty on uncertainties
  const claimScore = claims.reduce((acc, c) => acc + (Array.isArray(c.evidence) && c.evidence.length > 0 ? 15 : 5), 0);
  const uncertaintyPenalty = uncertainties.length * 3;
  const rawFitness = Math.max(10, Math.min(100, 50 + claimScore - uncertaintyPenalty));

  const latencyMs = nonNegativeNumber(options.executionTimeMs ?? dossier.executionTimeMs, 25);
  const tokens = nonNegativeNumber(options.tokens ?? dossier.tokens, 1500);
  const costUSD = nonNegativeNumber(options.tokenCostUSD ?? dossier.tokenCostUSD, Number((tokens * 0.000003).toFixed(5)));

  return {
    candidateId: dossier.workerId || dossier.id || `candidate-${Date.now()}`,
    name: dossier.name || dossier.workerId || 'Worker Candidate',
    role: dossier.role || 'specialist',
    executionTimeMs: latencyMs,
    tokenCostUSD: costUSD,
    fitnessScore: rawFitness,
    adversarialPassRate: passRate,
    claimsCount: claims.length,
    testsCount: tests.length,
    report
  };
}

function evaluateDossiersPareto(dossiers = [], options = {}) {
  const candidates = dossiers.map((d) => dossierToCandidate(d, options));
  const paretoResult = calculateParetoFront(candidates);

  // Compute dynamic ELO ratings
  const baseElo = Number(options.baseElo || 1500);
  const leaderboard = candidates.map((cand) => ({
    ...cand,
    eloRating: calculateElo(baseElo, 1500, (cand.fitnessScore / 100) * 0.7 + (cand.adversarialPassRate / 100) * 0.3)
  })).sort((a, b) => b.eloRating - a.eloRating || String(a.candidateId).localeCompare(String(b.candidateId)));

  return {
    timestamp: new Date().toISOString(),
    totalEvaluated: candidates.length,
    paretoFrontCount: paretoResult.paretoFrontCount,
    paretoFront: paretoResult.paretoFront,
    dominatedSolutions: paretoResult.dominatedSolutions,
    kneePoint: paretoResult.kneePointRecommendation || leaderboard[0] || null,
    leaderboard
  };
}

function evaluateTaskBenchmark(taskSpec, solutions = []) {
  const candidates = solutions.map((sol, idx) => ({
    candidateId: sol.id || `sol-${idx + 1}`,
    name: sol.name || `Solution ${idx + 1}`,
    executionTimeMs: nonNegativeNumber(sol.executionTimeMs, 10),
    tokenCostUSD: nonNegativeNumber(sol.tokenCostUSD, 0.001),
    fitnessScore: Number.isFinite(Number(sol.fitnessScore)) ? Number(sol.fitnessScore) : 80,
    adversarialPassRate: Number.isFinite(Number(sol.passRate)) ? Number(sol.passRate) : (sol.passed ? 100 : 0)
  }));

  const pareto = calculateParetoFront(candidates);
  return {
    benchmarkId: taskSpec.id || 'real-task-benchmark',
    title: taskSpec.title || 'Task Benchmark Evaluation',
    paretoFront: pareto.paretoFront,
    kneePoint: pareto.kneePointRecommendation
  };
}

module.exports = {
  dossierToCandidate,
  testResultPassed,
  evaluateDossiersPareto,
  evaluateTaskBenchmark
};
