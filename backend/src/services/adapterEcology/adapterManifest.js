'use strict';

const { normalizeCapabilityNode } = require('../rhizome/contracts/capabilityNode');
const { validateContract } = require('../holobionte/contracts/symbiosisContractService');

const SCHEMA = 'genos.adapter-symbiont/v1';
const PROVIDER_KINDS = Object.freeze(['daemon', 'tool', 'service', 'runtime']);
const HEALTH_STATES = Object.freeze(['HEALTHY', 'DEGRADED', 'QUARANTINED', 'UNKNOWN']);
const NODE_KINDS = Object.freeze({ daemon: 'DAEMON', tool: 'TOOL', service: 'EXTERNAL_SERVICE', runtime: 'PROCEDURE' });

function invalid(message, code = 'ADAPTER_SYMBIONT_MANIFEST_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) invalid(`${field} is required.`);
  return normalized;
}

function textList(value, field, required = false) {
  if (!Array.isArray(value)) invalid(`${field} must be an array.`);
  const items = [...new Set(value.map((item) => text(item, field)))];
  if (required && items.length === 0) invalid(`${field} must not be empty.`);
  if (items.includes('*')) invalid(`${field} must not contain wildcard authority.`, 'ADAPTER_SYMBIONT_SCOPE_INVALID');
  return items;
}

function bounded(value, field, maximum = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) invalid(`${field} is outside its bounded range.`);
  return number;
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object.`);
  return value;
}

function normalizeVersion(value) {
  const version = text(value, 'version');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) invalid('version must be a semantic version.');
  return version;
}

function normalizeHealth(value) {
  const health = record(value, 'health');
  const status = text(health.status, 'health.status').toUpperCase();
  if (!HEALTH_STATES.includes(status)) invalid('health.status is unknown.');
  const checkedAt = new Date(text(health.checkedAt, 'health.checkedAt'));
  if (!Number.isFinite(checkedAt.getTime())) invalid('health.checkedAt must be an ISO date.');
  return { status, checkedAt: checkedAt.toISOString(), reliability: bounded(health.reliability, 'health.reliability') };
}

function normalizeEconomics(value) {
  const economics = record(value, 'economics');
  return {
    costUsd: bounded(economics.costUsd, 'economics.costUsd', Number.MAX_SAFE_INTEGER),
    latencyMs: bounded(economics.latencyMs, 'economics.latencyMs', Number.MAX_SAFE_INTEGER)
  };
}

function normalizeFitness(value = {}) {
  const fitness = record(value, 'fitness');
  return Object.fromEntries(['evidenceQuality', 'historicalCompatibility', 'replaceability', 'risk', 'dependencyRisk']
    .map((field) => [field, bounded(fitness[field] ?? 0.5, `fitness.${field}`)]));
}

function normalizeCompensation(value) {
  const compensation = record(value, 'compensation');
  return {
    action: text(compensation.action, 'compensation.action'),
    evidenceRequirements: textList(compensation.evidenceRequirements, 'compensation.evidenceRequirements', true)
  };
}

function normalizeManifest(input) {
  const manifest = record(input, 'manifest');
  if (manifest.schema !== SCHEMA) invalid(`schema must be ${SCHEMA}.`);
  const providerKind = text(manifest.providerKind, 'providerKind');
  if (!PROVIDER_KINDS.includes(providerKind)) invalid('providerKind is not supported.');
  return Object.freeze({
    schema: SCHEMA,
    adapterId: text(manifest.adapterId, 'adapterId'),
    version: normalizeVersion(manifest.version),
    providerKind,
    reference: text(manifest.reference, 'reference'),
    capabilities: textList(manifest.capabilities, 'capabilities', true),
    dataScopes: textList(manifest.dataScopes || [], 'dataScopes'),
    toolLeases: textList(manifest.toolLeases || [], 'toolLeases'),
    economics: normalizeEconomics(manifest.economics),
    health: normalizeHealth(manifest.health),
    fitness: normalizeFitness(manifest.fitness || {}),
    attestationRefs: textList(manifest.attestationRefs, 'attestationRefs', true),
    compensation: normalizeCompensation(manifest.compensation)
  });
}

function toCapabilityNode(value) {
  const manifest = normalizeManifest(value);
  const state = manifest.health.status === 'HEALTHY' ? 'AVAILABLE' : manifest.health.status;
  return normalizeCapabilityNode({
    nodeId: `${manifest.adapterId}@${manifest.version}`,
    kind: NODE_KINDS[manifest.providerKind], capabilities: manifest.capabilities,
    inputs: manifest.dataScopes, outputs: [], requirements: manifest.toolLeases,
    providers: [{ providerId: manifest.adapterId, kind: manifest.providerKind, reference: manifest.reference }],
    evidenceRequirements: manifest.attestationRefs, state,
    availability: { status: state === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE', checkedAt: manifest.health.checkedAt },
    reliability: manifest.health.reliability, cost: manifest.economics.costUsd,
    latency: manifest.economics.latencyMs,
    localContext: { version: manifest.version, compensation: manifest.compensation },
    provenance: manifest.attestationRefs
  });
}

function toSymbiosisContract(value, constitution) {
  const manifest = normalizeManifest(value);
  return validateContract({
    contractId: `adapter:${manifest.adapterId}@${manifest.version}`,
    hostId: constitution.hostId, symbiontId: manifest.adapterId,
    capabilitiesOffered: manifest.capabilities,
    resourcesRequested: { usd: manifest.economics.costUsd, latencyMs: manifest.economics.latencyMs },
    inputs: { dataScopes: manifest.dataScopes }, outputs: {},
    authorityScope: { level: 'CAPABILITY', actions: manifest.toolLeases },
    toolLeases: manifest.toolLeases, dataAccess: manifest.dataScopes,
    privacyBoundary: { scopes: manifest.dataScopes },
    evidenceRequirements: manifest.attestationRefs,
    expectedBenefit: { capabilities: manifest.capabilities },
    maxCost: { usd: manifest.economics.costUsd },
    immunePolicy: { health: manifest.health }, adaptationPolicy: { compensation: manifest.compensation },
    transmissionPolicy: 'REACQUIRE_EACH_GENERATION', terminationConditions: ['lease_revoked', 'health_quarantined'],
    dependencyCeiling: manifest.fitness.dependencyRisk, status: 'ACTIVE'
  }, constitution);
}

module.exports = { SCHEMA, PROVIDER_KINDS, HEALTH_STATES, normalizeManifest,
  toCapabilityNode, toSymbiosisContract };
