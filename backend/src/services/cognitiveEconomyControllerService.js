'use strict';

const crypto = require('node:crypto');
const topology = require('./topologyCapabilityService');

const LEVELS = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 });
const TOPOLOGIES = Object.freeze(Object.keys(topology.MODE_CAPABILITIES));
const INTEGRATIONS = Object.freeze({ agow: 'holobionte', morphogenesis: 'syncytium',
  rpe: 'syncytium', natural_search: 'rhizome', 'natural-search': 'rhizome' });
const LEVEL_POLICY = Object.freeze({
  L0: { maxRisk: 0.1, graph: ['READ', 'SELECT', 'CALL'], verification: 'local_receipt' },
  L1: { maxRisk: 0.25, graph: ['READ', 'SELECT', 'CALL', 'CHECK'], verification: 'test' },
  L2: { maxRisk: 0.45, graph: ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK'], verification: 'reproducer' },
  L3: { maxRisk: 0.65, graph: ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT'], verification: 'aeis' },
  L4: { maxRisk: 0.85, graph: ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'CHECK', 'EMIT'], verification: 'independent' },
  L5: { maxRisk: 1, graph: ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'CHECK', 'CHECK', 'EMIT'], verification: 'formal' },
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function requestedLevel(value) {
  const key = String(value || '').toUpperCase();
  return Object.hasOwn(LEVELS, key) ? LEVELS[key] : null;
}

function riskOf(input) {
  return Math.max(number(input.risk, 0), number(input.uncertainty, 0),
    input.irreversible ? 0.85 : 0, input.highStakes ? 0.8 : 0);
}

function levelFor(input) {
  const risk = riskOf(input);
  const requested = requestedLevel(input.level);
  const minimum = risk >= 0.85 ? 5 : risk >= 0.65 ? 4 : risk >= 0.45 ? 3 : risk >= 0.25 ? 2 : risk > 0.1 ? 1 : 0;
  return { id: `L${Math.max(minimum, requested ?? 0)}`, value: Math.max(minimum, requested ?? 0), risk };
}

function integrationKey(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, '_'); }

function topologyFor(input) {
  const explicit = integrationKey(input.topology);
  if (TOPOLOGIES.includes(explicit)) return explicit;
  return INTEGRATIONS[integrationKey(input.integration)] || 'trinity';
}

function metricCost(metrics = {}) {
  return Math.max(0, Number(metrics.tokens || 0)) * 0.000001
    + Math.max(0, Number(metrics.latencyMs || 0)) * 0.00001
    + number(metrics.risk, 0) * 0.25;
}

function roi(metrics = {}) {
  const quality = number(metrics.quality ?? metrics.expectedQuality, 0);
  return quality / Math.max(0.000001, metricCost(metrics));
}

function candidates(input) {
  const supplied = Array.isArray(input.candidates) ? input.candidates : [];
  if (supplied.length) return supplied.map((candidate) => ({ ...candidate, roi: roi(candidate) }));
  return [{ id: topologyFor(input), topology: topologyFor(input), tokens: input.tokens,
    latencyMs: input.latencyMs, risk: riskOf(input), quality: input.quality ?? 0.5,
    roi: roi({ ...input, risk: riskOf(input) }) }];
}

function plan(input = {}) {
  const level = levelFor(input);
  const selectedTopology = topologyFor(input);
  const selected = candidates(input).filter((candidate) => TOPOLOGIES.includes(candidate.topology || selectedTopology))
    .sort((left, right) => right.roi - left.roi)[0] || { topology: selectedTopology, roi: 0 };
  const selectedLevel = LEVEL_POLICY[level.id];
  const selectedTopologyName = selected.topology || selectedTopology;
  const verificationPasses = selectedLevel.graph.filter((kind) => kind === 'CHECK').length;
  return { status: 'planned', integration: integrationKey(input.integration || 'runtime'),
    topology: selectedTopologyName, level: level.id, levelValue: level.value,
    graph: selectedLevel.graph, verification: selectedLevel.verification, roi: selected.roi,
    risk: level.risk, requiredCapabilities: topology.contractFor({ mode: selected.topology || selectedTopology }).required,
    execution: executionPolicy(selectedTopologyName, level.value, verificationPasses),
    source: 'omega_cognitive_economy_v1' };
}

function executionPolicy(selectedTopology, level, verificationPasses) {
  const parallelTopologies = new Set(['a_team', 'biocenose', 'biome', 'metapopulation', 'rhizome']);
  return { mode: parallelTopologies.has(selectedTopology) ? 'parallel' : 'fallback',
    allowEmit: level >= 3, verificationPasses, topology: selectedTopology,
    organization: level >= 4 ? 'independent_review' : 'single_pass' };
}

function shapeOperations(operations, economy) {
  const source = Array.isArray(operations) ? operations : [];
  // A cost policy cannot erase an obligation or manufacture independent evidence
  // by repeating the same verifier. Effect authorization remains a runtime gate.
  return source.map((operation) => ({ ...operation, dependsOn: [...(operation.dependsOn || [])] }));
}

function observe(input = {}) {
  const decision = plan(input);
  return { ...decision, observationId: `economy:${crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')}`,
    measured: { tokens: Number(input.tokens || 0), latencyMs: Number(input.latencyMs || 0),
      costUsd: Number(input.costUsd || 0), quality: input.quality ?? null, risk: riskOf(input) },
    measuredRoi: roi(input) };
}

async function record(db, input) {
  if (!db || typeof db.exec !== 'function') return observe(input);
  await db.exec(`CREATE TABLE IF NOT EXISTS cognitive_economy_observations (
    observation_id TEXT PRIMARY KEY, integration TEXT NOT NULL, topology TEXT NOT NULL,
    level TEXT NOT NULL, tokens REAL, latency_ms REAL, cost_usd REAL, quality REAL,
    risk REAL, roi REAL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`);
  const result = observe(input);
  await db.run(`INSERT OR REPLACE INTO cognitive_economy_observations
    (observation_id, integration, topology, level, tokens, latency_ms, cost_usd, quality, risk, roi, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, result.observationId, result.integration, result.topology,
  result.level, result.measured.tokens, result.measured.latencyMs, result.measured.costUsd,
  result.measured.quality, result.measured.risk, result.measuredRoi, JSON.stringify(result), new Date().toISOString());
  return result;
}

function forAgow(input = {}) { return plan({ ...input, integration: 'agow' }); }
function forMorphogenesis(input = {}) { return plan({ ...input, integration: 'morphogenesis' }); }
function forRpe(input = {}) { return plan({ ...input, integration: 'rpe' }); }
function forNaturalSearch(input = {}) { return plan({ ...input, integration: 'natural_search' }); }

module.exports = { LEVELS, TOPOLOGIES, INTEGRATIONS, LEVEL_POLICY, plan, observe, record,
  forAgow, forMorphogenesis, forRpe, forNaturalSearch, riskOf, roi, shapeOperations };
