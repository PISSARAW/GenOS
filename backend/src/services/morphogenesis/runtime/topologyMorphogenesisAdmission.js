'use strict';

const crypto = require('node:crypto');
const { executeTopologyMorphogenesis } = require('./topologyMorphogenesisTransaction');

const REQUIRED_QUALIFICATIONS = Object.freeze([
  'runtimeBinding', 'persistent', 'snapshotable', 'restorable', 'endToEnd'
]);

function assessTopologyMorphogenesis(input = {}) {
  validateInput(input);
  const identity = requestedIdentity(input.plan);
  const variant = resolveVariant(input.variantRegistry, identity);
  const failures = identityFailures(input, identity, variant);
  if (variant) failures.push(...qualificationFailures(variant));
  const admitted = failures.length === 0;
  return {
    schemaVersion: '1.0.0', admitted,
    code: admitted ? 'TOPOLOGY_VARIANT_ADMITTED' : 'TOPOLOGY_VARIANT_QUALIFICATION_REQUIRED',
    topology: identity.topology,
    variantId: identity.variantId,
    canonicalVariantId: variant?.aliasOf || variant?.variantId || null,
    qualificationDigest: variant ? digestQualification(variant) : null,
    requiredQualifications: [...REQUIRED_QUALIFICATIONS],
    evidenceRefs: variant ? qualificationEvidence(variant) : [],
    failures
  };
}

async function executeQualifiedTopologyMorphogenesis(input = {}) {
  const admission = assessTopologyMorphogenesis(input);
  if (!admission.admitted) throw admissionError(admission);
  const transaction = await executeTopologyMorphogenesis(input);
  return {
    ...transaction,
    variantId: admission.variantId,
    canonicalVariantId: admission.canonicalVariantId,
    admission,
    promotionEligible: false
  };
}

function validateInput(input) {
  if (!input.variantRegistry || typeof input.variantRegistry.resolve !== 'function') {
    throw coded('TOPOLOGY_VARIANT_REGISTRY_REQUIRED', 'A VariantSpec registry is required.');
  }
  if (!input.plan || typeof input.plan !== 'object') {
    throw coded('TOPOLOGY_VARIANT_PLAN_REQUIRED', 'A topology and variant plan is required.');
  }
}

function resolveVariant(registry, identity) {
  if (!identity.topology || !identity.variantId) return null;
  return registry.resolve(identity.topology, identity.variantId);
}

function requestedIdentity(plan) {
  return {
    topology: plan.targetTopology || plan.selectedTopology || null,
    variantId: plan.targetVariant || plan.selectedVariant || plan.variantId || null
  };
}

function identityFailures(input, identity, variant) {
  const failures = [];
  if (!identity.topology) failures.push('plan.topology:missing');
  if (!identity.variantId) failures.push('plan.variant:missing');
  if (identity.topology && identity.variantId && !variant) failures.push('plan.variant:not_registered');
  if (variant && input.port?.topology !== variant.topology) failures.push('port.topology:variant_mismatch');
  return failures;
}

function qualificationFailures(variant) {
  return REQUIRED_QUALIFICATIONS.flatMap((dimension) => {
    if (variant.qualification?.[dimension] !== 'verified') {
      return [`${dimension}:not_verified`];
    }
    return evidenceFor(variant, dimension).length ? [] : [`${dimension}:evidence_missing`];
  });
}

function qualificationEvidence(variant) {
  return [...new Set(REQUIRED_QUALIFICATIONS.flatMap((dimension) => evidenceFor(variant, dimension)))];
}

function evidenceFor(variant, dimension) {
  const references = variant.qualificationEvidence?.[dimension];
  return Array.isArray(references)
    ? references.filter((reference) => typeof reference === 'string' && reference.trim())
    : [];
}

function digestQualification(variant) {
  const payload = REQUIRED_QUALIFICATIONS.map((dimension) => ({
    dimension,
    state: variant.qualification?.[dimension] || null,
    evidenceRefs: evidenceFor(variant, dimension)
  }));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function admissionError(admission) {
  const error = coded(admission.code, `Topology variant admission refused: ${admission.failures.join(', ')}.`);
  error.admission = admission;
  return error;
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = {
  REQUIRED_QUALIFICATIONS, assessTopologyMorphogenesis,
  executeQualifiedTopologyMorphogenesis
};
