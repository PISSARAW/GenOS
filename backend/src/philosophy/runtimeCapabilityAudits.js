'use strict';

const HASH = /^[a-f0-9]{64}$/;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function result(satisfied, details) {
  return { status: satisfied ? 'satisfied' : 'violated', satisfied, details };
}

function identityContinuity(value) {
  if (!record(value) || !record(value.previous) || !record(value.current)) {
    return result(false, { reason: 'identity-transition-required' });
  }
  const previous = value.previous;
  const current = value.current;
  const identityStable = text(previous.identityId) && previous.identityId === current.identityId;
  const lineageStable = text(previous.lineageId) && previous.lineageId === current.lineageId;
  const revisionDelta = Number.isSafeInteger(current.revision) && Number.isSafeInteger(previous.revision)
    ? current.revision - previous.revision : null;
  return result(identityStable && lineageStable && revisionDelta === 1,
    { identityStable, lineageStable, revisionDelta });
}

function measurement(value) {
  return record(value) && Number.isFinite(value.value) && HASH.test(value.evidenceHash || '')
    && HASH.test(value.conditionsHash || '');
}

function measuredIntervention(value) {
  if (!record(value) || !measurement(value.control) || !measurement(value.treatment)) {
    return result(false, { reason: 'measured-control-and-treatment-required' });
  }
  const conditionsMatched = value.control.conditionsHash === value.treatment.conditionsHash;
  const evidenceDistinct = value.control.evidenceHash !== value.treatment.evidenceHash;
  const measuredDelta = value.treatment.value - value.control.value;
  const finiteDelta = Number.isFinite(measuredDelta);
  const applied = value.interventionApplied === true && text(value.interventionId) && text(value.metric);
  return result(applied && conditionsMatched && evidenceDistinct && finiteDelta && measuredDelta !== 0,
    { applied: Boolean(applied), conditionsMatched, evidenceDistinct, finiteDelta, measuredDelta });
}

function numericRuns(value) {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function controlledBiomimeticEffect(value) {
  if (!record(value) || !numericRuns(value.control) || !numericRuns(value.treatment)) {
    return result(false, { reason: 'replicated-control-and-treatment-required' });
  }
  const controlMean = mean(value.control);
  const treatmentMean = mean(value.treatment);
  const observedEffect = Math.abs(treatmentMean - controlMean);
  const minimumEffect = value.minimumEffect;
  const comparable = value.control.length === value.treatment.length;
  const preregistered = value.preregistered === true && text(value.hypothesisId) && text(value.metric);
  const thresholdValid = Number.isFinite(minimumEffect) && minimumEffect > 0;
  return result(preregistered && comparable && thresholdValid && observedEffect >= minimumEffect,
    { preregistered: Boolean(preregistered), comparable, thresholdValid, controlMean,
      treatmentMean, observedEffect, minimumEffect });
}

const SPECIALIZED_AUDITS = Object.freeze({
  'core.self': Object.freeze({
    id: 'identity-continuity', field: 'self.identityContinuity',
    outputs: Object.freeze(['identityStable', 'lineageStable', 'revisionDelta']),
  }),
  'core.intervention-not-metaphor': Object.freeze({
    id: 'measured-intervention', field: 'intervention.comparison',
    outputs: Object.freeze(['conditionsMatched', 'evidenceDistinct', 'measuredDelta']),
  }),
  'core.biomimetic-experimental': Object.freeze({
    id: 'controlled-biomimetic-effect', field: 'biomimetic.experiment',
    outputs: Object.freeze(['controlMean', 'treatmentMean', 'observedEffect', 'minimumEffect']),
  }),
});

const SPECIALIZED_PREDICATES = Object.freeze({
  'identity-continuity': identityContinuity,
  'measured-intervention': measuredIntervention,
  'controlled-biomimetic-effect': controlledBiomimeticEffect,
});

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const CONDITIONS = 'c'.repeat(64);
const SPECIALIZED_EXAMPLES = Object.freeze({
  'identity-continuity': [
    { previous: { identityId: 'agent:a', lineageId: 'lineage:1', revision: 3 },
      current: { identityId: 'agent:a', lineageId: 'lineage:1', revision: 4 } },
    { previous: { identityId: 'agent:a', lineageId: 'lineage:1', revision: 3 },
      current: { identityId: 'agent:b', lineageId: 'lineage:1', revision: 4 } },
  ],
  'measured-intervention': [
    { interventionId: 'intervention:1', metric: 'latency-ms', interventionApplied: true,
      control: { value: 10, evidenceHash: HASH_A, conditionsHash: CONDITIONS },
      treatment: { value: 7, evidenceHash: HASH_B, conditionsHash: CONDITIONS } },
    { interventionId: 'intervention:1', metric: 'latency-ms', interventionApplied: true,
      control: { value: 10, evidenceHash: HASH_A, conditionsHash: CONDITIONS },
      treatment: { value: 10, evidenceHash: HASH_B, conditionsHash: CONDITIONS } },
  ],
  'controlled-biomimetic-effect': [
    { hypothesisId: 'bio:h1', metric: 'quality', preregistered: true,
      control: [1, 1.2, 0.8], treatment: [1.8, 2, 2.2], minimumEffect: 0.5 },
    { hypothesisId: 'bio:h1', metric: 'quality', preregistered: false,
      control: [1, 1.2, 0.8], treatment: [1.8, 2, 2.2], minimumEffect: 0.5 },
  ],
});

function specializedAuditForConcept(conceptId) {
  return SPECIALIZED_AUDITS[conceptId] || null;
}

function evaluateSpecialized(name, value) {
  const evaluator = SPECIALIZED_PREDICATES[name];
  return evaluator ? evaluator(value) : null;
}

function specializedProbeValues(name) {
  return SPECIALIZED_EXAMPLES[name] ? structuredClone(SPECIALIZED_EXAMPLES[name]) : null;
}

function registryBindingErrors(contract, expected) {
  const errors = [];
  if (contract.implementationDisposition !== 'runtime-capability') errors.push('specialized mechanism requires runtime-capability');
  if (contract.execution?.predicate !== expected.id) errors.push('specialized predicate differs from registry');
  if (contract.execution?.field !== expected.field) errors.push('specialized field differs from registry');
  return errors;
}

function mechanismBoundaryErrors(mechanism, expected) {
  const errors = [];
  if (mechanism.apiVersion !== 'genos.philosophy-specialized-audit/v1') errors.push('unsupported specialized apiVersion');
  if (mechanism.evaluator !== expected.id) errors.push('specialized evaluator differs from registry');
  if (JSON.stringify(mechanism.outputs) !== JSON.stringify(expected.outputs)) errors.push('specialized outputs differ from registry');
  if (mechanism.runtimeAuthorityGranted !== false) errors.push('specialized audit must not grant runtime authority');
  if (mechanism.externalFactsVerified !== false) errors.push('specialized audit must not verify external facts');
  return errors;
}

function specializedExecutionErrors(contract) {
  const expected = specializedAuditForConcept(contract.id);
  const mechanism = contract.specializedMechanism;
  if (!expected) return mechanism ? ['unexpected specialized mechanism'] : [];
  if (!mechanism) return ['specialized mechanism required'];
  return [...registryBindingErrors(contract, expected), ...mechanismBoundaryErrors(mechanism, expected)];
}

module.exports = {
  SPECIALIZED_PREDICATES,
  SPECIALIZED_EXAMPLES,
  specializedAuditForConcept,
  evaluateSpecialized,
  specializedProbeValues,
  specializedExecutionErrors,
};
