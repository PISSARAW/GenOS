/**
 * GenOS Arena Task Evaluation Service
 * Transforms real agent dossiers and task solutions into multi-objective
 * Pareto candidates and identifies the optimal Knee-Point recommendation.
 */

const crypto = require('crypto');
const { calculateParetoFront, calculateElo } = require('./arenaService');

function stableCandidateId(dossier, options) {
  const payload = JSON.stringify({ dossier, options });
  return `candidate-${crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function boundedPercentage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function extractDossierReport(dossier) {
  if (!dossier) return {};
  const events = Array.isArray(dossier.events) ? dossier.events : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const report = events[i].evidenceReport || events[i].payload?.evidenceReport || events[i].payload?.report || (events[i].payload?.claims ? events[i].payload : null);
    if (report) return report;
  }
  return dossier.evidenceReport || dossier.report || dossier;
}

function testResultPassed(test) {
  if (typeof test === 'boolean') return test;
  if (test && typeof test === 'object') {
    if (test.passed === true || test.ok === true || test.exitCode === 0) return true;
    if (test.passed === false || test.ok === false || (test.exitCode !== null && test.exitCode !== undefined && Number(test.exitCode) !== 0)) return false;
    return false;
  }
  const text = String(test || '').trim().toLowerCase();
  if (!text || /\b(?:not\s+(?:ok|pass(?:ed)?|successful)|fail(?:ed|ure)?|error|exception|exit\s+code\s+[1-9]\d*)\b/.test(text)) return false;
  return /\b(?:ok|passed|pass|successful|success|exit\s+code\s+0)\b/.test(text);
}

function tangibleEvidence(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((item) => item && typeof item === 'object').filter((item) =>
    typeof item.receiptHash === 'string'
      && /^[a-f0-9]{64}$/i.test(item.receiptHash)
      && typeof item.source === 'string'
      && item.source.trim()
  );
}

function dossierToCandidate(dossier, options = {}) {
  const report = extractDossierReport(dossier);
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties : [];
  const tests = Array.isArray(report.tests) ? report.tests : [];
  const noAnswerEvidence = report.outcome === 'no_answer' && report.noAnswerProof && Array.isArray(report.noAnswerProof.evidence)
    ? tangibleEvidence(report.noAnswerProof.evidence).length
    : 0;

  // Compute adversarial pass rate from verified tests
  let passRate = 0;
  if (tests.length > 0) {
    const passed = tests.filter(testResultPassed).length;
    passRate = Number(((passed / tests.length) * 100).toFixed(1));
  } else if (report.outcome === 'failed') {
    passRate = 20;
  }

  // Compute fitness score based on verified claims and penalty on uncertainties
  const suppliedFitness = boundedPercentage(options.fitnessScore ?? dossier.fitnessScore);
  const claimScore = noAnswerEvidence > 0 ? Math.min(40, 20 + noAnswerEvidence * 10) : Math.max(-40, Math.min(40, claims.reduce((acc, c) => {
    const hasEvidence = tangibleEvidence(c?.evidence || c?.receipts || c?.sourceRefs).length > 0;
    return acc + (hasEvidence ? 15 : -10);
  }, 0)));
  const uncertaintyPenalty = uncertainties.length * 3;
  let calculatedFitness = Math.max(0, Math.min(100, 50 + claimScore + ((passRate - 50) * 0.4) - uncertaintyPenalty));
  const isFailed = report.outcome === 'failed'
    || Boolean(dossier?.failure)
    || Boolean(report.failure)
    || (Array.isArray(dossier?.events) && dossier.events.some((event) => event.failure || event.payload?.failure || ['AGENT_FAILED', 'WORKER_TASK_FAILED', 'AGENT_RUNTIME_ERROR'].includes(event.eventType)));
  if (isFailed) calculatedFitness = Math.min(15, calculatedFitness);
  const rawFitness = suppliedFitness === null ? calculatedFitness : Math.min(suppliedFitness, calculatedFitness);

  const latencyMs = nonNegativeNumber(options.executionTimeMs ?? dossier.executionTimeMs, 25);
  const tokens = nonNegativeNumber(options.tokens ?? dossier.tokens, 1500);
  const costUSD = nonNegativeNumber(options.tokenCostUSD ?? dossier.tokenCostUSD, Number((tokens * 0.000003).toFixed(5)));

  return {
    candidateId: dossier.workerId || dossier.id || stableCandidateId(dossier, options),
    name: dossier.name || dossier.workerId || 'Worker Candidate',
    role: dossier.role || 'specialist',
    executionTimeMs: latencyMs,
    tokenCostUSD: costUSD,
    fitnessScore: rawFitness,
    adversarialPassRate: passRate,
    adversarialPassRateSource: tests.length > 0 ? 'executed_tests' : 'not_measured',
    qualityGuarantee: false,
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
    fitnessScore: boundedPercentage(sol.fitnessScore) ?? 80,
    adversarialPassRate: boundedPercentage(sol.passRate) ?? (sol.passed ? 100 : 0)
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
