'use strict';

const { appendEvent, listEvents } = require('./gvxDevelopmentLedger');
const { assessSomaticCandidate } = require('./gvxSomaticAssessment');
const { rollbackSomaticApplication } = require('./gvxSomaticApplication');

async function monitorSomaticApplication(db, input) {
  validateMonitorInput(input);
  const prior = await findObservation(db, input);
  validateReplay(prior, input);
  const observation = prior?.payload.observation || await input.runtime.observe(input.applicationId);
  validateObservation(observation);
  const assessment = prior?.payload.assessment || assessSomaticCandidate({
    baseline: observation.baseline, candidate: observation.candidate,
    evidenceRefs: observation.evidenceRefs, profile: input.profile
  });
  if (!prior) await recordObservation({ db, input, observation, assessment });
  if (assessment.status !== 'reject') return { assessment, rollback: null };
  const rollback = await rollbackSomaticApplication(db, input);
  return { assessment, rollback };
}

function validateReplay(prior, input) {
  if (prior && (prior.payload.applicationId !== input.applicationId
      || prior.parentHash !== input.parentHash || prior.candidateHash !== input.candidateHash)) {
    throw Object.assign(new Error('GVX observation identity was reused.'), { code: 'GVX_OBSERVATION_CONFLICT' });
  }
}

async function recordObservation(context) {
  const { db, input, observation, assessment } = context;
  await appendEvent(db, {
    ...input.scope, entityId: input.entityId, type: 'decision_recorded',
    parentHash: input.parentHash, candidateHash: input.candidateHash,
    payload: { kind: 'somatic_observation', observationId: input.observationId,
      applicationId: input.applicationId, window: observation.window, assessment }
  });
}

async function findObservation(db, input) {
  const events = await listEvents(db, { ...input.scope, entityId: input.entityId });
  return events.find((event) => event.type === 'decision_recorded'
    && event.payload.kind === 'somatic_observation'
    && event.payload.observationId === input.observationId) || null;
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
