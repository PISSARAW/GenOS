'use strict';

const { appendEvent, getEvent } = require('./gvxDevelopmentLedger');
const { assessSomaticCandidate } = require('./gvxSomaticAssessment');
const { rollbackSomaticApplication } = require('./gvxSomaticApplication');

async function monitorSomaticApplication(db, input) {
  validateMonitorInput(input);
  const prior = await findObservation(db, input);
  validateReplay(prior, input);
  const observation = prior?.payload.observation || await input.runtime.observe(input.applicationId,
    { observationId: input.observationId, contextHash: input.contextHash });
  validateObservation(observation);
  const assessment = prior?.payload.assessment || assessSomaticCandidate({
    baseline: observation.baseline, candidate: observation.candidate,
    evidenceRefs: observation.evidenceRefs, profile: input.profile
  });
  const verification = prior?.payload.verification || await verifyObservation(input, observation, assessment);
  if (!prior) await recordObservation({ db, input, observation, assessment, verification });
  const result = { assessment, verification, observationId: input.observationId, contextHash: input.contextHash };
  if (assessment.status !== 'reject') return { ...result, rollback: null };
  const rollback = await rollbackSomaticApplication(db, input);
  return { ...result, rollback };
}

async function verifyObservation(input, observation, assessment) {
  if (!input.requireIndependentEvidence) return null;
  const binding = observation.binding;
  const { sameScope, error } = require('./gvxContracts');
  if (!sameScope(binding?.scope, { ...input.scope, entityId: input.entityId })
      || binding.applicationId !== input.applicationId || binding.observationId !== input.observationId
      || binding.contextHash !== input.contextHash) throw error('GVX_OBSERVATION_BINDING_INVALID');
  const verification = await require('./gvxAssessmentVerification').verifyAssessment({
    verifierRegistry: input.verifierRegistry, assessment, assessmentInput: observation,
    artifactRef: `gvx-observation:${input.observationId}`, verificationReceipts: observation.verificationReceipts });
  if (!verification.verified) throw error('GVX_OBSERVATION_UNVERIFIED');
  return verification;
}

function validateReplay(prior, input) {
  if (prior && (prior.payload.applicationId !== input.applicationId
      || prior.parentHash !== input.parentHash || prior.candidateHash !== input.candidateHash)) {
    throw Object.assign(new Error('GVX observation identity was reused.'), { code: 'GVX_OBSERVATION_CONFLICT' });
  }
  if (prior && input.requireIndependentEvidence
      && prior.payload.observation?.binding?.contextHash !== input.contextHash) {
    throw Object.assign(new Error('GVX observation context changed.'), { code: 'GVX_OBSERVATION_CONFLICT' });
  }
}

async function recordObservation(context) {
  const { db, input, observation, assessment, verification } = context;
  await appendEvent(db, {
    id: `gvx-observation:${input.observationId}`,
    ...input.scope, entityId: input.entityId, type: 'decision_recorded',
    parentHash: input.parentHash, candidateHash: input.candidateHash,
    payload: { kind: 'somatic_observation', observationId: input.observationId,
      applicationId: input.applicationId, window: observation.window, observation, assessment, verification }
  });
}

async function findObservation(db, input) {
  return getEvent(db, `gvx-observation:${input.observationId}`,
    { ...input.scope, entityId: input.entityId });
}

function validateMonitorInput(input) {
  if (!validMonitorIdentity(input) || !validMonitorAdapters(input)) {
    throw Object.assign(new Error('GVX somatic monitoring context is incomplete.'), { code: 'GVX_MONITOR_INVALID' });
  }
}

function validMonitorIdentity(input) {
  return Boolean(input && input.scope && input.entityId && input.applicationId && input.observationId
    && input.profile && /^[a-f0-9]{64}$/.test(input.parentHash || '')
    && /^[a-f0-9]{64}$/.test(input.candidateHash || ''));
}

function validMonitorAdapters(input) {
  return Boolean(input.runtime && typeof input.runtime.observe === 'function'
    && typeof input.runtime.apply === 'function' && typeof input.runtime.rollback === 'function'
    && input.authorization && typeof input.authorization.authorize === 'function');
}

function validateObservation(observation) {
  const start = Date.parse(observation?.window?.startedAt || '');
  const end = Date.parse(observation?.window?.endedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw Object.assign(new Error('GVX observation window is invalid.'), { code: 'GVX_OBSERVATION_WINDOW_INVALID' });
  }
}

module.exports = { monitorSomaticApplication };
