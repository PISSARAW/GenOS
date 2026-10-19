'use strict';

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function text(value, maximum = 512) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function references(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 20
    && value.every(item => text(item));
}

function list(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20 || !value.every(item => text(item, 1024))) {
    throw new TypeError(`SHEV product ${label} is invalid.`);
  }
  return [...new Set(value)];
}

function risks(value) {
  if (!Array.isArray(value) || value.length > 20 || value.some(item => !item || !SAFE_ID.test(item.id)
    || !SEVERITIES.has(item.severity) || !text(item.mitigation, 1024))) {
    throw new TypeError('SHEV product risks are invalid.');
  }
  return value.map(item => ({ id: item.id, severity: item.severity, mitigation: item.mitigation }));
}

function rollback(value) {
  if (!value || !text(value.actionRef) || !text(value.checkpointRef) || !references(value.evidenceRefs)) {
    throw new TypeError('SHEV product rollback evidence is required.');
  }
  return { actionRef: value.actionRef, checkpointRef: value.checkpointRef,
    evidenceRefs: [...new Set(value.evidenceRefs)] };
}

function learningTarget(value) {
  if (!value || !text(value.organizationId, 128) || !text(value.agentId, 128)) {
    throw new TypeError('SHEV product learning target is required.');
  }
  return { organizationId: value.organizationId, agentId: value.agentId };
}

function normalizeManifest(input) {
  if (!input || !SAFE_ID.test(input.id) || !text(input.projectId, 128)
    || !text(input.dimension, 128) || !text(input.buildRef)) {
    throw new TypeError('SHEV product manifest identity is invalid.');
  }
  if (!references(input.previewEvidenceRefs)) {
    throw new TypeError('SHEV product preview evidence is required.');
  }
  return { id: input.id, projectId: input.projectId, dimension: input.dimension,
    buildRef: input.buildRef, trajectory: list(input.trajectory, 'trajectory'),
    qualityCriteria: list(input.qualityCriteria, 'quality criteria'), risks: risks(input.risks),
    rollback: rollback(input.rollback), learningTarget: learningTarget(input.learningTarget),
    previewEvidenceRefs: [...new Set(input.previewEvidenceRefs)] };
}

module.exports = { normalizeManifest, references, text, SAFE_ID };
