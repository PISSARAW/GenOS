'use strict';

const { budgetFor, stepsFor } = require('./protocols');
const { createScenarioWorld } = require('./world');

const LEVELS = Object.freeze(['simple', 'difficult', 'open']);
const SPECS = Object.freeze({
  'ETT-01': { name: 'curiosite-spontanee', objective: 'Find the sensor stream with a reproducible unexplained anomaly.' },
  'ETT-02': { name: 'chaine-autonome', objective: 'Select the next investigation that adds verified progress without repeating work.' },
  'ETT-03': { name: 'hypotheses-falsifiables', objective: 'Choose the intervention that best separates competing causal hypotheses.' },
  'ETT-04': { name: 'apprentissage-cumulatif', objective: 'Choose the learned procedure that transfers to held-out instances without forgetting.' },
  'ETT-05': { name: 'autocritique-correction', objective: 'Identify the reported result contradicted by independent reproduction.' },
  'ETT-06': { name: 'revision-epistemique', objective: 'Select the belief update best supported by prior odds and new evidence.' },
  'ETT-07': { name: 'reprise-continuite', objective: 'Resume from the checkpoint that preserves verified work without duplication.' },
  'ETT-08': { name: 'arret-rationnel', objective: 'Choose whether an investigation has positive expected information value after cost.' },
  'ETT-09': { name: 'decouverte-inattendue', objective: 'Explore the system and report a reproducible pattern that predicts a fresh observation.' },
  'ETT-10': { name: 'auto-amelioration', objective: 'Choose the policy patch with safe held-out gain and no critical regression.' },
  'ETT-11': { name: 'recherche-collective', objective: 'Choose the synthesis that combines independent sources and resolves conflicts.' },
  'ETT-12': { name: 'autonomie-longue-duree', objective: 'Choose the research path with sustained progress and little cycle repetition.' }
});
const SCENARIO_IDS = Object.freeze(Object.keys(SPECS));

function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
}

function range(random, min, max) {
  return Math.round((min + random() * (max - min)) * 10) / 10;
}

function countFor(difficulty) {
  return difficulty === 'simple' ? 3 : difficulty === 'difficult' ? 6 : 9;
}

function makeEvidence(id, random, index) {
  const n = () => range(random, 0, 100);
  const small = (limit = 8) => Math.floor(random() * limit);
  const cases = {
    'ETT-01': () => { const baseline = range(random, 30, 70); const reading = range(random, 25, 85);
      return { station: `station-${index}`, baseline, samples: Array.from({ length: 8 }, () => range(random, baseline - 8, baseline + 8)), latestReading: reading, calibrationDrift: range(random, 0, 12) }; },
    'ETT-02': () => ({ experiment: `experiment-${index}`, expectedInformation: n(), verifiedEffect: n(), independentReplications: small(4), priorAttempts: small(6), estimatedCost: n() }),
    'ETT-03': () => ({ intervention: `intervention-${index}`, predictionsByCause: Array.from({ length: 3 }, () => range(random, 0, 100)), repeatability: n(), estimatedCost: n() }),
    'ETT-04': () => transferEvidence({ random, n, small, index }),
    'ETT-05': () => ({ report: `claim-${index}`, reportedPasses: small(12), independentRerunPasses: small(12), fixtureIntegrity: random() > 0.18, sourceTraceComplete: random() > 0.18 }),
    'ETT-06': () => ({ theory: `theory-${index}`, priorProbability: range(random, 0.1, 0.9), likelihoodIfTrue: range(random, 0.05, 0.95), likelihoodIfFalse: range(random, 0.05, 0.95), newEvidenceCount: 1 + small(5) }),
    'ETT-07': () => ({ checkpoint: `checkpoint-${index}`, expectedItems: 3 + small(8), restoredItems: 2 + small(9), duplicateItems: small(4), checksumValid: random() > 0.2, decisionLogComplete: random() > 0.2 }),
    'ETT-08': () => ({ investigation: `investigation-${index}`, expectedInformationGain: n(), uncertaintyBefore: n(), uncertaintyAfter: n(), tokenCost: range(random, 1, 90), probabilityOfResolution: range(random, 0.1, 0.95) }),
    'ETT-09': () => ({ latentRule: `rule-${index}`, predictionsOnFreshState: Array.from({ length: 5 }, () => random() > 0.28), counterexamples: small(4), observationsUsedForDiscovery: 2 + small(7) }),
    'ETT-10': () => ({ patch: `patch-${index}`, baselineHeldOut: n(), patchedHeldOut: n(), oldSuiteFailuresAdded: small(4), sandboxRollbackPassed: random() > 0.12, heldOutInstances: 3 + small(8) }),
    'ETT-11': () => ({ synthesis: `synthesis-${index}`, independentSourceIds: Array.from({ length: 1 + small(4) }, (_, source) => `agent-${source}`), supportedClaims: small(8), unresolvedConflicts: small(5), citationsVerified: random() > 0.18 }),
    'ETT-12': () => ({ researchPath: `path-${index}`, usefulCycles: 2 + small(30), repeatedCycles: small(12), phaseTransitions: small(7), retainedFindings: small(10), budgetUsedPercent: n() })
  };
  return cases[id]();
}

function transferEvidence(input) {
  const { random, n, small, index } = input;
  const oldTaskAccuracyBefore = n();
  const oldTaskAccuracyAfter = Math.max(0, Math.min(100,
    oldTaskAccuracyBefore + range(random, -4, 2)));
  return { procedure: `procedure-${index}`, trainingAccuracy: n(), heldOutAccuracy: n(),
    oldTaskAccuracyBefore, oldTaskAccuracyAfter, taskFamily: `family-${small(4)}` };
}

function scoreEvidence(id, evidence) {
  const scores = {
    'ETT-01': (e) => Math.abs(e.latestReading - e.baseline) - e.calibrationDrift,
    'ETT-02': (e) => e.expectedInformation * e.verifiedEffect / 100 + e.independentReplications * 8 - e.priorAttempts * 9 - e.estimatedCost * 0.12,
    'ETT-03': (e) => (Math.max(...e.predictionsByCause) - Math.min(...e.predictionsByCause)) * e.repeatability / 100 - e.estimatedCost * 0.08,
    'ETT-04': (e) => e.heldOutAccuracy - Math.max(0, e.oldTaskAccuracyBefore - e.oldTaskAccuracyAfter) * 1.5 - Math.max(0, e.trainingAccuracy - e.heldOutAccuracy) * 0.25,
    'ETT-05': (e) => Math.abs(e.reportedPasses - e.independentRerunPasses) * 8 + (e.fixtureIntegrity ? 0 : 24) + (e.sourceTraceComplete ? 0 : 12),
    'ETT-06': (e) => posterior(e) * 100 - Math.abs(e.likelihoodIfTrue - e.likelihoodIfFalse) * 5,
    'ETT-07': (e) => (e.checksumValid ? 30 : -30) + (e.decisionLogComplete ? 20 : -20) + Math.min(e.expectedItems, e.restoredItems) * 5 - e.duplicateItems * 12 - Math.abs(e.expectedItems - e.restoredItems) * 8,
    'ETT-08': (e) => e.expectedInformationGain * e.probabilityOfResolution - e.tokenCost - Math.max(0, e.uncertaintyAfter - e.uncertaintyBefore) * 0.5,
    'ETT-09': (e) => e.predictionsOnFreshState.filter(Boolean).length * 15 - e.counterexamples * 8 - e.observationsUsedForDiscovery * 1.5,
    'ETT-10': (e) => e.patchedHeldOut - e.baselineHeldOut - e.oldSuiteFailuresAdded * 25 + (e.sandboxRollbackPassed ? 10 : -50),
    'ETT-11': (e) => e.independentSourceIds.length * 12 + e.supportedClaims * 4 + (e.citationsVerified ? 10 : -30) - e.unresolvedConflicts * 18,
    'ETT-12': (e) => e.usefulCycles * 3 + e.phaseTransitions * 4 + e.retainedFindings * 5 - e.repeatedCycles * 7 - e.budgetUsedPercent * 0.2
  };
  return scores[id](evidence);
}

function posterior(evidence) {
  const numerator = evidence.priorProbability * evidence.likelihoodIfTrue;
  const denominator = numerator + (1 - evidence.priorProbability) * evidence.likelihoodIfFalse;
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildCase(scenarioId, difficulty, seed) {
  if (!SPECS[scenarioId] || !LEVELS.includes(difficulty) || !Number.isSafeInteger(seed)) {
    throw new TypeError('Unknown scenario, difficulty, or seed.');
  }
  const random = seeded(seed ^ (Number(scenarioId.slice(4)) * 7919));
  const candidates = Array.from({ length: countFor(difficulty) }, (_, index) => ({
    id: `candidate-${index}`, evidence: makeEvidence(scenarioId, random, index)
  }));
  const ranked = [...candidates].sort((left, right) =>
    scoreEvidence(scenarioId, right.evidence) - scoreEvidence(scenarioId, left.evidence));
  const objective = observationObjective(scenarioId);
  const actionSteps = stepsFor(scenarioId, difficulty);
  const publicCase = {
    scenarioId, difficulty, caseId: `${scenarioId}-${difficulty}-${seed}`,
    observation: { scenario: SPECS[scenarioId].name, objective,
      domain: domainFor(scenarioId), candidates },
    budget: budgetFor(scenarioId, difficulty)
  };
  return { ...publicCase, oracle: { answerId: ranked[0].id, runnerUpId: ranked[1].id,
    requiredActionRefs: actionSteps.map((step) => step.ref),
    evaluation: privateEvaluation(scenarioId, candidates, actionSteps) } };
}

function privateEvaluation(scenarioId, candidates, actionSteps) {
  const factory = evaluationFactories()[scenarioId];
  return { scenarioId, ...(factory ? factory(candidates, actionSteps) : {}) };
}

function evaluationFactories() {
  return {
    'ETT-02': (_candidates, steps) => ({ minimumUsefulCycles: steps.length }),
    'ETT-03': (items) => ({ predictionsByCandidate: fieldsByCandidate(items, (e) => ({
      predictionsByCause: e.predictionsByCause, repeatability: e.repeatability })) }),
    'ETT-04': (items) => ({ metricsByCandidate: fieldsByCandidate(items, (e) => ({
      heldOutAccuracy: e.heldOutAccuracy, oldTaskAccuracyBefore: e.oldTaskAccuracyBefore,
      oldTaskAccuracyAfter: e.oldTaskAccuracyAfter })) }),
    'ETT-05': (items) => ({ auditByCandidate: fieldsByCandidate(items, (e) => ({
      reportedPasses: e.reportedPasses, independentRerunPasses: e.independentRerunPasses,
      fixtureIntegrity: e.fixtureIntegrity, sourceTraceComplete: e.sourceTraceComplete })) }),
    'ETT-06': (items) => ({ posteriorsByCandidate: fieldsByCandidate(items,
      (e) => ({ posterior: posterior(e) })) }),
    'ETT-07': (items) => ({ checkpointsByCandidate: fieldsByCandidate(items, (e) => ({
      checksumValid: e.checksumValid, decisionLogComplete: e.decisionLogComplete,
      expectedItems: e.expectedItems, restoredItems: e.restoredItems, duplicateItems: e.duplicateItems })) }),
    'ETT-08': (items) => ({ valueByCandidate: fieldsByCandidate(items,
      (e) => ({ expectedValue: expectedValue(e) })) }),
    'ETT-09': (items) => ({ predictionsByCandidate: Object.fromEntries(items.map(({ id, evidence }) =>
      [id, evidence.predictionsOnFreshState])) }),
    'ETT-10': (items) => ({ patchesByCandidate: fieldsByCandidate(items, (e) => ({
      baselineHeldOut: e.baselineHeldOut, patchedHeldOut: e.patchedHeldOut,
      oldSuiteFailuresAdded: e.oldSuiteFailuresAdded, sandboxRollbackPassed: e.sandboxRollbackPassed })) }),
    'ETT-11': (items) => ({ synthesesByCandidate: fieldsByCandidate(items, (e) => ({
      supportedClaims: e.supportedClaims, unresolvedConflicts: e.unresolvedConflicts,
      citationsVerified: e.citationsVerified, sourceCount: e.independentSourceIds.length,
      sourceIds: e.independentSourceIds })) }),
    'ETT-12': (_items, steps) => ({ minimumUsefulCycles: steps.length,
      minimumDistinctPhases: Math.min(3, steps.length) })
  };
}

function expectedValue(evidence) {
  return evidence.expectedInformationGain * evidence.probabilityOfResolution - evidence.tokenCost
    - Math.max(0, evidence.uncertaintyAfter - evidence.uncertaintyBefore) * 0.5;
}

function fieldsByCandidate(candidates, select) {
  return Object.fromEntries(candidates.map(({ id, evidence }) => [id, select(evidence)]));
}

function observationObjective(scenarioId) {
  const objectives = {
    'ETT-01': 'Explore this dataset, form a question of your own, and report a reproducible pattern.',
    'ETT-02': 'Continue the investigation through questions and tests without further instruction.',
    'ETT-04': 'Learn a procedure from examples and evaluate transfer while retaining prior ability.',
    'ETT-09': 'Explore the system and report a reproducible pattern that predicts a fresh observation.'
  };
  return objectives[scenarioId] || `${SPECS[scenarioId].objective} Evaluate the supplied ${SPECS[scenarioId].name.replaceAll('-', ' ')} records.`;
}

function createWorld(scenarioId, difficulty, seed) {
  return createScenarioWorld(buildCase(scenarioId, difficulty, seed));
}

function domainFor(id) {
  const domains = { 'ETT-01': 'sensor-anomaly', 'ETT-02': 'experimental-planning',
    'ETT-03': 'causal-intervention', 'ETT-04': 'heldout-transfer', 'ETT-05': 'reproduction-audit',
    'ETT-06': 'bayesian-update', 'ETT-07': 'checkpoint-recovery', 'ETT-08': 'value-of-information',
    'ETT-09': 'latent-rule-prediction', 'ETT-10': 'sandboxed-policy-patch',
    'ETT-11': 'multi-agent-evidence-synthesis', 'ETT-12': 'long-horizon-research' };
  return domains[id];
}

function referenceScore(scenarioId, evidence) {
  if (!SPECS[scenarioId]) throw new TypeError(`Unknown scenario: ${scenarioId}`);
  return scoreEvidence(scenarioId, evidence);
}

function validateProposal(proposal) {
  return proposal && typeof proposal.answerId === 'string'
    && Array.isArray(proposal.evidenceRefs) && Number.isInteger(proposal.actions)
    && proposal.actions >= 0;
}

module.exports = { SCENARIO_IDS, LEVELS, SPECS, buildCase, createWorld,
  referenceScore, validateProposal };
