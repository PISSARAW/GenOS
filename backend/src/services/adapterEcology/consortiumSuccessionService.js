'use strict';

const { normalizeManifest } = require('./adapterManifest');
const { selectConsortium } = require('./minimalConsortiumService');

function invalid(message, code = 'ADAPTER_SUCCESSION_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function normalizePolicy(value = {}) {
  const now = Date.parse(value.now || new Date().toISOString());
  const maxObservationAgeMs = Number(value.maxObservationAgeMs ?? 300000);
  const latencyTolerance = Number(value.latencyTolerance ?? 2);
  const costTolerance = Number(value.costTolerance ?? 2);
  if (![now, maxObservationAgeMs, latencyTolerance, costTolerance].every(Number.isFinite)
    || maxObservationAgeMs < 0 || latencyTolerance < 1 || costTolerance < 1) {
    invalid('Succession policy bounds are invalid.');
  }
  return { now, maxObservationAgeMs, latencyTolerance, costTolerance };
}

function observationMap(value) {
  if (!Array.isArray(value)) invalid('observations must be an array.');
  return new Map(value.map((item) => [String(item?.adapterId || ''), item]));
}

function observationSymptoms(manifest, observation, policy) {
  const symptoms = [];
  if (!observation) return ['OBSERVATION_MISSING'];
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt) || policy.now - observedAt > policy.maxObservationAgeMs) symptoms.push('OBSERVATION_STALE');
  if (!['AVAILABLE', 'HEALTHY'].includes(observation.status)) symptoms.push(`RUNTIME_${observation.status || 'UNKNOWN'}`);
  if (!Array.isArray(observation.evidenceRefs) || !observation.evidenceRefs.length) symptoms.push('EVIDENCE_MISSING');
  if (Number(observation.latencyMs) > manifest.economics.latencyMs * policy.latencyTolerance) symptoms.push('LATENCY_DRIFT');
  if (Number(observation.costUsd) > manifest.economics.costUsd * policy.costTolerance) symptoms.push('COST_DRIFT');
  return symptoms;
}

function assessConsortium(values, observations, policyInput = {}) {
  if (!Array.isArray(values) || !values.length) invalid('At least one active adapter is required.');
  const policy = normalizePolicy(policyInput);
  const byId = observationMap(observations);
  const assessments = values.map(normalizeManifest).map((manifest) => {
    const symptoms = manifest.health.status === 'HEALTHY' ? [] : [`MANIFEST_${manifest.health.status}`];
    symptoms.push(...observationSymptoms(manifest, byId.get(manifest.adapterId), policy));
    return { adapterId: manifest.adapterId, status: symptoms.length ? 'DYSBIOTIC' : 'STABLE', symptoms };
  });
  return { state: assessments.some((item) => item.status === 'DYSBIOTIC') ? 'DYSBIOSIS' : 'STABLE', assessments };
}

function quarantineManifest(manifest, dysbioticIds, now) {
  if (!dysbioticIds.has(manifest.adapterId)) return manifest;
  return { ...manifest, health: { ...manifest.health, status: 'QUARANTINED', checkedAt: new Date(now).toISOString() } };
}

function compensationEntry(manifest) {
  return {
    adapterId: manifest.adapterId, action: manifest.compensation.action,
    toolLeases: manifest.toolLeases, attestationRefs: manifest.attestationRefs,
    requiredEvidence: manifest.compensation.evidenceRequirements,
    status: 'AWAITING_EVIDENCE'
  };
}

function planSuccession(input = {}) {
  const active = (input.activeManifests || []).map(normalizeManifest);
  const candidates = (input.candidateManifests || []).map(normalizeManifest);
  const health = assessConsortium(active, input.observations || [], input.policy);
  if (health.state === 'STABLE') return { status: 'stable', health, selected: active, compensationPlan: [] };
  const dysbioticIds = new Set(health.assessments.filter((item) => item.status === 'DYSBIOTIC').map((item) => item.adapterId));
  const now = normalizePolicy(input.policy).now;
  const pool = [...active.map((item) => quarantineManifest(item, dysbioticIds, now)), ...candidates];
  const replacement = selectConsortium(pool, input.demand);
  const compensationPlan = active.filter((item) => dysbioticIds.has(item.adapterId)).map(compensationEntry);
  return {
    status: replacement.selected === null ? 'replacement_unavailable' : 'succession_planned',
    health, quarantinedAdapterIds: [...dysbioticIds].sort(), replacement,
    holobiontSuccession: {
      dormantSymbiontIds: [...dysbioticIds].sort(),
      admittedSymbiontIds: replacement.adapterIds?.filter((id) => !active.some((item) => item.adapterId === id)) || []
    },
    compensationPlan, consultative: true
  };
}

function authorizeCompensation(plan, evidenceByAdapter = {}) {
  if (!Array.isArray(plan)) invalid('compensation plan must be an array.');
  const actions = plan.map((entry) => {
    const supplied = new Set(evidenceByAdapter[entry.adapterId] || []);
    const missing = entry.requiredEvidence.filter((requirement) => !supplied.has(requirement));
    return { ...entry, status: missing.length ? 'AWAITING_EVIDENCE' : 'AUTHORIZED', missingEvidence: missing };
  });
  return { authorized: actions.length > 0 && actions.every((item) => item.status === 'AUTHORIZED'), actions };
}

module.exports = { assessConsortium, planSuccession, authorizeCompensation };
