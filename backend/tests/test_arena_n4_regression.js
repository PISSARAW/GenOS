const assert = require('node:assert/strict');
const {
  dossierToCandidate,
  evaluateDossiersPareto,
  evaluateTaskBenchmark,
  isVerifiableEvidenceText
} = require('../src/services/arenaTaskEvaluation');
const { stableCandidateId } = require('../src/services/arenaCandidates');

// N4a: short strings are not proof, even when non-empty.
assert.equal(isVerifiableEvidenceText('trust me'), false);
assert.equal(isVerifiableEvidenceText('proof'), false);
assert.equal(isVerifiableEvidenceText('   '), false);
assert.equal(isVerifiableEvidenceText(42), false);
// N4b: length >= 20 alone is not enough without a checkable marker.
assert.equal(isVerifiableEvidenceText('I definitely did the work honestly'), false);
// N4c: URL / file-path / hex-hash markers count.
assert.equal(isVerifiableEvidenceText('see https://logs.internal/runs/42/out.log'), true);
assert.equal(isVerifiableEvidenceText('artifact stored at results/output.json ok'), true);
assert.equal(isVerifiableEvidenceText('receipt deadbeef12345678 confirmed'), true);

// N4d: malformed benchmark fitness defaults to unscored (never 80) and is
// excluded from the Pareto front.
const bench = evaluateTaskBenchmark({ id: 't' }, [
  { id: 'good', fitnessScore: 70, passRate: 80, executionTimeMs: 10, tokenCostUSD: 0.01 },
  { id: 'bad', fitnessScore: 'not-a-number', executionTimeMs: 5, tokenCostUSD: 0.001 }
]);
assert.equal(bench.unscoredSolutions.map((s) => s.id || s.candidateId).join(','), 'bad');
assert.equal(bench.scoredCount, 1);
assert.ok(bench.paretoFront.every((c) => (c.id || c.candidateId) !== 'bad'));
assert.ok(!bench.paretoFront.some((c) => c.fitnessScore === 80));

// N4e: failed dossiers without executed tests get passRate 0 (never 20).
const failed = dossierToCandidate({
  workerId: 'w-failed',
  evidenceReport: { outcome: 'failed', claims: [], tests: [] }
});
assert.equal(failed.adversarialPassRate, 0);
assert.equal(failed.adversarialPassRateSource, 'not_measured');

// N4f: candidate IDs ignore score/options (no duplicate identities).
const base = { workerId: 'w1', evidenceReport: { claims: [], tests: [] } };
const idA = stableCandidateId(base, { taskId: 't1', round: 2, fitnessScore: 10 });
const idB = stableCandidateId(base, { taskId: 't1', round: 2, fitnessScore: 99, tokens: 5 });
assert.equal(idA, idB);
const candA = dossierToCandidate({ ...base, fitnessScore: 10 }, { taskId: 't1', round: 2 });
const candB = dossierToCandidate({ ...base, fitnessScore: 99 }, { taskId: 't1', round: 2 });
assert.equal(candA.candidateId, candB.candidateId);

// N4g: unscored dossier candidates never reach the leaderboard.
const mixed = evaluateDossiersPareto([
  { workerId: 'w-scored', evidenceReport: { claims: [], tests: ['passed'] } }
]);
assert.equal(mixed.totalEvaluated, 1);
assert.equal(mixed.leaderboard.length, 1);

console.log('Arena N4 non-regression checks passed.');
