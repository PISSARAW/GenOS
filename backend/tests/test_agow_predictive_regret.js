'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/agow/candidates/candidateAdapterService');
const regret = require('../src/services/agow/predictiveRegretService');
const arbitration = require('../src/services/agow/workspaceArbitrationService');
let candidateSequence = 0;

function makeCandidate(options = {}) {
  const candidate = adapter.build({ module: 'epistemic', agentId: 'regret-test', now: 1000,
    observation: { confidence: options.confidence ?? 0.5, evidenceCoverage: options.coverage ?? 0.5,
      candidateId: options.id || `candidate:${candidateSequence++}`,
      goalMatched: options.goalMatched ?? true, actionable: options.actionable ?? true,
      predictionError: options.predictionError ?? 0.2, causalEvidence: options.causalEvidence === true,
      expectedInformationGain: 0.5 } });
  return { ...candidate,
    measures: { ...candidate.measures, ...(options.measures || {}) },
    epistemicContext: options.epistemicContext || undefined,
    constraints: { ...candidate.constraints, ...(options.constraints || {}) }
  };
}

function testEpistemicRegret() {
  const uncertain = makeCandidate({ confidence: 0.45, coverage: 0.2, predictionError: 0.6,
    epistemicContext: { beliefImportance: 1, causalDescendantCount: 8 } });
  const confident = makeCandidate({ confidence: 0.99, coverage: 1, predictionError: 0,
    goalMatched: false, actionable: false, measures: { expectedInformationGain: 0.05 } });
  const highRisk = regret.evaluate(uncertain);
  const lowRisk = regret.evaluate(confident);
  assert(highRisk.regret.epistemic > lowRisk.regret.epistemic);
  assert.equal(highRisk.provenance.calibrated, false);
  assert(highRisk.attend.expectedEpistemicLoss < highRisk.ignore.expectedEpistemicLoss);
}

function testAllostaticPreemption() {
  const currentInteroception = { energy: 0.1, memoryPressure: 0.9, socialState: 0.9,
    modelDrift: 0.9, contextPressure: 0.9, integrity: 0.1, stress: 0.9 };
  const recoveredState = { energy: 1, memoryPressure: 0, socialState: 0.5,
    modelDrift: 0, contextPressure: 0, integrity: 1, stress: 0 };
  const repair = makeCandidate({ confidence: 0.9, coverage: 1, causalEvidence: true,
    epistemicContext: { expectedAllostaticState: recoveredState } });
  const routine = makeCandidate({ goalMatched: false, measures: { urgency: 0.1 } });
  const result = arbitration.arbitrate({ candidates: [routine, repair], regretContext: { currentInteroception } });
  assert.deepEqual(result.candidates.map((item) => item.candidateId), [repair.candidateId]);
  const mild = regret.evaluate(repair, { currentInteroception: { energy: 0.5, memoryPressure: 0.5,
    socialState: 0.5, modelDrift: 0.5, contextPressure: 0.5, integrity: 0.5, stress: 0.5 } });
  assert.equal(mild.preempt, false);
}

function testHardConstraintStillWins() {
  const blocked = makeCandidate({ constraints: { safety: 'blocked' }, confidence: 1,
    epistemicContext: { beliefImportance: 1, causalDescendantCount: 50 } });
  const eligible = makeCandidate({ confidence: 0.6 });
  const result = arbitration.arbitrate({ candidates: [blocked, eligible] });
  assert(result.selected.every((item) => item.candidateId !== blocked.candidateId));
}

testEpistemicRegret();
testAllostaticPreemption();
testHardConstraintStillWins();
console.log('✅ AGOW predictive and allostatic regret passed');
