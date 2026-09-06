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

const supplied = dossierToCandidate({
  workerId: 'validated-worker',
  fitnessScore: 37,
  evidenceReport: { claims: Array.from({ length: 20 }, () => ({ evidence: ['proof'] })) }
});
assert.strictEqual(supplied.fitnessScore, 37);

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

console.log('Fitness and selection regression checks passed.');