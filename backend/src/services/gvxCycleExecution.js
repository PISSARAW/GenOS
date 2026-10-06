'use strict';

const stages = require('./gvxCycleJournal');
const verification = require('./gvxAssessmentVerification');
const { hash, error } = require('./gvxContracts');

async function execute(context) {
  const { db, input, signal, action } = context;
  const fingerprint = await stages.runStage(context, 'controls', async () => input.controlFingerprint);
  if (fingerprint !== input.controlFingerprint) throw error('GVX_CYCLE_CONTROLS_CHANGED');
  const goal = await stages.runStage(context, 'hypothesis', (operationId) => input.hypothesisPlanner({ signal, action, operationId }));
  const proposal = await stages.runStage(context, 'proposal', (operationId) => require('./gvxMutationProposer').propose({
    db, scope: signal.scope, entityId: signal.entityId, goal, context: { signal, action },
    selfTwinPredictor: input.selfTwinPredictor, operationId }));
  const experimentInput = await input.experimentInput({ signal, candidate: proposal.candidate,
    operationId: `gvx-cycle:${context.cycleId}:experiment` });
  const experiment = await stages.runStage(context, 'experiment', () => require('./gvxExperimentalNursery').run({ ...experimentInput, db }));
  if (experiment.assessment.status !== 'ready_for_independent_review') {
    return { status: 'experiment_inconclusive', action, proposal, experiment, promotionAllowed: false };
  }
  const assessmentEvent = await stages.runStage(context, 'assessment', async (operationId) => {
    const assessmentInput = await input.assessmentInput({ signal, candidate: proposal.candidate, experiment, operationId });
    return require('./gvxSomaticAssessment').recordSomaticAssessment(db, { ...assessmentInput, eventId: operationId });
  });
  const assessment = assessmentEvent.payload.assessment;
  const state = { ...context, proposal, experiment, experimentInput, assessmentEvent, assessment };
  const checked = await stages.runStage(context, 'assessment-verification', () => verification.verifyAssessment({
    verifierRegistry: experimentInput.verifierRegistry, assessmentInput: assessmentEvent.payload.assessmentInput,
    assessment, artifactRef: `gvx-assessment:${assessmentEvent.id}`, verificationReceipts: experimentReceipts(experiment) }));
  if (!checked.verified) return result(state, 'assessment_verification_failed');
  if (input.predictionFeedback) await stages.runStage(context, 'prediction-feedback', () => input.predictionFeedback(state));
  if (assessment.status !== 'recommend_somatic_trial') return result(state, 'assessment_complete');
  return applyAndMonitor({ ...state, checked });
}

async function applyAndMonitor(context) {
  const { db, input, signal, proposal, assessmentEvent } = context;
  const applicationInput = await input.applicationInput({ signal, candidate: proposal.candidate, assessmentEvent,
    operationId: `gvx-cycle:${context.cycleId}:application` });
  const application = await stages.runStage(context, 'application', () =>
    require('./gvxSomaticApplication').applySomaticCandidate(db, applicationInput));
  const monitorInput = await input.monitorInput({ signal, candidate: proposal.candidate, application,
    operationId: `gvx-cycle:${context.cycleId}:monitoring` });
  if (!monitorInput.requireIndependentEvidence || !monitorInput.verifierRegistry?.remote) {
    throw error('GVX_INDEPENDENT_MONITOR_REQUIRED');
  }
  const monitoring = await stages.runStage({ ...context, isComplete: (_, value) => !['monitoring', 'rollback_failed'].includes(value.maturity) },
    'monitoring', () => require('./gvxLongitudinalMonitor').monitor(db, monitorInput));
  const state = { ...context, application, monitoring };
  if (monitoring.maturity !== 'mature_somatic_eligible') return result(state, monitoring.maturity);
  const binding = { ...context.assessmentEvent.payload.assessmentInput.binding,
    applicationId: application.payload.applicationId };
  const longitudinal = await stages.runStage(context, 'monitoring-verification', () => verification.verifyLongitudinal({
    verifierRegistry: context.experimentInput.verifierRegistry, binding, monitoring,
    minimumStableWindows: monitorInput.minimumStableWindows }));
  if (!longitudinal.verified) return result(state, 'monitoring_verification_failed');
  const receipt = await stages.runStage(context, 'receipt', (operationId) => issueReceipt({ ...state, longitudinal, operationId }));
  const plasticityCredit = await stages.runStage(context, 'credit', () =>
    require('./developmentalBridge/gvxToAgowReceiptAdapter').creditVerifiedReceipt(db, { ...receipt, db }));
  return { ...result(state, monitoring.maturity), plasticityCredit };
}

async function issueReceipt(context) {
  const request = await context.input.developmentalReceiptInput({ signal: context.signal, candidate: context.proposal.candidate,
    experiment: context.experiment, assessmentEvent: context.assessmentEvent, monitoring: context.monitoring,
    operationId: context.operationId });
  const { db, signedReceipt: ignored, ...claim } = request;
  const additions = [context.checked.evidenceRef, context.longitudinal.evidenceRef];
  claim.evidenceRefs = [...new Map([...(claim.evidenceRefs || []), ...additions].map((item) => [hash(item), item])).values()];
  const signedReceipt = await require('./gvxRemoteVerifierClient').issueDevelopmentReceipt({
    ...context.experimentInput.verifierRegistry.remote, claim, verificationReceipts: [
      ...experimentReceipts(context.experiment), context.checked.signedReceipt, context.longitudinal.signedReceipt ] });
  return { ...claim, signedReceipt };
}

function experimentReceipts(experiment) {
  return (experiment.outcomes || []).flatMap((outcome) => outcome.evidence || []).map((item) => item.signedReceipt).filter(Boolean);
}

function result(context, status) {
  return { status, action: context.action, proposal: context.proposal, experiment: context.experiment,
    assessment: context.assessment, application: context.application, monitoring: context.monitoring, promotionAllowed: false };
}

module.exports = { execute, experimentReceipts };
