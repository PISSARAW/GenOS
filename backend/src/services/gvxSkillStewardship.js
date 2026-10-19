'use strict';

const { appendEvent, getEvent } = require('./gvxDevelopmentLedger');
const { error, sameScope } = require('./gvxContracts');

const HASH = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

async function registerSkillResponsibility(db, input) {
  validateRegistration(input);
  const allowed = await input.authority.isAllowed({
    action: 'register_responsibility_skill', scope: input.scope,
    responsibilityId: input.responsibility.responsibilityId, skillId: input.skill.skillId
  });
  if (allowed !== true) throw error('GVX_SKILL_RESPONSIBILITY_DENIED');
  const payload = registrationPayload(input);
  const event = await appendEvent(db, {
    id: input.registrationId, ...input.scope, type: 'evidence_attached',
    candidateHash: input.skill.artifactHash, payload
  });
  return { schema: 'genos.gvx.skill-responsibility-registration/v1',
    status: 'registered_for_observation', automaticPromotion: false,
    eventId: event.id, responsibility: payload.responsibility, skill: payload.skill };
}

function registrationPayload(input) {
  return {
    kind: 'responsibility_skill_registration',
    responsibility: { ...input.responsibility },
    skill: { ...input.skill, sourceExperienceIds: [...new Set(input.skill.sourceExperienceIds)].sort() },
    policy: { automaticPromotion: false, adoption: 'external_review_only' }
  };
}

function validateRegistration(input) {
  if (!input || !validScope(input.scope) || !IDENTIFIER.test(input.registrationId || '')) {
    throw error('GVX_SKILL_RESPONSIBILITY_INVALID');
  }
  if (!validResponsibility(input.responsibility) || !validSkill(input.skill) || !validAuthority(input.authority)) {
    throw error('GVX_SKILL_RESPONSIBILITY_INVALID');
  }
}

function validScope(scope) {
  return Boolean(scope?.organizationId && scope?.projectId && scope?.entityId);
}

function validResponsibility(value) {
  return Boolean(IDENTIFIER.test(value?.responsibilityId || '') && IDENTIFIER.test(value?.ownerId || '')
    && nonEmpty(value.objective) && IDENTIFIER.test(value.contextId || '')
    && nonEmpty(value.metricId) && ['higher', 'lower'].includes(value.direction));
}

function validSkill(value) {
  return validSkillIdentity(value) && validVersionLineage(value) && validSkillProvenance(value);
}

function validSkillIdentity(value) {
  return Boolean(IDENTIFIER.test(value?.skillId || '') && Number.isInteger(value.version)
    && value.version > 0 && HASH.test(value.artifactHash || ''));
}

function validVersionLineage(value) {
  if (value.version === 1) return value.parentVersion === null;
  return value.parentVersion === value.version - 1;
}

function validSkillProvenance(value) {
  return Boolean(IDENTIFIER.test(value.producerId || '') && IDENTIFIER.test(value.curriculumEventId || '')
    && Array.isArray(value.sourceExperienceIds) && value.sourceExperienceIds.length > 0
    && value.sourceExperienceIds.every((id) => IDENTIFIER.test(id)));
}

function validAuthority(authority) {
  return Boolean(authority && typeof authority.isAllowed === 'function');
}

function nonEmpty(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

async function readRegistration(db, input) {
  const event = await getEvent(db, input.registrationEventId, input.scope);
  if (!event || event.payload?.kind !== 'responsibility_skill_registration' || !sameScope(event, input.scope)) {
    throw error('GVX_SKILL_REGISTRATION_NOT_FOUND');
  }
  return event;
}

async function qualifySkillStewardship(db, input) {
  validateAssessment(input);
  const registration = await readRegistration(db, input);
  await authorizeAssessment(input, registration);
  validateObservations(input, registration);
  const metrics = stewardshipMetrics(input, registration.payload);
  const event = await appendEvent(db, {
    id: input.assessmentId, ...input.scope, type: 'evidence_attached',
    candidateHash: registration.candidateHash,
    payload: { kind: 'responsibility_skill_assessment', registrationEventId: registration.id,
      metrics, automaticPromotion: false }
  });
  return { schema: 'genos.gvx.skill-stewardship-assessment/v1', status: 'observed',
    eventId: event.id, registrationEventId: registration.id, metrics, automaticPromotion: false };
}

function validateAssessment(input) {
  if (!input || !validScope(input.scope) || !IDENTIFIER.test(input.assessmentId || '')
    || !IDENTIFIER.test(input.registrationEventId || '') || !validAuthority(input.authority)
    || !validPolicy(input.policy) || !validObservationGroups(input.observations)) {
    throw error('GVX_SKILL_ASSESSMENT_INVALID');
  }
}

function validPolicy(policy) {
  return Boolean(Number.isInteger(policy?.minReuseCount) && policy.minReuseCount > 0
    && Number.isFinite(policy.minProjectBenefit) && policy.minProjectBenefit >= 0
    && Number.isFinite(policy.maxRegression) && policy.maxRegression >= 0);
}

function validObservationGroups(value) {
  return Boolean(Array.isArray(value?.reuse) && value.reuse.length > 0
    && Array.isArray(value.retention) && value.retention.length > 0 && value.holdout);
}

async function authorizeAssessment(input, registration) {
  const allowed = await input.authority.isAllowed({ action: 'assess_responsibility_skill',
    scope: input.scope, responsibilityId: registration.payload.responsibility.responsibilityId,
    skillId: registration.payload.skill.skillId });
  if (allowed !== true) throw error('GVX_SKILL_ASSESSMENT_DENIED');
}

function validateObservations(input, registration) {
  const all = [...input.observations.reuse, ...input.observations.retention, input.observations.holdout];
  if (!all.every(validObservation) || !validHoldout(input.observations.holdout, registration.payload)) {
    throw error('GVX_SKILL_OBSERVATION_INVALID');
  }
}

function validObservation(value) {
  return Boolean(IDENTIFIER.test(value?.observationId || '') && IDENTIFIER.test(value?.contextId || '')
    && IDENTIFIER.test(value?.verifierId || '') && HASH.test(value?.evidenceRef || '')
    && Number.isFinite(value.baseline) && Number.isFinite(value.candidate));
}

function validHoldout(value, registration) {
  const { responsibility, skill } = registration;
  return value.sealed === true && value.contextId !== responsibility.contextId
    && value.verifierId !== skill.producerId;
}

function stewardshipMetrics(input, registration) {
  const direction = registration.responsibility.direction;
  const reuseBenefits = input.observations.reuse.map((item) => benefit(item, direction));
  const holdoutBenefit = benefit(input.observations.holdout, direction);
  const regressions = input.observations.retention.map((item) => regression(item, direction));
  const maxRegression = Math.max(0, ...regressions);
  const regressionDetected = maxRegression > input.policy.maxRegression;
  return { reuseCount: new Set(input.observations.reuse.map((item) => item.contextId)).size,
    projectBenefit: mean(reuseBenefits), holdoutBenefit,
    holdoutPassed: holdoutBenefit >= input.policy.minProjectBenefit,
    maxRegression, regressionDetected,
    retentionState: regressionDetected ? 'regressed' : 'retained',
    forgettingDisposition: regressionDetected ? 'quarantine_and_relearn' : 'retain',
    policy: { ...input.policy }, evidenceRefs: evidenceRefs(input.observations) };
}

function benefit(observation, direction) {
  return direction === 'higher'
    ? observation.candidate - observation.baseline : observation.baseline - observation.candidate;
}

function regression(observation, direction) {
  return direction === 'higher'
    ? observation.baseline - observation.candidate : observation.candidate - observation.baseline;
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function evidenceRefs(observations) {
  return [...new Set([...observations.reuse, ...observations.retention, observations.holdout]
    .map((item) => item.evidenceRef))].sort();
}

async function readAssessment(db, input) {
  const event = await getEvent(db, input.assessmentEventId, input.scope);
  if (!event || event.payload?.kind !== 'responsibility_skill_assessment' || !sameScope(event, input.scope)) {
    throw error('GVX_SKILL_ASSESSMENT_NOT_FOUND');
  }
  return event;
}

async function decideSkillStewardship(db, input) {
  validateDecision(input);
  const assessment = await readAssessment(db, input);
  const registration = await readRegistration(db, {
    scope: input.scope, registrationEventId: assessment.payload.registrationEventId
  });
  const evidenceReasons = evidenceRejectionReasons(assessment.payload.metrics);
  const allowed = evidenceReasons.length === 0
    ? await adoptionReviewAllowed(input, registration) : false;
  const reasons = allowed ? [] : [...evidenceReasons, ...authorityReason(evidenceReasons, allowed)];
  const decision = decisionPayload(assessment, reasons);
  const event = await appendEvent(db, {
    id: input.decisionId, ...input.scope, type: 'decision_recorded',
    candidateHash: registration.candidateHash,
    payload: { kind: 'skill_stewardship_decision', assessmentEventId: assessment.id,
      registrationEventId: registration.id, decision }
  });
  return { schema: 'genos.gvx.skill-stewardship-decision/v1', eventId: event.id, ...decision };
}

function validateDecision(input) {
  if (!input || !validScope(input.scope) || !IDENTIFIER.test(input.decisionId || '')
    || !IDENTIFIER.test(input.assessmentEventId || '') || !validAuthority(input.authority)) {
    throw error('GVX_SKILL_DECISION_INVALID');
  }
}

function evidenceRejectionReasons(metrics) {
  const reasons = [];
  if (metrics.reuseCount < metrics.policy.minReuseCount) reasons.push('reuse_insufficient');
  if (metrics.projectBenefit < metrics.policy.minProjectBenefit) reasons.push('project_benefit_insufficient');
  if (metrics.holdoutPassed !== true) reasons.push('holdout_failed');
  if (metrics.regressionDetected === true) reasons.push('regression_detected');
  return reasons;
}

async function adoptionReviewAllowed(input, registration) {
  return await input.authority.isAllowed({ action: 'request_skill_adoption_review', scope: input.scope,
    responsibilityId: registration.payload.responsibility.responsibilityId,
    skillId: registration.payload.skill.skillId, version: registration.payload.skill.version }) === true;
}

function authorityReason(evidenceReasons, allowed) {
  return evidenceReasons.length === 0 && allowed !== true ? ['authority_denied'] : [];
}

function decisionPayload(assessment, reasons) {
  const ready = reasons.length === 0;
  return { decision: ready ? 'EXTERNAL_REVIEW_REQUIRED' : 'NO_CHANGE', reasons,
    requestedAction: ready ? 'review_versioned_skill_adoption' : null,
    automaticPromotion: false, assessmentMetrics: assessment.payload.metrics };
}

async function readDecision(db, input) {
  const event = await getEvent(db, input.decisionEventId, input.scope);
  if (!event || event.payload?.kind !== 'skill_stewardship_decision' || !sameScope(event, input.scope)) {
    throw error('GVX_SKILL_DECISION_NOT_FOUND');
  }
  return event;
}

module.exports = { registerSkillResponsibility, readRegistration, qualifySkillStewardship,
  readAssessment, decideSkillStewardship, readDecision };
