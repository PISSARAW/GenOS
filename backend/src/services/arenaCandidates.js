/**
 * GenOS Arena Candidate Builders (N4)
 * Dossier-to-candidate mapping with gaming-resistant identities and scores.
 *
 * Anti-gaming rules applied here:
 * - stableCandidateId hashes (workerId/id + taskId + round) ONLY, never the
 *   declared score or execution options, so resubmitting the same work with
 *   an inflated fitnessScore cannot mint a fresh leaderboard identity.
 * - Benchmark solutions with a malformed fitness are flagged `scored: false`
 *   (instead of receiving a free 80) so the facade can exclude them.
 */

const crypto = require('crypto');
const evidence = require('./arenaEvidence');
const scoring = require('./arenaScoring');

function firstIdentity(value, fallback, other) {
  return String(value || fallback || other || '');
}

function stableCandidateId(dossier, options) {
  const source = dossier || {};
  const opts = options || {};
  const payload = JSON.stringify({
    worker: firstIdentity(source.workerId, source.id, source.name),
    task: firstIdentity(opts.taskId, opts.task, source.taskId),
    round: firstIdentity(opts.round, source.round, '')
  });
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return 'candidate-' + digest;
}

function pickEventReport(event) {
  if (!event) return null;
  if (event.evidenceReport) return event.evidenceReport;
  const payload = event.payload || {};
  if (payload.evidenceReport) return payload.evidenceReport;
  if (payload.report) return payload.report;
  if (payload.claims) return payload;
  return null;
}

function extractDossierReport(dossier) {
  if (!dossier) return {};
  const events = Array.isArray(dossier.events) ? dossier.events : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const report = pickEventReport(events[i]);
    if (report) return report;
  }
  if (dossier.evidenceReport) return dossier.evidenceReport;
  if (dossier.report) return dossier.report;
  return dossier;
}

function claimList(report) {
  if (report && Array.isArray(report.claims)) return report.claims;
  return [];
}

function uncertaintyList(report) {
  if (report && Array.isArray(report.uncertainties)) return report.uncertainties;
  return [];
}

function testList(report) {
  if (report && Array.isArray(report.tests)) return report.tests;
  return [];
}

function scoreDossierReport(report, opts, dossier) {
  const claims = claimList(report);
  const uncertainties = uncertaintyList(report);
  const tests = testList(report);
  const passRate = scoring.resolvePassRate(report, tests);
  const claimScore = scoring.resolveClaimScore(report, claims, evidence.scoreClaimsEvidence);
  const failed = scoring.isFailedDossier(dossier, report);
  const base = scoring.baseFitness(claimScore, passRate, uncertainties.length);
  const calculated = failed ? scoring.capFailedFitness(base) : base;
  const supplied = scoring.suppliedFitness(opts, dossier);
  const backed = evidence.claimsWithVerifiableSupport(claims);
  const fitnessScore = scoring.resolveRawFitness(supplied, calculated, { failed, backed });
  const source = tests.length > 0 ? 'executed_tests' : 'not_measured';
  return { claims, uncertainties, tests, passRate, fitnessScore, failed, passRateSource: source };
}

function resolveCandidateCosts(opts, dossier) {
  const options = opts || {};
  const source = dossier || {};
  const tokens = scoring.nonNegativeNumber(options.tokens || source.tokens, 1500);
  const latencyMs = scoring.nonNegativeNumber(options.executionTimeMs || source.executionTimeMs, 25);
  const costUSD = scoring.nonNegativeNumber(options.tokenCostUSD || source.tokenCostUSD, Number((tokens * 0.000003).toFixed(5)));
  return { tokens, latencyMs, costUSD };
}

function dossierToCandidate(dossier, options) {
  const opts = options || {};
  const source = dossier || {};
  const report = extractDossierReport(source);
  const scored = scoreDossierReport(report, opts, source);
  const costs = resolveCandidateCosts(opts, source);
  return {
    candidateId: source.workerId || source.id || stableCandidateId(source, opts),
    name: source.name || source.workerId || 'Worker Candidate',
    role: source.role || 'specialist',
    executionTimeMs: costs.latencyMs,
    tokenCostUSD: costs.costUSD,
    fitnessScore: scored.fitnessScore,
    adversarialPassRate: scored.passRate,
    adversarialPassRateSource: scored.passRateSource,
    qualityGuarantee: false,
    claimsCount: scored.claims.length,
    testsCount: scored.tests.length,
    report
  };
}

function buildBenchmarkCandidate(solution, index) {
  const source = solution || {};
  const fitness = scoring.boundedPercentage(source.fitnessScore);
  return {
    candidateId: source.id || ('sol-' + (index + 1)),
    name: source.name || ('Solution ' + (index + 1)),
    executionTimeMs: scoring.nonNegativeNumber(source.executionTimeMs, 10),
    tokenCostUSD: scoring.nonNegativeNumber(source.tokenCostUSD, 0.001),
    fitnessScore: fitness,
    scored: fitness !== null,
    adversarialPassRate: scoring.benchmarkPassRate(source)
  };
}

function isScoredCandidate(candidate) {
  if (!candidate) return false;
  return candidate.scored !== false;
}

function isUnscoredCandidate(candidate) {
  if (!candidate) return false;
  return candidate.scored === false;
}

function scoredOnly(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter(isScoredCandidate);
}

function unscoredOnly(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter(isUnscoredCandidate);
}

module.exports = {
  stableCandidateId,
  extractDossierReport,
  dossierToCandidate,
  buildBenchmarkCandidate,
  scoredOnly,
  unscoredOnly
};
