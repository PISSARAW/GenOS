'use strict';

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
  'ETT-09': { name: 'decouverte-inattendue', objective: 'Choose the latent rule that predicts newly revealed observations.' },
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
    'ETT-04': () => ({ procedure: `procedure-${index}`, trainingAccuracy: n(), heldOutAccuracy: n(), oldTaskAccuracyBefore: n(), oldTaskAccuracyAfter: n(), taskFamily: `family-${small(4)}` }),
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
  const objective = `${SPECS[scenarioId].objective} Evaluate the supplied ${SPECS[scenarioId].name.replaceAll('-', ' ')} records.`;
  const publicCase = {
    scenarioId, difficulty, caseId: `${scenarioId}-${difficulty}-${seed}`,
    observation: { scenario: SPECS[scenarioId].name, objective,
      domain: domainFor(scenarioId), candidates },
    budget: difficulty === 'open' ? 12 : difficulty === 'difficult' ? 8 : 5
  };
  return { ...publicCase, oracle: { answerId: ranked[0].id, runnerUpId: ranked[1].id } };
}

function createWorld(scenarioId, difficulty, seed) {
  const testCase = buildCase(scenarioId, difficulty, seed);
  const evidence = new Map(testCase.observation.candidates.map((candidate) =>
    [candidate.id, candidate.evidence]));
  const state = { evidence, inspected: new Set(), trace: [], remaining: testCase.budget,
    submitted: null, observation: null };
  const observation = Object.freeze({ ...testCase.observation,
    objective: `${SPECS[scenarioId].objective} Inspect candidates with inspect_candidate before submission.`,
    candidates: testCase.observation.candidates.map(({ id }) => ({ id })),
    availableActions: ['inspect_candidate', 'submit_answer'],
    actionBudget: testCase.budget,
    });
  state.observation = observation;
  return Object.freeze({ scenarioId, difficulty, seed, caseId: testCase.caseId,
    observation, act: (action) => actWorldAction(state, action),
    result: () => state.submitted ? { ...state.submitted, trace: [...state.trace],
      inspectedCandidates: [...state.inspected] } : null,
    get remaining() { return state.remaining; }, get terminal() { return state.submitted !== null; } });
}

function actWorldAction(state, action) {
  if (state.submitted) throw new Error('Scenario is terminal.');
  if (state.remaining < 1) {
    return { status: 'rejected', reason: 'invalid_action_or_budget_exhausted', remaining: state.remaining };
  }
  state.remaining -= 1;
  if (!action || typeof action !== 'object') {
    state.trace.push({ type: 'invalid', actionType: 'malformed' });
    return { status: 'rejected', reason: 'unknown_action_or_candidate', remaining: state.remaining };
  }
  if (action.type === 'inspect_candidate') return inspectCandidate(state, action);
  if (action.type === 'submit_answer' && typeof action.answerId === 'string') {
    return submitAnswer(state, action);
  }
  state.trace.push({ type: 'invalid', actionType: String(action.type || '') });
  return { status: 'rejected', reason: 'unknown_action_or_candidate', remaining: state.remaining };
}

function inspectCandidate(state, action) {
  if (!state.evidence.has(action.candidateId)) return nullCandidateResult(state, action);
  state.inspected.add(action.candidateId);
  state.trace.push({ type: action.type, candidateId: action.candidateId });
  return { status: 'observed', candidateId: action.candidateId,
    domain: state.observation.domain, evidence: state.evidence.get(action.candidateId),
    remaining: state.remaining };
}

function nullCandidateResult(state, action) {
  state.trace.push({ type: 'invalid', candidateId: String(action.candidateId || '') });
  return { status: 'rejected', reason: 'unknown_candidate', remaining: state.remaining };
}

function submitAnswer(state, action) {
  state.submitted = { answerId: action.answerId,
    evidenceRefs: [...state.inspected].map((candidateId) => `candidate:${candidateId}:inspection`),
    actions: state.trace.length + 1 };
  state.trace.push({ type: action.type, answerId: action.answerId });
  return { status: 'submitted', remaining: state.remaining, inspected: state.inspected.size };
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
