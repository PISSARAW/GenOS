'use strict';

const crypto = require('node:crypto');

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_REQUIRED`);
  return value;
}

function text(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label}_REQUIRED`);
  return normalized;
}

function version(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label}_INVALID`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function evidenceRefs(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('EVIDENCE_REFS_REQUIRED');
  return [...new Set(value.map(item => text(item, 'EVIDENCE_REF')))];
}

function createBaseline(input = {}) {
  const intent = object(input.intent, 'INTENT');
  const designSystem = object(input.designSystem, 'DESIGN_SYSTEM');
  const baseline = {
    kind: 'studio-interface-baseline', interfaceId: text(input.interfaceId, 'INTERFACE_ID'),
    interfaceVersion: version(input.interfaceVersion, 'INTERFACE_VERSION'), worldId: text(input.worldId, 'WORLD_ID'),
    intent: { version: version(intent.version, 'INTENT_VERSION'), payload: object(intent.payload, 'INTENT_PAYLOAD') },
    designSystem: { version: version(designSystem.version, 'DESIGN_SYSTEM_VERSION'),
      payload: object(designSystem.payload, 'DESIGN_SYSTEM_PAYLOAD') },
    createdBy: text(input.createdBy, 'CREATED_BY'), evidenceRefs: evidenceRefs(input.evidenceRefs)
  };
  return Object.freeze({ ...baseline, baselineHash: digest(baseline) });
}

function createCandidate(input = {}) {
  const baseline = object(input.baseline, 'BASELINE');
  const worldId = text(input.worldId, 'WORLD_ID');
  if (baseline.kind !== 'studio-interface-baseline') throw new Error('BASELINE_INVALID');
  if (worldId === baseline.worldId) throw new Error('CANDIDATE_WORLD_NOT_ISOLATED');
  if (input.intentVersion !== baseline.intent.version) throw new Error('INTENT_VERSION_CONFLICT');
  if (input.designSystemVersion !== baseline.designSystem.version) throw new Error('DESIGN_SYSTEM_VERSION_CONFLICT');
  const candidate = {
    kind: 'studio-interface-candidate', candidateId: text(input.candidateId, 'CANDIDATE_ID'),
    baselineHash: baseline.baselineHash, worldId, artifactRef: text(input.artifactRef, 'ARTIFACT_REF'),
    intentVersion: input.intentVersion, designSystemVersion: input.designSystemVersion,
    createdBy: text(input.createdBy, 'CREATED_BY'), evidenceRefs: evidenceRefs(input.evidenceRefs),
    deploymentAuthorized: false
  };
  return Object.freeze({ ...candidate, candidateHash: digest(candidate) });
}

module.exports = { canonical, digest, createBaseline, createCandidate };
