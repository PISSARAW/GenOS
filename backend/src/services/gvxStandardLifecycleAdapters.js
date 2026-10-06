'use strict';

const path = require('node:path');
const { hash, error, sameScope } = require('./gvxContracts');
const remoteClient = require('./gvxRemoteVerifierClient');
const experiments = require('./gvxStandardExperiment');
const ledger = require('./gvxDevelopmentLedger');

async function createAdapters({ db, signal }) {
  const remote = require('./gvxRemoteConfiguration').remoteConfiguration();
  const profileId = process.env.GENOS_GVX_RUNTIME_PROFILE_ID;
  if (!profileId) throw error('GVX_RUNTIME_PROFILE_NOT_CONFIGURED');
  const scope = { ...signal.scope, entityId: signal.entityId };
  const description = await remoteClient.signedRequest({ ...remote, endpoint: '/v1/profile', payload: { profileId, scope } });
  const profile = description.profile;
  if (!sameScope(profile?.scope, scope) || profile.agentId !== (signal.agentId || signal.entityId)) {
    throw error('GVX_RUNTIME_PROFILE_SCOPE_MISMATCH');
  }
  const verifierRegistry = require('./gvxVerifierRegistry').fromRemoteControlPlane([
    'gvx-execution-metrics-v1', 'gvx-somatic-assessment-v1', 'gvx-longitudinal-assessment-v1'
  ], { ...remote, trustedVerifiers: description.verifiers });
  const store = await require('./gvxArtifactStore').createStore(process.env.GENOS_GVX_ARTIFACT_ROOT
    || path.join(process.cwd(), '.genos', 'gvx', 'artifacts'));
  const context = { db, signal, remote, profile, scope, verifierRegistry, store };
  return { controlFingerprint: profile.profileHash,
    hypothesisPlanner: (input) => hypothesis(context, input),
    selfTwinPredictor: (input) => predict(context, input),
    predictionFeedback: (input) => feedback(context, input),
    experimentInput: (input) => experiments.experimentInput(context, input),
    assessmentInput: ({ experiment }) => experiments.comparison(context, experiment.outcomes),
    developmentalReceiptInput: (input) => receiptInput(context, input),
    applicationInput: (input) => applicationInput(context, input),
    monitorInput: (input) => monitorInput(context, input) };
}

function hypothesis(context, input) {
  const { profile, scope } = context;
  return { target: 'agow', intervention: profile.candidatePolicy, transformation: {
    candidateId: hash({ profile: profile.profileHash, source: context.signal.sourceEventId }),
    title: `Evaluate pinned runtime policy ${profile.id}`, plasticity: 'P4', destination: 'soma',
    parentHash: profile.parentHash, candidateHash: profile.candidateHash,
    change: { kind: 'agow_mechanism_policy', policy: profile.candidatePolicy },
    sourceExperienceIds: [...new Set([...input.action.payload.sourceEventIds, context.signal.sourceEventId])], scope, entityId: scope.entityId,
    hypothesis: { statement: 'A declared AGOW policy change can improve the paired task measurements without safety regression.',
      prediction: JSON.stringify(profile.predictedMetrics), falsificationCriteria: 'Reject regression or independently unverified measurements.',
      protocol: `paired:${profile.id}` }, maxCost: profile.maxCost, maxSeconds: profile.maxSeconds,
    verifierProfile: profile.id, rollbackPlan: 'Restore the exact prior AGOW policy under external authorization.' } };
}

async function predict(context, input) {
  const id = `gvx-prediction:${hash({ profile: context.profile.profileHash, source: context.signal.sourceEventId })}`;
  const prior = await ledger.getEvent(context.db, id, context.scope);
  if (prior) return prior.payload.prediction;
  const prediction = require('./selfTwin/selfTwinService').makePrediction({ ...input,
    effects: Object.entries(context.profile.predictedMetrics).map(([metric, expected]) => ({ component: 'agow', metric, expected })),
    evidenceRefs: context.signal.evidenceRefs });
  prediction.predictionId = id;
  await ledger.appendEvent(context.db, { id, ...context.scope, type: 'evidence_attached',
    payload: { kind: 'self_twin_prediction', ...prediction, prediction } });
  return prediction;
}

function receiptInput(context, input) {
  const assessmentInput = input.assessmentEvent.payload.assessmentInput;
  const measured = require('./gvxReceiptClaimPolicy').measurementClaim(context.profile, assessmentInput);
  return { db: context.db, scope: context.signal.scope, entityId: context.scope.entityId,
    agentId: context.profile.agentId, receiptId: input.operationId, pathwayId: context.profile.pathwayId,
    contextHash: assessmentInput.binding.contextHash, success: true, ...measured,
    evidenceRefs: assessmentInput.evidenceRefs };
}

function runtime(context) {
  return require('./gvxRuntimePolicyAdapter').createRuntime({ db: context.db,
    agentId: context.profile.agentId, scope: context.scope });
}

function authorization(context) {
  return { authorize: async (input) => {
    const receipt = await remoteClient.signedRequest({ ...context.remote, endpoint: '/v1/authorize',
      payload: { ...input, profileId: context.profile.id, scope: context.scope } });
    if (receipt.schema !== 'genos.gvx.authorization/v1' || receipt.action !== input.action
        || receipt.parentHash !== input.parentHash || receipt.candidateHash !== input.candidateHash
        || !sameScope(receipt.scope, context.scope)) throw error('GVX_AUTHORIZATION_RECEIPT_MISMATCH');
    return receipt;
  } };
}

function applicationInput(context, input) {
  const applicationId = hash({ profile: context.profile.profileHash, candidateId: input.candidate.candidateId });
  return { scope: context.signal.scope, entityId: context.scope.entityId, applicationId,
    parentHash: context.profile.parentHash, candidateHash: context.profile.candidateHash,
    authorization: authorization(context), runtime: runtime(context), change: {
      applicationId, parentPolicy: context.profile.parentPolicy, candidatePolicy: context.profile.candidatePolicy } };
}

function monitorInput(context, input) {
  const applicationId = input.application.payload.applicationId;
  const windows = context.profile.monitorConditions.map((condition) => ({
    condition, observationId: hash({ applicationId, condition }),
    contextHash: context.profile.conditions[condition].contextHash }));
  const policyRuntime = runtime(context);
  return { ...applicationInput(context, input), applicationId, windows, minimumStableWindows: windows.length,
    profile: context.profile.assessmentProfile, verifierRegistry: context.verifierRegistry,
    requireIndependentEvidence: true, runtime: { ...policyRuntime, observe: async (_, window) => {
      if (await policyRuntime.currentHash() !== context.profile.candidateHash) throw error('GVX_MONITOR_RUNTIME_CHANGED');
      const selected = windows.find((item) => item.observationId === window.observationId);
      if (!selected) throw error('GVX_MONITOR_WINDOW_UNREGISTERED');
      const outcomes = [];
      for (const arm of ['baseline', 'candidate']) {
        const result = await experiments.verifiedEvaluation(context, { condition: selected.condition,
          arm, applicationId, observationId: window.observationId, operationId: `${applicationId}:${window.observationId}:${arm}` });
        outcomes.push({ ...result, role: arm });
      }
      const comparison = experiments.comparison(context, outcomes, { contextHash: selected.contextHash,
        applicationId, observationId: window.observationId });
      return { ...comparison, verificationReceipts: outcomes.flatMap((item) => item.evidence.map((proof) => proof.signedReceipt)),
        window: { startedAt: outcomes[0].measurement.startedAt, endedAt: outcomes[1].measurement.endedAt } };
    } } };
}

module.exports = { createAdapters };

async function feedback(context, input) {
  const id='gvx-feedback:'+hash({profile:context.profile.profileHash,source:context.signal.sourceEventId});
  const prior=await ledger.getEvent(context.db,id,context.scope);
  if(prior) return prior.payload;
  const prediction=input.proposal.predictedImpact;
  const metrics=input.assessmentEvent.payload.assessmentInput.candidate.metrics;
  const observations=context.profile.metrics.map(metric=>({metric,predicted:context.profile.predictedMetrics[metric],observed:metrics[metric].mean}));
  const discrepancy=require('./selfTwin/selfTwinService').compare(prediction,observations);
  const payload={kind:'self_twin_observation',observationId:id,predictionId:prediction.predictionId,
    observations,discrepancy,evidenceRefs:input.assessmentEvent.payload.assessmentInput.evidenceRefs,
    createdAt:new Date().toISOString()};
  await ledger.appendEvent(context.db,{id,...context.scope,type:'evidence_attached',payload});
  return payload;
}
