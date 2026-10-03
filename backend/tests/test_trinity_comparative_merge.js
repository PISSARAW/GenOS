const assert = require('assert');
const trinity = require('../src/services/trinityService');
const telemetry = require('../src/services/telemetryObserver');

// 1. Check domain weights
assert.equal(trinity.DOMAIN_WEIGHTS.creative_writing.gamma, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.security.beta, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.data.beta, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.product_design.gamma, 0.40);
assert.equal(trinity.DOMAIN_WEIGHTS.software_engineering.alpha, 0.35);

const trustedReceipt = () => ({ status: 'verified', independent: true, evidenceDigest: 'sha256:proof', verifierDigest: 'sha256:verifier', independenceDescriptor: { actorId: 'verifier', workspaceId: 'isolated' } });
const verifiedClaim = (statement, evidence) => ({ statement, evidence: [evidence], verificationLevel: 'independent_deterministic', verificationReceipts: [{ receipt: trustedReceipt() }] });

// 2. Score individual world evidence only after independent verification.
const world1Report = {
  outcome: 'success',
  claims: [
    { statement: 'Claim A', evidence: ['test passed'] },
    { statement: 'Claim B' } // unproven
  ],
  tests: ['test 1 passed', 'test 2 passed'],
  uncertainties: ['uncertainty 1']
};

const score1 = trinity.scoreWorldEvidence(world1Report, 'software_engineering');
assert(score1.totalScore > 0, 'Score 1 must be positive');
assert.equal(score1.claimsScore, 0); // no resolvable refs
assert.equal(score1.testsCoverage, 0); // self-declared strings are not receipts
assert(score1.robustnessScore < 1.0, 'Robustness must have penalty for uncertainty');
assert.deepEqual(score1.evidenceAudit, { proven: 0, resolvableRefs: 0, placeholderRefs: 1, claimCount: 2 });

const world2Report = {
  outcome: 'success',
  evidence: [{ id: 'code-proof' }, { id: 'test-proof' }],
  claims: [
    verifiedClaim('A feature was implemented and checked in its candidate workspace.', 'code-proof'),
    verifiedClaim('The invariant suite passed under the independent verifier.', 'test-proof')
  ],
  tests: [{ name: 'suite 1', passed: true, verificationReceipt: trustedReceipt() }, { name: 'suite 2', passed: true, verificationReceipt: trustedReceipt() }],
  coverage: 0.95,
  coverageReceipt: trustedReceipt()
};

const score2 = trinity.scoreWorldEvidence(world2Report, 'software_engineering');
assert.equal(score2.claimsScore, 1.0);
assert(score2.totalScore > score1.totalScore, 'World 2 should outperform World 1');

const failingWorld = {
  outcome: 'failed',
  failure: { reason: 'Crash' },
  claims: [],
  tests: []
};
const lowEvidenceWorld = {
  outcome: 'success',
  claims: [{ statement: 'A verified implementation claim with provenance.', evidence: ['e-low'], sourceRefs: ['test:low'] }],
  evidence: [{ id: 'e-low', source: 'test:low' }],
  evidenceVector: {
    correctness: 0.1, coverage: 0.1, robustness: 0.1, reproducibility: 0.1,
    novelty: 0.1, cost: 0.9, latency: 0.9, risk: 0.9, uncertainty: 0.9,
    constraintCoverage: 0.1
  },
  evidenceVectorEvidence: Object.fromEntries([
    'correctness', 'coverage', 'robustness', 'reproducibility', 'novelty',
    'cost', 'latency', 'risk', 'uncertainty', 'constraintCoverage'
  ].map((dimension) => [dimension, ['e-low']])),
  hardConstraintsPassed: true,
  budgetStatus: 'within'
};
const scoreFailing = trinity.scoreWorldEvidence(failingWorld, 'software_engineering');
assert(scoreFailing.totalScore < 0.5, 'Failing world must have low score');

// 3. Compare 3 worlds
const comparison = trinity.compareWorlds([
  { worldNumber: 1, role: 'basic_implementation', report: world1Report },
  { worldNumber: 2, role: 'interview_plan_implementation', report: world2Report },
  { worldNumber: 3, role: 'self_correcting_implementation', report: failingWorld }
], 'software_engineering');

assert.equal(comparison.bestWorld.worldNumber, 2);
assert.equal(comparison.bestWorld.role, 'interview_plan_implementation');
assert.equal(comparison.comparisonMatrix.length, 3);
assert(comparison.bestScore >= 0.70);

// 4. Merge Trinity Evidence
const mergeSuccess = trinity.mergeTrinityEvidence([
  { worldNumber: 1, role: 'basic_implementation', report: world1Report },
  { worldNumber: 2, role: 'interview_plan_implementation', report: world2Report },
  { worldNumber: 3, role: 'self_correcting_implementation', report: failingWorld }
], { domain: 'software_engineering', threshold: 0.70 });

assert.equal(mergeSuccess.canMerge, false);
assert.equal(mergeSuccess.outcome, 'ESCALATE_EXPERIMENT');
assert.equal(mergeSuccess.selectedWorld, null);
assert.match(mergeSuccess.reason, /required_evidence_vector_or_provenance_missing/);

// 5. Test rejection when threshold not met
const mergeFailure = trinity.mergeTrinityEvidence([
  { worldNumber: 1, role: 'basic_implementation', report: lowEvidenceWorld },
  { worldNumber: 2, role: 'interview_plan_implementation', report: lowEvidenceWorld },
  { worldNumber: 3, role: 'self_correcting_implementation', report: lowEvidenceWorld }
], { domain: 'software_engineering', threshold: 0.70 });

assert.equal(mergeFailure.canMerge, false);
assert.equal(mergeFailure.selectedWorld, null);
assert.match(mergeFailure.reason, /required_evidence_vector_or_provenance_missing/i);
assert.match(mergeFailure.recommendation, /Escalate to human review/i);

// 6. Record world comparison telemetry
let emittedEvent = null;
const origEmit = telemetry.emitEvent;
telemetry.emitEvent = (evt) => {
  emittedEvent = evt;
  return origEmit.call(telemetry, evt);
};

trinity.recordWorldComparison(null, {
  missionId: 'trinity_test_123',
  orchestratorId: 'agent_orch_123',
  comparison
});

assert(emittedEvent, 'Telemetry event must be emitted');
assert.equal(emittedEvent.eventType, 'TRINITY_WORLD_COMPARISON_RECORDED');
assert.equal(emittedEvent.action, 'COMPARE');
assert.equal(emittedEvent.payload.bestScore, comparison.bestScore);
assert.equal(emittedEvent.payload.comparisonMatrix.length, comparison.comparisonMatrix.length);
telemetry.emitEvent = origEmit;

console.log('✅ PASS: test_trinity_comparative_merge succeeded.');
