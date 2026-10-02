'use strict';

const crypto = require('node:crypto');
const { appendEvent, getEvent, listEvents } = require('./gvxDevelopmentLedger');
const { recommendAction } = require('./developmentalBridge');

function signalKey(input) {
  const parts = [input.scope.organizationId, input.scope.projectId, input.entityId,
    input.signalType, input.context?.pathwayId || 'global'];
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

function matchingSignals(events, input) {
  return events.filter((event) => event.payload.kind === 'developmental_signal'
    && event.payload.signalType === input.signalType
    && (event.payload.context?.pathwayId || 'global') === (input.context?.pathwayId || 'global'));
}

function uniqueSources(events) {
  return [...new Set(events.map((event) => event.payload.sourceEventId).filter(Boolean))];
}

async function processSignal(db, input) {
  validateInput(input);
  const scope = { ...input.scope, entityId: input.entityId };
  const events = await listEvents(db, scope);
  const matches = matchingSignals(events, input);
  const sourceEventIds = uniqueSources(matches);
  const action = recommendAction(input.signalType, sourceEventIds.length);
  const key = signalKey(input);
  const id = `gvx-development-action:${key}:${input.sourceEventId}`;
  const existing = await getEvent(db, id, scope);
  if (existing) return { ...existing, replayed: true };
  return appendEvent(db, {
    id, ...input.scope, entityId: input.entityId, type: 'decision_recorded',
    payload: { kind: 'development_controller_action', status: 'proposed', action,
      signalType: input.signalType, signalCount: sourceEventIds.length,
      sourceEventIds, evidenceRefs: [...new Set(input.evidenceRefs)],
      epistemicStatus: 'reported', promotionAllowed: false }
  });
}

async function runCycle(db, input) {
  const signal = input.signal;
  const action = await processSignal(db, signal);
  if (!['create_hypothesis', 'schedule_experiment'].includes(action.payload.action)) {
    return { status: 'accumulating_evidence', action, promotionAllowed: false };
  }
  validateCycleAdapters(input);
  const goal = await input.hypothesisPlanner({ signal, action });
  const proposal = await require('./gvxMutationProposer').propose({ db,
    scope: signal.scope, entityId: signal.entityId, goal,
    context: { signal, action }, selfTwinPredictor: input.selfTwinPredictor });
  const experimentInput = await input.experimentInput({ signal, candidate: proposal.candidate });
  const experiment = await require('./gvxExperimentalNursery').run({ db, ...experimentInput });
  const assessmentInput = await input.assessmentInput({ signal, candidate: proposal.candidate, experiment });
  const assessmentEvent = await require('./gvxSomaticAssessment').recordSomaticAssessment(db, assessmentInput);
  const assessment = assessmentEvent.payload.assessment;
  if (assessment.status !== 'recommend_somatic_trial') {
    return { status: 'assessment_complete', action, proposal, experiment, assessment, promotionAllowed: false };
  }
  const assessmentVerification = await verifySomaticAssessment({ db, assessmentEvent,
    verifierRegistry: experimentInput.verifierRegistry, verificationReceipts: experimentReceipts(experiment) });
  if (!assessmentVerification.verified) {
    return { status: 'assessment_verification_failed', action, proposal, experiment,
      assessment, promotionAllowed: false };
  }
  const receiptInput = await input.developmentalReceiptInput({
    signal, candidate: proposal.candidate, experiment, assessmentEvent
  });
  const verifierRemote = experimentInput.verifierRegistry?.remote;
  if (verifierRemote) {
    receiptInput.evidenceRefs = mergeEvidenceRefs(receiptInput.evidenceRefs,
      [assessmentVerification.evidenceRef]);
    const verificationReceipts = [...experimentReceipts(experiment), assessmentVerification.signedReceipt];
    receiptInput.signedReceipt = await require('./gvxRemoteVerifierClient').issueDevelopmentReceipt({
      ...verifierRemote, claim: receiptInput, verificationReceipts
    });
  }
  const plasticityCredit = await require('./developmentalBridge/gvxToAgowReceiptAdapter')
    .creditVerifiedReceipt(db, receiptInput);
  const applicationInput = await input.applicationInput({ signal, candidate: proposal.candidate, assessmentEvent });
  const application = await require('./gvxSomaticApplication').applySomaticCandidate(db, applicationInput);
  const monitorInput = await input.monitorInput({ signal, candidate: proposal.candidate, application });
  const monitoring = await require('./gvxLongitudinalMonitor').monitor(db, monitorInput);
  return { status: monitoring.maturity, action, proposal, experiment, assessment,
    plasticityCredit, application, monitoring, promotionAllowed: false };
}

async function verifySomaticAssessment(options) {
  if (!options.verifierRegistry?.remote) throw Object.assign(new Error('GVX remote verifier is required for somatic credit.'), {
    code: 'GVX_REMOTE_VERIFIER_REQUIRED'
  });
  const payload = options.assessmentEvent.payload;
  const artifact = Buffer.from(JSON.stringify({ schema: 'genos.gvx.somatic-assessment/v1',
    assessmentInput: payload.assessmentInput, assessment: payload.assessment }));
  const artifactHash = require('./gvxVerifierRegistry').digest(artifact);
  const evidenceRef = { artifactHash, verifierId: 'gvx-somatic-assessment-v1' };
  const signedReceipt = await require('./gvxVerifierRegistry').verifyEvidence({
    registry: options.verifierRegistry,
    artifactReader: async () => artifact,
    evidence: { artifactRef: `gvx-assessment:${options.assessmentEvent.id}`, ...evidenceRef,
      supportingReceipts: options.verificationReceipts },
    requirement: 'gvx-somatic-assessment'
  });
  return { verified: signedReceipt.verified === true, evidenceRef,
    signedReceipt: signedReceipt.signedReceipt };
}

function experimentReceipts(experiment) {
  return (experiment.outcomes || []).flatMap((outcome) => outcome.evidence || [])
    .map((item) => item.signedReceipt).filter(Boolean);
}

function mergeEvidenceRefs(current, additions) {
  const refs = [...(current || []), ...additions];
  return [...new Map(refs.map((item) => [`${item.artifactHash}\0${item.verifierId}`, item])).values()];
}

function validateCycleAdapters(input) {
  const required = ['hypothesisPlanner', 'experimentInput', 'assessmentInput',
    'developmentalReceiptInput', 'applicationInput', 'monitorInput'];
  if (required.some((key) => typeof input[key] !== 'function')
      || typeof input.selfTwinPredictor !== 'function') {
    throw Object.assign(new Error('GVX lifecycle control-plane adapters are required.'), {
      code: 'GVX_CONTROLLER_ADAPTERS_REQUIRED'
    });
  }
}

function validateInput(input) {
  if (!input?.scope?.organizationId || !input.scope.projectId || !input.entityId
      || !input.sourceEventId || !input.signalType || !Array.isArray(input.evidenceRefs)
      || input.evidenceRefs.length === 0) {
    throw Object.assign(new Error('GVX controller requires a scoped, evidence-linked signal.'), {
      code: 'GVX_CONTROLLER_SIGNAL_INVALID'
    });
  }
}

module.exports = { processSignal, runCycle, matchingSignals, uniqueSources };
