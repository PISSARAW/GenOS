'use strict';

function action(proposal, type) {
  const trace = proposal?.actionTrace || proposal?.trace || [];
  return trace.find((entry) => entry.type === type)?.action || null;
}

function checkCuriosity(proposal) {
  const question = action(proposal, 'form_research_question')?.question || '';
  const test = action(proposal, 'test_anomaly_hypothesis');
  const relevant = /sensor|stream|reading|baseline|drift|sample|anomal/i.test(question);
  const testTargetsAnswer = test?.candidateId === proposal?.answerId
    && /compare|repeat|baseline|calibrat|anomal/i.test(test?.method || '');
  const passes = question.includes('?') && question.trim().length >= 20 && relevant && testTargetsAnswer;
  return { passed: passes, metrics: { questionRelevant: relevant,
    questionWellFormed: question.includes('?'), questionLength: question.length, testTargetsAnswer } };
}

function checkAutonomousChain(expected, proposal) {
  const cycles = (proposal?.actionTrace || proposal?.trace || [])
    .filter((entry) => entry.stepId === 'research_cycle');
  const questions = cycles.map((entry) => String(entry.action?.question || '').trim().toLowerCase());
  const unique = new Set(questions.filter(Boolean)).size;
  const minimumDistinct = Math.ceil(expected.evaluation.minimumUsefulCycles * 0.85);
  return { passed: cycles.length >= expected.evaluation.minimumUsefulCycles && unique >= minimumDistinct,
    metrics: { cycles: cycles.length, uniqueQuestions: unique,
      repeatedCycles: cycles.length - unique, minimumDistinctQuestions: minimumDistinct } };
}

function checkFalsifiableHypothesis(expected, proposal) {
  const target = expected.evaluation.predictionsByCandidate?.[proposal?.answerId];
  const hypothesis = action(proposal, 'state_falsifiable_hypothesis');
  const intervention = action(proposal, 'choose_intervention');
  const test = action(proposal, 'run_discriminating_test');
  const discriminates = Boolean(target) && intervention?.candidateId === proposal?.answerId
    && test?.candidateId === proposal?.answerId
    && equalVectors(test?.predictedOutcome, target.predictionsByCause);
  const falsifiable = typeof hypothesis?.falsifier === 'string' && hypothesis.falsifier.trim().length >= 10;
  return { passed: discriminates && falsifiable,
    metrics: { falsifiable, discriminatingPredictions: discriminates,
      repeatability: target?.repeatability ?? null } };
}

function checkCritique(expected, proposal) {
  const target = expected.evaluation.auditByCandidate?.[proposal?.answerId];
  const correction = action(proposal, 'submit_corrected_conclusion');
  const expectedAcceptance = Boolean(target) && target.reportedPasses === target.independentRerunPasses
    && target.fixtureIntegrity && target.sourceTraceComplete;
  const correctCorrection = correction?.candidateId === proposal?.answerId
    && correction?.acceptReportedResult === expectedAcceptance;
  return { passed: correctCorrection,
    metrics: { expectedAcceptance, correctionVerified: correctCorrection } };
}

function checkBeliefRevision(expected, proposal) {
  const target = expected.evaluation.posteriorsByCandidate?.[proposal?.answerId];
  const update = action(proposal, 'update_belief_probability');
  const error = target ? Math.abs(update?.probability - target.posterior) : Infinity;
  return { passed: update?.candidateId === proposal?.answerId && error <= 0.05,
    metrics: { posteriorPredictionError: error, revisedBelief: update?.probability ?? null } };
}

function checkRecovery(expected, proposal) {
  const target = expected.evaluation.checkpointsByCandidate?.[proposal?.answerId];
  const checksum = action(proposal, 'verify_checkpoint_integrity');
  const resume = action(proposal, 'resume_investigation');
  const expectedValid = Boolean(target) && target.checksumValid && target.decisionLogComplete
    && target.restoredItems === target.expectedItems && target.duplicateItems === 0;
  const correct = checksum?.candidateId === proposal?.answerId
    && checksum.checksumValid === target?.checksumValid
    && resume?.candidateId === proposal?.answerId
    && resume.restoredItems === target?.restoredItems
    && resume.resume === expectedValid;
  return { passed: correct,
    metrics: { checkpointValid: expectedValid, recoveryDecisionCorrect: correct,
      duplicates: target?.duplicateItems ?? null } };
}

function checkStopping(expected, proposal) {
  const target = expected.evaluation.valueByCandidate?.[proposal?.answerId];
  const estimate = action(proposal, 'estimate_information_value');
  const decision = action(proposal, 'compare_expected_value_and_cost');
  const error = target ? Math.abs(estimate?.expectedValue - target.expectedValue) : Infinity;
  const expectedContinue = Boolean(target) && target.expectedValue > 0;
  const correctDecision = decision?.candidateId === proposal?.answerId
    && decision.continue === expectedContinue;
  return { passed: estimate?.candidateId === proposal?.answerId && error <= 5 && correctDecision,
    metrics: { expectedNetValue: target?.expectedValue ?? null,
      predictionError: error, continuationDecisionCorrect: correctDecision } };
}

function checkTransfer(expected, proposal) {
  const target = expected.evaluation.metricsByCandidate?.[proposal?.answerId];
  const transfer = action(proposal, 'measure_heldout_transfer');
  const retention = action(proposal, 'check_prior_task_retention');
  const hasTarget = Boolean(target);
  const transferError = hasTarget ? Math.abs(transfer?.prediction - target.heldOutAccuracy) : Infinity;
  const retentionError = hasTarget ? Math.abs(retention?.prediction - target.oldTaskAccuracyAfter) : Infinity;
  const forgetting = hasTarget ? target.oldTaskAccuracyBefore - target.oldTaskAccuracyAfter : Infinity;
  const accurateTransfer = transfer?.candidateId === proposal?.answerId && transferError <= 15;
  const accurateRetention = retention?.candidateId === proposal?.answerId && retentionError <= 15;
  const noSevereForgetting = forgetting <= 5;
  return { passed: hasTarget && accurateTransfer && accurateRetention && noSevereForgetting,
    metrics: { transferPredictionError: transferError, retentionPredictionError: retentionError,
      observedForgetting: forgetting, accurateTransfer, accurateRetention, noSevereForgetting } };
}

function equalVectors(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function checkDiscovery(expected, proposal) {
  const answer = proposal?.answerId;
  const target = expected.evaluation.predictionsByCandidate?.[answer];
  const rule = action(proposal, 'state_latent_rule')?.rule || '';
  const prediction = action(proposal, 'predict_fresh_state');
  const verification = action(proposal, 'verify_fresh_prediction');
  const correct = Boolean(target) && prediction?.candidateId === answer
    && verification?.candidateId === answer
    && equalVectors(prediction?.prediction, target)
    && equalVectors(verification?.prediction, target);
  const accuracy = Boolean(target) && Array.isArray(prediction?.prediction)
    ? prediction.prediction.filter((value, index) => value === target[index]).length / target.length : 0;
  return { passed: rule.trim().length >= 15 && correct,
    metrics: { ruleLength: rule.length, freshPredictionAccuracy: accuracy, reproducedPrediction: correct } };
}

function checkPatch(expected, proposal) {
  const target = expected.evaluation.patchesByCandidate?.[proposal?.answerId];
  const decision = action(proposal, 'accept_or_rollback_patch');
  const safe = Boolean(target) && target.patchedHeldOut > target.baselineHeldOut
    && target.oldSuiteFailuresAdded === 0 && target.sandboxRollbackPassed;
  const correct = decision?.candidateId === proposal?.answerId && decision.acceptPatch === safe;
  return { passed: correct,
    metrics: { patchSafe: safe, acceptanceDecisionCorrect: correct,
      heldOutGain: target ? target.patchedHeldOut - target.baselineHeldOut : null } };
}

function checkCollective(expected, proposal) {
  const target = expected.evaluation.synthesesByCandidate?.[proposal?.answerId];
  const collection = action(proposal, 'collect_independent_sources');
  const synthesis = action(proposal, 'synthesize_supported_claims');
  const resolution = action(proposal, 'resolve_source_conflict');
  const sourcesPresent = sourceCoverage(target, collection);
  const claimCountValid = validClaimCount(target, synthesis);
  const expectedResolution = Boolean(target?.citationsVerified && target.unresolvedConflicts === 0);
  const correct = Boolean(target) && sourcesPresent && claimCountValid && verifiedClaims(target, synthesis)
    && conflictResolution(resolution, proposal, expectedResolution);
  return { passed: correct,
    metrics: { supportedClaimCount: synthesis?.supportedClaimCount ?? null,
      claimCountValid, sourcesPresent, citationsVerified: target?.citationsVerified ?? false,
      sourceCount: target?.sourceCount ?? null } };
}

function sourceCoverage(target, collection) {
  return Boolean(target) && target.sourceIds.every((sourceId) =>
    String(collection?.sourceIds || '').includes(sourceId));
}

function validClaimCount(target, synthesis) {
  return Number.isInteger(synthesis?.supportedClaimCount) && synthesis.supportedClaimCount >= 0
    && synthesis.supportedClaimCount <= (target?.supportedClaims ?? -1);
}

function verifiedClaims(target, synthesis) {
  return Boolean(target?.citationsVerified) || synthesis?.supportedClaimCount === 0;
}

function conflictResolution(resolution, proposal, expected) {
  return resolution?.candidateId === proposal?.answerId && resolution.conflictsResolved === expected;
}

function checkLongHorizon(expected, proposal) {
  const cycles = (proposal?.actionTrace || proposal?.trace || [])
    .filter((entry) => entry.stepId === 'research_cycle');
  const uniqueQuestions = new Set(cycles.map((entry) =>
    String(entry.action?.question || '').trim().toLowerCase()).filter(Boolean)).size;
  const uniquePhases = new Set(cycles.map((entry) =>
    String(entry.action?.phase || '').trim().toLowerCase()).filter(Boolean)).size;
  const minUnique = Math.ceil(expected.evaluation.minimumUsefulCycles * 0.85);
  const phaseCoverage = uniquePhases >= expected.evaluation.minimumDistinctPhases;
  const passed = cycles.length >= expected.evaluation.minimumUsefulCycles
    && uniqueQuestions >= minUnique && phaseCoverage;
  return { passed, metrics: { cycles: cycles.length, uniqueQuestions,
    repeatedCycles: cycles.length - uniqueQuestions, uniquePhases, phaseCoverage } };
}

function evaluateDomain(expected, proposal) {
  const evaluators = { 'ETT-01': checkCuriosity,
    'ETT-02': (item) => checkAutonomousChain(expected, item),
    'ETT-03': (item) => checkFalsifiableHypothesis(expected, item),
    'ETT-04': (item) => checkTransfer(expected, item),
    'ETT-05': (item) => checkCritique(expected, item),
    'ETT-06': (item) => checkBeliefRevision(expected, item),
    'ETT-07': (item) => checkRecovery(expected, item),
    'ETT-08': (item) => checkStopping(expected, item),
    'ETT-09': (item) => checkDiscovery(expected, item),
    'ETT-10': (item) => checkPatch(expected, item),
    'ETT-11': (item) => checkCollective(expected, item),
    'ETT-12': (item) => checkLongHorizon(expected, item) };
  const evaluator = evaluators[expected.evaluation?.scenarioId];
  return evaluator ? evaluator(proposal) : { passed: true, metrics: {} };
}

module.exports = { evaluateDomain };
