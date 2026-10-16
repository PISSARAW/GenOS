'use strict';

const assert = require('node:assert/strict');
const { rankAdaptiveTopologies } = require('../../src/services/morphogenesis/adaptiveTopologyRanking');

function fixture() {
  return {
    currentTopology: 'a_team', currentWorkerKinds: ['bounded_worker'],
    diagnosis: { uncertainty: 0.9, adversarialRisk: 0.8 },
    budget: { tokens: 1000 },
    availableCapabilities: ['analyze', 'verify', 'adversarial_review'],
    availableWorkerKinds: ['verifier_worker', 'red_worker', 'bounded_worker'],
    operationalConstraints: { daemonAllowed: false, maxWorkers: 4 },
    allowScalarTieBreak: true,
    candidates: [
      { id: 'independent-review', topology: 'trinity', workerKinds: ['red_worker', 'verifier_worker'],
        requiredCapabilities: ['verify', 'adversarial_review'], estimatedTokens: 500,
        estimatedProblemFit: 0.95, confidence: 0.9, maturity: { variant: 'implemented' },
        calibrationStatus: 'calibrated', isComposite: true },
      { id: 'over-budget', topology: 'rhizome', workerKinds: ['red_worker'],
        requiredCapabilities: ['adversarial_review'], estimatedTokens: 1200, confidence: 0.95 },
      { id: 'daemon-plan', topology: 'syncytium', workerKinds: ['bounded_worker'],
        requiredCapabilities: ['analyze'], estimatedTokens: 100, requiresDaemon: true, confidence: 0.9 }
    ]
  };
}

function main() {
  const input = fixture();
  const before = structuredClone(input);
  const result = rankAdaptiveTopologies(input);
  assert.deepEqual(input, before, 'ranking must not mutate the caller input');
  assert.equal(result.kind, 'adaptive_topology_ranking_advisory');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.candidates[0].id, 'independent-review');
  assert.equal(result.candidates[0].pareto, true);
  assert.ok(result.candidates[0].scoreComponents.coordinationEfficiency < 0.18,
    'composite recipes pay a coordination penalty');
  assert.equal(result.vetoed.length, 2);
  assert.match(result.vetoed.find(item => item.id === 'over-budget').reasons[0], /budget exceeded/);
  assert.match(result.vetoed.find(item => item.id === 'daemon-plan').reasons[0], /daemon operation/);
  assert.ok(result.candidates.some(item => item.id === 'NO_CHANGE'));
  assert.equal(result.decision.decision, 'PROPOSE');

  const uncertain = rankAdaptiveTopologies({ ...input, candidates: [{ ...input.candidates[0], confidence: 0.2 }] });
  assert.equal(uncertain.decision.decision, 'ABSTAIN');
  assert.equal(uncertain.decision.selectedId, null);
  assert.ok(uncertain.candidates.some(item => item.id === 'NO_CHANGE'));

  const noCandidates = rankAdaptiveTopologies({ currentTopology: 'trinity', budget: { tokens: 100 } });
  assert.equal(noCandidates.decision.decision, 'NO_CHANGE');
  assert.equal(noCandidates.candidates[0].id, 'NO_CHANGE');

  const unsupported = rankAdaptiveTopologies({ ...input, candidates: [{ id: 'unsupported',
    workerKinds: ['missing_worker'], requiredCapabilities: ['deploy'], estimatedTokens: 2 }] });
  assert.match(unsupported.vetoed[0].reasons.join(' '), /missing capabilities.*worker kinds unavailable/);
  assert.equal(unsupported.decision.decision, 'NO_CHANGE');

  const unknownCapabilityInventory = rankAdaptiveTopologies({
    budget: { tokens: 100 }, candidates: [{ id: 'capability-unknown',
      requiredCapabilities: ['coordinate'], estimatedTokens: 10, maturity: { variant: 'stable' } }]
  });
  const unknownCapability = unknownCapabilityInventory.candidates.find(item => item.id === 'capability-unknown');
  assert.equal(unknownCapability.eligible, true, 'absent capability inventory is unknown, not empty');
  assert.equal(unknownCapability.estimates.capabilityFit, 0.5);
  assert.ok(unknownCapability.reasons.includes('capability inventory unavailable'));

  const emptyCapabilityInventory = rankAdaptiveTopologies({
    budget: { tokens: 100 }, availableCapabilities: [],
    candidates: [{ id: 'capability-missing', requiredCapabilities: ['coordinate'],
      estimatedTokens: 10, maturity: { variant: 'stable' } }]
  });
  assert.match(emptyCapabilityInventory.vetoed.find(item => item.id === 'capability-missing').reasons.join(' '),
    /missing capabilities: coordinate/);

  const bounded = rankAdaptiveTopologies({ ...input, limit: 1, candidates: Array.from({ length: 130 }, (_, index) => ({
    id: `candidate-${index}`, estimatedTokens: 1, estimatedProblemFit: 0.5 + index / 200,
    confidence: 0.9
  })) });
  assert.equal(bounded.candidates.length, 1);
  assert.equal(bounded.consideredCount, 131, 'ranking considers the complete candidate set');
  assert.ok(bounded.truncatedCount > 0);
  assert.ok(bounded.scoreWeights.coordinationEfficiency > 0);

  const generated = rankAdaptiveTopologies({ ...input, allowScalarTieBreak: true, candidates: [
    { candidateId: 'no-change', kind: 'NO_CHANGE', topology: 'a_team',
      maturity: { topology: 'current', variant: null }, validation: { valid: true } },
    { candidateId: 'topology:rhizome:default', kind: 'TOPOLOGY', topology: 'rhizome', variant: null,
      maturity: { topology: 'registered', variant: 'implemented' }, requiredCapabilities: [],
      validation: { valid: true }, estimatedTokens: 120, estimatedProblemFit: 0.99, confidence: 0.95,
      calibrationStatus: 'calibrated', admissibility: 'execution_eligible', executionEligible: true },
    { candidateId: 'variant:rhizome:partial', kind: 'VARIANT', topology: 'rhizome', variant: 'partial',
      maturity: { topology: 'registered', variant: 'partial' }, validation: { valid: true },
      admissibility: 'exploratory_only', executionEligible: false,
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 },
    { candidateId: 'nested:rhizome:experimental', kind: 'NESTED', topology: 'rhizome',
      members: [{ topology: 'rhizome' }, { topology: 'trinity' }],
      maturity: { topology: 'registered', variant: 'experimental' }, validation: { valid: true },
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 },
    { candidateId: 'invalid-execution', kind: 'TOPOLOGY', topology: 'rhizome', maturity: { variant: 'stable' },
      validation: { valid: false }, executionEligible: true, admissibility: 'eligible',
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 },
    { candidateId: 'explicit-veto', kind: 'VARIANT', topology: 'rhizome', maturity: { variant: 'stable' },
      validation: { valid: true }, executionEligible: false, admissibility: { status: 'ineligible' },
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 },
    { candidateId: 'unknown-maturity', kind: 'VARIANT', topology: 'rhizome', validation: { valid: true },
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 }
  ] });
  assert.ok(generated.candidates.some(item => item.id === 'topology:rhizome:default'));
  assert.equal(generated.decision.selectedId, 'topology:rhizome:default',
    'partial, experimental, and unknown maturity candidates cannot be proposed');
  assert.equal(generated.candidates.find(item => item.id === 'variant:rhizome:partial').proposalEligible, false);
  assert.equal(generated.candidates.find(item => item.id === 'nested:rhizome:experimental').proposalEligible, false);
  assert.equal(generated.candidates.find(item => item.id === 'unknown-maturity').proposalEligible, false);
  assert.match(generated.candidates.find(item => item.id === 'unknown-maturity').reasons.join(' '), /maturity unknown/);
  assert.match(generated.vetoed.find(item => item.id === 'invalid-execution').reasons.join(' '), /validation.valid is false/);
  assert.match(generated.vetoed.find(item => item.id === 'explicit-veto').reasons.join(' '), /executionEligible is false.*admissibility is ineligible/);
  assert.match(generated.vetoed.find(item => item.id === 'variant:rhizome:partial').reasons.join(' '), /exploratory_only/);

  const onlyExploratory = rankAdaptiveTopologies({ ...input, candidates: [
    { candidateId: 'partial-only', kind: 'VARIANT', topology: 'rhizome', maturity: { variant: 'partial' },
      estimatedTokens: 10, estimatedProblemFit: 1, confidence: 0.99 }
  ] });
  assert.equal(onlyExploratory.decision.decision, 'ABSTAIN');

  const tradeoff = rankAdaptiveTopologies({ ...input, allowScalarTieBreak: false, candidates: [
    { id: 'quality', maturity: { variant: 'implemented' }, estimatedProblemFit: 0.95, calibrationStatus: 'calibrated',
      confidence: 0.95, estimatedTokens: 900 },
    { id: 'efficient', maturity: { variant: 'implemented' }, estimatedProblemFit: 0.7, calibrationStatus: 'calibrated',
      confidence: 0.95, estimatedTokens: 100 }
  ] });
  assert.equal(tradeoff.decision.decision, 'ABSTAIN');
  assert.match(tradeoff.decision.reason, /non-dominated candidates trade off/);

  const uncalibrated = rankAdaptiveTopologies({ ...input,
    candidates: [{ ...input.candidates[0], calibrationStatus: undefined }] });
  assert.equal(uncalibrated.decision.decision, 'ABSTAIN');
  assert.match(uncalibrated.decision.reason, /no.*calibrated/i);

  const mixed = rankAdaptiveTopologies({ ...input, limit: 1, candidates: [
    { ...input.candidates[0], id: 'uncalibrated-high-score',
      estimatedProblemFit: 1, estimatedTokens: 100, calibrationStatus: undefined },
    { ...input.candidates[0], id: 'calibrated-lower-score',
      estimatedProblemFit: 0.9, estimatedTokens: 500 }
  ] });
  assert.equal(mixed.decision.selectedId, 'calibrated-lower-score');
  assert.equal(mixed.candidates[0].id, 'calibrated-lower-score',
    'the proposed candidate stays visible even when advisory output is capped');
}

main();
