'use strict';

const FIELDS = Object.freeze(['actorId', 'model', 'version', 'strategy', 'evidenceSource', 'workspaceId']);

function normalizedDescriptor(value = {}) {
  const descriptor = {};
  for (const field of FIELDS) {
    const entry = String(value[field] || '').trim();
    if (!entry) throw new Error(`independence.${field} is required.`);
    descriptor[field] = entry;
  }
  return descriptor;
}

function independenceDistance(left, right) {
  return FIELDS.filter((field) => left[field] !== right[field]).length;
}

function evaluateIndependence(candidate, existing = [], options = {}) {
  const normalized = normalizedDescriptor(candidate);
  const minimumDistance = Math.max(1, Number(options.minimumDistance) || 3);
  for (const prior of existing) {
    const distance = independenceDistance(normalized, prior);
    const separateExecution = normalized.actorId !== prior.actorId && normalized.workspaceId !== prior.workspaceId;
    if (!separateExecution || distance < minimumDistance) {
      return { independent: false, distance, reason: 'insufficient_independence', descriptor: normalized };
    }
  }
  return { independent: true, distance: FIELDS.length, descriptor: normalized };
}

function verificationReplicaTarget(value = {}) {
  const risk = String(value.risk || 'normal').toLowerCase();
  if (risk === 'critical') return 3;
  if (risk === 'high') return 2;
  return value.requireIndependentVerification === true ? 1 : 0;
}

module.exports = { FIELDS, normalizedDescriptor, independenceDistance, evaluateIndependence, verificationReplicaTarget };
