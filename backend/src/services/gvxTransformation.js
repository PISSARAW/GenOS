'use strict';

const { randomUUID } = require('crypto');
const { appendEvent } = require('./gvxDevelopmentLedger');

const PLASTICITY = Object.freeze(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
const DESTINATIONS = Object.freeze(['soma', 'germline_candidate', 'cultural_transfer']);

function validateCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return ['candidate-object-required'];
  return [
    ...identityErrors(candidate), ...hypothesisErrors(candidate.hypothesis),
    ...evidenceErrors(candidate), ...scopeErrors(candidate), ...policyErrors(candidate)
  ];
}

function identityErrors(candidate) {
  const errors = [];
  if (!PLASTICITY.includes(candidate.plasticity)) errors.push('plasticity-unknown');
  if (!DESTINATIONS.includes(candidate.destination)) errors.push('destination-invalid');
  if (typeof candidate.parentHash !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.parentHash)) errors.push('parent-hash-required');
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) errors.push('title-required');
  return errors;
}

function hypothesisErrors(hypothesis) {
  if (!hypothesis || typeof hypothesis !== 'object') return ['hypothesis-required'];
  const required = ['statement', 'prediction', 'falsificationCriteria', 'protocol'];
  return required.filter((field) => !hasText(hypothesis[field])).map((field) => `hypothesis-${field}-required`);
}

function evidenceErrors(candidate) {
  if (!Array.isArray(candidate.sourceExperienceIds) || candidate.sourceExperienceIds.length === 0) return ['source-experiences-required'];
  if (!candidate.sourceExperienceIds.every(hasText)) return ['source-experience-id-invalid'];
  return [];
}

function scopeErrors(candidate) {
  if (!candidate.scope || !hasText(candidate.scope.organizationId) || !hasText(candidate.scope.projectId)) return ['scope-required'];
  if (!hasText(candidate.entityId)) return ['entity-id-required'];
  return [];
}

function policyErrors(candidate) {
  const errors = [];
  if (!Number.isFinite(candidate.maxCost) || candidate.maxCost <= 0) errors.push('positive-cost-budget-required');
  if (!Number.isInteger(candidate.maxSeconds) || candidate.maxSeconds <= 0) errors.push('positive-time-budget-required');
  if (!hasText(candidate.verifierProfile)) errors.push('verifier-profile-required');
  if (!hasText(candidate.rollbackPlan)) errors.push('rollback-plan-required');
  return errors;
}

function hasText(value) { return typeof value === 'string' && Boolean(value.trim()); }

function normalizedCandidate(input) {
  return {
    candidateId: input.candidateId || randomUUID(),
    title: input.title.trim(),
    plasticity: input.plasticity,
    destination: input.destination,
    parentHash: input.parentHash,
    sourceExperienceIds: [...new Set(input.sourceExperienceIds)],
    hypothesis: {
      statement: input.hypothesis.statement.trim(),
      prediction: input.hypothesis.prediction.trim(),
      falsificationCriteria: input.hypothesis.falsificationCriteria.trim(),
      protocol: input.hypothesis.protocol.trim(),
      heldOutRefs: normalizedList(input.hypothesis.heldOutRefs)
    },
    causalContext: normalizedCausalContext(input.causalContext),
    skillDelta: input.skillDelta || { adds: [], requires: [] },
    maxCost: input.maxCost,
    maxSeconds: input.maxSeconds,
    risk: input.risk || 'unknown',
    verifierProfile: input.verifierProfile,
    rollbackPlan: input.rollbackPlan
  };
}

function normalizedCausalContext(context) {
  if (!context || typeof context.selfTwinPredictionId !== 'string') return null;
  return { selfTwinPredictionId: context.selfTwinPredictionId,
    predictedEffects: Array.isArray(context.predictedEffects) ? context.predictedEffects.slice(0, 50) : [] };
}

function normalizedList(value) { return Array.isArray(value) ? [...new Set(value.filter(hasText))] : []; }

async function proposeTransformation(db, input) {
  const errors = validateCandidate(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_TRANSFORMATION_INVALID', errors });
  const candidate = normalizedCandidate(input);
  return appendEvent(db, {
    organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    entityId: input.entityId,
    type: 'transformation_proposed',
    parentHash: candidate.parentHash,
    payload: { candidate }
  });
}

module.exports = { PLASTICITY, DESTINATIONS, validateCandidate, normalizedCandidate, proposeTransformation };
