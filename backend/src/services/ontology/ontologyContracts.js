'use strict';

const EVIDENCE_STATUSES = Object.freeze(['unverified', 'observed', 'simulated', 'reconstructed', 'verified']);

function text(value, name) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${name} must be a non-empty string.`);
  return result;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value;
}

function evidence(input = {}) {
  const status = input.status || 'unverified';
  if (!EVIDENCE_STATUSES.includes(status)) throw new Error(`Unknown evidence status '${status}'.`);
  return {
    status,
    sources: Array.isArray(input.sources) ? input.sources : [],
    assumptions: Array.isArray(input.assumptions) ? input.assumptions : [],
    limitations: Array.isArray(input.limitations) ? input.limitations : [],
  };
}

function scope(input = {}) {
  return {
    organizationId: input.organizationId || input.organization_id || null,
    projectId: input.projectId || input.project_id || null,
  };
}

module.exports = { EVIDENCE_STATUSES, text, object, evidence, scope };
