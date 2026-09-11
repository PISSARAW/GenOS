const assert = require('assert');
const { evidenceScore } = require('../src/services/agentEvidenceService');
const { dossierToCandidate } = require('../src/services/arenaTaskEvaluation');
const { calculateParetoFront } = require('../src/services/arenaService');

const oversizedEvidence = evidenceScore({
  evidenceReport: { claims: [{ evidence: Array.from({ length: 100 }, () => 'proof') }] }
});
assert.strictEqual(oversizedEvidence, 100);

const invalidatedEvidence = evidenceScore({
  evidenceReport: { claims: [], uncertainties: Array.from({ length: 100 }, () => 'unknown') }
});
assert.strictEqual(invalidatedEvidence, 0);

const VERIFIABLE_PROOF = 'https://logs.internal/runs/42/claims/proof-001.log';
const supplied = dossierToCandidate({
  workerId: 'validated-worker',
  fitnessScore: 37,
  evidenceReport: { claims: Array.from({ length: 20 }, () => ({ evidence: [VERIFIABLE_PROOF] })) }
});
assert.strictEqual(supplied.fitnessScore, 37);
// N4: bare short strings ("trust me") are not verifiable evidence, so the
// declared score must be clamped to the computed fitness instead of honored.
const trustMe = dossierToCandidate({
  workerId: 'trust-me-worker',
  fitnessScore: 37,
  evidenceReport: { claims: Array.from({ length: 20 }, () => ({ evidence: ['proof'] })) }
});
assert(trustMe.fitnessScore < 37, 'Unverifiable "trust me" strings must not back a declared fitness.');
const inflated = dossierToCandidate({ workerId: 'inflated-worker', fitnessScore: 100, evidenceReport: { claims: [], tests: ['failed'] } });
assert(inflated.fitnessScore < 100, 'Declared fitness must not override failed evidence.');
const untested = dossierToCandidate({ workerId: 'untested-worker', evidenceReport: { claims: [] } });
assert.equal(untested.adversarialPassRate, 0, 'No tests must not receive a neutral pass rate.');
const failedDeclared = dossierToCandidate({ workerId: 'failed-worker', evidenceReport: { outcome: 'failed', claims: [{ evidence: ['proof'] }], tests: ['passed'] } });
assert(failedDeclared.fitnessScore <= 15, 'Failed dossier fitness must be capped.');

const passed = dossierToCandidate({
  workerId: 'passed-worker',
  evidenceReport: { claims: [], tests: ['passed'], uncertainties: [] }
});
const failed = dossierToCandidate({
  workerId: 'failed-worker',
  evidenceReport: { claims: [], tests: ['failed'], uncertainties: [] }
});
assert(passed.fitnessScore > failed.fitnessScore);

const pareto = calculateParetoFront([
  { solverKey: 'valid', executionTimeMs: 1, tokenCostUSD: 1, fitnessScore: 80, adversarialPassRate: 80 },
  { solverKey: 'invalid', executionTimeMs: 0, tokenCostUSD: 0, fitnessScore: 1000, adversarialPassRate: 200 }
]);
assert.deepStrictEqual(pareto.paretoFront.map((candidate) => candidate.solverKey), ['valid']);
assert.deepStrictEqual(pareto.invalidSolutions.map((candidate) => candidate.solverKey), ['invalid']);
assert.equal(pareto.evaluationStatus, 'partial_invalid_candidates');

console.log('Fitness and selection regression checks passed.');