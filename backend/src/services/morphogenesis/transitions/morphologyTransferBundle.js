'use strict';

const { randomUUID } = require('crypto');

const BUNDLE_VERSION = 1;
const REQUIRED_FIELDS = ['mission', 'scope', 'artifacts', 'claims', 'evidence', 'uncertainties', 'decisions', 'provenance', 'sourceReceipt'];

function createTransferBundle(input = {}) {
  const bundle = buildBundleObject(input);
  const validation = validateTransferBundle(bundle);
  if (!validation.valid) throw new Error(`Invalid transfer bundle: ${validation.errors.join('; ')}`);
  return bundle;
}

function buildBundleObject(input) {
  return {
    bundleId: input.bundleId || randomUUID(),
    version: BUNDLE_VERSION,
    mission: input.mission || null,
    scope: input.scope || 'mission',
    artifacts: toArray(input.artifacts),
    claims: toArray(input.claims),
    evidence: toArray(input.evidence),
    uncertainties: toArray(input.uncertainties),
    decisions: toArray(input.decisions),
    unresolvedQuestions: toArray(input.unresolvedQuestions),
    stateCapsules: toArray(input.stateCapsules),
    workerCapabilities: toArray(input.workerCapabilities),
    resources: input.resources || {},
    provenance: input.provenance || {},
    sourceReceipt: input.sourceReceipt || null,
    topologyId: input.topologyId || null,
    variant: input.variant || null,
    timestamp: new Date().toISOString()
  };
}

function toArray(val) {
  return Array.isArray(val) ? [...val] : [];
}

function validateTransferBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return { valid: false, errors: ['Bundle must be an object'] };
  checkRequired(bundle, errors);
  checkArrays(bundle, errors);
  checkObjects(bundle, errors);
  return { valid: errors.length === 0, errors };
}

function checkRequired(bundle, errors) {
  for (const field of REQUIRED_FIELDS) if (!bundle[field]) errors.push(`Missing required field: ${field}`);
}

function checkArrays(bundle, errors) {
  const arrays = ['artifacts', 'claims', 'evidence', 'uncertainties', 'decisions', 'unresolvedQuestions', 'stateCapsules', 'workerCapabilities'];
  for (const field of arrays) if (bundle[field] !== undefined && !Array.isArray(bundle[field])) errors.push(`${field} must be an array`);
}

function checkObjects(bundle, errors) {
  const objects = ['resources', 'provenance'];
  for (const field of objects) if (bundle[field] !== undefined && (bundle[field] === null || typeof bundle[field] !== 'object')) errors.push(`${field} must be an object`);
}

function createStateCapsule(nodeId, state, ports = []) {
  return { capsuleId: randomUUID(), nodeId, state: state || {}, ports: ports.map(p => ({ portId: p.portId, name: p.name, value: p.value })), timestamp: new Date().toISOString() };
}

function createArtifact(type, content, metadata = {}) {
  return { artifactId: randomUUID(), type, content, metadata, timestamp: new Date().toISOString() };
}

function createClaim(statement, confidence, evidence = []) {
  return { claimId: randomUUID(), statement, confidence: typeof confidence === 'number' ? confidence : 0, evidence: toArray(evidence), timestamp: new Date().toISOString() };
}

function createDecision(decision, rationale, alternatives = []) {
  return { decisionId: randomUUID(), decision, rationale, alternatives, timestamp: new Date().toISOString() };
}

function createProvenance(topology, variant, executionId) {
  return { provenanceId: randomUUID(), topology, variant, executionId, timestamp: new Date().toISOString() };
}

function mergeBundles(...bundles) {
  if (bundles.length === 0) return null;
  const base = bundles[0];
  const merged = buildBundleObject({ mission: base.mission, scope: base.scope, topologyId: base.topologyId, variant: base.variant });
  for (const bundle of bundles) {
    if (!bundle) continue;
    mergeInto(merged, bundle);
  }
  return merged;
}

function mergeInto(target, source) {
  for (const field of ['artifacts', 'claims', 'evidence', 'uncertainties', 'decisions', 'unresolvedQuestions', 'stateCapsules', 'workerCapabilities']) {
    target[field].push(...source[field]);
  }
  target.resources = { ...target.resources, ...source.resources };
  target.provenance = { ...target.provenance, ...source.provenance };
}

function filterBundle(bundle, filter) {
  const filtered = { ...bundle };
  for (const field of ['artifacts', 'claims', 'evidence']) {
    if (filter[field]) filtered[field] = bundle[field].filter(filter[field]);
  }
  if (filter.minConfidence) filtered.claims = bundle.claims.filter(c => c.confidence >= filter.minConfidence);
  return filtered;
}

function bundleToSummary(bundle) {
  return { bundleId: bundle.bundleId, topologyId: bundle.topologyId, variant: bundle.variant, mission: bundle.mission, artifactCount: bundle.artifacts.length, claimCount: bundle.claims.length, evidenceCount: bundle.evidence.length, uncertaintyCount: bundle.uncertainties.length, decisionCount: bundle.decisions.length, stateCapsuleCount: bundle.stateCapsules.length, workerCount: bundle.workerCapabilities.length, timestamp: bundle.timestamp };
}

module.exports = { BUNDLE_VERSION, createTransferBundle, validateTransferBundle, createStateCapsule, createArtifact, createClaim, createDecision, createProvenance, mergeBundles, filterBundle, bundleToSummary };