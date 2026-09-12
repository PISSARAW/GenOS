const assert = require('assert');
const trinity = require('../src/services/trinityService');
const telemetry = require('../src/services/telemetryObserver');

// 1. Check domain weights
assert.equal(trinity.DOMAIN_WEIGHTS.creative_writing.gamma, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.security.beta, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.data.beta, 0.45);
assert.equal(trinity.DOMAIN_WEIGHTS.product_design.gamma, 0.40);
assert.equal(trinity.DOMAIN_WEIGHTS.software_engineering.alpha, 0.35);

// 2. Score individual world evidence
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
assert.equal(score1.claimsScore, 0.5); // 1 out of 2 proven
assert.equal(score1.testsCoverage, 1.0); // 2 of 2 passed
assert(score1.robustnessScore < 1.0, 'Robustness must have penalty for uncertainty');

const world2Report = {
  outcome: 'success',
  claims: [
    { statement: 'Feature implemented', evidence: ['reproduced logs', 'assertion ok'] },
    { statement: 'Invariants checked', evidence: ['code inspect'] }
  ],
  tests: ['suite 1', 'suite 2'],
  coverage: 0.95
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

assert.equal(mergeSuccess.canMerge, true);
assert.equal(mergeSuccess.selectedWorld, 2);
assert.equal(mergeSuccess.mergedEvidence.author.selectedWorld, 2);
// Ensure cross-perspective claims from other worlds are synthesized
assert(mergeSuccess.mergedEvidence.claims.some((c) => c.statement.includes('[World 1 cross-perspective]')));

// 5. Test rejection when threshold not met
const mergeFailure = trinity.mergeTrinityEvidence([
  { worldNumber: 1, role: 'basic_implementation', report: failingWorld },
  { worldNumber: 2, role: 'interview_plan_implementation', report: failingWorld },
  { worldNumber: 3, role: 'self_correcting_implementation', report: failingWorld }
], { domain: 'software_engineering', threshold: 0.70 });

assert.equal(mergeFailure.canMerge, false);
assert.equal(mergeFailure.selectedWorld, null);
assert.match(mergeFailure.reason, /failed to meet the evidence threshold/i);
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
assert.equal(emittedEvent.payload.bestWorldNumber, 2);
telemetry.emitEvent = origEmit;

console.log('✅ PASS: test_trinity_comparative_merge succeeded.');
