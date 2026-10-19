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

module.exports = { registerSkillResponsibility, readRegistration };
